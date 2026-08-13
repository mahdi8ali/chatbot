/**
 * video-service.ts — مكتبة الفيديو من جداول `video_files` و `video_sections`
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool, excerpt, buildTitleExtras, parseJsonAr } from "./db"

export interface VideoFileRow extends RowDataPacket {
  id: number
  title: string        // JSON
  caption: string | null  // JSON
  image: string | null  // filename of thumbnail
  request: string
  video_section_id: number | null
  length: string | null
  active: number
  created_at: string | null
  section_title: string | null  // from JOIN (JSON)
  section_request: string | null
}

export function mapVideoToItem(row: VideoFileRow) {
  const titleAr = parseJsonAr(row.title)
  const captionAr = parseJsonAr(row.caption)
  const sectionTitleAr = parseJsonAr(row.section_title)
  const description = captionAr || excerpt(titleAr, 300)
  const { roots, skeletons } = buildTitleExtras(titleAr)
  const searchText = [titleAr, captionAr, sectionTitleAr].filter(Boolean).join(" ").toLowerCase().replace(/[ًٌٍَُِّْ]/g, "")
    + " " + roots + " " + skeletons
  const videoUrl = row.request
    ? `https://static1.alkafeel.net/videos/${row.request}/${row.request}.mp4`
    : null
  const thumbnailUrl = row.image
    ? `https://static1.alkafeel.net/uploads/videos/${row.image}`
    : null

  return {
    id: `video_${row.id}`,
    name: titleAr || "",
    description,
    source: "video",
    source_label: sectionTitleAr ? `مكتبة الفيديو — ${sectionTitleAr}` : "مكتبة الفيديو",
    sections: [{ name: sectionTitleAr || "الفيديو" }],
    url: row.request ? `https://alkafeel.net/media/${row.request}?lang=ar` : `https://alkafeel.net/media?lang=ar` as string | null,
    video_url: videoUrl,
    thumbnail_url: thumbnailUrl,
    length: row.length || null,
    searchText,
    titleSkeletonText: skeletons,
    created_at: row.created_at || null,
    created_at_ts: row.created_at ? new Date(row.created_at).getTime() : 0
  }
}

let videoCache: any[] | null = null
let videoCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getAllVideos(): Promise<APICallResult> {
  const now = Date.now()
  if (videoCache && now - videoCacheTime < CACHE_DURATION) {
    return { success: true, data: videoCache }
  }
  try {
    const db = getPool()
    const [rows] = await db.query<VideoFileRow[]>(
      `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request, vf.video_section_id,
              vf.length, vf.active, vf.created_at,
              vs.title as section_title, vs.request as section_request
       FROM video_files vf
       LEFT JOIN video_sections vs ON vf.video_section_id = vs.id
       WHERE vf.active = 1 AND vf.deleted_at IS NULL`
    )
    videoCache = (rows as VideoFileRow[]).map(mapVideoToItem)
    videoCacheTime = now
    console.log(`[Cache] Videos loaded: ${videoCache.length} items`)
    return { success: true, data: videoCache }
  } catch (error: any) {
    console.error("[DB Error - getAllVideos]:", error?.message)
    return { success: false, error: "تعذر تحميل بيانات الفيديو" }
  }
}

export async function getVideoSections(): Promise<APICallResult> {
  const db = getPool()
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(title, '$.ar')) as title_ar, request
       FROM video_sections
       WHERE deleted_at IS NULL
       ORDER BY sort`
    )
    const sections = (rows as any[]).map(r => ({
      id: r.id,
      title: r.title_ar,
      url: `https://alkafeel.net/media/${r.request}`
    }))
    return { success: true, data: { sections, total: sections.length } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}

/**
 * يحذف حركات التشكيل العربي من النص
 */
function stripDiacritics(text: string): string {
  // ً ٌ ٍ َ ُ ِ ّ ْ ٰ ـ
  return text.replace(/[\u064B-\u0652\u0670\u0640]/g, "")
}

/**
 * كلمات سياق شائعة لا تنتمي لعنوان الفيديو (ألقاب، طلبات، أنواع)
 * تُحذف من استعلام الـ fallback لتحسين دقة البحث
 */
const CONTEXT_WORDS = new Set([
  // ألقاب
  "سيدة","سيد","مولاي","مولى","الحاج","الشيخ","الأستاذ","الدكتور",
  // كلمات طلب/سياق
  "اريد","ابي","بغيت","اعطني","شاهد","عرض","جلب","ايبي","اعطيني",
  // أنواع المحتوى
  "فيلم","فيلمي","مسلسل","مسلسله","حلقة","حلقه","برنامج","مقطع","فيديو","كليب","كلمات","قصيدة","نشيد","اغنية",
  // كلمات وصفية شائعة
  "مال","مالي","الي","منها","عنه","عنها",
])

