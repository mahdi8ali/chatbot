/**
 * Projects Database Service
 * يتصل بقاعدة بيانات alkafeel_projects المنفصلة
 * ويوفر أداتين: بحث في المشاريع، وجلب تفاصيل مشروع واحد
 */

import mysql, { Pool, RowDataPacket } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"
import { fuzzyNorm, levenshtein } from "./db"

// ─── توليد روابط الموقع ───────────────────────────────────────────────────
const PROJECTS_BASE = "https://projects.alkafeel.net"

function projectUrl(id: number): string {
  return `${PROJECTS_BASE}/project/${id}`
}

function sectionUrl(sectionId: number | null): string | null {
  return sectionId ? `${PROJECTS_BASE}/project?section_id=${sectionId}` : null
}

function imageUrl(img: string | null): string | null {
  if (!img) return null
  return `${PROJECTS_BASE}/uploads/projects/${img}`
}

// ─── Pool منفصل لقاعدة المشاريع ───────────────────────────────────────────
let projectsPool: Pool | null = null

export function getProjectsPool(): Pool {
  if (projectsPool) return projectsPool
  const cfg = getDatabaseConfig()
  projectsPool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: process.env.PROJECTS_DB_NAME || "alkafeel_projects",
    connectionLimit: cfg.connectionLimit,
    charset: "utf8mb4",
    socketPath: process.env.DB_SOCKET || undefined,
  })
  return projectsPool
}

// ─── أنواع الصفوف ──────────────────────────────────────────────────────────
interface ProjectRow extends RowDataPacket {
  id: number
  name: string
  description: string | null
  address: string | null
  section_id: number | null
  news_url: string | null
  img: string | null
  created_at: string | null
  section_name: string | null
  properties_text: string | null
}

interface PropertyRow extends RowDataPacket {
  prop_name: string
  value: string
}

interface SectionRow extends RowDataPacket {
  id: number
  name: string
  parent_section_id: number | null
}

/**
 * سقف الصفوف المسحوبة للبحث. الفلترة تجري في Node بعد السحب، فأي صفّ خارج هذا
 * السقف يصبح غير قابل للبحث. الجدول بمئات الصفوف (≈358)، والسقف موضوع كصمّام
 * أمان لا كحدّ نتائج — إن اقترب حجم الجدول منه يجب نقل الترشيح إلى SQL/FULLTEXT.
 */
const SEARCH_SCAN_LIMIT = 5000

// ─── Cache ─────────────────────────────────────────────────────────────────
let sectionsCache: SectionRow[] | null = null
let sectionsCacheTime = 0
const CACHE_DURATION = 15 * 60 * 1000 // 15 دقيقة

async function getSections(): Promise<SectionRow[]> {
  const now = Date.now()
  if (sectionsCache && now - sectionsCacheTime < CACHE_DURATION) return sectionsCache
  const db = getProjectsPool()
  const [rows] = await db.execute<SectionRow[]>("SELECT id, name, parent_section_id FROM sections ORDER BY id")
  sectionsCache = rows
  sectionsCacheTime = now
  return rows
}

/**
 * يوسّع قائمة أصناف مطابقة بالاسم لتشمل **كل ذرّيتها** (أبناء، أحفاد...) —
 * بلا هذا التوسيع، فلتر section في searchProjectsDB كان يطابق فقط الأصناف
 * التي يحوي *اسمها هي نفسها* الكلمة المطلوبة، فيفوّت مشاريع مصنَّفة فعلياً
 * ضمن الشجرة نفسها بأصناف فرعية أسماؤها مختلفة كلياً (مثل "مراكز ومؤسسات"،
 * "مؤتمرات" تحت "المشاريع الثقافية" — لا تحوي كلمة "ثقافي" إطلاقاً). فحص حيّ
 * حقيقي: "ثقافي" طابقت صنفين فقط (من 9 في الشجرة الحقيقية) فأنقصت 156 نتيجة
 * محتملة إلى 30 — نفس السبب الجذري المُصلَح للعدّ في getProjectSections()،
 * هنا يُطبَّق على نتائج البحث والتصفّح الفعلية لا العدّ فقط.
 */
