/**
 * search-engine.ts — ترشيح المرشّحين في قاعدة البيانات (بديل «حمّل كل شيء ثم فتّش»).
 *
 * ── المشكلة التي يحلّها ────────────────────────────────────────────────────
 * كان `siteSearch` يحمّل **كل** صفوف الأخبار (36,291) والفيديو (20,130) إلى ذاكرة
 * العملية ثم يحسب النقاط على 56,819 عنصراً في كل بحث. القياس الفعلي: 3.4–7.5 ثانية
 * لكل إقلاع بارد، و~2.3 ثانية لحلقة كل بحث، و250–400 ميغابايت لكل instance —
 * وكاش لكل instance يجعل الإجابات غير متّسقة.
 *
 * ── التصميم: رشِّح ثمّ أعد الترتيب (retrieve-then-rerank) ───────────────────
 *   المرحلة ١ — SQL: يرشّح المرشّحين (حتى CANDIDATE_LIMIT) بترتيب أوّلي رخيص
 *                     يحاكي أوزان scoreItem (العنوان أثقل من المتن).
 *   المرحلة ٢ — Node: **نفس `scoreItem` بلا تعديل حرف واحد** ترتّب المرشّحين.
 *
 * هذا هو شرط الأمان: خوارزمية الترتيب العربية المضبوطة (تطابق العبارة +15،
 * كلمة العنوان +8، الجذر +5، الهيكل الساكن +4، التقريبي +4) تبقى كما هي؛
 * ويتغيّر **مصدر مُدخلاتها** فقط. لذلك لا ينحدر ترتيب النتائج.
 *
 * ── المصادر الصغيرة ────────────────────────────────────────────────────────
 * السيرة (13) والتاريخ (27) والمشاريع (358) = 398 عنصراً فقط — تبقى في الذاكرة
 * كما هي، فلا مبرّر لتعقيد استعلاماتها.
 *
 * ── ملاحظة فهرسة (خطوة تشغيلية موصى بها) ──────────────────────────────────
 * الترشيح هنا يستعمل LIKE على أعمدة مُطبّعة داخل SQL، وهو مسح كامل للجدول.
 * لتسريعه أكثر يُنشأ عمود مُولَّد مفهرس بـ FULLTEXT/ngram:
 *   ALTER TABLE news ADD COLUMN search_norm TEXT GENERATED ALWAYS AS (...) STORED;
 *   CREATE FULLTEXT INDEX ft_news_norm ON news (search_norm) WITH PARSER ngram;
 * حتى ذلك الحين يبقى المسح في القاعدة أرخص بكثير من نقل الصفوف كلها إلى Node.
 */

import { getPool, RowDataPacket, normalizeArabicWord } from "./db"
import { mapNewsToItem, type NewsRow } from "./news-service"
import { mapVideoToItem, type VideoFileRow } from "./video-service"

/** سقف المرشّحين المسحوبين من كل مصدر قبل إعادة الترتيب. */
export const CANDIDATE_LIMIT = 400

/** شرط الرؤية الأساسي (متّسق مع analytics-service.BASE_WHERE). */
const NEWS_BASE_WHERE = "n.active = 1 AND n.deleted_at IS NULL"

// ─────────────────────────────────────────────────────────────────────────
// التطبيع داخل SQL — يطابق ما تفعله mapNewsToItem على جانب الذاكرة
// (تصغير + حذف التشكيل). كلها ثوابت لا مُدخلات مستخدم ⇒ لا حقن SQL.
// ─────────────────────────────────────────────────────────────────────────
const AR_DIACRITICS = ["ً", "ٌ", "ٍ", "َ", "ُ", "ِ", "ّ", "ْ", "ـ"]

function sqlNormalize(col: string): string {
  let expr = col
  for (const ch of AR_DIACRITICS) expr = `REPLACE(${expr}, '${ch}', '')`
  return `LOWER(${expr})`
}

/** يهرّب محارف البدل في LIKE (متّسق مع analytics-service.escapeLike). */
function escapeLike(term: string): string {
  return (term ?? "").replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")
}

