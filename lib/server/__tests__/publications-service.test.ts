/**
 * publications-service.test.ts — اختبارات خدمة الإصدارات (سلامة المعاملات + السلوك).
 *
 * يُحاكى `db` فيُلتقط نصّ الاستعلام ومعاملاته دون لمس قاعدة بيانات حقيقية،
 * بنفس نمط search-engine.test.ts وanalytics-service.sql.test.ts.
 *
 * ⚠️ كل طبقة بحث (tier) تنفّذ **نداءين**: SELECT (بحدّ LIMIT) ثم COUNT(*) بنفس
 * شرط WHERE بمعزل عن LIMIT. أُضيف نداء العدّ بعد فحص حيّ حقيقي: كان
 * `total: results.length` (طول المصفوفة المُقتَصّة) فبدا "8" (= الحدّ
 * الافتراضي) وكأنه العدد الكلّي، فرفض النموذج اعتماده وردّ بـ«لا تتوفر
 * معلومات» على سؤال «كم عدد الإصدارات لدينا؟» — نفس فصيلة خلل «العدد
 * المضلّل» في §11.2/§7 (search_content.total)، أُعيد إنتاجها هنا سهواً.
 *
 * ⚠️ اهتمام خاصّ بسلامة معاملات **الخطوة الثانية (fallback OR)**: هذه الخطوة
 * أُضيفت بعد فحص حيّ كشف أن AND الصارم يُفوّت نتائج حقيقية موجودة فعلاً
 * ("سيرة أبي الفضل العباس" لم تُطابق رغم وجود 10 إصدارات عن العباس)، وتعبير
 * matchCount في ORDER BY يُكرّر نفس أنماط WHERE — بالضبط نوع التعقيد الذي
 * سبّق أن أنتج خلل ترتيب معاملات صامتاً في search-engine.ts (انظر §11.2).
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

import { searchPublications, getPublicationCategories } from "../publications-service"

const countPlaceholders = (sql: string) => (sql.match(/\?/g) || []).length

/** استجابة SELECT (صفوف) متبوعة باستجابة COUNT — تُمثّل طبقة بحث واحدة كاملة. */
function mockTier(rows: any[], total: number) {
  mockExecute.mockResolvedValueOnce([rows])
  mockExecute.mockResolvedValueOnce([[{ total }]])
}

beforeEach(() => {
  mockExecute.mockReset()
})

