/**
 * video-service.ts — مكتبة الفيديو من جداول `video_files` و `video_sections`
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool, excerpt, buildTitleExtras, parseJsonAr } from "./db"

interface VideoFileRow extends RowDataPacket {
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

function mapVideoToItem(row: VideoFileRow) {
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
