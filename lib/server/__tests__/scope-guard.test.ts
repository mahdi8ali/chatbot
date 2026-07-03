/**
 * scope-guard.test.ts — تعميق تغطية الطبقة الحتمية (Task 4).
 *
 * اختبارات وحدة + خصائص لدالة `classifyScope` النقية الحتمية:
 *   A) كشف الأسئلة خارج النطاق (Property 1: Expected Behavior)
 *      - فئة hijri_conversion (اسم شهر هجري + سنة هجرية أو عبارة تحويل)
 *      - فئة occasion_timing (أداة استفهام زمنية + اسم مناسبة)
 *      - تغطية التطبيع (همزات/ألف/تشكيل/تطويل/أرقام عربية/ترقيم)
 *   B) حفظ الأسئلة داخل النطاق ومنع الإيجابيات الكاذبة (Property 2: Preservation)
 *      - تجاوز المحتوى (Req 3.5): محتوى مناسبة يبقى داخل النطاق
 *      - أسئلة عادية داخل النطاق + رسائل قصيرة/غامضة → داخل النطاق
 *
 * **Validates: Requirements 2.1, 2.3, 2.5, 3.5**
 */

import fc from "fast-check"
import { classifyScope } from "../scope-guard"

// ═══════════════════════════════════════════════════════════════════════════
// A) classifyScope — كشف الأسئلة خارج النطاق (Property 1)
// ═══════════════════════════════════════════════════════════════════════════

describe("classifyScope — OUT OF SCOPE: hijri_conversion (Property 1)", () => {
  const cases: string[] = [
    "متى موعد 10 محرم من سنة 1448 هجرية؟",
    "حوّل 1 رمضان 1445 إلى ميلادي",
    "شعبان 1447 كم يوافق بالميلادي",
    "1 ذو الحجة 1446 يصادف أي يوم بالميلادي؟",
    "متى 15 شعبان 1448 هـ",
  ]

  it.each(cases)("«%s» → inScope:false, category:hijri_conversion", (msg) => {
    const result = classifyScope(msg)
    expect(result.inScope).toBe(false)
    expect(result.category).toBe("hijri_conversion")
  })
})

describe("classifyScope — OUT OF SCOPE: occasion_timing (Property 1)", () => {
  const cases: string[] = [
    "متى زيارة الأربعين؟",
    "متى عاشوراء؟",
    "أي يوم عيد الغدير؟",
    "في أي يوم ليلة القدر؟",
    "ما تاريخ المولد؟",
  ]

  it.each(cases)("«%s» → inScope:false, category:occasion_timing", (msg) => {
    const result = classifyScope(msg)
    expect(result.inScope).toBe(false)
    expect(result.category).toBe("occasion_timing")
  })
})

