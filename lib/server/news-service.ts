/**
 * News Service — عدّ وبحث الأخبار من قاعدة بيانات MySQL
 *
 * مصدر الحقيقة: جدول `news` (schema legacy) في قاعدة `db`.
 * الأعمدة المعتمدة: title1 (العنوان)، text (النص)، active (1 = منشور)، date.
 *
 * ملاحظة عن نموذج البيانات (مؤكّد تجريبياً):
 * - news.cat قيمه نصوص هجينة لا تُطابق news_cats.id → لا نعتمد التصنيفات.
 * - جدول news_sections شبه فارغ ويشير لأخبار غير موجودة → لا نعتمد الأقسام.
 * - الطريقة الموثوقة الوحيدة للعدّ = مطابقة العبارة في title1 و/أو text.
 */

import { query } from "./db"

export type NewsCountScope = "title" | "content"

export interface NewsCountResult {
  success: boolean
  /** العدد الدقيق من COUNT(*) — حتمي */
  count: number
  /** العبارة التي جرى البحث عنها */
  query: string
  /** أساس العدّ: العنوان أو النص */
  scope: NewsCountScope
  /** هل اقتُصر العدّ على الأخبار المنشورة (active=1) */
  activeOnly: boolean
  error?: string
}

/**
 * التحقق من صحة العبارة المُدخلة
 */
function normalizeQuery(q: string | undefined | null): string {
  return (q || "").trim()
}

/**
 * عدّ الأخبار المطابِقة لعبارة في العنوان أو النص.
 *
 * يعتمد على COUNT(*) حقيقي — النتيجة حتمية ودقيقة (لا تخمين).
 *
 * @param q - العبارة (تُطابق كجزء LIKE %q%)
 * @param scope - "title" (افتراضي) للبحث في title1، أو "content" للبحث في text
 * @param activeOnly - عدّ الأخبار المنشورة فقط (active=1)، افتراضي true
 */
export async function getNewsCount(
  q: string,
  scope: NewsCountScope = "title",
  activeOnly: boolean = true
): Promise<NewsCountResult> {
  const phrase = normalizeQuery(q)

  if (phrase.length < 2) {
    return {
      success: false,
      count: 0,
      query: phrase,
      scope,
      activeOnly,
      error: "العبارة قصيرة جداً — أدخل كلمة أو عبارة أوضح للعدّ."
    }
  }

  const column = scope === "content" ? "text" : "title1"
  const like = `%${phrase}%`

  // استعلام مُعاملي — LIKE على العمود المحدد + فلترة الحالة اختيارياً
  const sql = activeOnly
    ? `SELECT COUNT(*) AS c FROM news WHERE ${column} LIKE ? AND active = 1`
    : `SELECT COUNT(*) AS c FROM news WHERE ${column} LIKE ?`

  try {
    const rows = await query<{ c: number }>(sql, [like])
    const count = Number(rows[0]?.c ?? 0)
    return { success: true, count, query: phrase, scope, activeOnly }
  } catch (error: any) {
    console.error("[News Service] getNewsCount error:", error?.message)
    return {
      success: false,
      count: 0,
      query: phrase,
      scope,
      activeOnly,
      error: "تعذّر الوصول إلى قاعدة بيانات الأخبار حالياً."
    }
  }
}

/**
 * إجمالي عدد الأخبار في القاعدة (للأسئلة العامة عن الحجم الكلي).
 *
 * @param activeOnly - عدّ الأخبار المنشورة فقط (active=1)، افتراضي true
 */
export async function getNewsTotal(
  activeOnly: boolean = true
): Promise<NewsCountResult> {
  const sql = activeOnly
    ? `SELECT COUNT(*) AS c FROM news WHERE active = 1`
    : `SELECT COUNT(*) AS c FROM news`
  try {
    const rows = await query<{ c: number }>(sql, [])
    const count = Number(rows[0]?.c ?? 0)
    return { success: true, count, query: "", scope: "title", activeOnly }
  } catch (error: any) {
    console.error("[News Service] getNewsTotal error:", error?.message)
    return {
      success: false,
      count: 0,
      query: "",
      scope: "title",
      activeOnly,
      error: "تعذّر الوصول إلى قاعدة بيانات الأخبار حالياً."
    }
  }
}
