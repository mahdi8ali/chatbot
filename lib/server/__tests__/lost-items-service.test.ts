/**
 * lost-items-service.test.ts — اختبارات خدمة سجلّ المفقودات (سلامة المعاملات + السلوك).
 *
 * يُحاكى `db` فيُلتقط نصّ الاستعلام ومعاملاته دون لمس قاعدة بيانات حقيقية،
 * بنفس نمط publications-service.test.ts.
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

import { searchLostItems } from "../lost-items-service"

const countPlaceholders = (sql: string) => (sql.match(/\?/g) || []).length

/** استجابة SELECT (صفوف) متبوعة باستجابة COUNT — طبقة بحث واحدة كاملة. */
function mockTier(rows: any[], total: number) {
  mockExecute.mockResolvedValueOnce([rows])
  mockExecute.mockResolvedValueOnce([[{ total }]])
}

beforeEach(() => {
  mockExecute.mockReset()
})

describe("searchLostItems — يشترط اسماً دائماً", () => {
  it("استعلام فارغ ⇒ رفض فوري بلا أي نداء قاعدة بيانات (منع تصفّح جماعي)", async () => {
    const r = await searchLostItems({})
    expect(r.success).toBe(false)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("كلمة واحدة قصيرة (حرف واحد) ⇒ رفض أيضاً", async () => {
    const r = await searchLostItems({ query: "ا" })
    expect(r.success).toBe(false)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("توكن بحرفين وحده ('لا') ⇒ رفض كامل، بلا أي نداء قاعدة بيانات", async () => {
    // فحص حيّ: "لا" (٢ حرف) يطابق LIKE %لا% أي اسم يحويه بأي موضع (مثل
    // "علاء")، فأعادت هذه الخطوة 3,515 "نتيجة" لاستعلام كان يُفترض أن يكون
    // بحثاً عن اسم غير موجود إطلاقاً — الحدّ الأدنى 3 أحرف يستبعد هذا التوكن.
    const r = await searchLostItems({ query: "لا" })
    expect(r.success).toBe(false)
    expect(mockExecute).not.toHaveBeenCalled()
  })

  it("جملة فيها توكنات صالحة (٣+ أحرف) وتوكن أداة نفي قصير معاً ⇒ التوكن القصير يُستبعد بصمت، والبحث يستمر بالباقي", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchLostItems({ query: "اسم لا يوجد" }) // "لا"(2) يُستبعد؛ "اسم"(3)/"يوجد"(4) يبقيان
    const [sql, params] = mockExecute.mock.calls[0]
    expect(countPlaceholders(sql)).toBe(params.length)
    expect(params).not.toContain("%لا%")
  })
})

describe("searchLostItems — الخطوة ١ (AND)", () => {
  it("عدد `?` يساوي طول params لنداءَي SELECT وCOUNT معاً", async () => {
    mockTier([{ id: 1, name: "علي حسن", type: "جواز سفر", city: "كربلاء", date: null }], 1)
    await searchLostItems({ query: "علي حسن" })
    for (const [sql, params] of mockExecute.mock.calls) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("قيمة المستخدم تمرّ كمعامل لا داخل نصّ SQL", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchLostItems({ query: "غزة" })
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).not.toContain("غزة")
    expect(params.some((p: any) => typeof p === "string" && p.includes("غزه"))).toBe(true)
  })

  it("يشترط deleted_at IS NULL وis_active = 1 دائماً", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchLostItems({ query: "احمد علي" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("deleted_at IS NULL")
    expect(sql).toContain("is_active = 1")
  })

  it("فلتر item_type اختياري: عدد `?` يبقى سليماً حين يُستخدم", async () => {
    mockTier([{ id: 1, name: "احمد علي", type: "جواز سفر", city: null, date: null }], 1)
    await searchLostItems({ query: "احمد علي", itemType: "جواز سفر" })
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("type LIKE ?")
    expect(countPlaceholders(sql)).toBe(params.length)
  })

  it("بلا item_type: لا يظهر شرط type إطلاقاً", async () => {
    mockTier([{ id: 1, name: "احمد علي", type: null, city: null, date: null }], 1)
    await searchLostItems({ query: "احمد علي" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).not.toContain("type LIKE")
  })

  it("LIMIT يُقصّ ضمن [1,15]، والافتراضي 8", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchLostItems({ query: "احمد علي", limit: 500 })
    const [selectSql] = mockExecute.mock.calls[0]
    expect(selectSql).toMatch(/LIMIT 15\b/)
  })
})

describe("searchLostItems — الخطوة ٢ (fallback OR عند فراغ AND)", () => {
  it("AND فارغ ⇒ خطوة ثانية بمعاملات سليمة العدد (4 نداءات إجمالاً)", async () => {
    mockTier([], 0)
    mockTier([{ id: 9, name: "محمد جواد كاظم", type: "بطاقة وطنية", city: "بغداد", date: "2020-01-01T00:00:00.000Z" }], 3)

    const r = await searchLostItems({ query: "محمد جواد كاظم عبد" })

    expect(mockExecute).toHaveBeenCalledTimes(4)
    const [sql3, params3] = mockExecute.mock.calls[2]
    expect(countPlaceholders(sql3)).toBe(params3.length)
    const [sql4, params4] = mockExecute.mock.calls[3]
    expect(countPlaceholders(sql4)).toBe(params4.length)
    expect((r.data as any).results[0].name).toBe("محمد جواد كاظم")
    expect((r.data as any).total).toBe(3)
  })

  it("مع item_type: عدد `?` يبقى سليماً في كل نداءات الخطوة الثانية", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchLostItems({ query: "محمد جواد كاظم عبد", itemType: "هوية أحوال" })
    for (const call of mockExecute.mock.calls) {
      const [sql, params] = call
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("OR فارغة أيضاً ⇒ نتيجة فارغة صادقة (total=0)", async () => {
    mockTier([], 0)
    mockTier([], 0)
    const r = await searchLostItems({ query: "اسم غير موجود اطلاقا" })
    expect(r.success).toBe(true)
    expect((r.data as any).total).toBe(0)
    expect((r.data as any).results).toEqual([])
  })
})

describe("searchLostItems — تنظيف الحقول", () => {
  it("type = '-' أو فارغ ⇒ document_type: null (لا يُعرض حرفياً)", async () => {
    mockTier(
      [
        { id: 1, name: "أحمد", type: "-", city: "بغداد", date: null },
        { id: 2, name: "علي", type: "  ", city: "بغداد", date: null },
        { id: 3, name: "حسن", type: "جواز سفر", city: "بغداد", date: null },
      ],
      3
    )
    const r = await searchLostItems({ query: "احمد علي حسن" })
    const items = (r.data as any).results
    expect(items[0].document_type).toBeNull()
    expect(items[1].document_type).toBeNull()
    expect(items[2].document_type).toBe("جواز سفر")
  })

  it("city = 'بلا' ⇒ city: null", async () => {
    mockTier([{ id: 1, name: "أحمد", type: null, city: "بلا", date: null }], 1)
    const r = await searchLostItems({ query: "احمد علي" })
    expect((r.data as any).results[0].city).toBeNull()
  })

  it("date: يُقتصّ جزء التاريخ فقط من DATETIME، وnull يبقى null", async () => {
    mockTier(
      [
        { id: 1, name: "أحمد", type: null, city: null, date: "2009-12-16T21:00:00.000Z" },
        { id: 2, name: "علي", type: null, city: null, date: null },
      ],
      2
    )
    const r = await searchLostItems({ query: "احمد علي" })
    const items = (r.data as any).results
    expect(items[0].date).toBe("2009-12-16")
    expect(items[1].date).toBeNull()
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await searchLostItems({ query: "احمد علي" })
    expect(r.success).toBe(false)
  })
})
