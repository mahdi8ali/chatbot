/**
 * Knowledge Base Service — طبقة خدمة قاعدة المعرفة الخاصة
 *
 * مخزن معرفي خاص وقابل للبحث (`kb_articles`) في قاعدة السجلّات المعزولة
 * `local_chatbot_logs` عبر مجمّع اتصال خاص (نمط curated-service.ts / chat-logger.ts).
 * يوفّر بحثاً نصّياً كاملاً (FULLTEXT + ngram) مع درجة صلة وكاش داخلي بـ TTL،
 * إضافةً إلى عمليات CRUD إدارية.
 *
 * ⚠️ إضافي وقابل للعكس: جدول واحد عبر CREATE TABLE IF NOT EXISTS، بلا ALTER/DROP،
 * وبلا مساس ببيانات المحتوى (ka_db / alkafeel_projects). كل استعلامات SQL مُعامَلة (?).
 */

import mysql from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"
import { normalizeArabic } from "./faq"
import { fuzzyNorm, levenshtein } from "./db"

// ===== الأنواع المُصدَّرة =====

/** نتيجة بحث تُحقَن في السياق أو يُصاغ منها. */
export interface KbHit {
  id: number
  title: string
  body: string
  keywords: string[]
  priority: number
  score: number
}

/** صفّ القائمة الكامل للوحة الإدارة (يشمل غير المفعّل + updated_at + note). */
export interface KbRow {
  id: number
  title: string
  body: string
  keywords: string[]
  active: boolean
  priority: number
  note?: string | null
  updated_at: string
}

/** حمولة الإنشاء/التعديل القادمة من الـ API (بعد التحقّق). */
export interface KbInput {
  title: string
  body: string
  keywords?: string[]
  priority?: number
  active?: boolean
  note?: string | null
}

/** خيارات البحث. */
export interface KbSearchOpts {
  limit?: number
  minScore?: number
}

// ===== المجمّع المعزول (نمط curated-service.ts) =====
let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (pool) return pool
  const cfg = getDatabaseConfig()
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    // نفس قاعدة السجلّات المعزولة المستخدمة في curated-service.ts / chat-logger.ts
    database:
      process.env.LOGS_DB_NAME ||
      process.env.PROJECTS_DB_NAME ||
      cfg.database ||
      "local_chatbot_logs",
    connectionLimit: 3,
    charset: "utf8mb4",
    socketPath: process.env.DB_SOCKET || undefined,
  })
  return pool
}

// ===== إنشاء الجدول (idempotent) =====
let tableReady = false

