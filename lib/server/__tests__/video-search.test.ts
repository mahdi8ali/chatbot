/**
 * video-search.test.ts — اختبارات searchVideos (تطبيع الهمزات/التاء المربوطة + ترتيب OR + عدّ حقيقي).
 *
 * ⚠️ فحص حيّ حقيقي كشف خللاً أول: "الحفل القرآني المرتل في الصحن" أعادت صفر
 * نتائج ذات صلة رغم وجود سلسلة حقيقية مطابقة موضوعياً ("الختمة القرآنية
 * المرتلة") — السبب مزدوج: (١) "القرآني" (بهمزة ممدودة آ) يختلف حرفياً عن
 * "القرآنية" في العنوان الحقيقي بسبب تطابق الجنس النحوي المؤنّث/المذكّر
 * (لاحقة ة إضافية)، و(٢) الكود الأصلي كان يحذف التشكيل فقط (stripDiacritics)
 * بلا توحيد الهمزات. الإصلاح: fuzzyNorm (موحَّدة مسبقاً في db.ts) + مطابقة
 * بادئة (prefix) للكلمات ٤+ أحرف في خطوة OR الاحتياطية + ترتيب بعدد
 * الكلمات المطابقة (لا "أول كلمة تُصادف نتيجة" كما كان سابقاً).
 *
 * ⚠️ خلل ثانٍ منفصل (فحص حيّ لاحق): `total: results.length` كانت تُعيد طول
 * المصفوفة المُقتَصّة بـlimit لا العدد الحقيقي — سلسلة "النشرة بلغة الإشارة"
 * تحوي 57 فيديو فعلياً لكن `total` أعادت 10 (= limit الذي مرّره النموذج).
 * نفس فصيلة خلل «العدد المضلّل» في §11.2/§11.7، هنا للمرّة الثالثة. الإصلاح:
 * كل طبقة (AND ثم OR) تنفّذ الآن **نداءين**: COUNT(*) حقيقي بمعزل عن LIMIT
 * ثم SELECT بحدّ LIMIT للعرض — بنفس ترتيب COUNT-قبل-SELECT في الكود.
 */

const mockQuery = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ query: mockQuery }) }
})

import { searchVideos, getVideoSections } from "../video-service"

const countPlaceholders = (sql: string) => (sql.match(/\?/g) || []).length

function row(title: string, id = 1, views = 0) {
  return {
    id,
    title: JSON.stringify({ ar: title }),
    caption: null,
    image: null,
    request: `req${id}`,
    views,
    video_section_id: null,
    length: null,
    active: 1,
    created_at: "2026-01-01T00:00:00.000Z",
    section_title: null,
    section_request: null,
  }
}

