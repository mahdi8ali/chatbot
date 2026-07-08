/**
 * analytics-service.ts — أدوات تحليل المحتوى (content-analytics-tools)
 *
 * وحدة خدمة مستقلة تُنفّذ التجميع (aggregation) فوق بيانات الأخبار (جدول `news`)
 * عبر SQL معلّم (parameterized): COUNT، GROUP BY، شرط مدى زمني على `created_at`،
 * ومطابقة LIKE على `title + content`. الدقّة تتم في قاعدة البيانات لا على كاش جزئي.
 *
 * هذا الملف — في هذه المرحلة — يعرّف الأنواع المشتركة وأشكال النتائج فقط؛
 * أمّا مُحلّل الفترة والمساعدات الداخلية ودوال التجميع فتأتي في مهام لاحقة.
 *
 * التزامات حاكمة:
 * - الأمان: كل قيم المستخدم تُمرَّر كمعاملات `?` — لا إقحام نصّي في SQL.
 * - الصدق: النتيجة تحمل `total` (العدد الحقيقي الكامل) و`basis` لتوضيح التقريبية.
 * - القابلية للعكس: ملف مستقل لا يلمس منطق الكاش القائم في news-service.
 *
 * توصية فهرسة (خطوة تشغيلية غير حاصرة — Requirement 11.1):
 * كل الاستعلامات ترشّح على مدى زمني على `created_at` وعلى شرط الأساس
 * (`active = 1 AND deleted_at IS NULL`). يُوصى بإضافة فهرس على `created_at`
 * ويفضّل فهرس مركّب `(active, deleted_at, created_at)` لتسريع الترشيح معاً:
 *   CREATE INDEX idx_news_active_deleted_created ON news (active, deleted_at, created_at);
 */

import { getPool, RowDataPacket } from "./db"

// ── مواصفة الفترة الزمنية (مُدخل مُوحّد) ──────────────────────────────
// إمّا فترة نسبية (period) أو مدى صريح (from/to بصيغة YYYY-MM-DD).
export interface PeriodSpec {
  period?: "day" | "week" | "month" | "quarter" | "year" | "all"
  lastDays?: number        // «آخر N يوماً» — مثال: 30
  from?: string            // YYYY-MM-DD (مدى صريح)
  to?: string              // YYYY-MM-DD (مدى صريح)
}

// ── نافذة زمنية مُحلّلة جاهزة للـ SQL ──────────────────────────────────
export interface ResolvedWindow {
  from: string | null      // "YYYY-MM-DD 00:00:00" أو null (بلا حدّ سفلي)
  to: string | null        // "YYYY-MM-DD 23:59:59" أو null (بلا حدّ علوي)
  label: string            // وصف بشري: «آخر 30 يوماً»
}

export type Granularity = "day" | "week" | "month"

// ── أساس القياس (للصدق في الصياغة) ────────────────────────────────────
// basis يوضّح للمساعد أن الرقم مبني على مطابقة كلمات، لا سجلّ رسمي.
export interface AnalyticsBasis {
  method: "keyword_match"          // مطابقة LIKE على title/content
  fields: ("title" | "content")[]
  note: string                     // نص عربي جاهز يشرح التقريبية
}

// ── نتيجة count_mentions ──────────────────────────────────────────────
export interface CountMentionsResult {
  success: boolean
  data?: {
    query: string
    total: number            // العدد الحقيقي الكامل للمطابقات في النافذة
    window: ResolvedWindow
    basis: AnalyticsBasis
    sample?: Array<{ id: number; title: string; created_at: string; url: string }>
    latest_available?: string  // أحدث created_at (YYYY-MM-DD) — يُرفَق فقط عند total=0 بنافذة محدّدة (التغيير 8)
    no_data_in_window?: boolean // النافذة لاحقة كلياً لأحدث بيانات القاعدة (تمييز «لا بيانات» عن «لا ذكر»)
  }
  error?: string
}

// ── نتيجة mentions_timeline ───────────────────────────────────────────
export interface TimelineResult {
  success: boolean
  data?: {
    query: string
    granularity: Granularity
    window: ResolvedWindow
    buckets: Array<{ bucket: string; count: number }>  // مرتّبة تصاعدياً
    total: number
    basis: AnalyticsBasis
  }
  error?: string
}

// ── نتيجة top_topics ──────────────────────────────────────────────────
export interface TopTopicsResult {
  success: boolean
  data?: {
    window: ResolvedWindow
    dimension: "category" | "keyword"
    items: Array<{ label: string; category_id?: number; count: number }>
    basis?: AnalyticsBasis
  }
  error?: string
}

// ── نتيجة count_news ──────────────────────────────────────────────────
export interface CountNewsResult {
  success: boolean
  data?: {
    total: number
    window: ResolvedWindow
    category_id?: number | null
    query_used?: string
    basis?: AnalyticsBasis      // يُرفَق عند العدّ بكلمة (query) لتوضيح أن الرقم تقريبي (التغيير 2)
    latest_available?: string   // أحدث created_at (YYYY-MM-DD) عند total=0 بنافذة محدّدة (التغيير 8)
    no_data_in_window?: boolean // النافذة لاحقة كلياً لأحدث بيانات القاعدة (التغيير 8)
  }
  error?: string
}

