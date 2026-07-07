/**
 * MySQL Connection Pool (Server-side only)
 *
 * يوفّر مجمّع اتصالات واحداً لقاعدة بيانات الأخبار (MariaDB/MySQL عبر XAMPP).
 * يقرأ الإعدادات من متغيرات البيئة DB_* — لا تُكشف أبداً للعميل.
 *
 * يُستخدم فقط في وحدات lib/server/*. جميع الاستعلامات مُعاملية (parameterized)
 * لمنع حقن SQL.
 */

import mysql, { Pool, PoolOptions } from "mysql2/promise"

let pool: Pool | null = null

/**
 * إنشاء/إرجاع مجمّع الاتصالات (singleton)
 */
export function getPool(): Pool {
  if (pool) return pool

  const host = process.env.DB_HOST
  const database = process.env.DB_NAME

  if (!host || !database) {
    throw new Error(
      "DB configuration missing: تأكد من ضبط DB_HOST و DB_NAME في .env.local"
    )
  }

  const config: PoolOptions = {
    host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    database,
    connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
    charset: "utf8mb4",
    waitForConnections: true,
    queueLimit: 0,
    // مهلة الاتصال (ms) — تجنّب التعليق
    connectTimeout: 10000
  }

  pool = mysql.createPool(config)
  return pool
}

/**
 * تنفيذ استعلام مُعاملي وإرجاع الصفوف
 *
 * @param sql - نص الاستعلام مع علامات ? للمعاملات
 * @param params - قيم المعاملات (تُهرَّب تلقائياً)
 */
export async function query<T = any>(
  sql: string,
  params: any[] = []
): Promise<T[]> {
  const [rows] = await getPool().execute(sql, params)
  return rows as T[]
}

/**
 * إغلاق المجمّع (للاختبارات أو إيقاف التشغيل)
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
