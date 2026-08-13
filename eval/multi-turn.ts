/**
 * multi-turn.ts — قياس التسلسلية: هل يحلّ النموذج الضمائر والإشارات في أسئلة
 * المتابعة، فيصوغ استعلاماً كاملاً بدل «كم عمره؟»؟
 *
 * ── لماذا نقيس خطوة الاختيار تحديداً ──────────────────────────────────────
 * حلّ الإشارة يظهر في **الاستعلام الذي يبنيه النموذج**: إن كتب query="عمره"
 * فقد ضاع السياق، وإن كتب query="عمر الأمين العام" فقد حُلّت الإشارة. وهذه
 * الخطوة تعمل بـ temperature 0 فتكون شبه حتمية وقابلة للمقارنة.
 *
 * ── لماذا ردود المساعد مُعلّبة (canned) ────────────────────────────────────
 * حتى يكون الاختبار حتمياً ورخيصاً: لو ولّدنا الردود حيّاً لتغيّرت بين تشغيلين
 * فاختلط انحدار حلّ الإشارة بتذبذب توليد الردود. الردود هنا واقعية ومختصرة،
 * وتحمل المعلومة التي يجب أن ترتدّ إليها الإشارة.
 *
 * الاستخدام:  npm run eval:turns
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
import { getSiteSystemPrompt } from "../lib/server/system-prompts"
import { ALL_SITE_TOOLS } from "../lib/server/site-tools-definitions"
import { matchCurated } from "../lib/server/curated-service"
import { classifyScope, isSmallTalk } from "../lib/server/scope-guard"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Scenario {
  id: string
  desc: string
  /** أزواج (سؤال المستخدم، ردّ مُعلّب) — الأخير سؤال المتابعة المُختبَر. */
  history: Array<{ user: string; assistant: string }>
  followUp: string
  /** يجب أن يحوي الاستعلام المُصاغ إحدى هذه الكلمات (دليل حلّ الإشارة). */
  expectInQuery: string[]
  expectTool?: string
}

const SCENARIOS: Scenario[] = [
  {
    id: "person-pronoun",
    desc: "ضمير يعود على شخص",
    history: [{
      user: "من هو الأمين العام للعتبة العباسية المقدسة",
      assistant: "الأمين العام للعتبة العباسية المقدسة هو السيد مصطفى مرتضى آل ضياء الدين.",
    }],
    followUp: "متى تم تعيينه؟",
    expectInQuery: ["الأمين العام", "مصطفى", "ضياء"],
  },
  {
    id: "project-pronoun",
    desc: "ضمير يعود على مشروع",
    history: [{
      user: "ما هو مشروع صحن أم البنين",
      assistant: "مشروع صحن أم البنين (عليها السلام) توسعة كبرى تقوم بها العتبة العباسية لاستيعاب الزائرين.",
    }],
    followUp: "كم نسبة إنجازه الآن؟",
    expectInQuery: ["صحن", "البنين"],
  },
  {
    id: "place-to-contact",
    desc: "انتقال من مكان إلى رقم هاتفه",
    history: [{
      user: "أين يقع مستشفى الكفيل التخصصي",
      assistant: "مستشفى الكفيل التخصصي يقع في كربلاء المقدسة وهو من مشاريع العتبة العباسية الطبية.",
    }],
    followUp: "وما رقم هاتفه؟",
    expectInQuery: ["الكفيل", "مستشفى"],
  },
  {
    id: "list-ordinal",
    desc: "إشارة ترتيبية إلى عنصر من قائمة",
    history: [{
      user: "ما هي المشاريع الطبية للعتبة",
      assistant: "من أبرزها: مستشفى الكفيل التخصصي، ومستشفى الزكي في بابل، ومركز الكفيل لعلاج الأورام.",
    }],
    followUp: "أعطني تفاصيل الثاني",
    expectInQuery: ["الزكي", "بابل"],
  },
  {
    id: "contact-followup",
    desc: "متابعة بعد قائمة أرقام",
    history: [{
      user: "اعطني ارقام قسم مقام الإمام المهدي",
      assistant: "رئيس القسم: 009647700479212 — معاون الفني: 009647715041363.",
    }],
    followUp: "وما بريدهم الإلكتروني؟",
    expectInQuery: ["المهدي", "مقام"],
  },
  {
    id: "topic-switch",
    desc: "تغيير موضوع — يجب ألّا يُسحب السياق القديم",
    history: [{
      user: "ما هي أوقات الصلاة اليوم",
      assistant: "الفجر 03:53، الشروق 05:24، الظهر 12:09، المغرب 07:10.",
    }],
    followUp: "ما آخر أخبار العتبة؟",
    expectInQuery: ["أخبار", "العتبة"],
  },
  {
    id: "dialect-followup",
    desc: "متابعة بالعامية العراقية",
    history: [{
      user: "شكو مشاريع طبية بالعتبة",
      assistant: "من المشاريع الطبية: مستشفى الكفيل التخصصي ومستشفى الزكي.",
    }],
    followUp: "شنو اخر وحدة منهن؟",
    expectInQuery: ["مستشفى", "الزكي", "الكفيل", "طبي"],
  },
  {
    id: "images-followup",
    desc: "طلب المزيد من الصور لنفس المشروع",
    history: [{
      user: "أرني صورة مشروع صحن أم البنين",
      assistant: "إليك صورة مشروع صحن أم البنين (عليها السلام). يوجد 8 صور مرفقة لهذا المشروع.",
    }],
    followUp: "نعم أريد باقي الصور",
    expectInQuery: ["صحن", "البنين"],
  },
  {
    id: "date-followup",
    desc: "إشارة زمنية تعتمد على الدورة السابقة",
    history: [{
      user: "أخبار العتبة في حزيران 2026",
      assistant: "من أخبار حزيران 2026: افتتاح مشروع تطويري وتغطية لعدة فعاليات.",
    }],
    followUp: "وتموز؟",
    expectInQuery: ["تموز", "07", "يوليو"],
  },
  {
    id: "three-turn",
    desc: "ثلاث دورات — الإشارة تعود لدورتين قبلها",
    history: [
      {
        user: "من هو المتولي الشرعي للعتبة العباسية",
        assistant: "المتولي الشرعي للعتبة العباسية المقدسة هو السيد أحمد الصافي.",
      },
      {
        user: "وما أبرز مبادراته؟",
        assistant: "له مبادرات في المجال الإنساني والتعليمي ضمن مشاريع العتبة.",
      },
    ],
    followUp: "متى تسلّم المنصب؟",
    expectInQuery: ["المتولي", "الصافي", "أحمد"],
  },
]

