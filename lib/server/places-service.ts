/**
 * places-service.ts — الأماكن من جداول `places_data` و `places_categories`
 *
 * الجدول: ka_db.places_data (4,056 سجل)
 * الفئات: المزارات، الحسينيات، الفنادق، المواكب الخدمية، المرافق الصحية والخدمية، نقاط دالة
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

// ── واجهات ─────────────────────────────────────────────────────────────────

interface PlaceRow extends RowDataPacket {
  id: number
  place_name: string
  place_city: string
  place_address: string | null
  place_lat: string | null
  place_lng: string | null
  place_popular: string
  category_name: string | null
}

// ── ماكرو لفك تشفير الحقول المزدوجة (latin1-as-utf8 Mojibake) ───────────────

const DECODE = (col: string) =>
  `CONVERT(CAST(CONVERT(${col} USING latin1) AS BINARY) USING utf8mb4)`

// ── بناء رابط Google Maps ──────────────────────────────────────────────────

function buildMapsUrl(lat: string | null, lng: string | null): string | null {
  if (!lat || !lng) return null
  const la = parseFloat(lat)
  const lo = parseFloat(lng)
  if (isNaN(la) || isNaN(lo)) return null
  return `https://maps.google.com/?q=${la},${lo}`
}

// ── تحويل صف إلى كائن نظيف ───────────────────────────────────────────────

function mapPlaceToItem(row: PlaceRow) {
  return {
    id: row.id,
    name: row.place_name,
    city: row.place_city,
    address: row.place_address || null,
    category: row.category_name || null,
    maps_url: buildMapsUrl(row.place_lat, row.place_lng),
    lat: row.place_lat || null,
    lng: row.place_lng || null,
    popular: Number(row.place_popular) || 0,
  }
}

// ── البحث في الأماكن ──────────────────────────────────────────────────────

export async function searchPlaces(params: {
  query?: string
  category?: string
  city?: string
  near?: string   // "lat,lng" — يرتّب النتائج حسب المسافة من هذه النقطة
  limit?: number
}): Promise<APICallResult> {
  const db = getPool()
  const limit = Math.min(Math.max(params.limit || 8, 1), 30)

  // بناء شروط الفلترة بشكل ديناميكي
  const conditions: string[] = []
  const bindings: any[] = []

  if (params.query) {
    conditions.push(`${DECODE("pd.place_name")} LIKE ?`)
    bindings.push(`%${params.query}%`)
  }

  if (params.category) {
    conditions.push(`pc.category_name LIKE ?`)
    bindings.push(`%${params.category}%`)
  }

  if (params.city) {
    conditions.push(`${DECODE("pd.place_city")} LIKE ?`)
    bindings.push(`%${params.city}%`)
  }

  // حساب المسافة إن وُجدت إحداثيات مرجعية
  let distanceSelect = ""
  let orderClause = "ORDER BY CAST(pd.place_popular AS UNSIGNED) DESC, pd.place_name ASC"

  if (params.near) {
    const parts = params.near.split(",")
    const refLat = parseFloat(parts[0])
    const refLng = parseFloat(parts[1])
    if (!isNaN(refLat) && !isNaN(refLng)) {
      // صيغة Haversine مبسطة — المسافة بالكيلومتر
      distanceSelect = `,
              ROUND(
                6371 * 2 * ASIN(SQRT(
                  POW(SIN((RADIANS(CAST(pd.place_lat AS DECIMAL(10,7))) - RADIANS(${refLat})) / 2), 2) +
                  COS(RADIANS(${refLat})) * COS(RADIANS(CAST(pd.place_lat AS DECIMAL(10,7)))) *
                  POW(SIN((RADIANS(CAST(pd.place_lng AS DECIMAL(10,7))) - RADIANS(${refLng})) / 2), 2)
                )), 3
              ) as distance_km`
      orderClause = "ORDER BY distance_km ASC"
      // تصفية الأماكن التي لا تملك إحداثيات صالحة
      conditions.push("pd.place_lat IS NOT NULL AND pd.place_lat != '' AND pd.place_lng IS NOT NULL AND pd.place_lng != ''")
    }
  }

  bindings.push(limit)

  try {
    const [rows] = await db.query<PlaceRow[]>(
      `SELECT pd.id,
              ${DECODE("pd.place_name")} as place_name,
              ${DECODE("pd.place_city")} as place_city,
              ${DECODE("pd.place_address")} as place_address,
              pd.place_lat, pd.place_lng, pd.place_popular,
              pc.category_name${distanceSelect}
       FROM places_data pd
       LEFT JOIN places_categories pc ON pc.id = pd.place_category
       WHERE ${conditions.length ? conditions.join(" AND ") : "1=1"}
       ${orderClause}
       LIMIT ?`,
      bindings
    )

    const results = (rows as PlaceRow[]).map(row => ({
      ...mapPlaceToItem(row),
      distance_km: (row as any).distance_km ?? null,
    }))
    return {
      success: true,
      data: {
        results,
        total: results.length,
        query: params.query || params.category || params.city || ""
      }
    }
  } catch (error: any) {
    console.error("[DB Error - searchPlaces]:", error?.message)
    return { success: false, error: "تعذر البحث في قاعدة بيانات الأماكن" }
  }
}

// ── قائمة الفئات ───────────────────────────────────────────────────────────

export async function getPlaceCategories(): Promise<APICallResult> {
  const db = getPool()
  try {
    const [rows] = await db.query<RowDataPacket[]>(
      `SELECT pc.id,
              pc.category_name,
              COUNT(pd.id) as count
       FROM places_categories pc
       LEFT JOIN places_data pd ON pd.place_category = pc.id
       GROUP BY pc.id, pc.category_name
       ORDER BY pc.ord ASC`
    )
    return { success: true, data: { categories: rows } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
