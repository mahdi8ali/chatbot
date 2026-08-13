import {
  getSiteSystemPrompt,
  getFallbackResponse,
  FALLBACK_OUT_OF_SCOPE,
  FALLBACK_SMALLTALK
} from "@/lib/server/system-prompts"
import { matchCurated } from "@/lib/server/curated-service"
import { kbSearch, SHORT_CIRCUIT_THRESHOLD } from "@/lib/server/kb-service"
import { classifyScope, isSmallTalk } from "@/lib/server/scope-guard"
import { getOpenAIModel } from "@/lib/server/site-api-config"
import { ALL_SITE_TOOLS } from "@/lib/server/site-tools-definitions"
import { resolveToolCalls } from "@/lib/server/function-calling-handler"
import {
  applyRateLimit,
  createRateLimitResponse
} from "@/lib/server/rate-limiter"
import {
  validateAndSanitize,
  sanitizeMessages,
  logSecurityIssue
} from "@/lib/server/data-sanitizer"
import { createPendingLog, updateChatLog } from "@/lib/server/chat-logger"
import { corsHeaders, isAllowedOrigin, forbiddenOrigin } from "@/lib/server/cors"
import { hitSharedLimit } from "@/lib/server/rate-limit-store"
import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs"

// قصر المسار عالي الثقة (خيار معطّل افتراضياً)
const KB_SHORT_CIRCUIT_ENABLED = false

/**
 * سقف رموز الجواب النهائي — **شبكة أمان لا أداة اختصار**.
 *
 * كان 500، وهو ما كان يقطع الجواب في منتصف الكلمة بدل أن يجعله موجزاً: النموذج
 * لا يرى الحدّ فيخطّط لجواب كامل ثم يُبتر. والأسوأ أن كتلة المصادر تقع في آخر
 * الجواب فتكون أوّل الضحايا.
 *
 * القياس على 260 جواباً حقيقياً في chat_logs: الوسيط 427 محرفاً فقط (الإيجاز هو
 * النمط السائد أصلاً)، و12.7% فقط تتجاوز 1100 محرف — وهي تحديداً أجوبة القوائم
 * (أرقام هواتف، مشاريع، عيّنات تحليل) التي تحتاج طولها. أي أن الحدّ لم يكن
 * يختصر الأجوبة العادية، بل يبتر ما يحتاج الاكتمال.
 *
 * الاختصار الحقيقي يُضبط في الموجّه («ميزانية الطول» في system-prompts.ts) حيث
 * يخطّط النموذج لجواب قصير من البداية. وهذا السقف يبقى حاجزاً ضد التوليد الجامح
 * فقط: 1000 رمز ≈ 2200 محرفاً — فوق أطول جواب لوحظ (1568) بهامش مريح.
 */
const FINAL_ANSWER_MAX_TOKENS = 1000

/**
 * حدود المعدّل المشتركة (عبر قاعدة البيانات) — تُطبَّق على مستوى كل الـ instances.
 * أوسع قليلاً من حدّ الذاكرة (20/دقيقة) لأنها الطبقة المُلزِمة الأخيرة لا الأولى.
 */
const SHARED_RATE_LIMIT = Number(process.env.CHAT_RATE_LIMIT || "30")
const SHARED_RATE_WINDOW_MS = Number(process.env.CHAT_RATE_WINDOW_MS || String(60 * 1000))

/**
 * استخراج IDs المقالات التي أرجعتها الأدوات فعلاً
 * يُستخدم للتحقق من أن الروابط في رد البوت مصدرها نتائج حقيقية
 */
function extractValidArticleIds(messages: ChatCompletionMessageParam[]): Set<string> {
  const ids = new Set<string>()
  for (const msg of messages) {
    if (msg.role !== "tool") continue
    const content = typeof msg.content === "string" ? msg.content : ""
    if (!content) continue
    try {
      const parsed = JSON.parse(content)
      // نجمع المعرّفات من كل الأشكال الممكنة لنتائج الأدوات:
      // - نتائج البحث: data.results أو results
      // - عيّنة/عناصر التحليل (count_mentions/mentions_timeline...): data.sample أو sample أو items
      // - نتيجة مفردة: data (إن حملت id)
      const candidateArrays: any[][] = [
        parsed?.data?.results,
        parsed?.results,
        parsed?.data?.sample,
        parsed?.sample,
        parsed?.data?.items,
        parsed?.items,
      ].filter(Array.isArray)

      const items: any[] = candidateArrays.length > 0
        ? candidateArrays.flat()
        : (parsed?.data?.id ? [parsed.data] : (parsed?.id ? [parsed] : []))

      for (const item of items) {
        if (item?.id) ids.add(String(item.id))
        const urlMatch = String(item?.url || "").match(/id=(\d+)/)
        if (urlMatch) ids.add(urlMatch[1])
      }
    } catch {}
  }
  return ids
}

