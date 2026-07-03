/**
 * مسار تسجيل خروج الإدارة — POST /api/admin/auth/logout
 *
 * يمسح كوكي الجلسة (Max-Age=0) بلا حاجة لأي حالة على الخادم؛ الجلسة عديمة الحالة.
 */

// ⚠️ منع Next.js من تخزين نتائج المسار + فرض بيئة Node
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import { COOKIE_NAME } from "@/lib/server/admin-auth"

export async function POST(): Promise<Response> {
  // Secure في الإنتاج فقط — متّسق مع مسار تسجيل الدخول
  const secure = process.env.NODE_ENV === "production" ? " Secure;" : ""
  const cookie = `${COOKIE_NAME}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`
  return Response.json({ ok: true }, { headers: { "Set-Cookie": cookie } })
}
