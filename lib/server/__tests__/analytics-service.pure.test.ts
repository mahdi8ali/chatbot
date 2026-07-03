/**
 * analytics-service.pure.test.ts
 *
 * اختبارات الطبقة النقية (pure layer) لوحدة analytics-service:
 *   - resolvePeriod (مُحلّل الفترة الحتمي)
 *   - escapeLike / buildLikeTerms (تهريب LIKE + التطبيع العربي)
 *   - windowClause / matchClause (بناء أجزاء WHERE ومعاملاتها)
 *   - GRANULARITY_FORMATS / resolveGranularity (خريطة الحبيبة + القائمة البيضاء)
 *
 * يغطّي هذا الملف مهام:
 *   2.2 (Property 1 — الحتمية)
 *   2.3 (Property 5 — تقييد الحدود / clamp)
 *   2.4 (Property 6 — النافذة الفارغة)
 *   2.5 (اختبارات وحدة لكل أنماط الفترة)
 *   3.3 (Property 3 — سلامة المعاملات)
 *   3.4 (اختبارات وحدة للمساعدات)
 *
 * كل الاختبارات تعتمد `now` ثابتة لضمان الحتمية.
 */

import fc from "fast-check"
import {
  resolvePeriod,
  escapeLike,
  buildLikeTerms,
  windowClause,
  matchClause,
  resolveGranularity,
  GRANULARITY_FORMATS,
  type PeriodSpec,
  type ResolvedWindow,
} from "../analytics-service"

// ── تاريخ مرجعي ثابت لكل الاختبارات (15 يونيو 2026، 12:00:00 محلياً) ──
const NOW = new Date(2026, 5, 15, 12, 0, 0)

/** عدّ علامات '?' في نصّ SQL بشكل متين. */
function countPlaceholders(sql: string): number {
  return (sql.match(/\?/g) || []).length
}

// أسكِت console.warn لتقليل الضجيج (مسارات المدخلات غير الصالحة تُحذّر عمداً).
let warnSpy: jest.SpyInstance
beforeAll(() => {
  warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {})
})
afterAll(() => {
  warnSpy.mockRestore()
})

