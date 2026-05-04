import {
  getSiteSystemPrompt,
  getFallbackResponse
} from "@/lib/server/system-prompts"
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
import OpenAI from "openai"
import { ChatCompletionMessageParam } from "openai/resources/chat/completions.mjs"

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
      const results: any[] = parsed?.data?.results || []
      const single = parsed?.data
      const items = results.length > 0 ? results : (single?.id ? [single] : [])
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
 * CORS Headers - السماح فقط من دومين محدد
 */
const ALLOWED_ORIGINS = [
  process.env.SITE_DOMAIN || "https://alkafeel.net",
  "http://localhost:3000", // للتطوير
  "http://localhost:3001", // للتطوير (بديل)
  "null" // للـ file:// protocol (HTML files)
]

/**
 * Security Headers
 */
function getSecurityHeaders(origin?: string | null): HeadersInit {
  // السماح لأي origin لأن الودجت يُضمّن في مواقع خارجية
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'",
  }
}

/**
 * معالجة OPTIONS request (CORS Preflight)
 */
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getSecurityHeaders(request.headers.get("origin"))
  })
}

interface ChatRequest {
  messages: ChatCompletionMessageParam[]
  temperature?: number
  max_tokens?: number
  use_tools?: boolean // خيار لتفعيل/تعطيل الأدوات
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

    // قراءة البيانات
    const json = await request.json()
    const {
      messages,
      temperature = 0.5,
      max_tokens = 1200,
      use_tools = true
    } = json as ChatRequest

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

    // الحصول على OpenAI API Key من البيئة (لا نحتاج Supabase لـ site API)
    const openaiApiKey = process.env.OPENAI_API_KEY
    if (!openaiApiKey) {
      throw new Error("OPENAI_API_KEY not found in environment")
    }

    // الحصول على النموذج من البيئة
    const model = getOpenAIModel()

    // إنشاء عميل OpenAI
    const openai = new OpenAI({
      apiKey: openaiApiKey
    })

    // حقن System Prompt الثابت في بداية المحادثة
    // ✅ نستخدم sanitizedMessages (الرسائل المنظفة) وليس messages الخام
    const systemPrompt = getSiteSystemPrompt()
    const messagesWithSystem: ChatCompletionMessageParam[] = [
      {
        role: "system",
        content: systemPrompt
      },
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

        const finalStream = await openai.chat.completions.create({
          model,
          messages: streamMessages,
          temperature: 0.5,
          max_tokens: 500,
          stream: true
        })

        // استخرج validIds من tool results مسبقاً (لا يحتاج انتظار الـ stream)
        const validIds = toolResult.needsFinalCall
          ? extractValidArticleIds(streamMessages)
          : new Set<string>()
        const validIdsStr = [...validIds].join(",")

        // ✅ True streaming: أرسل chunks فوراً بدل الـ buffering
        // ألحق __VALID_IDS__ في نهاية الـ stream للـ client ليتحقق من الروابط محلياً
        const readable = new ReadableStream({
          async start(controller) {
            const enc = new TextEncoder()
            try {
              for await (const chunk of finalStream) {
                const content = chunk.choices[0]?.delta?.content || ""
                if (content) controller.enqueue(enc.encode(content))
              }
            } finally {
              controller.enqueue(enc.encode(`\n__VALID_IDS__:${validIdsStr}`))
              controller.close()
            }
          }
        })

        return new Response(readable, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
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

    const fallbackStream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of response) {
            const content = chunk.choices[0]?.delta?.content || ""
            if (content) {
              controller.enqueue(new TextEncoder().encode(content))
            }
          }
          controller.close()
        } catch (error) {
          controller.error(error)
        }
      }
    })

    return new Response(fallbackStream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
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