function expandWithDescendants(matchedIds: number[], allSections: SectionRow[]): number[] {
  const children = new Map<number, number[]>()
  for (const s of allSections) {
    if (s.parent_section_id == null) continue
    if (!children.has(s.parent_section_id)) children.set(s.parent_section_id, [])
    children.get(s.parent_section_id)!.push(s.id)
  }
  const result = new Set<number>()
  const queue = [...matchedIds]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (result.has(id)) continue
    result.add(id)
    for (const childId of children.get(id) || []) queue.push(childId)
  }
  return Array.from(result)
}

/**
 * قائمة أصناف/أقسام المشاريع الرئيسية — لم تكن مُعرَّضة كأداة إطلاقاً رغم
 * وجود جدول `sections` واستعماله داخلياً فقط لفلترة searchProjectsDB (نفس
 * فجوة get_video_sections/get_publication_categories قبل بنائهما). فحص حيّ
 * حقيقي: `sections` هرمي (`parent_section_id`) — 7 أصناف رئيسية فقط
 * (parent_section_id IS NULL) مرتَّبة بعمود `order`، تطابق حرفياً ما توقّعه
 * المالك: المشاريع الثقافية، التعليمية، الصحن ومقترباته، الطبية، التنموية،
 * خدمات عامة، تشكيلات إدارية. بقية الصفوف (33 إجمالاً) أصناف فرعية أعمق —
 * غير معروضة هنا عمداً (نطاق أضيق يطابق توقّع السؤال، لا تعقيد شجرة كامل).
 *
 * ⚠️ **العدّ يجب أن يشمل الأصناف الفرعية كلّها، لا id الرئيسي وحده** — فحص
 * حيّ كشف أن أغلب الربط الفعلي (`projects.section_id` و`project_section`
 * معاً) يشير إلى أصناف **فرعية** (مثل "المجلات الثقافية"، "الأقسام" تحت
 * "تشكيلات إدارية") لا للصنف الرئيسي مباشرة؛ عدّ id الرئيسي وحده أعاد
 * أصفاراً كاذبة لخمسة من سبعة أصناف (فحصت: 316 من 358 مشروعاً `section_id=0`
 * فعلياً — عمود غير مُعتمَد، والربط الحقيقي عبر `project_section` بأصناف
 * فرعية أساساً، 422 رابطاً موزَّعة عبر الشجرة كلها). الحلّ: بناء إغلاق شجرة
 * كل صنف رئيسي (نفسه + كل ذرّياته مهما عمق التداخل) في JS، ثم عدّ مشاريع
 * فريدة (Set) مرتبطة بأي id ضمن تلك الشجرة — لا مجموع بسيط لكل صنف فرعي
 * وحده (قد يُكرَّر نفس المشروع تحت أكثر من صنف فرعي واحد ضمن نفس الشجرة).
 */
