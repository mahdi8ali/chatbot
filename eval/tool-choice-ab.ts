/**
 * tool-choice-ab.ts — إثبات أن فصل الموجّه **لا يغيّر النتائج**.
 *
 * ما يخشاه المالك بحقّ: النداء الأول هو الذي يفهم لهجة المستخدم العامّية ويحوّلها
 * إلى استعلام بحث سليم. فأي مساس بالموجّه قد يفسد تلك الترجمة.
 *
 * البرهان: نداء الاختيار يعمل بـ temperature: 0 (شبه حتمي)، فنمرّر الأسئلة
 * الحقيقية على **الموجّه الكامل** ثم على **الجوهري**، ونقارن:
 *   • اسم الأداة المختارة
 *   • معاملات الاستدعاء (أي الاستعلام المُصاغ من اللهجة)
 * التطابق التامّ ⇒ التغيير محايد بالقياس لا بالادّعاء.
 *
 * الاستخدام:  npm run eval:tools -- [عدد الأسئلة]
 */

import fs from "fs"
import path from "path"

const envPath = path.join(__dirname, "..", ".env.local")
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim()
  }
}

import OpenAI from "openai"
import { getSiteSystemPrompt, getToolSelectionPrompt } from "../lib/server/system-prompts"
import { ALL_SITE_TOOLS } from "../lib/server/site-tools-definitions"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const model = process.env.OPENAI_MODEL || "gpt-4o-mini"

interface Pick {
  tool: string
  args: string
  promptTokens: number
  cachedTokens: number
}

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * ينفّذ خطوة اختيار الأداة وحدها — بنفس معاملات resolveToolCalls تماماً.
 * مع إعادة محاولة عند تجاوز حدّ الرموز في الدقيقة (كل نداء ~11 ألف رمز،
 * فالحدّ 200 ألف/دقيقة يُبلَغ سريعاً عند التشغيل المتوازي).
 */
async function pickTool(systemPrompt: string, question: string, attempt = 0): Promise<Pick> {
  let r: any
  try {
    r = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: question },
      ],
      tools: ALL_SITE_TOOLS,
      tool_choice: "required",
      temperature: 0,
      max_tokens: 200,
    } as any)
  } catch (e: any) {
    if (e?.status === 429 && attempt < 6) {
      const wait = 5000 * (attempt + 1)
      process.stdout.write(`  ⏳ حدّ المعدّل — انتظار ${wait / 1000}ث\n`)
      await sleep(wait)
      return pickTool(systemPrompt, question, attempt + 1)
    }
    throw e
  }
  const call = r.choices[0].message.tool_calls?.[0]
  let args = call?.function?.arguments || "{}"
  try {
    // ترتيب المفاتيح موحّد كي لا يُحسب اختلاف الترتيب فرقاً
    const o = JSON.parse(args)
    args = JSON.stringify(Object.keys(o).sort().reduce((a: any, k) => ((a[k] = o[k]), a), {}))
  } catch {}
  return {
    tool: call?.function?.name || "—",
    args,
    promptTokens: r.usage?.prompt_tokens ?? 0,
    cachedTokens: r.usage?.prompt_tokens_details?.cached_tokens ?? 0,
  }
}

async function main() {
  const limit = Number(process.argv[2] || "40")
  const cases = JSON.parse(
    fs.readFileSync(path.join(__dirname, "cases", "user-queries.json"), "utf8")
  ).slice(0, limit) as Array<{ id: string; query: string }>

  const fullPrompt = getSiteSystemPrompt()
  const corePrompt = getToolSelectionPrompt()

  console.log(`\n🔬 مقارنة اختيار الأداة — ${cases.length} سؤالاً حقيقياً (temperature 0)`)
  console.log(`   الموجّه الكامل: ${fullPrompt.length} محرف | الجوهري: ${corePrompt.length} محرف\n`)

  let sameTool = 0
  let sameArgs = 0
  let fullTokens = 0
  let coreTokens = 0
  const diffs: string[] = []

  for (const [i, c] of cases.entries()) {
    // تسلسلي بفاصل زمني: كل نداء ~11 ألف رمز، والحدّ 200 ألف/دقيقة.
    const a = await pickTool(fullPrompt, c.query)
    await sleep(1200)
    const b = await pickTool(corePrompt, c.query)
    await sleep(1200)
    if ((i + 1) % 10 === 0) process.stdout.write(`  … ${i + 1}/${cases.length}\n`)
    fullTokens += a.promptTokens
    coreTokens += b.promptTokens

    const toolOk = a.tool === b.tool
    const argsOk = a.args === b.args
    if (toolOk) sameTool++
    if (toolOk && argsOk) sameArgs++
    if (!toolOk || !argsOk) {
      diffs.push(
        `  ❗ "${c.query.slice(0, 55)}"\n` +
          `      كامل : ${a.tool} ${a.args.slice(0, 90)}\n` +
          `      جوهري: ${b.tool} ${b.args.slice(0, 90)}`
      )
    }
  }

  const n = cases.length
  const pct = (x: number) => ((x / n) * 100).toFixed(1) + "%"
  console.log("── النتيجة ──")
  console.log(`   نفس الأداة              : ${sameTool}/${n}  (${pct(sameTool)})`)
  console.log(`   نفس الأداة **والمعاملات**: ${sameArgs}/${n}  (${pct(sameArgs)})  ← الترجمة من اللهجة`)
  console.log(`\n── الرموز (نداء اختيار واحد) ──`)
  console.log(`   بالموجّه الكامل : ${Math.round(fullTokens / n)} رمز/سؤال`)
  console.log(`   بالجوهري       : ${Math.round(coreTokens / n)} رمز/سؤال`)
  console.log(`   التوفير        : ${Math.round((fullTokens - coreTokens) / n)} رمز لكل نداء اختيار`)

  if (diffs.length) {
    console.log(`\n── الفروق (${diffs.length}) ──`)
    console.log(diffs.join("\n"))
    console.log("\n⚠️ راجع الفروق أعلاه قبل تثبيت الفصل.")
  } else {
    console.log("\n✅ تطابق تامّ — الفصل محايد على اختيار الأداة وعلى صياغة الاستعلام.")
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("فشل:", e)
  process.exit(1)
})
