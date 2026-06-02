"use client"

import { useState } from "react"
import { ThumbsUp, ThumbsDown } from "lucide-react"

interface FeedbackButtonsProps {
  chatLogId: string
  sessionId?: string
}

export default function FeedbackButtons({ chatLogId, sessionId }: FeedbackButtonsProps) {
  const [state, setState] = useState<"idle" | "not_helpful" | "done">("idle")
  const [activeRating, setActiveRating] = useState<"helpful" | "not_helpful" | null>(null)
  const [note, setNote] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const submit = async (rating: "helpful" | "not_helpful", feedbackNote?: string) => {
    setSubmitting(true)
    setActiveRating(rating)
    try {
      await fetch("/api/chat/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_log_id: chatLogId,
          session_id: sessionId,
          rating,
          feedback_note: feedbackNote,
        }),
      })
    } catch {
      // إذا فشل الإرسال، نُظهر الشكر على أي حال (لا نُظهر أخطاء للمستخدم)
    }
    setState("done")
    setSubmitting(false)
  }

  if (state === "done") {
    return <div className="gm-feedback-done">شكرًا، تم تسجيل تقييمك.</div>
  }

  if (state === "not_helpful") {
    return (
      <div className="gm-feedback-note">
        <textarea
          className="gm-feedback-textarea"
          placeholder="مثلاً: الجواب غير دقيق، لم يفهم سؤالي…"
          value={note}
          onChange={e => setNote(e.target.value)}
          maxLength={500}
          rows={2}
        />
        <div className="gm-feedback-actions">
          <button
            className="gm-feedback-send"
            onClick={() => submit("not_helpful", note)}
            disabled={submitting}
          >
            إرسال الملاحظة
          </button>
          <button
            className="gm-feedback-cancel"
            onClick={() => setState("idle")}
            disabled={submitting}
          >
            إلغاء
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="gm-feedback">
      <span className="gm-feedback-label">هل كانت الإجابة مفيدة؟</span>
      <button
        className={`gm-feedback-btn helpful${activeRating === "helpful" ? " active" : ""}`}
        onClick={() => submit("helpful")}
        title="مفيدة"
        aria-label="مفيدة"
        disabled={submitting}
      >
        <ThumbsUp size={14} strokeWidth={2} />
      </button>
      <button
        className={`gm-feedback-btn unhelpful${activeRating === "not_helpful" ? " active" : ""}`}
        onClick={() => setState("not_helpful")}
        title="غير مفيدة"
        aria-label="غير مفيدة"
        disabled={submitting}
      >
        <ThumbsDown size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
