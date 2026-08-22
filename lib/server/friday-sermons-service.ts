/**
 * friday-sermons-service.ts — خطب الجمعة من جدول `friday_sermons`
 *
 * مصدر جديد أُضيف 2026-08-14: نصوص خطب جمعة كاملة (٤٦٢ خطبة وقت الإضافة)
 * لخطيبَين (`friday_preachers`: السيد أحمد الصافي، الشيخ عبد المهدي الكربلائي).
 *
 * ⚠️ **أرشيف متوقّف، لا مصدر حيّ**: تحقّقت مباشرة — أحدث خطبة مسجَّلة (`id=484`)
 * تاريخها الفعلي 28/02/2020م (`created_at` يؤكّد ذلك رغم أن `updated_at` أحدث
 * بكثير — ترحيل جماعي للبيانات، لا تحديث محتوى حقيقي). **لا خطب مسجَّلة بعد
 * هذا التاريخ إطلاقاً**. لذا لا يجوز أبداً وصف أحدث خطبة هنا بـ"الأخيرة" أو
 * "هذا الأسبوع" دون ذكر تاريخها الحقيقي صراحةً — التوجيه في system-prompts.ts
 * يُلزم النموذج بذلك.
 *
 * `id` يتوافق زمنياً مع `date` (تحقّقت: id=1 ⇐ 1432هـ، id=484 ⇐ 1441هـ) فـ
 * `ORDER BY id DESC` مكافئ لـ"الأحدث" فعلياً رغم أن `date` نصّ حرّ غير قابل
 * للفرز مباشرة (هجري+ميلادي بصيغ متفاوتة داخل الحقل نفسه).
 *
 * عمود `content` ملخّص قصير (~1,200 حرف) منفصل عن `first_sermon`/`second_sermon`
 * (النصّان الكاملان، ~15,000+ حرف لكل منهما) — الملخّص هو ما يُعاد هنا، تفادياً
 * لإغراق استجابة GPT بنصّ كامل غير ضروري لمعظم الأسئلة.
 *
 * `first_sermon_video_id`/`second_sermon_video_id` مفاتيح أجنبية حقيقية إلى
 * `video_files.id` (تحقّقت بربط مباشر) — رابط الفيديو يُبنى بنفس نمط
 * video-service.ts (`request` → mp4 مباشر)، لا تخميناً.
 */
import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

interface SermonRow extends RowDataPacket {
  id: number
  date: string | null
  title: string
  content: string | null
  first_sermon: string | null
  views: number
  preacher_title: string | null
  first_request: string | null
  second_request: string | null
}

function normalize(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يى]/g, "ي")
    .toLowerCase()
    .trim()
}

function sqlNormalizeTitle(col: string): string {
  const pairs: [string, string][] = [
    ["ـ", ""], ["ً", ""], ["ٌ", ""], ["ٍ", ""], ["َ", ""], ["ُ", ""], ["ِ", ""], ["ّ", ""], ["ْ", ""],
    ["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"], ["ى", "ي"],
  ]
  let expr = col
  for (const [from, to] of pairs) expr = `REPLACE(${expr}, '${from}', '${to}')`
  return `LOWER(${expr})`
}

function videoUrl(request: string | null): string | null {
  return request ? `https://static1.alkafeel.net/videos/${request}/${request}.mp4` : null
}

const MIN_LIMIT = 1
const MAX_LIMIT = 10
const DEFAULT_LIMIT = 5
const SUMMARY_MAX = 600

const SELECT_JOIN = `
  SELECT fs.id, fs.date, fs.title, fs.content, fs.first_sermon, fs.views,
         fp.title AS preacher_title,
         vf1.request AS first_request, vf2.request AS second_request
  FROM friday_sermons fs
  LEFT JOIN friday_preachers fp ON fp.id = fs.friday_preacher_id
  LEFT JOIN video_files vf1 ON vf1.id = fs.first_sermon_video_id
  LEFT JOIN video_files vf2 ON vf2.id = fs.second_sermon_video_id
`

