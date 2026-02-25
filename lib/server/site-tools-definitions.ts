/**
 * تعريف الأدوات (Tools) للـ Function Calling
 * 
 * هذه الأدوات تُستخدم من قبل OpenAI لاختيار الـ endpoint المناسب
 * جميع الأدوات مرتبطة بـ REST API الخاص بموقع projects.alkafeel.net
 */

import { ChatCompletionTool } from "openai/resources/chat/completions"

/**
 * أداة البحث في المشاريع
 * 
 * الاستخدام: عندما يطلب المستخدم البحث عن مشاريع أو فلترتها
 */
export const TOOL_SEARCH_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_projects",
    description: `البحث العميق في مشاريع موقع projects.alkafeel.net.
يبحث في كل محتوى المشروع: الاسم، الوصف، المكان، المواصفات، الجهة المنفذة، تاريخ الافتتاح، العلامات، والعنوان.
النتائج مرتبة حسب درجة التطابق (الأفضل أولاً).

استخدم هذه الأداة عندما يطلب المستخدم:
- البحث عن مشاريع معينة
- فلترة المشاريع حسب فئة أو كلمة مفتاحية
- الاستعلام عن مشاريع بمواصفات محددة
- البحث في تفاصيل المشاريع (المكان، الجهة المنفذة، المواصفات)

أمثلة:
- "ابحث عن مشاريع التعليم"
- "أريد مشاريع في باب الخان"
- "ما هي المشاريع الصحية؟"
- "مشاريع العتبة العباسية"`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            "كلمة البحث بالعربية. مثال: 'طبية', 'تعليمية', 'إنشائية', 'قرآنية'"
        },
        section: {
          type: "string",
          description:
            "اسم القسم بالعربية للتصفية (اختياري). يجب أن يكون من الأقسام الموجودة فعلاً.",
          enum: [
            "المشاريع الطبية",
            "المشاريع التعليمية",
            "المشاريع الإنشائية",
            "المشاريع القرآنية",
            "المشاريع التقنية",
            "المشاريع الإعلامية",
            "المشاريع الإنتاجية",
            "المشاريع الزراعية والحيوانية",
            "مشاريع التوسعة والصيانة",
            "مشاريع الخدمة العامة",
            "مشاريع اجتماعية",
            "مشاريع نسوية",
            "مراكز ومؤسسات",
            "الأقسام",
            "المجلات الثقافية",
            "المجلات المحكمة",
            "الشركات",
            "المهرجانات",
            "صناعة شبابيك الأضرحة",
            "الإغاثة والدعم اللوجستي",
            "المكاتب",
            "الهيئات",
            "المسابقات و البرامج",
            "الزيارات المليونية"
          ]
        },
        limit: {
          type: "number",
          description: "عدد النتائج المطلوبة (افتراضي: 10، أقصى: 50)",
          minimum: 1,
          maximum: 50
        }
      },
      required: ["query"]
    }
  }
}

/**
 * أداة الحصول على تفاصيل مشروع محدد
 * 
 * الاستخدام: عندما يطلب المستخدم معلومات عن مشروع برقم أو اسم محدد
 */
export const TOOL_GET_PROJECT_BY_ID: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_project_by_id",
    description: `الحصول على تفاصيل كاملة عن مشروع محدد من الموقع.
استخدم هذه الأداة عندما:
- يذكر المستخدم رقم مشروع معين
- يطلب تفاصيل مشروع محدد بالاسم
- يريد معلومات شاملة عن مشروع واحد

أمثلة:
- "أخبرني عن المشروع رقم 123"
- "ما هي تفاصيل مشروع مستشفى العتبة العباسية؟"
- "معلومات عن مشروع ID 456"`,
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description:
            "معرف المشروع (ID) أو اسم المشروع. يجب أن يكون محدداً وواضحاً."
        }
      },
      required: ["id"]
    }
  }
}

/**
 * أداة الحصول على قائمة الفئات المتاحة
 * 
 * الاستخدام: عندما يسأل المستخدم عن أنواع المشاريع المتوفرة
 */
