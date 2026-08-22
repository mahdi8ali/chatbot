/**
 * lost-items-service.ts — سجلّ المفقودات (اللقطة) من جدول `lost_items`
 *
 * مصدر جديد أُضيف 2026-08-14: مستمسكات وهويات وجدتها العتبة العباسية المقدسة
 * وسجّلتها باسم صاحبها ليتعرّف عليها ويستردّها (٢٤,٤٤٧ صفّاً وقت الإضافة، كلّها
 * نشطة/غير محذوفة). تحقّقت من `lost_item_types` (36 صفّاً): "هوية أحوال"،
 * "بطاقة وطنية"، "جواز سفر"، "بطاقة سكن"... — تؤكّد أنه سجلّ **هويات ومستمسكات
 * مفقودة عُثر عليها**، لا أغراضاً عامة. الغرض من نشره أصلاً هو تعريف صاحبه به،
 * فالبحث باسم محدَّد هنا مطابق لغرض البيانات نفسه، لا كشف خصوصية إضافي — تماماً
 * كلوحة "لقطة" علنية معلَّقة، لا فرق سوى وسيلة البحث.
 *
 * ⚠️ **لا تصفّح جماعي أبداً**: الأداة تشترط اسماً غير فارغ دائماً؛ استعلام فارغ
 * يُرفض صراحةً (`success:false`) بدل إعادة أحدث/أعلى الصفوف كبقية الأدوات —
 * منعاً لكشف أسماء بالجملة عبر طلبات بلا نيّة بحث حقيقية.
 *
 * عمود `type` نصّ حرّ (لا معرّف قاطع من `lost_item_types` — ٢١٠٩٥/٢٤٤٤٧ فقط
 * تحمل `lost_item_type_id`)، وبعض القيم فيه "-" أو فارغة (تعني: نوع غير مسجَّل)
 * — تُحوَّل إلى null صراحة بدل عرضها حرفياً.
 */
import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

interface LostItemRow extends RowDataPacket {
  id: number
  name: string
  type: string | null
  city: string | null
  date: string | null
}

/** تطبيع عربي خفيف — نفس القواعد المعتمدة في publications-service.ts ونظائرها. */
function normalize(text: string): string {
  return text
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/ـ/g, "")
    .replace(/[أإآا]/g, "ا")
    .replace(/[ةه]/g, "ه")
    .replace(/[يى]/g, "ي")
    .toLowerCase()
    .trim()
}

/** يبني تعبير SQL يطبّع عموداً نصّياً بنفس قواعد normalize (ثوابت لا مُدخل مستخدم). */
function sqlNormalizeName(col: string): string {
  const pairs: [string, string][] = [
    ["ـ", ""], ["ً", ""], ["ٌ", ""], ["ٍ", ""], ["َ", ""], ["ُ", ""], ["ِ", ""], ["ّ", ""], ["ْ", ""],
    ["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"], ["ى", "ي"],
  ]
  let expr = col
  for (const [from, to] of pairs) expr = `REPLACE(${expr}, '${from}', '${to}')`
  return `LOWER(${expr})`
}

/** قيم "نوع" مهملة فعلياً في البيانات (غياب تسجيل حقيقي) — تُعرض كـnull لا حرفياً. */
function cleanType(t: string | null): string | null {
  const v = (t || "").trim()
  if (!v || v === "-") return null
  return v
}

/** قيمة مدينة مهملة ("بلا" = لا مدينة مسجَّلة) — تُعرض كـnull. */
function cleanCity(c: string | null): string | null {
  const v = (c || "").trim()
  if (!v || v === "بلا") return null
  return v
}

/** التاريخ مخزَّن DATETIME بإزاحة توقيت تُنتج ساعة UTC مضلِّلة — يكفي جزء التاريخ فقط. */
function formatDate(d: string | null): string | null {
  if (!d) return null
  const m = String(d).match(/^(\d{4}-\d{2}-\d{2})/)
  return m ? m[1] : null
}

const MIN_LIMIT = 1
const MAX_LIMIT = 15
const DEFAULT_LIMIT = 8

const SELECT_FIELDS = `SELECT id, name, type, city, date FROM lost_items`

