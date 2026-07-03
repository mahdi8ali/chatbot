/**
 * Curated Answers Service — مخزن الإجابات المنسّقة
 *
 * مصدر واحد مدعوم بقاعدة البيانات للإجابات الموثوقة (الأسئلة الشائعة + المواقف
 * الفقهية الحسّاسة كموقف صلاة التراويح). يخدم `curated_answers` في قاعدة السجلّات
 * المعزولة `local_chatbot_logs` عبر مجمّع اتصال خاص (نمط chat-logger.ts).
 *
 * ⚠️ إضافي وقابل للعكس: جدول واحد عبر CREATE TABLE IF NOT EXISTS، بلا ALTER/DROP،
 * وبلا مساس ببيانات المحتوى (ka_db / alkafeel_projects).
 */

import mysql from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"
import { normalizeArabic, FAQ_ENTRIES } from "./faq"

// ===== النوع المُصدَّر =====
export interface CuratedEntry {
  id: number
  category: "faq" | "stance"
  patterns: string[]
  answer: string
  url?: string | null
  mode: string
  priority: number
  active: boolean
}

// ===== المجمّع المعزول (نمط chat-logger.ts) =====
let pool: mysql.Pool | null = null

function getPool(): mysql.Pool {
  if (pool) return pool
  const cfg = getDatabaseConfig()
  pool = mysql.createPool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    // نفس قاعدة السجلّات المعزولة المستخدمة في chat-logger.ts
    database:
      process.env.LOGS_DB_NAME ||
      process.env.PROJECTS_DB_NAME ||
      cfg.database ||
      "local_chatbot_logs",
    connectionLimit: 3,
    charset: "utf8mb4",
    socketPath: process.env.DB_SOCKET || undefined,
  })
  return pool
}

// ===== إنشاء الجدول (idempotent) =====
let tableReady = false

async function ensureTable(): Promise<void> {
  if (tableReady) return
  const db = getPool()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS curated_answers (
      id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      category    ENUM('faq','stance') NOT NULL DEFAULT 'faq',
      patterns    TEXT NOT NULL,
      answer      TEXT NOT NULL,
      url         VARCHAR(512) NULL,
      mode        VARCHAR(32) NOT NULL DEFAULT 'short_circuit',
      priority    INT NOT NULL DEFAULT 0,
      active       TINYINT(1) NOT NULL DEFAULT 1,
      note        TEXT NULL,
      created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_active_priority (active, priority),
      INDEX idx_category (category)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  tableReady = true
}

// ===== البذرة idempotent =====
/**
 * يبذر FAQ_ENTRIES + موقف التراويح فقط إذا كان الجدول فارغاً (idempotent).
 */
export async function seed(): Promise<void> {
  await ensureTable()
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT COUNT(*) AS n FROM curated_answers`
  )) as any
  if (rows[0].n > 0) return // مبذور مسبقاً → لا شيء

  // 1) بذرة الأسئلة الشائعة من faq.ts (المصدر الوحيد للحقيقة عند البذر)
  for (const e of FAQ_ENTRIES) {
    await db.execute(
      `INSERT INTO curated_answers (category, patterns, answer, url, priority)
       VALUES ('faq', ?, ?, ?, 0)`,
      [JSON.stringify(e.patterns), e.answer, e.url ?? null]
    )
  }

  // 2) بذرة موقف التراويح (المنقول من system-prompts.ts) — أولوية أعلى
  await db.execute(
    `INSERT INTO curated_answers (category, patterns, answer, url, priority, note)
     VALUES ('stance', ?, ?, NULL, 10, ?)`,
    [
      JSON.stringify(["التراويح", "صلاة التراويح", "تراويح"]),
      "صلاة التراويح (جماعةً) غير مُقرّة لدى العتبة العباسية المقدسة وتُعدّ بدعة، وثمة بحث منشور في ذلك ضمن محتوى الموقع.",
      "منقول من كتلة استثناء system-prompts.ts — موقف فقهي مستند إلى بحث منشور",
    ]
  )
}

// ===== الكاش الداخلي مع TTL =====
let cache: CuratedEntry[] | null = null
let cacheLoadedAt = 0
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 دقائق

/**
 * يحوّل صفّ قاعدة البيانات إلى CuratedEntry مع JSON.parse آمن لحقل patterns.
 * عند فشل التحليل أو إن لم يكن مصفوفة، تُسقط المدخلة المعطوبة (تُعيد null).
 */
function mapRow(row: any): CuratedEntry | null {
  let patterns: unknown
  try {
    patterns = JSON.parse(row.patterns)
  } catch {
    return null // JSON غير صالح ⇒ إسقاط المدخلة المعطوبة فقط
  }
  if (!Array.isArray(patterns)) return null

  return {
    id: Number(row.id),
    category: row.category,
    patterns: patterns as string[],
    answer: row.answer,
    url: row.url ?? null,
    mode: row.mode,
    priority: Number(row.priority),
    active: row.active == 1,
  }
}

async function loadEntries(): Promise<CuratedEntry[]> {
  const now = Date.now()
  if (cache && now - cacheLoadedAt < CACHE_TTL_MS) return cache

  await ensureTable()
  await seed() // بذرة كسولة idempotent

  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, category, patterns, answer, url, mode, priority, active
     FROM curated_answers
     WHERE active = 1
     ORDER BY priority DESC, id ASC`
  )) as any

  cache = (rows as any[]).map(mapRow).filter(Boolean) as CuratedEntry[]
  cacheLoadedAt = now
  return cache
}

