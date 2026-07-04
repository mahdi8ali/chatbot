/**
 * news-service.ts — بيانات الأخبار من جدول `news`
 * يغطي: search_news, get_latest, filter_categories, get_statistics
 */

import { RowDataPacket } from "mysql2/promise"
import {
  APICallResult, getPool,
  stripHtml, excerpt, normalizeArabicWord, consonantSkeleton, buildTitleExtras
} from "./db"

// ── Interface ────────────────────────────────────────────────────────────────
interface NewsRow extends RowDataPacket {
  id: number
  title: string
  title_2: string | null
  image: string | null
  content: string | null
  views: number
  photo_comment: string | null
  active: number
  category_id: number | null
  type_id: number | null
  type_name: string | null
  created_at: string | null
  updated_at: string | null
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function getNewsUrl(id: number): string {
  return `https://alkafeel.net/news/index.php?id=${id}`
}

function mapNewsToItem(row: NewsRow) {
  const categoryName = row.type_name || (row.category_id ? `تصنيف ${row.category_id}` : "أخبار شبكة الكفيل")
  const strippedContent = stripHtml(row.content || "")
  const description = strippedContent.length <= 2500 ? strippedContent : strippedContent.slice(0, 2500) + "..."

  const rawText = [
    row.title,
    row.title_2,
    description,
    strippedContent.slice(0, 250),
    row.photo_comment,
    categoryName
  ]
    .filter(Boolean)
    .join(" ")

  const searchText = rawText.toLowerCase().replace(/[ًٌٍَُِّْ]/g, "")

  const titleRoots = (row.title || "")
    .split(/\s+/)
    .map(normalizeArabicWord)
    .filter(w => w.length >= 3)
    .join(" ")

  const titleSkeletons = (row.title || "")
    .split(/\s+/)
    .map(w => consonantSkeleton(normalizeArabicWord(w)))
    .filter(w => w.length >= 3)
    .join(" ")

  const titleSkeletonText = titleSkeletons.toLowerCase()
  const searchTextWithRoots = searchText + " " + titleRoots.toLowerCase() + " " + titleSkeletonText

  return {
    id: row.id,
    name: row.title,
    description,
    sections: [{ name: categoryName }],
    type_name: row.type_name || null,
    views: row.views || 0,
    properties: [
      row.title_2 ? { name: "العنوان الفرعي", value: row.title_2 } : null,
      row.photo_comment ? { name: "تعليق الصورة", value: row.photo_comment } : null,
      row.created_at ? { name: "تاريخ النشر", value: row.created_at } : null,
      { name: "عدد المشاهدات", value: String(row.views || 0) },
      row.image ? { name: "الصورة", value: `https://www.alkafeel.net/alkafeelnews/up3/${row.image}` } : null
    ].filter(Boolean),
    url: getNewsUrl(row.id),
    searchText: searchTextWithRoots,
    titleSkeletonText,
    created_at: row.created_at || null,
    created_at_ts: row.created_at ? new Date(row.created_at).getTime() : 0
  }
}

// ── Cache ────────────────────────────────────────────────────────────────────
let newsCache: any[] | null = null
let newsCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getAllNews(): Promise<APICallResult> {
  const now = Date.now()
  if (newsCache && now - newsCacheTime < CACHE_DURATION) {
    return { success: true, data: newsCache }
  }
  try {
    const db = getPool()
    const t0 = Date.now()
    const [rows] = await db.query<NewsRow[]>(
      `SELECT n.id, n.title, n.title_2, n.image, n.content, n.views, n.photo_comment,
              n.active, n.category_id, n.type_id, nt.name AS type_name,
              n.created_at, n.updated_at
       FROM news n
       LEFT JOIN news_type nt ON nt.id = n.type_id
       WHERE n.active = 1 AND n.deleted_at IS NULL`
    )
    console.log(`[Timing] DB query: ${Date.now() - t0}ms (${rows.length} rows)`)
    const t1 = Date.now()
    const mapped = rows.map(mapNewsToItem)
    console.log(`[Timing] mapNewsToItem: ${Date.now() - t1}ms`)
    newsCache = mapped
    newsCacheTime = now
    return { success: true, data: mapped }
  } catch (error: any) {
    console.error("[DB Error - getAllNews]:", error?.message || error)
    return { success: false, error: "تعذر الوصول إلى قاعدة البيانات. تأكد من إعدادات DB في .env.local" }
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function siteListCategories(include_counts: boolean = false): Promise<APICallResult> {
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
  return { success: true, data: { categories, total_categories: categories.length } }
}

export async function siteGetLatest(limit: number = 2, section?: string): Promise<APICallResult> {
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
  return { success: true, data: { projects, total: projects.length, limit } }
}

export async function siteGetStatistics(): Promise<APICallResult> {
  const allNews = await getAllNews()
  if (!allNews.success) return allNews

  const data = (allNews.data as any[]) || []
  const sectionCounts = new Map<string, number>()
  const typeCounts = new Map<string, number>()
  const typeDates = new Map<string, { oldest: string; newest: string }>()
  for (const item of data) {
    for (const s of item.sections || []) {
      const name = s.name || "غير مصنف"
      sectionCounts.set(name, (sectionCounts.get(name) || 0) + 1)
    }
    const typeName = item.type_name || "أخبار شبكة الكفيل"
    typeCounts.set(typeName, (typeCounts.get(typeName) || 0) + 1)
    // تتبع أقدم وأحدث تاريخ لكل نوع
    const date = item.created_at ? new Date(item.created_at).toISOString().split("T")[0] : null
    if (date) {
      const existing = typeDates.get(typeName)
      if (!existing) {
        typeDates.set(typeName, { oldest: date, newest: date })
      } else {
        if (date < existing.oldest) existing.oldest = date
        if (date > existing.newest) existing.newest = date
      }
    }
  }
  const top_sections = Array.from(sectionCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([section, count]) => ({ section, count }))
  const by_type = Array.from(typeCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([type, count]) => {
      const dates = typeDates.get(type)
      return { type, count, ...(dates && { oldest: dates.oldest, newest: dates.newest }) }
    })
  return {
    success: true,
    data: { total_projects: data.length, top_sections, sections_count: sectionCounts.size, by_type }
  }
}

// ── جلب الصور المرفقة لخبر بمعرّفه ────────────────────────────────────────────
const NEWS_IMAGE_BASE = "https://www.alkafeel.net/alkafeelnews/up3"

interface NewsAttachmentRow extends RowDataPacket {
  image: string
  title: string | null
  sort: number
}

export async function getNewsImages(newsId: number): Promise<APICallResult> {
  try {
    const db = getPool()
    const [rows] = await db.execute<NewsAttachmentRow[]>(
      `SELECT image, title, sort FROM news_image_attachments
       WHERE news_id = ? AND deleted_at IS NULL
       ORDER BY sort ASC
       LIMIT 30`,
      [newsId]
    )
    if (!rows.length) {
      return { success: false, error: "لا توجد صور مرفقة لهذا الخبر." }
    }
    const images = rows.map((r) => ({
      image_url: `${NEWS_IMAGE_BASE}/${r.image}`,
      title: r.title || null,
    }))
    return { success: true, data: { news_id: newsId, images, count: images.length } }
  } catch (err: any) {
    console.error("[news-service] getNewsImages error:", err)
    return { success: false, error: err.message }
  }
}
