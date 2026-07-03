/**
 * site-api-service.ts — Orchestrator
 *
 * يجمع جميع الـ services ويوفر:
 * - siteSearch: البحث الموحّد عبر جميع المصادر
 * - siteGetProject: جلب عنصر بمعرّفه من أي مصدر
 * - executeToolByName: نقطة الدخول لاستدعاء الأدوات من route.ts
 *
 * لإضافة مصدر جديد: أنشئ service جديد واستورده هنا فقط.
 */

import type { AllowedToolName } from "./site-tools-definitions"
import type { APICallResult } from "./db"
import { normalizeArabicWord, consonantSkeleton, scoreItem } from "./db"
import { getAllNews, siteListCategories, siteGetLatest, siteGetStatistics } from "./news-service"
import { getAllAbbas } from "./sira-service"
import { getAllHistory } from "./history-service"
import { getAllVideos, getVideoSections, searchVideos } from "./video-service"
import { searchContacts } from "./contacts-service"
import { getAllProjects } from "./projects-service"
import { searchPlaces } from "./places-service"
import { getPrayerTimes } from "./prayer-service"

export type { APICallResult }

// ── re-export للمستخدمين الخارجيين (route.ts لا يستوردها مباشرة لكن للتوافق) ──
export { searchContacts, getVideoSections, siteListCategories, siteGetLatest, siteGetStatistics }

// ── البحث الموحّد عبر كل المصادر ─────────────────────────────────────────────
export async function siteSearch(
  query?: string,
  section?: string,
  limit: number = 5,
  source?: string
): Promise<APICallResult> {
  const t0 = Date.now()

  const wantNews     = !source || source === "news"
  const wantSira     = !source || source === "sira"
  const wantHistory  = !source || source === "history"
  const wantVideo    = !source || source === "video"
  const wantProjects = !source || source === "project"

  const [newsResult, abbasResult, historyResult, videoResult, projectsResult] = await Promise.all([
    wantNews     ? getAllNews()      : Promise.resolve<APICallResult>({ success: true, data: [] }),
    wantSira     ? getAllAbbas()     : Promise.resolve<APICallResult>({ success: true, data: [] }),
    wantHistory  ? getAllHistory()   : Promise.resolve<APICallResult>({ success: true, data: [] }),
    wantVideo    ? getAllVideos()    : Promise.resolve<APICallResult>({ success: true, data: [] }),
    wantProjects ? getAllProjects()  : Promise.resolve<APICallResult>({ success: true, data: [] }),
  ])
  console.log(`[Timing] getAllSources: ${Date.now() - t0}ms`)

  const allData: any[] = [
    ...((newsResult.data     as any[]) || []),
    ...((abbasResult.data    as any[]) || []),
    ...((historyResult.data  as any[]) || []),
    ...((videoResult.data    as any[]) || []),
    ...((projectsResult.data as any[]) || []),
  ]

  const safeQuery = (query || "").trim().toLowerCase()
  const words = safeQuery.split(/\s+/).filter(Boolean)
  const wordRoots = words.map(w => { const r = normalizeArabicWord(w); return r.length >= 3 ? r : null })
  const wordSkeletons = wordRoots.map(r => (r ? consonantSkeleton(r) : null))
  const sectionLower = section ? section.toLowerCase() : null

  const t1 = Date.now()
  // نحسب كل المطابقات أولاً (قبل القصّ) — ليكون العدد الحقيقي متاحاً لأسئلة "كم عدد..."
  const matched = allData
    .map(item => ({ item, score: scoreItem(item, words, wordRoots, wordSkeletons, safeQuery, sectionLower) }))
    .filter(x => (words.length ? x.score >= 3 : true))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score
      return (b.item.created_at_ts || 0) - (a.item.created_at_ts || 0)
    })

  const totalMatches = matched.length
  // النتائج المعروضة مقتصّة (لتوفير الـ tokens)، لكن total يعكس العدد الكامل للمطابقات
  const scored = matched
    .slice(0, Math.min(Math.max(limit || 2, 1), 20))
    .map(x => x.item)

  console.log(`[Timing] siteSearch loop (${allData.length} items): ${Date.now() - t1}ms → ${scored.length}/${totalMatches} matches`)
  return { success: true, data: { results: scored, total: totalMatches, returned: scored.length, query: safeQuery || section || "" } }
}

