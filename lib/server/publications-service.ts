/**
 * publications-service.ts — الإصدارات والمطبوعات من جدولَي `publications` و `publication_categories`
 *
 * مصدر جديد أُضيف 2026-08-13: كتب ومجلات ودراسات تصدرها العتبة العباسية المقدسة
 * (٣,٤١٦ إصداراً وقت الإضافة — سلاسل: مناهل الطف، رياض الزهراء، عطاء الشباب،
 * منشورات المكتبة...). لم يكن لهذا المصدر أي أداة تصل إليه من قبل، فكانت أسئلة
 * مثل «هل يوجد كتاب عن سيرة العباس؟» تذهب إلى search_content فتفشل — القاعدتان
 * منفصلتان تماماً.
 *
 * ── ترشيح في SQL لا تحميل شامل في الذاكرة ────────────────────────────────
 * الجدول متوسط الحجم (٣,٤٠٠+ صفّ)، لكن اتّباعاً لدرس §11.2 في PROJECT-AUDIT.md
 * (تحميل news/video بالكامل في الذاكرة كان يكلّف ثوانٍ عند كل إقلاع بارد):
 * الترشيح هنا يقع في SQL دائماً، بلا أي كاش على مستوى الوحدة — كل استدعاء
 * استعلام مُعامَل (?) طازج، بنفس نمط places-service.ts/contacts-service.ts.
 *
 * ── روابط الملفات — مؤكَّدة من مالك المشروع 2026-08-13 ─────────────────────
 * أعمدة image/pdf/download_link تخزّن اسم الملف **مع امتداده الحقيقي** كما هو
 * («a31f46fd82.pdf»، «a855cc01de.zip»، «c798fbfe41.png»)، كلٌّ بمساره الخاص:
 *   image         → PUBLICATIONS_BASE/img/{filename}   (صورة الغلاف)
 *   pdf           → PUBLICATIONS_BASE/pdf/{filename}   (تصفّح مباشر)
 *   download_link → PUBLICATIONS_BASE/down/{filename}  (تحميل الأرشيف)
 * ⚠️ عمود image امتداده **غير ثابت** (تحقّق: 2,946 jpg + 439 png + 5 gif على
 * 3,390 صفّاً عربياً) — الملحق يأتي من القيمة المخزَّنة نفسها لا افتراضاً ثابتاً؛
 * أول عيّنة فحصتها (8 صفوف) أصابت jpg صدفةً فقط فظننتها القاعدة، والمثال
 * الحقيقي المُعطى (png) صحّح الافتراض قبل أن يُكتب أي كود عليه.
 */
const PUBLICATIONS_BASE = "https://alkafeel.net/publications"

/** يبني رابطاً كاملاً تحت PUBLICATIONS_BASE، أو null إن غاب اسم الملف. */
function publicationAssetUrl(segment: "img" | "pdf" | "down", filename: string | null): string | null {
  return filename ? `${PUBLICATIONS_BASE}/${segment}/${filename}` : null
}

import { RowDataPacket } from "mysql2/promise"
import { APICallResult, getPool } from "./db"

/**
 * الموجّه عربي فقط (SITE_BOT_SYSTEM_PROMPT بالكامل عربي)، والجدولان متعدّدا
 * اللغة فعلياً — تحقّقت من جدول `languages`: id=1 هو العربية.
 *  - publications.language_id = 1 دائماً للعربية (0 صفّ NULL من 3,416).
 *  - publication_categories.language_id **يساوي NULL** للسلاسل العربية الأصلية
 *    (35 سلسلة)، بينما الترجمات (تركية/أردية/فرنسية...) تحمل أرقاماً >1 صريحة.
 * بلا هذا الفلتر كانت التصنيفات تعود مختلطة بلغات متعددة — خلل اكتُشف بالفحص
 * الحيّ فور بناء الخدمة، لا بالتخمين.
 */
const ARABIC_LANGUAGE_ID = 1

