/**
 * places-service.test.ts — اختبارات searchPlaces() (سلامة العدّ الحقيقي).
 *
 * ⚠️ فحص استباقي (جولة الفحص الشاملة بعد إصلاحات مماثلة في publications/
 * lost-items/friday-sermons/videos اليوم): searchPlaces() كانت تعيد
 * total: results.length — أي عدد الصفوف بعد LIMIT (1-30)، لا العدد الحقيقي
 * لكل الأماكن المطابقة. نفس نمط الخلل المُصلَح مراراً اليوم. الإصلاح: استعلام
 * COUNT(*) مستقلّ بنفس شروط WHERE، بلا LIMIT.
 */

const mockQuery = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ query: mockQuery }) }
})

import { searchPlaces } from "../places-service"

/** استجابة COUNT متبوعة باستجابة SELECT — بهذا الترتيب في searchPlaces(). */
function mockCountThenRows(total: number, rows: any[]) {
  mockQuery.mockResolvedValueOnce([[{ total }]])
  mockQuery.mockResolvedValueOnce([rows])
}

beforeEach(() => {
  mockQuery.mockReset()
})

describe("searchPlaces — العدّ الحقيقي (COUNT) لا طول النتائج المقطوعة", () => {
  it("عدد المطابقات الحقيقي أكبر من LIMIT ⇒ total يعكس العدد الحقيقي لا عدد الصفوف المعادة", async () => {
    const rows = Array.from({ length: 8 }, (_, i) => ({
      id: i + 1,
      place_name: `فندق ${i + 1}`,
      place_city: "كربلاء",
      place_address: null,
      place_lat: null,
      place_lng: null,
      place_popular: "0",
      category_name: "الفنادق",
    }))
    mockCountThenRows(47, rows) // 47 فندقاً فعلياً، لكن limit الافتراضي 8 صفوف فقط تُعاد
    const r = await searchPlaces({ category: "فنادق" })
    expect(r.success).toBe(true)
    expect((r.data as any).total).toBe(47)
    expect((r.data as any).results).toHaveLength(8)
  })

  it("استعلام العدّ لا يحتوي LIMIT إطلاقاً (مستقلّ عن قطع النتائج)", async () => {
    mockCountThenRows(0, [])
    await searchPlaces({ query: "الحسينية" })
    const [countSql] = mockQuery.mock.calls[0]
    expect(countSql).not.toContain("LIMIT")
  })

  it("نفس شروط WHERE (category/query/city) تُستخدَم في استعلامَي العدّ والعرض معاً", async () => {
    mockCountThenRows(0, [])
    await searchPlaces({ query: "زيارة", category: "مزار", city: "كربلاء" })
    const [countSql, countParams] = mockQuery.mock.calls[0]
    const [selectSql, selectParams] = mockQuery.mock.calls[1]
    expect(countSql).toContain("place_name")
    expect(countSql).toContain("category_name LIKE")
    expect(countSql).toContain("place_city")
    // معاملات LIKE الثلاثة نفسها في كلا الاستعلامين؛ استعلام العرض يضيف limit في النهاية فقط
    expect(selectParams.slice(0, 3)).toEqual(countParams)
    expect(selectParams).toHaveLength(countParams.length + 1)
    expect(selectSql).toContain("LIMIT ?")
  })

  it("بلا أي فلتر ⇒ WHERE 1=1 في كلا الاستعلامين، لا استثناء", async () => {
    mockCountThenRows(4056, [])
    const r = await searchPlaces({})
    expect(r.success).toBe(true)
    expect((r.data as any).total).toBe(4056)
    const [countSql] = mockQuery.mock.calls[0]
    expect(countSql).toContain("1=1")
  })
})
