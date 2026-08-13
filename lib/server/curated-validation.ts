/**
 * Curated Answers Validation — التحقّق من مدخلات الإجابات المنسّقة
 *
 * دوال نقيّة (بلا قاعدة بيانات وبلا آثار جانبية) للتحقّق من حمولات الإنشاء/التعديل
 * القادمة إلى مسارات `/api/curated`، وتنظيف حقل `patterns` قبل تمريره إلى طبقة
 * الخدمة. الرسائل عربية ومطابقة لوثيقة التصميم (القسم 4).
 */

import type { CuratedInput } from "./curated-service"

// ===== نتيجة التحقّق =====
export interface ValidationResult {
  ok: boolean
  error?: string
  value?: CuratedInput
}

// ===== الفئات المسموح بها =====
const VALID_CATEGORIES = ["faq", "stance"] as const

// ===== حدّ التحديد الأدنى للأنماط =====
//
// ⚠️ سبب وجود هذا الحارس: النمط الفضفاض يخطف أسئلة لا تخصّه. مدخلة «أم العباس»
// لو حملت نمطاً عاماً مثل «العباس» لأصابت كل سؤال عن العباس (استشهاده، مرقده،
// صفاته) بجواب عن أمّه. وقد حدث هذا فعلاً وأدّى إلى حذف محتوى سليم.
// الترتيب الجديد في matchCurated (الأكثر تحديداً يفوز) يخفّف الأثر لكنه لا
// يمنعه: إن كان النمط العام هو المطابق الوحيد فسيفوز حتماً. فالمنع هنا.

/** أقصر طول مقبول لنمط من كلمة واحدة (بعد التقليم). */
const MIN_SINGLE_WORD_PATTERN_LENGTH = 4

/** تطبيع خفيف للمقارنة مع قائمة الكلمات العامة (توحيد الهمزات والتاء والياء). */
function normalizeForBreadthCheck(s: string): string {
  return s
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim()
    .toLowerCase()
}

/**
 * كلمات مفردة شديدة الشيوع في نطاق العتبة — لا تصلح نمطاً وحدها.
 * ⚠️ تُطبَّع عند التحميل: بدون ذلك تنجو صيغ مثل «العتبة» (بالتاء المربوطة) من
 * الفحص لأن المقارنة تجري على النصّ المطبّع «العتبه».
 */
const OVERLY_BROAD_TERMS: ReadonlySet<string> = new Set(
  [
    "العباس", "عباس", "الحسين", "حسين", "علي", "الكفيل", "كفيل",
    "العتبة", "عتبة", "العباسية", "عباسية", "المقدسة", "مقدسة",
    "كربلاء", "الامام", "إمام", "امام", "السيد", "سيد", "الشيخ", "شيخ",
    "مشروع", "مشاريع", "خبر", "اخبار", "أخبار", "قسم", "اقسام", "أقسام",
    "زيارة", "موقع", "معلومات", "تفاصيل",
    "ما", "من", "هل", "اين", "أين", "متى", "كيف", "كم",
  ].map(normalizeForBreadthCheck)
)

/**
 * يتحقّق أن النمط محدّد بما يكفي.
 * يُعيد رسالة خطأ عربية عند الرفض، أو null عند القبول.
 *
 * القاعدة: الأنماط متعددة الكلمات مقبولة دائماً (تحديدها كافٍ). أمّا نمط الكلمة
 * الواحدة فيجب ألّا يكون قصيراً جداً ولا من الكلمات شديدة الشيوع في هذا النطاق.
 */
export function checkPatternBreadth(pattern: string): string | null {
  const trimmed = pattern.trim()
  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length === 0) return null // يلتقطه فحص الفراغ
  if (words.length > 1) return null   // متعدد الكلمات ⇒ محدّد بما يكفي

  const norm = normalizeForBreadthCheck(trimmed)
  if (norm.length < MIN_SINGLE_WORD_PATTERN_LENGTH) {
    return `النمط «${trimmed}» قصير جداً وسيطابق أسئلة كثيرة لا تخصّه. استعمل عبارة من كلمتين فأكثر.`
  }
  if (OVERLY_BROAD_TERMS.has(norm)) {
    return `النمط «${trimmed}» كلمة شائعة جداً في محتوى العتبة، ولو قُبل لخطف كل سؤال يذكرها. استعمل عبارة أدقّ مثل «${trimmed} عليه السلام» أو «متى استشهد ${trimmed}».`
  }
  return null
}

/**
 * ينظّف مصفوفة أنماط: تقليم + إسقاط الفارغ + إزالة التكرار (يحافظ على الترتيب).
 */
