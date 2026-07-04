/**
 * Knowledge Base Validation — التحقّق من مدخلات مقالات قاعدة المعرفة
 *
 * دوال نقيّة (بلا قاعدة بيانات وبلا آثار جانبية) للتحقّق من حمولات الإنشاء/التعديل
 * القادمة إلى مسارات `/api/knowledge`، وتنظيف حقل `keywords` قبل تمريره إلى طبقة
 * الخدمة. الرسائل عربية ومطابقة لوثيقة التصميم (قسم قواعد التحقّق) وللمتطلّب 7.
 */

import type { KbInput } from "./kb-service"

// ===== نتيجة التحقّق =====
export interface ValidationResult {
  ok: boolean
  error?: string
  value?: KbInput
}

/**
 * ينظّف مصفوفة كلمات مفتاحية: تقليم + إسقاط الفارغ + إزالة التكرار (يحافظ على الترتيب).
 */
function cleanKeywords(keywords: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const k of keywords) {
    const t = k.trim()
    if (t && !seen.has(t)) {
      seen.add(t)
      out.push(t)
    }
  }
  return out
}

/**
 * يتحقّق من حمولة إنشاء/تعديل مقالة معرفة.
 * القواعد (رسائل عربية):
 *  - title نص غير فارغ بعد التقليم (إلزامي)          وإلا: "العنوان مطلوب"
 *  - body نص غير فارغ بعد التقليم (إلزامي)           وإلا: "نص المقالة مطلوب"
 *  - keywords اختياري؛ مصفوفة نصوص تُنظَّف عبر cleanKeywords
 *  - priority اختياري؛ عدد صحيح (افتراضي 0)          وإلا: "الأولوية يجب أن تكون عدداً صحيحاً"
 *  - active اختياري منطقي (افتراضي true)             وإلا: "الحقل active يجب أن يكون قيمة منطقية"
 *  - note اختياري؛ سلسلة أو null، يُمرَّر كما هو عند وجوده
 *
 * في الوضع الكامل (الإنشاء): title و body إلزاميان، وتُشتقّ الافتراضيات (priority=0, active=true).
 * في الوضع الجزئي (التعديل): تُتحقَّق الحقول الموجودة فقط، مع رفض تفريغ الحقلين الإلزاميين.
 * ينظّف keywords (تقليم + إسقاط الفارغ + إزالة التكرار) قبل الإرجاع.
 */
export function validateKbInput(
  body: unknown,
  opts?: { partial?: boolean }
): ValidationResult {
  const partial = opts?.partial === true

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "العنوان مطلوب" }
  }

  const input = body as Record<string, unknown>
  const value: Partial<KbInput> = {}

  // ── title ── (نرفض تفريغ الحقل الإلزامي حتى في الوضع الجزئي)
  const hasTitle = input.title !== undefined
  if (hasTitle || !partial) {
    if (typeof input.title !== "string" || input.title.trim().length === 0) {
      return { ok: false, error: "العنوان مطلوب" }
    }
    value.title = input.title
  }

  // ── body (المتن) ── (نرفض تفريغ الحقل الإلزامي حتى في الوضع الجزئي)
  const hasBody = input.body !== undefined
  if (hasBody || !partial) {
    if (typeof input.body !== "string" || input.body.trim().length === 0) {
      return { ok: false, error: "نص المقالة مطلوب" }
    }
    value.body = input.body
  }

  // ── keywords ── (اختياري؛ مصفوفة نصوص تُنظَّف)
  if (input.keywords !== undefined) {
    if (
      !Array.isArray(input.keywords) ||
      !input.keywords.every((k) => typeof k === "string")
    ) {
      return { ok: false, error: "الكلمات المفتاحية يجب أن تكون قائمة نصوص" }
    }
    value.keywords = cleanKeywords(input.keywords as string[])
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

  // ── note ── (اختياري؛ سلسلة أو null، يُمرَّر كما هو عند وجوده)
  if (input.note !== undefined) {
    if (input.note !== null && typeof input.note !== "string") {
      return { ok: false, error: "الملاحظة يجب أن تكون نصاً" }
    }
    value.note = input.note as string | null
  }

  return { ok: true, value: value as KbInput }
}

/**
 * يحوّل نصاً مفصولاً بفواصل أو أسطر جديدة إلى مصفوفة كلمات مفتاحية مقلّمة خالية من
 * الفراغ ومن التكرار (متّسق مع تنظيف validateKbInput).
 */
export function parseKeywords(raw: string): string[] {
  return cleanKeywords(raw.split(/[\n,]+/))
}
