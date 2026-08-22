/**
 * video-service.ts — مكتبة الفيديو من جداول `video_files` و `video_sections`
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool, excerpt, buildTitleExtras, parseJsonAr, fuzzyNorm } from "./db"

export interface VideoFileRow extends RowDataPacket {
  id: number
  title: string        // JSON
  caption: string | null  // JSON
  image: string | null  // filename of thumbnail
  request: string
  views?: number
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
    views: row.views ?? 0,
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
      // ⚠️ صفحة القسم/السلسلة مسارها /mediacat/ لا /media/ (ذاك مسار صفحة
      // فيديو مفرد، انظر mapVideoToItem أعلاه) — كانا يُخلَطان فيُنتج رابطاً
      // خاطئاً لا يعرض قائمة السلسلة. تأكّد المالك من المسار الصحيح حياً
      // بمثال حقيقي: https://alkafeel.net/mediacat/d0d55?lang=ar
      // (id=45 "النشرة بلغة الإشارة" — تحقّقت من تطابق request بالضبط).
      url: `https://alkafeel.net/mediacat/${r.request}?lang=ar`
    }))
    return { success: true, data: { sections, total: sections.length } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
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
  query?: string
  section?: string
  limit?: number
  sortBy?: "views" | "recent"
}): Promise<APICallResult> {
  const db = getPool()
  const limit = Math.min(Math.max(params.limit || 5, 1), 20)
  // عمود views موجود في video_files لكنه لم يكن يُستعمَل إطلاقاً (لا SELECT
  // ولا ORDER BY) — سؤال حيّ "ما أكثر فيديو مشاهدة؟" لم يكن له أي مسار
  // للإجابة عليه، فأضاف البوت اعتذاراً بدل البحث. نفس نمط sort_by
  // المُثبَت في search_content (relevance/views/views_asc).
  const orderByMain = params.sortBy === "views" ? "vf.views DESC" : "vf.created_at DESC"

  // تطبيع كلمات البحث: حذف التشكيل + توحيد الهمزات/التاء المربوطة/الألف
  // المقصورة (fuzzyNorm، مستخدَمة مسبقاً في contacts/kb/projects-db-service).
  // ⚠️ فحص حيّ حقيقي كشف الحاجة: "الحفل القرآني المرتل" لم يطابق العنوان
  // الفعلي "الختمة القرانية الرمضانية المرتلة" رغم التطابق الموضوعي الواضح —
  // "القرآني" (بهمزة الألف الممدودة) يختلف حرفياً عن "القرانية" (بألف عادية)
  // في القاعدة، و"المرتل" (مذكّر) يختلف عن "المرتلة" (مؤنّث، تاء زائدة) بسبب
  // تطابق الجنس النحوي. كان stripDiacritics() يحذف التشكيل فقط بلا توحيد حروف.
  //
  // ⚠️ query صار اختيارياً (كان إلزامياً في تعريف الأداة أيضاً): فحص حيّ كشف
  // أن سؤال "كم فيديو في سلسلة X؟" كان يُجبر النموذج على تكرار اسم السلسلة
  // في query أيضاً، فيشترط ظهور كل كلمة منه حرفياً في عنوان/وصف **كل** فيديو
  // (فوق شرط القسم نفسه) — أنقص العدّ الحقيقي 57 إلى 43 بلا داعٍ. الحقل
  // الفارغ سابقاً كان "يعمل" بالصدفة فقط (نمط "%  %" يطابق caption الفارغ
  // NULL→'' تلقائياً بلا قصد) — سلوك هشّ غير موثوق، استُبدل بفرع صريح هنا.
  const words = fuzzyNorm((params.query || "").trim()).split(/\s+/).filter(w => w.length > 1)
  const searchWords = words

  // دالة مساعدة: SQL يطبّق نفس تطبيع fuzzyNorm (تشكيل + همزات + تاء مربوطة +
  // ألف مقصورة) ويلف النص بمسافات لمطابقة حدود الكلمات — يجب أن يطابق تماماً
  // ما يُطبَّق على كلمات البحث في JS وإلا ينكسر التطابق بصمت.
  const stripped = (col: string) => {
    let expr = `IFNULL(JSON_UNQUOTE(JSON_EXTRACT(${col}, '$.ar')), '')`
    expr = `REGEXP_REPLACE(${expr}, '[ًٌٍَُِّْٰـ]', '')`
    for (const [from, to] of [["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"], ["ى", "ي"]]) {
      expr = `REPLACE(${expr}, '${from}', '${to}')`
    }
    return `CONCAT(' ', ${expr}, ' ')`
  }

  try {
    // بناء فلتر القسم إذا طُلب — نصّ SQL وقيمته منفصلان عمداً عن معاملات
    // الكلمات، إذ يظهر sectionWhere **بعد** شرط الكلمات دائماً في نصّ كل
    // استعلام أدناه؛ معامله يُلحَق دوماً في نهاية مصفوفة WHERE-params
    // المطابقة لكل طبقة تحديداً، لا في مكان ثابت — تفادياً لخلل ترتيب
    // المعاملات الصامت (انظر §11.2/search-engine.ts).
    const sectionJoin = `LEFT JOIN video_sections vs ON vs.id = vf.video_section_id`
    const sectionWhere = params.section ? `AND JSON_UNQUOTE(JSON_EXTRACT(vs.title, '$.ar')) LIKE ?` : ""
    const sectionParams: any[] = params.section ? [`%${params.section}%`] : []

    // بلا كلمات بحث إطلاقاً (query فارغ/غائب) ⇒ طبقة واحدة: القسم فقط (أو
    // كل الفيديوهات النشطة إن غاب أيضاً)، بلا أي شرط عنوان/وصف — يجيب بدقّة
    // على "كم فيديو في هذه السلسلة؟" بلا تضييق نصّي غير مقصود.
    if (searchWords.length === 0) {
      const [countRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM video_files vf
         ${sectionJoin}
         WHERE vf.active = 1 AND vf.deleted_at IS NULL
         ${sectionWhere}`,
        sectionParams
      )
      const total = Number((countRows as any[])[0]?.total ?? 0)

      const [rows] = await db.query<VideoFileRow[]>(
        `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request, vf.views,
                vf.video_section_id, vf.length, vf.active, vf.created_at,
                vs.title as section_title, vs.request as section_request
         FROM video_files vf
         ${sectionJoin}
         WHERE vf.active = 1 AND vf.deleted_at IS NULL
         ${sectionWhere}
         ORDER BY ${orderByMain}
         LIMIT ?`,
        [...sectionParams, limit]
      )
      const results = (rows as VideoFileRow[]).map(mapVideoToItem)
      return { success: true, data: { results, total, returned: results.length, query: params.query || "" } }
    }

    // بناء شرط AND لكل كلمة — يبحث في العنوان والوصف بعد حذف التشكيل
    const wordConditions = searchWords.map(() =>
      `(${stripped("vf.title")} LIKE ? OR ${stripped("vf.caption")} LIKE ?)`
    ).join(" AND ")

    const bindParams: any[] = []
    for (const w of searchWords) {
      bindParams.push(`% ${w} %`, `% ${w} %`)
    }
    bindParams.push(...sectionParams)

    // ⚠️ COUNT(*) حقيقي بمعزل عن LIMIT — كان `total: results.length` يُعيد
    // طول المصفوفة **المُقتَصّة** (الافتراضي 5) لا العدد الحقيقي. فحص حيّ
    // حقيقي: سلسلة "النشرة بلغة الإشارة" تحوي 57 فيديو فعلياً، لكن `total`
    // كانت تُعيد 10 (= limit الذي مرّره النموذج) — نفس فصيلة خلل «العدد
    // المضلّل» في §11.2 (search_content) و§11.7 (search_publications)، يتكرر
    // هنا للمرّة الثالثة. whereParams منفصلة عن limit عمداً كي يبقى COUNT
    // بلا حدّ صفوف.
    const [andCountRows] = await db.query<RowDataPacket[]>(
      `SELECT COUNT(*) AS total FROM video_files vf
       ${sectionJoin}
       WHERE vf.active = 1 AND vf.deleted_at IS NULL
         AND (${wordConditions})
       ${sectionWhere}`,
      bindParams
    )
    const andTotal = Number((andCountRows as any[])[0]?.total ?? 0)

    const [rows] = await db.query<VideoFileRow[]>(
      `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request, vf.views,
              vf.video_section_id, vf.length, vf.active, vf.created_at,
              vs.title as section_title, vs.request as section_request
       FROM video_files vf
       ${sectionJoin}
       WHERE vf.active = 1 AND vf.deleted_at IS NULL
         AND (${wordConditions})
       ${sectionWhere}
       ORDER BY ${orderByMain}
       LIMIT ?`,
      [...bindParams, limit]
    )

    // إذا لم توجد نتائج بـ AND، نجرّب OR بين الكلمات المميّزة معاً (لا كلمة
    // واحدة فقط في كل مرّة — ذاك كان يُرجع أول كلمة تُصادف نتيجة **بلا** ترتيب
    // حسب عدد الكلمات المطابقة فعلياً، فقد يفوز فيديو يطابق كلمة عامة واحدة
    // على الفيديو الحقيقي الذي يطابق أغلب كلمات الاستعلام). نفس نمط الترتيب
    // بعدد المطابقات المُثبَت في publications-service.ts/lost-items-service.ts.
    if ((rows as VideoFileRow[]).length === 0 && searchWords.length > 1) {
      // فلتر كلمات السياق (ألقاب، طلبات، أنواع) لتبقى الكلمات المميزة فقط
      const distinctiveWords = searchWords.filter(w => !CONTEXT_WORDS.has(w))
      const wordsToTry = distinctiveWords.length > 0 ? distinctiveWords : searchWords

      // كلمة كافية الطول (٤+ أحرف) ⇒ مطابقة بادئة (prefix) لا كلمة كاملة —
      // تلتقط اختلاف اللواحق النحوية (المرتل/المرتلة، مذكّر/مؤنّث) بأمان:
      // البادئة مربوطة بحدّ كلمة يسارياً فقط (لا تصادم مثل خلل "لا" في
      // §11.8/lost-items، إذ لا تطابق وسط الكلمة إطلاقاً). كلمات قصيرة
      // (٢-٣ أحرف، حروف جر/عطف شائعة) تبقى بمطابقة كلمة كاملة صارمة.
      const patterns = wordsToTry.map(w => (w.length >= 4 ? `% ${w}%` : `% ${w} %`))

      const orConds = patterns.map(() => `(${stripped("vf.title")} LIKE ? OR ${stripped("vf.caption")} LIKE ?)`)
      const matchCountExpr = patterns.map(() => `(${stripped("vf.title")} LIKE ? OR ${stripped("vf.caption")} LIKE ?)`).join(" + ")

      const whereParams: any[] = []
      for (const p of patterns) whereParams.push(p, p)
      whereParams.push(...sectionParams)
      const orderParams: any[] = []
      for (const p of patterns) orderParams.push(p, p)

      const [orCountRows] = await db.query<RowDataPacket[]>(
        `SELECT COUNT(*) AS total FROM video_files vf
         ${sectionJoin}
         WHERE vf.active = 1 AND vf.deleted_at IS NULL
           AND (${orConds.join(" OR ")})
         ${sectionWhere}`,
        whereParams
      )
      const orTotal = Number((orCountRows as any[])[0]?.total ?? 0)

      const [orRows] = await db.query<VideoFileRow[]>(
        `SELECT vf.id, vf.title, vf.caption, vf.image, vf.request, vf.views,
                vf.video_section_id, vf.length, vf.active, vf.created_at,
                vs.title as section_title, vs.request as section_request
         FROM video_files vf
         ${sectionJoin}
         WHERE vf.active = 1 AND vf.deleted_at IS NULL
           AND (${orConds.join(" OR ")})
         ${sectionWhere}
         ORDER BY (${matchCountExpr}) DESC, ${orderByMain}
         LIMIT ?`,
        [...whereParams, ...orderParams, limit]
      )

      if ((orRows as VideoFileRow[]).length > 0) {
        const results = (orRows as VideoFileRow[]).map(mapVideoToItem)
        return { success: true, data: { results, total: orTotal, returned: results.length, query: params.query } }
      }
    }

    const results = (rows as VideoFileRow[]).map(mapVideoToItem)
    return {
      success: true,
      data: { results, total: andTotal, returned: results.length, query: params.query }
    }
  } catch (error: any) {
    console.error("[DB Error - searchVideos]:", error?.message)
    return { success: false, error: "تعذر البحث في قاعدة بيانات الفيديو" }
  }
}