// ─────────────────────────────────────────────────────────────────────
// Task 2.2 — Property 1: حتمية مُحلّل الفترة
// Validates: Requirements 5.1
// ─────────────────────────────────────────────────────────────────────
describe("Property 1 — resolvePeriod determinism (Task 2.2)", () => {
  // مولّد spec عشوائي: period enum، lastDays، from/to (قد تكون سلاسل غير صالحة).
  const periodArb = fc.constantFrom<PeriodSpec["period"]>(
    "day",
    "week",
    "month",
    "quarter",
    "year",
    "all"
  )

  const dateStringArb = fc.oneof(
    // تواريخ صالحة تقريباً
    fc
      .tuple(
        fc.integer({ min: 2000, max: 2035 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 })
      )
      .map(
        ([y, m, d]) =>
          `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      ),
    // سلاسل حرّة (قد تكون غير صالحة)
    fc.string()
  )

  const specArb: fc.Arbitrary<PeriodSpec> = fc.record(
    {
      period: periodArb,
      lastDays: fc.integer({ min: -100, max: 5000 }),
      from: dateStringArb,
      to: dateStringArb,
    },
    { requiredKeys: [] }
  )

  it("returns identical ResolvedWindow across two calls for the same spec + now", () => {
    fc.assert(
      fc.property(specArb, (spec) => {
        const a = resolvePeriod(spec, NOW)
        const b = resolvePeriod(spec, NOW)
        expect(a).toEqual(b)
        // تحقّق بنيوي إضافي عبر التسلسل النصّي.
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }),
      { numRuns: 300 }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// Task 2.3 — Property 5: تقييد الحدود (clamp lastDays ضمن [1, 3650])
// Validates: Requirements 7.5, 5.3
// ─────────────────────────────────────────────────────────────────────
describe("Property 5 — resolvePeriod clamps lastDays into [1, 3650] (Task 2.3)", () => {
  const MIN = 1
  const MAX = 3650

  /** يستخرج N من label بصيغة "آخر N يوماً"، وإلا يعيد null. */
  function extractDays(label: string): number | null {
    const m = label.match(/آخر\s+(\d+)\s+يوماً/)
    return m ? Number(m[1]) : null
  }

  it("holds for a wide integer range including <1 and >3650", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (lastDays) => {
        const w = resolvePeriod({ lastDays }, NOW)
        const n = extractDays(w.label)
        expect(n).not.toBeNull()
        expect(n! >= MIN && n! <= MAX).toBe(true)
      }),
      { numRuns: 500 }
    )
  })

  it("holds for non-integer (fractional) inputs", () => {
    fc.assert(
      fc.property(
        fc.double({
          min: -1e6,
          max: 1e6,
          noNaN: true,
          noDefaultInfinity: true,
        }),
        (lastDays) => {
          const w = resolvePeriod({ lastDays }, NOW)
          const n = extractDays(w.label)
          expect(n).not.toBeNull()
          expect(n! >= MIN && n! <= MAX).toBe(true)
        }
      ),
      { numRuns: 500 }
    )
  })

  it("cross-checks the clamp via the resolved date span (day difference)", () => {
    fc.assert(
      fc.property(fc.integer({ min: -100000, max: 100000 }), (lastDays) => {
        const w = resolvePeriod({ lastDays }, NOW)
        // from و to غير null في مسار lastDays.
        expect(w.from).not.toBeNull()
        expect(w.to).not.toBeNull()
        // نقارن فرق الأيام التقويمية (الجزء التاريخي فقط) لأن from عند 00:00:00
        // و to عند 23:59:59 من نفس اليوم؛ الفرق التقويمي = N (الإزاحة المقصوصة).
        const fromDay = new Date(w.from!.slice(0, 10) + "T00:00:00")
        const toDay = new Date(w.to!.slice(0, 10) + "T00:00:00")
        const diffDays = Math.round(
          (toDay.getTime() - fromDay.getTime()) / (24 * 60 * 60 * 1000)
        )
        expect(diffDays >= MIN && diffDays <= MAX).toBe(true)
      }),
      { numRuns: 300 }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// Task 2.4 — Property 6: النافذة الفارغة (from > to)
// Validates: Requirements 8.1, 8.2
// ─────────────────────────────────────────────────────────────────────
describe("Property 6 — resolvePeriod marks empty window when from > to (Task 2.4)", () => {
  const NO_DATA_MARKER = "لا توجد بيانات"

  it("produces a no-data label whenever explicit from > to", () => {
    // نولّد زوجين مختلفين من التواريخ الصالحة ثم نرتّبهما بحيث from > to.
    const validDateArb = fc
      .tuple(
        fc.integer({ min: 2000, max: 2035 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1, max: 28 })
      )
      .map(
        ([y, m, d]) =>
          `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
      )

    fc.assert(
      fc.property(validDateArb, validDateArb, (a, b) => {
        fc.pre(a !== b)
        // اجعل from الأكبر لفظياً (والتواريخ ثابتة العرض فالمقارنة اللفظية = زمنية).
        const from = a > b ? a : b
        const to = a > b ? b : a
        const w = resolvePeriod({ from, to }, NOW)
        expect(w.label).toContain(NO_DATA_MARKER)
        // النافذة تحتفظ بالحدّين المُنسّقين.
        expect(w.from).toBe(`${from} 00:00:00`)
        expect(w.to).toBe(`${to} 23:59:59`)
      }),
      { numRuns: 300 }
    )
  })

  it("does NOT mark no-data when from <= to (sanity)", () => {
    const w = resolvePeriod({ from: "2026-01-01", to: "2026-03-31" }, NOW)
    expect(w.label).not.toContain(NO_DATA_MARKER)
  })
})

