/**
 * Service Layer للتواصل المباشر مع قاعدة البيانات (MySQL)
 *
 * جميع استدعاءات الأدوات تمر عبر هذه الطبقة.
 * مصدر البيانات: جدول news في قاعدة البيانات المحلية.
 */

import mysql, { Pool } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"
import type { AllowedToolName } from "./site-tools-definitions"
import { sanitizeAPIResponse } from "./data-sanitizer"

export interface APICallResult {
  success: boolean
  data?: any
  error?: string
  statusCode?: number
}

interface NewsRow {
  id: number
  title: string
  title_2: string | null
  image: string | null
  content: string | null
  views: number
  photo_comment: string | null
  active: number
  category_id: number | null
  created_at: string | null
  updated_at: string | null
}

let pool: Pool | null = null

function getPool(): Pool {
  if (pool) return pool

  const config = getDatabaseConfig()
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    charset: "utf8mb4"
  })

  return pool
}

function getNewsUrl(id: number): string {
  return `https://alkafeel.net/news/index.php?id=${id}`
}

function stripHtml(input: string): string {
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

function excerpt(text: string | null | undefined, max: number = 280): string {
  if (!text) return ""
  const clean = stripHtml(text)
  if (clean.length <= max) return clean
  return clean.slice(0, max) + "..."
}

function mapNewsToItem(row: NewsRow) {
  const categoryName = row.category_id ? `تصنيف ${row.category_id}` : "أخبار شبكة الكفيل"

  return {
    id: row.id,
    name: row.title,
    description: excerpt(row.content, 320),
    sections: [{ name: categoryName }],
    properties: [
      row.title_2
        ? { name: "العنوان الفرعي", value: row.title_2 }
        : null,
      row.photo_comment
        ? { name: "تعليق الصورة", value: row.photo_comment }
        : null,
      row.created_at
        ? { name: "تاريخ النشر", value: row.created_at }
        : null,
      { name: "عدد المشاهدات", value: String(row.views || 0) },
      row.image
        ? { name: "الصورة", value: `https://www.alkafeel.net/alkafeelnews/up3/${row.image}` }
        : null
    ].filter(Boolean),
    url: getNewsUrl(row.id),
    raw_content: row.content || ""
  }
}

let newsCache: any[] | null = null
let newsCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000 // 10 دقائق

async function getAllNews(): Promise<APICallResult> {
  const now = Date.now()
  if (newsCache && now - newsCacheTime < CACHE_DURATION) {
    return { success: true, data: newsCache }
  }

  try {
    const db = getPool()
    const [rows] = await db.query<NewsRow[]>(
      `SELECT id, title, title_2, image, content, views, photo_comment, active, category_id, created_at, updated_at
       FROM news
       WHERE active = 1 AND deleted_at IS NULL`
    )

    const mapped = rows.map(mapNewsToItem)
    const sanitized = sanitizeAPIResponse(mapped)

    newsCache = sanitized
    newsCacheTime = now

    return { success: true, data: sanitized }
  } catch (error: any) {
    console.error("[DB Error - getAllNews]:", error?.message || error)
    return {
      success: false,
      error: "تعذر الوصول إلى قاعدة البيانات. تأكد من إعدادات DB في .env.local"
    }
  }
}

export async function siteSearch(
  query?: string,
  section?: string,
  limit: number = 5
): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  const data = (allNews.data as any[]) || []
  const safeQuery = (query || "").trim().toLowerCase()
  const words = safeQuery.split(/\s+/).filter(Boolean)

  const scored = data
    .map(item => {
      const text = [
        item.name,
        item.description,
        item.raw_content,
        ...(item.properties || []).map((p: any) => `${p.name} ${p.value}`),
        ...(item.sections || []).map((s: any) => s.name)
      ]
        .join(" ")
        .toLowerCase()

      let score = 0
      if (safeQuery && text.includes(safeQuery)) score += 12
      for (const w of words) {
        if (text.includes(w)) score += 3
      }

      if (section) {
        const inSection = (item.sections || []).some((s: any) =>
          String(s.name || "").toLowerCase().includes(section.toLowerCase())
        )
        if (!inSection) score = 0
      }

      return { item, score }
    })
    .filter(x => (words.length ? x.score > 0 : true))
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.min(Math.max(limit || 5, 1), 20))
    .map(x => x.item)

  return {
    success: true,
    data: {
      results: scored,
      total: scored.length,
      query: safeQuery || section || ""
    }
  }
}

export async function siteGetProject(id: string): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  const data = (allNews.data as any[]) || []
  const item = data.find(n => String(n.id) === String(id))

  if (!item) {
    return {
      success: false,
      error: `لم يتم العثور على الخبر ${id}`
    }
  }

  return {
    success: true,
    data: item
  }
}

export async function siteListCategories(
  include_counts: boolean = false
): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  const data = (allNews.data as any[]) || []
  const counts = new Map<string, number>()

  for (const item of data) {
    for (const s of item.sections || []) {
      const name = s.name || "غير مصنف"
      counts.set(name, (counts.get(name) || 0) + 1)
    }
  }

  const categories = Array.from(counts.entries()).map(([name, count], idx) => ({
    id: idx + 1,
    name,
    ...(include_counts && { count })
  }))

  return {
    success: true,
    data: {
      categories,
      total_categories: categories.length
    }
  }
}

export async function siteGetLatest(
  limit: number = 5,
  section?: string
): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  let data = [...((allNews.data as any[]) || [])]

  if (section) {
    data = data.filter(item =>
      (item.sections || []).some((s: any) =>
        String(s.name || "").toLowerCase().includes(section.toLowerCase())
      )
    )
  }

  data.sort((a, b) => {
    const tA = new Date(a.properties?.find((p: any) => p.name === "تاريخ النشر")?.value || 0).getTime()
    const tB = new Date(b.properties?.find((p: any) => p.name === "تاريخ النشر")?.value || 0).getTime()
    return tB - tA
  })

  const projects = data.slice(0, Math.min(Math.max(limit || 5, 1), 20))

  return {
    success: true,
    data: {
      projects,
      total: projects.length,
      limit
    }
  }
}

export async function siteGetStatistics(): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  const data = (allNews.data as any[]) || []
  const total = data.length

  const sectionCounts = new Map<string, number>()
  for (const item of data) {
    for (const s of item.sections || []) {
      const name = s.name || "غير مصنف"
      sectionCounts.set(name, (sectionCounts.get(name) || 0) + 1)
    }
  }

  const top_sections = Array.from(sectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([section, count]) => ({ section, count }))

  return {
    success: true,
    data: {
      total_projects: total,
      top_sections,
      sections_count: sectionCounts.size
    }
  }
}

export async function executeToolByName(
  toolName: AllowedToolName,
  args: Record<string, any>
): Promise<APICallResult> {
  console.log(`[Tool Execution] ${toolName}`, args)

  try {
    switch (toolName) {
      case "search_projects":
        return await siteSearch(args.query, args.section, args.limit)

      case "get_project_by_id":
        return await siteGetProject(args.id)

      case "filter_projects":
        return await siteListCategories(args.include_counts)

      case "get_latest_projects":
        return await siteGetLatest(args.limit, args.section)

      case "get_statistics":
        return await siteGetStatistics()

      default:
        return {
          success: false,
          error: `أداة غير معروفة: ${toolName}`
        }
    }
  } catch (error: any) {
    console.error(`[Tool Execution Error] ${toolName}:`, error)
    return {
      success: false,
      error: error.message || "حدث خطأ أثناء تنفيذ الأداة"
    }
  }
}