/** ينفّذ طبقة بحث واحدة: صفوف معروضة (بحدّ LIMIT) + عدد حقيقي عبر COUNT(*). */
async function runTier(
  db: ReturnType<typeof getPool>,
  whereSql: string,
  whereParams: any[],
  orderSql: string,
  orderParams: any[],
  limit: number
): Promise<{ rows: LostItemRow[]; total: number }> {
  const [rows] = await db.execute<LostItemRow[]>(
    `${SELECT_FIELDS} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${limit}`,
    [...whereParams, ...orderParams]
  )
  const [countRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM lost_items WHERE ${whereSql}`,
    whereParams
  )
  return {
    rows: rows as LostItemRow[],
    total: Number((countRows as any[])[0]?.total ?? 0),
  }
}

/**
 * بحث في سجلّ المفقودات (اللقطة) باسم صاحب المستمسك، مع فلترة اختيارية بنوع
 * المستمسك (نصّ حرّ يُطابَق ضمن عمود `type`، مثال: "جواز سفر").
 *
 * يشترط اسماً غير فارغ دائماً (انظر تحذير أعلى الملف). خطوتان (نفس نمط
 * publications-service.ts/projects-db-service.ts): AND كل كلمات الاسم أولاً
 * (دقّة)، ثم OR عند الفراغ (الأسماء العربية تُكتب بترتيب/تشكيل متفاوت أحياناً).
 */
export async function searchLostItems(params: {
  query?: string
  itemType?: string
  limit?: number
}): Promise<APICallResult> {
  try {
    // ⚠️ حدّ أدنى 3 أحرف لا 2: فحص حيّ كشف أن توكن بحرفين مثل "لا" (أداة نفي
    // شائعة، لا اسم) يطابق كـLIKE %لا% أي اسم يحوي هذا التتابع الحرفي في أي
    // موضع (مثل "علاء")، فأعادت خطوة OR الاحتياطية 3,515 نتيجة "مطابقة" لاستعلام
    // كان يُفترض أن يكون بحثاً صريحاً عن اسم غير موجود إطلاقاً. أسماء عربية
    // مفردة حقيقية بحرفين نادرة جداً، فالتضييق هنا مكسبه أكبر من خسارته.
    const tokens = Array.from(
      new Set(normalize(params.query || "").split(/\s+/).filter(w => w.length >= 3))
    )
    if (tokens.length === 0) {
      return { success: false, error: "يلزم اسم (اسمان على الأقل) للبحث في سجلّ المفقودات" }
    }

    const db = getPool()
    const limit = Math.min(Math.max(params.limit || DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT)
    const nameNorm = sqlNormalizeName("name")
    const typeSql = params.itemType ? " AND type LIKE ?" : ""
    const typeParams = params.itemType ? [`%${params.itemType}%`] : []
    const baseWhere = "deleted_at IS NULL AND is_active = 1"

    // الخطوة ١: كل كلمات الاسم (AND) — دقّة عالية
    const andSql = tokens.map(() => `${nameNorm} LIKE ?`).join(" AND ")
    const andParams = tokens.map(t => `%${t}%`)
    let tier = await runTier(
      db,
      `${baseWhere} AND (${andSql})${typeSql}`,
      [...andParams, ...typeParams],
      "id DESC",
      [],
      limit
    )

    // الخطوة ٢: أيّ كلمة من الاسم (OR)، مرتّبة بعدد المطابقات ثم الأحدث
    if (tier.rows.length === 0) {
      const orSql = tokens.map(() => `${nameNorm} LIKE ?`).join(" OR ")
      const matchCount = tokens.map(() => `(${nameNorm} LIKE ?)`).join(" + ")
      const orParams = tokens.map(t => `%${t}%`)
      tier = await runTier(
        db,
        `${baseWhere} AND (${orSql})${typeSql}`,
        [...orParams, ...typeParams],
        `(${matchCount}) DESC, id DESC`,
        orParams, // مُستعملة في ORDER BY فقط — مفصولة عن whereParams عمداً
        limit
      )
    }

    const results = tier.rows.map(r => ({
      id: r.id,
      name: r.name?.trim() || "",
      document_type: cleanType(r.type),
      city: cleanCity(r.city),
      date: formatDate(r.date),
    }))

    return {
      success: true,
      data: { results, total: tier.total, returned: results.length, query: params.query || "" },
    }
  } catch (error: any) {
    console.error("[DB Error - searchLostItems]:", error?.message)
    return { success: false, error: "تعذّر البحث في سجلّ المفقودات" }
  }
}
