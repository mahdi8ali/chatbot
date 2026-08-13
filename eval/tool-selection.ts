/**
 * tool-selection.ts — هل يميّز النموذج نيّة السؤال ويختار الأداة الصحيحة من بين 19؟
 *
 * ── لماذا هذا الاختبار مختلف عن eval:tools ──────────────────────────────────
 * eval:tools يقيس **الانحياز الناتج عن تعديل الموجّه** (مقارنة A/B قبل/بعد).
 * هذا الملف يقيس **الدقّة المطلقة**: هل الأداة المختارة هي الصحيحة فعلاً؟ لكل
 * حالة إجابة صحيحة معروفة مسبقاً (لا مقارنة نسبية).
 *
 * التركيز على **الأزواج المتشابهة** لأنها حيث يفشل التمييز عادة، لا الأسئلة
 * الواضحة: عدّ مقابل بحث، أحدث مقابل بحث، مكان مقابل مشروع، فيديو مقابل بحث
 * عام. هذه بالضبط الحالات التي يحتوي الموجّه توجيهاً صريحاً بشأنها — فالاختبار
 * يتحقّق هل يُطبَّق التوجيه فعلاً لا هل هو مكتوب.
 *
 * الاستخدام:  npm run eval:selection
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

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
const model = process.env.OPENAI_MODEL || "gpt-4o-mini"
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

interface Case {
  id: string
  category: string
  question: string
  /** أي من هذه الأدوات يُعدّ صحيحاً (أحياناً أكثر من واحدة معقولة). */
  acceptTools: string[]
  note?: string
}

// ─────────────────────────────────────────────────────────────────────────
// ① تغطية أساسية — حالة واضحة واحدة لكل أداة من الـ19 (سقف الكفاءة الأعلى)
// ─────────────────────────────────────────────────────────────────────────
const BASELINE: Case[] = [
  { id: "b-search",       category: "أساسي", question: "أريد أخباراً عن زيارة الأربعين", acceptTools: ["search_content"] },
  { id: "b-by-id",        category: "أساسي", question: "أعطني تفاصيل الخبر رقم 45211", acceptTools: ["get_content_by_id"] },
  { id: "b-categories",   category: "أساسي", question: "ما هي تصنيفات الأخبار المتاحة؟", acceptTools: ["list_news_categories"] },
  { id: "b-latest",       category: "أساسي", question: "ما آخر خبر نُشر على الموقع؟", acceptTools: ["get_latest_news"] },
  { id: "b-stats",        category: "أساسي", question: "متى نُشر أول إنفوغراف على الموقع؟", acceptTools: ["get_content_statistics"] },
  { id: "b-contacts",     category: "أساسي", question: "أعطني رقم هاتف قسم الإعلام", acceptTools: ["search_contacts"] },
  { id: "b-projects-db",  category: "أساسي", question: "ما هي مشاريع العتبة في القطاع الزراعي؟", acceptTools: ["search_projects_db"] },
  { id: "b-project-det",  category: "أساسي", question: "أعطني كل تفاصيل المشروع رقم 120", acceptTools: ["get_project_details"] },
  // ⚠️ project_id غير معروف بعد ⇒ البحث أولاً هو السلوك الصحيح، لا get_project_image
  // مباشرة (الأداة تتطلّب project_id). القبول يشمل الاثنين حتى لا يُعاقَب سلوك سليم.
  { id: "b-project-img",  category: "أساسي", question: "أرني صورة مشروع مستشفى الكفيل", acceptTools: ["get_project_image", "search_projects_db"], note: "project_id غير معروف بعد — البحث أولاً سليم" },
  { id: "b-places",       category: "أساسي", question: "أين أقرب فندق إلى الحرم؟", acceptTools: ["search_places"] },
  { id: "b-videos",       category: "أساسي", question: "أريد فيديو عن خطبة الجمعة", acceptTools: ["search_videos"] },
  { id: "b-video-sec",    category: "أساسي", question: "ما هي أقسام مكتبة الفيديو؟", acceptTools: ["get_video_sections"] },
  { id: "b-project-imgs", category: "أساسي", question: "أريد رؤية باقي صور مشروع صحن أم البنين، هناك 6 صور مرفقة", acceptTools: ["get_project_images", "search_projects_db"], note: "project_id غير معروف بعد — البحث أولاً سليم" },
  { id: "b-news-imgs",    category: "أساسي", question: "هل يوجد صور مرفقة لهذا الخبر رقم 900؟", acceptTools: ["get_news_images"] },
  { id: "b-prayer",       category: "أساسي", question: "متى أذان المغرب اليوم في كربلاء؟", acceptTools: ["get_prayer_times"] },
  { id: "b-count-ment",   category: "أساسي", question: "كم مرة ذُكر اسم أحمد الصافي في الشهر الماضي؟ أريد أمثلة", acceptTools: ["count_mentions"] },
  { id: "b-timeline",     category: "أساسي", question: "كيف تطوّر ذكر الزيارة الأربعينية شهرياً خلال السنة؟", acceptTools: ["mentions_timeline"] },
  { id: "b-top-topics",   category: "أساسي", question: "ما أكثر الأقسام نشراً هذا الأسبوع؟", acceptTools: ["top_topics"] },
  { id: "b-count-news",   category: "أساسي", question: "كم خبراً نُشر عن الأربعين هذا الشهر؟", acceptTools: ["count_news", "count_mentions"] },

  // أُضيفت 2026-08-13 — search_publications / get_publication_categories / get_social_media_links
  { id: "b-pub-search",   category: "أساسي", question: "هل يوجد كتاب عن سيرة أبي الفضل العباس؟", acceptTools: ["search_publications"] },
  { id: "b-pub-cats",     category: "أساسي", question: "ما هي سلاسل إصداراتكم المتاحة؟", acceptTools: ["get_publication_categories"] },
  { id: "b-social",       category: "أساسي", question: "ما حسابكم على انستغرام؟", acceptTools: ["get_social_media_links"] },
]

