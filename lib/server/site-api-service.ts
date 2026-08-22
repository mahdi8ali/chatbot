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
import {
  fetchNewsCandidates,
  fetchVideoCandidates,
  latestNewsDate,
  CANDIDATE_LIMIT,
} from "./search-engine"

export type { APICallResult }

// ── re-export للمستخدمين الخارجيين (route.ts لا يستوردها مباشرة لكن للتوافق) ──
export { searchContacts, getVideoSections, siteListCategories, siteGetLatest, siteGetStatistics }

// ── البحث الموحّد عبر كل المصادر ─────────────────────────────────────────────
/**
 * محرّك البحث المستعمَل:
 *   "db"     — ترشيح المرشّحين في SQL ثم إعادة ترتيبهم بـ scoreItem (الافتراضي)
 *   "memory" — السلوك القديم: تحميل كل المصادر إلى الذاكرة وحساب النقاط عليها
 *
 * يبقى الوضع القديم متاحاً للتراجع الفوري وللمقارنة في `npm run eval`.
 */
function searchEngineMode(): "db" | "memory" {
  return process.env.SEARCH_ENGINE === "memory" ? "memory" : "db"
}

export async function siteSearch(
  query?: string,
  section?: string,
  limit: number = 5,
  source?: string,
  fromDate?: string,
  toDate?: string,
  type?: string,
  sortBy?: string
): Promise<APICallResult> {
  const t0 = Date.now()

  // عند الترتيب حسب المشاهدات بدون تحديد مصدر → افتراضياً أخبار فقط
  const effectiveSource = source || ((sortBy === "views" || sortBy === "views_asc") ? "news" : undefined)

  const wantNews     = !effectiveSource || effectiveSource === "news"
  const wantSira     = !effectiveSource || effectiveSource === "sira"
  const wantHistory  = !effectiveSource || effectiveSource === "history"
  const wantVideo    = !effectiveSource || effectiveSource === "video"
  const wantProjects = !effectiveSource || effectiveSource === "project"

  const useDb = searchEngineMode() === "db"
  const EMPTY = Promise.resolve<APICallResult>({ success: true, data: [] })

  // المصادر الكبيرة (أخبار 36k + فيديو 20k): تُرشَّح في SQL عند وضع "db".
  // المصادر الصغيرة (سيرة 13 + تاريخ 27 + مشاريع 358 = 398): تبقى في الذاكرة —
  // لا مبرّر لتعقيد استعلاماتها، وتحميلها زهيد.
  const candidateOpts = { query, fromDate, toDate, type, sortBy }

  const [newsResult, abbasResult, historyResult, videoResult, projectsResult] = await Promise.all([
    wantNews
      ? useDb
        ? fetchNewsCandidates(candidateOpts).then(data => ({ success: true, data } as APICallResult))
        : getAllNews()
      : EMPTY,
    wantSira     ? getAllAbbas()     : EMPTY,
    wantHistory  ? getAllHistory()   : EMPTY,
    wantVideo
      ? useDb
        ? fetchVideoCandidates(candidateOpts).then(data => ({ success: true, data } as APICallResult))
        : getAllVideos()
      : EMPTY,
    wantProjects ? getAllProjects()  : EMPTY,
  ])
  console.log(`[Timing] getAllSources (${useDb ? "db" : "memory"}): ${Date.now() - t0}ms`)

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

  // فلترة حسب النطاق الزمني (إذا حُدّد)
  let dateFiltered = allData
  if (fromDate || toDate) {
    const fromTs = fromDate ? new Date(fromDate).getTime() : 0
    const toTs = toDate ? new Date(toDate + "T23:59:59").getTime() : Infinity
    dateFiltered = allData.filter(item => {
      const ts = item.created_at_ts || (item.created_at ? new Date(item.created_at).getTime() : 0)
      return ts >= fromTs && ts <= toTs
    })
  }

  // فلترة حسب نوع المحتوى (إذا حُدّد)
  if (type) {
    dateFiltered = dateFiltered.filter(item =>
      (item.type_name || "").toLowerCase() === type.toLowerCase()
    )
  }

  const t1 = Date.now()
  // نحسب كل المطابقات أولاً (قبل القصّ) — ليكون العدد الحقيقي متاحاً لأسئلة "كم عدد..."
  let matched = dateFiltered
    .map(item => ({ item, score: scoreItem(item, words, wordRoots, wordSkeletons, safeQuery, sectionLower) }))
    .filter(x => (words.length ? x.score >= 3 : true))
    .sort((a, b) => {
      // ترتيب حسب المشاهدات إذا طُلب
      if (sortBy === "views") {
        return (b.item.views || 0) - (a.item.views || 0)
      }
      if (sortBy === "views_asc") {
        return (a.item.views || 0) - (b.item.views || 0)
      }
      // الترتيب الافتراضي: الصلة ثم التاريخ
      if (b.score !== a.score) return b.score - a.score
      return (b.item.created_at_ts || 0) - (a.item.created_at_ts || 0)
    })

  // إذا لم توجد نتائج وكان الفلتر بالـ type فقط (بدون كلمة بحث مطابقة) → أرجع كل عناصر النوع
  if (matched.length === 0 && type && dateFiltered.length > 0) {
    matched = dateFiltered
      .map(item => ({ item, score: 1 }))
      .sort((a, b) => (b.item.created_at_ts || 0) - (a.item.created_at_ts || 0))
  }

  const scored = matched
    .slice(0, Math.min(Math.max(limit || 2, 1), 20))
    .map(x => x.item)

  // ── حقل total: عدد المرشّحين المطابقين، لا «عدد الأخبار عن الموضوع» ───────
  //
  // كان total يساوي عدد كل ما تجاوز عتبة scoreItem (≥3) على **كامل** القاعدة —
  // أي «ورد فيه أي كلمة من الاستعلام». القياس على 149 سؤالاً حقيقياً: وسيط
  // 44,155 من أصل 56,819، و147 سؤالاً تتجاوز الألف. وكان الموجّه يأمر النموذج
  // بعرض هذا الرقم كـ«عدد الأخبار عن الموضوع» ⇒ أرقام بلا معنى باسم العتبة.
  //
  // التشخيص الصحيح: search_content أداة **استرجاع** لا أداة عدّ. العدّ له أدواته
  // المخصّصة (count_news / count_mentions) بدلالة صارمة وحقل basis يوضّح التقريبية.
  // لذلك: total هنا = عدد المرشّحين المطابقين ضمن النافذة، مع علم `truncated`
  // حين تمتلئ النافذة (فقد يوجد المزيد). والموجّه حُدِّث ليوجّه أسئلة العدّ لـ count_news.
  const totalMatches = matched.length
  const truncated = useDb && allData.length >= CANDIDATE_LIMIT

  console.log(`[Timing] siteSearch loop (${dateFiltered.length} items): ${Date.now() - t1}ms → ${scored.length}/${totalMatches} matches`)

  // عند تحديد نطاق زمني وعدم وجود نتائج: أرجع آخر تاريخ متاح في القاعدة
  let latestAvailable: string | undefined
  if ((fromDate || toDate) && scored.length === 0) {
    if (useDb) {
      // في وضع القاعدة لم تعد المصفوفة الكاملة موجودة ⇒ نستعلم التاريخ مباشرةً
      latestAvailable = (await latestNewsDate()) || undefined
    } else {
      const allWithDates = allData
        .filter(item => item.created_at_ts > 0)
        .sort((a, b) => (b.created_at_ts || 0) - (a.created_at_ts || 0))
      if (allWithDates.length > 0) {
        const d = new Date(allWithDates[0].created_at_ts)
        latestAvailable = d.toISOString().split("T")[0] // YYYY-MM-DD
      }
    }
  }

  return {
    success: true,
    data: {
      results: scored,
      total: totalMatches,
      returned: scored.length,
      // علم صريح: نافذة المرشّحين امتلأت ⇒ total ليس عدداً شاملاً.
      // يمنع النموذج من تقديمه كإحصاء («وجدتُ 400 خبراً»).
      ...(truncated && { total_is_partial: true }),
      query: safeQuery || section || "",
      date_range: fromDate || toDate ? { from: fromDate || null, to: toDate || null } : undefined,
      ...(latestAvailable && { latest_available: latestAvailable }),
    }
  }
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
      case "search_content":
        return await siteSearch(args.query, args.section, args.limit, args.source, args.from_date, args.to_date, args.type, args.sort_by)
      case "get_content_by_id":
        return await siteGetProject(args.id)
      case "list_news_categories":
        return await siteListCategories(args.include_counts)
      case "get_latest_news":
        return await siteGetLatest(undefined, args.section)
      case "get_content_statistics":
        return await siteGetStatistics()
      case "search_contacts":
        return await searchContacts(args.query)
      case "get_video_sections":
        return await getVideoSections()
      case "search_videos":
        return await searchVideos({
          query: args.query || "",
          section: args.section,
          limit: args.limit,
          sortBy: args.sort_by
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
// في وضع "db" لا نُسخّن الأخبار (36k صفّاً) ولا الفيديو (20k) — فهما يُرشَّحان في
// SQL عند الطلب. القياس قبل التغيير: 3.4–7.5 ثانية على كل إقلاع بارد لمجرّد
// تحميلهما. تبقى المصادر الصغيرة (398 عنصراً) مُسخّنة لأنها زهيدة ويعتمد عليها
// البحث الموحّد في الذاكرة.
if (process.env.SEARCH_ENGINE === "memory") {
  Promise.all([getAllNews(), getAllAbbas(), getAllHistory(), getAllVideos(), getAllProjects()])
    .then(() => console.log("[Cache] Warm-up complete (memory engine) — all sources"))
    .catch(err => console.error("[Cache] Warm-up failed:", err))
} else {
  Promise.all([getAllAbbas(), getAllHistory(), getAllProjects()])
    .then(() => console.log("[Cache] Warm-up complete (db engine) — sira + history + projects only"))
    .catch(err => console.error("[Cache] Warm-up failed:", err))
}
