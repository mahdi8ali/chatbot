/**
 * Admin Auth Module — وحدة مصادقة لوحة الإدارة
 *
 * مصادقة حقيقية قائمة على تسجيل الدخول (اسم مستخدم + كلمة مرور مُجزّأة بـ scrypt)
 * وجلسة موقّعة (HMAC-SHA256) في كوكي `HttpOnly`. مكتفية ذاتياً باستخدام
 * `node:crypto` فقط — بلا تبعيات جديدة ولا مكتبة JWT ولا خدمة خارجية.
 *
 * ثلاثة أجزاء:
 *  (أ) تجزئة/تحقّق كلمة المرور عبر scrypt (hashPassword / verifyPassword).
 *  (ب) جلسة موقّعة عديمة الحالة (createSession / verifySession).
 *  (ج) حراس الوصول (requireAdmin للـ API + getAdminSession لمكوّنات الخادم) ومصدر
 *      بيانات الاعتماد المعزول (lookupAdmin).
 */

import { scryptSync, randomBytes, createHmac, timingSafeEqual } from "node:crypto"

// ملاحظة: لا نستورد `next/headers` هنا عمداً. هذه الوحدة يستوردها middleware.ts،
// و`next/headers` غير متاح في بيئة الـ middleware ويُسبّب عطلاً وقت التشغيل. قراءة
// الجلسة من الكوكيز في مكوّنات الخادم موجودة في admin-auth-server.ts (getAdminSession).

// ===== ثوابت =====
export const COOKIE_NAME = "admin_session"

const SCRYPT_KEYLEN = 64
const DEFAULT_TTL_HOURS = 8

/** الحدّ الأدنى لطول سرّ التوقيع (32 بايت hex = 64 محرفاً؛ نقبل 32 محرفاً كحدّ أدنى متساهل). */
const MIN_SECRET_LENGTH = 32

// ===== (أ) تجزئة كلمة المرور (scrypt) =====

/**
 * يُجزّئ كلمة مرور صريحة عبر scrypt مع ملح عشوائي.
 * يعيد سلسلة "saltHex:hashHex" جاهزة للتخزين في ADMIN_PASSWORD_HASH.
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, SCRYPT_KEYLEN)
  return `${salt.toString("hex")}:${hash.toString("hex")}`
}

/**
 * يتحقّق من كلمة مرور مقابل مخزون "saltHex:hashHex" بمقارنة ثابتة الزمن.
 * يعيد false عند أي تشوّه في الصيغة (بلا رمي استثناء) أو عند عدم التطابق.
 */
export function verifyPassword(password: string, stored: string): boolean {
  const [saltHex, hashHex] = (stored ?? "").split(":")
  if (!saltHex || !hashHex) return false
  const salt = Buffer.from(saltHex, "hex")
  const expected = Buffer.from(hashHex, "hex")
  if (expected.length !== SCRYPT_KEYLEN) return false
  const actual = scryptSync(password, salt, SCRYPT_KEYLEN)
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

// ===== (ب) الجلسة الموقّعة (HMAC-SHA256) =====

interface SessionPayload {
  sub: string
  iat: number
  exp: number
}

const b64url = (b: Buffer): string => b.toString("base64url")

/**
 * يقرأ سرّ التوقيع من البيئة، أو null إن غاب أو كان أقصر من الحدّ الأدنى.
 *
 * ⚠️ حاسم أمنياً: السلوك السابق كان `?? ""` — أي أن غياب السرّ يعني توقيعاً
 * بمفتاح HMAC فارغ، فيستطيع أي طرف يعرف بنية الحمولة توليد كوكي جلسة صالحة
 * والوصول إلى لوحة الإدارة كاملةً. الآن: غياب السرّ ⇒ لا توقيع ولا تحقّق
 * (مغلق افتراضياً — fail closed)، متّسقاً مع سلوك lookupAdmin.
 */
function getSessionSecret(): string | null {
  const secret = process.env.ADMIN_SESSION_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null
  return secret
}

/**
 * هل مصادقة الإدارة مُهيّأة بالكامل؟ (اسم مستخدم + تجزئة كلمة مرور + سرّ جلسة سليم)
 * تستعملها مسارات الـ API لإرجاع خطأ إعداد صريح بدل فشل غامض.
 */
export function isAdminAuthConfigured(): boolean {
  return Boolean(
    process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD_HASH && getSessionSecret()
  )
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("base64url")
}

/**
 * ينشئ قيمة كوكي جلسة موقّعة للمستخدم.
 * الصيغة: "<payloadBase64url>.<signatureBase64url>" حيث payload = { sub, iat, exp }.
 * exp = iat + TTL (افتراضي 8 ساعات، أو ADMIN_SESSION_TTL_HOURS).
 *
 * @throws إن غاب ADMIN_SESSION_SECRET أو كان أقصر من MIN_SECRET_LENGTH — لا نُصدر
 *         جلسة بمفتاح ضعيف إطلاقاً.
 */
export function createSession(username: string): string {
  const secret = getSessionSecret()
  if (!secret) {
    throw new Error(
      "ADMIN_SESSION_SECRET غير مضبوط أو أقصر من 32 محرفاً — تسجيل دخول الإدارة معطّل."
    )
  }
  const ttlH = Number(process.env.ADMIN_SESSION_TTL_HOURS ?? DEFAULT_TTL_HOURS)
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub: username,
    iat: now,
    exp: now + ttlH * 3600,
  }
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  return `${body}.${sign(body, secret)}`
}