// ─────────────────────────────────────────────────────────────────────────
// ② الأزواج المتشابهة — هنا تُختبَر النيّة الحقيقية، بصياغات متنوّعة وعامية
// ─────────────────────────────────────────────────────────────────────────
const CONFUSABLE: Case[] = [
  // عدّ مقابل بحث — الفخّ الأكثر شيوعاً بحسب سجلّات الاستخدام الحقيقية
  { id: "c-count-1", category: "عدّ/بحث", question: "كم خبر عن مستشفى الكفيل؟", acceptTools: ["count_news", "count_mentions"], note: "ليست search_content رغم أنها تبدو بحثاً" },
  { id: "c-count-2", category: "عدّ/بحث", question: "شكد خبر نزل عن الاربعين اليوم؟", acceptTools: ["count_news", "count_mentions"], note: "عامية — نفس الفخّ" },
  { id: "c-count-3", category: "عدّ/بحث", question: "عدد التقارير الخبرية المنشورة هذا الشهر", acceptTools: ["count_news"], note: "type_id للتقارير — ليس بحثاً" },
  { id: "c-search-1", category: "عدّ/بحث", question: "أعطني أخباراً عن مستشفى الكفيل", acceptTools: ["search_content"], note: "بحث حقيقي لا عدّ رغم التشابه اللفظي" },

  // أحدث مقابل بحث
  { id: "c-latest-1", category: "أحدث/بحث", question: "شنو اخر خبر بالموقع؟", acceptTools: ["get_latest_news"], note: "عامية لـ«آخر خبر»" },
  { id: "c-latest-2", category: "أحدث/بحث", question: "أعطني آخر 5 أخبار عن المشاريع التعليمية", acceptTools: ["search_content"], note: "أحدث + فلترة موضوعية = بحث لا get_latest_news" },
  { id: "c-latest-3", category: "أحدث/بحث", question: "ما أكثر خبر شوهد الشهر الماضي؟", acceptTools: ["search_content"], note: "sort_by=views في search_content لا get_latest_news" },

  // مكان مقابل مشروع — المستشفيات والجامعات موجودة في القاعدتين
  { id: "c-place-1", category: "مكان/مشروع", question: "وين اقرب مستشفى للحرم؟", acceptTools: ["search_places"], note: "سؤال موقع جغرافي" },
  { id: "c-place-2", category: "مكان/مشروع", question: "ما هي خدمات مستشفى الكفيل التخصصي؟", acceptTools: ["search_projects_db", "search_content"], note: "سؤال عن المشروع لا الموقع" },
  { id: "c-place-3", category: "مكان/مشروع", question: "أقرب حسينية للصحن الحسيني", acceptTools: ["search_places"] },

  // فيديو مقابل بحث عام
  { id: "c-video-1", category: "فيديو/بحث", question: "ريد افيديو عن محرم", acceptTools: ["search_videos"], note: "طلب فيديو صريح بالعامية" },
  { id: "c-video-2", category: "فيديو/بحث", question: "هل يوجد تغطية إعلامية لزيارة الأربعين؟", acceptTools: ["search_content", "search_videos"], note: "غامض بين خبر وفيديو — كلاهما مقبول" },

  // اتصال مقابل هوية شخص
  { id: "c-contact-1", category: "اتصال/هوية", question: "كيف أتصل بقسم شؤون الزائرين؟", acceptTools: ["search_contacts"] },
  { id: "c-contact-2", category: "اتصال/هوية", question: "من هو رئيس قسم الإعلام؟", acceptTools: ["search_content"], note: "اسم شخص لا رقم هاتف — search_contacts لا تملك أسماء" },

  // إحصاء عام مقابل عدّ محدّد
  { id: "c-stats-1", category: "إحصاء/عدّ", question: "ما هو أقدم مقال منشور على الموقع؟", acceptTools: ["get_content_statistics"] },
  { id: "c-stats-2", category: "إحصاء/عدّ", question: "كم عدد المقالات المنشورة هذا العام؟", acceptTools: ["count_news"], note: "عدد لا تاريخ — count_news لا get_content_statistics" },

  // نية غير مباشرة (استنتاج) — تختبر «استنتاج النية» في الموجّه
  { id: "c-intent-1", category: "استنتاج نية", question: "اخوي مريض ونحتاج طبيب مختص، وين اروح؟", acceptTools: ["search_places", "search_content", "search_projects_db"], note: "لا يذكر مستشفى صراحة" },
  { id: "c-intent-2", category: "استنتاج نية", question: "أبغى اتبرع للعتبة، شلون أسوي؟", acceptTools: ["search_content", "search_contacts"], note: "استنتاج: يريد طريقة التبرع" },
  { id: "c-intent-3", category: "استنتاج نية", question: "وين اقدر اصلي اليوم قريب من الحرم؟", acceptTools: ["get_prayer_times", "search_places"], note: "قد يقصد الوقت أو المكان — كلاهما معقول" },

  // إصدارات مقابل أخبار — فخّ متوقّع لأن الاثنتين "بحث بالكلمات"
  { id: "c-pub-1", category: "إصدارات/أخبار", question: "أريد مجلة رياض الزهراء", acceptTools: ["search_publications"], note: "مجلة = إصدار لا خبر" },
  { id: "c-pub-2", category: "إصدارات/أخبار", question: "شنو عندكم كتب عن التراث؟", acceptTools: ["search_publications"], note: "عامية — «كتب» يجب ألّا تذهب لـ search_content" },
  { id: "c-pub-3", category: "إصدارات/أخبار", question: "أعطني آخر أخبار عن كتاب جديد أصدرته العتبة", acceptTools: ["search_content"], note: "سؤال عن خبر نشر الكتاب لا عن الكتاب نفسه — search_content صحيحة هنا" },
  { id: "c-social-1", category: "تواصل اجتماعي", question: "وين اكوكم بالفيسبوك؟", acceptTools: ["get_social_media_links"], note: "عامية عراقية لسؤال رابط الحساب" },
]