// ─────────────────────────────────────────────────────────────────────
// مُحلّل الفترة الزمنية (Period Resolver) — دالة نقية حتمية
// ─────────────────────────────────────────────────────────────────────
//
// افتراض المنطقة الزمنية (Timezone assumption):
// يُخزّن العمود `created_at` في قاعدة البيانات بتوقيت الخادم (server-local).
// لذلك تُبنى تواريخ SQL هنا من المكوّنات المحلّية (local components) للتاريخ
// المُمرَّر (`now`)، لضمان الاتّساق مع ما هو مخزّن. لا نستخدم UTC ولا نحوّل
// المناطق الزمنية — نعتمد اتّساق توقيت الخادم بين هذه الطبقة وقاعدة البيانات.
//
// حتمية (deterministic): الدالة تعتمد حصراً على `now` المُمرَّرة ولا تستدعي
// `Date.now()` داخلياً، فيكون ناتجها قابلاً لإعادة الإنتاج والاختبار.

/** حدود قصّ عدد الأيام الأخيرة (lastDays). */
const MIN_LAST_DAYS = 1
const MAX_LAST_DAYS = 3650

/** يُصفّر مكوّنات الوقت إلى بداية اليوم المحلّي (00:00:00.000). */
function startOfDay(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
  return r
}

/** يضبط مكوّنات الوقت إلى نهاية اليوم المحلّي (23:59:59.000). */
function endOfDay(d: Date): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 0)
  return r
}

/** يُعيد تاريخاً جديداً مُزاحاً بعدد أيام (موجب/سالب) عن التاريخ المُمرَّر. */
function addDays(d: Date, days: number): Date {
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), 0)
  r.setDate(r.getDate() + days)
  return r
}

/** حشو رقم إلى خانتين (أو أكثر) بأصفار على اليسار. */
function pad(n: number, width = 2): string {
  return String(Math.abs(n)).padStart(width, "0")
}

/**
 * يُنسّق تاريخاً إلى سلسلة SQL بصيغة "YYYY-MM-DD HH:MM:SS" باستخدام
 * المكوّنات المحلّية للتاريخ (اتّساقاً مع افتراض توقيت الخادم أعلاه).
 */
