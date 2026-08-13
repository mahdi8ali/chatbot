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
    name: "search_content",
    description: "بحث في قاعدة بيانات شبكة الكفيل: الأخبار، سيرة أبي الفضل العباس (ع)، التاريخ، ومكتبة الفيديو. ⚠️ ليست أداة عدّ: لأسئلة العدّ الكمّي («كم» / «عدد» / «كم مرة» / «كم خبراً عن X» / «كم خبراً لقسم X») استخدم أداة count_news (المسار الموحّد للعدّ) — لا تستعمل هذه الأداة ولا get_content_statistics للعدّ. ⚠️ إذا ذكر المستخدم شهر أو سنة محددة → استخدم from_date و to_date. ⚠️ إذا سأل عن «أكثر خبر زيارة» أو «الأكثر مشاهدة» → استخدم sort_by: \"views\".",
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
          description: "تحديد المصدر: news (أخبار) | sira (سيرة العباس) | history (التاريخ) | video (الفيديو).",
          enum: ["news", "sira", "history", "video"]
        },
        type: {
          type: "string",
          description: "فلتر حسب نوع المحتوى (اختياري): الاخبار، تقارير خبرية، انفوغراف، مقابلات خاصة، مقالات، قصص مصورة.",
          enum: ["الاخبار", "تقارير خبرية", "انفوغراف", "مقابلات خاصة", "مقالات", "قصص مصورة"]
        },
        sort_by: {
          type: "string",
          description: "ترتيب النتائج: relevance (افتراضي حسب الصلة) أو views (الأكثر مشاهدة) أو views_asc (الأقل مشاهدة).",
          enum: ["relevance", "views", "views_asc"]
        },
        from_date: {
          type: "string",
          description: "تاريخ البداية بصيغة YYYY-MM-DD (اختياري)."
        },
        to_date: {
          type: "string",
          description: "تاريخ النهاية بصيغة YYYY-MM-DD (اختياري)."
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
    name: "get_content_by_id",
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
    name: "list_news_categories",
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
    name: "get_latest_news",
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
    name: "get_content_statistics",
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
    description: "بحث في قاعدة بيانات مشاريع العتبة العباسية المنفصلة. استخدمها عندما يسأل المستخدم عن مشروع محدد أو قطاع معين مثل: طبي، تعليمي، زراعي، إنشائي، ثقافي... ترجع قائمة مشاريع مع ملخص ورقم ID لكل مشروع.",
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
 * أداة البحث في الأماكن بـ GPS (places_data)
 */
export const TOOL_SEARCH_PLACES: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_places",
    description: "⚠️ أداة إلزامية لأي سؤال عن مكان في كربلاء — لا تجب أبداً عن مواقع أو فنادق أو أماكن من معرفتك الخاصة. استخدم هذه الأداة فوراً عندما يسأل الزائر عن: موقع مزار/مرقد، فنادق قريبة أو أفضل فنادق، حسينيات، مواكب خدمية، مرافق صحية، نقاط خدمية، أو أي مكان في كربلاء. قاعدة البيانات تضمّ آلاف الأماكن (منها فنادق كثيرة) مع إحداثيات GPS ورابط خرائط جوجل وعنوان تفصيلي لكل مكان. أمثلة: 'أين مرقد الإمام الحسين؟'، 'فنادق قريبة من الصحن'، 'أقرب حسينية'، 'مستشفيات في كربلاء'، 'أقرب فندق إلى الحرمين'.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "اسم المكان أو كلمة وصفية — مثال: 'فندق'، 'مرقد الإمام الحسين'، 'مخيم'، 'مستشفى'"
        },
        category: {
          type: "string",
          description: "فئة المكان للتصفية (اختياري): المزارات، الحسينيات، الفنادق، المواكب الخدمية، المرافق الصحية والخدمية، نقاط دالة",
          enum: ["المزارات", "الحسينيات", "الفنادق", "المواكب الخدمية", "المرافق الصحية والخدمية", "نقاط دالة"]
        },
        city: {
          type: "string",
          description: "اسم المدينة للتصفية (اختياري) — مثال: كربلاء"
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي: 8، أقصى: 30)",
          minimum: 1,
          maximum: 30
        },
        near: {
          type: "string",
          description: "إحداثيات مرجعية بصيغة 'lat,lng' لترتيب النتائج حسب القرب — مثال: '32.6163,44.0325' (الصحن الحسيني). استخدمها عند طلب 'أقرب' أو 'بالقرب من'"
        }
      },
      required: []
    }
  }
}

