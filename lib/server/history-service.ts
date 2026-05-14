/**
 * history-service.ts — الأحداث التاريخية من جداول `history_contents` و `history_sections`
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool, stripHtml, excerpt, buildTitleExtras } from "./db"

interface HistoryContentRow extends RowDataPacket {
  id: number
  content: string
  history_section_id: number | null
  section_title: string | null
  section_type: string | null
  created_at: string | null
  deleted_at?: string | null
}

function mapHistoryToItem(row: HistoryContentRow) {
  const textClean = stripHtml(row.content || "")
  const sectionTitle = row.section_title || "التاريخ"
  const description = excerpt(textClean, 900)
  const { roots, skeletons } = buildTitleExtras(sectionTitle)
  const searchText = [sectionTitle, textClean, row.section_type].filter(Boolean).join(" ").toLowerCase().replace(/[ًٌٍَُِّْ]/g, "")
    + " " + roots + " " + skeletons
  return {
    id: `history_${row.id}`,
    name: sectionTitle,
    description,
    source: "history",
    source_label: "التاريخ",
    sections: [{ name: sectionTitle }],
    url: `https://alkafeel.net/history?lang=ar` as string | null,
    searchText,
    titleSkeletonText: skeletons,
    created_at: row.created_at || null,
    created_at_ts: row.created_at ? new Date(row.created_at).getTime() : 0
  }
}

let historyCache: any[] | null = null
let historyCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getAllHistory(): Promise<APICallResult> {
  const now = Date.now()
  if (historyCache && now - historyCacheTime < CACHE_DURATION) {
    return { success: true, data: historyCache }
  }
  try {
    const db = getPool()
    const [rows] = await db.query<HistoryContentRow[]>(
      `SELECT hc.id, hc.content, hc.history_section_id, hc.created_at, hc.deleted_at,
              hs.title as section_title, hs.type as section_type
       FROM history_contents hc
       LEFT JOIN history_sections hs ON hc.history_section_id = hs.id
       WHERE hc.deleted_at IS NULL`
    )
    historyCache = (rows as HistoryContentRow[]).map(mapHistoryToItem)
    historyCacheTime = now
    console.log(`[Cache] History loaded: ${historyCache.length} items`)
    return { success: true, data: historyCache }
  } catch (error: any) {
    console.error("[DB Error - getAllHistory]:", error?.message)
    return { success: false, error: "تعذر تحميل بيانات التاريخ" }
  }
}
