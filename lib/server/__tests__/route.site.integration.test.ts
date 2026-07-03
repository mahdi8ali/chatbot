/**
 * route.site.integration.test.ts — اختبارات تكامل لمسار POST /api/chat/site (Task 5).
 *
 * تتحقق من سلوك المسار end-to-end للحالتين المُبلَّغ عنهما (خارج النطاق)،
 * وشبكة أمان المعلومات العامة، وحفظ السلوك داخل النطاق — **دون أي شبكة أو
 * قاعدة بيانات حقيقية**.
 *
 * ما الذي جرت محاكاته (mocks) ولماذا:
 *  - `@/lib/server/chat-logger`  → منع أي وصول إلى MySQL (createPendingLog يُرجع "1"،
 *    updateChatLog/saveChatLog يُحلّان فوراً). نتحقق من استدعائها ووسائطها.
 *  - `openai` (الافتراضي)         → صف وهمي؛ `chat.completions.create` مُحاكى يكشف
 *    ما إذا حدث استدعاء للنموذج، ويعيد stream وهمياً قابلاً للتكرار async.
 *  - `@/lib/server/function-calling-handler` → تجسّس على `resolveToolCalls` لكشف
 *    الوصول إلى تدفّق الأدوات من عدمه (والإبقاء عليه حتمياً بلا شبكة/DB). محاكاته
 *    تمنع أيضاً تحميل `site-api-service` (تسخين كاش يستعلم DB عند التحميل).
 *  - `@/lib/server/site-api-service` → محاكاة إضافية احتياطية لمنع تأثير التسخين
 *    الجانبي على مستوى الوحدة إن استُورد عبر أي مسار آخر.
 *
 * الوحدات الحقيقية (غير محاكاة): scope-guard، faq، system-prompts، data-sanitizer،
 * rate-limiter، site-tools-definitions، site-api-config — كلها منطق نقي بلا I/O.
 *
 * _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 3.5_
 */

import { FALLBACK_OUT_OF_SCOPE } from "../system-prompts"

// ── المحاكيات (تُرفع hoisted فوق الاستيرادات؛ الأسماء مسبوقة بـ mock كما يتطلب jest) ──

const mockCreatePendingLog = jest.fn<Promise<string | null>, [string | undefined, string]>()
const mockUpdateChatLog = jest.fn<Promise<void>, any>()
const mockSaveChatLog = jest.fn<Promise<string | null>, any>()

jest.mock("../chat-logger", () => ({
  __esModule: true,
  createPendingLog: mockCreatePendingLog,
  updateChatLog: mockUpdateChatLog,
  saveChatLog: mockSaveChatLog,
}))

const mockOpenAICreate = jest.fn()

jest.mock("openai", () => ({
  __esModule: true,
  default: jest.fn().mockImplementation(() => ({
    chat: { completions: { create: mockOpenAICreate } },
  })),
}))

const mockResolveToolCalls = jest.fn()

jest.mock("../function-calling-handler", () => ({
  __esModule: true,
  resolveToolCalls: mockResolveToolCalls,
}))

// منع تسخين الكاش (side-effect يستعلم DB عند التحميل) إن استُورد عبر أي مسار.
jest.mock("../site-api-service", () => ({
  __esModule: true,
  executeToolByName: jest.fn(),
}))

// استيراد المسار بعد إعداد المحاكيات
import { POST } from "@/app/api/chat/site/route"

// ── أدوات مساعدة ──────────────────────────────────────────────────────────

let ipCounter = 0

function makeRequest(question: string, session_id = "test-session"): Request {
  ipCounter++
  return new Request("http://localhost/api/chat/site", {
    method: "POST",
    body: JSON.stringify({
      messages: [{ role: "user", content: question }],
      session_id,
    }),
    headers: {
      "content-type": "application/json",
      // IP فريد لكل طلب لتفادي تراكم عدّاد rate-limiter بين الاختبارات
      "x-forwarded-for": `10.0.0.${ipCounter}`,
    },
  })
}

/** stream وهمي قابل للتكرار async يبثّ نصاً واحداً بصيغة chunks OpenAI. */
function makeFakeOpenAIStream(text: string) {
  return {
    async *[Symbol.asyncIterator]() {
      yield { choices: [{ delta: { content: text } }] }
    },
  }
}

/** إيجاد وسائط آخر استدعاء لـ updateChatLog. */
function lastUpdateArgs() {
  const calls = mockUpdateChatLog.mock.calls
  return calls[calls.length - 1]
}

beforeEach(() => {
  jest.clearAllMocks()
  mockCreatePendingLog.mockResolvedValue("1")
  mockUpdateChatLog.mockResolvedValue(undefined)
  mockSaveChatLog.mockResolvedValue("1")
  // افتراضياً: تدفّق الأدوات يعيد رداً مباشراً بلا أدوات (deterministic)
  mockResolveToolCalls.mockResolvedValue({
    resolvedMessages: [],
    needsFinalCall: false,
    iterations: 1,
    directAnswer: "رد داخل النطاق (محاكاة)",
  })
  // افتراضياً: create يعيد stream وهمياً (لمسار الأدوات)
  mockOpenAICreate.mockResolvedValue(makeFakeOpenAIStream("رد متدفّق (محاكاة)"))
})

