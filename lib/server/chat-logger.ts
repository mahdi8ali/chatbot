/**
 * Chat Logger — يسجّل كل سؤال وجواب في chat_logs
 * ويحفظ تقييمات المستخدمين في chat_feedback
 *
 * ⚠️ هذا الملف للتسجيل والتحليل فقط — لا يؤثر على منطق OpenAI أو البحث
 */

import mysql from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"

let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (pool) return pool
  const cfg = getDatabaseConfig()
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: process.env.LOGS_DB_NAME || process.env.PROJECTS_DB_NAME || cfg.database || "alkafeel_projects",
    connectionLimit: 5,
    charset: "utf8mb4",
    socketPath: process.env.DB_SOCKET || undefined,
  })
  return pool
}

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
  tablesReady = true
}

/** إزالة المعلومات الحساسة قبل الحفظ */
function sanitizePII(text: string): string {
  return text
    .replace(/\b07\d{8,9}\b/g, "[PHONE]")
    .replace(/\b9647\d{8,9}\b/g, "[PHONE]")
    .replace(/[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\bsk-[A-Za-z0-9\-_]{10,}/g, "[TOKEN]")
    .replace(/\bBearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer [TOKEN]")
    .replace(/\b\d{14,16}\b/g, "[ID]")
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
        model_name = ?, was_tool_used = ?
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