function cleanPatterns(patterns: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const p of patterns) {
    const t = p.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

/**
 * يتحقّق أن قيمة `url` سلسلة http(s) صالحة.
 */
function isValidHttpUrl(value: string): boolean {
  try {
    const u = new URL(value)
    return u.protocol === "http:" || u.protocol === "https:"
  } catch {
    return false
  }
}

/**
 * يتحقّق من حمولة إنشاء/تعديل مدخلة منسّقة.
 * القواعد (رسائل عربية):
 *  - category ∈ {"faq","stance"}                      وإلا: "الفئة غير صالحة"
 *  - patterns مصفوفة نصوص فيها عنصر غير فارغ بعد التقليم وإلا: "يجب إدخال نمط واحد على الأقل"
 *  - answer نص غير فارغ بعد التقليم                     وإلا: "نص الإجابة مطلوب"
 *  - url اختياري؛ إن وُجد وليس null فسلسلة http(s) صالحة  وإلا: "الرابط غير صالح"
 *  - priority اختياري؛ إن وُجد فعدد صحيح (افتراضي 0)      وإلا: "الأولوية يجب أن تكون عدداً صحيحاً"
 *  - active اختياري منطقي (افتراضي true)
 *
 * في الوضع الكامل (الإنشاء): category و patterns و answer إلزامية.
 * في الوضع الجزئي (التعديل): تُتحقَّق الحقول الموجودة فقط، مع رفض تفريغ حقل إلزامي.
 * ينظّف patterns (تقليم + إسقاط الفارغ + إزالة التكرار) قبل الإرجاع.
 */
export function validateCuratedInput(
  body: unknown,
  opts?: { partial?: boolean }
): ValidationResult {
  const partial = opts?.partial === true

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "الفئة غير صالحة" }
  }

  const input = body as Record<string, unknown>
  const value: Partial<CuratedInput> = {}

  // ── category ──
  const hasCategory = input.category !== undefined
  if (hasCategory || !partial) {
    if (
      typeof input.category !== "string" ||
      !VALID_CATEGORIES.includes(input.category as (typeof VALID_CATEGORIES)[number])
    ) {
      return { ok: false, error: "الفئة غير صالحة" }
    }
    value.category = input.category as CuratedInput["category"]
  }

  // ── patterns ── (نرفض تفريغ الحقل الإلزامي حتى في الوضع الجزئي)
  const hasPatterns = input.patterns !== undefined
  if (hasPatterns || !partial) {
    if (
      !Array.isArray(input.patterns) ||
      !input.patterns.every((p) => typeof p === "string")
    ) {
      return { ok: false, error: "يجب إدخال نمط واحد على الأقل" }
    }
    const cleaned = cleanPatterns(input.patterns as string[])
    if (cleaned.length === 0) {
      return { ok: false, error: "يجب إدخال نمط واحد على الأقل" }
    }
    // حارس التحديد: يمنع النمط الفضفاض من الدخول أصلاً (انظر checkPatternBreadth)
    for (const p of cleaned) {
      const breadthError = checkPatternBreadth(p)
      if (breadthError) return { ok: false, error: breadthError }
    }
    value.patterns = cleaned
  }

  // ── answer ── (نرفض تفريغ الحقل الإلزامي حتى في الوضع الجزئي)
  const hasAnswer = input.answer !== undefined
  if (hasAnswer || !partial) {
    if (typeof input.answer !== "string" || input.answer.trim().length === 0) {
      return { ok: false, error: "نص الإجابة مطلوب" }
    }
    value.answer = input.answer
  }

  // ── url ── (اختياري؛ يُقبل null أو سلسلة http(s) صالحة)
  if (input.url !== undefined && input.url !== null) {
    if (typeof input.url !== "string" || !isValidHttpUrl(input.url)) {
      return { ok: false, error: "الرابط غير صالح" }
    }
    value.url = input.url
  } else if (input.url === null) {
    value.url = null
  }

  // ── priority ── (اختياري؛ عدد صحيح، افتراضي 0)
  if (input.priority !== undefined) {
    if (typeof input.priority !== "number" || !Number.isInteger(input.priority)) {
      return { ok: false, error: "الأولوية يجب أن تكون عدداً صحيحاً" }
    }
    value.priority = input.priority
  } else if (!partial) {
    value.priority = 0
  }

  // ── active ── (اختياري منطقي، افتراضي true)
  if (input.active !== undefined) {
    if (typeof input.active !== "boolean") {
      return { ok: false, error: "الحقل active يجب أن يكون قيمة منطقية" }
    }
    value.active = input.active
  } else if (!partial) {
    value.active = true
  }

  return { ok: true, value: value as CuratedInput }
}

/**
 * يحوّل نصاً مفصولاً بفواصل أو أسطر جديدة إلى مصفوفة أنماط مقلّمة خالية من الفراغ
 * ومن التكرار (متّسق مع تنظيف validateCuratedInput).
 */
export function parsePatterns(raw: string): string[] {
  return cleanPatterns(raw.split(/[\n,]+/))
}
