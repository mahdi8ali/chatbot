/**
 * projects-service.ts — مشاريع العتبة العباسية من قاعدة بيانات alkafeel_projects
 */

import mysql, { Pool, RowDataPacket } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"
import { APICallResult, stripHtml, excerpt, buildTitleExtras, normalizeArabicWord, consonantSkeleton } from "./db"

// ── Pool منفصل لـ alkafeel_projects ─────────────────────────────────────────
let projectsPool: Pool | null = null

function getProjectsPool(): Pool {
  if (projectsPool) return projectsPool
  const config = getDatabaseConfig()
  projectsPool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: process.env.PROJECTS_DB_NAME || "alkafeel_projects",
    connectionLimit: config.connectionLimit,
    charset: "utf8mb4"
  })
  return projectsPool
}

// ── Interfaces ────────────────────────────────────────────────────────────────
interface ProjectRow extends RowDataPacket {
  id: number
  name: string
  description: string | null
  img: string | null
  address: string | null
  website: string | null
  news_url: string | null
  created_at: string | null
  sections: string | null      // GROUP_CONCAT من JOIN
  properties: string | null    // GROUP_CONCAT من JOIN
}

// ── Map ───────────────────────────────────────────────────────────────────────
function mapProjectToItem(row: ProjectRow) {
  const descClean = stripHtml(row.description || "")
  const description = descClean.length <= 2500 ? descClean : descClean.slice(0, 2500) + "..."

  const sectionNames = row.sections ? row.sections.split("|").filter(Boolean) : ["المشاريع"]
  const propsRaw = row.properties ? row.properties.split("||").filter(Boolean) : []
  const properties = propsRaw.map(p => {
    const idx = p.indexOf(":")
    return idx > 0 ? { name: p.slice(0, idx).trim(), value: p.slice(idx + 1).trim() } : null
  }).filter(Boolean)

  const { roots, skeletons } = buildTitleExtras(row.name || "")
  const searchText = [row.name, descClean.slice(0, 500), sectionNames.join(" "), row.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase()
    .replace(/[ًٌٍَُِّْ]/g, "")
    + " " + roots + " " + skeletons

  return {
    id: row.id,
    name: row.name || "",
    description,
    source: "project",
    source_label: "مشاريع العتبة العباسية",
    sections: sectionNames.map(n => ({ name: n })),
    properties: [
      row.address ? { name: "العنوان", value: row.address } : null,
      row.website ? { name: "الموقع", value: row.website } : null,
      row.created_at ? { name: "تاريخ الإضافة", value: row.created_at } : null,
      ...properties
    ].filter(Boolean),
    url: row.website || row.news_url || "https://alkafeel.net/projects",
    img: row.img || null,
    searchText,
    titleSkeletonText: skeletons,
    created_at: row.created_at || null,
    created_at_ts: row.created_at ? new Date(row.created_at).getTime() : 0
  }
}

// ── Cache ─────────────────────────────────────────────────────────────────────
let projectsCache: any[] | null = null
let projectsCacheTime = 0
const CACHE_DURATION = 10 * 60 * 1000

export async function getAllProjects(): Promise<APICallResult> {
  const now = Date.now()
  if (projectsCache && now - projectsCacheTime < CACHE_DURATION) {
    return { success: true, data: projectsCache }
  }
  try {
    const db = getProjectsPool()
    const [rows] = await db.query<ProjectRow[]>(`
      SELECT
        p.id, p.name, p.description, p.img, p.address, p.website, p.news_url, p.created_at,
        GROUP_CONCAT(DISTINCT s.name SEPARATOR '|') AS sections,
        GROUP_CONCAT(DISTINCT CONCAT(pr.name, ':', pp.value) ORDER BY pr.id SEPARATOR '||') AS properties
      FROM projects p
      LEFT JOIN project_section ps ON ps.project_id = p.id
      LEFT JOIN sections s ON s.id = ps.section_id
      LEFT JOIN project_property pp ON pp.project_id = p.id
      LEFT JOIN properties pr ON pr.id = pp.property_id
      WHERE p.deleted_at IS NULL
      GROUP BY p.id
    `)
    projectsCache = rows.map(mapProjectToItem)
    projectsCacheTime = now
    console.log(`[Cache] Projects loaded: ${projectsCache.length} items`)
    return { success: true, data: projectsCache }
  } catch (error: any) {
    console.error("[DB Error - getAllProjects]:", error?.message)
    return { success: false, error: "تعذر تحميل بيانات المشاريع" }
  }
}
