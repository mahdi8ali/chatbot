import { NextResponse, type NextRequest } from "next/server"

/**
 * Middleware (بيئة Edge) — حارس صفحات لوحة الإدارة (طبقة تجربة استخدام فقط).
 *
 * ⚠️ الـ middleware في Next.js يعمل على Edge، ولا يمكنه استيراد `node:crypto`
 * (ولا التصريح runtime = "nodejs"). لذا لا نتحقّق من توقيع الجلسة هنا؛ نكتفي
 * بفحص *وجود* كوكي الجلسة ونحوّل إلى صفحة الدخول عند غيابه.
 *
 * الإنفاذ الأمني الحقيقي (تحقّق توقيع HMAC + انتهاء الصلاحية) يقع في:
 *  - `requireAdmin` داخل كل مسارات الـ API (بيئة Node) — الطبقة المُلزِمة.
 *  - `getAdminSession` في قشرة الإدارة الخادمية (تعرض المحتوى بلا هوية عند بطلان
 *    الكوكي، ثم أول طلب API يعيد 401 فيُوجَّه العميل للدخول).
 * كوكي مزوّر/منتهٍ يجتاز فحص الوجود هنا لكنه يُرفض حتماً في طبقة الـ API.
 */

const COOKIE_NAME = "admin_session"

// صفحات الإدارة: /[locale]/admin وأي مسار فرعي عداها /[locale]/admin/login
const ADMIN_PAGE_RE = /^\/[^/]+\/admin(?:\/(?!login).*)?$/

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // عند زيارة الجذر "/" → إعادة توجيه لـ /ar
  if (pathname === "/") {
    return NextResponse.redirect(new URL("/ar", request.url))
  }

  // حراسة صفحات الإدارة (عدا صفحة تسجيل الدخول) — فحص وجود الكوكي فقط
  if (ADMIN_PAGE_RE.test(pathname)) {
    const token = request.cookies.get(COOKIE_NAME)?.value
    if (!token) {
      const locale = pathname.split("/")[1] || "ar"
      const loginUrl = new URL(`/${locale}/admin/login`, request.url)
      loginUrl.searchParams.set("next", pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: "/((?!api|static|.*\\..*|_next).*)"
}