async function ensureTable(): Promise<void> {
  if (tableReady) return
  const db = getPool()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS kb_articles (
      id           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      title        VARCHAR(512) NOT NULL,
      body         MEDIUMTEXT   NOT NULL,
      keywords     TEXT         NULL,
      search_text  MEDIUMTEXT   NOT NULL,
      active       TINYINT(1)   NOT NULL DEFAULT 1,
      priority     INT          NOT NULL DEFAULT 0,
      note         TEXT         NULL,
      created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
      updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active_priority (active, priority)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  tableReady = true
}

// ===== الكاش الداخلي مع TTL =====
let cache: KbRow[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 دقائق — مطابق لـ curated-service

// ===== الثوابت =====
const MIN_LENGTH = 5 // تجاهل الرسائل القصيرة جداً (مطابق لـ faq/curated)
const DEFAULT_LIMIT = 3
const MIN_TOKEN_LEN = 2 // أقصر طول رمز يُعتدّ به في التسجيل
// درجة الصلة بمقياس 0..10 = (عدد رموز الاستعلام المُطابَقة ÷ إجمالي الرموز) × 10.
/** عتبة الثقة الافتراضية (≈40% من رموز الاستعلام مُطابَقة). تُصدَّر لاستخدام route.ts. */
export const CONFIDENCE_THRESHOLD = 4.0
/** عتبة قصر المسار عالي الثقة (≈90%؛ خيار معطّل افتراضياً). تُصدَّر لاستخدام route.ts. */
export const SHORT_CIRCUIT_THRESHOLD = 9.0

// ===== كاش البحث الداخلي (صفوف مفعّلة مع search_text) =====
// بحث محمول في الذاكرة (يعمل على MariaDB وMySQL) — لا يعتمد على FULLTEXT/ngram.
interface SearchRow {
  id: number
  title: string
  body: string
  keywords: string[]
  priority: number
  search_text: string
}
let searchCache: SearchRow[] | null = null
let searchCacheAt = 0

// ===== مساعدات =====

/** يقيّد قيمة عددية بين حدّين. */
function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

/**
 * يشتقّ نصّ البحث المطبّع من العنوان والمتن والكلمات المفتاحية.
 * يُستخدم في الخدمة فقط لضمان الاتساق (لا يأتي من الـ API).
 */
function deriveSearchText(title: string, body: string, keywords: string[]): string {
  return normalizeArabic(`${title} ${body} ${keywords.join(" ")}`)
}

/**
 * يحلّل حقل keywords المخزَّن (JSON string[]) بأمان.
 * يُعيد null عند تعذّر التحليل أو إن لم يكن مصفوفة (لإسقاط الصفّ المعطوب).
 */
function parseKeywordsField(raw: unknown): string[] | null {
  if (raw == null) return []
  try {
    const parsed = JSON.parse(String(raw))
    if (!Array.isArray(parsed)) return null
    return parsed.map((k) => String(k))
  } catch {
    return null
  }
}

/** يحوّل صفّ قاعدة البيانات إلى KbRow، أو null عند تعذّر تحليل keywords. */
function mapRow(row: any): KbRow | null {
  const keywords = parseKeywordsField(row.keywords)
  if (keywords === null) return null
  return {
    id: Number(row.id),
    title: row.title,
    body: row.body,
    keywords,
    active: row.active == 1,
    priority: Number(row.priority),
    note: row.note ?? null,
    updated_at: row.updated_at,
  }
}

// ===== كاش البحث + البحث الأساسي (في الذاكرة، محمول) =====

/**
 * يحمّل الصفوف المفعّلة (مع search_text) إلى كاش الذاكرة بمدّة صلاحية TTL.
 * قاعدة المعرفة الخاصّة صغيرة (عشرات/مئات الصفوف)، فالتحميل والتسجيل في الذاكرة
 * أجزاء المليّ ثانية، ومحمول تماماً بين MariaDB وMySQL (لا FULLTEXT/ngram).
 */
async function loadSearchRows(): Promise<SearchRow[]> {
  const now = Date.now()
  if (searchCache && now - searchCacheAt < CACHE_TTL_MS) return searchCache

  await ensureTable()
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, title, body, keywords, priority, search_text
     FROM kb_articles WHERE active = 1`
  )) as any

  const mapped: SearchRow[] = []
  for (const r of rows as any[]) {
    const keywords = parseKeywordsField(r.keywords)
    if (keywords === null) continue // إسقاط الصفّ المعطوب
    mapped.push({
      id: Number(r.id),
      title: r.title,
      body: r.body,
      keywords,
      priority: Number(r.priority),
      search_text: String(r.search_text ?? ""),
    })
  }
  searchCache = mapped
  searchCacheAt = now
  return mapped
}

/**
 * البحث الأساسي — تسجيل نقاط في الذاكرة على النصّ المطبّع (بلا اعتماد على FULLTEXT).
 * درجة الصلة بمقياس 0..10 = (عدد رموز الاستعلام المُطابَقة ÷ إجماليها) × 10.
 * يُرجع KbHit[] مرتّبة تنازلياً حسب (score, priority)، كلها ≥ العتبة، محدودة بـ limit.
 * الرسائل الأقصر من MIN_LENGTH (بعد التطبيع) تُرفض مبكراً.
 */
export async function kbSearch(
  query: string,
  opts?: KbSearchOpts
): Promise<KbHit[]> {
  const q = normalizeArabic(query)
  if (!q || q.length < MIN_LENGTH) return [] // تجاهل القصير جداً

  const threshold = opts?.minScore ?? CONFIDENCE_THRESHOLD
  const limit = clamp(opts?.limit ?? DEFAULT_LIMIT, 1, 10)

  // رموز الاستعلام الفريدة ذات الطول المعتدّ به
  const tokens = Array.from(
    new Set(q.split(/\s+/).filter((t) => t.length >= MIN_TOKEN_LEN))
  )
  if (tokens.length === 0) return []

  const rows = await loadSearchRows()

  const hits: KbHit[] = []
  for (const r of rows) {
    let matched = 0
    for (const t of tokens) {
      if (r.search_text.includes(t)) {
        matched++
      } else if (t.length >= 4) {
        // مطابقة تقريبية: Levenshtein على كلمات search_text
        const nw = fuzzyNorm(t)
        const maxDist = nw.length <= 5 ? 1 : 2
        const textWords = r.search_text.split(/\s+/).filter(Boolean)
        for (const tw of textWords) {
          const ntw = fuzzyNorm(tw)
          if (Math.abs(ntw.length - nw.length) > maxDist) continue
          if (levenshtein(nw, ntw, maxDist) <= maxDist) { matched++; break }
        }
      }
    }
    if (matched === 0) continue
    const score = (matched / tokens.length) * 10 // 0..10
    if (score >= threshold) {
      hits.push({
        id: r.id,
        title: r.title,
        body: r.body,
        keywords: r.keywords,
        priority: r.priority,
        score,
      })
    }
  }

  hits.sort((a, b) => b.score - a.score || b.priority - a.priority)
  return hits.slice(0, limit)
}

// ===== إبطال الكاش =====

/** يُبطل الكاش الداخلي ليُعاد تحميله عند الطلب التالي. يُستدعى بعد كل كتابة. */
export function refresh(): void {
  cache = null
  cacheLoadedAt = 0
  searchCache = null
  searchCacheAt = 0
}

// ============================================================================
// طبقة الإدارة (Admin CRUD) — إضافية وقابلة للعكس
// كل الاستعلامات مُعامَلة (?)؛ search_text يُشتقّ في الخدمة؛ كل كتابة تستدعي refresh().
// ============================================================================

/**
 * يعيد كل المقالات (المفعّلة وغير المفعّلة) لعرض لوحة الإدارة.
 * الترتيب: priority تنازلياً ثم updated_at تنازلياً. يُسقط الصفوف المعطوبة.
 */
export async function listAll(): Promise<KbRow[]> {
  await ensureTable()
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, title, body, keywords, active, priority, note,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
     FROM kb_articles
     ORDER BY priority DESC, updated_at DESC`
  )) as any
  return (rows as any[]).map(mapRow).filter(Boolean) as KbRow[]
}