function formatSqlDateTime(d: Date): string {
  const year = pad(d.getFullYear(), 4)
  const month = pad(d.getMonth() + 1)
  const day = pad(d.getDate())
  const hours = pad(d.getHours())
  const minutes = pad(d.getMinutes())
  const seconds = pad(d.getSeconds())
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/** يتحقّق أن السلسلة بصيغة YYYY-MM-DD وتُمثّل تاريخاً تقويمياً صالحاً. */
function isValidDateString(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  if (m < 1 || m > 12 || d < 1 || d > 31) return false
  // تحقّق تقويمي: إعادة بناء التاريخ ومطابقة المكوّنات (يرفض مثل 2024-02-31).
  const dt = new Date(y, m - 1, d)
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d
}

/** خريطة الفترات النسبية إلى عدد الأيام الأخيرة ووصفها العربي. */
const RELATIVE_PERIODS: Record<string, { days: number; label: string }> = {
  day: { days: 0, label: "اليوم" },
  week: { days: 7, label: "آخر 7 أيام" },
  month: { days: 30, label: "آخر 30 يوماً" },
  quarter: { days: 90, label: "آخر 90 يوماً" },
  year: { days: 365, label: "آخر 365 يوماً" },
}

/** النافذة الافتراضية الآمنة (شهر) عند القيم غير الصالحة أو المتعارضة. */
function defaultWindow(now: Date): ResolvedWindow {
  return relativeWindow(now, RELATIVE_PERIODS.month.days, RELATIVE_PERIODS.month.label)
}

/**
 * يبني نافذة نسبية: from = بداية اليوم قبل `days` يوماً من now،
 * to = نهاية يوم now. (days = 0 يعني «اليوم» فقط.)
 */
function relativeWindow(now: Date, days: number, label: string): ResolvedWindow {
  const from = startOfDay(addDays(now, -days))
  const to = endOfDay(now)
  return { from: formatSqlDateTime(from), to: formatSqlDateTime(to), label }
}

/**
 * يحوّل PeriodSpec إلى نافذة {from, to, label} بصيغة تواريخ SQL بشكل حتمي.
 *
 * أولوية الحلّ: from/to الصريحة ← ثم lastDays ← ثم period.
 * - from/to صريحان (YYYY-MM-DD): from → "... 00:00:00"، to → "... 23:59:59".
 * - lastDays = N: يُقصّ ضمن [1, 3650]؛ from = بداية اليوم قبل N يوماً، to = نهاية اليوم.
 * - period: day=اليوم، week=7، month=30، quarter=90، year=365، all={null,null}.
 * - "all" أو غياب كل الحقول → {from:null, to:null, label:"كل الفترات"}.
 * - قيم غير صالحة/متعارضة → افتراضي آمن (شهر) مع console.warn (لا رمي استثناء).
 * - نافذة فارغة (from > to) → تُعاد نافذة بـ label يوضّح غياب البيانات.
 *
 * @param spec مواصفة الفترة الزمنية.
 * @param now التاريخ المرجعي (يُمرَّر للاختبار الحتمي؛ افتراضه new Date()).
 */
export function resolvePeriod(spec: PeriodSpec, now: Date = new Date()): ResolvedWindow {
  const s: PeriodSpec = spec || {}

  // ── (1) أولوية عليا: مدى صريح from/to ────────────────────────────────
  const hasFrom = typeof s.from === "string" && s.from.trim() !== ""
  const hasTo = typeof s.to === "string" && s.to.trim() !== ""
  if (hasFrom || hasTo) {
    const fromValid = !hasFrom || isValidDateString(s.from!.trim())
    const toValid = !hasTo || isValidDateString(s.to!.trim())

    if (!fromValid || !toValid) {
      console.warn(
        `[analytics] resolvePeriod: تاريخ صريح غير صالح (from="${s.from}", to="${s.to}") — استخدام الافتراضي الآمن (شهر).`
      )
      return defaultWindow(now)
    }

    const from = hasFrom ? `${s.from!.trim()} 00:00:00` : null
    const to = hasTo ? `${s.to!.trim()} 23:59:59` : null

    // نافذة فارغة: from > to (المقارنة اللفظية صحيحة لصيغة ثابتة العرض).
    if (from !== null && to !== null && from > to) {
      return {
        from,
        to,
        label: `نطاق زمني غير صالح (من ${s.from!.trim()} إلى ${s.to!.trim()}) — لا توجد بيانات`,
      }
    }

    let label: string
    if (from !== null && to !== null) {
      label = `الفترة من ${s.from!.trim()} إلى ${s.to!.trim()}`
    } else if (from !== null) {
      label = `منذ ${s.from!.trim()}`
    } else {
      label = `حتى ${s.to!.trim()}`
    }
    return { from, to, label }
  }

  // ── (2) lastDays ─────────────────────────────────────────────────────
  if (s.lastDays !== undefined && s.lastDays !== null) {
    const raw = Number(s.lastDays)
    if (!Number.isFinite(raw)) {
      console.warn(
        `[analytics] resolvePeriod: قيمة lastDays غير صالحة ("${s.lastDays}") — استخدام الافتراضي الآمن (شهر).`
      )
      return defaultWindow(now)
    }
    const n = Math.min(MAX_LAST_DAYS, Math.max(MIN_LAST_DAYS, Math.round(raw)))
    return relativeWindow(now, n, `آخر ${n} يوماً`)
  }

  // ── (3) period ───────────────────────────────────────────────────────
  if (s.period !== undefined && s.period !== null) {
    if (s.period === "all") {
      return { from: null, to: null, label: "كل الفترات" }
    }
    const preset = RELATIVE_PERIODS[s.period as string]
    if (preset) {
      return relativeWindow(now, preset.days, preset.label)
    }
    console.warn(
      `[analytics] resolvePeriod: قيمة period غير معروفة ("${s.period}") — استخدام الافتراضي الآمن (شهر).`
    )
    return defaultWindow(now)
  }

  // ── (4) لا حقول إطلاقاً → بلا قيود زمنية ──────────────────────────────
  return { from: null, to: null, label: "كل الفترات" }
}

// ─────────────────────────────────────────────────────────────────────
// المساعدات الداخلية للمطابقة (Match Helpers) — تهريب LIKE وبناء الأنماط
// ─────────────────────────────────────────────────────────────────────
//
// تُصدَّر هذه المساعدات (على غرار resolvePeriod) لأغراض الاختبار المباشر؛
// وهي منطق نقيّ لا يلمس قاعدة البيانات. تُبنى أنماط LIKE هنا ثم تُمرَّر
// لاحقاً كقيم معاملات `?` — لا إقحام نصّي في SQL إطلاقاً.

/**
 * يهرّب محارف البدل (wildcards) الخاصة بـ LIKE في MySQL: `%` و`_`،
 * إضافةً إلى محرف الهروب نفسه `\`، حتى لا يتمكّن مُدخل المستخدم من حقن
 * أنماط بدل (wildcard injection) تُوسّع نطاق المطابقة بغير قصد.
 *
 * ترتيب الاستبدال مقصود: نهرّب الشرطة المائلة العكسية `\` أولاً كي لا
 * نُضاعف هروب الشرطات التي نُضيفها لاحقاً أمام `%` و`_`. تُمرَّر النتيجة
 * كقيمة معامل `?`، ويُستخدم النمط مع سلوك MySQL الافتراضي (`\` محرف هروب).
 *
 * @param term النص الخام المراد تهريبه.
 * @returns النص بعد تهريب `\` و`%` و`_`.
 */
export function escapeLike(term: string): string {
  return (term ?? "")
    .replace(/\\/g, "\\\\") // \ → \\  (يُهرَّب أولاً)
    .replace(/%/g, "\\%")   // % → \%
    .replace(/_/g, "\\_")   // _ → \_
}

/**
 * تطبيع عربي خفيف متّسق مع normalize في projects-db-service:
 * - إزالة التشكيل (الفتحة/الضمة/الكسرة/الشدّة/السكون/التنوين).
 * - إزالة التطويل/الكاشيدا (ـ).
 * - توحيد الألف بأشكالها (أ/إ/آ/ا → ا) والهمزة المحمولة عليها.
 * - توحيد التاء المربوطة والهاء (ة/ه → ه).
 * - توحيد الياء والألف المقصورة (ي/ى → ي).
 * - تصغير الأحرف اللاتينية وتوحيد المسافات.
 *
 * ملاحظة مقصودة: لا نطبّق تطبيع البادئة "ال" (على خلاف normalizeArabicWord
 * في db.ts) لأن العمود المخزّن (title/content) نصّ خام غير مطبّع؛ التطبيع
 * القويّ يُترك لفضفاضة نمط LIKE (‏%كلمة%‏) لتفادي تفويت المطابقات.
 */
function normalizeArabicLight(text: string): string {
  return (text ?? "")
    .replace(/[ًٌٍَُِّْ]/g, "") // تشكيل
    .replace(/ـ/g, "")           // تطويل/كاشيدا
    .replace(/[أإآا]/g, "ا")    // توحيد الألف
    .replace(/[ةه]/g, "ه")      // توحيد التاء المربوطة/الهاء
    .replace(/[يى]/g, "ي")      // توحيد الياء/الألف المقصورة
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/**
 * يبني قائمة أنماط LIKE من عبارة البحث بعد تطبيع عربي خفيف.
 *
 * الحالة الأساسية (البساطة أولاً): نمط واحد من كامل العبارة المُشذّبة
 * بصيغة `"%" + escapeLike(normalizedTerm) + "%"`. عند فراغ العبارة بعد
 * التطبيع تُعاد مصفوفة فارغة، تاركةً قرار رفض `query` الفارغ لطبقة الخدمة
 * الأعلى (count_mentions).
 *
 * @param query عبارة البحث الخام (بالعربية غالباً).
 * @returns مصفوفة أنماط LIKE جاهزة للتمرير كمعاملات (نمط واحد عادةً).
 */
export function buildLikeTerms(query: string): string[] {
  const normalized = normalizeArabicLight(query || "")
  if (normalized === "") return []
  return ["%" + escapeLike(normalized) + "%"]
}

// ─────────────────────────────────────────────────────────────────────
// مُنشئ الاستعلام الداخلي المشترك (Query Builder) — أجزاء WHERE + معاملاتها
// ─────────────────────────────────────────────────────────────────────
//
// تُصدَّر هذه المساعدات (على غرار resolvePeriod/escapeLike) لأغراض الاختبار
// المباشر. الثابت الحاكم (Property 3 — سلامة المعاملات): عدد علامات `?` في
// حقل `sql` يجب أن يساوي طول مصفوفة `params` تماماً في كل مساعد. تُمرَّر كل
// القيم كمعاملات `?` — لا إقحام نصّي لأي مُدخل مستخدم في SQL.

/**
 * شرط الأساس (base visibility) المشترك لكل الاستعلامات التحليلية:
 * يقصر النتائج على الأخبار النشطة غير المحذوفة. يُعاد استخدامه في دوال
 * التجميع (Task 5) لضمان اتّساق احترام الرؤية (Requirement 7.6).
 * لا يحتوي على أي معاملات `?` (شرط ثابت خالٍ من مُدخلات المستخدم).
 */
export const BASE_WHERE = "active = 1 AND deleted_at IS NULL"

/**
 * يبني جزء WHERE لشرط النافذة الزمنية + معاملاته بنمط null-safe متّسق.
 *
 * النمط null-safe: عند غياب حدّ (from أو to = null) يمرّ الشرط تلقائياً
 * (`? IS NULL OR ...`) دون الحاجة لتفريع SQL ديناميكي. هذا يُبقي بنية
 * الاستعلام ثابتة مهما كانت النافذة، ويحافظ على تطابق عدد `?` مع المعاملات.
 *
 * سلامة المعاملات (Property 3): 4 علامات `?` ↔ 4 معاملات
 * ([from, from, to, to]).
 *
 * @param w النافذة الزمنية المُحلّلة.
 * @returns جزء SQL ومعاملاته (4 معاملات مقابل 4 علامات `?`).
 */
export function windowClause(w: ResolvedWindow): { sql: string; params: (string | null)[] } {
  const from = w?.from ?? null
  const to = w?.to ?? null
  return {
    sql: "AND (? IS NULL OR created_at >= ?) AND (? IS NULL OR created_at <= ?)",
    params: [from, from, to, to],
  }
}

/**
 * أزواج التطبيع العربي المطبّقة داخل SQL (على العمود) — ثوابت لا مُدخلات مستخدم.
 * يجب أن تطابق تماماً ما يفعله normalizeArabicLight على جانب الاستعلام، حتى
 * يتّسق الطرفان (النمط والعمود). تشمل: حذف التطويل والتشكيل، وتوحيد الألف/الهمزات
 * والتاء المربوطة والياء.
 */
const AR_NORM_PAIRS: [string, string][] = [
  ["ـ", ""], ["ً", ""], ["ٌ", ""], ["ٍ", ""], ["َ", ""], ["ُ", ""], ["ِ", ""], ["ّ", ""], ["ْ", ""],
  ["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"], ["ى", "ي"],
]

/**
 * يبني تعبير SQL يطبّع عموداً نصّياً (title/content) بنفس قواعد
 * normalizeArabicLight عبر REPLACE متداخلة + LOWER. كل الأحرف ثوابت (لا
 * مُدخل مستخدم)، فلا حقن SQL. يضمن تطابق الطرفين (النمط المُطبّع ↔ العمود المُطبّع).
 */
function sqlNormalize(col: string): string {
  let expr = col
  for (const [from, to] of AR_NORM_PAIRS) {
    expr = `REPLACE(${expr}, '${from}', '${to}')`
  }
  return `LOWER(${expr})`
}

/**
 * يجرّد بادئة «ال» التعريفية من بداية رمز مطبّع (التغيير 6).
 * يُطبَّق على مستوى الرمز المُقسَّم (فيقع عند حدّ كلمة يقيناً)، ولا يُجرّد إلّا
 * إذا بقي بعده حرفان على الأقل (كي لا نُفرغ رموزاً قصيرة مثل «ال» وحدها).
 */
function stripArabicArticle(token: string): string {
  if (token.startsWith("ال") && token.length >= 4) return token.slice(2)
  return token
}

/**
 * الألقاب/كلمات التوقّف الدينية والشرفية (التغيير 7) — بصيغتها المطبّعة
 * المجرّدة من «ال» (متّسقةً مع stripArabicArticle)، تُسقَط من الرموز
 * الإلزامية كي لا يُصفّر لقبٌ واحد نتيجة العدّ كلّها (مثل «سيد احمد الصافي»).
 */
const AR_TITLE_STOPWORDS: ReadonlySet<string> = new Set([
  "سيد", "سماحه", "سماحته", "شيخ", "ايه", "له", "فضيله", "علامه", "حاج", "سماحة",
])

/**
 * يقسّم عبارة البحث (بعد التطبيع الخفيف) إلى رموز (كلمات) فريدة بطول ≥ 2.
 * التغيير 6: يجرّد بادئة «ال» من كل رمز (تطابق «صافي»↔«الصافي»).
 * التغيير 7: يُسقِط الألقاب/كلمات التوقّف من الرموز الإلزامية، مع حماية
 *   «لا تُسقِط الكل»: إن كانت العبارة كلّها ألقاباً يُحتفظ بالرموز قبل الترشيح.
 * عند غياب رموز معتدّ بها (لكن العبارة غير فارغة) يعيد العبارة المطبّعة كرمز واحد.
 */
export function buildQueryTokens(query: string): string[] {
  const normalized = normalizeArabicLight(query || "")
  if (normalized === "") return []
  const raw = Array.from(
    new Set(
      normalized
        .split(/\s+/)
        .filter((t) => t.length >= 2)
        .map(stripArabicArticle)
        .filter((t) => t.length >= 2)
    )
  )
  if (raw.length === 0) return [normalized]
  const filtered = raw.filter((t) => !AR_TITLE_STOPWORDS.has(t))
  // حماية «لا تُسقِط الكل»: إن أزال الترشيح كل الرموز (العبارة كلّها ألقاب) نُبقي raw.
  return filtered.length > 0 ? filtered : raw
}

/**
 * يبني جزء WHERE لمطابقة `title`/`content` عبر LIKE + معاملاته.
 *
 * الخيار (أ) — تطبيع الطرفين + مطابقة كلمة‑كلمة:
 * - **تطبيع الطرفين**: يُطبّع العمود داخل SQL عبر sqlNormalize بنفس قواعد تطبيع
 *   الاستعلام، فيختفي خلل «تطبيع النمط دون العمود» الذي كان يُرجع 0 لأي كلمة
 *   فيها ة/همزات/ى (مثل «زيارة عرفة»).
 * - **كلمة‑كلمة (AND)**: تُقسَّم العبارة إلى رموز، ويُشترط وجود كلٍّ منها في
 *   العنوان أو المحتوى (بأي ترتيب ولو متباعدة)، بدل العبارة المتلاصقة.
 *
 * سلامة المعاملات (Property 3): لكل رمز علامتا `?` ↔ معاملان ([pattern, pattern]).
 * العبارة الفارغة (بلا رموز) → sql فارغ وparams فارغة (لا تقييد إضافي)؛ رفض
 * العبارة الفارغة منطقياً مسؤولية المتصل (count_mentions).
 *
 * @param query عبارة البحث الخام.
 * @returns جزء SQL ومعاملاته (معاملان لكل رمز).
 */
export function matchClause(query: string): { sql: string; params: string[] } {
  const tokens = buildQueryTokens(query)
  if (tokens.length === 0) return { sql: "", params: [] }

  // حدّ الكلمة يساراً: نسبق النصّ المُطبّع بمسافة (CONCAT) ونطلب مسافة قبل الرمز
  // (النمط "% رمز%")، فنستبعد التصادمات مثل «عرفة» داخل «معرفة» مع الإبقاء على
  // مطابقة الكلمة أينما وردت مسبوقةً بمسافة (بما في ذلك أوّل النصّ بعد الـ CONCAT).
  // التغيير 6: نجرّد بادئة «ال» على مستوى حدّ الكلمة عبر REPLACE(' ال', ' ')
  // على التعبير المسبوق بالمسافة (فتُلتقَط «ال» في أوّل كلمة أيضاً)، بتماثل حرفي
  // مع stripArabicArticle على جانب الرموز، فيتطابق «صافي»↔«الصافي» و«سيد»↔«السيد».
  const stripCol = (col: string) => `REPLACE(CONCAT(' ', ${sqlNormalize(col)}), ' ال', ' ')`
  const tNorm = stripCol("title")
  const cNorm = stripCol("content")
  const parts: string[] = []
  const params: string[] = []
  for (const tok of tokens) {
    parts.push(`AND (${tNorm} LIKE ? OR ${cNorm} LIKE ?)`)
    const pattern = "% " + escapeLike(tok) + "%" // مسافة قبل الرمز = حدّ كلمة يساري
    params.push(pattern, pattern)
  }
  return { sql: parts.join(" "), params }
}

// ─────────────────────────────────────────────────────────────────────
// خريطة الحبيبة → نمط DATE_FORMAT (Granularity → DATE_FORMAT)
// ─────────────────────────────────────────────────────────────────────
//
// خريطة داخلية ثابتة (frozen) تربط كل حبيبة مُتحقَّق منها بنمط DATE_FORMAT
// آمن. قيمة النمط تأتي حصراً من هذه الخريطة بعد التحقق من القائمة البيضاء
// عبر resolveGranularity — لا يصل نصّ المستخدم إلى بنية SQL إطلاقاً
// (Requirement 7.4). النمط نفسه يُمرَّر لاحقاً كقيمة معامل `?`.

/** خريطة ثابتة (مجمّدة) من الحبيبة إلى نمط DATE_FORMAT في MySQL. */
export const GRANULARITY_FORMATS: Record<Granularity, string> = Object.freeze({
  day: "%Y-%m-%d",     // يوم تقويمي
  week: "%x-W%v",      // سنة ISO + رقم الأسبوع
  month: "%Y-%m",      // شهر تقويمي
})

/** الحبيبة الافتراضية الآمنة عند قيمة خارج القائمة البيضاء. */
const DEFAULT_GRANULARITY: Granularity = "month"

/**
 * يتحقّق من قيمة الحبيبة مقابل القائمة البيضاء الثابتة (مفاتيح
 * GRANULARITY_FORMATS)، ويُعيد قيمة Granularity صالحة. عند تمرير قيمة
 * خارج القائمة (بما فيها القيم الفارغة/غير المعروفة) يعود للافتراضي الآمن
 * `month` مع تسجيل تحذير ومتابعة التنفيذ دون رمي استثناء
 * (Requirement 7.4، 10.3).
 *
 * @param g قيمة الحبيبة الخام (قد تكون غير موثوقة).
 * @returns حبيبة صالحة مضمونة الوجود في GRANULARITY_FORMATS.
 */
export function resolveGranularity(g: string): Granularity {
  if (Object.prototype.hasOwnProperty.call(GRANULARITY_FORMATS, g)) {
    return g as Granularity
  }
  console.warn(
    `[analytics] resolveGranularity: قيمة granularity خارج القائمة البيضاء ("${g}") — استخدام الافتراضي "${DEFAULT_GRANULARITY}".`
  )
  return DEFAULT_GRANULARITY
}

// ─────────────────────────────────────────────────────────────────────
// دوال التجميع عبر SQL معلّم (Aggregation Functions)
// ─────────────────────────────────────────────────────────────────────
//
// كل الدوال أدناه تعتمد getPool().execute(sql, params) وتُمرّر كل قيم
// المستخدم كمعاملات `?` — لا إقحام نصّي لأي مُدخل مستخدم في SQL
// (Requirement 7.1، 7.2). تُعيد جميعها { success, data?, error? } وتلتقط
// أخطاء قاعدة البيانات لتعيد { success:false, error } دون رمي استثناء
// (Requirement 10.1).

/** أساس القياس المشترك (keyword_match) لنتائج العدّ (Requirement 6.2). */
const KEYWORD_BASIS: AnalyticsBasis = {
  method: "keyword_match",
  fields: ["title", "content"],
  note: "رقم تقريبي مبني على مطابقة الكلمة في عناوين ومحتوى الأخبار",
}

/** رسالة فشل موحّدة عند تعذّر تنفيذ استعلام على قاعدة البيانات. */
const DB_ERROR_MESSAGE = "تعذّر تنفيذ استعلام التحليل."

/** حدّ ثابت لعدد صفوف العيّنة (لا يُشتقّ من مُدخل المستخدم — Requirement 11.2). */
const SAMPLE_LIMIT = 5

/** حدّا قصّ عدد نتائج top_topics (Requirement 7.5). */
const MIN_TOP_LIMIT = 1
const MAX_TOP_LIMIT = 20
const DEFAULT_TOP_LIMIT = 5

/** يبني رابط خبر بنفس نمط news-service (getNewsUrl). */
function buildNewsUrl(id: number): string {
  return `https://alkafeel.net/news/index.php?id=${id}`
}

/**
 * يحوّل قيمة `created_at` القادمة من قاعدة البيانات إلى سلسلة نصّية.
 * قد يعيدها mysql2 ككائن Date أو كسلسلة حسب الإعدادات، لذا نطبّع الحالتين.
 */
function toCreatedAtString(value: unknown): string {
  if (value instanceof Date) return formatSqlDateTime(value)
  return String(value ?? "")
}

/**
 * هل النافذة فارغة (from > to)؟ عندها نقصر الدائرة ونعيد أعداداً صفرية
 * دون تنفيذ أي استعلام (Requirement 8.1، Property 6). المقارنة اللفظية
 * صحيحة لصيغة التاريخ ثابتة العرض "YYYY-MM-DD HH:MM:SS".
 */
function isEmptyWindow(w: ResolvedWindow): boolean {
  return w.from !== null && w.to !== null && w.from > w.to
}

/** هل النافذة محدّدة (لها حدّ زمني)؟ — أي ليست «كل الفترات» (from=to=null). */
function isBoundedWindow(w: ResolvedWindow): boolean {
  return w.from !== null || w.to !== null
}

/**
 * يُرجع أحدث تاريخ متاح في أخبار الأساس بصيغة YYYY-MM-DD (أو null عند الفشل/الفراغ).
 * (التغيير 8) يُستخدم فقط على مسار الصفر بنافذة محدّدة لتمييز «لا بيانات» عن «لا ذكر».
 */
async function latestAvailableDate(): Promise<string | null> {
  try {
    const [rows] = await getPool().execute<RowDataPacket[]>(
      `SELECT DATE_FORMAT(MAX(created_at), '%Y-%m-%d') AS d FROM news WHERE ${BASE_WHERE}`
    )
    const d = (rows as any[])?.[0]?.d
    return d ? String(d) : null
  } catch (err) {
    console.error("[analytics] latestAvailableDate فشل الاستعلام:", err)
    return null
  }
}

/**
 * يبني حقول التمييز عند العدّ الصفري بنافذة محدّدة (التغيير 8):
 * يُرفِق `latest_available`، ويحدّد `no_data_in_window` إذا كانت النافذة لاحقةً
 * كلياً لأحدث بيانات القاعدة (window.from > latest_available) — أي «لا بيانات»
 * لا «لا ذكر». يُستدعى حصراً على مسار total=0 بنافذة محدّدة.
 */
async function zeroWindowInfo(w: ResolvedWindow): Promise<{ latest_available?: string; no_data_in_window?: boolean }> {
  const latest = await latestAvailableDate()
  if (!latest) return {}
  const fromDay = w.from ? w.from.slice(0, 10) : null
  const noData = fromDay !== null && fromDay > latest
  return { latest_available: latest, no_data_in_window: noData }
}

// ── (أ) count_mentions — عدّ الذكر ضمن نافذة زمنية ─────────────────────
interface CountRow extends RowDataPacket {
  total: number
}
interface SampleRow extends RowDataPacket {
  id: number
  title: string
  created_at: unknown
}

/**
 * يعدّ مرات ذكر عبارة (query) في `title`/`content` ضمن نافذة زمنية.
 *
 * - عبارة فارغة → فشل واضح يطلب توضيح الكلمة (Requirement 10.2).
 * - نافذة فارغة (from > to) → total: 0 دون استعلام (Requirement 8.1).
 * - sample=true → عيّنة حتى 5 صفوف مرتّبة تنازلياً حسب created_at
 *   بحدّ LIMIT ثابت (Requirement 1.3، 11.2).
 */
export async function countMentions(params: {
  query: string
  spec: PeriodSpec
  sample?: boolean
}): Promise<CountMentionsResult> {
  const query = (params?.query ?? "").trim()
  if (query === "") {
    return { success: false, error: "يرجى تحديد الكلمة أو الاسم المراد عدّ ذكره." }
  }

  const window = resolvePeriod(params.spec)

  // قصر دائرة النافذة الفارغة — لا استعلام على قاعدة البيانات.
  if (isEmptyWindow(window)) {
    return {
      success: true,
      data: {
        query,
        total: 0,
        window,
        basis: KEYWORD_BASIS,
        ...(params.sample === true ? { sample: [] } : {}),
      },
    }
  }

  try {
    const db = getPool()
    const match = matchClause(query)
    const win = windowClause(window)

    const countSql = `SELECT COUNT(*) AS total FROM news WHERE ${BASE_WHERE} ${match.sql} ${win.sql}`
    const countParams = [...match.params, ...win.params]
    const [countRows] = await db.execute<CountRow[]>(countSql, countParams)
    const total = Number(countRows?.[0]?.total ?? 0)

    if (params.sample === true) {
      // LIMIT ثابت (SAMPLE_LIMIT) — قيمة ثابتة غير مشتقّة من مُدخل المستخدم.
      const sampleSql =
        `SELECT id, title, created_at FROM news WHERE ${BASE_WHERE} ${match.sql} ${win.sql}` +
        ` ORDER BY created_at DESC LIMIT ${SAMPLE_LIMIT}`
      const sampleParams = [...match.params, ...win.params]
      const [sampleRows] = await db.execute<SampleRow[]>(sampleSql, sampleParams)
      const mapped = (sampleRows ?? []).map(row => ({
        id: Number(row.id),
        title: String(row.title ?? ""),
        created_at: toCreatedAtString(row.created_at),
        url: buildNewsUrl(Number(row.id)),
      }))
      const zeroInfoS = (total === 0 && isBoundedWindow(window)) ? await zeroWindowInfo(window) : {}
      return {
        success: true,
        data: { query, total, window, basis: KEYWORD_BASIS, sample: mapped, ...zeroInfoS },
      }
    }

    const zeroInfo = (total === 0 && isBoundedWindow(window)) ? await zeroWindowInfo(window) : {}
    return { success: true, data: { query, total, window, basis: KEYWORD_BASIS, ...zeroInfo } }
  } catch (err) {
    console.error("[analytics] countMentions فشل الاستعلام:", err)
    return { success: false, error: DB_ERROR_MESSAGE }
  }
}

// ── (ب) mentions_timeline — الخط الزمني للذكر ─────────────────────────
interface BucketRow extends RowDataPacket {
  bucket: string
  count: number
}

/**
 * يبني توزيعاً زمنياً (buckets) لعدد مرات ذكر عبارة عبر حبيبة زمنية.
 *
 * - نمط DATE_FORMAT يُختار من GRANULARITY_FORMATS بعد التحقق من القائمة
 *   البيضاء (Requirement 7.4)، ويُمرَّر كأول معامل `?` (قيمة من الخريطة لا
 *   نصّ المستخدم).
 * - total = مجموع buckets.count (Property 2).
 * - نافذة فارغة → buckets: []، total: 0 دون استعلام (Requirement 8.1).
 */
export async function mentionsTimeline(params: {
  query: string
  granularity: Granularity
  spec: PeriodSpec
}): Promise<TimelineResult> {
  const query = (params?.query ?? "").trim()
  const granularity = resolveGranularity(params?.granularity as unknown as string)
  const window = resolvePeriod(params.spec)

  if (isEmptyWindow(window)) {
    return {
      success: true,
      data: { query, granularity, window, buckets: [], total: 0, basis: KEYWORD_BASIS },
    }
  }

  try {
    const db = getPool()
    const format = GRANULARITY_FORMATS[granularity]
    const match = matchClause(query)
    const win = windowClause(window)

    const sql =
      `SELECT DATE_FORMAT(created_at, ?) AS bucket, COUNT(*) AS count` +
      ` FROM news WHERE ${BASE_WHERE} ${match.sql} ${win.sql}` +
      ` GROUP BY bucket ORDER BY bucket ASC`
    const sqlParams = [format, ...match.params, ...win.params]
    const [rows] = await db.execute<BucketRow[]>(sql, sqlParams)

    const buckets = (rows ?? []).map(row => ({
      bucket: String(row.bucket ?? ""),
      count: Number(row.count ?? 0),
    }))
    const total = buckets.reduce((sum, b) => sum + b.count, 0)

    return {
      success: true,
      data: { query, granularity, window, buckets, total, basis: KEYWORD_BASIS },
    }
  } catch (err) {
    console.error("[analytics] mentionsTimeline فشل الاستعلام:", err)
    return { success: false, error: DB_ERROR_MESSAGE }
  }
}

// ── (ج) top_topics — أكثر الأقسام نشاطاً ──────────────────────────────
interface TopRow extends RowDataPacket {
  category_id: number
  count: number
}

/**
 * يعيد أكثر الأقسام (category_id) نشاطاً ضمن نافذة زمنية، مرتّبة تنازلياً.
 *
 * - limit يُقصّ ضمن [1, 20] (افتراضي 5) قبل الاستخدام (Requirement 7.5).
 * - section: عند تمرير قيمة رقمية تُصفّى على category_id؛ القيم غير الرقمية
 *   تُتجاهَل (لا يوجد جدول تصنيفات بالاسم — يُوثَّق).
 * - نافذة فارغة → items: [] دون استعلام (Requirement 8.1).
 *
 * ملاحظة حول LIMIT: يُعرَف أن تمرير LIMIT كمعامل `?` عبر execute() في بعض
 * إصدارات mysql2 يسبّب "Incorrect arguments to mysqld_stmt_execute". وبما
 * أنّ القيمة عدد صحيح مُتحقَّق منه ومُقصوص ([1,20]) وليست سلسلة من المستخدم،
 * نُدرجها مباشرةً في نصّ الاستعلام بأمان بعد ضمان كونها عدداً صحيحاً.
 */
export async function topTopics(params: {
  spec: PeriodSpec
  section?: string
  limit?: number
}): Promise<TopTopicsResult> {
  const window = resolvePeriod(params.spec)

  // قصّ limit ضمن [1, 20] مع افتراضي 5.
  const rawLimit = Number(params?.limit)
  const limit = Number.isFinite(rawLimit)
    ? Math.min(MAX_TOP_LIMIT, Math.max(MIN_TOP_LIMIT, Math.round(rawLimit)))
    : DEFAULT_TOP_LIMIT

  if (isEmptyWindow(window)) {
    return { success: true, data: { window, dimension: "category", items: [] } }
  }

  // section رقمي فقط يُفعّل التصفية على category_id؛ غير ذلك يُتجاهَل.
  let sectionId: number | null = null
  if (params?.section !== undefined && params.section !== null) {
    const s = String(params.section).trim()
    if (s !== "" && /^\d+$/.test(s)) {
      sectionId = Number(s)
    }
  }

  try {
    const db = getPool()
    const win = windowClause(window)

    const sectionSql = sectionId !== null ? " AND category_id = ?" : ""
    const sql =
      `SELECT category_id, COUNT(*) AS count` +
      ` FROM news WHERE ${BASE_WHERE} ${win.sql}${sectionSql}` +
      ` GROUP BY category_id ORDER BY count DESC LIMIT ${limit}`
    const sqlParams: (string | number | null)[] = [...win.params]
    if (sectionId !== null) sqlParams.push(sectionId)

    const [rows] = await db.execute<TopRow[]>(sql, sqlParams)
    const items = (rows ?? []).map(row => ({
      label: `تصنيف ${row.category_id}`,
      category_id: Number(row.category_id),
      count: Number(row.count ?? 0),
    }))

    return { success: true, data: { window, dimension: "category", items } }
  } catch (err) {
    console.error("[analytics] topTopics فشل الاستعلام:", err)
    return { success: false, error: DB_ERROR_MESSAGE }
  }
}

// ── (د) count_news — عدّ الأخبار حسب الفترة/التصنيف ────────────────────
/**
 * يعدّ الأخبار المنشورة ضمن نافذة زمنية مع تصفية اختيارية على category_id.
 *
 * - نافذة فارغة → total: 0 دون استعلام (Requirement 8.1).
 * - يُضمّن window وقيمة category_id (أو null) في النتيجة (Requirement 4.3).
 */
export async function countNews(params: {
  spec: PeriodSpec
  categoryId?: number
  typeId?: number
  query?: string
}): Promise<CountNewsResult> {
  const window = resolvePeriod(params.spec)
  const categoryId =
    params?.categoryId !== undefined && params.categoryId !== null && Number.isFinite(Number(params.categoryId))
      ? Number(params.categoryId)
      : null
  const typeId =
    params?.typeId !== undefined && params.typeId !== null && Number.isFinite(Number(params.typeId))
      ? Number(params.typeId)
      : null
  const query = params?.query?.trim() || null

  if (isEmptyWindow(window)) {
    return { success: true, data: { total: 0, window, category_id: categoryId } }
  }

  try {
    const db = getPool()
    const win = windowClause(window)

    const categorySql = categoryId !== null ? " AND category_id = ?" : ""
    const typeSql = typeId !== null ? " AND type_id = ?" : ""
    // التغيير 1: توحيد الدلالة — نستخدم نفس matchClause المطبّع (تطبيع «ال»
    // + إسقاط الألقاب + كلمة‑كلمة AND + حدّ كلمة) بدل LIKE الخام، فيتطابق
    // count_news(query) مع count_mentions تماماً على نفس النافذة.
    const match = query ? matchClause(query) : { sql: "", params: [] as string[] }
    const sql = `SELECT COUNT(*) AS total FROM news WHERE ${BASE_WHERE} ${win.sql}${categorySql}${typeSql} ${match.sql}`
    // ترتيب المعاملات مطابق لترتيب ظهور علامات `?`: النافذة، ثم category_id، ثم type_id، ثم رموز matchClause.
    const sqlParams: (string | number | null)[] = [...win.params]
    if (categoryId !== null) sqlParams.push(categoryId)
    if (typeId !== null) sqlParams.push(typeId)
    sqlParams.push(...match.params)

    const [rows] = await db.execute<CountRow[]>(sql, sqlParams)
    const total = Number(rows?.[0]?.total ?? 0)

    // التغيير 2: عند العدّ بكلمة (query) نُرفِق basis ليُعرَض الرقم كتقدير لا كإحصاء رسمي.
    const basis = query ? { basis: KEYWORD_BASIS } : {}
    // التغيير 8: عند total=0 بنافذة محدّدة نُرفِق latest_available ونميّز «لا بيانات» عن «لا ذكر».
    const zeroInfo = (total === 0 && isBoundedWindow(window)) ? await zeroWindowInfo(window) : {}
    return {
      success: true,
      data: { total, window, category_id: categoryId, query_used: query || undefined, ...basis, ...zeroInfo },
    }
  } catch (err) {
    console.error("[analytics] countNews فشل الاستعلام:", err)
    return { success: false, error: DB_ERROR_MESSAGE }
  }
}
