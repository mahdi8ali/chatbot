/**
 * تعريف الأدوات (Tools) للـ Function Calling
 * 
 * هذه الأدوات تُستخدم من قبل OpenAI لاختيار الـ endpoint المناسب
 * جميع الأدوات مرتبطة بقاعدة بيانات أخبار شبكة الكفيل
 */

import { ChatCompletionTool } from "openai/resources/chat/completions"

/**
 * أداة البحث في الأخبار
 * 
 * الاستخدام: عندما يطلب المستخدم البحث عن أخبار أو فلترتها
 */
export const TOOL_SEARCH_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_projects",
    description: "بحث في قاعدة بيانات شبكة الكفيل الشاملة: الأخبار، سيرة أبي الفضل العباس (ع)، التاريخ، ومكتبة الفيديو. النتائج مرتبة بالتطابق ومصنّفة بحقل source_label.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "كلمة البحث بالعربية"
        },
        section: {
          type: "string",
          description: "اسم القسم للتصفية (اختياري)"
        },
        source: {
          type: "string",
          description: "تحديد المصدر: news (أخبار) | sira (سيرة العباس) | history (التاريخ) | video (الفيديو). إذا لم يُحدد يبحث في الكل.",
          enum: ["news", "sira", "history", "video"]
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي: 2، أقصى: 20)",
          minimum: 1,
          maximum: 20
        }
      },
      required: ["query"]
    }
  }
}

/**
 * أداة الحصول على تفاصيل خبر محدد
 * 
 * الاستخدام: عندما يطلب المستخدم معلومات عن خبر برقم محدد
 */
export const TOOL_GET_PROJECT_BY_ID: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_project_by_id",
    description: "تفاصيل كاملة عن خبر محدد بالـ ID.",
    parameters: {
      type: "object",
      properties: {
        id: {
          type: "string",
          description: "معرف المشروع (ID)"
        }
      },
      required: ["id"]
    }
  }
}

/**
 * أداة الحصول على قائمة التصنيفات المتاحة
 * 
 * الاستخدام: عندما يسأل المستخدم عن أنواع/تصنيفات الأخبار المتوفرة
 */
export const TOOL_FILTER_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "filter_projects",
    description: "قائمة التصنيفات المتاحة مع عدد الأخبار.",
    parameters: {
      type: "object",
      properties: {
        include_counts: {
          type: "boolean",
          description: "تضمين عدد المشاريع في كل فئة"
        }
      },
      required: []
    }
  }
}

/**
 * أداة الحصول على أحدث الأخبار
 * 
 * الاستخدام: عندما يطلب المستخدم آخر الأخبار أو الأحدث
 */
export const TOOL_GET_LATEST_PROJECTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_latest_projects",
    description: "أحدث الأخبار المنشورة في شبكة الكفيل.",
    parameters: {
      type: "object",
      properties: {
        limit: {
          type: "number",
          description: "عدد المشاريع (افتراضي: 2، أقصى: 20)",
          minimum: 1,
          maximum: 20
        },
        section: {
          type: "string",
          description: "اسم القسم للتصفية (اختياري)"
        }
      },
      required: []
    }
  }
}

/**
 * أداة الحصول على إحصائيات الأخبار
 * 
 * الاستخدام: عندما يسأل المستخدم عن الإحصائيات أو الأرقام
 */
export const TOOL_GET_STATISTICS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_statistics",
    description: "إحصائيات عامة: عدد الأخبار، التصنيفات الأكثر محتوى.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
}

/**
 * أداة البحث في معلومات الاتصال والأقسام
 */
export const TOOL_SEARCH_CONTACTS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_contacts",
    description: "البحث في معلومات الاتصال بأقسام العتبة العباسية: أرقام الهاتف، الإيميلات، العناوين. استخدم هذه الأداة عندما يسأل المستخدم عن كيفية التواصل مع جهة أو قسم معين.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "اسم القسم أو الجهة للبحث عنها (مثال: الأمانة العامة، متحف الكفيل، دار الكفيل)"
        }
      },
      required: []
    }
  }
}

/**
 * أداة البحث في قاعدة بيانات المشاريع المنفصلة (alkafeel_projects)
 */
export const TOOL_SEARCH_PROJECTS_DB: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_projects_db",
    description: "بحث في قاعدة بيانات مشاريع العتبة العباسية المنفصلة (358 مشروع). استخدمها عندما يسأل المستخدم عن مشروع محدد أو قطاع معين مثل: طبي، تعليمي، زراعي، إنشائي، ثقافي... ترجع قائمة مشاريع مع ملخص ورقم ID لكل مشروع.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "كلمات البحث بالعربية — اسم المشروع أو موضوعه"
        },
        section: {
          type: "string",
          description: "اسم قطاع المشاريع للتصفية (اختياري) — مثال: طبية، تعليمية، زراعية، إنشائية، ثقافية"
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي: 8، أقصى: 20)",
          minimum: 1,
          maximum: 20
        }
      },
      required: ["query"]
    }
  }
}

/**
 * أداة جلب تفاصيل مشروع واحد من قاعدة المشاريع
 */
export const TOOL_GET_PROJECT_DETAILS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_project_details",
    description: "جلب التفاصيل الكاملة لمشروع واحد من قاعدة بيانات المشاريع باستخدام الـ ID. استخدمها عندما يريد المستخدم معرفة تفاصيل أعمق عن مشروع محدد بعد نتائج search_projects_db.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "number",
          description: "رقم المشروع (ID) الذي ترجعه أداة search_projects_db"
        }
      },
      required: ["project_id"]
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
  TOOL_GET_STATISTICS,
  TOOL_SEARCH_CONTACTS,
  TOOL_SEARCH_PROJECTS_DB,
  TOOL_GET_PROJECT_DETAILS
]

/**
 * Whitelist: أسماء الأدوات المسموحة فقط
 */
export const ALLOWED_TOOL_NAMES = [
  "search_projects",
  "get_project_by_id",
  "filter_projects",
  "get_latest_projects",
  "get_statistics",
  "search_contacts",
  "search_projects_db",
  "get_project_details"
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
