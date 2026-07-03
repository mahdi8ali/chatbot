/**
 * analytics-service.sql.test.ts — اختبارات دوال التجميع عبر SQL (بلا قاعدة بيانات حيّة).
 *
 * يغطّي المهام:
 *   - 5.5  سلامة المعاملات + شرط الأساس + عدم إقحام قيم المستخدم + قصّ LIMIT
 *          (Property 3 — أمان) لـ countMentions / countNews / topTopics.
 *   - 5.6  Σ buckets.count === total لـ mentionsTimeline (Property 2).
 *   - 5.7  قصر دائرة النافذة الفارغة + رفض العبارة الفارغة + معالجة فشل قاعدة البيانات.
 *
 * أسلوب الاختبار: يُحاكى (jest.mock) موديول "../db" بحيث تُعيد getPool() pool وهمياً
 * دالته execute هي jest.fn() نتحكّم بها (تُعيد صفوفاً نحدّدها وتلتقط sql + params).
 * هذا يتجنّب أي اتصال حقيقي بقاعدة البيانات.
 */

import fc from "fast-check"

// ── محاكاة موديول db: getPool() → pool وهمي، execute تحت سيطرتنا ───────────────
jest.mock("../db", () => ({
  getPool: jest.fn(),
  // RowDataPacket يُستخدم كنوع فقط في analytics-service، لكن نصدّره لسلامة الاستيراد.
  RowDataPacket: class {},
}))

import { getPool } from "../db"
import {
  countMentions,
  countNews,
  topTopics,
  mentionsTimeline,
} from "../analytics-service"

// execute وهمي مشترك — يُعاد ضبطه قبل كل اختبار.
const mockExecute = jest.fn()

beforeEach(() => {
  mockExecute.mockReset()
  ;(getPool as jest.Mock).mockReset()
  ;(getPool as jest.Mock).mockReturnValue({ execute: mockExecute })
  // افتراضي آمن: صفر مطابقات (يُعاد تجاوزه عند الحاجة).
  mockExecute.mockResolvedValue([[{ total: 0 }]])
})

/** يعدّ علامات الاستفهام `?` في نصّ SQL. */
function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) || []).length
}

/** يلتقط آخر (sql, params) مرّرا إلى mockExecute. */
function lastCall(): { sql: string; params: unknown[] } {
  const call = mockExecute.mock.calls[mockExecute.mock.calls.length - 1]
  return { sql: call[0] as string, params: (call[1] as unknown[]) ?? [] }
}

const BOUNDED_SPEC = { from: "2026-01-01", to: "2026-12-31" }