interface Result {
  id: string
  desc: string
  tool: string
  query: string
  resolved: boolean
  promptTokens: number
}

async function runSelection(messages: any[], attempt = 0): Promise<any> {
  try {
    return await openai.chat.completions.create({
      model,
      messages,
      tools: ALL_SITE_TOOLS,
      tool_choice: "required",
      temperature: 0,
      max_tokens: 200,
    } as any)
  } catch (e: any) {
    if (e?.status === 429 && attempt < 6) {
      await sleep(6000 * (attempt + 1))
      return runSelection(messages, attempt + 1)
    }
    throw e
  }
}

async function main() {
  const systemPrompt = getSiteSystemPrompt()
  console.log(`\n🔬 اختبار التسلسلية — ${SCENARIOS.length} سيناريو (temperature 0)\n`)

  const results: Result[] = []

  for (const sc of SCENARIOS) {
    const messages: any[] = [{ role: "system", content: systemPrompt }]
    for (const h of sc.history) {
      messages.push({ role: "user", content: h.user })
      messages.push({ role: "assistant", content: h.assistant })
    }
    messages.push({ role: "user", content: sc.followUp })

    const r: any = await runSelection(messages)
    await sleep(1500)

    const call = r.choices[0].message.tool_calls?.[0]
    const tool = call?.function?.name || "—"
    // نفحص **كامل** المعاملات: الإشارة قد تُحلّ في query أو في from_date/to_date
    // أو في section — لا في query وحده.
    let query = ""
    try {
      query = JSON.stringify(JSON.parse(call?.function?.arguments || "{}"))
    } catch { query = call?.function?.arguments || "" }

    const norm = (s: string) => s.replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").toLowerCase()
    const resolved = sc.expectInQuery.some(k => norm(query).includes(norm(k)))
    const toolOk = !sc.expectTool || tool === sc.expectTool

    results.push({
      id: sc.id, desc: sc.desc, tool, query,
      resolved: resolved && toolOk,
      promptTokens: r.usage?.prompt_tokens ?? 0,
    })

    console.log(`${resolved && toolOk ? "✅" : "❌"} ${sc.desc}`)
    console.log(`     المتابعة : "${sc.followUp}"`)
    console.log(`     الأداة   : ${tool}`)
    console.log(`     المعاملات: ${query.slice(0, 110)}`)
    if (!resolved) console.log(`     ⚠️ لم يحوِ أياً من: ${sc.expectInQuery.join(" | ")}`)
    console.log()
  }

  const ok = results.filter(r => r.resolved).length
  console.log("─".repeat(60))
  console.log(`حلّ الإشارة بنجاح: ${ok}/${results.length} (${((ok / results.length) * 100).toFixed(0)}%)`)
  console.log(`متوسط رموز الإدخال: ${Math.round(results.reduce((s, r) => s + r.promptTokens, 0) / results.length)}`)

  // ── الطبقات السريعة: هل ترى التاريخ؟ ─────────────────────────────────
  console.log("\n── الطبقات السريعة أمام أسئلة المتابعة ──")
  for (const q of ["متى تم تعيينه؟", "وما رقم هاتفه؟", "وتموز؟", "نعم أريد باقي الصور"]) {
    const cur = await matchCurated(q)
    const sc2 = classifyScope(q)
    console.log(`  "${q}"`)
    console.log(`     منسّق=${cur ? "إصابة" : "لا"} | داخل النطاق=${sc2.inScope} | مجاملة=${isSmallTalk(q)}`)
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("فشل:", e)
  process.exit(1)
})
