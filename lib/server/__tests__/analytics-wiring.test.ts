/**
 * analytics-wiring.test.ts — اختبار ربط أدوات تحليل المحتوى (Task 8.2).
 *
 * يتحقق من ربط الأدوات التحليلية الأربع ضمن خط الأنابيب القائم دون تشويه
 * نتائجها:
 *  (1) سجلّ_الأدوات: الأسماء الأربعة موجودة في `ALLOWED_TOOL_NAMES` و
 *      `isAllowedTool` يعيد true لكلٍّ منها.
 *  (2) مُعالج_استدعاء_الدوال: `handleToolCalls` (الذي يستدعي `processToolCall`
 *      داخلياً) يوجّه كل أداة تحليلية إلى خدمة_التحليلات ويعيد رسالة
 *      role:"tool" بمحتوى JSON يُفكّ (parse) إلى نفس بيانات الخدمة المُحاكاة —
 *      أي لم يمرّ على cleanResultForGPT/cleanProject.
 *
 * النهج: نُحاكي `../analytics-service` بقيم مُعلّبة (canned) لكل دالة، ونُحاكي
 * `../site-api-service` (كما في الاختبار القائم) لتفادي تسخين كاش قاعدة
 * البيانات عند تحميل الوحدة. لا لمس شبكة/قاعدة بيانات حقيقية.
 *
 * **Validates: Requirements 9.1, 9.2, 9.3, 9.4**
 */

import type OpenAI from "openai"

// نتائج مُعلّبة (canned) لكل دالة تحليلية — تُستخدم للتأكيد على عدم تشويهها.
const COUNT_MENTIONS_DATA = {
  query: "علي البدري",
  total: 7,
  window: { from: "2024-01-01 00:00:00", to: "2024-01-31 23:59:59", label: "آخر 30 يوماً" },
  basis: { method: "keyword_match", fields: ["title", "content"], note: "رقم تقريبي" },
  sample: [{ id: 12, title: "خبر", created_at: "2024-01-15 10:00:00", url: "https://x/12" }],
}
const TIMELINE_DATA = {
  query: "الأربعين",
  granularity: "month",
  window: { from: null, to: null, label: "كل الفترات" },
  buckets: [{ bucket: "2024-01", count: 3 }, { bucket: "2024-02", count: 4 }],
  total: 7,
  basis: { method: "keyword_match", fields: ["title", "content"], note: "رقم تقريبي" },
}
const TOP_TOPICS_DATA = {
  window: { from: null, to: null, label: "كل الفترات" },
  dimension: "category",
  items: [{ label: "تصنيف 5", category_id: 5, count: 42 }],
}
const COUNT_NEWS_DATA = {
  total: 128,
  window: { from: null, to: null, label: "كل الفترات" },
  category_id: null,
}

// محاكاة خدمة_التحليلات: كل دالة تعيد { success: true, data } مُعلّباً.
jest.mock("../analytics-service", () => ({
  __esModule: true,
  countMentions: jest.fn(async () => ({ success: true, data: COUNT_MENTIONS_DATA })),
  mentionsTimeline: jest.fn(async () => ({ success: true, data: TIMELINE_DATA })),
  topTopics: jest.fn(async () => ({ success: true, data: TOP_TOPICS_DATA })),
  countNews: jest.fn(async () => ({ success: true, data: COUNT_NEWS_DATA })),
}))

// محاكاة site-api-service لتفادي side-effect تسخين كاش قاعدة البيانات عند
// تحميل function-calling-handler (مسار هذا الاختبار لا يلمس executeToolByName).
jest.mock("../site-api-service", () => ({
  __esModule: true,
  executeToolByName: jest.fn(),
}))

import { handleToolCalls } from "../function-calling-handler"
import { isAllowedTool, ALLOWED_TOOL_NAMES } from "../site-tools-definitions"

type ToolCall = OpenAI.Chat.Completions.ChatCompletionMessageToolCall

/** يبني tool_call مزيّف بالشكل الذي يتوقّعه المعالج. */
function fakeToolCall(name: string, args: Record<string, unknown>): ToolCall {
  return {
    id: `call_${name}`,
    type: "function",
    function: { name, arguments: JSON.stringify(args) },
  } as ToolCall
}

const ANALYTICS_TOOLS = ["count_mentions", "mentions_timeline", "top_topics", "count_news"] as const

describe("ربط أدوات التحليل — سجلّ_الأدوات (Requirements 9.1, 9.2)", () => {
  it("ALLOWED_TOOL_NAMES يتضمّن الأدوات التحليلية الأربع", () => {
    for (const name of ANALYTICS_TOOLS) {
      expect(ALLOWED_TOOL_NAMES).toContain(name)
    }
  })

  it("isAllowedTool يعيد true لكل أداة تحليلية", () => {
    for (const name of ANALYTICS_TOOLS) {
      expect(isAllowedTool(name)).toBe(true)
    }
  })
})

describe("ربط أدوات التحليل — التوجيه عبر handleToolCalls (Requirements 9.3, 9.4)", () => {
  it("count_mentions يعيد رسالة tool بمحتوى JSON مطابق لبيانات الخدمة", async () => {
    const [msg] = await handleToolCalls([
      fakeToolCall("count_mentions", { query: "علي البدري", period: "month" }),
    ])
    expect(msg.role).toBe("tool")
    expect((msg as any).tool_call_id).toBe("call_count_mentions")
    const parsed = JSON.parse((msg as any).content)
    expect(parsed).toEqual(COUNT_MENTIONS_DATA)
  })

  it("mentions_timeline يعيد رسالة tool بمحتوى JSON مطابق لبيانات الخدمة", async () => {
    const [msg] = await handleToolCalls([
      fakeToolCall("mentions_timeline", { query: "الأربعين", granularity: "month" }),
    ])
    expect(msg.role).toBe("tool")
    expect((msg as any).tool_call_id).toBe("call_mentions_timeline")
    const parsed = JSON.parse((msg as any).content)
    expect(parsed).toEqual(TIMELINE_DATA)
  })

  it("top_topics يعيد رسالة tool بمحتوى JSON مطابق لبيانات الخدمة", async () => {
    const [msg] = await handleToolCalls([
      fakeToolCall("top_topics", { period: "week", limit: 5 }),
    ])
    expect(msg.role).toBe("tool")
    expect((msg as any).tool_call_id).toBe("call_top_topics")
    const parsed = JSON.parse((msg as any).content)
    expect(parsed).toEqual(TOP_TOPICS_DATA)
  })

  it("count_news يعيد رسالة tool بمحتوى JSON مطابق لبيانات الخدمة", async () => {
    const [msg] = await handleToolCalls([
      fakeToolCall("count_news", { period: "month" }),
    ])
    expect(msg.role).toBe("tool")
    expect((msg as any).tool_call_id).toBe("call_count_news")
    const parsed = JSON.parse((msg as any).content)
    expect(parsed).toEqual(COUNT_NEWS_DATA)
  })

  it("يوجّه أدوات التحليل دون المرور على executeToolByName (early-return)", async () => {
    const { executeToolByName } = jest.requireMock("../site-api-service") as {
      executeToolByName: jest.Mock
    }
    await handleToolCalls([
      fakeToolCall("count_mentions", { query: "x", period: "day" }),
      fakeToolCall("count_news", { period: "day" }),
    ])
    expect(executeToolByName).not.toHaveBeenCalled()
  })
})
