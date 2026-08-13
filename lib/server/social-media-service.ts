/**
 * social-media-service.ts — روابط حسابات العتبة العباسية على مواقع التواصل
 * من جدول `social_media`.
 *
 * مصدر جديد أُضيف 2026-08-13. جدول صغير (٥ صفوف) لكنه المصدر الوحيد الموثوق —
 * قبله كان سؤال «ما حساباتكم على إنستغرام؟» إمّا يُرفض أو **يُخترع**. لا مجهول
 * هنا (بخلاف publications-service.ts): عمود `link` يخزّن الرابط الكامل جاهزاً.
 */

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

interface SocialMediaRow extends RowDataPacket {
  name: string
  link: string
  count: string | null
}

export async function getSocialMediaLinks(): Promise<APICallResult> {
  try {
    const db = getPool()
    const [rows] = await db.execute<SocialMediaRow[]>(
      `SELECT name, link, count FROM social_media WHERE link IS NOT NULL ORDER BY id`
    )
    const links = (rows as SocialMediaRow[]).map(r => ({
      platform: r.name,
      url: r.link,
      followers: r.count || null,
    }))
    return { success: true, data: { links, total: links.length } }
  } catch (error: any) {
    console.error("[DB Error - getSocialMediaLinks]:", error?.message)
    return { success: false, error: "تعذّر جلب روابط التواصل الاجتماعي" }
  }
}