// ===== المطابقة =====
const MIN_LENGTH = 5 // نفس حارس الطول في searchFAQ الأصلية

/**
 * يطابق رسالة المستخدم مع مدخلة منسّقة (مرتّبة تنازلياً بالأولوية).
 * يُعيد أوّل مدخلة مطابِقة (الأعلى أولوية) أو null.
 */
export async function matchCurated(
  userMessage: string
): Promise<CuratedEntry | null> {
  const q = normalizeArabic(userMessage)
  if (!q || q.length < MIN_LENGTH) return null // تجاهل الرسائل القصيرة جداً

  const entries = await loadEntries() // مرتّبة تنازلياً حسب priority

  for (const entry of entries) {
    // أعلى أولوية أولاً ⇒ حتمية
    for (const pattern of entry.patterns) {
      const p = normalizeArabic(pattern)
      // تطابق حدود الكلمة (word-boundary) — نفس منطق faq.ts
      const regex = new RegExp(
        `(^|\\s)${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|\\s)`
      )
      if (regex.test(q)) return entry
    }
  }
  return null
}

/**
 * يُبطل الكاش الداخلي ليُعاد تحميله عند الطلب التالي (لوحة الإدارة مستقبلاً).
 */
export function refresh(): void {
  cache = null
  cacheLoadedAt = 0
}

// ============================================================================
// طبقة الإدارة (Admin CRUD) — إضافية وقابلة للعكس
// ----------------------------------------------------------------------------
// تُضاف دوال تحوير مُصدَّرة لخدمة لوحة الإدارة. الخدمة تملك SQL والكاش؛
// كل عملية كتابة ناجحة تنتهي بـ refresh() لإبطال كاش المطابقة فوراً.
// جميع الاستعلامات مُعامَلة (?) لمنع حقن SQL، وتُخزَّن patterns دائماً عبر
// JSON.stringify(string[]) (متّسق مع seed()). لا ALTER/DROP.
// ============================================================================

// ===== أنواع الإدخال والصفّ الكامل =====
/** حمولة الإنشاء القادمة من الـ API (بعد التحقّق). */
export interface CuratedInput {
  category: "faq" | "stance"
  patterns: string[]
  answer: string
  url?: string | null
  priority?: number
  active?: boolean
}

/** صفّ القائمة الكامل للوحة الإدارة (يشمل غير المفعّل + updated_at + note). */
export interface CuratedRow extends CuratedEntry {
  updated_at: string
  note?: string | null
}

/**
 * امتداد لـ mapRow القائم: يعيد نفس الحقول مضافاً إليها updated_at وnote،
 * ويحافظ على JSON.parse الآمن لحقل patterns (يُسقط الصفوف المعطوبة بإرجاع null).
 */
function mapRowFull(row: any): CuratedRow | null {
  let patterns: unknown
  try {
    patterns = JSON.parse(row.patterns)
  } catch {
    return null // JSON غير صالح ⇒ إسقاط المدخلة المعطوبة فقط
  }
  if (!Array.isArray(patterns)) return null

  return {
    id: Number(row.id),
    category: row.category,
    patterns: patterns as string[],
    answer: row.answer,
    url: row.url ?? null,
    mode: row.mode,
    priority: Number(row.priority),
    active: row.active == 1,
    updated_at: row.updated_at,
    note: row.note ?? null,
  }
}

