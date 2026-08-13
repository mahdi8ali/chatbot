/**
 * search-engine.test.ts — اختبارات محرّك ترشيح المرشّحين في قاعدة البيانات.
 *
 * يُحاكى `db` فيُلتقط نصّ الاستعلام ومعاملاته دون لمس قاعدة بيانات حقيقية.
 *
 * الثابت الحاكم الأهم هنا (وهو ما انكسر فعلاً أثناء التطوير):
 * **ترتيب المعاملات يجب أن يطابق ترتيب ظهور علامات `?` في نصّ الاستعلام.**
 * وضع معاملات ORDER BY قبل معاملات WHERE لا يُنتج خطأ SQL — بل يُزيح النافذة
 * الزمنية فتلتقط أنماط LIKE بدل التواريخ، فتفسد النتائج بصمت. القياس وقتها:
 * متوسط درجة الصلة هبط من 26.16 إلى 20.73، وصفر تطابق مع نتائج المحرّك القديم.
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

// نمنع الأثر الجانبي لتحميل الخدمات (تسخين الكاش)
jest.mock("../news-service", () => ({
  __esModule: true,
  mapNewsToItem: (r: any) => r,
}))
jest.mock("../video-service", () => ({
  __esModule: true,
  mapVideoToItem: (r: any) => r,
}))

import {
  fetchNewsCandidates,
  fetchVideoCandidates,
  expandQueryTerms,
  latestNewsDate,
  CANDIDATE_LIMIT,
} from "../search-engine"

/** عدد علامات `?` في نصّ استعلام. */
const countPlaceholders = (sql: string) => (sql.match(/\?/g) || []).length

beforeEach(() => {
  mockExecute.mockReset()
  mockExecute.mockResolvedValue([[]])
})

/** كل الاستدعاءات: [sql, params]. */
const calls = () => mockExecute.mock.calls as Array<[string, any[]]>

describe("سلامة المعاملات — الثابت الحاكم", () => {
  it("عدد `?` يساوي طول params في كل استعلام أخبار", async () => {
    await fetchNewsCandidates({ query: "مشروع صحن أم البنين", fromDate: "2026-01-01", toDate: "2026-06-30" })
    expect(calls().length).toBeGreaterThan(0)
    for (const [sql, params] of calls()) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("عدد `?` يساوي طول params في كل استعلام فيديو", async () => {
    await fetchVideoCandidates({ query: "زيارة الأربعين", fromDate: "2026-01-01" })
    for (const [sql, params] of calls()) {
      expect(countPlaceholders(sql)).toBe(params.length)
    }
  })

  it("معاملات ORDER BY تأتي بعد معاملات WHERE والنافذة (ترتيب نصّي)", async () => {
    await fetchNewsCandidates({ query: "صحن البنين", fromDate: "2026-01-01", toDate: "2026-06-30" })

    // الاستعلام ذو ORDER BY المحسوب هو استعلام العنوان
    const titleCall = calls().find(([sql]) => /ORDER BY \(/.test(sql))
    expect(titleCall).toBeDefined()
    const [sql, params] = titleCall!

    // موضع أوّل `?` في ORDER BY داخل النصّ
    const orderIdx = sql.indexOf("ORDER BY")
    const before = countPlaceholders(sql.slice(0, orderIdx))

    // المعاملات التي تسبق ORDER BY يجب أن تنتهي بمعاملات النافذة (تواريخ/null)
    const windowParams = params.slice(before - 4, before)
    for (const p of windowParams) {
      const ok = p === null || (typeof p === "string" && /^\d{4}-\d{2}-\d{2} /.test(p))
      expect(ok).toBe(true) // ← لو انزاح الترتيب لالتقطت النافذة أنماط "%كلمة%"
    }
  })

  it("قيم المستخدم تمرّ كمعاملات لا داخل نصّ SQL", async () => {
    await fetchNewsCandidates({ query: "غزة" })
    for (const [sql, params] of calls()) {
      expect(sql).not.toContain("غزة")
      expect(params.some(p => typeof p === "string" && p.includes("غزة"))).toBe(true)
    }
  })
})

describe("توسيع كلمات الاستعلام", () => {
  it("يضيف الجذر إلى الكلمة للحفاظ على الاسترجاع الصرفي", () => {
    const terms = expandQueryTerms("المشاريع")
    expect(terms).toContain("المشاريع")
    expect(terms).toContain("مشاريع") // بعد تجريد «ال»
  })

  it("يحذف التشكيل ويوحّد حالة الأحرف", () => {
    expect(expandQueryTerms("زِيارة")).toContain("زيارة")
  })

  it("يعيد مصفوفة فارغة للاستعلام الفارغ", () => {
    expect(expandQueryTerms("")).toEqual([])
    expect(expandQueryTerms("   ")).toEqual([])
  })

  it("لا يكرّر الصيغ", () => {
    const terms = expandQueryTerms("صحن صحن")
    expect(new Set(terms).size).toBe(terms.length)
  })
})

describe("شرط الرؤية والفلاتر", () => {
  it("كل استعلام يحترم شرط الأساس (نشط وغير محذوف)", async () => {
    await fetchNewsCandidates({ query: "خبر" })
    for (const [sql] of calls()) {
      expect(sql).toContain("n.active = 1 AND n.deleted_at IS NULL")
    }
  })

  it("بلا كلمات بحث ⇒ استعلام واحد فقط (فلاتر فقط)", async () => {
    await fetchNewsCandidates({ fromDate: "2026-01-01" })
    expect(calls().length).toBe(1)
  })

  it("مع كلمات بحث ⇒ استعلاما العنوان والمتن", async () => {
    await fetchNewsCandidates({ query: "صحن البنين" })
    expect(calls().length).toBe(2)
  })

  it("sort_by=views يرتّب بالمشاهدات لا بالصلة", async () => {
    await fetchNewsCandidates({ query: "خبر", sortBy: "views" })
    expect(calls().every(([sql]) => sql.includes("n.views DESC"))).toBe(true)
  })

  it("الترتيب الافتراضي يستعمل المفتاح الأساسي (توقّف مبكّر)", async () => {
    await fetchNewsCandidates({ fromDate: "2026-01-01" })
    expect(calls()[0][0]).toContain("n.id DESC")
  })

  it("فلتر النوع يُمرَّر كمعامل", async () => {
    await fetchNewsCandidates({ query: "خبر", type: "انفوغراف" })
    for (const [sql, params] of calls()) {
      expect(sql).toContain("nt.name = ?")
      expect(params).toContain("انفوغراف")
    }
  })
})

describe("حدود النافذة", () => {
  it("سقف المرشّحين ثابت ومعقول", () => {
    expect(CANDIDATE_LIMIT).toBeGreaterThan(0)
    expect(CANDIDATE_LIMIT).toBeLessThanOrEqual(2000)
  })

  it("LIMIT يظهر كعدد صحيح في النصّ (لا كمعامل — قيد mysql2)", async () => {
    await fetchNewsCandidates({ query: "خبر" })
    for (const [sql] of calls()) {
      expect(sql).toMatch(/LIMIT \d+/)
    }
  })
})

describe("latestNewsDate", () => {
  it("يعيد التاريخ عند وجوده", async () => {
    mockExecute.mockResolvedValueOnce([[{ d: "2026-08-01" }]])
    expect(await latestNewsDate()).toBe("2026-08-01")
  })

  it("يعيد null عند الفشل بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    await expect(latestNewsDate()).resolves.toBeNull()
  })
})
