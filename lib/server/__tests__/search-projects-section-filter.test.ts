/**
 * search-projects-section-filter.test.ts — يحرس فلتر section في
 * searchProjectsDB() تحديداً (لا الدالة كاملة — نطاق ضيّق يطابق الإصلاح).
 *
 * ⚠️ فحص حيّ حقيقي: طلب المالك مقارنة "أرني مشاريع ثقافية" بعد أن أصلحنا
 * عدّها (156 عبر get_project_sections)، فوجدنا أن التصفّح الفعلي عبر
 * searchProjectsDB({section:"ثقافي"}) لا يزال يعيد 30 فقط — فلتر section
 * كان يطابق اسم الصنف حرفياً فقط (صنفان من 9 في شجرة "الثقافية" الحقيقية؛
 * "مراكز ومؤسسات"، "مؤتمرات"، "المشاريع القرآنية"... لا تحوي كلمة "ثقافي"
 * إطلاقاً رغم كونها ذرّية حقيقية لنفس الشجرة). الإصلاح: expandWithDescendants
 * — نفس منطق getProjectSections() (§11.19/§11.20) مطبَّقاً هنا على البحث.
 *
 * ⚠️ ملاحظة اختبار: getSections() داخل الوحدة نفسها تُخزَّن مؤقّتاً (كاش
 * وحدة 15 دقيقة) — تُعاد تهيئة الوحدة عبر jest.resetModules() قبل كل
 * اختبار كي لا يُسرّب كاش اختبار سابق إلى التالي.
 */

const mockExecute = jest.fn()

jest.mock("mysql2/promise", () => ({
  __esModule: true,
  default: { createPool: () => ({ execute: mockExecute }) },
}))

beforeEach(() => {
  jest.resetModules()
  mockExecute.mockReset()
})

describe("searchProjectsDB — فلتر section يُوسَّع لكامل الشجرة الفرعية", () => {
  it("يطابق صنفاً باسمه ثم يضمّ IN كل ذرّيته (لا id المطابق وحده)", async () => {
    const { searchProjectsDB } = require("../projects-db-service")
    // شجرة مصغّرة: 6 "المشاريع الثقافية" (تطابق "ثقافي")، 9 ابن مباشر
    // (يطابق أيضاً "ثقافي" بالصدفة)، 14 ابن مباشر آخر لا يحوي الكلمة إطلاقاً
    // ("مراكز ومؤسسات") يجب أن يُضمّ رغم ذلك عبر التوسيع.
    mockExecute.mockResolvedValueOnce([[
      { id: 6, name: "المشاريع الثقافية", parent_section_id: null },
      { id: 9, name: "المجلات الثقافية", parent_section_id: 6 },
      { id: 14, name: "مراكز ومؤسسات", parent_section_id: 6 },
    ]]) // getSections()
    mockExecute.mockResolvedValueOnce([[]]) // الاستعلام الرئيسي

    await searchProjectsDB({ query: "", section: "ثقافي" })

    const [sql, params] = mockExecute.mock.calls[1]
    const sectionParamsOnly = params.filter((p: any) => typeof p === "number")
    expect(sectionParamsOnly).toEqual(expect.arrayContaining([6, 9, 14]))
    expect(sql).toContain("p.section_id IN")
    expect(sql).toContain("ps.section_id IN")
  })

  it("صنف بلا أي ذرّية ⇒ يبقى IN بمعرّفه وحده (لا انتكاس للحالة البسيطة)", async () => {
    const { searchProjectsDB } = require("../projects-db-service")
    mockExecute.mockResolvedValueOnce([[
      { id: 1, name: "المشاريع الطبية", parent_section_id: null },
    ]])
    mockExecute.mockResolvedValueOnce([[]])

    await searchProjectsDB({ query: "", section: "طبية" })
    const [, params] = mockExecute.mock.calls[1]
    const sectionParamsOnly = params.filter((p: any) => typeof p === "number")
    expect(sectionParamsOnly).toEqual([1, 1]) // مرّة لـp.section_id ومرّة لـps.section_id
  })

  it("لا صنف مطابق للاسم ⇒ بلا شرط قسم إطلاقاً (لا IN فارغة تُسقِط كل شيء)", async () => {
    const { searchProjectsDB } = require("../projects-db-service")
    mockExecute.mockResolvedValueOnce([[
      { id: 1, name: "المشاريع الطبية", parent_section_id: null },
    ]])
    mockExecute.mockResolvedValueOnce([[]])

    await searchProjectsDB({ query: "", section: "اسم غير موجود إطلاقاً" })
    const [sql] = mockExecute.mock.calls[1]
    expect(sql).not.toContain("section_id IN")
  })

  it("بلا section إطلاقاً ⇒ بلا شرط قسم في نصّ SQL", async () => {
    const { searchProjectsDB } = require("../projects-db-service")
    mockExecute.mockResolvedValueOnce([[]]) // getSections()
    mockExecute.mockResolvedValueOnce([[]]) // الاستعلام الرئيسي
    await searchProjectsDB({ query: "مستشفى" })
    const [sql] = mockExecute.mock.calls[1]
    expect(sql).not.toContain("section_id IN")
  })
})
