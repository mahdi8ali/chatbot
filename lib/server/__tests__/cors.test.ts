/**
 * cors.test.ts — اختبارات انحدار لقائمة الأصول البيضاء.
 *
 * الثغرة الأصلية: `Access-Control-Allow-Origin: origin || "*"` — أي موقع على
 * الإنترنت كان يستطيع تشغيل الشات من متصفّح زوّاره، وكل طلب يكلّف استدعاءات
 * OpenAI واستعلامات MySQL (استنزاف رصيد + حمل على القاعدة).
 */

const ORIGINAL_ENV = { ...process.env }

function loadModule(env: Record<string, string | undefined> = {}) {
  process.env = { ...ORIGINAL_ENV, ...env }
  let mod: typeof import("../cors")
  jest.isolateModules(() => {
    mod = require("../cors")
  })
  return mod!
}

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe("isAllowedOrigin", () => {
  it("يقبل نطاق الكفيل ونطاقاته الفرعية", () => {
    const { isAllowedOrigin } = loadModule({ NODE_ENV: "production" })
    expect(isAllowedOrigin("https://alkafeel.net")).toBe(true)
    expect(isAllowedOrigin("https://www.alkafeel.net")).toBe(true)
    expect(isAllowedOrigin("https://projects.alkafeel.net")).toBe(true)
    expect(isAllowedOrigin("https://static1.alkafeel.net")).toBe(true)
  })

  it("يرفض أي نطاق خارجي", () => {
    const { isAllowedOrigin } = loadModule({ NODE_ENV: "production" })
    expect(isAllowedOrigin("https://evil.example.com")).toBe(false)
    expect(isAllowedOrigin("http://attacker.test")).toBe(false)
  })

  it("يرفض النطاقات التي تنتحل اسم الكفيل كلاحقة أو سابقة", () => {
    const { isAllowedOrigin } = loadModule({ NODE_ENV: "production" })
    expect(isAllowedOrigin("https://alkafeel.net.evil.com")).toBe(false)
    expect(isAllowedOrigin("https://notalkafeel.net")).toBe(false)
    expect(isAllowedOrigin("https://evil.com/?x=alkafeel.net")).toBe(false)
  })

  it("يرفض أصلاً غائباً (طلب بلا Origin لا يحصل على ترويسة CORS)", () => {
    const { isAllowedOrigin } = loadModule({ NODE_ENV: "production" })
    expect(isAllowedOrigin(null)).toBe(false)
    expect(isAllowedOrigin(undefined)).toBe(false)
    expect(isAllowedOrigin("")).toBe(false)
  })

  it("يقبل النطاقات المُضافة عبر CHAT_ALLOWED_ORIGINS", () => {
    const { isAllowedOrigin } = loadModule({
      NODE_ENV: "production",
      CHAT_ALLOWED_ORIGINS: "https://partner.example.com, https://another.test",
    })
    expect(isAllowedOrigin("https://partner.example.com")).toBe(true)
    expect(isAllowedOrigin("https://another.test")).toBe(true)
    expect(isAllowedOrigin("https://unlisted.example.com")).toBe(false)
  })

  it("يقبل localhost بأي منفذ في التطوير فقط", () => {
    const dev = loadModule({ NODE_ENV: "development" })
    // المنفذ يتغيّر بين جلسات التطوير — يجب ألّا نثبّت 3000/3001 فقط.
    expect(dev.isAllowedOrigin("http://localhost:3000")).toBe(true)
    expect(dev.isAllowedOrigin("http://localhost:3117")).toBe(true)
    expect(dev.isAllowedOrigin("http://127.0.0.1:8080")).toBe(true)

    const prod = loadModule({ NODE_ENV: "production" })
    expect(prod.isAllowedOrigin("http://localhost:3000")).toBe(false)
    expect(prod.isAllowedOrigin("http://127.0.0.1:3117")).toBe(false)
  })
})

describe("corsHeaders", () => {
  it("لا يُصدر Allow-Origin لأصل غير مسموح", () => {
    const { corsHeaders } = loadModule({ NODE_ENV: "production" })
    const h = corsHeaders("https://evil.example.com")
    expect(h["Access-Control-Allow-Origin"]).toBeUndefined()
  })

  it("يُصدر Allow-Origin للأصل المسموح ولا يستعمل النجمة إطلاقاً", () => {
    const { corsHeaders } = loadModule({ NODE_ENV: "production" })
    const h = corsHeaders("https://alkafeel.net")
    expect(h["Access-Control-Allow-Origin"]).toBe("https://alkafeel.net")
    expect(Object.values(h)).not.toContain("*")
  })

  it("يضبط Vary: Origin (سلامة التخزين المؤقّت للـ CDN)", () => {
    const { corsHeaders } = loadModule({ NODE_ENV: "production" })
    expect(corsHeaders("https://alkafeel.net").Vary).toBe("Origin")
    expect(corsHeaders(null).Vary).toBe("Origin")
  })
})

describe("forbiddenOrigin", () => {
  it("يعيد 403 بلا أي ترويسة CORS", () => {
    const { forbiddenOrigin } = loadModule({ NODE_ENV: "production" })
    const res = forbiddenOrigin("https://evil.example.com")
    expect(res.status).toBe(403)
    expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })
})