export const TOOL_FILTER_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "filter_projects",
    description: `الحصول على قائمة الفئات والتصنيفات المتاحة للمشاريع في الموقع.
استخدم هذه الأداة عندما:
- يسأل المستخدم "ما هي أنواع المشاريع؟"
- يريد معرفة التصنيفات المتاحة
- يحتاج قائمة الفئات للاختيار منها

أمثلة:
- "ما هي فئات المشاريع المتوفرة؟"
- "أريد معرفة أنواع المشاريع"
- "ما هي التصنيفات الموجودة؟"`,
    parameters: {
      type: "object",
      properties: {
        include_counts: {
          type: "boolean",
          description:
            "إذا كان true، يتم إرجاع عدد المشاريع في كل فئة (افتراضي: false)"
        }
      },
      required: []
    }
  }
}

/**
 * أداة الحصول على أحدث المشاريع
 * 
 * الاستخدام: عندما يطلب المستخدم آخر المشاريع أو الأحدث
 */
export const TOOL_GET_LATEST_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_latest_projects",
    description: `الحصول على أحدث المشاريع المضافة أو المحدثة في الموقع.
استخدم هذه الأداة عندما:
- يطلب المستخدم "آخر المشاريع"
- يريد "أحدث المشاريع"
- يسأل عن "المشاريع الجديدة"

أمثلة:
- "ما هي آخر المشاريع المضافة؟"
- "أريد أحدث 5 مشاريع"
- "أعطني المشاريع الجديدة"`,
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "عدد المشاريع المطلوبة (افتراضي: 10، أقصى: 50)",
          minimum: 1,
          maximum: 50
        },
        section: {
          type: "string",
          description:
            "اسم القسم بالعربية للتصفية (اختياري)",
          enum: [
            "المشاريع الطبية",
            "المشاريع التعليمية",
            "المشاريع الإنشائية",
            "المشاريع القرآنية",
            "المشاريع التقنية",
            "المشاريع الإعلامية",
            "المشاريع الإنتاجية",
            "المشاريع الزراعية والحيوانية",
            "مشاريع التوسعة والصيانة",
            "مشاريع الخدمة العامة",
            "مشاريع اجتماعية",
            "مشاريع نسوية",
            "مراكز ومؤسسات",
            "الأقسام",
            "المجلات الثقافية",
            "المجلات المحكمة",
            "الشركات",
            "المهرجانات",
            "صناعة شبابيك الأضرحة",
            "الإغاثة والدعم اللوجستي",
            "المكاتب",
            "الهيئات",
            "المسابقات و البرامج",
            "الزيارات المليونية"
          ]
        }
      },
      required: []
    }
  }
}

/**
 * أداة الحصول على إحصائيات المشاريع
 * 
 * الاستخدام: عندما يسأل المستخدم عن الإحصائيات أو الأرقام
 */
export const TOOL_GET_STATISTICS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_statistics",
    description: `الحصول على إحصائيات عامة عن المشاريع في الموقع.
استخدم هذه الأداة عندما:
- يسأل المستخدم "كم عدد المشاريع؟"
- يريد معلومات عامة عن المشاريع
- يطلب إحصائيات أو أرقام

أمثلة:
- "كم مشروع لديكم؟"
- "أعطني إحصائيات عن المشاريع"
- "ما هي الأقسام الأكثر مشاريع؟"`,
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
}

/**
 * قائمة جميع الأدوات المتاحة
 */
export const ALL_SITE_TOOLS: ChatCompletionTool[] = [
  TOOL_SEARCH_PROJECTS,
  TOOL_GET_PROJECT_BY_ID,
  TOOL_FILTER_PROJECTS,
  TOOL_GET_LATEST_PROJECTS,
  TOOL_GET_STATISTICS
]

/**
 * Whitelist: أسماء الأدوات المسموحة فقط
 */
export const ALLOWED_TOOL_NAMES = [
  "search_projects",
  "get_project_by_id",
  "filter_projects",
  "get_latest_projects",
  "get_statistics"
] as const

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number]

/**
 * التحقق من أن اسم الأداة مسموح
 */
export function isAllowedTool(toolName: string): toolName is AllowedToolName {
  return ALLOWED_TOOL_NAMES.includes(toolName as AllowedToolName)
}

/**
 * الحصول على أداة محددة بالاسم
 */
export function getToolByName(
  toolName: AllowedToolName
): ChatCompletionTool | undefined {
  return ALL_SITE_TOOLS.find(tool => tool.function.name === toolName)
}
