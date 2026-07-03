/**
 * prayer-service.preservation.test.ts
 *
 * Property 2: Preservation — عدم تغيّر سلوك الأسئلة داخل النطاق.
 *
 * منهجية الملاحظة أولاً (observation-first): نلتقط السلوك الحالي (قبل الإصلاح) لدالة
 * `resolveDateToDayMonth` الحتمية الموجودة الآن في prayer-service.ts، لنثبت لاحقاً عدم وجود
 * انحدار بعد تطبيق الإصلاح (المهمة 3.5 ستُعدّل معالجة الصيغ غير القابلة للتحليل فقط).
 *
 * نطاق هذا الملف مقصور على السلوك الذي يجب أن يبقى دون تغيير:
 *   - أي تاريخ ميلادي صحيح بالصيغ المدعومة (YYYY-MM-DD / DD/MM / DD-MM) يُنتج DD/MM مصفّراً صحيحاً.
 *   - «بلا إدخال» (undefined) يرجع تاريخ اليوم بصيغة DD/MM.
 *
 * ملاحظة مقصودة: لا نؤكد هنا سلوك «الصيغة غير القابلة للتحليل → إشارة عدم صلاحية»؛ فذلك سلوك
 * جديد يُدخَل في المهمة 3.5. إبقاء هذه الاختبارات على الصيغ الصالحة + بلا إدخال يضمن نجاحها
 * على الكود غير المُصلَح الآن (تأكيد خط الأساس).
 *
 * ملاحظة/Placeholder: اختبارات حفظ `classifyScope` داخل النطاق (التمييز محتوى↔توقيت، ومنع
 * false positives) ستُكتب وتُشغَّل بعد أن تُنشئ المهمة 3.1 الوحدة `lib/server/scope-guard.ts`؛
 * تلك الخصائص تخص المهمة 4 ويُتحقَّق منها في 3.8. لا نستورد scope-guard هنا (غير موجود بعد)،
 * ونُبقي هذا الملف مركّزاً على حفظ سلوك prayer-service فقط لكي يَنجح على الكود غير المُصلَح.
 *
 * Validates: Requirements 3.1
 */

import fc from "fast-check"
import { resolveDateToDayMonth } from "../prayer-service"

/** يطابق منطق التصفير الداخلي في prayer-service (DD/MM). */
function pad2(n: number): string {
  return String(n).padStart(2, "0")
}

function expectedDayMonth(day: number, month: number): string {
  return `${pad2(day)}/${pad2(month)}`
}

describe("resolveDateToDayMonth — Preservation (Property 2)", () => {
  // ── أمثلة ملاحَظة (observation-first) على الكود الحالي ──────────────────────
  it("observed: YYYY-MM-DD → DD/MM (2026-07-05 → 05/07)", () => {
    expect(resolveDateToDayMonth("2026-07-05")).toBe("05/07")
  })

  it("observed: DD/MM يُمرَّر كما هو مع التصفير (05/07 → 05/07)", () => {
    expect(resolveDateToDayMonth("05/07")).toBe("05/07")
  })

  it("observed: DD/MM بدون تصفير يُصفَّر (5/7 → 05/07)", () => {
    expect(resolveDateToDayMonth("5/7")).toBe("05/07")
  })

  it("observed: DD-MM → DD/MM (5-7 → 05/07)", () => {
    expect(resolveDateToDayMonth("05-07")).toBe("05/07")
  })

  it("observed: بلا إدخال (undefined) → تاريخ اليوم بصيغة DD/MM", () => {
    const now = new Date()
    const today = expectedDayMonth(now.getDate(), now.getMonth() + 1)
    expect(resolveDateToDayMonth(undefined)).toBe(today)
  })

  // ── خاصية: أي تاريخ ميلادي صحيح بصيغة YYYY-MM-DD يُنتج DD/MM مصفّراً صحيحاً ──
  it("property: YYYY-MM-DD returns correct zero-padded DD/MM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        fc.integer({ min: 1000, max: 9999 }),
        (day, month, year) => {
          const input = `${year}-${pad2(month)}-${pad2(day)}`
          expect(resolveDateToDayMonth(input)).toBe(expectedDayMonth(day, month))
        }
      )
    )
  })

  // ── خاصية: صيغة DD/MM (مع/بدون تصفير) تُنتج DD/MM مصفّراً صحيحاً ─────────────
  it("property: DD/MM returns correct zero-padded DD/MM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        fc.boolean(),
        fc.boolean(),
        (day, month, padDay, padMonth) => {
          const d = padDay ? pad2(day) : String(day)
          const m = padMonth ? pad2(month) : String(month)
          const input = `${d}/${m}`
          expect(resolveDateToDayMonth(input)).toBe(expectedDayMonth(day, month))
        }
      )
    )
  })

  // ── خاصية: صيغة DD-MM (مع/بدون تصفير) تُنتج DD/MM مصفّراً صحيحاً ─────────────
  it("property: DD-MM returns correct zero-padded DD/MM", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 31 }),
        fc.integer({ min: 1, max: 12 }),
        fc.boolean(),
        fc.boolean(),
        (day, month, padDay, padMonth) => {
          const d = padDay ? pad2(day) : String(day)
          const m = padMonth ? pad2(month) : String(month)
          const input = `${d}-${m}`
          expect(resolveDateToDayMonth(input)).toBe(expectedDayMonth(day, month))
        }
      )
    )
  })
})