describe("classifyScope — تغطية التطبيع (normalization)", () => {
  it("يوحّد الهمزة/الألف: «الأربعين» و«الاربعين» متكافئتان (occasion_timing)", () => {
    expect(classifyScope("متى الأربعين؟").category).toBe("occasion_timing")
    expect(classifyScope("متى الاربعين").category).toBe("occasion_timing")
  })

  it("يتجاهل التشكيل: «مَتى عاشُوراء» → occasion_timing", () => {
    const result = classifyScope("مَتى عاشُوراء؟")
    expect(result.inScope).toBe(false)
    expect(result.category).toBe("occasion_timing")
  })

  it("يوحّد الأرقام العربية-الهندية: «١٠ محرم ١٤٤٨ هـ» → hijri_conversion", () => {
    const result = classifyScope("متى موعد ١٠ محرم من سنة ١٤٤٨ هجرية؟")
    expect(result.inScope).toBe(false)
    expect(result.category).toBe("hijri_conversion")
  })

  it("يجرّد التطويل (tatweel): «الأربعيــن» → occasion_timing", () => {
    const result = classifyScope("متى الأربعيــن")
    expect(result.category).toBe("occasion_timing")
  })

  it("لا يتأثر بعلامة الاستفهام الأخيرة (مع/بدون ؟)", () => {
    expect(classifyScope("متى عاشوراء").category).toBe("occasion_timing")
    expect(classifyScope("متى عاشوراء؟").category).toBe("occasion_timing")
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// B) classifyScope — حفظ داخل النطاق ومنع الإيجابيات الكاذبة (Property 2 + Req 3.5)
// ═══════════════════════════════════════════════════════════════════════════

describe("classifyScope — IN SCOPE: تجاوز المحتوى (Req 3.5)", () => {
  const cases: string[] = [
    "ما أخبار خدمات العتبة في الأربعين؟",
    "فعاليات العتبة في عاشوراء",
    "مشاريع العتبة",
    "استعدادات العتبة لزيارة الأربعين",
    "أريد صور موكب عاشوراء",
  ]

  it.each(cases)("«%s» → inScope:true (المحتوى يتجاوز المناسبة)", (msg) => {
    const result = classifyScope(msg)
    expect(result.inScope).toBe(true)
    expect(result.category).toBeUndefined()
  })
})

describe("classifyScope — IN SCOPE: أسئلة عادية / قصيرة / غامضة", () => {
  const cases: string[] = [
    "أوقات الصلاة اليوم",
    "ما هي المشاريع الطبية؟",
    "رقم قسم الإمام المهدي",
    "أريد فيديو عن محرم",
    "مرحبا",
    "شكراً",
    "أين تقع العتبة العباسية؟",
  ]

  it.each(cases)("«%s» → inScope:true", (msg) => {
    const result = classifyScope(msg)
    expect(result.inScope).toBe(true)
    expect(result.category).toBeUndefined()
  })
})

describe("classifyScope — مدخلات حدّية", () => {
  it("النص الفارغ → inScope:true (محافظ)", () => {
    expect(classifyScope("").inScope).toBe(true)
  })

  it("المدخل غير النصّي → inScope:true (محافظ)", () => {
    // @ts-expect-error اختبار متانة الإدخال غير النصّي
    expect(classifyScope(undefined).inScope).toBe(true)
    // @ts-expect-error اختبار متانة الإدخال غير النصّي
    expect(classifyScope(null).inScope).toBe(true)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// خصائص PBT — منع الإيجابيات الكاذبة (Property 2)
// ═══════════════════════════════════════════════════════════════════════════

describe("classifyScope — property: false-positive avoidance (Property 2)", () => {
  // أسماء محتوى مفردة تُطابق كرمز مستقل بثقة
  const CONTENT_NOUNS = [
    "أخبار",
    "خدمات",
    "فعاليات",
    "برامج",
    "مشاريع",
    "موكب",
    "مواكب",
    "صور",
    "فيديو",
    "بث",
    "استعدادات",
    "تغطية",
  ]
  const OCCASIONS = [
    "الأربعين",
    "عاشوراء",
    "الغدير",
    "المولد",
    "ليلة القدر",
  ]

  it("سؤال محتوى (اسم محتوى + اسم مناسبة اختياري) → inScope:true دائماً", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...CONTENT_NOUNS),
        fc.option(fc.constantFrom(...OCCASIONS), { nil: undefined }),
        (noun, occasion) => {
          const msg = occasion
            ? `${noun} العتبة في ${occasion}`
            : `${noun} العتبة`
          const result = classifyScope(msg)
          expect(result.inScope).toBe(true)
          expect(result.category).toBeUndefined()
        }
      ),
      { numRuns: 300 }
    )
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// خصائص PBT — كشف الأسئلة خارج النطاق (Property 1)
// ═══════════════════════════════════════════════════════════════════════════

describe("classifyScope — property: out-of-scope detection (Property 1)", () => {
  const HIJRI_MONTHS = [
    "محرم",
    "صفر",
    "ربيع الأول",
    "ربيع الثاني",
    "رجب",
    "شعبان",
    "رمضان",
    "شوال",
    "ذو القعدة",
    "ذو الحجة",
  ]
  const CONVERSION_PHRASES = ["يوافق", "يصادف", "بالميلادي", "إلى ميلادي"]

  it("شهر هجري + سنة هجرية (\\d{3,4} هـ) → hijri_conversion", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HIJRI_MONTHS),
        fc.integer({ min: 100, max: 9999 }),
        fc.constantFrom("هـ", "هجرية", "هجري"),
        (month, year, marker) => {
          const msg = `${month} ${year} ${marker}`
          const result = classifyScope(msg)
          expect(result.inScope).toBe(false)
          expect(result.category).toBe("hijri_conversion")
        }
      ),
      { numRuns: 300 }
    )
  })

  it("شهر هجري + عبارة تحويل (بلا اسم محتوى) → hijri_conversion", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...HIJRI_MONTHS),
        fc.constantFrom(...CONVERSION_PHRASES),
        (month, phrase) => {
          const msg = `${month} كم ${phrase}؟`
          const result = classifyScope(msg)
          expect(result.inScope).toBe(false)
          expect(result.category).toBe("hijri_conversion")
        }
      ),
      { numRuns: 200 }
    )
  })

  // أدوات استفهام زمنية + مناسبة (بلا اسم محتوى) → occasion_timing
  const TIME_INTERROGATIVES = ["متى", "أي يوم", "في أي يوم", "ما تاريخ"]
  const OCCASIONS_NO_MONTH = [
    "الأربعين",
    "عاشوراء",
    "الغدير",
    "عيد الغدير",
    "المولد",
    "ليلة القدر",
    "عرفة",
    "عيد الفطر",
    "عيد الأضحى",
  ]

  it("أداة استفهام زمنية + اسم مناسبة (بلا محتوى) → occasion_timing", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...TIME_INTERROGATIVES),
        fc.constantFrom(...OCCASIONS_NO_MONTH),
        (interrogative, occasion) => {
          const msg = `${interrogative} ${occasion}؟`
          const result = classifyScope(msg)
          expect(result.inScope).toBe(false)
          expect(result.category).toBe("occasion_timing")
        }
      ),
      { numRuns: 300 }
    )
  })
})