/**
 * يوسّع كلمات الاستعلام إلى صيغ مطابِقة للحفاظ على الاسترجاع (recall).
 *
 * `scoreItem` تطابق على النصّ **وعلى جذور العنوان وهياكله الساكنة** المخزّنة في
 * searchText. في SQL لا نملك تلك المشتقّات، فنعوّضها بتوسيع الاستعلام نفسه:
 * لكل كلمة نضيف جذرها (بعد تجريد «ال» واللواحق)، فتُلتقط الصيغ الصرفية
 * («المشاريع» ↔ «مشاريع»). التوسيع على جانب الاستعلام لا على العمود ⇒ رخيص.
 */
export function expandQueryTerms(query: string): string[] {
  const normalized = (query || "")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .toLowerCase()
    .trim()
  if (!normalized) return []

  const out = new Set<string>()
  for (const w of normalized.split(/\s+/).filter(Boolean)) {
    if (w.length >= 2) out.add(w)
    const root = normalizeArabicWord(w)
    if (root && root.length >= 3 && root !== w) out.add(root)
  }
  return Array.from(out)
}

/** خيارات الترشيح المشتركة. */
export interface CandidateOpts {
  query?: string
  fromDate?: string
  toDate?: string
  type?: string
  sortBy?: string
  limit?: number
}

/**
 * يبني شرط OR على الصيغ الموسّعة لعمود واحد.
 *
 * الفضفضة مقصودة: `scoreItem` تقبل العنصر بمجرّد مطابقة كلمة واحدة (score ≥ 3)،
 * فلو شدّدنا هنا (AND) لخسرنا استرجاعاً مقارنةً بالمحرّك الحالي. الدقّة تأتي من
 * إعادة الترتيب لا من الترشيح.
 *
 * @param normalize هل يُطبَّع العمود داخل SQL؟ نُطبّع العنوان (عمود قصير، رخيص)
 *        ولا نُطبّع المتن (90 ميغابايت — التطبيع عليه يضاعف الزمن ٥ أضعاف،
 *        ونصّ الأخبار غير مُشكَّل عملياً فالعائد ضئيل).
 */
function buildOrClause(
  terms: string[],
  col: string,
  normalize: boolean
): { sql: string; params: any[] } {
  if (terms.length === 0) return { sql: "", params: [] }
  const expr = normalize ? sqlNormalize(col) : `LOWER(${col})`
  const ors: string[] = []
  const params: any[] = []
  for (const term of terms) {
    ors.push(`${expr} LIKE ?`)
    params.push(`%${escapeLike(term)}%`)
  }
  return { sql: `AND (${ors.join(" OR ")})`, params }
}

/** يدمج مجموعتَي مرشّحين ويُسقط المكرّر (حسب id) مع الحفاظ على الترتيب. */
function mergeUnique<T extends { id: any }>(a: T[], b: T[]): T[] {
  const seen = new Set<string>()
  const out: T[] = []
  for (const item of [...a, ...b]) {
    const k = String(item.id)
    if (seen.has(k)) continue
    seen.add(k)
    out.push(item)
  }
  return out
}

