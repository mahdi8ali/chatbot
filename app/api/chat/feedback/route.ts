import { saveFeedback } from "@/lib/server/chat-logger"
import { corsHeaders, isAllowedOrigin, forbiddenOrigin } from "@/lib/server/cors"
import { applyRateLimit, createRateLimitResponse } from "@/lib/server/rate-limiter"

export async function POST(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && !isAllowedOrigin(origin)) return forbiddenOrigin(origin)
  const CORS_HEADERS = corsHeaders(origin)

  // حدّ معدّل مستقلّ: النقطة بلا مصادقة وchat_log_id متسلسل، فبلا حدّ يمكن
  // إغراق chat_feedback بتقييمات مزوّرة وإفساد لوحة التحليلات.
  const rl = applyRateLimit(request, {
    maxRequests: 30,
    windowMs: 60 * 1000,
    blockDurationMs: 5 * 60 * 1000,
  })
  if (!rl.allowed) return createRateLimitResponse(rl.retryAfter!)

  try {
    const body = await request.json()
    const { chat_log_id, session_id, rating, feedback_note } = body

    if (!chat_log_id || !rating) {
      return Response.json({ error: "chat_log_id و rating مطلوبان" }, { status: 400, headers: CORS_HEADERS })
    }

    if (!["helpful", "not_helpful"].includes(rating)) {
      return Response.json({ error: "rating يجب أن يكون helpful أو not_helpful" }, { status: 400, headers: CORS_HEADERS })
    }

    const ok = await saveFeedback({
      chatLogId: String(chat_log_id),
      sessionId: session_id ? String(session_id) : undefined,
      rating: rating as "helpful" | "not_helpful",
      feedbackNote: feedback_note ? String(feedback_note) : undefined,
    })

    return Response.json({ success: ok }, { headers: CORS_HEADERS })
  } catch (err: any) {
    console.error("[Feedback API]", err)
    return Response.json({ error: "خطأ في الخادم" }, { status: 500, headers: CORS_HEADERS })
  }
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get("origin")
  if (origin && !isAllowedOrigin(origin)) return forbiddenOrigin(origin)
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}