/** طبقة بحث واحدة: نداء COUNT ثم نداء SELECT — بنفس ترتيب الكود الفعلي. */
function mockTier(total: number, rows: any[]) {
  mockQuery.mockResolvedValueOnce([[{ total }]])
  mockQuery.mockResolvedValueOnce([rows])
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe("searchVideos — سلامة معاملات AND (الخطوة ١)", () => {
  it("عدد `?` يساوي طول params لنداءَي COUNT وSELECT معاً", async () => {
    mockTier(1, [row("الختمة القرآنية المرتلة")])
    await searchVideos({ query: "الختمة القرآنية" })
    for (const [sql, params] of mockQuery.mock.calls) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })
})

describe("searchVideos — total عدد حقيقي لا طول النتائج المعروضة", () => {
  it("total من COUNT(*) لا من عدد الصفوف المُقتَصّة بـlimit", async () => {
    // فحص حيّ: سلسلة حقيقية تحوي 57 فيديو، لكن limit(10) كان يُقتصّ العرض
    // و`total` القديمة كانت تُعيد 10 (طول المصفوفة) بدل 57 الحقيقي.
    mockTier(57, [row("فيديو 1", 1), row("فيديو 2", 2)])
    const r = await searchVideos({ query: "النشرة بلغة الإشارة", section: "النشرة بلغة الإشارة", limit: 10 })
    expect((r.data as any).total).toBe(57)
    expect((r.data as any).returned).toBe(2)
  })
})

describe("searchVideos — query فارغ/غائب + section ⇒ طبقة عدّ نظيفة بلا تضييق نصّي", () => {
  // ⚠️ فحص حيّ حقيقي: "كم فيديو في سلسلة النشرة بلغة الإشارة؟" جعل النموذج
  // يمرّر query="النشرة بلغة الإشارة" (تكرار اسم القسم) لأن query كانت
  // إلزامية في تعريف الأداة — فاشترط ظهور كل كلمة حرفياً في كل فيديو فوق
  // شرط القسم نفسه، فأنقص العدّ الحقيقي 57 إلى 43 خطأً. الإصلاح: query
  // اختيارية الآن؛ query فارغة ⇒ طبقة عدّ نظيفة بلا أي شرط عنوان/وصف.

  it("query غائب كلياً ⇒ نداءان فقط (COUNT+SELECT)، بلا شرط عنوان/وصف في SQL", async () => {
    mockTier(57, [row("فيديو 1", 1)])
    const r = await searchVideos({ section: "النشرة بلغة الإشارة", limit: 10 } as any)
    expect(mockQuery).toHaveBeenCalledTimes(2) // لا طبقة AND/OR كلمات إطلاقاً
    const [countSql, countParams] = mockQuery.mock.calls[0]
    expect(countSql).not.toContain("vf.title) LIKE")
    expect(countSql).toContain("vs.title")
    expect(countParams).toEqual(["%النشرة بلغة الإشارة%"])
    expect((r.data as any).total).toBe(57)
  })

  it("query = '' (سلسلة فارغة) ⇒ نفس سلوك الغياب الكامل", async () => {
    mockTier(57, [row("فيديو 1", 1)])
    const r = await searchVideos({ query: "", section: "النشرة بلغة الإشارة" })
    expect(mockQuery).toHaveBeenCalledTimes(2)
    expect((r.data as any).total).toBe(57)
  })

  it("query غائب وsection غائب أيضاً ⇒ كل الفيديوهات النشطة، بلا أي شرط", async () => {
    mockTier(9999, [row("فيديو 1", 1)])
    await searchVideos({} as any)
    const [countSql, countParams] = mockQuery.mock.calls[0]
    expect(countSql).not.toContain("vs.title")
    expect(countParams).toEqual([])
  })
})

describe("searchVideos — إعادة إنتاج الخلل الحيّ + الإصلاح", () => {
  it("AND فارغ ⇒ طبقة OR واحدة (لا حلقة نداءات لكل كلمة)، مرتّبة بعدد المطابقات", async () => {
    mockTier(0, []) // AND فارغة
    mockTier(1, [row("الختمة القرآنية الرمضانية المرتلة في صحن مرقد أبي الفضل العباس", 1)]) // OR

    const r = await searchVideos({ query: "الحفل القرآني المرتل في الصحن" })

    expect(mockQuery).toHaveBeenCalledTimes(4) // AND: count+select، OR: count+select
    const [selectSql, selectParams] = mockQuery.mock.calls[3] // SELECT طبقة OR
    expect(selectSql).toContain("ORDER BY (")
    expect(selectSql).toContain("DESC, vf.created_at DESC")
    expect(countPlaceholders(selectSql)).toBe(selectParams.length)
    expect((r.data as any).results[0].name).toContain("الختمة القرآنية")
    expect((r.data as any).total).toBe(1)
  })

  it("كلمة ٤+ أحرف تُطابَق كبادئة (prefix) تلتقط اختلاف اللاحقة النحوية", async () => {
    mockTier(0, [])
    mockTier(1, [row("x")])
    await searchVideos({ query: "المرتل القرآني" }) // كلمتان، ٤+ أحرف كلتاهما
    const [, selectParams] = mockQuery.mock.calls[3]
    // نمط بادئة: "% كلمة" بلا مسافة إغلاق يمين — لا "% كلمة %" المقيَّدة الجانبين
    expect(selectParams.some((p: any) => typeof p === "string" && p.startsWith("% ") && !p.endsWith(" "))).toBe(true)
  })

  it("كلمة قصيرة (٢-٣ أحرف) تبقى بمطابقة كلمة كاملة صارمة (لا بادئة)", async () => {
    mockTier(0, [])
    mockTier(1, [row("x")])
    await searchVideos({ query: "في الصحن" }) // "في"(2) قصيرة، "الصحن"(5) طويلة
    const [, selectParams] = mockQuery.mock.calls[3]
    expect(selectParams).toContain("% في %") // كلمة كاملة، لا بادئة
    expect(selectParams).toContain("% الصحن%") // بادئة
  })

  it("قيمة المستخدم تمرّ كمعامل لا داخل نصّ SQL", async () => {
    mockTier(0, [])
    mockTier(0, [])
    await searchVideos({ query: "غزة فلسطين" })
    const [sql] = mockQuery.mock.calls[0]
    expect(sql).not.toContain("غزة")
    expect(sql).not.toContain("فلسطين")
  })

  it("مع فلتر section: عدد `?` يبقى سليماً في كل نداءات طبقة OR", async () => {
    mockTier(0, [])
    mockTier(0, [])
    await searchVideos({ query: "الختمة القرآنية", section: "أربعين" })
    for (const [sql, params] of mockQuery.mock.calls) {
      expect(sql).toContain("vs.title")
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("OR فارغة أيضاً ⇒ نتيجة فارغة صادقة (total=0) بلا رمي استثناء", async () => {
    mockTier(0, [])
    mockTier(0, [])
    const r = await searchVideos({ query: "كلمتان لا وجود لهما" })
    expect(r.success).toBe(true)
    expect((r.data as any).results).toEqual([])
    expect((r.data as any).total).toBe(0)
  })
})

describe("getVideoSections — رابط القسم يستخدم مسار /mediacat/ لا /media/", () => {
  it("يبني url بصيغة /mediacat/{request}?lang=ar — تحقّق حيّ فعلي (id=45 'النشرة بلغة الإشارة')", async () => {
    // ⚠️ فحص حيّ حقيقي: المالك أبلغ أن رابط سلسلة "النشرة بلغة الإشارة"
    // (request='d0d55') الصحيح https://alkafeel.net/mediacat/d0d55?lang=ar
    // بينما الكود القديم كان يبني /media/d0d55 (مسار صفحة فيديو مفرد، لا قسم).
    mockQuery.mockResolvedValueOnce([[
      { id: 45, title_ar: "النشرة بلغة الإشارة", request: "d0d55" },
    ]])
    const r = await getVideoSections()
    const section = (r.data as any).sections[0]
    expect(section.url).toBe("https://alkafeel.net/mediacat/d0d55?lang=ar")
    expect(section.url).not.toContain("/media/d0d55")
  })
})

describe("searchVideos — sort_by=views — عمود views كان موجوداً بلا أي استعمال", () => {
  // ⚠️ فحص حيّ: سؤال "ما أكثر فيديو مشاهدة لديكم؟" جعل البوت يعتذر بعدم
  // التوفّر، رغم أن video_files يحوي عمود views حقيقياً — لم يكن هناك أي
  // مسار (لا SELECT ولا ORDER BY) لاستعماله إطلاقاً. أُضيف sort_by بنفس
  // نمط search_content (relevance/views/views_asc).

  it("بلا query ولا section، sortBy='views' ⇒ ORDER BY vf.views DESC في طبقة العدّ النظيفة", async () => {
    mockTier(3, [row("فيديو الأكثر مشاهدة", 1, 50000)])
    const r = await searchVideos({ sortBy: "views", limit: 1 })
    const [selectSql] = mockQuery.mock.calls[1]
    expect(selectSql).toContain("ORDER BY vf.views DESC")
    expect((r.data as any).results[0].views).toBe(50000)
  })

  it("بلا sortBy (افتراضي) ⇒ يبقى الترتيب بالأحدث كالسابق (لا انتكاس)", async () => {
    mockTier(1, [row("فيديو", 1)])
    await searchVideos({})
    const [selectSql] = mockQuery.mock.calls[1]
    expect(selectSql).toContain("ORDER BY vf.created_at DESC")
  })

  it("views يصل حقل النتيجة دائماً (حتى 0 حين يغيب)، لا يُحذَف بصمت", async () => {
    mockTier(1, [row("فيديو بلا مشاهدات مسجَّلة", 1)]) // views افتراضي 0 في row()
    const r = await searchVideos({})
    expect((r.data as any).results[0].views).toBe(0)
  })
})