/**
 * أداة البحث المباشر في مكتبة الفيديو بالعنوان
 */
export const TOOL_SEARCH_VIDEOS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_videos",
    description: "بحث مباشر في مكتبة فيديو شبكة الكفيل بالعنوان أو الوصف. استخدم هذه الأداة تحديداً عندما يطلب المستخدم فيديو بعنوان أو موضوع محدد: 'أريد فيديو عن محرم'، 'فيديو طوعة العصر'، 'أرني فيديوهات الأربعين'، 'فيديو خطبة'... إلخ. النتيجة تحتوي رابط mp4 مباشر للتشغيل.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "كلمات البحث بالعربية — عنوان الفيديو أو موضوعه"
        },
        section: {
          type: "string",
          description: "اسم قسم الفيديو للتصفية (اختياري) — مثال: أربعين، محرم، مواكب، إصدارات"
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي: 3، أقصى: 10)",
          minimum: 1,
          maximum: 10
        }
      },
      required: ["query"]
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
    description: "قائمة جميع أقسام مكتبة الفيديو في شبكة الكفيل. استخدم هذه الأداة عندما يسأل المستخدم عن: أقسام الفيديو، ما هي تصنيفات الفيديو، ماذا يوجد في مكتبة الفيديو، أو يريد تصفح محتوى الفيديو.",
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
/**
 * أداة البحث في الإصدارات والمطبوعات (كتب، مجلات، دراسات)
 */
export const TOOL_SEARCH_PUBLICATIONS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "search_publications",
    description: "بحث في إصدارات ومطبوعات العتبة العباسية المقدسة: كتب، مجلات، دراسات دينية وثقافية (سلاسل مثل مناهل الطف، رياض الزهراء، عطاء الشباب، منشورات المكتبة). استخدمها عندما يسأل المستخدم عن كتاب أو مجلة أو إصدار أو مطبوعة بعنوان أو موضوع محدد: 'هل يوجد كتاب عن سيرة العباس؟'، 'أريد مجلة رياض الزهراء'، 'ما هي إصداراتكم في العقيدة؟'. ⚠️ ليست search_content — الإصدارات في قاعدة منفصلة تماماً عن الأخبار. كل نتيجة تحمل image_url (غلاف الإصدار)، pdf_url (تصفّح مباشر)، وdownload_url (تحميل الأرشيف) جاهزة — قد يكون أيٌّ منها null إن غاب الملف المقابل.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "كلمات البحث بالعربية — عنوان الإصدار أو موضوعه (اختياري إن حُدّد category_id). ⚠️ إن ذكر المستخدم رقم عدد/إصدار معيّناً (مثل \"العدد 50\"، \"العدد رقم ٥٠\")، ضع الرقم كرقم داخل query حرفياً (مثال: \"مجلة الرياحين 50\") — لا تحذفه ولا تكتفِ باسم السلسلة وحده، فرقم العدد هو معيار المطابقة الأساسي."
        },
        category_id: {
          type: "number",
          description: "معرّف سلسلة/تصنيف الإصدارات للتصفية (اختياري) — يُجلب عبر get_publication_categories"
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي: 8، أقصى: 20)",
          minimum: 1,
          maximum: 20
        }
      },
      required: []
    }
  }
}

/**
 * أداة قائمة سلاسل/تصنيفات الإصدارات
 */