/** يبني شرط النافذة الزمنية (null-safe، متّسق مع analytics-service.windowClause). */
function dateClause(col: string, fromDate?: string, toDate?: string): { sql: string; params: any[] } {
  const from = fromDate ? `${fromDate} 00:00:00` : null
  const to = toDate ? `${toDate} 23:59:59` : null
  return {
    sql: `AND (? IS NULL OR ${col} >= ?) AND (? IS NULL OR ${col} <= ?)`,
    params: [from, from, to, to],
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (أ) مرشّحو الأخبار
// ─────────────────────────────────────────────────────────────────────────
export async function fetchNewsCandidates(opts: CandidateOpts): Promise<any[]> {
  const terms = expandQueryTerms(opts.query || "")
  const win = dateClause("n.created_at", opts.fromDate, opts.toDate)
  const typeSql = opts.type ? "AND nt.name = ?" : ""
  const typeParams = opts.type ? [opts.type] : []
  const perQuery = Math.min(Math.max(opts.limit || CANDIDATE_LIMIT, 1), 2000)

  const COLS = `n.id, n.title, n.title_2, n.image, n.content, n.views, n.photo_comment,
                n.active, n.category_id, n.type_id, nt.name AS type_name,
                n.created_at, n.updated_at`

  // ── الترتيب: لماذا id DESC؟ ────────────────────────────────────────────
  // `ORDER BY <تعبير محسوب>` أو `ORDER BY created_at` يُجبر MySQL على تقييم كل
  // الصفوف المطابقة (عشرات الآلاف) ثم فرزها قبل تطبيق LIMIT — قياس فعلي:
  // 1.3–3.6 ثانية. أمّا `ORDER BY n.id DESC` فيمشي على المفتاح الأساسي عكسياً
  // ويتوقّف فور بلوغ LIMIT — قياس فعلي: 89–176ms لنفس الاستعلامات.
  // النتيجة: نافذة المرشّحين = «أحدث N مطابقة»، وهي متّسقة مع فاصل الترجيح
  // القائم في siteSearch (الأحدث أولاً)، والترتيب النهائي يبقى لـ scoreItem.
  const order = (o?: string) =>
    o === "views" ? "n.views DESC" : o === "views_asc" ? "n.views ASC" : "n.id DESC"

  const runQuery = async (matchSql: string, matchParams: any[], rowLimit?: number) => {
    const sql = `
      SELECT ${COLS}
      FROM news n
      LEFT JOIN news_type nt ON nt.id = n.type_id
      WHERE ${NEWS_BASE_WHERE} ${matchSql} ${win.sql} ${typeSql}
      ORDER BY ${order(opts.sortBy)}
      LIMIT ${Math.min(Math.max(rowLimit ?? perQuery, 1), 2000)}
    `
    const [rows] = await getPool().execute<NewsRow[]>(sql, [
      ...matchParams,
      ...win.params,
      ...typeParams,
    ])
    return rows as NewsRow[]
  }

  // بلا كلمات بحث (فلاتر فقط) ⇒ استعلام واحد
  if (terms.length === 0) {
    return (await runQuery("", [])).map(mapNewsToItem)
  }

  // ── لماذا استعلامان بترتيبين مختلفين؟ ──────────────────────────────────
  // ملء النافذة بترتيب `id DESC` وحده يعني «أحدث المطابقات» لا «أفضلها»، وقد
  // أثبت القياس أثره: متوسط درجة scoreItem لأفضل ٥ هبط من 26.16 إلى 20.96،
  // وصارت النتائج من 2025 بدل 2022 — المرشّح الأفضل يقع خارج النافذة فلا يستطيع
  // المُرتِّب إنقاذه.
  //
  // العلاج: الاستعلام الأول يرتّب بـ**عدد كلمات الاستعلام الحاضرة في العنوان**،
  // وهي الإشارة المهيمنة في scoreItem (كل كلمة عنوان +8 مقابل +3 في المتن).
  // الترتيب محسوب على العنوان فقط (عمود قصير) فيبقى في حدود نصف ثانية، بخلاف
  // الترتيب على المتن المُطبّع (90 ميغابايت) الذي قيس بـ2–7 ثوانٍ.
  // والاستعلام الثاني شبكة استرجاع على المتن بترتيب حداثة وتوقّف مبكّر.
  const titleNorm = sqlNormalize("n.title")
  const titleRelevance = terms.map(() => `(${titleNorm} LIKE ?)`).join(" + ")
  const titlePats = terms.map(t => `%${escapeLike(t)}%`)

  const anyTitle = buildOrClause(terms, "n.title", true)
  const anyBody = buildOrClause(terms, "n.content", false)

  const byViews = opts.sortBy === "views" || opts.sortBy === "views_asc"
  const titleOrder = byViews ? order(opts.sortBy) : `(${titleRelevance}) DESC, n.id DESC`

  const titleSql = `
    SELECT ${COLS}
    FROM news n
    LEFT JOIN news_type nt ON nt.id = n.type_id
    WHERE ${NEWS_BASE_WHERE} ${anyTitle.sql} ${win.sql} ${typeSql}
    ORDER BY ${titleOrder}
    LIMIT 300
  `
  // ⚠️ ترتيب المعاملات يجب أن يطابق ترتيب ظهور علامات `?` في **نصّ** الاستعلام:
  //    WHERE (anyTitle) → النافذة الزمنية → النوع → ORDER BY (titleRelevance).
  // وضع معاملات ORDER BY أولاً يُزيح البقية فتلتقط النافذةُ أنماطَ LIKE بدل
  // التواريخ، فيفسد الترشيح بصمت (لا خطأ SQL — نتائج خاطئة فقط).
  const titleParams = byViews
    ? [...anyTitle.params, ...win.params, ...typeParams]
    : [...anyTitle.params, ...win.params, ...typeParams, ...titlePats]

  const [titleRowsRes, bodyRows] = await Promise.all([
    getPool().execute<NewsRow[]>(titleSql, titleParams).then(([r]) => r as NewsRow[]),
    runQuery(anyBody.sql, anyBody.params, 250),
  ])

  return mergeUnique(titleRowsRes, bodyRows).map(mapNewsToItem)
}

/**
 * أحدث تاريخ خبر متاح (YYYY-MM-DD) أو null.
 *
 * في وضع الذاكرة كان يُشتقّ من المصفوفة المحمّلة كاملةً؛ وفي وضع القاعدة لم تعد
 * تلك المصفوفة موجودة، فنستعلمه مباشرةً — كي تبقى رسالة «آخر تحديث لدينا هو…»
 * عند طلب فترة أحدث من البيانات تعمل كما كانت.
 */
export async function latestNewsDate(): Promise<string | null> {
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(MAX(n.created_at), '%Y-%m-%d') AS d FROM news n WHERE ${NEWS_BASE_WHERE}`
    )
    const d = (rows as any[])[0]?.d
    return d ? String(d) : null
  } catch (err) {
    console.error("[search-engine] latestNewsDate فشل:", err)
    return null
  }
}

// ─────────────────────────────────────────────────────────────────────────
// (ب) مرشّحو الفيديو
// ─────────────────────────────────────────────────────────────────────────
export async function fetchVideoCandidates(opts: CandidateOpts): Promise<any[]> {
  const terms = expandQueryTerms(opts.query || "")
  // عنوان/وصف الفيديو مخزّنان JSON — نستخرج العربية قبل المطابقة.
  const titleAr = `IFNULL(JSON_UNQUOTE(JSON_EXTRACT(vf.title, '$.ar')), '')`
  const capAr = `IFNULL(JSON_UNQUOTE(JSON_EXTRACT(vf.caption, '$.ar')), '')`
  const win = dateClause("vf.created_at", opts.fromDate, opts.toDate)
  const perQuery = Math.min(Math.max(opts.limit || CANDIDATE_LIMIT, 1), 2000)

  const COLS = `vf.id, vf.title, vf.caption, vf.image, vf.request, vf.video_section_id,
                vf.length, vf.active, vf.created_at,
                vs.title AS section_title, vs.request AS section_request`

  // نفس سبب اختيار id DESC في الأخبار: توقّف مبكّر على المفتاح الأساسي.
  const runQuery = async (matchSql: string, matchParams: any[]) => {
    const sql = `
      SELECT ${COLS}
      FROM video_files vf
      LEFT JOIN video_sections vs ON vs.id = vf.video_section_id
      WHERE vf.active = 1 AND vf.deleted_at IS NULL ${matchSql} ${win.sql}
      ORDER BY vf.id DESC
      LIMIT ${perQuery}
    `
    const [rows] = await getPool().execute<VideoFileRow[]>(sql, [...matchParams, ...win.params])
    return rows as VideoFileRow[]
  }

  if (terms.length === 0) {
    return (await runQuery("", [])).map(mapVideoToItem)
  }

  // العنوان مُطبّع (قصير) والوصف بلا تطبيع (أرخص) — كما في الأخبار.
  const titleClause = buildOrClause(terms, titleAr, true)
  const capClause = buildOrClause(terms, capAr, false)
  const [titleRows, capRows] = await Promise.all([
    runQuery(titleClause.sql, titleClause.params),
    runQuery(capClause.sql, capClause.params),
  ])

  return mergeUnique(titleRows, capRows).map(mapVideoToItem)
}