/**
 * ⚠️ رقم العدد الحقيقي يعيش في عمود `version` منفصل تماماً عن `title` — لا
 * علاقة نصّية بينهما. اكتُشف بعد إصلاح أول (بحث نصّي فقط في العنوان) اتّضح
 * خاطئاً أيضاً: طلب المستخدم "العدد ٥٠ من مجلة الرياحين" فأعاد النظام "العدد
 * ١٧٥" بثقة كاملة (بحث OR طابق "رياحين"/"العدد" نصّياً وتجاهل الرقم كلياً).
 * الإصلاح الأول (رفض أي نتيجة OR لا يحوي عنوانها الرقم حرفياً) أصلح خلل
 * الجواب الخاطئ لكنه **رفض طلبات صحيحة فعلاً** أيضاً، لأن أغلب العناوين بعد
 * أول ~20-27 عدداً عناوين عامّة بلا رقم في النصّ إطلاقاً (مثل "مجلة الرياحين"
 * فقط) — فحصت العمود مباشرة: `id=847` عنوانه "مجلة الرياحين" (بلا رقم بالنص)
 * لكن `version="50"` — وهو الصفّ الصحيح الذي كان يجب إرجاعه من البداية.
 * فالمطابقة الصحيحة لرقم عدد صريح تكون عبر `p.version = ?` حصراً، لا عبر
 * البحث النصّي في العنوان بأي شكل.
 */
const DIGIT_TOKEN_RE = /^[0-9٠-٩]+$/
const ARABIC_INDIC_DIGITS = "٠١٢٣٤٥٦٧٨٩"

/** يحوّل أرقاماً هندية عربية إلى غربية لمطابقة عمود `version` (يخزّن أرقاماً غربية). */
function toWesternDigits(s: string): string {
  return s.replace(/[٠-٩]/g, d => String(ARABIC_INDIC_DIGITS.indexOf(d)))
}

interface PublicationRow extends RowDataPacket {
  id: number
  title: string
  version: string | null
  date: string | null
  size: string | null
  views: number
  image: string | null
  pdf: string | null
  download_link: string | null
  category_title: string | null
}

interface CategoryRow extends RowDataPacket {
  id: number
  title: string
  detail: string | null
  sort: number
  count: number
}

/** تطبيع عربي خفيف — نفس القواعد المعتمدة في projects-db-service.ts/contacts-service.ts. */
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
function sqlNormalizeTitle(col: string): string {
  const pairs: [string, string][] = [
    ["ـ", ""], ["ً", ""], ["ٌ", ""], ["ٍ", ""], ["َ", ""], ["ُ", ""], ["ِ", ""], ["ّ", ""], ["ْ", ""],
    ["أ", "ا"], ["إ", "ا"], ["آ", "ا"], ["ة", "ه"], ["ى", "ي"],
  ]
  let expr = col
  for (const [from, to] of pairs) expr = `REPLACE(${expr}, '${from}', '${to}')`
  return `LOWER(${expr})`
}

const MIN_LIMIT = 1
const MAX_LIMIT = 20
const DEFAULT_LIMIT = 8

const SELECT_JOIN = `
  SELECT p.id, p.title, p.version, p.date, p.size, p.views, p.image, p.pdf, p.download_link,
         pc.title AS category_title
  FROM publications p
  LEFT JOIN publication_categories pc ON pc.id = p.publication_category_id
`

/**
 * ينفّذ طبقة بحث واحدة: يُرجع الصفوف المعروضة (بحدّ LIMIT) **و** العدد
 * الحقيقي الكامل عبر COUNT(*) بنفس شرط WHERE بمعزل عن LIMIT.
 *
 * ⚠️ سبب وجود هذه الدالة: كان `total: results.length` — أي طول المصفوفة
 * المُقتَصّة بـ LIMIT (8 افتراضياً) — لا العدد الحقيقي. سؤال «كم عدد
 * الإصدارات لدينا؟» أعاد نتائج (8 صفوف) لكن `total` بدا مطابقاً للـ limit
 * تحديداً، فرفض النموذج (محقّاً) اعتماده كعدد حقيقي وردّ بـ«لا تتوفر معلومات»
 * — نفس فصيلة خلل «العدد المضلّل» في §11.2/§7 (search_content.total)،
 * أُعيد إنتاجه هنا سهواً. whereSql/whereParams لا يشملان ORDER BY حتى تبقى
 * معاملات COUNT(*) مطابقة تماماً لمعاملات WHERE بلا تلوّث من معاملات الترتيب.
 */