export const TOOL_GET_PUBLICATION_CATEGORIES: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_publication_categories",
    description: "قائمة كل سلاسل وتصنيفات الإصدارات المتاحة (مثل: مناهل الطف، رياض الزهراء، منشورات المكتبة) مع عدد الإصدارات في كل سلسلة ووصفها. استخدمها عندما يسأل المستخدم: 'ما هي سلاسل إصداراتكم؟'، 'ما تصنيفات المطبوعات المتاحة؟'، 'ماذا لديكم من مجلات؟'.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
}

/**
 * أداة روابط حسابات التواصل الاجتماعي
 */
export const TOOL_GET_SOCIAL_MEDIA_LINKS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_social_media_links",
    description: "روابط حسابات العتبة العباسية المقدسة الرسمية على مواقع التواصل الاجتماعي (فيسبوك، تويتر/إكس، إنستغرام...) مع عدد المتابعين. استخدمها فوراً عندما يسأل المستخدم: 'ما حساباتكم على انستغرام؟'، 'رابط صفحتكم على فيسبوك'، 'هل لديكم تويتر؟'، 'كم متابع لديكم؟'. ⚠️ لا تخترع رابط حساب من معرفتك الخاصة — استخدم هذه الأداة دائماً.",
    parameters: {
      type: "object",
      properties: {},
      required: []
    }
  }
}

/**
 * أداة أوقات الصلاة
 */
export const TOOL_GET_PRAYER_TIMES: ChatCompletionTool = {
  type: "function",
  function: {
    name: "get_prayer_times",
    description: "جلب أوقات الصلاة (الفجر، الشروق، الظهر، المغرب، منتصف الليل) من قاعدة بيانات كربلاء. استخدم هذه الأداة فقط لأوقات صلاة اليوم أو لتاريخ ميلادي صريح صحيح يقدّمه المستخدم بصيغة YYYY-MM-DD أو DD/MM. لا تستخدم هذه الأداة لتاريخ ناتج عن تحويل هجري↔ميلادي أو مُشتق من توقيت مناسبة دينية (هذه الحالات خارج النطاق؛ لا تخترع أو تحوّل تاريخاً لاستدعاء هذه الأداة).",
    parameters: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description: "التاريخ الميلادي الصريح الصحيح بصيغة YYYY-MM-DD أو DD/MM. إذا لم يُحدد يُستخدم تاريخ اليوم. لا تمرّر تاريخاً ناتجاً عن تحويل هجري↔ميلادي أو مُشتقاً من توقيت مناسبة دينية (خارج النطاق)."
        }
      },
      required: []
    }
  }
}

/**
 * أداة عدّ ذكر الكيان/الكلمة ضمن نافذة زمنية (تحليلية)
 */
export const TOOL_COUNT_MENTIONS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "count_mentions",
    description: "لعدّ ذكر كلمة/اسم/موضوع في أخبار شبكة الكفيل ضمن فترة زمنية مع الحاجة إلى عيّنة روابط توضيحية (sample). مثل: «كم مرة ذُكر علي البدري خلال آخر شهر؟»، «كم خبراً نُشر عن زيارة عرفة؟». تُعطي نفس عدد count_news(query) بالضبط (دلالة مطابقة موحّدة)؛ فإن لم تكن بحاجة لعيّنة روابط فاستخدم count_news. لا تستعمل search_content للعدّ. يكفي الاسم دون ألقاب («سيد»/«سماحة»)، والعدّ تقريبي بمطابقة الكلمات المطبّعة (بحدود الكلمات) في العنوان والمحتوى.",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "الكلمة أو الاسم أو الموضوع المراد عدّ ذكره (بالعربية)"
        },
        period: {
          type: "string",
          description: "الفترة النسبية",
          enum: ["day", "week", "month", "quarter", "year", "all"]
        },
        last_days: {
          type: "number",
          description: "عدد الأيام الأخيرة (مثال: 30). يُستخدم بدل period عند الحاجة",
          minimum: 1,
          maximum: 3650
        },
        from: {
          type: "string",
          description: "بداية المدى الصريح بصيغة YYYY-MM-DD (اختياري)"
        },
        to: {
          type: "string",
          description: "نهاية المدى الصريح بصيغة YYYY-MM-DD (اختياري)"
        }
      },
      required: ["query"]
    }
  }
}

