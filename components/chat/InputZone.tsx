"use client"
import { useState, useEffect } from "react"

const ALL_SUGGESTIONS = [
  // الأماكن
  // { emoji: "🏨", text: "فنادق قريبة من الحرم",          query: "أقرب فنادق إلى العتبة العباسية المقدسة" },
  // { emoji: "🕌", text: "مزارات كربلاء المقدسة",         query: "أعرض لي مزارات كربلاء المقدسة" },
  // { emoji: "🏥", text: "مرافق صحية قريبة",              query: "أقرب مرافق صحية إلى العتبة العباسية المقدسة" },
  // { emoji: "🏩", text: "حسينيات قريبة من الحرم",        query: "أقرب حسينية إلى العتبة العباسية المقدسة" },
  // { emoji: "🚌", text: "نقاط التجمع والنقل",            query: "أين نقاط التجمع والنقل في كربلاء؟" },
  // { emoji: "🍽️", text: "مواكب خدمية قريبة",             query: "أقرب مواكب خدمية إلى العتبة العباسية المقدسة" },
  // { emoji: "📍", text: "موقع مرقد الإمام الحسين (ع)",   query: "أين يقع مرقد الإمام الحسين عليه السلام؟" },
  // { emoji: "📍", text: "موقع مقام أبي الفضل (ع)",       query: "أين يقع مقام أبي الفضل العباس عليه السلام؟" },
  // الصلاة
  { emoji: "🕐", text: "أوقات الصلاة اليوم", query: "ما هي أوقات الصلاة اليوم في كربلاء؟" },
  { emoji: "🌅", text: "متى يأذن الفجر؟", query: "متى أذان الفجر اليوم؟" },
  { emoji: "🌇", text: "متى يأذن المغرب؟", query: "متى أذان المغرب اليوم؟" },
  { emoji: "☀️", text: "وقت الشروق اليوم", query: "ما وقت شروق الشمس اليوم في كربلاء؟" },
  // المشاريع
  { emoji: "🏗️", text: "مشاريع العتبة العباسية", query: "أعرض لي أبرز مشاريع العتبة العباسية المقدسة" },
  { emoji: "📚", text: "المشاريع الثقافية", query: "أعرض لي المشاريع الثقافية للعتبة العباسية" },
  { emoji: "🎓", text: "المشاريع التعليمية", query: "أعرض لي المشاريع التعليمية للعتبة العباسية" },
  { emoji: "🏥", text: "المشاريع الطبية", query: "أعرض لي المشاريع الطبية للعتبة العباسية" },
  { emoji: "📊", text: "إحصاءات المشاريع", query: "ما هي إحصاءات مشاريع العتبة العباسية المقدسة؟" },
  { emoji: "🔍", text: "ابحث عن مشروع محدد", query: "ابحث لي عن مشروع توسعة الحرم العباسي" },
  // الفيديوهات
  { emoji: "🎬", text: "فيديوهات محرم الحرام", query: "أريد فيديوهات عن إحياءات محرم الحرام" },
  { emoji: "🎤", text: "خطب الجمعة", query: "أريد فيديوهات خطبة الجمعة" },
  { emoji: "🎞️", text: "فيديوهات زيارة الأربعين", query: "أريد فيديوهات زيارة الأربعين المباركة" },
  { emoji: "🎥", text: "فيديوهات إنجازات العتبة", query: "أريد فيديوهات أعمال وإنجازات العتبة العباسية المقدسة" },
  // الأخبار
  { emoji: "📰", text: "آخر أخبار العتبة العباسية", query: "أعرض لي آخر أخبار العتبة العباسية المقدسة" },
  { emoji: "📅", text: "أخبار المناسبات الدينية", query: "أخبار المناسبات والإحياءات الدينية" },
  { emoji: "🌍", text: "أخبار الزيارات والزوار", query: "أخبار زيارات وزوار العتبة العباسية المقدسة" },
]

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

const WELCOME_PHRASES = [
  { prefix: "اطرح", word: "تساؤلك" },
  { prefix: "اكتشف", word: "خدماتنا" },
  { prefix: "تعرّف على", word: "إنجازاتنا" },
  { prefix: "ابحث في", word: "أرشيفنا" },
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
  const [suggestions, setSuggestions] = useState(() => pickRandom(ALL_SUGGESTIONS, 6))

  // shuffle on every new chat session (when messages cleared)
  useEffect(() => {
    if (!hasMessages) setSuggestions(pickRandom(ALL_SUGGESTIONS, 6))
  }, [hasMessages])

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
              <rect x="4" y="4" width="16" height="16" rx="2" />
            </svg>
          ) : (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ transform: "scaleX(-1)" }}>
              <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
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
          {suggestions.map((s, i) => (
            <button key={i} className="gm-chip" onClick={() => onSend(s.query)}>
              <span>{s.emoji}</span>
              {s.text}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