export async function getProjectSections(): Promise<{ success: boolean; data?: any; error?: string }> {
  try {
    const db = getProjectsPool()

    const [sectionRows] = await db.execute<RowDataPacket[]>(
      `SELECT id, name, parent_section_id, \`order\` FROM sections`
    )
    const allSections = sectionRows as any[]

    // ⚠️ بلا فلتر deleted_at هنا عمداً — فحص حيّ قارن عدّي بعدد "المشاريع
    // الثقافية" المعروض فعلياً على الموقع (155): بفلتر deleted_at IS NULL
    // كان العدّ 141 (فرقٌ حقيقي لا تقريبي)، وبإزالته صار 156 — يطابق تقريباً
    // (فرق 1، متوقَّع بفارق توقيت تحديث بسيط لا خطأ منطقي). الخلاصة: العدّاد
    // المعروض على الموقع نفسه **لا يُقصي المشاريع المحذوفة ناعماً** من عدّه —
    // فيُطابَق هنا لأمانة الرقم أمام الزائر، ولو خالف نظافة البيانات منطقياً.
    const [linkRows] = await db.execute<RowDataPacket[]>(`
      SELECT p.section_id AS sid, p.id AS pid
      FROM projects p
      WHERE p.section_id IS NOT NULL AND p.section_id != 0
      UNION
      SELECT ps.section_id AS sid, ps.project_id AS pid
      FROM project_section ps
    `)
    const links = linkRows as any[]

    // أعلى جدّ (الصنف الرئيسي) لأي معرّف صنف — يمشي عبر parent_section_id حتى NULL
    const byId = new Map<number, any>(allSections.map(s => [s.id, s]))
    const topAncestorCache = new Map<number, number | null>()
    function topAncestorOf(sectionId: number): number | null {
      if (topAncestorCache.has(sectionId)) return topAncestorCache.get(sectionId)!
      let cur = byId.get(sectionId)
      let guard = 0 // حارس ضدّ دورة بيانات خاطئة (parent_section_id تدور على نفسها)
      while (cur && cur.parent_section_id != null && guard++ < 50) {
        cur = byId.get(cur.parent_section_id)
      }
      const result = cur ? cur.id : null
      topAncestorCache.set(sectionId, result)
      return result
    }

    const projectIdsByTopSection = new Map<number, Set<number>>()
    for (const { sid, pid } of links) {
      const top = topAncestorOf(sid)
      if (top == null) continue
      if (!projectIdsByTopSection.has(top)) projectIdsByTopSection.set(top, new Set())
      projectIdsByTopSection.get(top)!.add(pid)
    }

    const topSections = allSections
      .filter(s => s.parent_section_id == null)
      .sort((a, b) => (a.order ?? 999) - (b.order ?? 999) || a.id - b.id)

    const sections = topSections.map(s => ({
      id: s.id,
      name: s.name,
      count: projectIdsByTopSection.get(s.id)?.size ?? 0,
    }))

    return { success: true, data: { sections, total: sections.length } }
  } catch (error: any) {
    console.error("[DB Error - getProjectSections]:", error?.message)
    return { success: false, error: "تعذّر جلب أصناف المشاريع" }
  }
}

// ─── دالة مساعدة: مقتطف نص ────────────────────────────────────────────────
function excerpt(text: string | null, maxLen = 400): string {
  if (!text) return ""
  const clean = text.replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  return clean.length > maxLen ? clean.slice(0, maxLen) + "…" : clean
}

// ─── تطبيع النص للبحث ─────────────────────────────────────────────────────
function normalize(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْ]/g, "")   // تشكيل
    .replace(/ـ/g, "")             // كاشيدا/تطويل
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يى]/g, "ي")
    .toLowerCase()
    .trim()
}

// كلمات عامة لا تُعتبر مؤشراً على محتوى المشروع — تُستبعد من الفلترة الدقيقة
const GENERIC_SEARCH_WORDS = new Set([
  "جامعه", "كليه", "معهد", "قسم", "مركز", "مدرسه", "مؤسسه",
  "في", "من", "الي", "علي", "عن", "مع", "بين",
  "اني", "انا", "اريد", "ابغي", "ابي", "بغيت", "اقدر", "ممكن",
  "وين", "اين", "اروح", "ادرس", "ادخل", "اشتغل", "اتقدم",
  "تعليم", "دراسه", "تخصص", "قبول", "تقديم",
  "كيف", "هل", "ما", "ماهي", "ماهو", "مو", "بس",
])

/**
 * يتحقق إذا كانت كلمة واحدة تتطابق مع أي كلمة في الـ haystack (حرفياً أو تقريبياً).
 * المطابقة التقريبية عبر Levenshtein تُستخدم فقط كخيار أخير للكلمات الطويلة.
 */
function fuzzyWordInHaystack(word: string, haystack: string): boolean {
  if (haystack.includes(word)) return true
  if (word.length < 4) return false
  const nw = fuzzyNorm(word)
  const maxDist = nw.length <= 5 ? 1 : 2
  const hayWords = haystack.split(/\s+/).filter(Boolean)
  for (const hw of hayWords) {
    const nhw = fuzzyNorm(hw)
    if (Math.abs(nhw.length - nw.length) > maxDist) continue
    if (levenshtein(nw, nhw, maxDist) <= maxDist) return true
  }
  return false
}

