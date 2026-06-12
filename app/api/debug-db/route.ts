/**
 * DEBUG ONLY — تشخيص اتصال قاعدة بيانات السجلات
 * احذف هذا الملف بعد إصلاح المشكلة!
 */

import mysql from "mysql2/promise"
import { getDatabaseConfig } from "@/lib/server/site-api-config"

export async function GET() {
  const cfg = getDatabaseConfig()
  const dbName = process.env.LOGS_DB_NAME || process.env.PROJECTS_DB_NAME || cfg.database || "alkafeel_projects"

  const result: Record<string, any> = {
    env: {
      LOGS_DB_NAME: process.env.LOGS_DB_NAME || "(not set)",
      PROJECTS_DB_NAME: process.env.PROJECTS_DB_NAME || "(not set)",
      DB_HOST: process.env.DB_HOST || "(not set)",
      DB_PORT: process.env.DB_PORT || "(not set)",
      DB_USER: process.env.DB_USER || "(not set)",
      DB_PASSWORD: process.env.DB_PASSWORD ? "***SET***" : "(not set)",
      DB_SOCKET: process.env.DB_SOCKET || "(not set)",
      DB_NAME: process.env.DB_NAME || "(not set)",
    },
    resolved_db: dbName,
    connection: "not tested",
    tables: {},
    error: null,
  }

  let pool: mysql.Pool | null = null
  try {
    pool = mysql.createPool({
      host: cfg.host,
      port: cfg.port,
      user: cfg.user,
      password: cfg.password,
      database: dbName,
      connectionLimit: 1,
      charset: "utf8mb4",
      socketPath: process.env.DB_SOCKET || undefined,
      connectTimeout: 5000,
    })

    // اختبار الاتصال
    const [rows] = await pool.query("SELECT 1 AS ok")
    result.connection = "SUCCESS"

    // تحقق من وجود الجداول
    const [tables] = await pool.query(`
      SELECT TABLE_NAME, TABLE_ROWS
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME IN ('chat_logs', 'chat_feedback')
    `, [dbName]) as any[]

    const tableList: any[] = Array.isArray(tables) ? tables : []
    result.tables = {
      chat_logs: tableList.find((t: any) => t.TABLE_NAME === "chat_logs") ? "EXISTS" : "MISSING",
      chat_feedback: tableList.find((t: any) => t.TABLE_NAME === "chat_feedback") ? "EXISTS" : "MISSING",
    }

    // احسب عدد السجلات إذا الجداول موجودة
    if (result.tables.chat_logs === "EXISTS") {
      const [[countRow]] = await pool.query("SELECT COUNT(*) AS cnt FROM chat_logs") as any[]
      result.chat_logs_count = (countRow as any)?.cnt ?? 0
    }
    if (result.tables.chat_feedback === "EXISTS") {
      const [[countRow]] = await pool.query("SELECT COUNT(*) AS cnt FROM chat_feedback") as any[]
      result.chat_feedback_count = (countRow as any)?.cnt ?? 0
    }

    // اختبار إنشاء الجداول إذا كانت ناقصة
    if (result.tables.chat_logs === "MISSING") {
      try {
        await pool.execute(`
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
        result.tables.chat_logs = "CREATED NOW"
      } catch (createErr: any) {
        result.tables.chat_logs_create_error = createErr.message
      }
    }

    if (result.tables.chat_feedback === "MISSING") {
      try {
        await pool.execute(`
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
        result.tables.chat_feedback = "CREATED NOW"
      } catch (createErr: any) {
        result.tables.chat_feedback_create_error = createErr.message
      }
    }

  } catch (err: any) {
    result.connection = "FAILED"
    result.error = err.message
  } finally {
    if (pool) {
      try { await pool.end() } catch {}
    }
  }

  return Response.json(result, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    }
  })
}
