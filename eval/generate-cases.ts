/**
 * generate-cases.ts — مولّد المجموعة الذهبية (golden set) من بيانات حقيقية.
 *
 * يُشغَّل **مرّة عند الحاجة** لتوليد `eval/cases/*.json` ثم تُودَع النتيجة في Git
 * لتكون المجموعة ثابتة وقابلة لإعادة الإنتاج (لا تتغيّر بين تشغيلين فتفسد المقارنة).
 *
 * نوعا الحالات:
 *  (أ) known-items — «بحث العنصر المعروف»: نختار مستنداً حقيقياً، ونشتقّ استعلاماً
 *      من كلمات عنوانه المميّزة، ونتوقّع عودة **معرّفه بالذات** ضمن أفضل K.
 *      هذا مقياس استرجاع موضوعي لا يحتاج وسماً بشرياً، وهو بالضبط ما ينحدر إن
 *      كُسر البحث.
 *  (ب) user-queries — أسئلة مستخدمين حقيقية من `chat_logs` (منظّفة من PII أصلاً
 *      عبر chat-logger.sanitizePII). لا نملك لها إجابة مرجعية، فنقيس عليها
 *      «عدم الفراغ» و**اتفاق المحرّكين** — وهو ما يكشف الانحدار عند تبديل المحرّك.
 *
 * الاستخدام:  npx ts-node --compiler-options '{"module":"commonjs"}' eval/generate-cases.ts
 */

import fs from "fs"
import path from "path"
import mysql from "mysql2/promise"

// ── تحميل .env.local يدوياً (ts-node لا يحمّله) ─────────────────────────────
const envPath = path.join(__dirname, "..", ".env.local")
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
}

const OUT_DIR = path.join(__dirname, "cases")

/** كلمات شائعة لا تصلح كتمييز في استعلام «العنصر المعروف». */
const STOP = new Set([
  "في", "من", "على", "عن", "الى", "إلى", "مع", "بين", "التي", "الذي", "هذا", "هذه",
  "العتبة", "العباسية", "المقدسة", "قسم", "شعبة", "وحدة", "خلال", "بعد", "قبل",
  "يوم", "أيام", "سنة", "عام", "ضمن", "كما", "أن", "إن", "قد", "ما", "لا", "ال",
])

/** ينتقي أطول 3 كلمات مميّزة من عنوان لبناء استعلام «العنصر المعروف». */
function distinctiveWords(title: string, n = 3): string[] {
  return (title || "")
    .replace(/[^؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .map(w => w.trim())
    .filter(w => w.length >= 4 && !STOP.has(w))
    .sort((a, b) => b.length - a.length)
    .slice(0, n)
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })

  const base = {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  }

  // ── (أ) known-items من الأخبار ────────────────────────────────────────────
  const content = await mysql.createConnection({ ...base, database: process.env.DB_NAME })

  // عيّنة حتمية (ORDER BY id, وخطوة ثابتة) لا عشوائية — كي تُعاد إنتاجها بالضبط.
  const [newsRows] = await content.query<any[]>(
    `SELECT id, title FROM news
     WHERE active = 1 AND deleted_at IS NULL AND CHAR_LENGTH(title) BETWEEN 40 AND 160
     ORDER BY id DESC LIMIT 400`
  )

  const known: any[] = []
  for (let i = 0; i < newsRows.length && known.length < 40; i += 7) {
    const row = newsRows[i]
    const words = distinctiveWords(row.title)
    if (words.length < 2) continue
    known.push({
      id: `news-${row.id}`,
      source: "news",
      query: words.join(" "),
      expectId: String(row.id),
      title: row.title,
    })
  }

  // ── known-items من الفيديو ────────────────────────────────────────────────
  const [videoRows] = await content.query<any[]>(
    `SELECT id, JSON_UNQUOTE(JSON_EXTRACT(title,'$.ar')) AS t FROM video_files
     WHERE active = 1 AND deleted_at IS NULL
       AND CHAR_LENGTH(JSON_UNQUOTE(JSON_EXTRACT(title,'$.ar'))) BETWEEN 30 AND 140
     ORDER BY id DESC LIMIT 200`
  )
  for (let i = 0; i < videoRows.length && known.length < 55; i += 13) {
    const row = videoRows[i]
    const words = distinctiveWords(row.t)
    if (words.length < 2) continue
    known.push({
      id: `video-${row.id}`,
      source: "video",
      query: words.join(" "),
      expectId: `video_${row.id}`,
      title: row.t,
    })
  }
  await content.end()

  // ── known-items من المشاريع ───────────────────────────────────────────────
  const proj = await mysql.createConnection({
    ...base,
    database: process.env.PROJECTS_DB_NAME || "alkafeel_projects",
  })
  const [projRows] = await proj.query<any[]>(
    `SELECT id, name FROM projects WHERE deleted_at IS NULL AND CHAR_LENGTH(name) >= 12 ORDER BY id LIMIT 120`
  )
  for (let i = 0; i < projRows.length && known.length < 70; i += 8) {
    const row = projRows[i]
    const words = distinctiveWords(row.name, 2)
    if (words.length < 1) continue
    known.push({
      id: `project-${row.id}`,
      source: "project",
      query: words.join(" "),
      expectId: String(row.id),
      title: row.name,
    })
  }
  await proj.end()

  fs.writeFileSync(
    path.join(OUT_DIR, "known-items.json"),
    JSON.stringify(known, null, 2) + "\n",
    "utf8"
  )
  console.log(`✅ known-items.json — ${known.length} حالة`)

  // ── (ب) user-queries من سجلّات المحادثات الحقيقية ─────────────────────────
  const logs = await mysql.createConnection({
    ...base,
    database: process.env.LOGS_DB_NAME || process.env.PROJECTS_DB_NAME,
  })
  const [qRows] = await logs.query<any[]>(
    `SELECT DISTINCT user_question, tool_called
     FROM chat_logs
     WHERE user_question IS NOT NULL AND CHAR_LENGTH(user_question) BETWEEN 8 AND 120
     ORDER BY user_question`
  )
  await logs.end()

  const seen = new Set<string>()
  const userQueries = qRows
    .map(r => ({ query: String(r.user_question).trim(), tool: r.tool_called }))
    .filter(r => {
      const k = r.query.replace(/\s+/g, " ")
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    .map((r, i) => ({ id: `user-${i + 1}`, query: r.query, historicalTool: r.tool }))

  fs.writeFileSync(
    path.join(OUT_DIR, "user-queries.json"),
    JSON.stringify(userQueries, null, 2) + "\n",
    "utf8"
  )
  console.log(`✅ user-queries.json — ${userQueries.length} سؤال حقيقي`)
}

main().then(() => process.exit(0)).catch(e => {
  console.error("فشل التوليد:", e)
  process.exit(1)
})