/**
 * يبحث عن أقرب كلمة في الـ haystack لكلمة الاستعلام عبر Levenshtein.
 * يُعيد null إذا لم يجد تطابقاً تقريبياً.
 */
function findFuzzyMatch(word: string, haystack: string): string | null {
  if (word.length < 4) return null
  const nw = fuzzyNorm(word)
  const maxDist = nw.length <= 5 ? 1 : 2
  let best: string | null = null
  let bestDist = maxDist + 1
  for (const hw of haystack.split(/\s+/).filter(Boolean)) {
    const nhw = fuzzyNorm(hw)
    if (Math.abs(nhw.length - nw.length) > maxDist) continue
    const d = levenshtein(nw, nhw, maxDist)
    if (d <= maxDist && d < bestDist) { bestDist = d; best = hw }
  }
  return best
}

// ──────────────────────────────────────────────────────────────────────────
//  search_projects_db
//  يبحث بالاسم والوصف والقسم، يرجع قائمة مختصرة
// ──────────────────────────────────────────────────────────────────────────
export async function searchProjectsDB(params: {
  query: string
  section?: string   // اسم القسم (اختياري) — مثال: "طبية" أو "تعليمية"
  limit?: number
}): Promise<{
  success: boolean
  data?: {
    results: Array<{
      id: number
      name: string
      description_snippet: string
      section: string
      address: string | null
      url: string
      section_url: string | null
      news_url: string | null
    }>
    total_found: number
    query_used: string
  }
  error?: string
}> {
  try {
    const db = getProjectsPool()
    const sections = await getSections()

    const queryNorm = normalize(params.query)
    const queryWords = queryNorm.split(/\s+/).filter(w => w.length > 1)

    // بناء فلتر القسم إذا طُلب — يُوسَّع دائماً لكل ذرّية الصنف المطابق (انظر
    // شرح expandWithDescendants) كي يشمل مشاريع مصنَّفة بأصناف فرعية أسماؤها
    // لا تحوي كلمة الاستعلام إطلاقاً.
    let sectionFilter = ""
    const sectionParams: any[] = []
    if (params.section) {
      const sectionNorm = normalize(params.section)
      const matched = sections.filter(s => normalize(s.name).includes(sectionNorm))
      if (matched.length > 0) {
        const expandedIds = expandWithDescendants(matched.map(s => s.id), sections)
        sectionFilter = `AND (p.section_id IN (${expandedIds.map(() => "?").join(",")}) OR ps.section_id IN (${expandedIds.map(() => "?").join(",")}))`
        sectionParams.push(...expandedIds, ...expandedIds)
      }
    }

    // استعلام مع JOIN للأقسام والخصائص (كليات الجامعة، مواصفات المشروع...)
    //
    // ⚠️ كان هنا `LIMIT 200` قبل الفلترة في Node، فكان كل مشروع ترتيبه بعد الـ200
    // (حسب id — أي الأحدث غالباً) غير قابل للعثور عليه إطلاقاً رغم وجوده في القاعدة.
    // الآن: الحدّ مرفوع إلى ما يتجاوز حجم الجدول (مئات الصفوف لا ملايين)، والفلترة
    // متعدّدة الخطوات (بما فيها Levenshtein) تبقى في Node كما هي بلا تغيير سلوكي.
    const sql = `
      SELECT DISTINCT
        p.id, p.name, p.description, p.address, p.section_id, p.news_url,
        COALESCE(s.name, s2.name) AS section_name,
        (SELECT GROUP_CONCAT(pp.value SEPARATOR ' ') FROM project_property pp WHERE pp.project_id = p.id) AS properties_text
      FROM projects p
      LEFT JOIN sections s ON s.id = p.section_id
      LEFT JOIN project_section ps ON ps.project_id = p.id
      LEFT JOIN sections s2 ON s2.id = ps.section_id
      WHERE p.deleted_at IS NULL
      ${sectionFilter}
      ORDER BY p.id
      LIMIT ${SEARCH_SCAN_LIMIT}
    `

    const [rows] = await db.execute<ProjectRow[]>(sql, sectionParams)
    if (rows.length >= SEARCH_SCAN_LIMIT) {
      console.warn(
        `[projects-db] بلغ المسح الحدّ (${SEARCH_SCAN_LIMIT}) — قد تُستبعد مشاريع من البحث. انقل الترشيح إلى SQL/FULLTEXT.`
      )
    }

    // فلترة في Node.js (تشمل الخصائص مثل كليات الجامعة)
    // الخطوة 1: كل الكلمات يجب أن تتطابق في الـ haystack
    let filtered = rows
    if (queryWords.length > 0) {
      filtered = rows.filter(row => {
        const haystack = normalize([row.name, row.description, row.address, row.section_name, row.properties_text].filter(Boolean).join(" "))
        return queryWords.every(w => haystack.includes(w))
      })
    }

    // الخطوة 2: إذا لم تجد شيء، جرب فقط الكلمات المحددة (بعد استبعاد الكلمات العامة)
    if (filtered.length === 0 && queryWords.length > 0) {
      const specificWords = queryWords.filter(w => !GENERIC_SEARCH_WORDS.has(w) && w.length > 2)
      const wordsToMatch = specificWords.length > 0 ? specificWords : queryWords
      filtered = rows.filter(row => {
        const haystack = normalize([row.name, row.description, row.address, row.section_name, row.properties_text].filter(Boolean).join(" "))
        return wordsToMatch.every(w => haystack.includes(w))
      })
    }

    // الخطوة 3: آخر محاولة — أي كلمة محددة (ليست عامة) تظهر في الـ haystack
    if (filtered.length === 0 && queryWords.length > 0) {
      const specificWords = queryWords.filter(w => !GENERIC_SEARCH_WORDS.has(w) && w.length > 2)
      if (specificWords.length > 0) {
        filtered = rows.filter(row => {
          const haystack = normalize([row.name, row.description, row.properties_text].filter(Boolean).join(" "))
          return specificWords.some(w => haystack.includes(w))
        })
      }
    }

    // الخطوة 4: مطابقة تقريبية (Levenshtein) — للأخطاء الإملائية
    // تُعيد { row, corrections, dist } لكل صفّ مطابَق تقريبياً
    type FuzzyRow = { row: ProjectRow; corrections: Record<string, string>; dist: number }
    let fuzzyResults: FuzzyRow[] = []
    if (filtered.length === 0 && queryWords.length > 0) {
      const specificWords = queryWords.filter(w => !GENERIC_SEARCH_WORDS.has(w) && w.length >= 4)
      if (specificWords.length > 0) {
        for (const row of rows) {
          const haystack = normalize([row.name, row.description, row.address, row.section_name, row.properties_text].filter(Boolean).join(" "))
          const corrections: Record<string, string> = {}
          let totalDist = 0
          let allMatch = true
          for (const w of specificWords) {
            if (haystack.includes(w)) continue
            const nw = fuzzyNorm(w)
            const maxDist = nw.length <= 5 ? 1 : 2
            let bestMatch: string | null = null
            let bestDist = maxDist + 1
            for (const hw of haystack.split(/\s+/).filter(Boolean)) {
              const nhw = fuzzyNorm(hw)
              if (Math.abs(nhw.length - nw.length) > maxDist) continue
              const d = levenshtein(nw, nhw, maxDist)
              if (d <= maxDist && d < bestDist) { bestDist = d; bestMatch = hw }
            }
            if (bestMatch) { corrections[w] = bestMatch; totalDist += bestDist }
            else { allMatch = false; break }
          }
          if (allMatch && Object.keys(corrections).length > 0) {
            fuzzyResults.push({ row, corrections, dist: totalDist })
          }
        }
        // ترتيب حسب جودة المطابقة: الأقل مسافة أولاً
        fuzzyResults.sort((a, b) => a.dist - b.dist)
      }
    }

    const limit = params.limit || 8
    const useFuzzy = filtered.length === 0 && fuzzyResults.length > 0

    // استخراج العنوان من الخصائص عندما address فارغ
    function extractAddress(row: ProjectRow): string | null {
      if (row.address) return row.address
      const props = row.properties_text || ""
      // البحث عن نمط "محافظة" أو عنوان جغرافي في الخصائص
      const match = props.match(/(محافظة[^\s]*(?:\s+[^\n|]+)?)/)
      if (match) return match[1].trim()
      return null
    }

    const results = (useFuzzy
      ? fuzzyResults.slice(0, limit).map(fr => ({
          id: fr.row.id,
          name: fr.row.name,
          description_snippet: excerpt(fr.row.description, 300),
          section: fr.row.section_name || "عام",
          address: extractAddress(fr.row),
          url: projectUrl(fr.row.id),
          section_url: sectionUrl(fr.row.section_id),
          news_url: fr.row.news_url || null,
          correction: fr.corrections,
        }))
      : filtered.slice(0, limit).map(row => ({
          id: row.id,
          name: row.name,
          description_snippet: excerpt(row.description, 300),
          section: row.section_name || "عام",
          address: extractAddress(row),
          url: projectUrl(row.id),
          section_url: sectionUrl(row.section_id),
          news_url: row.news_url || null,
        }))
    )

    return {
      success: true,
      data: {
        results,
        total_found: useFuzzy ? fuzzyResults.length : filtered.length,
        query_used: params.query,
        ...(useFuzzy && { fuzzy: true }),  // ← علامة أن النتائج تقريبية
      }
    }
  } catch (err: any) {
    console.error("[projects-db] searchProjectsDB error:", err)
    return { success: false, error: err.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  get_project_details
//  يجلب مشروعاً واحداً بالكامل مع خصائصه وأقسامه
// ──────────────────────────────────────────────────────────────────────────
export async function getProjectDetails(projectId: number): Promise<{
  success: boolean
  data?: {
    id: number
    name: string
    description: string
    address: string | null
    url: string
    news_url: string | null
    sections: string[]
    properties: Array<{ name: string; value: string }>
  }
  error?: string
}> {
  try {
    const db = getProjectsPool()

    // جلب المشروع الأساسي
    const [projectRows] = await db.execute<ProjectRow[]>(
      `SELECT p.id, p.name, p.description, p.address, p.news_url, p.section_id, s.name AS section_name
       FROM projects p
       LEFT JOIN sections s ON s.id = p.section_id
       WHERE p.id = ? AND p.deleted_at IS NULL
       LIMIT 1`,
      [projectId]
    )

    if (!projectRows.length) {
      return { success: false, error: "المشروع غير موجود" }
    }
    const proj = projectRows[0]

    // جلب الأقسام الإضافية
    const [sectionRows] = await db.execute<RowDataPacket[]>(
      `SELECT s.name FROM project_section ps
       JOIN sections s ON s.id = ps.section_id
       WHERE ps.project_id = ?`,
      [projectId]
    )

    // جلب الخصائص
    const [propRows] = await db.execute<PropertyRow[]>(
      `SELECT pr.name AS prop_name, pp.value
       FROM project_property pp
       JOIN properties pr ON pr.id = pp.property_id
       WHERE pp.project_id = ? AND pp.value IS NOT NULL AND pp.value != ''
       GROUP BY pr.name, pp.value`,
      [projectId]
    )

    const allSections = [proj.section_name, ...sectionRows.map((r: any) => r.name)].filter(Boolean) as string[]
    const uniqueSections = [...new Set(allSections)]

    // دمج القيم المتكررة لنفس الخاصية
    const propMap = new Map<string, string[]>()
    for (const row of propRows as PropertyRow[]) {
      const existing = propMap.get(row.prop_name) || []
      const val = (row.value || "").replace(/\s+/g, " ").trim()
      if (val && !existing.includes(val)) existing.push(val)
      propMap.set(row.prop_name, existing)
    }
    const properties = [...propMap.entries()].map(([name, vals]) => ({
      name,
      value: vals.join(" / "),
    }))

    return {
      success: true,
      data: {
        id: proj.id,
        name: proj.name,
        description: excerpt(proj.description, 1200),
        address: proj.address || null,
        url: projectUrl(proj.id),
        news_url: proj.news_url || null,
        sections: uniqueSections,
        properties,
      }
    }
  } catch (err: any) {
    console.error("[projects-db] getProjectDetails error:", err)
    return { success: false, error: err.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// ── رابط الصور المرفقة ─────────────────────────────────────────────────────
const ATTACHMENTS_BASE = "https://projects.alkafeel.net/uploads/projects/attachments/thumb"

function attachmentUrl(img: string): string {
  return `${ATTACHMENTS_BASE}/${img}`
}

//  get_project_image
//  يُجلب الصورة الرئيسية للمشروع مع عدد الصور المرفقة
// ──────────────────────────────────────────────────────────────────────────
export async function getProjectImage(projectId: number): Promise<{
  success: boolean
  data?: {
    id: number
    name: string
    image_url: string
    project_url: string
    news_url: string | null
    attached_images_count: number
  }
  error?: string
}> {
  try {
    const db = getProjectsPool()
    const [[rows], [countRows]] = await Promise.all([
      db.execute<RowDataPacket[]>(
        `SELECT id, name, img, news_url FROM projects WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
        [projectId]
      ),
      db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM project_images WHERE project_id = ?`,
        [projectId]
      ),
    ])
    if (!rows.length) return { success: false, error: "المشروع غير موجود" }
    const row = rows[0] as any
    const url = imageUrl(row.img)
    if (!url) return { success: false, error: "لا توجد صورة لهذا المشروع" }
    const count = (countRows[0] as any)?.cnt ?? 0
    return {
      success: true,
      data: {
        id: row.id,
        name: row.name,
        image_url: url,
        project_url: projectUrl(row.id),
        news_url: row.news_url || null,
        attached_images_count: Number(count),
      },
    }
  } catch (err: any) {
    console.error("[projects-db] getProjectImage error:", err)
    return { success: false, error: err.message }
  }
}

// ──────────────────────────────────────────────────────────────────────────
//  get_project_images
//  يُجلب جميع الصور المرفقة (project_images) لمشروع معين
// ──────────────────────────────────────────────────────────────────────────
interface ProjectImageRow extends RowDataPacket {
  image: string
}

const GALLERY_LIMIT = 9

export async function getProjectImages(projectId: number): Promise<{
  success: boolean
  data?: { project_id: number; images: string[]; count: number; total_count: number; project_url: string }
  error?: string
}> {
  try {
    const db = getProjectsPool()
    const [[rows], [countRows]] = await Promise.all([
      db.execute<ProjectImageRow[]>(
        `SELECT image FROM project_images WHERE project_id = ? ORDER BY id ASC LIMIT ${GALLERY_LIMIT}`,
        [projectId]
      ),
      db.execute<RowDataPacket[]>(
        `SELECT COUNT(*) AS cnt FROM project_images WHERE project_id = ?`,
        [projectId]
      ),
    ])
    if (!rows.length) return { success: false, error: "لا توجد صور مرفقة لهذا المشروع." }
    const images = rows.map((r) => attachmentUrl(r.image))
    const total = Number((countRows[0] as any)?.cnt ?? images.length)
    return {
      success: true,
      data: {
        project_id: projectId,
        images,
        count: images.length,
        total_count: total,
        project_url: projectUrl(projectId),
      },
    }
  } catch (err: any) {
    console.error("[projects-db] getProjectImages error:", err)
    return { success: false, error: err.message }
  }
}

/**
 * عدد المشاريع غير المحذوفة — يستعمل البِركة المشتركة بدل فتح اتصال جديد.
 * (يُستدعى من news-service.siteGetStatistics الذي كان يفتح اتصالاً ويُسرّبه عند الخطأ.)
 */
export async function countProjects(): Promise<number> {
  const [rows] = await getProjectsPool().execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS cnt FROM projects WHERE deleted_at IS NULL`
  )
  return Number((rows as any[])[0]?.cnt ?? 0)
}
