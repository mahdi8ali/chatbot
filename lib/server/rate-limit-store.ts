/**
 * rate-limit-store.ts — حدّ معدّل **مشترك** مدعوم بقاعدة البيانات.
 *
 * ── لماذا ──────────────────────────────────────────────────────────────────
 * `rate-limiter.ts` يحفظ العدّادات في `Map` داخل ذاكرة العملية. هذا يعني:
 *  • كل instance له عدّاده الخاص ⇒ الحدّ الفعلي = الحدّ × عدد الـ instances.
 *  • العدّاد يصفّر مع كل إعادة تشغيل أو إقلاع بارد.
 * ونقطة `/api/chat/site` عامّة وكل طلب فيها يكلّف استدعاءات OpenAI — فالحماية
 * الوهمية هنا تعني تعرّضاً مباشراً لاستنزاف الرصيد.
 *
 * ── التصميم ────────────────────────────────────────────────────────────────
 * نافذة ثابتة (fixed window) في جدول واحد بمفتاح (المفتاح، بداية النافذة):
 * كتابة واحدة مُفهرسة لكل طلب (~1–5ms) مقابل استدعاء نموذج يستغرق ثوانٍ —
 * كلفة مقبولة تماماً في هذا السياق.
 *
 * **تدهور آمن**: أي فشل في قاعدة البيانات ⇒ يُسمح بالطلب (لا نُسقط الخدمة من
 * أجل العدّاد)، ويبقى الحدّ في الذاكرة خطّ دفاع أول قائماً في rate-limiter.ts.
 */

import { getLogsPool } from "./logs-db"

let tableReady = false

async function ensureTable(): Promise<void> {
  if (tableReady) return
  await getLogsPool().execute(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      limit_key    VARCHAR(190) NOT NULL,
      window_start BIGINT UNSIGNED NOT NULL,
      hits         INT NOT NULL DEFAULT 0,
      updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (limit_key, window_start),
      INDEX idx_window (window_start)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `)
  tableReady = true
}

export interface SharedLimitResult {
  allowed: boolean
  hits: number
  retryAfter?: number
  /** تعذّر الوصول لقاعدة البيانات ⇒ سُمح بالطلب (تدهور آمن). */
  degraded?: boolean
}

/**
 * يزيد عدّاد المفتاح ضمن النافذة الحالية ويقرّر السماح.
 *
 * @param key      مفتاح التحديد (IP أو جلسة).
 * @param limit    أقصى عدد طلبات ضمن النافذة.
 * @param windowMs طول النافذة بالمللي ثانية.
 */
export async function hitSharedLimit(
  key: string,
  limit: number,
  windowMs: number
): Promise<SharedLimitResult> {
  try {
    await ensureTable()
    const db = getLogsPool()
    const windowStart = Math.floor(Date.now() / windowMs) * windowMs

    // إدراج/زيادة ذرّية — لا حاجة لقراءة ثم كتابة (تفادي سباق التزامن)
    await db.execute(
      `INSERT INTO rate_limits (limit_key, window_start, hits)
       VALUES (?, ?, 1)
       ON DUPLICATE KEY UPDATE hits = hits + 1`,
      [key.slice(0, 190), windowStart]
    )

    const [rows] = (await db.execute(
      `SELECT hits FROM rate_limits WHERE limit_key = ? AND window_start = ?`,
      [key.slice(0, 190), windowStart]
    )) as any
    const hits = Number(rows?.[0]?.hits ?? 0)

    if (hits > limit) {
      const retryAfter = Math.ceil((windowStart + windowMs - Date.now()) / 1000)
      return { allowed: false, hits, retryAfter: Math.max(retryAfter, 1) }
    }
    return { allowed: true, hits }
  } catch (err) {
    // تدهور آمن: لا نمنع المستخدمين لأن جدول العدّادات تعذّر
    console.error("[RateLimit] فشل المخزن المشترك — سُمح بالطلب:", err)
    return { allowed: true, hits: 0, degraded: true }
  }
}

/** تنظيف النوافذ المنتهية (رخيص بفضل الفهرس على window_start). */
export async function cleanupSharedLimits(olderThanMs: number = 3600_000): Promise<void> {
  try {
    await ensureTable()
    const [res] = (await getLogsPool().execute(
      `DELETE FROM rate_limits WHERE window_start < ?`,
      [Date.now() - olderThanMs]
    )) as any
    if (res?.affectedRows > 0) {
      console.log(`[RateLimit] نُظّفت ${res.affectedRows} نافذة منتهية`)
    }
  } catch (err) {
    console.error("[RateLimit] فشل تنظيف النوافذ:", err)
  }
}

// تنظيف دوري — بدونه ينمو جدول rate_limits بلا حدّ (صفّ لكل IP لكل دقيقة).
// unref(): لا يُبقي حلقة الأحداث حيّة من أجل هذا المؤقّت وحده — نفس درس
// rate-limiter.ts الذي كان يُعلّق `npm test` للأبد.
const CLEANUP_EVERY_MS = 30 * 60 * 1000
const cleanupTimer = setInterval(() => {
  void cleanupSharedLimits()
}, CLEANUP_EVERY_MS)
if (typeof (cleanupTimer as any)?.unref === "function") {
  ;(cleanupTimer as any).unref()
}