/**
 * أداة الخط الزمني لذكر الموضوع (تحليلية)
 */
export const TOOL_MENTIONS_TIMELINE: ChatCompletionTool = {
  type: "function",
  function: {
    name: "mentions_timeline",
    description: "توزيع زمني (خط زمني) لعدد مرات ذكر كلمة/موضوع عبر أيام أو أسابيع أو أشهر — لرصد الاتجاهات. استخدمها لأسئلة مثل: «كيف تطوّر ذكر الزيارة الأربعينية شهرياً؟».",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "الكلمة أو الموضوع (بالعربية)"
        },
        granularity: {
          type: "string",
          description: "حبيبة التجميع الزمني",
          enum: ["day", "week", "month"]
        },
        period: {
          type: "string",
          enum: ["week", "month", "quarter", "year", "all"]
        },
        last_days: {
          type: "number",
          minimum: 1,
          maximum: 3650
        },
        from: {
          type: "string",
          description: "YYYY-MM-DD (اختياري)"
        },
        to: {
          type: "string",
          description: "YYYY-MM-DD (اختياري)"
        }
      },
      required: ["query", "granularity"]
    }
  }
}

/**
 * أداة أكثر الأقسام/التصنيفات نشاطاً (تحليلية)
 */
export const TOOL_TOP_TOPICS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "top_topics",
    description: "أكثر الأقسام/التصنيفات نشاطاً (عدد الأخبار) خلال فترة زمنية. استخدمها لأسئلة مثل: «ما أكثر الأقسام نشراً هذا الأسبوع؟».",
    parameters: {
      type: "object",
      properties: {
        period: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year", "all"]
        },
        last_days: {
          type: "number",
          minimum: 1,
          maximum: 3650
        },
        section: {
          type: "string",
          description: "اسم أو معرّف تصنيف للتصفية (اختياري)"
        },
        limit: {
          type: "number",
          description: "عدد النتائج (افتراضي 5، أقصى 20)",
          minimum: 1,
          maximum: 20
        }
      },
      required: []
    }
  }
}

/**
 * أداة عدّ الأخبار حسب الفترة والتصنيف (تحليلية)
 */
export const TOOL_COUNT_NEWS: ChatCompletionTool = {
  type: "function",
  function: {
    name: "count_news",
    description: "المسار الموحّد الافتراضي لأسئلة العدّ عن الأخبار («كم خبر عن X»، «كم خبر لقسم X»، «كم تقرير خبري»...). ⚠️ لأسئلة «كم تقرير خبري» أو «كم انفوغراف» استخدم type_id. ⚠️ لأسئلة «كم خبر عن X» أو «كم خبر لقسم X» استخدم query مع الكلمة المفتاحية (يكفي الاسم دون ألقاب مثل «سيد» أو «سماحة»). العدّ بالكلمة تقريبي (مطابقة كلمات مطبّعة) ويعطي نفس نتيجة count_mentions. إذا كانت النتيجة صفراً مع latest_available فالفترة المطلوبة أحدث من بيانات القاعدة (وضّح ذلك للمستخدم بدل الإيحاء بعدم الذكر).",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "كلمة مفتاحية للبحث في العنوان والمحتوى (اختياري). استخدمه عند السؤال عن عدد أخبار موضوع أو قسم معين."
        },
        category_id: {
          type: "number",
          description: "معرّف التصنيف (اختياري)"
        },
        type_id: {
          type: "number",
          description: "معرّف نوع المحتوى (اختياري): 1=الاخبار، 2=تقارير خبرية، 3=انفوغراف، 4=مقابلات خاصة، 5=مقالات، 7=قصص مصورة"
        },
        period: {
          type: "string",
          enum: ["day", "week", "month", "quarter", "year", "all"]
        },
        last_days: {
          type: "number",
          minimum: 1,
          maximum: 3650
        },
        from: {
          type: "string",
          description: "YYYY-MM-DD (اختياري)"
        },
        to: {
          type: "string",
          description: "YYYY-MM-DD (اختياري)"
        }
      },
      required: []
    }
  }
}

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
  TOOL_SEARCH_VIDEOS,
  TOOL_GET_NEWS_IMAGES,
  TOOL_SEARCH_PLACES,
  TOOL_GET_PRAYER_TIMES,
  TOOL_COUNT_MENTIONS,
  TOOL_MENTIONS_TIMELINE,
  TOOL_TOP_TOPICS,
  TOOL_COUNT_NEWS,
  TOOL_SEARCH_PUBLICATIONS,
  TOOL_GET_PUBLICATION_CATEGORIES,
  TOOL_GET_SOCIAL_MEDIA_LINKS
]