// ─────────────────────────────────────────────────────────────────────
// Task 2.5 — اختبارات وحدة لكل أنماط الفترة + أولوية الحلّ
// ─────────────────────────────────────────────────────────────────────
describe("resolvePeriod unit — all period modes and resolution priority (Task 2.5)", () => {
  it('period "day" → today only', () => {
    const w = resolvePeriod({ period: "day" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-06-15 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "اليوم",
    })
  })

  it('period "week" → last 7 days', () => {
    const w = resolvePeriod({ period: "week" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-06-08 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 7 أيام",
    })
  })

  it('period "month" → last 30 days', () => {
    const w = resolvePeriod({ period: "month" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-05-16 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 30 يوماً",
    })
  })

  it('period "quarter" → last 90 days', () => {
    const w = resolvePeriod({ period: "quarter" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-03-17 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 90 يوماً",
    })
  })

  it('period "year" → last 365 days', () => {
    const w = resolvePeriod({ period: "year" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2025-06-15 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 365 يوماً",
    })
  })

  it('period "all" → unbounded window', () => {
    const w = resolvePeriod({ period: "all" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: null,
      to: null,
      label: "كل الفترات",
    })
  })

  it("empty spec → unbounded window (كل الفترات)", () => {
    const w = resolvePeriod({}, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: null,
      to: null,
      label: "كل الفترات",
    })
  })

  it("lastDays = 30 → last 30 days window", () => {
    const w = resolvePeriod({ lastDays: 30 }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-05-16 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 30 يوماً",
    })
  })

  it("explicit from/to → both bounds with human label", () => {
    const w = resolvePeriod({ from: "2026-01-01", to: "2026-03-31" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-01-01 00:00:00",
      to: "2026-03-31 23:59:59",
      label: "الفترة من 2026-01-01 إلى 2026-03-31",
    })
  })

  it("explicit from only → lower-bound label (منذ)", () => {
    const w = resolvePeriod({ from: "2026-02-01" }, NOW)
    expect(w.from).toBe("2026-02-01 00:00:00")
    expect(w.to).toBeNull()
    expect(w.label).toBe("منذ 2026-02-01")
  })

  it("explicit to only → upper-bound label (حتى)", () => {
    const w = resolvePeriod({ to: "2026-02-01" }, NOW)
    expect(w.from).toBeNull()
    expect(w.to).toBe("2026-02-01 23:59:59")
    expect(w.label).toBe("حتى 2026-02-01")
  })

  it("priority: from/to beats lastDays and period", () => {
    const w = resolvePeriod(
      { from: "2026-01-01", to: "2026-03-31", lastDays: 5, period: "year" },
      NOW
    )
    expect(w.from).toBe("2026-01-01 00:00:00")
    expect(w.to).toBe("2026-03-31 23:59:59")
    expect(w.label).toBe("الفترة من 2026-01-01 إلى 2026-03-31")
  })

  it("priority: lastDays beats period", () => {
    const w = resolvePeriod({ lastDays: 7, period: "year" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-06-08 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 7 يوماً",
    })
  })

  it("invalid explicit date → safe default (month)", () => {
    const w = resolvePeriod({ from: "2026-02-31" }, NOW)
    expect(w).toEqual<ResolvedWindow>({
      from: "2026-05-16 00:00:00",
      to: "2026-06-15 23:59:59",
      label: "آخر 30 يوماً",
    })
  })

  it("unknown period → safe default (month)", () => {
    const w = resolvePeriod({ period: "decade" as PeriodSpec["period"] }, NOW)
    expect(w.label).toBe("آخر 30 يوماً")
    expect(w.from).toBe("2026-05-16 00:00:00")
    expect(w.to).toBe("2026-06-15 23:59:59")
  })
})

// ─────────────────────────────────────────────────────────────────────
// Task 3.3 — Property 3: سلامة المعاملات (?-count === params.length)
// Validates: Requirements 7.1, 7.2
// ─────────────────────────────────────────────────────────────────────
describe("Property 3 — parameter safety in windowClause/matchClause (Task 3.3)", () => {
  it("windowClause: '?' count equals params length (4) for arbitrary windows", () => {
    const windowArb: fc.Arbitrary<ResolvedWindow> = fc.record({
      from: fc.oneof(fc.constant(null), fc.string()),
      to: fc.oneof(fc.constant(null), fc.string()),
      label: fc.string(),
    })
    fc.assert(
      fc.property(windowArb, (w) => {
        const { sql, params } = windowClause(w)
        expect(countPlaceholders(sql)).toBe(params.length)
        expect(params.length).toBe(4)
      }),
      { numRuns: 300 }
    )
  })

  it("matchClause: '?' count equals params length (2) for arbitrary query strings", () => {
    fc.assert(
      fc.property(fc.string(), (query) => {
        const { sql, params } = matchClause(query)
        expect(countPlaceholders(sql)).toBe(params.length)
        expect(params.length).toBe(2)
      }),
      { numRuns: 300 }
    )
  })
})

