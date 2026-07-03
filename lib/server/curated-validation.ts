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
