/**
 * اختبار تكامل حقيقي — يستدعي executeToolByName على قاعدة بيانات MySQL الفعلية.
 * يثبت المسار الكامل: اسم الأداة → news-service → db → نتيجة دقيقة.
 *
 * يتطلب تشغيل قاعدة البيانات المحلية (XAMPP). يتخطّى نفسه إن تعذّر الاتصال.
 */

import { executeToolByName } from "../site-api-service"
import { getPool, closePool } from "../db"

const PHRASE = "المجمع العلمي للقرآن الكريم"

let dbAvailable = true

beforeAll(async () => {
  try {
    await getPool().query("SELECT 1")
  } catch (e) {
    dbAvailable = false
    console.error("[Integration] DB connection failed:", (e as any)?.message)
  }
})

afterAll(async () => {
  await closePool()
})

describe("executeToolByName('get_news_count') — تكامل حقيقي", () => {
  test("يُرجع العدد الدقيق لأخبار العنوان (وحتمي عبر التكرار)", async () => {
    if (!dbAvailable) {
      console.warn("تخطّي: قاعدة البيانات غير متاحة")
      return
    }
    const r1 = await executeToolByName("get_news_count" as any, {
      query: PHRASE,
      scope: "title"
    })
    const r2 = await executeToolByName("get_news_count" as any, {
      query: PHRASE,
      scope: "title"
    })

    expect(r1.success).toBe(true)
    expect(typeof r1.data.count).toBe("number")
    // حتمية: نفس السؤال يُعطي نفس العدد
    expect(r1.data.count).toBe(r2.data.count)
    // دقة: العدد ليس صفراً لموضوع معروف موجود
    expect(r1.data.count).toBeGreaterThan(0)
    // ليس رقماً مُختلقاً من ردود الروبوت السابقة
    expect(r1.data.count).not.toBe(22)
    expect(r1.data.count).not.toBe(2683)
    console.log("عدد أخبار العنوان:", r1.data.count)
  })

  test("scope=content يُرجع عدداً أكبر أو مساوياً للعنوان", async () => {
    if (!dbAvailable) return
    const t = await executeToolByName("get_news_count" as any, {
      query: PHRASE,
      scope: "title"
    })
    const c = await executeToolByName("get_news_count" as any, {
      query: PHRASE,
      scope: "content"
    })
    expect(c.data.count).toBeGreaterThanOrEqual(t.data.count)
  })
})
