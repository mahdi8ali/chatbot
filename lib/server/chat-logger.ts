/**
 * Chat Logger — يسجّل كل سؤال وجواب في chat_logs
 * ويحفظ تقييمات المستخدمين في chat_feedback
 *
 * ⚠️ هذا الملف للتسجيل والتحليل فقط — لا يؤثر على منطق OpenAI أو البحث
 */

import { getLogsPool as getPool } from "./logs-db"


let tablesReady = false

async function ensureTables(): Promise<void> {
  if (tablesReady) return
  const db = getPool()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_logs (
      id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      session_id       VARCHAR(64),
      user_question    TEXT NOT NULL,
      tool_called      VARCHAR(256),
      tool_arguments   TEXT,
      db_result_ids    TEXT,
      db_result_count  SMALLINT DEFAULT 0,
      final_answer     TEXT,
      response_time_ms INT DEFAULT 0,
      model_name       VARCHAR(64),
      was_tool_used    TINYINT(1) DEFAULT 0,
      prompt_tokens    INT DEFAULT 0,
      completion_tokens INT DEFAULT 0,
      cached_tokens    INT DEFAULT 0,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_created (created_at),
      INDEX idx_session (session_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  await db.execute(`
    CREATE TABLE IF NOT EXISTS chat_feedback (
      id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      chat_log_id   BIGINT UNSIGNED NOT NULL,
      session_id    VARCHAR(64),
      rating        ENUM('helpful','not_helpful') NOT NULL,
      feedback_note TEXT,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_chat_log (chat_log_id),
      INDEX idx_rating (rating)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  // ترحيل: الأعمدة الجديدة لا تُضاف إلى جدول قائم عبر CREATE TABLE IF NOT EXISTS.
  // نضيفها بمحاولة صامتة (الخطأ يعني أنها موجودة أصلاً) — بلا ALTER تدميري.
  for (const col of [
    "prompt_tokens INT DEFAULT 0",
    "completion_tokens INT DEFAULT 0",
    "cached_tokens INT DEFAULT 0",
  ]) {
    try {
      await db.execute(`ALTER TABLE chat_logs ADD COLUMN ${col}`)
      console.log(`[ChatLogger] أُضيف عمود التتبّع: ${col.split(" ")[0]}`)
    } catch {
      /* العمود موجود مسبقاً — تجاهل */
    }
  }
  tablesReady = true
}

/**
 * إزالة المعلومات الحساسة قبل الحفظ.
 *
 * ⚠️ الغرض إخفاء بيانات **المستخدمين**، لا أرقام العتبة الرسمية المنشورة أصلاً.
 * كانت القاعدة `\d{14,16} → [ID]` تبتلع أرقام الأقسام (مثل 009647700479212،
 * وطولها 15 رقماً)، فصار **كل** جواب اتصال غير قابل للتدقيق من لوحة الإدارة
 * (القياس: 12 سجلّاً فيها [ID] مقابل صفر سجلّ فيه رقم سليم) — وهي أخطر صنف
 * من الأجوبة وأولاها بالمراجعة.
 *
 * الآن: تُستثنى أرقام العتبة الرسمية (تبدأ بـ 00964 أو +964) من قاعدة [ID]،
 * وتبقى بقية القواعد كما هي لحماية أرقام المستخدمين وبريدهم ومفاتيحهم.
 */
function sanitizePII(text: string): string {
  return text
    .replace(/\b07\d{8,9}\b/g, "[PHONE]")
    .replace(/\b9647\d{8,9}\b/g, "[PHONE]")
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\bsk-[A-Za-z0-9\-_]{10,}/g, "[TOKEN]")
    .replace(/\bBearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [TOKEN]")
    // أرقام طويلة مجهولة الهوية → [ID]، عدا أرقام العتبة الرسمية (00964…/+964…)
    .replace(/\b\d{14,16}\b/g, (m) =>
      m.startsWith("00964") || m.startsWith("964") ? m : "[ID]"
    )
}

export interface ChatLogData {
  sessionId?: string
  userQuestion: string
  toolCalled?: string
  toolArguments?: string
  dbResultIds?: string
  dbResultCount?: number
  finalAnswer?: string
  responseTimeMs?: number
  modelName?: string
  wasToolUsed?: boolean
  /** استهلاك الرموز من ردّ OpenAI — أساس حساب الكلفة لكل سؤال. */
  promptTokens?: number
  completionTokens?: number
  /** الرموز المخدومة من التخزين المؤقّت (تُحاسَب بسعر مخفّض). */
  cachedTokens?: number
}

/** يحفظ سجل سؤال + جواب ويُرجع الـ id المُدرج كـ string */
export async function saveChatLog(data: ChatLogData): Promise<string | null> {
  try {
    await ensureTables()
    const db = getPool()
    const [result] = await db.execute(
      `INSERT INTO chat_logs
        (session_id, user_question, tool_called, tool_arguments,
         db_result_ids, db_result_count, final_answer,
         response_time_ms, model_name, was_tool_used)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        data.sessionId || null,
        sanitizePII(data.userQuestion),
        data.toolCalled || null,
        data.toolArguments ? sanitizePII(data.toolArguments) : null,
        data.dbResultIds || null,
        data.dbResultCount ?? 0,
        data.finalAnswer ? sanitizePII(data.finalAnswer.slice(0, 3000)) : null,
        data.responseTimeMs ?? 0,
        data.modelName || null,
        data.wasToolUsed ? 1 : 0,
      ]
    ) as any
    return String(result.insertId)
  } catch (err) {
    console.error("[ChatLogger] saveChatLog error:", err)
    return null
  }
}