// ─────────────────────────────────────────────────────────────────────
// Task 3.4 — اختبارات وحدة للمساعدات
// ─────────────────────────────────────────────────────────────────────
describe("escapeLike (Task 3.4)", () => {
  it("escapes the percent wildcard", () => {
    expect(escapeLike("100%")).toBe("100\\%")
  })

  it("escapes the underscore wildcard", () => {
    expect(escapeLike("a_b")).toBe("a\\_b")
  })

  it("escapes the backslash first (no double-escaping of added escapes)", () => {
    // مدخل يحتوي شرطة عكسية واحدة → تُصبح شرطتين.
    expect(escapeLike("a\\b")).toBe("a\\\\b")
  })

  it("escapes a combination of %, _ and \\ correctly", () => {
    // "%_\\" → \\ أولاً ثم % ثم _  ⇒ "\\%" + "\\_" + "\\\\"
    expect(escapeLike("%_\\")).toBe("\\%\\_\\\\")
  })

  it("handles empty / nullish input safely", () => {
    expect(escapeLike("")).toBe("")
    // @ts-expect-error اختبار متانة على مدخل null
    expect(escapeLike(null)).toBe("")
  })
})

describe("buildLikeTerms — Arabic normalization + wrapping (Task 3.4)", () => {
  it("removes tashkeel (diacritics) and wraps with %...%", () => {
    expect(buildLikeTerms("عَلِيّ")).toEqual(["%علي%"])
  })

  it("removes tatweel/kashida", () => {
    expect(buildLikeTerms("عــلي")).toEqual(["%علي%"])
  })

  it("normalizes alef variants (أ/إ/آ → ا)", () => {
    expect(buildLikeTerms("أحمد")).toEqual(["%احمد%"])
    expect(buildLikeTerms("إسلام")).toEqual(["%اسلام%"])
  })

  it("normalizes taa marbuta / haa (ة → ه)", () => {
    expect(buildLikeTerms("مكة")).toEqual(["%مكه%"])
  })

  it("normalizes yaa / alef maqsura (ى → ي)", () => {
    expect(buildLikeTerms("مصطفى")).toEqual(["%مصطفي%"])
  })

  it("lowercases latin and collapses whitespace", () => {
    expect(buildLikeTerms("  Hello   World  ")).toEqual(["%hello world%"])
  })

  it("returns empty array for empty / whitespace-only queries", () => {
    expect(buildLikeTerms("")).toEqual([])
    expect(buildLikeTerms("     ")).toEqual([])
  })
})

describe("resolveGranularity — whitelist with month default (Task 3.4)", () => {
  it("returns the valid granularity for day/week/month", () => {
    expect(resolveGranularity("day")).toBe("day")
    expect(resolveGranularity("week")).toBe("week")
    expect(resolveGranularity("month")).toBe("month")
  })

  it("defaults to month for invalid input", () => {
    expect(resolveGranularity("hour")).toBe("month")
    expect(resolveGranularity("")).toBe("month")
    expect(resolveGranularity("YEAR")).toBe("month")
  })
})

describe("GRANULARITY_FORMATS — expected DATE_FORMAT patterns (Task 3.4)", () => {
  it("has exactly the 3 expected patterns", () => {
    expect(GRANULARITY_FORMATS).toEqual({
      day: "%Y-%m-%d",
      week: "%x-W%v",
      month: "%Y-%m",
    })
    expect(Object.keys(GRANULARITY_FORMATS)).toHaveLength(3)
  })
})
