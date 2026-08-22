"use client"
import { useState, useEffect, useRef } from "react"
import type { LocationStatus } from "./useChat"

/**
 * قائمة الخدمات — نقاط انطلاق حقيقية فقط (لا أدوات متابعة تحتاج سياقاً
 * سابقاً كـ"تفاصيل خبر برقم" أو "صور مشروع"). مصدرها CHATBOT-CAPABILITIES.md
 * — عند إضافة خدمة جديدة هناك، أضِفها هنا أيضاً يدوياً.
 */
const CAPABILITY_MENU = [
  { emoji: "📰", label: "الأخبار", query: "أعطني آخر الأخبار عن " },
  { emoji: "🏗️", label: "مشاريع العتبة", query: "ما هي مشاريع العتبة في " },
  { emoji: "📚", label: "الإصدارات والمطبوعات", query: "هل يوجد كتاب أو مجلة عن " },
  { emoji: "🎬", label: "مكتبة الفيديو", query: "أريد فيديو عن " },
  { emoji: "📍", label: "أماكن في كربلاء", query: "أقرب فندق أو حسينية إلى الحرم" },
  { emoji: "🕌", label: "خطب الجمعة", query: "ما آخر خطبة جمعة لديكم؟" },
  { emoji: "🔴", label: "البثّ المباشر", query: "أريد مشاهدة البث المباشر الآن" },
  { emoji: "🔎", label: "سجلّ المفقودات", query: "هل يوجد مستمسك مسجَّل باسم " },
  { emoji: "☎️", label: "أرقام التواصل", query: "أعطني رقم هاتف قسم " },
  { emoji: "📱", label: "التواصل الاجتماعي", query: "ما حساباتكم على مواقع التواصل الاجتماعي؟" },
  { emoji: "🕰️", label: "أوقات الصلاة", query: "متى أذان المغرب اليوم؟" },
  { emoji: "📊", label: "الإحصاءات والتحليلات", query: "كم خبراً نُشر عن " },
]

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
  locationStatus: LocationStatus
  onRequestLocation: () => void
}

/** نصّ/سمة زرّ الموقع بحسب الحالة — واحدة لعرضها ولإتاحة الضغط. */
function locationButtonProps(status: LocationStatus) {
  switch (status) {
    case "granted":
      return { label: "✓", title: "تم تفعيل موقعك — النتائج القريبة تُحسب من موقعك الفعلي", cls: "granted" }
    case "requesting":
      return { label: "…", title: "جارٍ طلب موقعك من المتصفح", cls: "requesting" }
    case "denied":
      return { label: "📍", title: "تعذّر الوصول لموقعك — يمكنك إعادة المحاولة أو ذكر مكان قريب منك بدلاً", cls: "denied" }
    case "unsupported":
      return { label: "📍", title: "متصفّحك لا يدعم مشاركة الموقع — يمكنك ذكر مكان قريب منك بدلاً", cls: "denied" }
    default:
      return { label: "📍", title: "شارك موقعك لنتائج \"الأقرب مني\" الفعلية (اختياري)", cls: "idle" }
  }
}

export default function InputZone({
  hasMessages, input, setInput, isLoading, onSend, onStop, welcomeIdx, welcomeVisible,
  locationStatus, onRequestLocation
}: InputZoneProps) {
  const [suggestions, setSuggestions] = useState(() => pickRandom(ALL_SUGGESTIONS, 6))
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // shuffle on every new chat session (when messages cleared)
  useEffect(() => {
    if (!hasMessages) setSuggestions(pickRandom(ALL_SUGGESTIONS, 6))
  }, [hasMessages])

  // إغلاق قائمة الخدمات بالضغط خارجها أو بـEsc
  useEffect(() => {
    if (!menuOpen) return
    function onOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false)
    }
    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setMenuOpen(false)
    }
    document.addEventListener("mousedown", onOutside)
    document.addEventListener("keydown", onEsc)
    return () => {
      document.removeEventListener("mousedown", onOutside)
      document.removeEventListener("keydown", onEsc)
    }
  }, [menuOpen])

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
        <div className="gm-capabilities-wrap" ref={menuRef}>
          <button
            type="button"
            className={`gm-capabilities-btn${menuOpen ? " open" : ""}`}
            onClick={() => setMenuOpen(v => !v)}
            title="ماذا يمكنني مساعدتك به؟"
            aria-label="عرض قائمة الخدمات المتاحة"
            aria-expanded={menuOpen}
          >
            /
          </button>
          {menuOpen && (
            <div className="gm-capabilities-menu" role="menu">
              {CAPABILITY_MENU.map((item, i) => (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  className="gm-capabilities-item"
                  onClick={() => {
                    setInput(item.query)
                    setMenuOpen(false)
                    requestAnimationFrame(() => {
                      const el = textareaRef.current
                      if (!el) return
                      el.focus()
                      el.setSelectionRange(el.value.length, el.value.length)
                      el.style.height = "auto"
                      el.style.height = Math.min(el.scrollHeight, 130) + "px"
                    })
                  }}
                >
                  <span className="gm-capabilities-item-emoji">{item.emoji}</span>
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </div>
        {(() => {
          const loc = locationButtonProps(locationStatus)
          return (
            <button
              type="button"
              className={`gm-location-btn ${loc.cls}`}
              onClick={onRequestLocation}
              disabled={locationStatus === "requesting"}
              title={loc.title}
              aria-label={loc.title}
            >
              {loc.label}
            </button>
          )
        })()}
        <textarea
          ref={textareaRef}
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