// ── جلب عنصر بمعرّفه من أي مصدر ─────────────────────────────────────────────
export async function siteGetProject(id: string): Promise<APICallResult> {
  const sid = String(id)

  if (sid.startsWith("sira_")) {
    const result = await getAllAbbas()
    if (!result.success) return result
    const item = (result.data as any[]).find(n => String(n.id) === sid)
    if (!item) return { success: false, error: `لم يتم العثور على سجل السيرة: ${sid}` }
    return { success: true, data: item }
  }

  if (sid.startsWith("history_")) {
    const result = await getAllHistory()
    if (!result.success) return result
    const item = (result.data as any[]).find(n => String(n.id) === sid)
    if (!item) return { success: false, error: `لم يتم العثور على سجل التاريخ: ${sid}` }
    return { success: true, data: item }
  }

  if (sid.startsWith("video_")) {
    const result = await getAllVideos()
    if (!result.success) return result
    const item = (result.data as any[]).find(n => String(n.id) === sid)
    if (!item) return { success: false, error: `لم يتم العثور على فيديو: ${sid}` }
    return { success: true, data: item }
  }

  // مشاريع العتبة (숫자 id بدون prefix)
  if (/^\d+$/.test(sid)) {
    const result = await getAllProjects()
    if (result.success) {
      const item = (result.data as any[]).find(n => String(n.id) === sid)
      if (item) return { success: true, data: item }
    }
  }

  // أخبار (افتراضي)
  const allNews = await getAllNews()
  if (!allNews.success) return allNews
  const item = (allNews.data as any[]).find(n => String(n.id) === sid)
  if (!item) return { success: false, error: `لم يتم العثور على العنصر ${sid}` }
  return { success: true, data: item }
}

// ── نقطة الدخول الرئيسية من route.ts ─────────────────────────────────────────
export async function executeToolByName(
  toolName: AllowedToolName,
  args: Record<string, any>
): Promise<APICallResult> {
  console.log(`[Tool Execution] ${toolName}`, args)
  try {
    switch (toolName) {
      case "search_projects":
        return await siteSearch(args.query, args.section, undefined, args.source)
      case "get_project_by_id":
        return await siteGetProject(args.id)
      case "filter_projects":
        return await siteListCategories(args.include_counts)
      case "get_latest_projects":
        return await siteGetLatest(undefined, args.section)
      case "get_statistics":
        return await siteGetStatistics()
      case "search_contacts":
        return await searchContacts(args.query)
      case "get_video_sections":
        return await getVideoSections()
      case "search_videos":
        return await searchVideos({
          query: args.query || "",
          section: args.section,
          limit: args.limit
        })
      case "search_places":
        return await searchPlaces({
          query: args.query,
          category: args.category,
          city: args.city,
          near: args.near,
          limit: args.limit
        })
      case "get_prayer_times":
        return await getPrayerTimes({ date: args.date })
      default:
        return { success: false, error: `أداة غير معروفة: ${toolName}` }
    }
  } catch (error: any) {
    console.error(`[Tool Execution Error] ${toolName}:`, error)
    return { success: false, error: error.message || "حدث خطأ أثناء تنفيذ الأداة" }
  }
}

// ── تسخين الكاش عند بدء السيرفر ──────────────────────────────────────────────
Promise.all([getAllNews(), getAllAbbas(), getAllHistory(), getAllVideos(), getAllProjects()])
  .then(() => console.log("[Cache] Warm-up complete — news + sira + history + video + projects"))
