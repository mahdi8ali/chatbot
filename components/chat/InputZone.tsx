"use client"

const QUICK_BUTTONS = [
  { emoji: "📚", label: "المشاريع الثقافية",        query: "أعرض لي المشاريع الثقافية" },
  { emoji: "🎓", label: "المشاريع التعليمية",       query: "أعرض لي المشاريع التعليمية" },
  { emoji: "🕌", label: "مشاريع الصحن ومقترباته",  query: "أعرض لي مشاريع الصحن ومقترباته" },
  { emoji: "🏥", label: "المشاريع الطبية",          query: "أعرض لي المشاريع الطبية" },
  { emoji: "📈", label: "المشاريع التنموية",        query: "أعرض لي المشاريع التنموية" },
]

const WELCOME_PHRASES = [
  { prefix: "اطرح",      word: "تساؤلك" },
  { prefix: "اكتشف",    word: "مشاريعنا" },
  { prefix: "تعرّف على", word: "إنجازاتنا" },
  { prefix: "ابحث في",  word: "أرشيفنا" },
  { prefix: "استفسر عن", word: "مبادراتنا" },
]

interface InputZoneProps {
  hasMessages: boolean
  input: string
  setInput: (v: string) => void
  isLoading: boolean
  onSend: (text?: string) => void
  onStop: () => void
  welcomeIdx: number
  welcomeVisible: boolean
}

export default function InputZone({
  hasMessages, input, setInput, isLoading, onSend, onStop, welcomeIdx, welcomeVisible
}: InputZoneProps) {
  return (
    <div className={`gm-input-zone${!hasMessages ? " centered" : ""}`}>
      {!hasMessages && (
        <div className="gm-welcome-head">
          <span className="gm-welcome-greeting">السلام عليكم،</span>
          <h1 className="gm-welcome-title">
            <span className={`rotating${welcomeVisible ? "" : " hidden"}`}>
              {WELCOME_PHRASES[welcomeIdx].prefix}{" "}
              <em>{WELCOME_PHRASES[welcomeIdx].word}</em>
            </span>
          </h1>
        </div>
      )}
      <div className="gm-input-box">
        <textarea
          className="gm-textarea"
          value={input}
          onChange={e => {
            setInput(e.target.value)
            e.target.style.height = "auto"
            e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px"
          }}
          onKeyDown={e => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault()
              onSend()
            }
          }}
          placeholder="اسألني أي شيء…"
          rows={1}
        />
        <button
          className={`gm-send-btn${isLoading ? " stop" : ""}`}
          onClick={() => isLoading ? onStop() : onSend()}
          disabled={!isLoading && !input.trim()}
          title={isLoading ? "إيقاف" : "إرسال"}
        >
          {isLoading ? (
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
              <rect x="4" y="4" width="16" height="16" rx="2"/>
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "scaleX(-1)" }}>
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
            </svg>
          )}
        </button>
      </div>
      {hasMessages && (
        <div className="gm-hint" style={{ marginTop: "10px" }}>
          المساعد الذكي هو نموذج ذكاء اصطناعي وقد ينتج عنه أخطاء.
        </div>
      )}
      {!hasMessages && (
        <div className="gm-chips">
          {QUICK_BUTTONS.map((btn, i) => (
            <button key={i} className="gm-chip" onClick={() => onSend(btn.query)}>
              <span>{btn.emoji}</span>
              {btn.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
