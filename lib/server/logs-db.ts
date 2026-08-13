/**
 * logs-db.ts — بِركة اتصال **واحدة** لقاعدة السجلّات المعزولة.
 *
 * ── لماذا ──────────────────────────────────────────────────────────────────
 * كانت أربع وحدات (chat-logger, curated-service, kb-service, api/analytics)
 * تُنشئ كلٌّ بِركتها الخاصة لنفس القاعدة، بسلسلة احتياطي مكرّرة حرفياً:
 *   LOGS_DB_NAME || PROJECTS_DB_NAME || cfg.database || "local_chatbot_logs"
 *
 * مشكلتان:
 *  (١) تكاثر البِرَك — سبع برك لثلاث قواعد، حتى 114 اتصالاً لكل instance.
 *  (٢) **الاحتياطي الصامت**: عند غياب LOGS_DB_NAME تُنشأ جداول السجلّات
 *      (chat_logs, curated_answers, kb_articles) داخل **قاعدة المحتوى
 *      الإنتاجية** بلا أي تحذير، فتختلط بيانات التشغيل ببيانات المحتوى،
 *      ويحتاج مستخدم التطبيق صلاحيات DDL على قاعدة إنتاجية.
 *
 * الآن: مصدر واحد، وفشل صريح مبكر بدل الاحتياطي الصامت.
 */

import mysql, { Pool } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"

let pool: Pool | null = null

/**
 * اسم قاعدة السجلّات. يُشترط ضبط LOGS_DB_NAME صراحةً؛ وعند غيابه نقبل
 * PROJECTS_DB_NAME **مع تحذير** (سلوك تاريخي)، ونرفض السقوط إلى قاعدة المحتوى.
 */
function resolveLogsDatabase(): string {
  const explicit = process.env.LOGS_DB_NAME
  if (explicit) return explicit

  const projects = process.env.PROJECTS_DB_NAME
  if (projects) {
    console.warn(
      `[logs-db] LOGS_DB_NAME غير مضبوط — سيُستعمل PROJECTS_DB_NAME ("${projects}") لجداول السجلّات. ` +
      `يُفضّل قاعدة سجلّات معزولة (مثل local_chatbot_logs).`
    )
    return projects
  }

  throw new Error(
    "LOGS_DB_NAME غير مضبوط ولا PROJECTS_DB_NAME — لا يمكن تحديد قاعدة السجلّات. " +
    "اضبط LOGS_DB_NAME في .env.local (لا نسقط تلقائياً إلى قاعدة المحتوى)."
  )
}

/** بِركة السجلّات المشتركة (تُنشأ مرّة واحدة). */
export function getLogsPool(): Pool {
  if (pool) return pool
  const cfg = getDatabaseConfig()
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: resolveLogsDatabase(),
    // بِركة واحدة مشتركة ⇒ حدّ أعلى معتدل بدل 3+3+5+3 موزّعة
    connectionLimit: Number(process.env.LOGS_DB_CONNECTION_LIMIT || "8"),
    charset: "utf8mb4",
    socketPath: process.env.DB_SOCKET || undefined,
  })
  return pool
}
