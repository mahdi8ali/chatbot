/**
 * أنواع بيانات الشات الموحد
 */

/**
 * نوع الرسالة في المحادثة
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant"
  content: string
  timestamp?: string
}

/**
 * طلب الشات
 */
export interface SiteChatRequest {
  messages: ChatMessage[]
  temperature?: number
  max_tokens?: number
}

/**
 * رد الشات الناجح
 */
export interface SiteChatResponse {
  message: string
  source: "api" | "fallback"
  metadata?: {
    model?: string
    tokens_used?: number
    response_time?: number
  }
}

/**
 * رد الخطأ
 */
export interface SiteChatError {
  error: string
  fallback?: string
  code?: string
  timestamp?: string
}

/**
 * أنواع الردود الـ Fallback
 */
export type FallbackType = "no_results" | "api_error" | "out_of_scope"

/**
 * حالة الرد من البوت
 */
export type ResponseStatus =
  | "success" // رد عادي من API
  | "no_results" // لا توجد نتائج
  | "error" // خطأ تقني
  | "out_of_scope" // سؤال خارج النطاق

/**
 * بيانات وصفية للمحادثة
 */
export interface ConversationMetadata {
  session_id?: string
  user_id?: string
  started_at?: string
  message_count?: number
}