/**
 * عدّ جميع نتائج الأدوات (ليس فقط المقالات) — يشمل أوقات الصلاة والأماكن وغيرها
 * يُستخدم لتحديد db_result_count بشكل صحيح في السجل
 */
function countAllToolResults(messages: ChatCompletionMessageParam[]): number {
  let count = 0
  for (const msg of messages) {
    if (msg.role !== "tool") continue
    const content = typeof msg.content === "string" ? msg.content : ""
    if (!content) continue
    try {
      const parsed = JSON.parse(content)
      if (!parsed?.success) continue
      const data = parsed?.data
      if (!data) continue
      if (Array.isArray(data?.results)) {
        count += data.results.length
      } else if (Array.isArray(data)) {
        count += data.length
      } else if (typeof data === "object") {
        // نتيجة واحدة (أوقات الصلاة، تفاصيل مشروع، ...) → تُعدّ 1
        count += 1
      }
    } catch {}
  }
  return count
}

/**
 * استخراج id من أي صيغة رابط alkafeel.net/news
 * يغطي: index.php?id=X  /  index?id=X  /  ?id=X&lang=...  /  /X (numeric path)
 */
function extractNewsId(url: string): string | null {
  const m = url.match(/[?&]id=(\d+)/) || url.match(/\/news\/(\d+)/)
  return m ? m[1] : null
}

/**
 * حذف أي رابط alkafeel.net/news في الرد لم يكن ضمن IDs نتائج الأدوات
 */
function stripInvalidLinks(text: string, validIds: Set<string>): string {
  // إذا لم تُستدعى أي أداة (validIds فارغة) → احذف كل روابط alkafeel.net/news
  // لأن البوت قد يخترع روابط من ذاكرته دون أن يبحث فعلاً
  const hasValidIds = validIds.size > 0

  // حذف markdown links التي تحتوي على alkafeel.net/news
  text = text.replace(
    /\[([^\]]*)\]\((https:\/\/(?:www\.)?alkafeel\.net\/news[^\s)]*)\)/g,
    (match, label, url) => {
      if (!hasValidIds) return label   // لا توجد نتائج أدوات → احذف الرابط كلياً
      const id = extractNewsId(url)
      return (!id || validIds.has(id)) ? match : label
    }
  )

  // حذف روابط خام تحتوي على alkafeel.net/news
  text = text.replace(
    /https:\/\/(?:www\.)?alkafeel\.net\/news\S*/g,
    (url) => {
      if (!hasValidIds) return ""      // لا توجد نتائج أدوات → احذف الرابط
      const id = extractNewsId(url)
      return (!id || validIds.has(id)) ? url : ""
    }
  )

  // حذف 🔗 اليتيمة إذا حُذف الرابط بعدها
  return text.replace(/🔗\s*(?:\[اقرأ المزيد\])?\s*\n?\s*$/gm, "").trim()
}


/**
 * Security Headers — قائمة الأصول البيضاء تعيش في lib/server/cors.ts
 * (مشتركة مع /api/chat/feedback كي لا تنحرف النقطتان).
 */
function getSecurityHeaders(origin?: string | null): HeadersInit {
  return {
    ...corsHeaders(origin, "POST, OPTIONS"),
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Expose-Headers": "X-Chat-Log-Id",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'none'",
  }
}

/**
 * معالجة OPTIONS request (CORS Preflight)
 */
export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && !isAllowedOrigin(origin)) return forbiddenOrigin(origin)
  return new Response(null, {
    status: 204,
    headers: getSecurityHeaders(origin)
  })
}

