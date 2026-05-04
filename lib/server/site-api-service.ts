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
  if (!input) return ""
  // سريع: حذف tags فقط بدون lookahead ثقيل
  // الأمان من XSS يعالجه data-sanitizer على مدخلات المستخدم وليس بيانات DB
  return input
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

/**
 * تطبيع الكلمة العربية بحذف اللواحق الشائعة للمطابقة الجذرية
 * مثال: "ترفيهية" → "ترفيه" ، "ترفيهي" → "ترفيه"
 */
function normalizeArabicWord(word: string): string {
  return word
    .replace(/[ًٌٍَُِّْ]/g, "")   // حذف التشكيل
    .replace(/(ة|ي|ا|ون|ين|ات|ان|اً|ية|يّ)$/, "")
    .replace(/^(ال|وال|فال|بال|كال)/, "")
}

/**
 * استخراج هيكل الحروف الصامتة (Consonant Skeleton)
 * يحذف حروف المد الداخلية ا/و/ي لتوحيد الجموع التكسيرية مع مفرداتها
 * مثال: "مشاريع" → "مشرع"، "مشروع" → "مشرع" (نفس الهيكل)
 */
function consonantSkeleton(word: string): string {
  if (word.length < 4) return word
  const first = word[0]
  const last = word[word.length - 1]
  const middle = word.slice(1, -1).replace(/[اوي]/g, "")
  const result = first + middle + last
  return result.length >= 3 ? result : word
}


function mapNewsToItem(row: NewsRow) {
  const categoryName = row.category_id ? `تصنيف ${row.category_id}` : "أخبار شبكة الكفيل"
  const strippedContent = stripHtml(row.content || "")
  const description = strippedContent.length <= 320 ? strippedContent : strippedContent.slice(0, 320) + "..."

  // بناء searchText مع جذور الكلمات لتغطية التصريفات المختلفة
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

  const searchText = rawText.toLowerCase()

  // إضافة جذور كلمات العنوان لتحسين المطابقة الجذرية
  const titleRoots = (row.title || "")
    .split(/\s+/)
    .map(normalizeArabicWord)
    .filter(w => w.length >= 3)
    .join(" ")

  // هيكل الحروف الصامتة لكلمات العنوان — يوحّد الجموع التكسيرية مع مفرداتها
  // مثال: "مشاريع" و"مشروع" كلاهما → "مشرع"
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
    searchText: searchTextWithRoots,   // يشمل النص الكامل + جذور كلمات العنوان + هياكل العنوان
    titleSkeletonText,                  // هياكل كلمات العنوان منفردة للمطابقة بمستوى العنوان
    created_at: row.created_at || null,
    created_at_ts: row.created_at ? new Date(row.created_at).getTime() : 0
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
    const t0 = Date.now()
    const [rows] = await db.query<NewsRow[]>(
      `SELECT id, title, title_2, image, content, views, photo_comment, active, category_id, created_at, updated_at
       FROM news
       WHERE active = 1 AND deleted_at IS NULL`
    )
    console.log(`[Timing] DB query: ${Date.now() - t0}ms (${rows.length} rows)`)

    const t1 = Date.now()
    const mapped = rows.map(mapNewsToItem)
    console.log(`[Timing] mapNewsToItem: ${Date.now() - t1}ms`)

    // بيانات الأخبار لا تحتوي حقولاً حساسة (passwords/tokens)
    // sanitizeAPIResponse مخصصة لمدخلات المستخدم وليس بيانات DB
    newsCache = mapped
    newsCacheTime = now

    return { success: true, data: mapped }
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
  limit: number = 2
): Promise<APICallResult> {
  const t0 = Date.now()
  const allNews = await getAllNews()
  if (!allNews.success) return allNews
  console.log(`[Timing] getAllNews (cached or fresh): ${Date.now() - t0}ms`)

  const data = (allNews.data as any[]) || []
  const safeQuery = (query || "").trim().toLowerCase()
  const words = safeQuery.split(/\s+/).filter(Boolean)
  // جذور الكلمات محفوظة بنفس الترتيب والفهرس — null للكلمات القصيرة
  const wordRoots = words.map(w => {
    const r = normalizeArabicWord(w)
    return r.length >= 3 ? r : null
  })
  // هيكل الحروف الصامتة بنفس الفهرس
  const wordSkeletons = wordRoots.map(r => (r ? consonantSkeleton(r) : null))
  const sectionLower = section ? section.toLowerCase() : null

  const t1 = Date.now()
  const scored = data
    .map(item => {
      const text: string = item.searchText || ""
      const titleLower: string = (item.name || "").toLowerCase()
      const titleSkeleton: string = item.titleSkeletonText || ""

      let score = 0

      // مطابقة العبارة الكاملة
      if (safeQuery && text.includes(safeQuery)) score += 15

      for (let i = 0; i < words.length; i++) {
        const w = words[i]
        const root = wordRoots[i]
        const skeleton = wordSkeletons[i]

        if (text.includes(w)) {
          // مطابقة حرفية: نقاط أعلى إذا كانت في العنوان
          score += titleLower.includes(w) ? 8 : 3
        } else if (root && root.length >= 3 && text.includes(root)) {
          // مطابقة جذرية (بدون مد): يغطي التصريفات مثل ترفيهية/ترفيهي
          score += titleLower.includes(root) ? 5 : 2
        } else if (skeleton && skeleton.length >= 3 && text.includes(skeleton)) {
          // مطابقة الهيكل الصامت: يوحّد الجموع التكسيرية — مشاريع/مشروع → مشرع
          score += titleSkeleton.includes(skeleton) ? 4 : 1
        }
      }

      if (sectionLower) {
        const inSection = (item.sections || []).some((s: any) =>
          String(s.name || "").toLowerCase().includes(sectionLower)
        )
        if (!inSection) score = 0
      }

      return { item, score }
    })
    .filter(x => (words.length ? x.score > 0 : true))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.item.created_at_ts || 0) - (a.item.created_at_ts || 0)
    })
    .slice(0, Math.min(Math.max(limit || 2, 1), 20))
    .map(x => x.item)

  console.log(`[Timing] siteSearch loop (${data.length} items): ${Date.now() - t1}ms → ${scored.length} results`)

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
  limit: number = 2,
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
        // تجاهل limit من النموذج — الافتراضي 2 دائماً
        return await siteSearch(args.query, args.section)

      case "get_project_by_id":
        return await siteGetProject(args.id)

      case "filter_projects":
        return await siteListCategories(args.include_counts)

      case "get_latest_projects":
        // تجاهل limit من النموذج — الافتراضي 2 دائماً
        return await siteGetLatest(undefined, args.section)

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

// تحميل الكاش في الخلفية عند تشغيل السيرفر لتجنب التأخير عند أول طلب
getAllNews().then(() => {
  console.log("[Cache] Warm-up complete")
}).catch(() => {
  // DB قد لا يكون جاهزاً عند الـ start — سيُعاد المحاولة عند أول طلب
})