/** يعيد الصفّ الكامل بالمُعرّف أو null. */
export async function getById(id: number): Promise<KbRow | null> {
  await ensureTable()
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, title, body, keywords, active, priority, note,
            DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
     FROM kb_articles WHERE id = ?`,
    [id]
  )) as any
  if (!rows.length) return null
  return mapRow(rows[0])
}

/**
 * ينشئ مقالة جديدة (يشتقّ search_text) ويعيد صفّها الكامل. يستدعي refresh().
 */
export async function create(input: KbInput): Promise<KbRow> {
  await ensureTable()
  const keywords = input.keywords ?? []
  const searchText = deriveSearchText(input.title, input.body, keywords)
  const db = getPool()
  const [res] = (await db.execute(
    `INSERT INTO kb_articles (title, body, keywords, search_text, priority, active, note)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title,
      input.body,
      JSON.stringify(keywords), // string[] → JSON TEXT (متّسق بين الكتابة والقراءة)
      searchText,
      input.priority ?? 0,
      input.active === false ? 0 : 1,
      input.note ?? null,
    ]
  )) as any
  refresh()
  return (await getById(Number(res.insertId)))!
}

/**
 * يحدّث مقالة قائمة (تحديث جزئي ديناميكي مُعامَل). عند تغيّر title/body/keywords
 * يُعاد اشتقاق search_text من القيم النهائية المدموجة. يعيد الصفّ المحدّث أو null.
 */
export async function update(
  id: number,
  input: Partial<KbInput>
): Promise<KbRow | null> {
  const current = await getById(id)
  if (!current) return null

  const sets: string[] = []
  const vals: any[] = []
  if (input.title !== undefined) { sets.push("title = ?"); vals.push(input.title) }
  if (input.body !== undefined) { sets.push("body = ?"); vals.push(input.body) }
  if (input.keywords !== undefined) { sets.push("keywords = ?"); vals.push(JSON.stringify(input.keywords)) }
  if (input.priority !== undefined) { sets.push("priority = ?"); vals.push(input.priority) }
  if (input.active !== undefined) { sets.push("active = ?"); vals.push(input.active ? 1 : 0) }
  if (input.note !== undefined) { sets.push("note = ?"); vals.push(input.note ?? null) }

  // إعادة اشتقاق search_text عند تغيّر أي من الحقول المؤثّرة فيه
  if (
    input.title !== undefined ||
    input.body !== undefined ||
    input.keywords !== undefined
  ) {
    const finalTitle = input.title ?? current.title
    const finalBody = input.body ?? current.body
    const finalKeywords = input.keywords ?? current.keywords
    sets.push("search_text = ?")
    vals.push(deriveSearchText(finalTitle, finalBody, finalKeywords))
  }

  if (sets.length === 0) return current // لا تغيير

  const db = getPool()
  vals.push(id)
  await db.execute(
    `UPDATE kb_articles SET ${sets.join(", ")} WHERE id = ?`,
    vals // كل القيم عبر ? — لا سلاسل مُدمَجة
  )
  refresh()
  return getById(id)
}

/**
 * يضبط حالة التفعيل لمقالة (اختصار زرّ التبديل). يعيد الصفّ المحدّث أو null.
 */
export async function setActive(
  id: number,
  active: boolean
): Promise<KbRow | null> {
  const existing = await getById(id)
  if (!existing) return null
  const db = getPool()
  await db.execute(
    `UPDATE kb_articles SET active = ? WHERE id = ?`,
    [active ? 1 : 0, id]
  )
  refresh()
  return getById(id)
}

/**
 * يحذف مقالة بالمُعرّف. يعيد true إن حُذف صفّ فعلاً. يستدعي refresh().
 */
export async function remove(id: number): Promise<boolean> {
  await ensureTable()
  const db = getPool()
  const [res] = (await db.execute(
    `DELETE FROM kb_articles WHERE id = ?`,
    [id]
  )) as any
  refresh()
  return res.affectedRows > 0
}