/**
 * Whitelist: أسماء الأدوات المسموحة فقط
 */
export const ALLOWED_TOOL_NAMES = [
  "search_content",
  "get_content_by_id",
  "list_news_categories",
  "get_latest_news",
  "get_content_statistics",
  "search_contacts",
  "search_projects_db",
  "get_project_details",
  "get_project_image",
  "get_project_images",
  "get_video_sections",
  "search_videos",
  "get_news_images",
  "search_places",
  "get_prayer_times",
  "count_mentions",
  "mentions_timeline",
  "top_topics",
  "count_news",
  "search_publications",
  "get_publication_categories",
  "get_social_media_links"
] as const

export type AllowedToolName = (typeof ALLOWED_TOOL_NAMES)[number]

/**
 * أسماء قديمة → أسماء حالية (توافق خلفي).
 *
 * سبب الترحيل: الأسماء القديمة كانت **تكذب** على النموذج وعلى القارئ —
 * `search_projects` كانت تبحث في الأخبار لا المشاريع، و`filter_projects` تُرجع
 * التصنيفات، و`get_project_by_id` يجلب خبراً. أسماء مضلّلة ⇒ اختيار خاطئ للأداة،
 * وقد عُوّض ذلك سابقاً بتحذيرات مطوّلة في الموجّه.
 *
 * تُقبل الأسماء القديمة هنا لأن النموذج قد يُصدرها من نمط محفوظ، فتُترجم بصمت
 * بدل أن تُرفض. ملاحظة للوحة التحليلات: عمود `chat_logs.tool_called` يحمل
 * الأسماء القديمة في السجلّات السابقة — استعمل هذه الخريطة عند التجميع.
 *
 * ⚠️ لم يُعَد استعمال الاسم `search_projects` لأداة أخرى عمداً، كي لا تختلط
 * دلالة السجلّات التاريخية (كانت تعني بحث الأخبار) بدلالة جديدة.
 */
export const LEGACY_TOOL_ALIASES: Readonly<Record<string, AllowedToolName>> = Object.freeze({
  search_projects: "search_content",
  get_project_by_id: "get_content_by_id",
  filter_projects: "list_news_categories",
  get_latest_projects: "get_latest_news",
  get_statistics: "get_content_statistics",
})

/**
 * يحوّل اسماً قديماً إلى الاسم الحالي، أو يُعيده كما هو إن لم يكن قديماً.
 */
export function canonicalToolName(toolName: string): string {
  return LEGACY_TOOL_ALIASES[toolName] ?? toolName
}

/**
 * التحقق من أن اسم الأداة مسموح (يقبل الأسماء القديمة عبر الخريطة أعلاه).
 */
export function isAllowedTool(toolName: string): toolName is AllowedToolName {
  return ALLOWED_TOOL_NAMES.includes(canonicalToolName(toolName) as AllowedToolName)
}

/**
 * الحصول على أداة محددة بالاسم
 */
export function getToolByName(
  toolName: AllowedToolName
): ChatCompletionTool | undefined {
  return ALL_SITE_TOOLS.find(tool => tool.function.name === toolName)
}