describe("searchPublications — الخطوة ١ (AND)", () => {
  beforeEach(() => {
    mockTier([{ id: 1, title: "كتاب", views: 5 }], 1)
  })

  it("عدد `?` يساوي طول params لنداءَي SELECT وCOUNT معاً", async () => {
    await searchPublications({ query: "سيرة العباس", categoryId: 5 })
    for (const [sql, params] of mockExecute.mock.calls) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("SELECT وCOUNT يتشاركان نفس معاملات WHERE بالضبط", async () => {
    await searchPublications({ query: "سيرة العباس", categoryId: 5 })
    const [, selectParams] = mockExecute.mock.calls[0]
    const [countSql, countParams] = mockExecute.mock.calls[1]
    expect(countSql).toContain("SELECT COUNT(*) AS total FROM publications")
    expect(countParams).toEqual(selectParams) // بلا معاملات ORDER BY إضافية
  })

  it("قيمة المستخدم تمرّ كمعامل لا داخل نصّ SQL", async () => {
    await searchPublications({ query: "غزة" })
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).not.toContain("غزة")
    expect(params.some((p: any) => typeof p === "string" && p.includes("غزه"))).toBe(true)
  })

  it("فلتر اللغة العربية ثابت دائماً (معرّف 1)", async () => {
    await searchPublications({})
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("p.deleted_at IS NULL")
    expect(sql).toContain("p.language_id = ?")
    expect(params[0]).toBe(1) // ARABIC_LANGUAGE_ID
  })

  it("LIMIT يُقصّ ضمن [1,20] ويظهر كعدد صحيح في نصّ SELECT فقط (لا COUNT)", async () => {
    await searchPublications({ query: "كتاب", limit: 500 })
    const [selectSql] = mockExecute.mock.calls[0]
    const [countSql] = mockExecute.mock.calls[1]
    expect(selectSql).toMatch(/LIMIT 20\b/)
    expect(countSql).not.toMatch(/LIMIT/) // العدّ يشمل كل المطابقات لا الصفحة المعروضة فقط
  })

  it("الافتراضي 8 عند غياب limit", async () => {
    await searchPublications({ query: "كتاب" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toMatch(/LIMIT 8\b/)
  })

  it("بلا كلمات بحث ⇒ طبقة واحدة فقط (نداءان: SELECT ثم COUNT)", async () => {
    await searchPublications({ categoryId: 3 })
    expect(mockExecute).toHaveBeenCalledTimes(2)
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("p.publication_category_id = ?")
    expect(countPlaceholders(sql)).toBe(params.length)
  })
})

describe("searchPublications — total عدد حقيقي لا طول النتائج المعروضة", () => {
  it("total من COUNT(*) لا من عدد الصفوف المُقتَصّة", async () => {
    // 3 صفوف مُعادة (بعد LIMIT) لكن العدد الحقيقي 3390 — الفرق هو بيت القصيد
    mockTier(
      [{ id: 1, title: "أ" }, { id: 2, title: "ب" }, { id: 3, title: "ج" }],
      3390
    )
    const r = await searchPublications({ categoryId: 4, limit: 3 })
    expect((r.data as any).total).toBe(3390)
    expect((r.data as any).returned).toBe(3)
  })
})

describe("searchPublications — الخطوة ٢ (fallback OR عند فراغ AND)", () => {
  it("AND فارغ ⇒ تُستدعى خطوة ثانية بمعاملات سليمة العدد (4 نداءات إجمالاً)", async () => {
    mockTier([], 0) // الخطوة ١: AND — فارغة (SELECT + COUNT كلاهما صفر)
    mockTier([{ id: 9, title: "العباس عليه السلام قمر بني هاشم", views: 3 }], 10) // الخطوة ٢: OR

    const r = await searchPublications({ query: "سيرة أبي الفضل العباس" })

    expect(mockExecute).toHaveBeenCalledTimes(4)
    const [sql3, params3] = mockExecute.mock.calls[2] // SELECT الخطوة الثانية
    // matchCount في ORDER BY يُكرّر أنماط WHERE — أعلى خطر لانزياح المعاملات
    expect(countPlaceholders(sql3)).toBe(params3.length)
    const [sql4, params4] = mockExecute.mock.calls[3] // COUNT الخطوة الثانية
    expect(countPlaceholders(sql4)).toBe(params4.length)
    expect((r.data as any).results[0].title).toContain("العباس")
    expect((r.data as any).total).toBe(10)
  })

  it("AND غير فارغ ⇒ لا تُستدعى الخطوة الثانية إطلاقاً (نداءان فقط)", async () => {
    mockTier([{ id: 1, title: "نتيجة AND", views: 5 }], 1)
    await searchPublications({ query: "سيرة العباس" })
    expect(mockExecute).toHaveBeenCalledTimes(2)
  })

  it("مع فلتر تصنيف: عدد `?` يبقى سليماً في كل نداءات الخطوة الثانية", async () => {
    mockTier([], 0)
    mockTier([], 0)
    await searchPublications({ query: "سيرة العباس", categoryId: 7 })
    for (const call of mockExecute.mock.calls) {
      const [sql, params] = call
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("OR فارغة أيضاً ⇒ نتيجة فارغة صادقة (total=0) بلا رمي استثناء", async () => {
    mockTier([], 0)
    mockTier([], 0)
    const r = await searchPublications({ query: "كلمة لا وجود لها إطلاقاً" })
    expect(r.success).toBe(true)
    expect((r.data as any).total).toBe(0)
    expect((r.data as any).results).toEqual([])
  })

  it("≥2 رقم صريح غامض ⇒ يبقى منطق الحماية القديم على مسار AND/OR النصّي", async () => {
    // حالة نادرة (توكنان رقميّان) لا تأخذ مسار version الحصري — تسقط لمسار
    // AND/OR القديم، حيث تبقى حماية "استبعاد ما لا يحوي الرقم حرفياً" سارية.
    mockTier([], 0)
    mockTier(
      [{ id: 27, title: "مجلة الرياحين العدد السابع والعشرون", views: 50 }],
      1
    )
    const r = await searchPublications({ query: "الرياحين 50 12" })
    expect((r.data as any).results).toEqual([])
    expect((r.data as any).total).toBe(0)
  })
})

describe("searchPublications — رقم عدد صريح واحد ⇒ مطابقة عبر version لا العنوان", () => {
  // اكتشاف جوهري: رقم العدد الحقيقي يعيش في عمود `version` منفصل تماماً عن
  // `title` (id=847 عنوانه "مجلة الرياحين" بلا أي رقم في النصّ، لكن
  // version="50"). البحث النصّي في العنوان — بأي صيغة AND/OR — لا يمكنه
  // إطلاقاً إيجاد هذا الصفّ. أعاد النظام قبل هذا الإصلاح "العدد 175" (بحث
  // نصّي OR طابق "رياحين"/"العدد" وتجاهل الرقم)، ثم بعد إصلاح أول تسرّعي
  // (رفض أي OR لا يحوي الرقم حرفياً بالعنوان) صار يرفض حتى الطلبات الصحيحة
  // فعلاً لأن العنوان غالباً لا يحوي رقماً بتاتاً بعد أول ~20 عدداً.

  it("رقم + اسم سلسلة ⇒ نداء واحد مباشر بـ version = ? مع تضييق بالعنوان (لا AND/OR أولاً)", async () => {
    mockTier([{ id: 847, title: "مجلة الرياحين", version: "50", views: 1708 }], 1)
    const r = await searchPublications({ query: "مجلة الرياحين العدد 50" })

    expect(mockExecute).toHaveBeenCalledTimes(2) // SELECT واحد + COUNT واحد فقط
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).toContain("p.version = ?")
    expect(countPlaceholders(sql)).toBe(params.length)
    expect(params).toContain("50")

    const data = (r.data as any)
    expect(data.results).toHaveLength(1)
    expect(data.results[0].id).toBe(847)
    expect(data.results[0].issue_number).toBe("50")
  })

  it("أرقام هندية عربية (٥٠) تُحوَّل لغربية قبل مطابقة version", async () => {
    mockTier([{ id: 847, title: "مجلة الرياحين", version: "50", views: 1708 }], 1)
    await searchPublications({ query: "العدد ٥٠ من مجلة الرياحين" })
    const [, params] = mockExecute.mock.calls[0]
    expect(params).toContain("50")
    expect(params).not.toContain("٥٠")
  })

  it("رقم غير موجود لهذه السلسلة ⇒ رفض صادق (total=0)، بلا سقوط لبحث نصّي بديل", async () => {
    mockTier([], 0) // لا صفّ بـ version=999 يطابق اسم السلسلة
    const r = await searchPublications({ query: "مجلة الرياحين العدد 999" })
    expect(mockExecute).toHaveBeenCalledTimes(2) // مطابقة version فقط، لا خطوات إضافية
    expect((r.data as any).results).toEqual([])
    expect((r.data as any).total).toBe(0)
  })

  it("رقم مجرّد بلا أي كلمة أخرى ⇒ كل الصفوف بنفس version مرشّحة (بلا تضييق بالعنوان)", async () => {
    mockTier(
      [
        { id: 847, title: "مجلة الرياحين", version: "50", views: 1708 },
        { id: 62, title: "رياض الزهراء", version: "50", views: 200 },
      ],
      2
    )
    const r = await searchPublications({ query: "50" })
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).not.toMatch(/LIKE/) // بلا كلمة أخرى غير الرقم، لا تضييق نصّي إطلاقاً
    expect((r.data as any).results).toHaveLength(2)
  })

  it("مع فلتر تصنيف: عدد `?` يبقى سليماً في نداء version", async () => {
    mockTier([{ id: 847, title: "مجلة الرياحين", version: "50", views: 1708 }], 1)
    await searchPublications({ query: "مجلة الرياحين العدد 50", categoryId: 15 })
    for (const call of mockExecute.mock.calls) {
      const [sql, params] = call
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })
})

describe("searchPublications — الخرج والأخطاء", () => {
  it("يبني image_url/pdf_url/download_url من اسم الملف المخزَّن (كلٌّ بمساره الخاص)", async () => {
    mockTier(
      [{ id: 1, title: "كتاب", date: "1434", size: "1MB", views: 10, image: "c798fbfe41.png", pdf: "a31f46fd82.pdf", download_link: "a855cc01de.zip", category_title: "سلسلة" }],
      1
    )
    const r = await searchPublications({ query: "كتاب" })
    const item = (r.data as any).results[0]
    expect(item.image_url).toBe("https://alkafeel.net/publications/img/c798fbfe41.png")
    expect(item.pdf_url).toBe("https://alkafeel.net/publications/pdf/a31f46fd82.pdf")
    expect(item.download_url).toBe("https://alkafeel.net/publications/down/a855cc01de.zip")
    expect(item).not.toHaveProperty("pdf")
    expect(item).not.toHaveProperty("download_link")
    expect(item).not.toHaveProperty("image")
  })

  it("يحافظ على امتداد الصورة الفعلي — لا يفترض .jpg ثابتاً", async () => {
    // العمود مختلط الامتدادات فعلياً (jpg/png/gif) — أي افتراض امتداد ثابت خطأ.
    mockTier(
      [{ id: 1, title: "كتاب", date: null, size: null, views: 0, image: "x.gif", pdf: null, download_link: null, category_title: null }],
      1
    )
    const r = await searchPublications({ query: "كتاب" })
    expect((r.data as any).results[0].image_url).toBe("https://alkafeel.net/publications/img/x.gif")
  })

  it("issue_number: رقم صرف من version يُعرض، نصّ غير رقمي أو غياب يُصبح null", async () => {
    // فحص حيّ: صفّ حقيقي (id=2830 "عش السلام") يخزّن نصّاً غير رقمي في version
    // — عرضه كـissue_number يُربك النموذج ("رقم العدد: عش السلام" بلا معنى).
    mockTier(
      [
        { id: 1, title: "رقمي", version: "50", views: 1 },
        { id: 2, title: "نصّي", version: "عش السلام", views: 1 },
        { id: 3, title: "بلا نسخة", version: null, views: 1 },
      ],
      3
    )
    const r = await searchPublications({ query: "كتاب" })
    const items = (r.data as any).results
    expect(items[0].issue_number).toBe("50")
    expect(items[1].issue_number).toBeNull()
    expect(items[2].issue_number).toBeNull()
  })

  it("عمود فارغ ⇒ الحقل المقابل null لا رابطاً مكسوراً", async () => {
    mockTier(
      [{ id: 1, title: "كتاب", date: null, size: null, views: 0, image: null, pdf: null, download_link: null, category_title: null }],
      1
    )
    const r = await searchPublications({ query: "كتاب" })
    const item = (r.data as any).results[0]
    expect(item.image_url).toBeNull()
    expect(item.pdf_url).toBeNull()
    expect(item.download_url).toBeNull()
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await searchPublications({ query: "كتاب" })
    expect(r.success).toBe(false)
  })
})

describe("getPublicationCategories", () => {
  beforeEach(() => {
    mockExecute.mockResolvedValue([[]])
  })

  it("لا معاملات مستخدم — المعامل الوحيد ثابت (معرّف اللغة العربية)", async () => {
    await getPublicationCategories()
    const [, params] = mockExecute.mock.calls[0]
    expect(params).toEqual([1]) // ARABIC_LANGUAGE_ID — لا مُدخل مستخدم
  })

  it("يحترم شرط الأساس (غير محذوفة + سلاسل عربية فقط)", async () => {
    await getPublicationCategories()
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("pc.deleted_at IS NULL")
    // السلاسل العربية الأصلية تحمل language_id = NULL (الترجمات تحمل أرقاماً >1)
    expect(sql).toContain("pc.language_id IS NULL")
  })

  it("يُرجع العدد والعنوان والوصف لكل تصنيف", async () => {
    mockExecute.mockResolvedValueOnce([
      [{ id: 1, title: " مناهل الطف ", detail: "وصف", sort: 1, count: 12 }],
    ])
    const r = await getPublicationCategories()
    expect((r.data as any).categories[0]).toEqual({
      id: 1, title: "مناهل الطف", detail: "وصف", count: 12,
    })
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await getPublicationCategories()
    expect(r.success).toBe(false)
  })
})