/** مساعد داخلي: يعيد الصفّ الكامل بالمُعرّف أو null. */
async function getById(id: number): Promise<CuratedRow | null> {
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, category, patterns, answer, url, mode, priority, active,
            note, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
     FROM curated_answers WHERE id = ?`,
    [id]
  )) as any
  if (!rows.length) return null
  return mapRowFull(rows[0])
}

/**
 * يعيد كل المدخلات (المفعّلة وغير المفعّلة) لعرض لوحة الإدارة.
 * استعلام مباشر لا يمرّ بكاش المطابقة (الذي يفلتر active=1 فقط).
 * الترتيب: priority تنازلياً ثم updated_at تنازلياً.
 */
export async function listAll(): Promise<CuratedRow[]> {
  await ensureTable()
  await seed() // بذرة كسولة idempotent (متّسق مع loadEntries)
  const db = getPool()
  const [rows] = (await db.execute(
    `SELECT id, category, patterns, answer, url, mode, priority, active,
            note, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS updated_at
     FROM curated_answers
     ORDER BY priority DESC, updated_at DESC`
  )) as any
  return (rows as any[]).map(mapRowFull).filter(Boolean) as CuratedRow[]
}

/**
 * ينشئ مدخلة جديدة ويعيد صفّها الكامل بعد الإدراج. يستدعي refresh().
 * الشرط المسبق: input مُتحقَّق منه (patterns غير فارغة، answer غير فارغ).
 */
export async function create(input: CuratedInput): Promise<CuratedRow> {
  await ensureTable()
  const db = getPool()
  const [res] = (await db.execute(
    `INSERT INTO curated_answers (category, patterns, answer, url, priority, active)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.category,
      JSON.stringify(input.patterns), // string[] → JSON TEXT (متّسق مع seed)
      input.answer,
      input.url ?? null,
      input.priority ?? 0,
      input.active === false ? 0 : 1,
    ]
  )) as any
  refresh() // إبطال الكاش فوراً
  return (await getById(Number(res.insertId)))! // إعادة الصفّ الكامل
}

/**
 * يحدّث مدخلة قائمة بالمُعرّف (تحديث جزئي ديناميكي مُعامَل).
 * يعيد الصفّ المحدّث أو null إن لم يوجد المُعرّف. يستدعي refresh() بعد التحديث.
 */
export async function update(
  id: number,
  input: Partial<CuratedInput>
): Promise<CuratedRow | null> {
  const sets: string[] = []
  const vals: any[] = []
  if (input.category !== undefined) { sets.push("category = ?"); vals.push(input.category) }
  if (input.patterns !== undefined) { sets.push("patterns = ?"); vals.push(JSON.stringify(input.patterns)) }
  if (input.answer !== undefined) { sets.push("answer = ?"); vals.push(input.answer) }
  if (input.url !== undefined) { sets.push("url = ?"); vals.push(input.url ?? null) }
  if (input.priority !== undefined) { sets.push("priority = ?"); vals.push(input.priority) }
  if (input.active !== undefined) { sets.push("active = ?"); vals.push(input.active ? 1 : 0) }
  if (sets.length === 0) return getById(id) // لا تغيير

  const db = getPool()
  vals.push(id)
  await db.execute(
    `UPDATE curated_answers SET ${sets.join(", ")} WHERE id = ?`,
    vals // كل القيم عبر ? — لا سلاسل مُدمَجة
  )
  refresh()
  return getById(id)
}

/**
 * يضبط حالة التفعيل لمدخلة (اختصار شائع لزرّ التبديل).
 * يعيد الصفّ المحدّث أو null. يستدعي refresh().
 */
export async function setActive(
  id: number,
  active: boolean
): Promise<CuratedRow | null> {
  const db = getPool()
  await db.execute(
    `UPDATE curated_answers SET active = ? WHERE id = ?`,
    [active ? 1 : 0, id]
  )
  refresh()
  return getById(id)
}

/**
 * يحذف مدخلة بالمُعرّف. يعيد true إن حُذف صفّ فعلاً. يستدعي refresh().
 */
export async function remove(id: number): Promise<boolean> {
  const db = getPool()
  const [res] = (await db.execute(
    `DELETE FROM curated_answers WHERE id = ?`,
    [id]
  )) as any
  refresh()
  return res.affectedRows > 0
}
