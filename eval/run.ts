/**
 * run.ts — عدّاء التقييم (harness) لجودة الاسترجاع.
 *
 * لا يستدعي OpenAI إطلاقاً: يقيس **طبقة الاسترجاع** مباشرةً عبر siteSearch،
 * وهي الطبقة التي تنحدر عند تبديل محرّك البحث. سريع، حتمي، وبلا كلفة.
 *
 * المقاييس:
 *  • known-items → recall@1 / @5 / @10 و MRR (بحث العنصر المعروف — مرجع موضوعي)
 *  • user-queries → نسبة النتائج غير الفارغة + بصمة أفضل ٥ معرّفات لكل سؤال
 *    (تُقارَن بين المحرّكين لكشف أي تغيّر في الترتيب)
 *  • total → يُرصد للكشف عن الأعداد المضلّلة (مثل 32,070 مطابقة لسؤال بسيط)
 *
 * الاستخدام:
 *   npm run eval                      تشغيل وطباعة تقرير
 *   npm run eval -- --save baseline   حفظ لقطة للمقارنة لاحقاً
 *   npm run eval -- --compare baseline   مقارنة بلقطة محفوظة (يفشل عند الانحدار)
 */

import fs from "fs"
import path from "path"

// ── تحميل .env.local قبل أي استيراد يلمس قاعدة البيانات ───────────────────
const envPath = path.join(__dirname, "..", ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

import { siteSearch } from "../lib/server/site-api-service"

const CASES_DIR = path.join(__dirname, "cases")
const SNAP_DIR = path.join(__dirname, "snapshots")

interface KnownCase {
  id: string
  source: string
  query: string
  expectId: string
  title: string
}
interface UserCase {
  id: string
  query: string
  historicalTool: string | null
}

interface Report {
  engine: string
  generatedAt: string
  known: {
    n: number
    recallAt1: number
    recallAt5: number
    recallAt10: number
    mrr: number
    misses: Array<{ id: string; query: string; title: string }>
  }
  user: {
    n: number
    nonEmptyRate: number
    medianTotal: number
    maxTotal: number
    inflatedTotals: number // عدد الأسئلة التي أعادت total > 1000 (مؤشّر عدّ مضلّل)
  }
  /** بصمة الترتيب: أفضل ٥ معرّفات لكل سؤال — أساس مقارنة المحرّكات. */
  fingerprints: Record<string, string[]>
  timingMs: number
}

const pct = (x: number) => (x * 100).toFixed(1) + "%"

function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}

async function runSearch(query: string, limit: number) {
  const r = await siteSearch(query, undefined, limit)
  const results = (r.data?.results as any[]) || []
  return { ids: results.map(x => String(x.id)), total: Number(r.data?.total ?? 0) }
}

