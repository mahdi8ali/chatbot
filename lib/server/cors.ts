/**
 * cors.ts — قائمة الأصول (Origins) المسموح لها باستدعاء نقاط الشات العامة.
 *
 * ⚠️ كان السلوك السابق في كل من /api/chat/site و /api/chat/feedback هو عكس أي
 * origin (أو `*`)، أي أن أي موقع على الإنترنت يستطيع تشغيل الشات من متصفّح زوّاره
 * — وكل طلب يكلّف استدعاءات OpenAI واستعلامات MySQL. هذه الوحدة هي المصدر الوحيد
 * لقرار السماح، كي لا تنحرف النقطتان عن بعضهما مجدداً.
 *
 * الإضافة التشغيلية: عند تضمين الودجت في نطاق جديد أضِفه إلى متغيّر البيئة
 * CHAT_ALLOWED_ORIGINS (قائمة مفصولة بفواصل) وإلّا حُجب الطلب بـ 403.
 */

/** الأصول الثابتة المسموح بها + ما يُضاف عبر البيئة + مضيفات التطوير. */
const STATIC_ALLOWED_ORIGINS: string[] = [
  process.env.SITE_DOMAIN || "https://alkafeel.net",
  "https://alkafeel.net",
  "https://www.alkafeel.net",
  ...(process.env.CHAT_ALLOWED_ORIGINS || "")
    .split(",")
    .map(o => o.trim())
    .filter(Boolean),
  // "null" = أصل صفحات file:// المفتوحة محلياً أثناء التطوير
  ...(process.env.NODE_ENV !== "production" ? ["null"] : []),
]

/** هل نحن في بيئة تطوير؟ (يُسمح فيها بأي منفذ localhost) */
const IS_DEV = process.env.NODE_ENV !== "production"

/**
 * هل الأصل مسموح؟ يقبل القائمة الثابتة، وأي نطاق فرعي لـ alkafeel.net
 * (projects. / static1. / ...)، وأي منفذ على localhost أثناء التطوير فقط.
 * أصل غائب ⇒ false (لا ترويسة CORS، لا حجب).
 */
export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false
  if (STATIC_ALLOWED_ORIGINS.includes(origin)) return true
  try {
    const host = new URL(origin).hostname.toLowerCase()
    // التطوير: أي منفذ على المضيف المحلّي (المنافذ تتغيّر بين الجلسات).
    if (IS_DEV && (host === "localhost" || host === "127.0.0.1" || host === "[::1]")) {
      return true
    }
    return host === "alkafeel.net" || host.endsWith(".alkafeel.net")
  } catch {
    return false // "null" وغيره ممّا لا يُحلَّل كـ URL يمرّ عبر القائمة الثابتة فقط
  }
}

/**
 * ترويسات CORS لنقطة عامة. تُضاف Allow-Origin فقط للأصول المسموح بها؛
 * الطلبات بلا origin (خادم-إلى-خادم) لا تحتاجها ويحكمها حدّ المعدّل.
 */
export function corsHeaders(
  origin: string | null | undefined,
  methods: string = "POST, OPTIONS"
): Record<string, string> {
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": methods,
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  }
  if (origin && isAllowedOrigin(origin)) {
    headers["Access-Control-Allow-Origin"] = origin
  }
  return headers
}

/** ردّ الحجب لأصل غير مصرّح به (بلا ترويسات CORS ⇒ لا يقرؤه المتصفّح أصلاً). */
export function forbiddenOrigin(origin: string): Response {
  console.warn(`[CORS] Blocked origin: ${origin}`)
  return new Response(
    JSON.stringify({ error: "هذا النطاق غير مصرّح له باستخدام هذه الخدمة." }),
    { status: 403, headers: { "Content-Type": "application/json", Vary: "Origin" } }
  )
}