// ─────────────────────────────────────────────────────────────────────────
// (1) حالتا الإبلاغ — خارج النطاق
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/chat/site — الأسئلة خارج النطاق (Req 2.1, 2.2, 2.3)", () => {
  const outOfScopeCases = [
    "متى موعد 10 محرم من سنة 1448 هجرية؟",
    "متى زيارة الأربعين؟",
  ]

  it.each(outOfScopeCases)(
    "يبثّ اعتذار FALLBACK_OUT_OF_SCOPE ولا يستدعي أي أداة/نموذج لـ: %s",
    async (question) => {
      const res = await POST(makeRequest(question))
      const body = await res.text()

      // (أ) بثّ نص الاعتذار الموحّد
      expect(body).toContain(FALLBACK_OUT_OF_SCOPE)

      // (ب) لم يُستدعَ تدفّق الأدوات ولا النموذج (قصر المسار عبر الحارس)
      expect(mockResolveToolCalls).not.toHaveBeenCalled()
      expect(mockOpenAICreate).not.toHaveBeenCalled()

      // (ج) ترويسة X-Chat-Log-Id موجودة والتسجيل was_tool_used=false
      expect(res.headers.get("X-Chat-Log-Id")).toBe("1")
      expect(mockUpdateChatLog).toHaveBeenCalledTimes(1)
      const [logId, data] = lastUpdateArgs()
      expect(logId).toBe("1")
      expect(data.wasToolUsed).toBe(false)
      expect(data.finalAnswer).toBe(FALLBACK_OUT_OF_SCOPE)

      // (د) لا تاريخ مُختَرَع: النص هو الاعتذار فقط (بلا أرقام أوقات صلاة)
      expect(body).not.toMatch(/\d{1,2}:\d{2}/)
    }
  )
})

// ─────────────────────────────────────────────────────────────────────────
// (2) شبكة الأمان — معلومة عامة لا يلتقطها الحارس الحتمي
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/chat/site — شبكة أمان المعلومات العامة (Req 2.3)", () => {
  it("لا يقصر المسار كخارج نطاق بل يصل إلى تدفّق الأدوات (tool_choice auto) لـ: كم عدد سكان العراق؟", async () => {
    const res = await POST(makeRequest("كم عدد سكان العراق؟"))
    const body = await res.text()

    // لم يُبثّ اعتذار الحارس — لم يُقصَّر المسار كخارج نطاق
    expect(body).not.toContain(FALLBACK_OUT_OF_SCOPE)

    // وصل إلى تدفّق الأدوات (شبكة الأمان: القرار متروك للنموذج عبر auto)
    expect(mockResolveToolCalls).toHaveBeenCalledTimes(1)

    // الترويسة موجودة
    expect(res.headers.get("X-Chat-Log-Id")).toBe("1")
  })
})

// ─────────────────────────────────────────────────────────────────────────
// (3) حفظ السلوك داخل النطاق — لا false positives
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/chat/site — تمرير داخل النطاق (Req 3.1, 3.2, 3.5)", () => {
  const inScopeCases = [
    "أوقات الصلاة اليوم",
    "ما أخبار خدمات العتبة في الأربعين؟",
  ]

  it.each(inScopeCases)(
    "لا يقصر الحارس المسار ويصل إلى تدفّق الأدوات لـ: %s",
    async (question) => {
      const res = await POST(makeRequest(question))
      const body = await res.text()

      // لم يُبثّ اعتذار الحارس
      expect(body).not.toContain(FALLBACK_OUT_OF_SCOPE)

      // وصل إلى تدفّق الأدوات (لا انحدار false-positive)
      expect(mockResolveToolCalls).toHaveBeenCalledTimes(1)
      expect(res.headers.get("X-Chat-Log-Id")).toBe("1")
    }
  )
})

// ─────────────────────────────────────────────────────────────────────────
// (4) قصر مسار FAQ (اختياري) — يُفحص قبل الحارس ويقصر المسار حتمياً
// ─────────────────────────────────────────────────────────────────────────

describe("POST /api/chat/site — قصر مسار FAQ (Req 3.3)", () => {
  it("يعيد إجابة FAQ الموثوقة دون استدعاء أداة/نموذج لـ: من هي أم العباس؟", async () => {
    const res = await POST(makeRequest("من هي أم العباس؟"))
    const body = await res.text()

    // إجابة FAQ (أم البنين) بُثّت مباشرة
    expect(body).toContain("أم البنين")

    // لم يُستدعَ تدفّق الأدوات ولا النموذج
    expect(mockResolveToolCalls).not.toHaveBeenCalled()
    expect(mockOpenAICreate).not.toHaveBeenCalled()

    // تسجيل was_tool_used=false مع ترويسة السجل
    expect(res.headers.get("X-Chat-Log-Id")).toBe("1")
    expect(mockUpdateChatLog).toHaveBeenCalledTimes(1)
    expect(lastUpdateArgs()[1].wasToolUsed).toBe(false)
  })
})
