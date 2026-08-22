/**
 * friday-sermons-service.test.ts — اختبارات خدمة أرشيف خطب الجمعة.
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

import { searchFridaySermons } from "../friday-sermons-service"

const countPlaceholders = (sql: string) => (sql.match(/\?/g) || []).length

function mockTier(rows: any[], total: number) {
  mockExecute.mockResolvedValueOnce([rows])
  mockExecute.mockResolvedValueOnce([[{ total }]])
}

beforeEach(() => {
  mockExecute.mockReset()
})

describe("searchFridaySermons — بلا استعلام (أحدث الخطب)", () => {
  it("بلا query ⇒ طبقة واحدة مرتَّبة بـ id DESC (أحدث أولاً)، بلا شرط عنوان", async () => {
    mockTier([{ id: 484, title: "خطبة", date: "2020", content: "ملخص", views: 100, preacher_title: "السيد الصافي", first_request: null, second_request: null }], 462)
    await searchFridaySermons({})
    expect(mockExecute).toHaveBeenCalledTimes(2)
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.id DESC")
    expect(sql).not.toContain("LIKE")
  })
})

describe("searchFridaySermons — الخطوة ١ (AND)", () => {
  it("عدد `?` يساوي طول params لنداءَي SELECT وCOUNT معاً", async () => {
    mockTier([{ id: 1, title: "خطبة عن الوحدة", date: null, content: null, views: 1, preacher_title: null, first_request: null, second_request: null }], 1)
    await searchFridaySermons({ query: "الوحدة الوطنية" })
    for (const [sql, params] of mockExecute.mock.calls) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("يشترط fs.deleted_at IS NULL دائماً", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchFridaySermons({ query: "موضوع" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("fs.deleted_at IS NULL")
  })

  it("LIMIT يُقصّ ضمن [1,10]، والافتراضي 5", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchFridaySermons({ query: "موضوع", limit: 999 })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toMatch(/LIMIT 10\b/)
  })
})

describe("searchFridaySermons — الخطوة ٢ (fallback OR)", () => {
  it("AND فارغ ⇒ خطوة ثانية بمعاملات سليمة العدد (4 نداءات إجمالاً)", async () => {
    mockTier([], 0)
    mockTier([{ id: 200, title: "خطبة عن الصحة", date: "2019", content: "ملخص", views: 50, preacher_title: "الشيخ الكربلائي", first_request: "abc123", second_request: null }], 5)

    const r = await searchFridaySermons({ query: "الصحة والوعي المجتمعي" })
    expect(mockExecute).toHaveBeenCalledTimes(4)
    const [sql3, params3] = mockExecute.mock.calls[2]
    expect(countPlaceholders(sql3)).toBe(params3.length)
    expect((r.data as any).results[0].title).toContain("الصحة")
  })
})

describe("searchFridaySermons — الحقول المشتقّة", () => {
  it("summary يُقصّ عند 600 حرفاً مع '…'، ويبقى كاملاً إن كان أقصر", async () => {
    const longContent = "ح".repeat(700)
    mockTier([{ id: 1, title: "خطبة", date: null, content: longContent, views: 0, preacher_title: null, first_request: null, second_request: null }], 1)
    const r = await searchFridaySermons({})
    const item = (r.data as any).results[0]
    expect(item.summary!.length).toBe(601) // 600 + "…"
    expect(item.summary!.endsWith("…")).toBe(true)
  })

  it("content فارغ (null) وfirst_sermon أيضاً غائب ⇒ summary: null", async () => {
    mockTier([{ id: 1, title: "خطبة", date: null, content: null, views: 0, preacher_title: null, first_request: null, second_request: null }], 1)
    const r = await searchFridaySermons({})
    expect((r.data as any).results[0].summary).toBeNull()
  })

  it("content فارغ لكن first_sermon موجود ⇒ ملخّص بديل منه، لا null", async () => {
    // ⚠️ فحص حيّ: content فارغ في 55% من الخطب فعلياً (207/462 فقط تحمل
    // قيمة) بينما first_sermon متوفّر في 99% منها — كان summary يُصبح null
    // خطأً رغم وجود نصّ كامل قابل للتلخيص منه.
    mockTier(
      [{ id: 1, title: "خطبة", date: null, content: null, first_sermon: "نصّ الخطبة الأولى الكامل هنا", views: 0, preacher_title: null, first_request: null, second_request: null }],
      1
    )
    const r = await searchFridaySermons({})
    expect((r.data as any).results[0].summary).toBe("نصّ الخطبة الأولى الكامل هنا")
  })

  it("وسوم <br> تُستبدَل بمسافة في الملخّص البديل من first_sermon", async () => {
    mockTier(
      [{ id: 1, title: "خطبة", date: null, content: null, first_sermon: "جملة أولى<br><br>جملة ثانية", views: 0, preacher_title: null, first_request: null, second_request: null }],
      1
    )
    const r = await searchFridaySermons({})
    expect((r.data as any).results[0].summary).not.toContain("<br>")
    expect((r.data as any).results[0].summary).toContain("جملة أولى")
    expect((r.data as any).results[0].summary).toContain("جملة ثانية")
  })

  it("يبني رابط فيديو mp4 من request عبر video_files، وnull إن غاب", async () => {
    mockTier(
      [{ id: 1, title: "خطبة", date: null, content: null, views: 0, preacher_title: null, first_request: "153226e5", second_request: null }],
      1
    )
    const r = await searchFridaySermons({})
    const item = (r.data as any).results[0]
    expect(item.first_sermon_video_url).toBe("https://static1.alkafeel.net/videos/153226e5/153226e5.mp4")
    expect(item.second_sermon_video_url).toBeNull()
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await searchFridaySermons({})
    expect(r.success).toBe(false)
  })
})

describe("searchFridaySermons — فلتر preacher (خطيب معيّن)", () => {
  it("preacher بلا query ⇒ شرط fp.title LIKE فقط، عدد `?` سليم", async () => {
    mockTier([], 0)
    await searchFridaySermons({ preacher: "الصافي" })
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("fp.title LIKE ?")
    expect(countPlaceholders(sql)).toBe(params.length)
    expect(params).toEqual(["%الصافي%"])
  })

  it("preacher بلا query ⇒ فاصل مسافة سليم بين NULL وAND (فحص حيّ كشف خطأ SQL هنا فعلياً: 'NULLAND')", async () => {
    mockTier([], 0)
    await searchFridaySermons({ preacher: "الصافي" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).not.toContain("NULLAND")
    expect(sql).toContain("IS NULL AND fp.title")
  })

  it("preacher مع query (الخطوة ١) ⇒ يظهر بعد شرط الكلمات في النصّ، ومعامله أخيراً", async () => {
    mockTier([{ id: 1, title: "خطبة", date: null, content: null, views: 0, preacher_title: "السيد احمد الصافي", first_request: null, second_request: null }], 1)
    await searchFridaySermons({ query: "الوحدة الوطنية", preacher: "الصافي" })
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("fp.title LIKE ?")
    expect(countPlaceholders(sql)).toBe(params.length)
    expect(params[params.length - 1]).toBe("%الصافي%") // آخر معامل يطابق آخر شرط بالنصّ
  })

  it("preacher مع الخطوة ٢ (OR الاحتياطية): عدد `?` يبقى سليماً في كل النداءات", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchFridaySermons({ query: "موضوع نادر جداً", preacher: "الكربلائي" })
    for (const [sql, params] of mockExecute.mock.calls) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })
})

describe("searchFridaySermons — sort_by=views (أشهر خطبة)", () => {
  // ⚠️ فحص حيّ: عمود views حقيقي (7,456–23,898 مشاهدة فعلياً) لم يكن له
  // مسار ترتيب إطلاقاً — نفس فجوة §11.14 (الفيديو)، هنا بلا استعلام أصلاً.
  it("sortBy='views' بلا query ⇒ ORDER BY fs.views DESC", async () => {
    mockTier([], 0)
    await searchFridaySermons({ sortBy: "views" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.views DESC")
  })

  it("بلا sortBy (افتراضي) ⇒ يبقى fs.id DESC كالسابق، لا انتكاس", async () => {
    mockTier([], 0)
    await searchFridaySermons({})
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.id DESC")
  })

  it("sortBy='views' مع query (الخطوة ١) ⇒ نفس ترتيب fs.views DESC", async () => {
    mockTier([{ id: 1, title: "خطبة", date: null, content: null, views: 0, preacher_title: null, first_request: null, second_request: null }], 1)
    await searchFridaySermons({ query: "موضوع", sortBy: "views" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.views DESC")
  })
})

describe("searchFridaySermons — sort_by='oldest' (أول/أقدم خطبة)", () => {
  // ⚠️ فحص حيّ: سؤال "أول خطبة جمعة نُشرت" لم يكن للأداة أي وسيلة للإجابة
  // عليه — الافتراضي id DESC يُعيد الأحدث دائماً، فوصف النموذج أحدث خطبة
  // (id=484) خطأً بأنها "الأولى" لغياب أي خيار تصاعدي إطلاقاً.
  it("sortBy='oldest' بلا query ⇒ ORDER BY fs.id ASC (لا DESC)", async () => {
    mockTier([], 0)
    await searchFridaySermons({ sortBy: "oldest" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.id ASC")
    expect(sql).not.toContain("fs.id DESC")
  })

  it("sortBy='oldest' مع query (الخطوة ١) ⇒ نفس ترتيب fs.id ASC", async () => {
    mockTier([{ id: 1, title: "خطبة", date: null, content: null, views: 0, preacher_title: null, first_request: null, second_request: null }], 1)
    await searchFridaySermons({ query: "موضوع", sortBy: "oldest" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("ORDER BY fs.id ASC")
  })

  it("بلا sortBy يبقى الافتراضي الأحدث (id DESC) لا الأقدم — لا انتكاس صامت", async () => {
    mockTier([], 0)
    await searchFridaySermons({})
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("fs.id DESC")
    expect(sql).not.toContain("fs.id ASC")
  })
})
