/**
 * prayer-service.guard.test.ts — دفاع في العمق (Task 4, section C).
 *
 * يختبر حارس رفض الصيغ غير القابلة للتحليل في خدمة الصلاة:
 *   - `resolveDateToDayMonth`: صيغ صالحة → DD/MM؛ بلا إدخال → اليوم؛ غير قابل للتحليل → null.
 *   - `getPrayerTimes`: تاريخ مُقدَّم غير قابل للتحليل → { success:false } عبر فرع الرجوع
 *     المبكر الذي يسبق أي استعلام لقاعدة البيانات (اختبار بلا مساس بقاعدة البيانات).
 *
 * ملاحظة تصميم الاختبار (DB-free): المسار الناجح لـ getPrayerTimes يستعلم قاعدة البيانات،
 * لذا نقتصر هنا على:
 *   (1) خاصية/وحدة على `resolveDateToDayMonth` (دالة نقية) للمدخلات غير القابلة للتحليل → null.
 *   (2) فرع التحقق المبكر لـ getPrayerTimes (تاريخ غير قابل للتحليل → success:false) الذي
 *       يعود قبل استدعاء `db.query` — لا نُشغّل أي مسار يلمس قاعدة البيانات.
 *
 * **Validates: Requirements 2.2, 3.1**
 */

import fc from "fast-check"
import { resolveDateToDayMonth, getPrayerTimes } from "../prayer-service"

function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

/** يطابق الصيغ الثلاث المدعومة في resolveDateToDayMonth. */
function isSupportedDateFormat(s: string): boolean {
  return (
    /^(\d{4})-(\d{2})-(\d{2})$/.test(s) ||
    /^(\d{1,2})\/(\d{1,2})$/.test(s) ||
    /^(\d{1,2})-(\d{1,2})$/.test(s)
  )
}

describe("resolveDateToDayMonth — وحدة", () => {
  it("صيغة YYYY-MM-DD صالحة → DD/MM", () => {
    expect(resolveDateToDayMonth("2026-07-05")).toBe("05/07")
  })

  it("صيغة DD/MM صالحة → DD/MM (مع تصفير)", () => {
    expect(resolveDateToDayMonth("5/7")).toBe("05/07")
  })

  it("صيغة DD-MM صالحة → DD/MM", () => {
    expect(resolveDateToDayMonth("05-07")).toBe("05/07")
  })

  it("بلا إدخال (undefined) → تاريخ اليوم بصيغة DD/MM", () => {
    const now = new Date()
    const today = `${pad2(now.getDate())}/${pad2(now.getMonth() + 1)}`
    expect(resolveDateToDayMonth(undefined)).toBe(today)
  })

  it.each(["10 محرم 1448", "abc", "hello", "الأربعين", "2026/07/05 هجري", "12-13-2026"])(
    "صيغة غير قابلة للتحليل «%s» → null",
    (input) => {
      expect(resolveDateToDayMonth(input)).toBeNull()
    }
  )
})

describe("resolveDateToDayMonth — property: unparseable → null", () => {
  it("أي سلسلة غير مطابقة للصيغ الثلاث تُرجع null", () => {
    fc.assert(
      fc.property(
        fc
          .string({ minLength: 1 })
          .filter((s) => s.trim().length > 0 && !isSupportedDateFormat(s)),
        (input) => {
          expect(resolveDateToDayMonth(input)).toBeNull()
        }
      ),
      { numRuns: 300 }
    )
  })

  it("نصوص عربية/هجرية غير قابلة للتحليل تُرجع null", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(
          "محرم",
          "رمضان",
          "10 محرم",
          "عاشوراء 1447",
          "زيارة الأربعين",
          "غداً",
          "بعد أسبوع"
        ),
        (input) => {
          expect(resolveDateToDayMonth(input)).toBeNull()
        }
      )
    )
  })
})

describe("getPrayerTimes — فرع الرجوع المبكر (تاريخ غير قابل للتحليل، بلا قاعدة بيانات)", () => {
  it.each(["10 محرم 1448", "الأربعين", "abc"])(
    "تاريخ مُقدَّم غير قابل للتحليل «%s» → success:false قبل أي استعلام",
    async (badDate) => {
      const result = await getPrayerTimes({ date: badDate })
      expect(result.success).toBe(false)
      expect(typeof result.error).toBe("string")
    }
  )
})
