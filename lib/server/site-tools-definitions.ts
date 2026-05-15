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
    description: "بحث في قاعدة بيانات شبكة الكفيل: الأخبار، سيرة أبي الفضل العباس (ع)، التاريخ، ومكتبة الفيديو. استخدم هذه الأداة لأي سؤال عن محتوى الموقع، بما في ذلك: أسماء المسؤولين والمناصب الإدارية (رئيس قسم، مدير، أمين عام)، الفعاليات، الإنجازات، والأخبار بشكل عام. النتائج مصنّفة بحقل source_label.",
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
    description: "أرقام الهاتف والإيميلات والعناوين لأقسام العتبة العباسية فقط. لا تحتوي على أسماء الأشخاص أو المسؤولين. استخدم هذه الأداة ONLY عندما يطلب المستخدم صراحةً رقم هاتف أو إيميل أو عنوان، أو يقول 'كيف أتصل' أو 'أريد التواصل'. لا تستخدمها للإجابة على 'من هو' أو 'ما اسم' أي شخص.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "اسم القسم أو الجهة للبحث عنها (مثال: قسم الإمام المهدي، الأمانة العامة، مستشفى الكفيل، جامعة الكفيل)"
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
 * أداة جلب صورة مشروع — تُستخدم فقط عند طلب المستخدم الصريح للصور
 */
export const TOOL_GET_PROJECT_IMAGE: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_project_image",
    description: "جلب صورة مشروع معين من قاعدة بيانات المشاريع. استخدم هذه الأداة فقط عندما يطلب المستخدم صراحةً رؤية صورة المشروع أو صوره.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "number",
          description: "رقم المشروع (ID) الذي تريد صورته"
        }
      },
      required: ["project_id"]
    }
  }
}

/**
 * أداة الحصول على أقسام مكتبة الفيديو
 */
export const TOOL_GET_VIDEO_SECTIONS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_video_sections",
    description: "قائمة جميع أقسام مكتبة الفيديو في شبكة الكفيل (43 قسماً). استخدم هذه الأداة عندما يسأل المستخدم عن: أقسام الفيديو، ما هي تصنيفات الفيديو، ماذا يوجد في مكتبة الفيديو، أو يريد تصفح محتوى الفيديو.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
}

/**
 * أداة جلب الصور المرفقة لمشروع معين (project_images)
 */
export const TOOL_GET_PROJECT_IMAGES: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_project_images",
    description: "جلب جميع الصور المرفقة (المعرض) لمشروع معين. استخدم هذه الأداة فقط عندما يطلب المستخدم صراحةً رؤية المزيد من صور المشروع أو الصور المرفقة أو معرض الصور.",
    parameters: {
      type: "object",
      properties: {
        project_id: {
          type: "number",
          description: "رقم المشروع (ID) المطلوب صوره المرفقة"
        }
      },
      required: ["project_id"]
    }
  }
}

/**
 * أداة جلب الصور المرفقة لخبر معين
 */
export const TOOL_GET_NEWS_IMAGES: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_news_images",
    description: "جلب جميع الصور المرفقة لخبر معين من قاعدة البيانات. استخدم هذه الأداة عندما يطلب المستخدم رؤية المزيد من صور خبر تم عرضه، أو الصور المرفقة بمقال.",
    parameters: {
      type: "object",
      properties: {
        news_id: {
          type: "number",
          description: "رقم الخبر (ID) المطلوب جلب صوره المرفقة"
        }
      },
      required: ["news_id"]
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
  TOOL_GET_PROJECT_DETAILS,
  TOOL_GET_PROJECT_IMAGE,
  TOOL_GET_PROJECT_IMAGES,
  TOOL_GET_VIDEO_SECTIONS,
  TOOL_GET_NEWS_IMAGES
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
  "get_project_details",
  "get_project_image",
  "get_project_images",
  "get_video_sections",
  "get_news_images"
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
