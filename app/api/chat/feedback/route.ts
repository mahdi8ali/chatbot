import { saveFeedback } from "@/lib/server/chat-logger"

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { chat_log_id, session_id, rating, feedback_note } = body

    if (!chat_log_id || !rating) {
      return Response.json({ error: "chat_log_id و rating مطلوبان" }, { status: 400 })
    }

    if (!["helpful", "not_helpful"].includes(rating)) {
      return Response.json({ error: "rating يجب أن يكون helpful أو not_helpful" }, { status: 400 })
    }

    const ok = await saveFeedback({
      chatLogId: String(chat_log_id),
      sessionId: session_id ? String(session_id) : undefined,
      rating: rating as "helpful" | "not_helpful",
      feedbackNote: feedback_note ? String(feedback_note) : undefined,
    })

    return Response.json({ success: ok })
  } catch (err: any) {
    console.error("[Feedback API]", err)
    return Response.json({ error: "خطأ في الخادم" }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  })
}
