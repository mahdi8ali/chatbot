/**
 * live-streams-service.ts — كاميرات البثّ المباشر من جدول `live_streams`
 *
 * مصدر جديد أُضيف 2026-08-14: روابط بثّ مباشر (HLS) حقيقية لكاميرات داخل
 * العتبة العباسية المقدسة (٦ صفوف فقط وقت الإضافة — عدد ثابت صغير، لا يحتاج
 * بحثاً أو ترقيماً، يُعاد كاملاً دائماً كبقية أدوات القوائم الصغيرة مثل
 * get_social_media_links). تحقّقت حيّاً: صفّ واحد فقط عادة `active=1` في وقت
 * معيّن (الكاميرا "الرئيسية" المعروضة فعلياً على الموقع)، والبقية زوايا
 * كاميرات إضافية (الضريح، مدخل الحرم، الصحن، باب القبلة...) قد تكون معطّلة.
 *
 * ⚠️ عمود `title` نصّ JSON خام متعدّد اللغة (`{"ar": "...", "en": "...", ...}`)
 * — لا عمود عربي منفصل؛ يُستخرج مفتاح "ar" في JS (لا SQL JSON_EXTRACT، تفادياً
 * لاختلاف دعم إصدارات MySQL). كل الصفوف الستّة تحمل مفتاح "ar" صالحاً (تحقّقت).
 *
 * ⚠️ عمود `image` اسم ملف مجرّد بلا مسار أساس مؤكَّد (بخلاف publications حيث
 * أكّد المالك المسار) — **لا يُبنى رابط صورة هنا** تفادياً لتخمين مسار قد يكون
 * خاطئاً؛ الحقل الوحيد المضمون هو رابط البثّ نفسه (`source`)، مصدره دائماً
 * `stream.alkafeel.net` (تحقّقت من كل الصفوف الستّة).
 */
import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

interface LiveStreamRow extends RowDataPacket {
  id: number
  title: string
  source: string
  active: number
  sort: number
}

function extractArabicTitle(raw: string): string {
  try {
    const parsed = JSON.parse(raw)
    return String(parsed?.ar || "").trim() || "بثّ مباشر"
  } catch {
    return "بثّ مباشر"
  }
}

export async function getLiveStreams(): Promise<APICallResult> {
  try {
    const db = getPool()
    const [rows] = await db.execute<LiveStreamRow[]>(
      `SELECT id, title, source, active, sort FROM live_streams WHERE deleted_at IS NULL ORDER BY sort ASC`
    )

    const streams = (rows as LiveStreamRow[]).map(r => ({
      id: r.id,
      title: extractArabicTitle(r.title),
      url: r.source,
      is_active: r.active === 1,
    }))

    return {
      success: true,
      data: { streams, active_count: streams.filter(s => s.is_active).length, total: streams.length },
    }
  } catch (error: any) {
    console.error("[DB Error - getLiveStreams]:", error?.message)
    return { success: false, error: "تعذّر جلب روابط البثّ المباشر" }
  }
}