const ALL_CASES = [...BASELINE, ...CONFUSABLE]

interface Result {
  case: Case
  chosenTool: string
  argsPreview: string
  correct: boolean
  promptTokens: number
}

async function pick(question: string, systemPrompt: string, attempt = 0): Promise<any> {
  try {
    return await openai.chat.completions.create({
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
      await sleep(6000 * (attempt + 1))
      return pick(question, systemPrompt, attempt + 1)
    }
    throw e
  }
}

async function main() {
  const only = process.argv[2] // "baseline" | "confusable" | undefined (كلاهما)
  const cases =
    only === "baseline" ? BASELINE : only === "confusable" ? CONFUSABLE : ALL_CASES

  const systemPrompt = getSiteSystemPrompt()
  console.log(`\n🔬 دقّة اختيار الأداة — ${cases.length} حالة (temperature 0, tool_choice: required)\n`)

  const results: Result[] = []
  for (const [i, c] of cases.entries()) {
    const r: any = await pick(c.question, systemPrompt)
    await sleep(1300)

    const call = r.choices[0].message.tool_calls?.[0]
    const tool = call?.function?.name || "—"
    const correct = c.acceptTools.includes(tool)

    results.push({ case: c, chosenTool: tool, argsPreview: call?.function?.arguments || "", correct, promptTokens: r.usage?.prompt_tokens ?? 0 })

    const mark = correct ? "✅" : "❌"
    console.log(`${mark} [${c.category}] "${c.question}"`)
    console.log(`     اختار: ${tool}${c.acceptTools.length > 1 ? "  (مقبول: " + c.acceptTools.join("/") + ")" : ""}`)
    if (!correct) console.log(`     ⚠️ متوقّع: ${c.acceptTools.join(" أو ")}${c.note ? " — " + c.note : ""}`)

    if ((i + 1) % 10 === 0) console.log(`  … ${i + 1}/${cases.length}`)
  }

  console.log("\n" + "═".repeat(70))
  const byCategory = new Map<string, { ok: number; n: number }>()
  for (const r of results) {
    const e = byCategory.get(r.case.category) || { ok: 0, n: 0 }
    e.n++; if (r.correct) e.ok++
    byCategory.set(r.case.category, e)
  }
  console.log("── حسب الفئة ──")
  for (const [cat, e] of byCategory) {
    console.log(`   ${e.ok}/${e.n}  (${((e.ok / e.n) * 100).toFixed(0)}%)  ${cat}`)
  }

  const totalOk = results.filter(r => r.correct).length
  console.log("\n── الإجمالي ──")
  console.log(`   ${totalOk}/${results.length}  (${((totalOk / results.length) * 100).toFixed(1)}%)`)

  const failures = results.filter(r => !r.correct)
  if (failures.length) {
    console.log(`\n── الإخفاقات (${failures.length}) — راجعها لتحديد التحسين المناسب ──`)
    for (const f of failures) {
      console.log(`  • "${f.case.question}"`)
      console.log(`      اختار ${f.chosenTool} بدل ${f.case.acceptTools.join("/")}  ${f.case.note ? "— " + f.case.note : ""}`)
    }
  } else {
    console.log("\n✅ لا إخفاقات.")
  }
}

main().then(() => process.exit(0)).catch(e => {
  console.error("فشل:", e)
  process.exit(1)
})