async function runTier(
  db: ReturnType<typeof getPool>,
  whereSql: string,
  whereParams: any[],
  orderSql: string,
  orderParams: any[],
  limit: number
): Promise<{ rows: PublicationRow[]; total: number }> {
  const [rows] = await db.execute<PublicationRow[]>(
    `${SELECT_JOIN} WHERE ${whereSql} ORDER BY ${orderSql} LIMIT ${limit}`,
    [...whereParams, ...orderParams]
  )
  const [countRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*) AS total FROM publications p WHERE ${whereSql}`,
    whereParams
  )
  return {
    rows: rows as PublicationRow[],
    total: Number((countRows as any[])[0]?.total ?? 0),
  }
}

/**
 * بحث في الإصدارات بعنوانها (أو برقم عددها الصريح عبر `version`)، مع فلترة
 * اختيارية بالتصنيف.
 *
 * **رقم عدد صريح** ("العدد 50")؛ توكن رقمي واحد بالضبط ⇒ مطابقة **حصراً**
 * عبر `p.version = ?` (لا العنوان — انظر شرح `DIGIT_TOKEN_RE` أعلاه)، مع
 * تضييق اختياري ببقية الكلمات (اسم السلسلة) إن وُجدت. لا سقوط إلى بحث نصّي
 * إن لم يُعثر على الرقم: نتيجة فارغة صادقة أفضل من عدد مختلف بثقة زائفة.
 *
 * **بلا رقم صريح (أو أكثر من رقم واحد — حالة نادرة/غامضة)**: خطوتان (نفس
 * نمط searchProjectsDB في projects-db-service.ts):
 *  ١. **كل** كلمات الاستعلام (AND) — دقيق، وكافٍ حين تقارب صياغة المستخدم
 *     عنوان الإصدار الفعلي.
 *  ٢. عند فراغ الخطوة الأولى: **أيّ** كلمة (OR) مرتّبة بعدد الكلمات المطابقة
 *     ثم المشاهدات. اكتُشفت الحاجة إليها بفحص حيّ: "سيرة أبي الفضل العباس" لم
 *     تُطابق أي عنوان بالضبط (AND على 4 كلمات) رغم وجود **10 إصدارات** حقيقية
 *     عن العباس (عليه السلام) بعناوين لا تحوي كلمة "سيرة" حرفياً.
 */
export async function searchPublications(params: {
  query?: string
  categoryId?: number
  limit?: number
}): Promise<APICallResult> {
  try {
    const db = getPool()
    const limit = Math.min(Math.max(params.limit || DEFAULT_LIMIT, MIN_LIMIT), MAX_LIMIT)

    const tokens = Array.from(
      new Set(normalize(params.query || "").split(/\s+/).filter(w => w.length >= 2))
    )
    const digitTokens = tokens.filter(t => DIGIT_TOKEN_RE.test(t))
    const nonDigitTokens = tokens.filter(t => !DIGIT_TOKEN_RE.test(t))
    const titleNorm = sqlNormalizeTitle("p.title")
    const categorySql = params.categoryId ? " AND p.publication_category_id = ?" : ""
    const categoryParams = params.categoryId ? [params.categoryId] : []
    const baseWhere = "p.deleted_at IS NULL AND p.language_id = ?"

    let tier: { rows: PublicationRow[]; total: number }

    if (digitTokens.length === 1) {
      // رقم عدد صريح واحد ⇒ مطابقة دقيقة عبر version، لا تخمين نصّي إطلاقاً
      const versionValue = toWesternDigits(digitTokens[0])
      if (nonDigitTokens.length > 0) {
        // تضييق بالسلسلة (اسمها) لتمييزها عن سلاسل أخرى تشارك نفس رقم العدد
        const seriesOr = nonDigitTokens.map(() => `${titleNorm} LIKE ?`).join(" OR ")
        const seriesMatchCount = nonDigitTokens.map(() => `(${titleNorm} LIKE ?)`).join(" + ")
        const seriesParams = nonDigitTokens.map(t => `%${t}%`)
        tier = await runTier(
          db,
          `${baseWhere} AND p.version = ? AND (${seriesOr})${categorySql}`,
          [ARABIC_LANGUAGE_ID, versionValue, ...seriesParams, ...categoryParams],
          `(${seriesMatchCount}) DESC, p.views DESC`,
          seriesParams,
          limit
        )
      } else {
        // رقم بلا اسم سلسلة ("العدد 50" فقط) — كل سلسلة تحمل هذا الرقم مرشّحة
        tier = await runTier(
          db,
          `${baseWhere} AND p.version = ?${categorySql}`,
          [ARABIC_LANGUAGE_ID, versionValue, ...categoryParams],
          "p.views DESC",
          [],
          limit
        )
      }
      // لا سقوط إلى AND/OR النصّي عمداً — إعادة إحياء نفس خلل "عدد مختلف بثقة".
    } else if (tokens.length > 0) {
      // الخطوة ١: كل الكلمات (AND) — دقّة عالية
      const andSql = tokens.map(() => `${titleNorm} LIKE ?`).join(" AND ")
      const andParams = tokens.map(t => `%${t}%`)
      tier = await runTier(
        db,
        `${baseWhere} AND (${andSql})${categorySql}`,
        [ARABIC_LANGUAGE_ID, ...andParams, ...categoryParams],
        "p.views DESC",
        [],
        limit
      )

      // الخطوة ٢: أيّ كلمة (OR)، مرتّبة بعدد المطابقات ثم المشاهدات
      if (tier.rows.length === 0) {
        const orSql = tokens.map(() => `${titleNorm} LIKE ?`).join(" OR ")
        const matchCount = tokens.map(() => `(${titleNorm} LIKE ?)`).join(" + ")
        const orParams = tokens.map(t => `%${t}%`)
        tier = await runTier(
          db,
          `${baseWhere} AND (${orSql})${categorySql}`,
          [ARABIC_LANGUAGE_ID, ...orParams, ...categoryParams],
          `(${matchCount}) DESC, p.views DESC`,
          orParams, // مُستعملة في ORDER BY فقط — مفصولة عن whereParams عمداً
          limit
        )

        // ≥2 رقم صريح غامض (حالة نادرة): نفس منطق الحماية — لا عدد بديل واثق
        if (digitTokens.length > 0) {
          const matchingRows = tier.rows.filter(r =>
            digitTokens.some(d => (r.title || "").includes(d))
          )
          tier = matchingRows.length === tier.rows.length
            ? tier
            : { rows: matchingRows, total: matchingRows.length }
        }
      }
    } else {
      // بلا كلمات بحث (فلتر تصنيف فقط، أو لا فلاتر إطلاقاً)
      tier = await runTier(
        db,
        `${baseWhere}${categorySql}`,
        [ARABIC_LANGUAGE_ID, ...categoryParams],
        "p.views DESC",
        [],
        limit
      )
    }

    const results = tier.rows.map(r => ({
      id: r.id,
      title: r.title,
      // `version` ليس دائماً رقماً نظيفاً — بعض الصفوف تخزّن نصّاً غير رقمي فيه
      // (مثال حيّ: "عش السلام" بدل رقم). لا نعرضه كـissue_number إلا إن كان
      // رقماً صرفاً، تفادياً لجواب مثل "رقم العدد: عش السلام" بلا معنى.
      issue_number: r.version && /^[0-9]+$/.test(r.version) ? r.version : null,
      category: r.category_title || "غير مصنّف",
      date: r.date || null,
      size: r.size || null,
      views: r.views || 0,
      image_url: publicationAssetUrl("img", r.image),
      pdf_url: publicationAssetUrl("pdf", r.pdf),
      download_url: publicationAssetUrl("down", r.download_link),
    }))

    return {
      success: true,
      // total عدد حقيقي (COUNT(*) بمعزل عن LIMIT) — لا طول results.
      data: { results, total: tier.total, returned: results.length, query: params.query || "" },
    }
  } catch (error: any) {
    console.error("[DB Error - searchPublications]:", error?.message)
    return { success: false, error: "تعذّر البحث في قاعدة الإصدارات" }
  }
}

/** قائمة سلاسل/تصنيفات الإصدارات مع عدد كل سلسلة. */
export async function getPublicationCategories(): Promise<APICallResult> {
  try {
    const db = getPool()
    const [rows] = await db.execute<CategoryRow[]>(
      `SELECT pc.id, pc.title, pc.detail, pc.sort,
              COUNT(p.id) AS count
       FROM publication_categories pc
       LEFT JOIN publications p
         ON p.publication_category_id = pc.id
         AND p.deleted_at IS NULL AND p.language_id = ?
       WHERE pc.deleted_at IS NULL AND pc.language_id IS NULL
       GROUP BY pc.id, pc.title, pc.detail, pc.sort
       ORDER BY pc.sort ASC`,
      [ARABIC_LANGUAGE_ID]
    )
    const categories = (rows as CategoryRow[]).map(r => ({
      id: r.id,
      title: (r.title || "").trim(),
      detail: r.detail || null,
      count: Number(r.count) || 0,
    }))
    return { success: true, data: { categories, total: categories.length } }
  } catch (error: any) {
    console.error("[DB Error - getPublicationCategories]:", error?.message)
    return { success: false, error: "تعذّر جلب تصنيفات الإصدارات" }
  }
}
