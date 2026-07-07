/**
 * اختبارات خدمة عدّ الأخبار — تتحقق من خصائص الإصلاح:
 * - الحتمية: نفس المدخل يُنتج نفس العدد دائماً
 * - الدقة: العدد يساوي ما تُرجعه قاعدة البيانات (COUNT) حرفياً — لا تقريب/اختلاق
 * - عدم الاختلاق: عند الخطأ أو مدخل غير صالح لا يُرجَع رقم مُختلق
 * - الأمان: الاستعلام مُعاملي (العبارة تمرّ كـ parameter وليست داخل نص SQL)
 */

import { query } from "../db"
import { getNewsCount, getNewsTotal } from "../news-service"

jest.mock("../db", () => ({
  query: jest.fn()
}))

const mockedQuery = query as jest.MockedFunction<typeof query>

beforeEach(() => {
  mockedQuery.mockReset()
})

describe("getNewsCount", () => {
  test("يُرجع العدد الدقيق من قاعدة البيانات حرفياً", async () => {
    mockedQuery.mockResolvedValue([{ c: 81 }] as any)
    const res = await getNewsCount("المجمع العلمي للقرآن الكريم", "title", true)
    expect(res.success).toBe(true)
    expect(res.count).toBe(81)
    expect(res.scope).toBe("title")
    expect(res.activeOnly).toBe(true)
  })

  test("حتمي: نفس المدخل يُنتج نفس العدد في كل مرة", async () => {
    mockedQuery.mockResolvedValue([{ c: 12 }] as any)
    const r1 = await getNewsCount("قسم معيّن", "title")
    const r2 = await getNewsCount("قسم معيّن", "title")
    const r3 = await getNewsCount("قسم معيّن", "title")
    expect(r1.count).toBe(r2.count)
    expect(r2.count).toBe(r3.count)
  })

  test("scope=content يبحث في عمود النص text", async () => {
    mockedQuery.mockResolvedValue([{ c: 1139 }] as any)
    const res = await getNewsCount("عبارة", "content", false)
    expect(res.count).toBe(1139)
    const sql = mockedQuery.mock.calls[0][0] as string
    expect(sql).toContain("text LIKE ?")
    expect(sql).not.toContain("active = 1") // activeOnly=false
  })

  test("scope=title (افتراضي) يبحث في العنوان title1 مع active=1", async () => {
    mockedQuery.mockResolvedValue([{ c: 5 }] as any)
    await getNewsCount("عبارة")
    const sql = mockedQuery.mock.calls[0][0] as string
    expect(sql).toContain("title1 LIKE ?")
    expect(sql).toContain("active = 1")
  })

  test("الاستعلام مُعاملي: العبارة تُمرَّر كـ parameter مغلّفة بـ %..%", async () => {
    mockedQuery.mockResolvedValue([{ c: 3 }] as any)
    await getNewsCount("المجمع العلمي", "title")
    const params = mockedQuery.mock.calls[0][1] as any[]
    expect(params).toEqual(["%المجمع العلمي%"])
    // العبارة يجب ألا تظهر داخل نص SQL نفسه (حماية من الحقن)
    const sql = mockedQuery.mock.calls[0][0] as string
    expect(sql).not.toContain("المجمع العلمي")
  })

  test("عدم الاختلاق: مدخل قصير جداً → success=false بلا رقم مُختلق", async () => {
    const res = await getNewsCount("ا", "title")
    expect(res.success).toBe(false)
    expect(res.count).toBe(0)
    expect(mockedQuery).not.toHaveBeenCalled()
  })

  test("عدم الاختلاق: خطأ قاعدة البيانات → success=false و count=0", async () => {
    mockedQuery.mockRejectedValue(new Error("DB down"))
    const res = await getNewsCount("عبارة صالحة", "title")
    expect(res.success).toBe(false)
    expect(res.count).toBe(0)
    expect(res.error).toBeTruthy()
  })

  test("العدد 0 يُعاد كما هو (لا يُحوَّل لرقم مُختلق)", async () => {
    mockedQuery.mockResolvedValue([{ c: 0 }] as any)
    const res = await getNewsCount("موضوع غير موجود", "title")
    expect(res.success).toBe(true)
    expect(res.count).toBe(0)
  })

  // خاصية: الدقة والحتمية عبر مدخلات عشوائية متعددة
  test("خاصية: العدد المُعاد يطابق قيمة قاعدة البيانات لأي مدخل صالح", async () => {
    for (let i = 0; i < 50; i++) {
      const fakeCount = Math.floor(Math.random() * 100000)
      const phrase = "موضوع رقم " + i
      mockedQuery.mockResolvedValueOnce([{ c: fakeCount }] as any)
      const res = await getNewsCount(phrase, "title")
      expect(res.count).toBe(fakeCount) // مطابقة حرفية، لا تقريب
    }
  })
})

describe("getNewsTotal", () => {
  test("يُرجع الإجمالي الدقيق", async () => {
    mockedQuery.mockResolvedValue([{ c: 31671 }] as any)
    const res = await getNewsTotal(false)
    expect(res.success).toBe(true)
    expect(res.count).toBe(31671)
  })
})