/**
 * بحث مباشر في video_files عبر قاعدة البيانات (بدون cache)
 * أسرع وأدق من تحميل كل الفيديوهات عند البحث بعنوان محدد
 */
export async function searchVideos(params: {
  query: string
  section?: string
  limit?: number
}): Promise<APICallResult> {
  const db = getPool()
  const limit = Math.min(Math.max(params.limit || 5, 1), 20)

  // حذف التشكيل من كلمات البحث وتقسيمها
  const words = stripDiacritics(params.query.trim()).split(/\s+/).filter(w => w.length > 1)
  const searchWords = words.length > 0 ? words : [stripDiacritics(params.query)]

  // دالة مساعدة: تُرجع SQL يحذف التشكيل ويلف النص بمسافات لمطابقة حدود الكلمات
  const stripped = (col: string) =>
    `CONCAT(' ', REGEXP_REPLACE(IFNULL(JSON_UNQUOTE(JSON_EXTRACT(${col}, '$.ar')), ''), '[ًٌٍَُِّْٰـ]', ''), ' ')`

  try {
    // بناء فلتر القسم إذا طُلب
    let sectionJoin = `LEFT JOIN video_sections vs ON vs.id = vf.video_section_id`
    let sectionWhere = ""
    const bindParams: any[] = []

    // بناء شرط AND لكل كلمة — يبحث في العنوان والوصف بعد حذف التشكيل
    const wordConditions = searchWords.map(() =>
      `(${stripped("vf.title")} LIKE ? OR ${stripped("vf.caption")} LIKE ?)`
    ).join(" AND ")

    for (const w of searchWords) {
      bindParams.push(`% ${w} %`, `% ${w} %`)
    }

    if (params.section) {
      sectionWhere = `AND JSON_UNQUOTE(JSON_EXTRACT(vs.title, '$.ar')) LIKE ?`
      bindParams.push(`%${params.section}%`)
    }

    bindParams.push(limit)

    const [rows] = await db.query<VideoFileRow[]>(
      `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request,
              vf.video_section_id, vf.length, vf.active, vf.created_at,
              vs.title as section_title, vs.request as section_request
       FROM video_files vf
       ${sectionJoin}
       WHERE vf.active = 1 AND vf.deleted_at IS NULL
         AND (${wordConditions})
       ${sectionWhere}
       ORDER BY vf.created_at DESC
       LIMIT ?`,
      bindParams
    )

    // إذا لم توجد نتائج بـ AND، نجرب كل كلمة وحدها بدءاً من الأطول بعد حذف كلمات السياق
    if ((rows as VideoFileRow[]).length === 0 && searchWords.length > 1) {
      // فلتر كلمات السياق (ألقاب، طلبات، أنواع) لتبقى الكلمات المميزة فقط
      const distinctiveWords = searchWords.filter(w => !CONTEXT_WORDS.has(w))
      const wordsToTry = distinctiveWords.length > 0 ? distinctiveWords : searchWords
      const sortedByLength = [...wordsToTry].sort((a, b) => b.length - a.length)
      for (const word of sortedByLength) {
        const singleCond = `(${stripped("vf.title")} LIKE ? OR ${stripped("vf.caption")} LIKE ?)`
        const singleParams: any[] = [`% ${word} %`, `% ${word} %`]
        if (params.section) singleParams.push(`%${params.section}%`)
        singleParams.push(limit)
        const [singleRows] = await db.query<VideoFileRow[]>(
          `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request,
                  vf.video_section_id, vf.length, vf.active, vf.created_at,
                  vs.title as section_title, vs.request as section_request
           FROM video_files vf
           ${sectionJoin}
           WHERE vf.active = 1 AND vf.deleted_at IS NULL
             AND ${singleCond}
           ${sectionWhere}
           ORDER BY vf.created_at DESC
           LIMIT ?`,
          singleParams
        )
        if ((singleRows as VideoFileRow[]).length > 0) {
          const results = (singleRows as VideoFileRow[]).map(mapVideoToItem)
          return { success: true, data: { results, total: results.length, query: params.query } }
        }
      }
    }

    const results = (rows as VideoFileRow[]).map(mapVideoToItem)
    return {
      success: true,
      data: { results, total: results.length, query: params.query }
    }
  } catch (error: any) {
    console.error("[DB Error - searchVideos]:", error?.message)
    return { success: false, error: "تعذر البحث في قاعدة بيانات الفيديو" }
  }
}