interface ChatRequest {
  messages: ChatCompletionMessageParam[]
  temperature?: number
  max_tokens?: number
  use_tools?: boolean // خيار لتفعيل/تعطيل الأدوات
  session_id?: string // معرف الجلسة لربط السجلات
}

/**
 * Endpoint موحد للشات مع دعم Function Calling - المرحلة 2 + 4
 * 
 * التطويرات:
 * ✅ Phase 2: دعم Function Calling مع REST API
 * ✅ Phase 3: منع الهلوسة والاقتراحات الذكية
 * ✅ Phase 4: Rate Limiting + Security + Data Sanitization
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  const securityHeaders = getSecurityHeaders(origin)

  // حجب الأصول غير المصرّح بها قبل أي عمل (قبل OpenAI وقبل قاعدة البيانات).
  if (origin && !isAllowedOrigin(origin)) return forbiddenOrigin(origin)

  try {
    // ✅ Phase 4.1: Rate Limiting - حماية من Spam
    const rateLimitResult = applyRateLimit(request, {
      maxRequests: 20, // 20 طلب
      windowMs: 60 * 1000, // لكل دقيقة
      blockDurationMs: 5 * 60 * 1000 // حظر 5 دقائق عند التجاوز
    })

    if (!rateLimitResult.allowed) {
      console.warn(
        `[Rate Limit] Blocked IP: ${rateLimitResult.ip}, Retry after: ${rateLimitResult.retryAfter}s`
      )

      return createRateLimitResponse(
        rateLimitResult.retryAfter!,
        "تجاوزت الحد المسموح من الطلبات. يُرجى المحاولة بعد قليل."
      )
    }

    // ✅ الحدّ المشترك (مدعوم بقاعدة البيانات) — الطبقة المُلزِمة فعلياً.
    // الحدّ في الذاكرة أعلاه يبقى خطّ دفاع أول رخيص، لكنه لكل عملية على حدة
    // فلا يحكم عند تعدّد الـ instances ولا يصمد عبر إعادة التشغيل.
    const shared = await hitSharedLimit(
      `chat:${rateLimitResult.ip}`,
      SHARED_RATE_LIMIT,
      SHARED_RATE_WINDOW_MS
    )
    if (!shared.allowed) {
      console.warn(`[Rate Limit] Shared limit blocked ${rateLimitResult.ip} (${shared.hits} hits)`)
      return createRateLimitResponse(
        shared.retryAfter!,
        "تجاوزت الحد المسموح من الطلبات. يُرجى المحاولة بعد قليل."
      )
    }

    // قراءة البيانات
    const json = await request.json()
    const {
      messages,
      temperature = 0.5,
      max_tokens = 1200,
      use_tools = true,
      session_id
    } = json as ChatRequest
    const startMs = Date.now()

    // التحقق من وجود رسائل
    if (!messages || messages.length === 0) {
      return new Response(
        JSON.stringify({
          error: "يجب إرسال رسالة واحدة على الأقل"
        }),
        { status: 400, headers: securityHeaders }
      )
    }

    // ✅ Phase 4.2: Data Sanitization - تنظيف المدخلات
    // تحويل messages لنوع بسيط للتنظيف
    const simpleMessages = messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content)
    }))
    
    const sanitizedMessages = sanitizeMessages(simpleMessages)

    // التحقق من صحة آخر رسالة (من المستخدم)
    const lastMessage = sanitizedMessages[sanitizedMessages.length - 1]
    if (lastMessage.role === "user") {
      const validation = validateAndSanitize(lastMessage.content)

      if (!validation.valid) {
        logSecurityIssue(
          "Invalid Input",
          { error: validation.error, original: lastMessage.content },
          rateLimitResult.ip
        )

        return new Response(
          JSON.stringify({
            error: "المدخلات غير صالحة",
            details: validation.error
          }),
          { status: 400, headers: securityHeaders }
        )
      }

      // استخدام النص النظيف
      lastMessage.content = validation.sanitized!
    }

    // ملاحظة: فحص OPENAI_API_KEY أُخّر إلى ما قبل أول استعمال فعلي للنموذج.
    // مسارات القصر أدناه (المخزن المنسّق، قاعدة المعرفة، حارس النطاق) مصمّمة
    // للعمل بلا OpenAI إطلاقاً، وكان الفحص المبكّر يُفشلها بـ 500 عند غياب المفتاح.

    // ===== فحص المخزن المنسّق أولاً (بديل searchFAQ) =====
    // إذا تطابق سؤال المستخدم مع إجابة منسّقة موثوقة، أرسلها مباشرةً دون الاتصال بـ OpenAI
    if (lastMessage.role === "user") {
      let curated = null
      try {
        curated = await matchCurated(lastMessage.content) // C4: تدهور آمن
      } catch (err) {
        console.error("[Curated] match failed, continuing:", err)
        curated = null // فشل الخدمة ⇒ المتابعة للمسار الطبيعي
      }

      if (curated) {
        console.log(`[Chat API] Curated hit (${curated.category}) for: "${lastMessage.content.slice(0, 60)}"`)
        const curatedText = curated.url
          ? `${curated.answer}\n\n📖 *المصدر* — 🔗 [اقرأ المزيد](${curated.url})`
          : curated.answer

        const curatedLogId = await createPendingLog(session_id, lastMessage.content)
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(curatedText))
            controller.enqueue(encoder.encode(`\n__VALID_IDS__:`))
            controller.close()
            if (curatedLogId) {
              updateChatLog(curatedLogId, {
                finalAnswer: curatedText,
                responseTimeMs: Date.now() - startMs,
                wasToolUsed: false,
              }).catch(err => console.error("[ChatLogger]", err))
            }
          }
        })
        return new Response(stream, {
          headers: {
            ...securityHeaders,
            "Content-Type": "text/plain; charset=utf-8",
            "X-Chat-Log-Id": curatedLogId || "",
          }
        })
      }
    }

    // ===== قاعدة المعرفة الخاصة (الاسترجاع المسبق وحقن السياق) =====
    // بعد فشل matchCurated وقبل classifyScope: نبحث في قاعدة المعرفة الخاصة.
    // عند وجود إصابة مؤكّدة نحقن النتائج كسياق نظام موثوق يصوغ منه النموذج الإجابة.
    // تدهور آمن: أي فشل يُلتقط ويُتابَع المسار الطبيعي بلا حقن.
    let kbContext: ChatCompletionMessageParam | null = null
    if (lastMessage.role === "user") {
      try {
        const kbHits = await kbSearch(lastMessage.content)
        if (kbHits.length > 0) {
          console.log(`[KB] hit score=${kbHits[0].score.toFixed(2)} for: "${lastMessage.content.slice(0, 60)}"`)

          // خيار قصر المسار عالي الثقة (معطّل افتراضياً) — يُرجع المتن حرفياً كنمط الإجابات المنسّقة
          if (KB_SHORT_CIRCUIT_ENABLED && kbHits[0].score >= SHORT_CIRCUIT_THRESHOLD) {
            const kbText = kbHits[0].body
            const kbLogId = await createPendingLog(session_id, lastMessage.content)
            const encoder = new TextEncoder()
            const stream = new ReadableStream({
              start(controller) {
                controller.enqueue(encoder.encode(kbText))
                controller.enqueue(encoder.encode(`\n__VALID_IDS__:`))
                controller.close()
                if (kbLogId) {
                  updateChatLog(kbLogId, {
                    finalAnswer: kbText,
                    responseTimeMs: Date.now() - startMs,
                    wasToolUsed: false,
                  }).catch(err => console.error("[ChatLogger]", err))
                }
              }
            })
            return new Response(stream, {
              headers: {
                ...securityHeaders,
                "Content-Type": "text/plain; charset=utf-8",
                "X-Chat-Log-Id": kbLogId || "",
              }
            })
          }

          // المسار الموصى به: حقن النتائج كسياق نظام موثوق ثمّ يصوغ النموذج الإجابة
          const kbBlocks = kbHits.map(h => `### ${h.title}\n${h.body}`).join("\n\n")
          kbContext = {
            role: "system",
            content: `لديك معلومات موثوقة من قاعدة المعرفة الخاصة. أجب من هذه المعلومات حصراً وبأسلوبك، ولا تخترع ما ليس فيها:\n\n${kbBlocks}`
          }
        }
      } catch (err) {
        console.error("[KB] search failed, continuing:", err)
        // فشل الخدمة ⇒ المتابعة للمسار الطبيعي بلا حقن
      }
    }

    // ===== حارس النطاق الحتمي (قصر مسار للأسئلة خارج النطاق) =====
    // إذا كان السؤال خارج النطاق (تحويل هجري/ميلادي أو توقيت مناسبة) نعتذر مباشرةً
    // بنفس نمط قصر مسار FAQ دون استدعاء أي أداة
    // ملاحظة: يُتخطّى منطقياً عند وجود إصابة KB مؤكّدة (لدينا معرفة صريحة عن السؤال)
    // ===== حارس المجاملات (قصر مسار للتحيات والشكر) =====
    // tool_choice:"required" يُجبر استدعاء أداة لكل رسالة، فكانت «شكراً» و«مرحبا»
    // تمرّ ببحث كامل واستدعاء نموذج إضافي. هنا نردّ فوراً بلا أداة ولا نموذج.
    // وجود ردّ سابق من المساعد يعني أن «تمام»/«اوكي» موافقة لا مجاملة
    const hasPriorAssistantTurn = sanitizedMessages.some(m => m.role === "assistant")
    if (
      lastMessage.role === "user" &&
      !kbContext &&
      isSmallTalk(lastMessage.content, { hasPriorAssistantTurn })
    ) {
      console.log(`[Chat API] Small-talk short-circuit: "${lastMessage.content.slice(0, 40)}"`)
      const stLogId = await createPendingLog(session_id, lastMessage.content)
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(FALLBACK_SMALLTALK))
          controller.enqueue(encoder.encode(`\n__VALID_IDS__:`))
          controller.close()
          if (stLogId) {
            updateChatLog(stLogId, {
              finalAnswer: FALLBACK_SMALLTALK,
              responseTimeMs: Date.now() - startMs,
              wasToolUsed: false,
            }).catch(err => console.error("[ChatLogger]", err))
          }
        }
      })
      return new Response(stream, {
        headers: {
          ...securityHeaders,
          "Content-Type": "text/plain; charset=utf-8",
          "X-Chat-Log-Id": stLogId || "",
        }
      })
    }

    if (lastMessage.role === "user" && !kbContext) {
      const scope = classifyScope(lastMessage.content)
      if (!scope.inScope) {
        console.log(`[Chat API] Out-of-scope (${scope.category}) for: "${lastMessage.content.slice(0, 60)}"`)

        const scopeLogId = await createPendingLog(session_id, lastMessage.content)
        const encoder = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode(FALLBACK_OUT_OF_SCOPE))
            controller.enqueue(encoder.encode(`\n__VALID_IDS__:`))
            controller.close()
            if (scopeLogId) {
              updateChatLog(scopeLogId, {
                finalAnswer: FALLBACK_OUT_OF_SCOPE,
                responseTimeMs: Date.now() - startMs,
                wasToolUsed: false,
              }).catch(err => console.error("[ChatLogger]", err))
            }
          }
        })
        return new Response(stream, {
          headers: {
            ...securityHeaders,
            "Content-Type": "text/plain; charset=utf-8",
            "X-Chat-Log-Id": scopeLogId || "",
          }
        })
      }
    }

    // ===== من هنا فصاعداً نحتاج OpenAI فعلاً =====
    // (كل مسارات القصر أعلاه رجعت بالفعل إن أصابت — فلا تعتمد على المفتاح)
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not found in environment")
    }
    const model = getOpenAIModel()
    const openai = new OpenAI({ apiKey: openaiApiKey })

    // حقن System Prompt الثابت في بداية المحادثة
    // ✅ نستخدم sanitizedMessages (الرسائل المنظفة) وليس messages الخام
    const systemPrompt = getSiteSystemPrompt()
    const messagesWithSystem: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      },
      ...(kbContext ? [kbContext] : []),
      ...sanitizedMessages.map(msg => ({
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content
      }))
    ]



    // ===== Streaming Function Calling =====
    if (use_tools) {
      console.log(`[Chat API] Streaming FC (${sanitizedMessages.length} msgs)`)

      try {
        // الخطوة 1: حل جميع tool calls (بدون stream)
        // ⚠️ نداءات الاختيار تتلقّى الموجّه **الكامل** عمداً.
        // جُرّب إرسال الجوهري وحده (توفير ~2,228 رمزاً/نداء) وقيس على 30 سؤالاً
        // حقيقياً بـ temperature 0: نفس الأداة في 86.7% فقط، ونفس الأداة
        // **والمعاملات** في 56.7% فقط. أي أن أقسام العرض والأمثلة تؤثّر فعلاً على
        // صياغة الاستعلام من اللهجة العامّية — فالفصل ليس محايداً ورُفض.
        // البرهان قابل لإعادة التشغيل: npm run eval:tools
        const toolResult = await resolveToolCalls(
          openai,
          model,
          messagesWithSystem,
          ALL_SITE_TOOLS,
          3
        )

        console.log(`[Chat API] Tools resolved in ${toolResult.iterations} iteration(s), needsFinalCall: ${toolResult.needsFinalCall}`)

        // ✅ الخطوة 2: streaming حقيقي من OpenAI (يشتغل على Vercel)
        // سواء كان رد مباشر أو بعد tool calls — دائماً نستخدم stream حقيقي
        const streamMessages = toolResult.needsFinalCall
          ? toolResult.resolvedMessages  // بعد tool calls
          : messagesWithSystem           // سؤال بسيط بدون أدوات

        // stream_options.include_usage مدعوم وقت التشغيل لكنه غائب عن أنواع
        // إصدار SDK المثبّت (نفس حالة parallel_tool_calls في function-calling-handler)،
        // لذا نبني المعاملات ككائن مُحوَّل النوع بدل تعطيل الفحص على الاستدعاء كلّه.
        const finalParams = {
          model,
          messages: streamMessages,
          temperature: 0.5,
          max_tokens: FINAL_ANSWER_MAX_TOKENS,
          stream: true,
          // بدون هذا الطلب الصريح لا يُرسل OpenAI usage في وضع البثّ إطلاقاً،
          // فتستحيل معرفة كلفة السؤال الواحد (عمى اقتصادي كامل).
          stream_options: { include_usage: true },
        } as unknown as Parameters<typeof openai.chat.completions.create>[0]

        const finalStream = (await openai.chat.completions.create(
          finalParams
        )) as unknown as AsyncIterable<any>

        // استخرج validIds من tool results مسبقاً (لا يحتاج انتظار الـ stream)
        const validIds = toolResult.needsFinalCall
          ? extractValidArticleIds(streamMessages)
          : new Set<string>()
        const validIdsStr = [...validIds].join(",")

        // استخرج اسم أول أداة استُدعيت (للتسجيل فقط)
        let firstToolCalled = ""
        let firstToolArgs = ""
        if (toolResult.needsFinalCall) {
          for (const msg of toolResult.resolvedMessages) {
            if (msg.role === "assistant" && Array.isArray((msg as any).tool_calls)) {
              const tc = (msg as any).tool_calls[0]
              if (tc) {
                firstToolCalled = tc.function?.name || ""
                firstToolArgs = tc.function?.arguments || ""
              }
              break
            }
          }
        }

        // ✅ True streaming: أرسل chunks فوراً بدل الـ buffering
        // ألحق __VALID_IDS__ في نهاية الـ stream للـ client ليتحقق من الروابط محلياً
        const userQ = sanitizedMessages[sanitizedMessages.length - 1]?.content || ""
        const toolStreamLogId = await createPendingLog(session_id, userQ)
        const readable = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder()
            let buffer = ""
            // نبدأ من استهلاك نداءات اختيار الأداة (كانت غير محسوبة إطلاقاً)،
            // ثم نضيف استهلاك نداء الجواب المتدفّق ⇒ الكلفة الحقيقية للسؤال كاملاً.
            let promptTokens = toolResult.usage?.promptTokens ?? 0
            let completionTokens = toolResult.usage?.completionTokens ?? 0
            let cachedTokens = toolResult.usage?.cachedTokens ?? 0
            try {
              for await (const chunk of finalStream) {
                // الجزء الأخير يحمل usage (بفضل stream_options.include_usage)
                const u = (chunk as any).usage
                if (u) {
                  promptTokens += u.prompt_tokens ?? 0
                  completionTokens += u.completion_tokens ?? 0
                  cachedTokens += u.prompt_tokens_details?.cached_tokens ?? 0
                }
                const content = chunk.choices[0]?.delta?.content || ""
                if (content) {
                  buffer += content
                  controller.enqueue(enc.encode(content))
                }
              }
            } finally {
              // إغلاق الـ stream — نتجاهل الأخطاء حتى لا تمنع حفظ السجل
              try {
                controller.enqueue(enc.encode(`\n__VALID_IDS__:${validIdsStr}`))
                controller.close()
              } catch {}
              // حفظ الجواب دائماً بغض النظر عن حالة الـ stream
              if (toolStreamLogId) {
                updateChatLog(toolStreamLogId, {
                  toolCalled: firstToolCalled || undefined,
                  toolArguments: firstToolArgs || undefined,
                  dbResultIds: validIdsStr || undefined,
                  dbResultCount: Math.max(validIds.size, countAllToolResults(toolResult.resolvedMessages)),
                  finalAnswer: buffer || undefined,
                  responseTimeMs: Date.now() - startMs,
                  modelName: model,
                  wasToolUsed: toolResult.needsFinalCall,
                  promptTokens,
                  completionTokens,
                  cachedTokens,
                }).catch(err => console.error("[ChatLogger]", err))
              }
            }
          }
        })

        return new Response(readable, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "X-Chat-Log-Id": toolStreamLogId || "",
            ...securityHeaders
          }
        })
      } catch (fcError: any) {
        console.error("[Chat API] Streaming FC Error:", fcError)
        console.log("[Chat API] Falling back to standard mode")
      }
    }

    // ===== Fallback: بدون أدوات =====
    console.log("[Chat API] Standard mode (no tools)")

    const response = await openai.chat.completions.create({
      model,
      messages: messagesWithSystem,
      temperature,
      max_tokens,
      stream: true
    })

    const fbUserQ = sanitizedMessages[sanitizedMessages.length - 1]?.content || ""
    const fallbackLogId = await createPendingLog(session_id, fbUserQ)
    const fallbackStream = new ReadableStream({
      async start(controller) {
        let buffer = ""
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              buffer += content
              controller.enqueue(new TextEncoder().encode(content))
            }
          }
        } finally {
          try { controller.close() } catch {}
          if (fallbackLogId) {
            updateChatLog(fallbackLogId, {
              finalAnswer: buffer || undefined,
              responseTimeMs: Date.now() - startMs,
              modelName: model,
              wasToolUsed: false,
            }).catch(err => console.error("[ChatLogger]", err))
          }
        }
      }
    })

    return new Response(fallbackStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "X-Chat-Log-Id": fallbackLogId || "",
        ...securityHeaders
      }
    })
  } catch (error: any) {
    console.error("Chat API Error:", error)

    // الحصول على origin للـ security headers
    const origin = request.headers.get("origin")
    const errorSecurityHeaders = getSecurityHeaders(origin)

    // معالجة أنواع الأخطاء المختلفة
    let errorMessage = "حدث خطأ غير متوقع"
    let statusCode = 500

    if (error.message?.toLowerCase().includes("api key not found")) {
      errorMessage =
        "لم يتم العثور على مفتاح OpenAI API. يرجى التواصل مع المسؤول."
      statusCode = 401
    } else if (error.message?.toLowerCase().includes("incorrect api key")) {
      errorMessage = "مفتاح OpenAI API غير صحيح. يرجى التواصل مع المسؤول."
      statusCode = 401
    } else if (error.message?.toLowerCase().includes("rate limit")) {
      errorMessage = "تم تجاوز الحد المسموح من الطلبات. يرجى المحاولة بعد قليل."
      statusCode = 429
    } else if (error.message?.toLowerCase().includes("model")) {
      errorMessage = `النموذج غير متاح حالياً. يرجى المحاولة لاحقاً.`
      statusCode = 503
    } else if (error.status) {
      statusCode = error.status
      errorMessage = error.message || errorMessage
    }

    // إرجاع رد fallback
    return new Response(
      JSON.stringify({
        error: errorMessage,
        fallback: getFallbackResponse("api_error")
      }),
      {
        status: statusCode,
        headers: {
          "Content-Type": "application/json",
          ...errorSecurityHeaders
        }
      }
    )
  }
}
