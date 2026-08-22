/**
 * project-sections.test.ts — اختبارات getProjectSections() (أصناف المشاريع الرئيسية).
 *
 * ⚠️ فحص حيّ حقيقي أوّل: سأل المالك "ما هي أصناف المشاريع في العتبة العباسية"،
 * فأجاب البوت بتصنيفات **الأخبار** (list_news_categories) لعدم وجود أداة
 * أصلاً لسرد أصناف المشاريع — رغم وجود جدول `sections` حقيقي يُستعمَل
 * داخلياً فقط لفلترة searchProjectsDB، بلا أي أداة تعرضه مباشرة. تحقّقت
 * حيّاً: `sections` هرمي (`parent_section_id`)، و7 أصناف رئيسية فقط
 * (parent_section_id IS NULL) تطابق تماماً ما توقّعه المالك: الثقافية،
 * التعليمية، الصحن ومقترباته، الطبية، التنموية، خدمات عامة، تشكيلات إدارية.
 *
 * ⚠️ فحص حيّ ثانٍ (بعد أول تنفيذ ساذج بعدّ id الرئيسي مباشرة فقط): 316 من
 * 358 مشروعاً `section_id=0` فعلياً (عمود مباشر غير مُعتمَد)، والربط
 * الحقيقي عبر `project_section` يشير غالباً لأصناف **فرعية** (مثل "الأقسام"
 * تحت "تشكيلات إدارية") لا للصنف الرئيسي مباشرة — عدّ id الرئيسي وحده أعاد
 * أصفاراً كاذبة لخمسة من سبعة أصناف. الإصلاح: إغلاق شجرة كامل (الصنف نفسه +
 * كل ذرّياته) محسوب في JS، مع عدّ مشاريع فريدة (Set) لا مجموعاً بسيطاً.
 *
 * ⚠️ فحص حيّ ثالث (قارنه المالك بالرقم المعروض فعلياً على الموقع — 155
 * للمشاريع الثقافية): بفلتر `deleted_at IS NULL` كان العدّ 141، وبإزالته
 * صار 156 (فرق 1 عن رقم الموقع، متوقَّع بفارق توقيت لا خطأ منطقي). الخلاصة:
 * عدّاد الموقع نفسه **لا يُقصي المشاريع المحذوفة ناعماً** — فأُزيل الفلتر
 * هنا لمطابقة الرقم الحقيقي المعروض أمام الزائر، لا "الأنظف" منطقياً.
 */

// ⚠️ getProjectsPool() مُعرَّفة **داخل** projects-db-service.ts نفسها (تستدعي
// mysql.createPool مباشرة)، لا في وحدة db.ts منفصلة كبقية الخدمات — فمحاكاة
// الوحدة ذاتها بـjest.mock("../projects-db-service") لا تُعيد كتابة الاستدعاء
// الداخلي لـgetProjectsPool() من داخل getProjectSections() (كلاهما في نفس
// الملف، لا يمرّان عبر جدول تصدير الوحدة). المحاكاة الصحيحة: mysql2/promise
// نفسها، حيث createPool هو الاستدعاء الفعلي الوحيد الذي يصل لقاعدة حقيقية.
const mockExecute = jest.fn()

jest.mock("mysql2/promise", () => ({
  __esModule: true,
  default: { createPool: () => ({ execute: mockExecute }) },
}))

import { getProjectSections } from "../projects-db-service"

/** يُحاكي النداءين بالترتيب: (1) كل الأصناف، (2) كل روابط (صنف، مشروع). */
function mockSectionsAndLinks(sections: any[], links: { sid: number; pid: number }[]) {
  mockExecute.mockResolvedValueOnce([sections])
  mockExecute.mockResolvedValueOnce([links])
}

beforeEach(() => {
  mockExecute.mockReset()
})

describe("getProjectSections — الأصناف الرئيسية فقط", () => {
  it("يعيد parent_section_id IS NULL فقط، مرتَّبة بعمود order ثم id", async () => {
    mockSectionsAndLinks(
      [
        { id: 9, name: "المجلات الثقافية", parent_section_id: 6, order: null },
        { id: 7, name: "المشاريع التعليمية", parent_section_id: null, order: 2 },
        { id: 6, name: "المشاريع الثقافية", parent_section_id: null, order: 1 },
      ],
      []
    )
    const r = await getProjectSections()
    const sections = (r.data as any).sections
    expect(sections.map((s: any) => s.id)).toEqual([6, 7]) // 9 مستبعَد (صنف فرعي)، 6 قبل 7 (order)
  })

  it("بلا فلتر deleted_at في استعلام الروابط — يطابق عدّاد الموقع الحقيقي (155 لا 141)", async () => {
    mockSectionsAndLinks([], [])
    await getProjectSections()
    const [linksSql] = mockExecute.mock.calls[1]
    expect(linksSql).not.toContain("deleted_at")
  })

  it("نداءان فقط، بلا أي معامل `?` (لا مُدخل مستخدم إطلاقاً)", async () => {
    mockSectionsAndLinks([], [])
    await getProjectSections()
    expect(mockExecute).toHaveBeenCalledTimes(2)
    for (const [sql, params] of mockExecute.mock.calls) {
      expect(sql).not.toContain("?")
      expect(params).toBeUndefined()
    }
  })
})

