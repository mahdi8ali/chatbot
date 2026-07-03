/**
 * prayer-service.ts — أوقات الصلاة من جدول `salah`
 *
 * الجدول: ka_db.salah (366 سجل — يوم واحد لكل يوم في السنة)
 * الحقول: month (اسم الشهر بالعربي), day, day2 (DD/MM), fajer, rise, noon, ghrob, mid
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

interface SalahRow extends RowDataPacket {
  id: number
  month: string
  day: string
  day2: string
  fajer: string
  rise: string
  noon: string
  ghrob: string
  mid: string | null
}

/**
 * استرجاع أوقات الصلاة ليوم معين
 * @param date - تاريخ بصيغة YYYY-MM-DD أو DD/MM أو اسم اليوم. إذا لم يُحدد يُستخدم تاريخ اليوم.
 */
export async function getPrayerTimes(params: {
  date?: string
}): Promise<APICallResult> {
  const db = getPool()

  try {
    // تحديد التاريخ المطلوب
    const day2 = resolveDateToDayMonth(params.date)

    // دفاع في العمق: تاريخ مُقدَّم بصيغة غير قابلة للتحليل → رفض بدل الرجوع الصامت لليوم
    if (params.date && day2 === null) {
      return {
        success: false,
        error: "صيغة التاريخ غير صالحة. استخدم YYYY-MM-DD أو DD/MM لتاريخ ميلادي صحيح."
      }
    }

    const [rows] = await db.query<SalahRow[]>(
      `SELECT id, month, day, day2, fajer, rise, noon, ghrob, mid
       FROM salah
       WHERE day2 = ?
       LIMIT 1`,
      [day2]
    )

    if (!rows || rows.length === 0) {
      return {
        success: false,
        error: `لم يتم العثور على أوقات الصلاة للتاريخ: ${day2}`
      }
    }

    const row = rows[0] as SalahRow

    return {
      success: true,
      data: {
        date: day2,
        month_name: row.month,
        day: row.day,
        prayer_times: {
          fajer: row.fajer,   // الفجر
          rise: row.rise,     // الشروق
          noon: row.noon,     // الظهر
          ghrob: row.ghrob,   // المغرب
          mid: row.mid        // منتصف الليل
        }
      }
    }
  } catch (error: any) {
    console.error("[DB Error - getPrayerTimes]:", error?.message)
    return { success: false, error: "تعذر استرجاع أوقات الصلاة" }
  }
}

/**
 * تحويل التاريخ إلى صيغة DD/MM المستخدمة في جدول salah
 *
 * ملاحظة: مُصدَّرة لأغراض الاختبار (تغيير غير سلوكي وقابل للعكس).
 *
 * السلوك:
 *   - بلا إدخال (undefined/فارغ) → تاريخ اليوم بصيغة DD/MM (دون تغيير).
 *   - إدخال بصيغة مدعومة (YYYY-MM-DD / DD/MM / DD-MM) → DD/MM (دون تغيير).
 *   - إدخال مُقدَّم بصيغة غير معروفة/غير قابلة للتحليل → null (بدل الرجوع الصامت لليوم).
 */
export function resolveDateToDayMonth(input?: string): string | null {
  if (!input) {
    // اليوم الحالي
    const now = new Date()
    return formatDayMonth(now.getDate(), now.getMonth() + 1)
  }

  // صيغة YYYY-MM-DD
  const isoMatch = input.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return formatDayMonth(parseInt(isoMatch[3]), parseInt(isoMatch[2]))
  }

  // صيغة DD/MM مباشرة
  const dayMonthMatch = input.match(/^(\d{1,2})\/(\d{1,2})$/)
  if (dayMonthMatch) {
    return formatDayMonth(parseInt(dayMonthMatch[1]), parseInt(dayMonthMatch[2]))
  }

  // صيغة DD-MM
  const dashMatch = input.match(/^(\d{1,2})-(\d{1,2})$/)
  if (dashMatch) {
    return formatDayMonth(parseInt(dashMatch[1]), parseInt(dashMatch[2]))
  }

  // تاريخ مُقدَّم بصيغة غير قابلة للتحليل → إشارة عدم صلاحية (لا رجوع صامت لليوم)
  return null
}

function formatDayMonth(day: number, month: number): string {
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}`
}
