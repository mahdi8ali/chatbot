/**
 * Admin Auth (Server-only) — قراءة جلسة الإدارة في مكوّنات الخادم
 *
 * مفصولة عن admin-auth.ts لأنها تعتمد `next/headers` (المتاح في مكوّنات/تخطيطات
 * الخادم فقط، وغير المتاح في middleware). إبقاء admin-auth.ts نقيّاً (node:crypto
 * فقط) يسمح لـ middleware.ts باستيراد verifySession/COOKIE_NAME بأمان.
 */

import "server-only"
import { cookies } from "next/headers"
import { COOKIE_NAME, verifySession } from "./admin-auth"

/**
 * مساعد لمكوّنات الخادم/التخطيط: يقرأ الجلسة من cookies() ويعيد { username } | null.
 * تستعمله admin/layout.tsx لعرض اسم المستخدم (والتأكيد الخادمي كطبقة إضافية).
 */
export function getAdminSession(): { username: string } | null {
  const token = cookies().get(COOKIE_NAME)?.value
  return verifySession(token)
}