describe("getProjectSections — العدّ عبر شجرة الأصناف الفرعية كاملة (الإصلاح الحاسم)", () => {
  it("مشروع مرتبط بصنف فرعي يُحتسَب ضمن عدّ الصنف الرئيسي (الجدّ)، لا صفراً", async () => {
    // ⚠️ هذا بالضبط ما كان يفشل قبل الإصلاح: عدّ id=6 وحده (بلا الذرّية)
    // كان يُعيد صفراً رغم وجود مشاريع فعلية تحت "المجلات الثقافية" (id=9).
    mockSectionsAndLinks(
      [
        { id: 6, name: "المشاريع الثقافية", parent_section_id: null, order: 1 },
        { id: 9, name: "المجلات الثقافية", parent_section_id: 6, order: null },
      ],
      [{ sid: 9, pid: 100 }, { sid: 9, pid: 101 }]
    )
    const r = await getProjectSections()
    const cultural = (r.data as any).sections.find((s: any) => s.id === 6)
    expect(cultural.count).toBe(2)
  })

  it("تداخل عميق (حفيد لا ابن مباشر) يُحتسَب أيضاً ضمن الجدّ الأعلى", async () => {
    // 34 "قسم الشؤون القانونية" ← 28 "الأقسام" ← 31 "تشكيلات إدارية" (3 مستويات، حالة حقيقية)
    mockSectionsAndLinks(
      [
        { id: 31, name: "تشكيلات إدارية", parent_section_id: null, order: 6 },
        { id: 28, name: "الأقسام", parent_section_id: 31, order: null },
        { id: 34, name: "قسم الشؤون القانونية", parent_section_id: 28, order: null },
      ],
      [{ sid: 34, pid: 500 }]
    )
    const r = await getProjectSections()
    const admin = (r.data as any).sections.find((s: any) => s.id === 31)
    expect(admin.count).toBe(1)
  })

  it("مشروعان تحت صنفَين فرعيَّين مختلفين لنفس الجدّ ⇒ يُعدّان مرّة واحدة لكلٍّ (Set لا مجموع)", async () => {
    mockSectionsAndLinks(
      [
        { id: 6, name: "المشاريع الثقافية", parent_section_id: null, order: 1 },
        { id: 9, name: "المجلات الثقافية", parent_section_id: 6, order: null },
        { id: 14, name: "مراكز ومؤسسات", parent_section_id: 6, order: null },
      ],
      [{ sid: 9, pid: 100 }, { sid: 14, pid: 100 }, { sid: 14, pid: 101 }]
    )
    const r = await getProjectSections()
    const cultural = (r.data as any).sections.find((s: any) => s.id === 6)
    expect(cultural.count).toBe(2) // مشروع 100 مرّة واحدة رغم ظهوره تحت صنفين فرعيَّين
  })

  it("صنف رئيسي بلا أي مشروع مرتبط (لا مباشرة ولا عبر ذرّية) ⇒ count: 0 لا خطأ", async () => {
    mockSectionsAndLinks(
      [{ id: 12, name: "مشاريع الصحن ومقترباته", parent_section_id: null, order: 3 }],
      []
    )
    const r = await getProjectSections()
    expect((r.data as any).sections[0].count).toBe(0)
  })

  it("مشروع مرتبط مباشرة بصنف رئيسي (بلا صنف فرعي وسيط) لا يزال يُحتسَب", async () => {
    mockSectionsAndLinks(
      [{ id: 1, name: "المشاريع الطبية", parent_section_id: null, order: 4 }],
      [{ sid: 1, pid: 900 }]
    )
    const r = await getProjectSections()
    expect((r.data as any).sections[0].count).toBe(1)
  })
})

describe("getProjectSections — أخطاء وحالات حدّية", () => {
  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await getProjectSections()
    expect(r.success).toBe(false)
  })

  it("رابط بصنف غير موجود في جدول sections (بيانات يتيمة) لا يُسقِط الدالة", async () => {
    mockSectionsAndLinks(
      [{ id: 6, name: "المشاريع الثقافية", parent_section_id: null, order: 1 }],
      [{ sid: 9999, pid: 1 }] // صنف 9999 غير موجود إطلاقاً في نتيجة الأصناف
    )
    const r = await getProjectSections()
    expect(r.success).toBe(true)
    expect((r.data as any).sections[0].count).toBe(0)
  })
})
