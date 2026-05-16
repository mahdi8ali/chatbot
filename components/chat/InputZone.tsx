"use client"
import { useState, useEffect } from "react"

const ALL_SUGGESTIONS = [
  // الأماكن
  { emoji: "🏨", text: "فنادق قريبة من الصحن",        query: "أقرب فنادق من الصحن الحسيني" },
  { emoji: "🕌", text: "مزارات كربلاء",               query: "أعرض لي مزارات كربلاء" },
  { emoji: "🏥", text: "مرافق صحية قريبة",            query: "أقرب مرافق صحية من الصحن الحسيني" },
  { emoji: "🏩", text: "حسينيات قريبة",               query: "أقرب حسينية من الصحن الحسيني" },
  { emoji: "🚌", text: "نقاط التجمع والنقل",          query: "أين نقاط التجمع والنقل في كربلاء؟" },
  { emoji: "🍽️", text: "مواكب خدمية قريبة",           query: "أقرب مواكب خدمية من الصحن" },
  { emoji: "📍", text: "أين يقع مرقد الإمام الحسين؟", query: "أين يقع مرقد الإمام الحسين؟" },
  { emoji: "📍", text: "موقع مقام أبي الفضل",         query: "أين مقام العباس ابن علي؟" },
  // الصلاة
  { emoji: "🕐", text: "أوقات الصلاة اليوم",          query: "ما هي أوقات الصلاة اليوم؟" },
  { emoji: "🌅", text: "متى يأذن الفجر؟",             query: "متى أذان الفجر اليوم؟" },
  { emoji: "🌇", text: "متى يأذن المغرب؟",            query: "متى أذان المغرب اليوم؟" },
  { emoji: "☀️", text: "وقت الشروق اليوم",            query: "ما وقت الشروق اليوم في كربلاء؟" },
  // المشاريع
  { emoji: "🏗️", text: "مشاريع الصحن الحسيني",       query: "أعرض لي مشاريع الصحن الحسيني" },
  { emoji: "📚", text: "المشاريع الثقافية",            query: "أعرض لي المشاريع الثقافية" },
  { emoji: "🎓", text: "المشاريع التعليمية",           query: "أعرض لي المشاريع التعليمية" },
  { emoji: "🏥", text: "المشاريع الطبية",             query: "أعرض لي المشاريع الطبية" },
  { emoji: "📊", text: "إحصاءات المشاريع",            query: "ما هي إحصاءات مشاريع العتبة الحسينية؟" },
  { emoji: "🔍", text: "ابحث عن مشروع محدد",          query: "ابحث لي عن مشروع توسعة الصحن" },
  // الفيديوهات
  { emoji: "🎬", text: "فيديوهات محرم الحرام",        query: "فيديوهات محرم الحرام" },
  { emoji: "🎤", text: "خطب الجمعة",                  query: "فيديوهات خطبة الجمعة" },
  { emoji: "🎞️", text: "فيديوهات زيارة الأربعين",    query: "فيديوهات زيارة الأربعين" },
  { emoji: "🎥", text: "فيديوهات أعمال العتبة",       query: "فيديوهات أعمال وإنجازات العتبة الحسينية" },
  // الأخبار
  { emoji: "📰", text: "آخر أخبار العتبة",            query: "أعرض لي آخر أخبار العتبة الحسينية" },
  { emoji: "📅", text: "أخبار المناسبات الدينية",     query: "أخبار المناسبات والإحياءات الدينية" },
  { emoji: "🌍", text: "أخبار الزيارات",              query: "أخبار الزيارات والزوار" },
]

function pickRandom<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5)
  return shuffled.slice(0, n)
}

const WELCOME_PHRASES = [
  { prefix: "اطرح",      word: "تساؤلك" },
  { prefix: "اكتشف",    word: "خدماتنا" },
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
