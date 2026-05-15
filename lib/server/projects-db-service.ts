/**
 * Projects Database Service
 * يتصل بقاعدة بيانات alkafeel_projects المنفصلة
 * ويوفر أداتين: بحث في المشاريع، وجلب تفاصيل مشروع واحد
 */

import mysql, { Pool, RowDataPacket } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"

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

function getProjectsPool(): Pool {
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
}

interface PropertyRow extends RowDataPacket {
  prop_name: string
  value: string
}

interface SectionRow extends RowDataPacket {
  id: number
  name: string
}

// ─── Cache ─────────────────────────────────────────────────────────────────
let sectionsCache: SectionRow[] | null = null
let sectionsCacheTime = 0
const CACHE_DURATION = 15 * 60 * 1000 // 15 دقيقة

async function getSections(): Promise<SectionRow[]> {
  const now = Date.now()
  if (sectionsCache && now - sectionsCacheTime < CACHE_DURATION) return sectionsCache
  const db = getProjectsPool()
  const [rows] = await db.execute<SectionRow[]>("SELECT id, name FROM sections ORDER BY id")
  sectionsCache = rows
  sectionsCacheTime = now
  return rows
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
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يى]/g, "ي")
    .toLowerCase()
    .trim()
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

    // بناء فلتر القسم إذا طُلب
    let sectionFilter = ""
    const sectionParams: any[] = []
    if (params.section) {
      const sectionNorm = normalize(params.section)
      const matched = sections.filter(s => normalize(s.name).includes(sectionNorm))
      if (matched.length > 0) {
        sectionFilter = `AND (p.section_id IN (${matched.map(() => "?").join(",")}) OR ps.section_id IN (${matched.map(() => "?").join(",")}))`
        sectionParams.push(...matched.map(s => s.id), ...matched.map(s => s.id))
      }
    }

    // استعلام مع JOIN للأقسام
    const sql = `
      SELECT DISTINCT
        p.id, p.name, p.description, p.address, p.section_id, p.news_url,
        COALESCE(s.name, s2.name) AS section_name
      FROM projects p
      LEFT JOIN sections s ON s.id = p.section_id
      LEFT JOIN project_section ps ON ps.project_id = p.id
      LEFT JOIN sections s2 ON s2.id = ps.section_id
      WHERE p.deleted_at IS NULL
      ${sectionFilter}
      ORDER BY p.id
      LIMIT 200
    `

    const [rows] = await db.execute<ProjectRow[]>(sql, sectionParams)

    // فلترة في Node.js
    let filtered = rows
    if (queryWords.length > 0) {
      filtered = rows.filter(row => {
        const haystack = normalize([row.name, row.description, row.address, row.section_name].filter(Boolean).join(" "))
        return queryWords.every(w => haystack.includes(w)) ||
               queryWords.some(w => normalize(row.name || "").includes(w))
      })
    }

    // إذا لم تجد شيء بـ "كل الكلمات" جرب أي كلمة
    if (filtered.length === 0 && queryWords.length > 1) {
      filtered = rows.filter(row => {
        const haystack = normalize([row.name, row.description].filter(Boolean).join(" "))
        return queryWords.some(w => haystack.includes(w))
      })
    }

    const limit = params.limit || 8
    const results = filtered.slice(0, limit).map(row => ({
      id: row.id,
      name: row.name,
      description_snippet: excerpt(row.description, 300),
      section: row.section_name || "عام",
      address: row.address || null,
      url: projectUrl(row.id),
      section_url: sectionUrl(row.section_id),
      news_url: row.news_url || null,
    }))

    return {
      success: true,
      data: {
        results,
        total_found: filtered.length,
        query_used: params.query,
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