async function runTier(
  db: ReturnType<typeof getPool>,
  whereSql: string,
  whereParams: any[],
  orderSql: string,
  orderParams: any[],
  limit: number
): Promise<{ rows: SermonRow[]; total: number }> {
  const [rows] = await db.execute<SermonRow[]>(
    `${SELECT_JOIN} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${limit}`,
    [...whereParams, ...orderParams]
  )
  // ⚠️ يجب أن يتضمّن نفس LEFT JOIN لـfriday_preachers الذي في SELECT_JOIN —
  // فحص حيّ كشف خطأ حقيقي (`Unknown column 'fp.title'`) حين أضيف فلتر
  // preacher (يشير إلى fp.title) بينما كان استعلام العدّ يفتقد الـJOIN كلياً.
  const [countRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM friday_sermons fs
     LEFT JOIN friday_preachers fp ON fp.id = fs.friday_preacher_id
     WHERE ${whereSql}`,
    whereParams
  )
  return { rows: rows as SermonRow[], total: Number((countRows as any[])[0]?.total ?? 0) }
}

/**
 * بحث في خطب الجمعة بعنوانها/موضوعها، مع فلترة اختيارية بالخطيب وترتيب
 * اختياري بالأكثر مشاهدة. بلا استعلام ⇒ أحدث الخطب افتراضياً (ORDER BY id
 * DESC — انظر شرح توافق id مع التاريخ أعلى الملف). خطوتان AND ثم OR كنظائرها.
 */
export async function searchFridaySermons(params: {
  query?: string
  preacher?: string
  sortBy?: "views" | "recent" | "oldest"
  limit?: number
}): Promise<APICallResult> {
  try {
    const db = getPool()
    const limit = Math.min(Math.max(params.limit || DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT)
    const tokens = Array.from(
      new Set(normalize(params.query || "").split(/\s+/).filter(w => w.length >= 3))
    )
    const titleNorm = sqlNormalizeTitle("fs.title")
    const baseWhere = "fs.deleted_at IS NULL"
    // فلتر الخطيب (اختياري) — يظهر نصّه دائماً **بعد** شرط الكلمات في نصّ كل
    // استعلام أدناه، فمعامله يُلحَق دوماً في نهاية مصفوفة WHERE-params
    // المطابقة لكل طبقة تحديداً (نفس انضباط §11.9/videos ضدّ خلل ترتيب
    // المعاملات الصامت).
    const preacherWhere = params.preacher ? " AND fp.title LIKE ?" : ""
    const preacherParams: any[] = params.preacher ? [`%${params.preacher}%`] : []
    // «الأكثر مشاهدة» — عمود views حقيقي (المدى الفعلي: 7,456–23,898 مشاهدة،
    // تحقّقت مباشرة) لم يكن له أي مسار ترتيب سابقاً، نفس فجوة §11.14/الفيديو.
    // ⚠️ «أول خطبة»/«أقدم خطبة» — لم يكن هناك أي خيار تصاعدي إطلاقاً (فقط
    // "views" أو الافتراضي id DESC)؛ فحص حيّ: سؤال "أول خطبة" أعاد فعلياً
    // أحدث خطبة (id=484) لأن الأداة لم تملك وسيلة لطلب الأقدم، فوصفها
    // النموذج خطأً بـ"الأولى" بلا أي معلومة صحيحة يبني عليها.
    const orderTail =
      params.sortBy === "views" ? "fs.views DESC" :
      params.sortBy === "oldest" ? "fs.id ASC" :
      "fs.id DESC"

    let tier: { rows: SermonRow[]; total: number }

    if (tokens.length > 0) {
      const andSql = tokens.map(() => `${titleNorm} LIKE ?`).join(" AND ")
      const andParams = tokens.map(t => `%${t}%`)
      tier = await runTier(
        db,
        `${baseWhere} AND (${andSql})${preacherWhere}`,
        [...andParams, ...preacherParams],
        orderTail,
        [],
        limit
      )

      if (tier.rows.length === 0) {
        const orSql = tokens.map(() => `${titleNorm} LIKE ?`).join(" OR ")
        const matchCount = tokens.map(() => `(${titleNorm} LIKE ?)`).join(" + ")
        const orParams = tokens.map(t => `%${t}%`)
        tier = await runTier(
          db,
          `${baseWhere} AND (${orSql})${preacherWhere}`,
          [...orParams, ...preacherParams],
          `(${matchCount}) DESC, ${orderTail}`,
          orParams,
          limit
        )
      }
    } else {
      tier = await runTier(db, `${baseWhere}${preacherWhere}`, preacherParams, orderTail, [], limit)
    }

    const results = tier.rows.map(r => {
      // ⚠️ عمود content (المُستعمَل كملخّص) فارغ في 55% من الخطب فعلياً
      // (207/462 فقط تحمل content) — كانت هذه الخطب تُعاد بـsummary: null
      // رغم توفّر first_sermon (النصّ الكامل) في 99% منها (456/462). عند
      // غياب content نستخرج ملخّصاً من بداية first_sermon بدلاً من ترك
      // الحقل فارغاً بلا داعٍ — تحقّقت حياً من عيّنات: بداية first_sermon في
      // هذه الحالات نصّ صحفي موضوعي مباشر (لا مقدّمة دينية نمطية تحتاج تخطّياً).
      const summarySource = r.content || r.first_sermon
      const summary = summarySource
        ? summarySource.replace(/<br\s*\/?>/g, " ").slice(0, SUMMARY_MAX).trim() + (summarySource.length > SUMMARY_MAX ? "…" : "")
        : null
      return {
        id: r.id,
        title: r.title?.trim() || "",
        date: r.date?.trim() || null,
        preacher: r.preacher_title || null,
        summary,
        views: r.views || 0,
        first_sermon_video_url: videoUrl(r.first_request),
        second_sermon_video_url: videoUrl(r.second_request),
      }
    })

    return {
      success: true,
      data: { results, total: tier.total, returned: results.length, query: params.query || "" },
    }
  } catch (error: any) {
    console.error("[DB Error - searchFridaySermons]:", error?.message)
    return { success: false, error: "تعذّر البحث في أرشيف خطب الجمعة" }
  }
}
