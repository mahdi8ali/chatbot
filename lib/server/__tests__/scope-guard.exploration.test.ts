/**
 * Bug-condition exploration test (Task 1) — out-of-scope-guardrails spec.
 *
 * منهجية شرط الخلل: هذا الاختبار يُرمّز "السلوك المتوقع" (Property 1: Expected Behavior)
 * ويجب أن يفشل على الكود غير المُصلَح لأن وحدة `@/lib/server/scope-guard` (والدالة
 * `classifyScope`) غير موجودة بعد. فشله يؤكد أن طبقة تصنيف النطاق الحتمية غائبة
 * (السبب الجذري 4)، وأن الأسئلة خارج النطاق تمرّ دون اعتذار.
 *
 * سيصبح هذا الاختبار نفسه مُتحقِّق الإصلاح لاحقاً (Task 3.7) عند إنشاء الوحدة.
 *
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 2.5, 2.6**
 */

// ملاحظة: الاستيراد الثابت مقصود — على الكود غير المُصلَح ستفشل عملية حلّ الوحدة،
// وهذا هو الفشل المتوقع الذي يُثبت وجود الخلل.
import { classifyScope } from '@/lib/server/scope-guard';

describe('classifyScope — bug condition (out-of-scope) exploration', () => {
  // Property 1: Bug Condition — تحويل هجري↔ميلادي خارج النطاق
  it('تصنّف سؤال تحويل التاريخ الهجري كخارج النطاق (hijri_conversion)', () => {
    const result = classifyScope('متى موعد 10 محرم من سنة 1448 هجرية؟');
    expect(result).toEqual(
      expect.objectContaining({ inScope: false, category: 'hijri_conversion' }),
    );
  });

  // Property 1: Bug Condition — توقيت مناسبة دينية خارج النطاق
  it('تصنّف سؤال توقيت المناسبة الدينية كخارج النطاق (occasion_timing)', () => {
    const result = classifyScope('متى زيارة الأربعين؟');
    expect(result).toEqual(
      expect.objectContaining({ inScope: false, category: 'occasion_timing' }),
    );
  });
});