/**
 * يتحقّق من قيمة كوكي الجلسة: يعيد { username } عند صحّة التوقيع وعدم انتهاء exp،
 * وإلا null. مقارنة التوقيع ثابتة الزمن (timingSafeEqual) لمنع تسريب التوقيت.
 *
 * مغلق افتراضياً: عند غياب ADMIN_SESSION_SECRET (أو قِصَره) تُرفض كل الجلسات،
 * فلا يمكن تزوير كوكي بمفتاح فارغ.
 */
export function verifySession(
  value: string | undefined | null
): { username: string } | null {
  if (!value) return null
  const secret = getSessionSecret()
  if (!secret) {
    console.error(
      "[Admin Auth] ADMIN_SESSION_SECRET غائب أو أقصر من 32 محرفاً — رُفضت الجلسة (مغلق افتراضياً)."
    )
    return null
  }
  const dot = value.lastIndexOf(".")
  if (dot <= 0) return null
  const body = value.slice(0, dot)
  const givenSig = value.slice(dot + 1)
  const expectedSig = sign(body, secret)
  const a = Buffer.from(givenSig)
  const b = Buffer.from(expectedSig)
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null // توقيع غير مطابق ⇒ مرفوض
  try {
    const p = JSON.parse(
      Buffer.from(body, "base64url").toString()
    ) as SessionPayload
    if (typeof p.sub !== "string" || typeof p.exp !== "number") return null
    if (p.exp < Math.floor(Date.now() / 1000)) return null // منتهية ⇒ مرفوضة
    return { username: p.sub }
  } catch {
    return null
  }
}

// ===== (ج) حراس الوصول ومصدر بيانات الاعتماد =====

function readSessionCookie(req: Request): string | null {
  const cookie = req.headers.get("cookie") ?? ""
  const m = cookie.match(/(?:^|;\s*)admin_session=([^;]+)/)
  return m ? decodeURIComponent(m[1]) : null
}

/**
 * حارس واجهات الـ API: يعيد Response 401 عند غياب/بطلان الجلسة، أو null عند الصحّة.
 * الاستعمال في كل route:  const deny = requireAdmin(req); if (deny) return deny
 */
export function requireAdmin(req: Request): Response | null {
  const session = verifySession(readSessionCookie(req))
  return session ? null : Response.json({ error: "غير مصرّح" }, { status: 401 })
}

/**
 * مصدر بيانات الاعتماد (معزول للترقية المستقبلية لجدول admins).
 * الآن: يقرأ من ADMIN_USERNAME/ADMIN_PASSWORD_HASH؛ يعيد null إن غابت البيئة
 * (مغلق افتراضياً) أو إن لم يطابق اسم المستخدم.
 */
export function lookupAdmin(
  username: string
): { username: string; passwordHash: string } | null {
  const adminUsername = process.env.ADMIN_USERNAME
  const passwordHash = process.env.ADMIN_PASSWORD_HASH
  if (!adminUsername || !passwordHash) return null // مغلق افتراضياً عند غياب البيئة
  if (username !== adminUsername) return null
  return { username, passwordHash }
}