// ═══════════════════════════════════════════════════════════════════════════
// Task 5.5 — Property 3 (أمان): سلامة المعاملات + شرط الأساس + عدم الإقحام + قصّ
// **Validates: Requirements 7.1, 7.2, 7.4, 7.5, 7.6**
// ═══════════════════════════════════════════════════════════════════════════
describe("Task 5.5 — سلامة المعاملات وأمان SQL (Property 3)", () => {
  describe("countMentions", () => {
    it("عدد `?` يساوي طول params، ويحوي BASE_WHERE، وقيم المستخدم في params لا في SQL", async () => {
      mockExecute.mockResolvedValue([[{ total: 42 }]])
      const result = await countMentions({ query: "غزة", spec: BOUNDED_SPEC })

      expect(result.success).toBe(true)
      expect(mockExecute).toHaveBeenCalledTimes(1)
      const { sql, params } = lastCall()

      // سلامة المعاملات: عدد `?` == طول params.
      expect(countPlaceholders(sql)).toBe(params.length)
      // شرط الأساس (Req 7.6).
      expect(sql).toContain("active = 1 AND deleted_at IS NULL")
      // نمط LIKE (قيمة المستخدم بعد التطبيع العربي الخفيف: ة→ه) موجود في params لا في SQL.
      expect(params).toContain("%غزه%")
      expect(sql).not.toContain("غز")
      // قيم النافذة الصريحة موجودة في params لا في SQL.
      expect(params).toContain("2026-01-01 00:00:00")
      expect(params).toContain("2026-12-31 23:59:59")
      expect(sql).not.toContain("2026-01-01")
      expect(sql).not.toContain("2026-12-31")
    })

    it("sample=true يُصدر استعلاماً ثانياً بـ ORDER BY created_at DESC LIMIT 5", async () => {
      // الأول: العدّ. الثاني: العيّنة.
      mockExecute.mockResolvedValueOnce([[{ total: 7 }]])
      mockExecute.mockResolvedValueOnce([
        [{ id: 1, title: "خبر", created_at: "2026-05-01 10:00:00" }],
      ])

      const result = await countMentions({
        query: "غزة",
        spec: BOUNDED_SPEC,
        sample: true,
      })

      expect(result.success).toBe(true)
      expect(mockExecute).toHaveBeenCalledTimes(2)
      const sampleSql = mockExecute.mock.calls[1][0] as string
      expect(sampleSql).toContain("ORDER BY created_at DESC LIMIT 5")
      // العيّنة أيضاً معلّمة بالكامل.
      const sampleParams = (mockExecute.mock.calls[1][1] as unknown[]) ?? []
      expect(countPlaceholders(sampleSql)).toBe(sampleParams.length)
    })
  })

  describe("countNews", () => {
    it("عدد `?` == طول params، يحوي BASE_WHERE، قيم النافذة في params", async () => {
      mockExecute.mockResolvedValue([[{ total: 3 }]])
      const result = await countNews({ spec: BOUNDED_SPEC })

      expect(result.success).toBe(true)
      const { sql, params } = lastCall()
      expect(countPlaceholders(sql)).toBe(params.length)
      expect(sql).toContain("active = 1 AND deleted_at IS NULL")
      expect(params).toContain("2026-01-01 00:00:00")
      expect(params).toContain("2026-12-31 23:59:59")
    })

    it("categoryId يُمرَّر كمعامل `?` لا مُقحَماً في SQL", async () => {
      mockExecute.mockResolvedValue([[{ total: 3 }]])
      await countNews({ spec: BOUNDED_SPEC, categoryId: 99 })

      const { sql, params } = lastCall()
      expect(countPlaceholders(sql)).toBe(params.length)
      expect(sql).toContain("category_id = ?")
      expect(params).toContain(99)
    })
  })

  describe("topTopics", () => {
    it("عدد `?` == طول params، يحوي BASE_WHERE، وLIMIT رقم مُدرج ضمن [1,20]", async () => {
      mockExecute.mockResolvedValue([[{ category_id: 5, count: 10 }]])
      const result = await topTopics({ spec: BOUNDED_SPEC })

      expect(result.success).toBe(true)
      const { sql, params } = lastCall()
      expect(countPlaceholders(sql)).toBe(params.length)
      expect(sql).toContain("active = 1 AND deleted_at IS NULL")

      const m = sql.match(/LIMIT\s+(\d+)/)
      expect(m).not.toBeNull()
      const limitVal = Number(m![1])
      expect(limitVal).toBeGreaterThanOrEqual(1)
      expect(limitVal).toBeLessThanOrEqual(20)
      // الافتراضي 5.
      expect(limitVal).toBe(5)
    })

    it("قصّ LIMIT: limit=999 → 20", async () => {
      mockExecute.mockResolvedValue([[]])
      await topTopics({ spec: BOUNDED_SPEC, limit: 999 })
      const { sql } = lastCall()
      expect(sql).toContain("LIMIT 20")
    })

    it("قصّ LIMIT: limit=0 → 1", async () => {
      mockExecute.mockResolvedValue([[]])
      await topTopics({ spec: BOUNDED_SPEC, limit: 0 })
      const { sql } = lastCall()
      expect(sql).toContain("LIMIT 1")
    })

    it("قيمة section غير رقمية لا تُقحَم في SQL وتُتجاهَل", async () => {
      mockExecute.mockResolvedValue([[]])
      await topTopics({ spec: BOUNDED_SPEC, section: "DROP TABLE news" })
      const { sql, params } = lastCall()
      expect(countPlaceholders(sql)).toBe(params.length)
      expect(sql).not.toContain("DROP TABLE")
      expect(sql).not.toContain("category_id = ?")
    })
  })

  // Property-based: مهما كانت قيمة limit فإن LIMIT المُدرج يبقى ضمن [1,20].
  it("Property 3 (أمان): LIMIT المُدرج في topTopics دائماً ضمن [1,20] لأي مُدخل", async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: -1000, max: 100000 }), async (limit) => {
        mockExecute.mockResolvedValue([[]])
        await topTopics({ spec: BOUNDED_SPEC, limit })
        const { sql, params } = lastCall()
        expect(countPlaceholders(sql)).toBe(params.length)
        const m = sql.match(/LIMIT\s+(\d+)/)
        expect(m).not.toBeNull()
        const v = Number(m![1])
        expect(v).toBeGreaterThanOrEqual(1)
        expect(v).toBeLessThanOrEqual(20)
      }),
      { numRuns: 200 }
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 5.6 — Property 2: Σ buckets.count === total (mentionsTimeline)
// **Validates: Requirements 2.3**
// ═══════════════════════════════════════════════════════════════════════════
describe("Task 5.6 — انتظام الأعداد الزمنية (Property 2)", () => {
  it("مثال: buckets [3, 5] → total 8", async () => {
    mockExecute.mockResolvedValue([
      [
        { bucket: "2026-01", count: 3 },
        { bucket: "2026-02", count: 5 },
      ],
    ])
    const result = await mentionsTimeline({
      query: "غزة",
      granularity: "month",
      spec: BOUNDED_SPEC,
    })
    expect(result.success).toBe(true)
    expect(result.data!.total).toBe(8)
    expect(result.data!.buckets.reduce((s, b) => s + b.count, 0)).toBe(8)
  })

  it("Property 2: لأي مصفوفة دلاء {bucket,count>=0} فإن total === Σ counts", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            bucket: fc.string({ minLength: 1, maxLength: 10 }),
            count: fc.nat({ max: 100000 }),
          }),
          { maxLength: 50 }
        ),
        async (rows) => {
          mockExecute.mockResolvedValue([rows])
          const result = await mentionsTimeline({
            query: "غزة",
            granularity: "month",
            spec: BOUNDED_SPEC,
          })
          const sum = rows.reduce((s, r) => s + r.count, 0)
          expect(result.success).toBe(true)
          expect(result.data!.total).toBe(sum)
        }
      ),
      { numRuns: 200 }
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// Task 5.7 — قصر دائرة النافذة الفارغة + رفض العبارة الفارغة + فشل قاعدة البيانات
// **Validates: Requirements 8.1, 8.2, 10.1, 10.2** (Property 6)
// ═══════════════════════════════════════════════════════════════════════════
describe("Task 5.7 — النافذة الفارغة والأخطاء", () => {
  const EMPTY_WINDOW = { from: "2026-12-31", to: "2026-01-01" } // from > to

  describe("قصر دائرة النافذة الفارغة (from > to) — بلا استعلام (Property 6, Req 8.1)", () => {
    it("countMentions → success, total:0، execute لم يُستدع", async () => {
      const result = await countMentions({ query: "غزة", spec: EMPTY_WINDOW })
      expect(result.success).toBe(true)
      expect(result.data!.total).toBe(0)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it("countNews → success, total:0، execute لم يُستدع", async () => {
      const result = await countNews({ spec: EMPTY_WINDOW })
      expect(result.success).toBe(true)
      expect(result.data!.total).toBe(0)
      expect(mockExecute).not.toHaveBeenCalled()
    })

    it("mentionsTimeline → success, total:0, buckets:[]، execute لم يُستدع", async () => {
      const result = await mentionsTimeline({
        query: "غزة",
        granularity: "month",
        spec: EMPTY_WINDOW,
      })
      expect(result.success).toBe(true)
      expect(result.data!.total).toBe(0)
      expect(result.data!.buckets).toEqual([])
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe("رفض العبارة الفارغة (Req 10.2)", () => {
    it("countMentions({query:'  '}) → success:false مع رسالة، execute لم يُستدع", async () => {
      const result = await countMentions({ query: "  ", spec: {} })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
      expect(result.error!.length).toBeGreaterThan(0)
      expect(mockExecute).not.toHaveBeenCalled()
    })
  })

  describe("معالجة فشل قاعدة البيانات (Req 10.1)", () => {
    it("countMentions: execute يرفض → success:false مع رسالة خطأ", async () => {
      mockExecute.mockRejectedValue(new Error("connection lost"))
      const result = await countMentions({ query: "غزة", spec: BOUNDED_SPEC })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
      expect(result.error!.length).toBeGreaterThan(0)
    })

    it("countNews: execute يرفض → success:false", async () => {
      mockExecute.mockRejectedValue(new Error("db down"))
      const result = await countNews({ spec: BOUNDED_SPEC })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
    })

    it("mentionsTimeline: execute يرفض → success:false", async () => {
      mockExecute.mockRejectedValue(new Error("db down"))
      const result = await mentionsTimeline({
        query: "غزة",
        granularity: "month",
        spec: BOUNDED_SPEC,
      })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
    })

    it("topTopics: execute يرفض → success:false", async () => {
      mockExecute.mockRejectedValue(new Error("db down"))
      const result = await topTopics({ spec: BOUNDED_SPEC })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
    })
  })
})
