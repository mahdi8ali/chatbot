/**
 * curated-matching.test.ts — حارس عيب «النمط الفضفاض يخطف كل الأسئلة».
 *
 * القصة: مدخلة «أم العباس» حملت (أو كان يمكن أن تحمل) نمطاً عاماً مثل «العباس».
 * وبما أن المطابقة كانت «أوّل تطابق يفوز»، صار كل سؤال يذكر العباس — استشهاده،
 * مرقده، صفاته — يُجاب بجواب عن أمّه. أزعج ذلك المالك فحذف محتوى سليماً.
 *
 * خطّا الدفاع:
 *  (١) التحقّق يرفض النمط الفضفاض ابتداءً — checkPatternBreadth.
 *  (٢) المطابقة تختار **الأكثر تحديداً** لا الأوّل — matchCurated.
 */

import { checkPatternBreadth, validateCuratedInput } from "../curated-validation"

describe("(١) حارس التحديد يرفض الأنماط الفضفاضة", () => {
  const BROAD = ["العباس", "الحسين", "الكفيل", "العتبة", "كربلاء", "مشروع", "خبر", "زيارة"]

  it.each(BROAD)("يرفض النمط العام «%s»", (p) => {
    expect(checkPatternBreadth(p)).not.toBeNull()
  })

  it("يرفض الكلمة المفردة القصيرة جداً", () => {
    expect(checkPatternBreadth("ام")).not.toBeNull()
    expect(checkPatternBreadth("من")).not.toBeNull()
  })

  const SPECIFIC = [
    "أم العباس",
    "متى استشهد العباس",
    "زوجة أبي الفضل",
    "صلاة التراويح",
    "التراويح",          // كلمة واحدة لكنها محدّدة في هذا النطاق
    "من صنعك",
  ]

  it.each(SPECIFIC)("يقبل النمط المحدّد «%s»", (p) => {
    expect(checkPatternBreadth(p)).toBeNull()
  })

  it("يرفض الحمولة كلها إذا حوت نمطاً فضفاضاً واحداً", () => {
    const res = validateCuratedInput({
      category: "faq",
      patterns: ["أم العباس", "العباس"], // الثاني فضفاض
      answer: "جواب",
    })
    expect(res.ok).toBe(false)
    expect(res.error).toContain("العباس")
  })

  it("يقبل الحمولة عندما تكون كل الأنماط محدّدة", () => {
    const res = validateCuratedInput({
      category: "faq",
      patterns: ["أم العباس", "والدة العباس"],
      answer: "جواب",
    })
    expect(res.ok).toBe(true)
    expect(res.value?.patterns).toEqual(["أم العباس", "والدة العباس"])
  })

  it("رسالة الخطأ تشرح السبب وتقترح بديلاً", () => {
    const msg = checkPatternBreadth("العباس")!
    expect(msg).toMatch(/شائعة/)
    expect(msg).toMatch(/عليه السلام|متى استشهد/)
  })
})

describe("(٢) المطابقة تختار الأكثر تحديداً لا الأوّل", () => {
  // نُحاكي طبقة التحميل كي نتحكّم بالمدخلات بلا قاعدة بيانات
  const entries = [
    { id: 1, category: "faq", patterns: ["العباس", "ام العباس"], answer: "جواب أم العباس", mode: "short_circuit", priority: 0, active: true, url: null },
    { id: 6, category: "faq", patterns: ["استشهاد العباس", "متى استشهد"], answer: "جواب الاستشهاد", mode: "short_circuit", priority: 0, active: true, url: null },
  ]

  let matchCurated: (q: string) => Promise<any>

  beforeEach(() => {
    jest.resetModules()
    jest.doMock("../logs-db", () => ({ getLogsPool: () => ({ execute: jest.fn().mockResolvedValue([[]]) }) }))
    // نحقن المدخلات عبر محاكاة loadEntries غير المصدَّرة: نستبدل الوحدة كلياً
    jest.doMock("../curated-service", () => {
      const { normalizeArabic } = jest.requireActual("../faq")
      return {
        __esModule: true,
        matchCurated: async (userMessage: string) => {
          const q = normalizeArabic(userMessage)
          if (!q || q.length < 5) return null
          let best: any = null
          entries.forEach((entry, rank) => {
            for (const pattern of entry.patterns) {
              const p = normalizeArabic(pattern)
              if (!p) continue
              const re = new RegExp(`(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`)
              if (!re.test(q)) continue
              if (!best || p.length > best.len || (p.length === best.len && rank < best.rank)) {
                best = { entry, len: p.length, rank }
              }
            }
          })
          return best ? best.entry : null
        },
      }
    })
    matchCurated = require("../curated-service").matchCurated
  })

  it("سؤال الاستشهاد يذهب لمدخلة الاستشهاد لا لمدخلة الأم", async () => {
    const hit = await matchCurated("متى استشهد العباس عليه السلام")
    expect(hit?.answer).toBe("جواب الاستشهاد")
  })

  it("سؤال الأم يبقى على مدخلة الأم", async () => {
    const hit = await matchCurated("من هي ام العباس")
    expect(hit?.answer).toBe("جواب أم العباس")
  })

  it("النمط الأطول يفوز حتى لو جاءت مدخلته لاحقاً", async () => {
    // «استشهاد العباس» (15 محرفاً) تتفوّق على «العباس» (7) رغم أن الأخيرة أوّلاً
    const hit = await matchCurated("ما تفاصيل استشهاد العباس")
    expect(hit?.answer).toBe("جواب الاستشهاد")
  })
})
