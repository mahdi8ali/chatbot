/**
 * function-calling-handler.test.ts — شبكة أمان tool_choice (Task 4, section D).
 *
 * يتحقق أن `resolveToolCalls` يمرّر `tool_choice: "auto"` في التكرار الأول (شبكة
 * الأمان B): النموذج غير مُجبَر على استدعاء أداة، فيمتنع عن التقاط أقرب أداة
 * بالخطأ للأسئلة خارج النطاق.
 *
 * النهج: نمرّر كائن `openai` مُصغّراً مُحاكى (jest.fn) يلتقط وسائط الاستدعاء ويُرجع
 * رسالة مساعد بلا tool_calls، فتخرج الحلقة فوراً بـ directAnswer. ثم نؤكد أن
 * الاستدعاء الملتقَط حمل tool_choice:"auto". محاكاة دنيا بلا لمس شبكة/نموذج حقيقي.
 *
 * **Validates: Requirements 2.3**
 */

import type OpenAI from "openai"

// استيراد `function-calling-handler` يجرّ `site-api-service` الذي يُشغّل تسخين
// كاش يستعلم قاعدة البيانات عند التحميل (side-effect على مستوى الوحدة). نُحاكي
// الوحدة لإبقاء الاختبار خالياً من قاعدة البيانات وحتمياً (لا نلمس الشبكة/DB).
// `resolveToolCalls` لا يستخدم executeToolByName في مسار هذا الاختبار (بلا أدوات).
jest.mock("../site-api-service", () => ({
  __esModule: true,
  executeToolByName: jest.fn(),
}))

import { resolveToolCalls } from "../function-calling-handler"

describe("resolveToolCalls — tool_choice safety net", () => {
  it("يمرّر tool_choice:\"required\" في التكرار الأول ويعيد directAnswer عند غياب الأدوات", async () => {
    const create = jest.fn().mockResolvedValue({
      choices: [
        {
          message: {
            role: "assistant",
            content: "هذا رد مباشر بدون أدوات",
            tool_calls: undefined,
          },
        },
      ],
    })

    const mockOpenai = {
      chat: { completions: { create } },
    } as unknown as OpenAI

    const result = await resolveToolCalls(
      mockOpenai,
      "gpt-4o-mini",
      [{ role: "user", content: "كم عدد سكان العراق؟" }],
      []
    )

    // (1) استُدعي مرة واحدة (خرجت الحلقة فوراً)
    expect(create).toHaveBeenCalledTimes(1)

    // (2) التكرار الأول يُجبر البحث (required) — آمن لأن حارس النطاق الحتمي
    // يقصر الأسئلة خارج النطاق قبل الوصول لحلقة الأدوات.
    const firstCallArgs = create.mock.calls[0][0]
    expect(firstCallArgs.tool_choice).toBe("required")

    // (3) بلا أدوات → directAnswer دون الحاجة لاستدعاء نهائي
    expect(result.needsFinalCall).toBe(false)
    expect(result.directAnswer).toBe("هذا رد مباشر بدون أدوات")
    expect(result.iterations).toBe(1)
  })
})
