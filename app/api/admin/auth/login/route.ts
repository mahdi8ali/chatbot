/**
 * مسار تسجيل دخول الإدارة — POST /api/admin/auth/login
 *
 * يتحقّق من اسم المستخدم وكلمة المرور مقابل مصدر بيانات الاعتماد، وعند النجاح
 * ينشئ جلسة موقّعة ويضعها في كوكي `HttpOnly`. رسالة الفشل موحّدة دائماً حتى لا
 * نكشف أي الحقلين كان خاطئاً (منع تعداد أسماء المستخدمين).
 */

// ⚠️ منع Next.js من تخزين نتائج المسار + فرض بيئة Node لاستعمال node:crypto
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

import {
  COOKIE_NAME,
  createSession,
  lookupAdmin,
  verifyPassword,
} from "@/lib/server/admin-auth"

// رسالة فشل موحّدة — لا تكشف الحقل الخاطئ إطلاقاً
const UNAUTHORIZED = () =>
  Response.json({ error: "بيانات الدخول غير صحيحة" }, { status: 401 })

export async function POST(req: Request): Promise<Response> {
  try {
    let username: unknown
    let password: unknown
    try {
      const body = await req.json()
      username = body?.username
      password = body?.password
    } catch {
      return UNAUTHORIZED() // جسم غير صالح ⇒ فشل موحّد
    }

    if (typeof username !== "string" || typeof password !== "string") {
      return UNAUTHORIZED()
    }

    const admin = lookupAdmin(username)
    if (!admin) return UNAUTHORIZED()
    if (!verifyPassword(password, admin.passwordHash)) return UNAUTHORIZED()

    const session = createSession(admin.username)
    const ttlSeconds = Number(process.env.ADMIN_SESSION_TTL_HOURS ?? 8) * 3600
    // Secure في الإنتاج فقط — كي يعمل عبر http://localhost أثناء التطوير
    const secure = process.env.NODE_ENV === "production" ? " Secure;" : ""
    const cookie = `${COOKIE_NAME}=${encodeURIComponent(
      session
    )}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${ttlSeconds}`

    return Response.json(
      { ok: true, username: admin.username },
      { headers: { "Set-Cookie": cookie } }
    )
  } catch (err: any) {
    console.error("[Admin Login API]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