async function main() {
  const args = process.argv.slice(2)
  const saveIdx = args.indexOf("--save")
  const compareIdx = args.indexOf("--compare")
  const saveName = saveIdx >= 0 ? args[saveIdx + 1] : null
  const compareName = compareIdx >= 0 ? args[compareIdx + 1] : null

  // ⚠️ يجب أن يطابق تعريف الافتراضي في searchEngineMode() بـ site-api-service.ts
  // بالضبط. كانا يتباعدان: هنا الافتراضي "memory" وهناك "db" — فطُبعت لقطات
  // بتسمية "memory" بينما siteSearch() كانت تعمل فعلياً بمحرّك "db"، ما جعل
  // مقارنات لاحقة تُقرأ خطأً كـ"memory → memory" رغم أن التنفيذ الفعلي مختلف.
  const engine = process.env.SEARCH_ENGINE === "memory" ? "memory" : "db"
  const known: KnownCase[] = JSON.parse(
    fs.readFileSync(path.join(CASES_DIR, "known-items.json"), "utf8")
  )
  const users: UserCase[] = JSON.parse(
    fs.readFileSync(path.join(CASES_DIR, "user-queries.json"), "utf8")
  )

  console.log(`\n🔬 تقييم الاسترجاع — المحرّك: \x1b[1m${engine}\x1b[0m`)
  console.log(`   ${known.length} حالة عنصر معروف + ${users.length} سؤال حقيقي\n`)

  const t0 = Date.now()

  // ── known-items ──────────────────────────────────────────────────────────
  let hit1 = 0, hit5 = 0, hit10 = 0, rrSum = 0
  const misses: Report["known"]["misses"] = []
  for (const c of known) {
    const { ids } = await runSearch(c.query, 10)
    const rank = ids.indexOf(c.expectId) // 0-based
    if (rank === 0) hit1++
    if (rank >= 0 && rank < 5) hit5++
    if (rank >= 0 && rank < 10) hit10++
    if (rank >= 0) rrSum += 1 / (rank + 1)
    else misses.push({ id: c.id, query: c.query, title: c.title.slice(0, 70) })
  }

  // ── user-queries ─────────────────────────────────────────────────────────
  let nonEmpty = 0
  let inflated = 0
  const totals: number[] = []
  const fingerprints: Record<string, string[]> = {}
  for (const c of users) {
    const { ids, total } = await runSearch(c.query, 5)
    if (ids.length > 0) nonEmpty++
    if (total > 1000) inflated++
    totals.push(total)
    fingerprints[c.id] = ids
  }

  const report: Report = {
    engine,
    generatedAt: new Date().toISOString(),
    known: {
      n: known.length,
      recallAt1: hit1 / known.length,
      recallAt5: hit5 / known.length,
      recallAt10: hit10 / known.length,
      mrr: rrSum / known.length,
      misses,
    },
    user: {
      n: users.length,
      nonEmptyRate: nonEmpty / users.length,
      medianTotal: median(totals),
      maxTotal: Math.max(...totals, 0),
      inflatedTotals: inflated,
    },
    fingerprints,
    timingMs: Date.now() - t0,
  }

  // ── التقرير ──────────────────────────────────────────────────────────────
  console.log("── بحث العنصر المعروف (الاسترجاع) ──")
  console.log(`   recall@1  : ${pct(report.known.recallAt1)}`)
  console.log(`   recall@5  : ${pct(report.known.recallAt5)}`)
  console.log(`   recall@10 : ${pct(report.known.recallAt10)}`)
  console.log(`   MRR       : ${report.known.mrr.toFixed(3)}`)
  console.log(`   إخفاقات   : ${misses.length}`)
  console.log("\n── أسئلة المستخدمين الحقيقية ──")
  console.log(`   نتائج غير فارغة : ${pct(report.user.nonEmptyRate)}`)
  console.log(`   وسيط total      : ${report.user.medianTotal}`)
  console.log(`   أقصى total      : ${report.user.maxTotal}`)
  console.log(`   أعداد منتفخة (>1000) : ${report.user.inflatedTotals}/${report.user.n}`)
  console.log(`\n   الزمن: ${(report.timingMs / 1000).toFixed(1)}s\n`)

  // ── الحفظ ────────────────────────────────────────────────────────────────
  if (saveName) {
    fs.mkdirSync(SNAP_DIR, { recursive: true })
    const p = path.join(SNAP_DIR, `${saveName}.json`)
    fs.writeFileSync(p, JSON.stringify(report, null, 2) + "\n", "utf8")
    console.log(`💾 حُفظت اللقطة: eval/snapshots/${saveName}.json\n`)
  }

  // ── المقارنة ─────────────────────────────────────────────────────────────
  if (compareName) {
    const p = path.join(SNAP_DIR, `${compareName}.json`)
    if (!fs.existsSync(p)) {
      console.error(`❌ لا توجد لقطة باسم "${compareName}"`)
      process.exit(1)
    }
    const base: Report = JSON.parse(fs.readFileSync(p, "utf8"))
    const d = (a: number, b: number) => {
      const diff = a - b
      const sign = diff > 0 ? "+" : ""
      const color = diff < -0.001 ? "\x1b[31m" : diff > 0.001 ? "\x1b[32m" : "\x1b[90m"
      return `${color}${sign}${(diff * 100).toFixed(1)}pp\x1b[0m`
    }

    console.log(`── المقارنة مع "${compareName}" (${base.engine} → ${report.engine}) ──`)
    console.log(`   recall@1  : ${pct(base.known.recallAt1)} → ${pct(report.known.recallAt1)}  ${d(report.known.recallAt1, base.known.recallAt1)}`)
    console.log(`   recall@5  : ${pct(base.known.recallAt5)} → ${pct(report.known.recallAt5)}  ${d(report.known.recallAt5, base.known.recallAt5)}`)
    console.log(`   recall@10 : ${pct(base.known.recallAt10)} → ${pct(report.known.recallAt10)}  ${d(report.known.recallAt10, base.known.recallAt10)}`)
    console.log(`   MRR       : ${base.known.mrr.toFixed(3)} → ${report.known.mrr.toFixed(3)}`)
    console.log(`   غير فارغة : ${pct(base.user.nonEmptyRate)} → ${pct(report.user.nonEmptyRate)}  ${d(report.user.nonEmptyRate, base.user.nonEmptyRate)}`)
    console.log(`   منتفخة    : ${base.user.inflatedTotals} → ${report.user.inflatedTotals}`)

    // اتفاق الترتيب على أسئلة المستخدمين
    let overlapSum = 0, compared = 0, changed: string[] = []
    for (const [id, baseIds] of Object.entries(base.fingerprints)) {
      const nowIds = report.fingerprints[id]
      if (!nowIds) continue
      compared++
      const inter = nowIds.filter(x => baseIds.includes(x)).length
      const denom = Math.max(baseIds.length, nowIds.length, 1)
      overlapSum += inter / denom
      if (inter / denom < 0.6) changed.push(id)
    }
    console.log(`   اتفاق أفضل ٥ : ${pct(overlapSum / Math.max(compared, 1))} على ${compared} سؤالاً`)
    if (changed.length) {
      console.log(`   تغيّر ترتيبها جوهرياً: ${changed.length} سؤالاً — ${changed.slice(0, 8).join(", ")}${changed.length > 8 ? "…" : ""}`)
    }

    // بوّابة الانحدار: أي هبوط يتجاوز ٣ نقاط مئوية في recall@5 أو نسبة غير الفارغة
    const REGRESSION_TOLERANCE = 0.03
    const regressed =
      report.known.recallAt5 < base.known.recallAt5 - REGRESSION_TOLERANCE ||
      report.user.nonEmptyRate < base.user.nonEmptyRate - REGRESSION_TOLERANCE
    console.log()
    if (regressed) {
      console.error("❌ انحدار في الجودة يتجاوز حدّ التسامح (3pp) — لا تُثبّت هذا التغيير.\n")
      process.exit(1)
    }
    console.log("✅ لا انحدار يتجاوز حدّ التسامح.\n")
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("فشل التقييم:", e)
  process.exit(1)
})
