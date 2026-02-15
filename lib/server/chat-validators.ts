/**
 * مساعدات للتحقق من نطاق الأسئلة والردود
 */

/**
 * كلمات مفتاحية تدل على أسئلة داخل النطاق
 */
const IN_SCOPE_KEYWORDS = [
  "مشروع",
  "مشاريع",
  "برنامج",
  "برامج",
  "فعالية",
  "فعاليات",
  "نشاط",
  "أنشطة",
  "تقرير",
  "تقارير",
  "إحصائية",
  "إحصائيات",
  "projects.alkafeel.net",
  "الكفيل",
  "alkafeel",
  "حالة المشروع",
  "تفاصيل المشروع",
  "البحث عن مشروع"
]

/**
 * كلمات مفتاحية تدل على أسئلة خارج النطاق
 */
const OUT_OF_SCOPE_KEYWORDS = [
  "الطقس",
  "وصفة",
  "رياضة",
  "فيلم",
  "أغنية",
  "كتاب",
  "سيارة",
  "هاتف",
  "كمبيوتر",
  "برمجة",
  "python",
  "javascript",
  "معنى كلمة",
  "ترجم",
  "translate"
]

/**
 * فحص ما إذا كان السؤال داخل النطاق
 * 
 * @param question - السؤال المراد فحصه
 * @returns true إذا كان السؤال داخل النطاق
 */
export function isQuestionInScope(question: string): boolean {
  const lowerQuestion = question.toLowerCase()

  // إذا وجدت كلمة من خارج النطاق، السؤال خارج النطاق
  const hasOutOfScopeKeyword = OUT_OF_SCOPE_KEYWORDS.some(keyword =>
    lowerQuestion.includes(keyword)
  )

  if (hasOutOfScopeKeyword) {
    return false
  }

  // إذا وجدت كلمة من داخل النطاق، السؤال داخل النطاق
  const hasInScopeKeyword = IN_SCOPE_KEYWORDS.some(keyword =>
    lowerQuestion.includes(keyword)
  )

  if (hasInScopeKeyword) {
    return true
  }

  // افتراضياً: السؤال داخل النطاق (نترك للـ AI التحكم)
  return true
}

/**
 * استخراج نية المستخدم من السؤال
 * 
 * @param question - السؤال
 * @returns نوع النية المحتملة
 */
export type UserIntent =
  | "search_projects" // البحث عن مشاريع
  | "project_details" // تفاصيل مشروع محدد
  | "project_status" // حالة مشروع
  | "statistics" // إحصائيات
  | "events" // فعاليات
  | "general_help" // مساعدة عامة
  | "out_of_scope" // خارج النطاق
  | "unknown" // غير واضح

export function detectUserIntent(question: string): UserIntent {
  const lowerQuestion = question.toLowerCase()

  // خارج النطاق
  if (!isQuestionInScope(question)) {
    return "out_of_scope"
  }

  // البحث عن مشاريع
  if (
    lowerQuestion.includes("ابحث") ||
    lowerQuestion.includes("اعطني") ||
    lowerQuestion.includes("اريد") ||
    lowerQuestion.includes("ما هي المشاريع") ||
    lowerQuestion.includes("مشاريع متعلقة")
  ) {
    return "search_projects"
  }

  // تفاصيل مشروع
  if (
    lowerQuestion.includes("تفاصيل") ||
    lowerQuestion.includes("معلومات عن") ||
    lowerQuestion.includes("ما هو المشروع")
  ) {
    return "project_details"
  }

  // حالة مشروع
  if (
    lowerQuestion.includes("حالة") ||
    lowerQuestion.includes("وضع") ||
    lowerQuestion.includes("تقدم") ||
    lowerQuestion.includes("نسبة الإنجاز")
  ) {
    return "project_status"
  }

  // إحصائيات
  if (
    lowerQuestion.includes("إحصائية") ||
    lowerQuestion.includes("تقرير") ||
    lowerQuestion.includes("عدد") ||
    lowerQuestion.includes("كم")
  ) {
    return "statistics"
  }

  // فعاليات
  if (
    lowerQuestion.includes("فعالية") ||
    lowerQuestion.includes("نشاط") ||
    lowerQuestion.includes("حدث")
  ) {
    return "events"
  }

  // مساعدة عامة
  if (
    lowerQuestion.includes("كيف") ||
    lowerQuestion.includes("ساعدني") ||
    lowerQuestion.includes("مساعدة") ||
    lowerQuestion === "؟" ||
    lowerQuestion === "مرحبا" ||
    lowerQuestion === "السلام عليكم"
  ) {
    return "general_help"
  }

  return "unknown"
}

/**
 * التحقق من أن الرد من AI يلتزم بالقيود
 * 
 * @param response - رد AI
 * @returns true إذا كان الرد يبدو ملتزماً بالقيود
 */
export function isResponseCompliant(response: string): boolean {
  const lowerResponse = response.toLowerCase()

  // علامات على عدم الالتزام
  const nonCompliantPhrases = [
    "كنموذج لغوي",
    "لست متأكد",
    "بشكل عام",
    "من تجربتي",
    "حسب معرفتي العامة",
    "في العالم",
    "تاريخياً",
    "علمياً"
  ]

  const hasNonCompliantPhrase = nonCompliantPhrases.some(phrase =>
    lowerResponse.includes(phrase)
  )

  if (hasNonCompliantPhrase) {
    return false
  }

  // علامات على الالتزام
  const compliantPhrases = [
    "بناءً على بيانات النظام",
    "حسب المعلومات المتوفرة",
    "من خلال النظام",
    "في قاعدة البيانات",
    "عذراً، لا توجد معلومات"
  ]

  const hasCompliantPhrase = compliantPhrases.some(phrase =>
    lowerResponse.includes(phrase)
  )

  // إذا وجدت عبارة ملتزمة، الرد جيد
  if (hasCompliantPhrase) {
    return true
  }

  // افتراضياً نعتبره ملتزم (نثق بالـ System Prompt)
  return true
}

/**
 * تنظيف الرد من عبارات غير مرغوبة
 */
export function cleanResponse(response: string): string {
  let cleaned = response

  // إزالة عبارات نموذج اللغة
  const phrasesToRemove = [
    /كنموذج لغوي[^.،]*[.،]/gi,
    /لا أستطيع الوصول[^.،]*[.،]/gi,
    /ليس لدي القدرة[^.،]*[.،]/gi
  ]

  phrasesToRemove.forEach(pattern => {
    cleaned = cleaned.replace(pattern, "")
  })

  return cleaned.trim()
}
