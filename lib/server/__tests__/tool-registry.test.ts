/**
 * tool-registry.test.ts — اختبارات ترحيل أسماء الأدوات وسجلّ التوزيع.
 *
 * خلفية: الأسماء القديمة كانت تكذب على النموذج — `search_projects` تبحث في
 * الأخبار، و`filter_projects` تُرجع التصنيفات، و`get_project_by_id` يجلب خبراً.
 * أسماء مضلّلة ⇒ اختيار خاطئ للأداة، عُوّض عنه بتحذيرات مطوّلة في الموجّه.
 *
 * ما يحرسه هذا الملف:
 *  (1) لم يبقَ أي اسم مضلّل في القائمة البيضاء.
 *  (2) الأسماء القديمة ما تزال مقبولة وتُترجم للحالية (توافق خلفي).
 *  (3) لم يُعَد استعمال اسم قديم بدلالة جديدة (سلامة السجلّات التاريخية).
 *  (4) كل أداة مُعرَّفة لها اسم في القائمة البيضاء والعكس.
 */

import {
  ALL_SITE_TOOLS,
  ALLOWED_TOOL_NAMES,
  LEGACY_TOOL_ALIASES,
  canonicalToolName,
  isAllowedTool,
  getToolByName,
  type AllowedToolName,
} from "../site-tools-definitions"

describe("ترحيل الأسماء المضلّلة", () => {
  const MISLEADING = [
    "search_projects",      // كانت تبحث في الأخبار
    "get_project_by_id",    // كان يجلب خبراً
    "filter_projects",      // كانت تُرجع التصنيفات
    "get_latest_projects",  // كانت تُرجع أحدث الأخبار
    "get_statistics",       // غامضة
  ]

  it.each(MISLEADING)("لم يعد الاسم المضلّل %s ضمن القائمة البيضاء", (name) => {
    expect(ALLOWED_TOOL_NAMES).not.toContain(name as AllowedToolName)
  })

  it("الأسماء الجديدة موجودة", () => {
    for (const n of [
      "search_content",
      "get_content_by_id",
      "list_news_categories",
      "get_latest_news",
      "get_content_statistics",
    ]) {
      expect(ALLOWED_TOOL_NAMES).toContain(n as AllowedToolName)
    }
  })

  it("أداة بحث المشاريع الحقيقية بقيت باسمها (لا التباس)", () => {
    expect(ALLOWED_TOOL_NAMES).toContain("search_projects_db")
  })
})

describe("التوافق الخلفي مع الأسماء القديمة", () => {
  it.each(Object.entries(LEGACY_TOOL_ALIASES))(
    "%s يُترجم إلى %s",
    (oldName, newName) => {
      expect(canonicalToolName(oldName)).toBe(newName)
      // ما زال مقبولاً كي لا تُرفض استدعاءات النموذج من نمط محفوظ
      expect(isAllowedTool(oldName)).toBe(true)
    }
  )

  it("الاسم الحالي يمرّ كما هو", () => {
    expect(canonicalToolName("search_content")).toBe("search_content")
    expect(canonicalToolName("search_projects_db")).toBe("search_projects_db")
  })

  it("اسم غير معروف يُرفض", () => {
    expect(isAllowedTool("delete_everything")).toBe(false)
    expect(canonicalToolName("delete_everything")).toBe("delete_everything")
  })

  it("لا يُعاد استعمال اسم قديم بدلالة جديدة (سلامة السجلّات التاريخية)", () => {
    // لو صار اسم قديم اسماً حالياً لأداة أخرى، لاختلطت دلالة chat_logs.tool_called
    for (const oldName of Object.keys(LEGACY_TOOL_ALIASES)) {
      expect(ALLOWED_TOOL_NAMES).not.toContain(oldName as AllowedToolName)
    }
  })
})

describe("تماسك سجلّ الأدوات", () => {
  it("كل أداة مُعرَّفة اسمها في القائمة البيضاء", () => {
    for (const t of ALL_SITE_TOOLS) {
      expect(ALLOWED_TOOL_NAMES).toContain(t.function.name as AllowedToolName)
    }
  })

  it("كل اسم في القائمة البيضاء له تعريف أداة", () => {
    for (const name of ALLOWED_TOOL_NAMES) {
      expect(getToolByName(name)).toBeDefined()
    }
  })

  it("لا أسماء مكرّرة", () => {
    const names = ALL_SITE_TOOLS.map(t => t.function.name)
    expect(new Set(names).size).toBe(names.length)
  })

  it("لا يحمل أي وصف أداة اسماً مضلّلاً قديماً", () => {
    for (const t of ALL_SITE_TOOLS) {
      const desc = t.function.description || ""
      for (const oldName of Object.keys(LEGACY_TOOL_ALIASES)) {
        // نتفادى الإيجابية الكاذبة: search_projects_db يحوي search_projects كسلسلة فرعية
        const re = new RegExp(`\\b${oldName}\\b(?!_)`)
        expect(desc).not.toMatch(re)
      }
    }
  })
})

describe("الموجّه متّسق مع الأسماء الجديدة", () => {
  it("لا يذكر الموجّه أي اسم أداة قديم", () => {
    // استيراد كسول كي لا يُحمَّل الموجّه إلّا هنا
    const { getSiteSystemPrompt } = require("../system-prompts")
    const prompt: string = getSiteSystemPrompt()
    for (const oldName of Object.keys(LEGACY_TOOL_ALIASES)) {
      const re = new RegExp(`\\b${oldName}\\b(?!_)`)
      expect(prompt).not.toMatch(re)
    }
  })

  it("يحقن تاريخ اليوم ديناميكياً بدل سنة مثبّتة", () => {
    const { getSiteSystemPrompt } = require("../system-prompts")
    const prompt: string = getSiteSystemPrompt()
    expect(prompt).not.toContain("{{TODAY}}")
    expect(prompt).toContain("تاريخ اليوم:")
    expect(prompt).toContain(`السنة الحالية = ${new Date().getFullYear()}`)
  })
})
