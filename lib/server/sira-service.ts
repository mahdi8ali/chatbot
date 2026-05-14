/**
 * sira-service.ts — سيرة الإمام أبي الفضل العباس (ع) من جدول `abbas`
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool, stripHtml, excerpt, buildTitleExtras } from "./db"

interface AbbasRow extends RowDataPacket {
  id: number
  title: string
  text: string
  tag: string
  parent_id: number | null
  sort: number
  active: number
  deleted_at: string | null
}

function mapAbbasToItem(row: AbbasRow) {
  const textClean = stripHtml(row.text || "")
  const description = excerpt(textClean, 500)
  const { roots, skeletons } = buildTitleExtras(row.title || "")
  const searchText = [row.title, textClean, row.tag].filter(Boolean).join(" ").toLowerCase().replace(/[ًٌٍَُِّْ]/g, "")
    + " " + roots + " " + skeletons
  return {
    id: `sira_${row.id}`,
    name: row.title || "",
    description,
    source: "sira",
    source_label: "سيرة أبي الفضل العباس (ع)",
    sections: [{ name: row.tag || "السيرة" }],
    url: `https://alkafeel.net/abbas?lang=ar` as string | null,
    searchText,
    titleSkeletonText: skeletons,
    created_at: null,
    created_at_ts: 0
  }
}

let abbasCache: any[] | null = null
let abbasCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getAllAbbas(): Promise<APICallResult> {
  const now = Date.now()
  if (abbasCache && now - abbasCacheTime < CACHE_DURATION) {
    return { success: true, data: abbasCache }
  }
  try {
    const db = getPool()
    const [rows] = await db.query<AbbasRow[]>(
      `SELECT id, title, text, tag, parent_id, sort, active, deleted_at
       FROM abbas
       WHERE active = 1 AND deleted_at IS NULL`
    )
    abbasCache = (rows as AbbasRow[]).map(mapAbbasToItem)
    abbasCacheTime = now
    console.log(`[Cache] Abbas loaded: ${abbasCache.length} items`)
    return { success: true, data: abbasCache }
  } catch (error: any) {
    console.error("[DB Error - getAllAbbas]:", error?.message)
    return { success: false, error: "تعذر تحميل بيانات السيرة" }
  }
}
