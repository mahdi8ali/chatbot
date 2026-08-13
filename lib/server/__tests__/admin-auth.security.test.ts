/**
 * admin-auth.security.test.ts — اختبارات انحدار لثغرة تزوير جلسة الإدارة.
 *
 * الثغرة الأصلية: كان `sign()` يستعمل `process.env.ADMIN_SESSION_SECRET ?? ""`،
 * فعند غياب السرّ يصير مفتاح HMAC سلسلة فارغة — ويستطيع أي طرف يعرف بنية الحمولة
 * ("<payloadBase64url>.<signatureBase64url>") توليد كوكي جلسة صالحة والوصول إلى
 * لوحة الإدارة كاملةً (سجلّ المحادثات + تعديل ما يقوله البوت).
 *
 * السلوك المطلوب: مغلق افتراضياً (fail closed) — غياب السرّ أو قِصَره ⇒ لا إصدار
 * جلسة ولا قبول أي جلسة، متّسقاً مع سلوك lookupAdmin.
 */

import { createHmac } from "node:crypto"

const VALID_SECRET = "a".repeat(64)

/** يعيد تحميل الوحدة كي تلتقط قيمة البيئة الحالية (لا حالة مخبّأة بينها). */
function loadModule() {
  let mod: typeof import("../admin-auth")
  jest.isolateModules(() => {
    mod = require("../admin-auth")
  })
  return mod!
}

/** يزوّر كوكي جلسة بمفتاح HMAC معيّن (محاكاة المهاجم). */
function forgeSession(username: string, secret: string): string {
  const payload = {
    sub: username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url")
  const sig = createHmac("sha256", secret).update(body).digest("base64url")
  return `${body}.${sig}`
}

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("verifySession — مغلق افتراضياً عند غياب السرّ", () => {
  it("يرفض جلسة مزوّرة بمفتاح فارغ عند غياب ADMIN_SESSION_SECRET", () => {
    delete process.env.ADMIN_SESSION_SECRET
    const { verifySession } = loadModule()

    // هذا بالضبط ما كان يصنعه المهاجم قبل الإصلاح: توقيع بمفتاح فارغ.
    const forged = forgeSession("admin", "")

    expect(verifySession(forged)).toBeNull()
  })

  it("يرفض جلسة مزوّرة عندما يكون السرّ أقصر من 32 محرفاً", () => {
    process.env.ADMIN_SESSION_SECRET = "short"
    const { verifySession } = loadModule()

    expect(verifySession(forgeSession("admin", "short"))).toBeNull()
  })

  it("يرفض أي جلسة موقّعة بسرّ مختلف عن سرّ الخادم", () => {
    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    const { verifySession } = loadModule()

    expect(verifySession(forgeSession("admin", "b".repeat(64)))).toBeNull()
  })
})

describe("createSession — لا يُصدر جلسة بمفتاح ضعيف", () => {
  it("يرمي عند غياب ADMIN_SESSION_SECRET", () => {
    delete process.env.ADMIN_SESSION_SECRET
    const { createSession } = loadModule()

    expect(() => createSession("admin")).toThrow(/ADMIN_SESSION_SECRET/)
  })

  it("يرمي عند قِصَر السرّ", () => {
    process.env.ADMIN_SESSION_SECRET = "too-short-secret"
    const { createSession } = loadModule()

    expect(() => createSession("admin")).toThrow(/ADMIN_SESSION_SECRET/)
  })
})

describe("المسار السليم — حفظ السلوك الأصلي", () => {
  it("جلسة أنشأها الخادم بسرّ سليم تُقبل ويُستخرج منها اسم المستخدم", () => {
    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    const { createSession, verifySession } = loadModule()

    const session = createSession("مدير")
    expect(verifySession(session)).toEqual({ username: "مدير" })
  })

  it("يرفض الجلسة المنتهية الصلاحية", () => {
    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    process.env.ADMIN_SESSION_TTL_HOURS = "-1" // انتهت قبل ساعة
    const { createSession, verifySession } = loadModule()

    expect(verifySession(createSession("admin"))).toBeNull()
  })

  it("يرفض القيم المشوّهة بلا رمي استثناء", () => {
    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    const { verifySession } = loadModule()

    for (const bad of ["", "بلا-نقطة", ".sig", "payload.", "a.b.c"]) {
      expect(verifySession(bad)).toBeNull()
    }
    expect(verifySession(undefined)).toBeNull()
    expect(verifySession(null)).toBeNull()
  })
})

describe("isAdminAuthConfigured", () => {
  it("false عند نقص أي من المتغيّرات الثلاثة", () => {
    process.env.ADMIN_USERNAME = "admin"
    process.env.ADMIN_PASSWORD_HASH = "salt:hash"
    delete process.env.ADMIN_SESSION_SECRET
    expect(loadModule().isAdminAuthConfigured()).toBe(false)

    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    delete process.env.ADMIN_USERNAME
    expect(loadModule().isAdminAuthConfigured()).toBe(false)
  })

  it("true عند اكتمال الإعداد", () => {
    process.env.ADMIN_USERNAME = "admin"
    process.env.ADMIN_PASSWORD_HASH = "salt:hash"
    process.env.ADMIN_SESSION_SECRET = VALID_SECRET
    expect(loadModule().isAdminAuthConfigured()).toBe(true)
  })
})

describe("verifyPassword — حفظ السلوك", () => {
  it("يطابق كلمة المرور الصحيحة ويرفض الخاطئة والمخزون المشوّه", () => {
    const { hashPassword, verifyPassword } = loadModule()
    const stored = hashPassword("كلمة-سرّ-قوية")

    expect(verifyPassword("كلمة-سرّ-قوية", stored)).toBe(true)
    expect(verifyPassword("خاطئة", stored)).toBe(false)
    expect(verifyPassword("أي-شيء", "بلا-نقطتين")).toBe(false)
    expect(verifyPassword("أي-شيء", "")).toBe(false)
  })
})