/** يُنشئ صفاً مبدئياً ويُرجع الـ DB id — للحصول على الـ id قبل اكتمال الـ stream */
export async function createPendingLog(sessionId: string | undefined, userQuestion: string): Promise<string | null> {
  try {
    await ensureTables()
    const db = getPool()
    const [result] = await db.execute(
      `INSERT INTO chat_logs (session_id, user_question, was_tool_used) VALUES (?, ?, 0)`,
      [sessionId || null, sanitizePII(userQuestion)]
    ) as any
    return String(result.insertId)
  } catch (err) {
    console.error("[ChatLogger] createPendingLog error:", err)
    return null
  }
}

/** يُحدِّث صفاً موجوداً بالبيانات الكاملة بعد اكتمال الـ stream */
export async function updateChatLog(id: string, data: Omit<ChatLogData, "sessionId" | "userQuestion">): Promise<void> {
  try {
    const db = getPool()
    await db.execute(
      `UPDATE chat_logs SET
        tool_called = ?, tool_arguments = ?, db_result_ids = ?,
        db_result_count = ?, final_answer = ?, response_time_ms = ?,
        model_name = ?, was_tool_used = ?,
        prompt_tokens = ?, completion_tokens = ?, cached_tokens = ?
       WHERE id = ?`,
      [
        data.toolCalled || null,
        data.toolArguments ? sanitizePII(data.toolArguments) : null,
        data.dbResultIds || null,
        data.dbResultCount ?? 0,
        data.finalAnswer ? sanitizePII(data.finalAnswer.slice(0, 3000)) : null,
        data.responseTimeMs ?? 0,
        data.modelName || null,
        data.wasToolUsed ? 1 : 0,
        data.promptTokens ?? 0,
        data.completionTokens ?? 0,
        data.cachedTokens ?? 0,
        BigInt(id),
      ]
    )
  } catch (err) {
    console.error("[ChatLogger] updateChatLog error:", err)
  }
}

/** يحفظ تقييم المستخدم (مفيدة / غير مفيدة) */
export async function saveFeedback(data: {
  chatLogId: string
  sessionId?: string
  rating: "helpful" | "not_helpful"
  feedbackNote?: string
}): Promise<boolean> {
  try {
    await ensureTables()
    const db = getPool()
    await db.execute(
      `INSERT INTO chat_feedback (chat_log_id, session_id, rating, feedback_note)
       VALUES (?, ?, ?, ?)`,
      [
        BigInt(data.chatLogId),
        data.sessionId || null,
        data.rating,
        data.feedbackNote ? sanitizePII(data.feedbackNote.slice(0, 1000)) : null,
      ]
    )
    return true
  } catch (err) {
    console.error("[ChatLogger] saveFeedback error:", err)
    return false
  }
}
