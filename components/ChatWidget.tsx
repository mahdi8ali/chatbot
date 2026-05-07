"use client"

import { useEffect, useRef, useState } from "react"

// ── client-side link validation (mirrors server-side logic) ──────────────────
const META_LINE = "\n__VALID_IDS__:"

function extractNewsIdClient(url: string): string | null {
  const m = url.match(/[?&]id=(\d+)/) || url.match(/\/news\/(\d+)/)
  return m ? m[1] : null
}

function clientStripInvalidLinks(text: string, validIds: Set<string>): string {
  const hasIds = validIds.size > 0
  text = text.replace(
    /\[([^\]]*)\]\((https:\/\/(?:www\.)?alkafeel\.net\/news[^\s)]*)\)/g,
    (match, label, url) => {
      if (!hasIds) return label
      const id = extractNewsIdClient(url)
      return (!id || validIds.has(id)) ? match : label
    }
  )
  text = text.replace(
    /https:\/\/(?:www\.)?alkafeel\.net\/news\S*/g,
    (url) => {
      if (!hasIds) return ""
      const id = extractNewsIdClient(url)
      return (!id || validIds.has(id)) ? url : ""
    }
  )
  return text.replace(/🔗\s*(?:\[اقرأ المزيد\])?\s*\n?\s*$/gm, "").trim()
}
// ─────────────────────────────────────────────────────────────────────────────

interface Message {
  role: "user" | "assistant"
  content: string
}

interface ChatWidgetProps {
  apiEndpoint?: string
  title?: string
  subtitle?: string
}

export default function ChatWidget({
  apiEndpoint = "/api/chat/site",
  title = "مساعدك في المشاريع",
  subtitle = "اسأل عن مشاريع العتبة العباسية"
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [phaseVisible, setPhaseVisible] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const loadingPhrases = [
    "جارٍ تحليل طلبك…",
    "جارٍ البحث في المصادر…",
    "جارٍ جلب المعلومات…",
    "جارٍ صياغة الإجابة…",
  ]

  useEffect(() => {
    if (!isLoading || isStreaming) return
    setLoadingPhase(0)
    setPhaseVisible(true)
    const interval = setInterval(() => {
      setPhaseVisible(false)
      setTimeout(() => {
        setLoadingPhase(p => (p + 1) % loadingPhrases.length)
        setPhaseVisible(true)
      }, 350)
    }, 2200)
    return () => clearInterval(interval)
  }, [isLoading, isStreaming])

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
    }, 50)
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim()
    if (!messageText || isLoading) return

    setShowWelcome(false)
    setInput("")

    const newMessages: Message[] = [
      ...messages,
      { role: "user", content: messageText }
    ]
    setMessages(newMessages)
    setIsLoading(true)

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          temperature: 0.7,
          max_tokens: 2000,
          use_tools: true
        })
      })

      if (!response.ok) throw new Error("خطأ " + response.status)

      const contentType = (response.headers.get("content-type") || "").toLowerCase()
      let botReply = ""

      if (contentType.includes("application/json")) {
        // Function Calling mode — JSON response
        const data = await response.json()
        botReply = data.message || "لم أتمكن من فهم الرد."
      } else if (response.body) {
        // ✅ True streaming — نعرض النص تدريجياً فور وصوله
        setIsStreaming(true)
        let accumulated = ""
        // أضف رسالة البوت فارغة فوراً (تختفي الـ loading dots)
        setMessages([...newMessages, { role: "assistant", content: "" }])
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          // أخفِ سطر الـ metadata عن المستخدم إذا وصل ضمن chunk
          const mIdx = accumulated.lastIndexOf(META_LINE)
          const display = mIdx !== -1 ? accumulated.slice(0, mIdx) : accumulated
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: "assistant", content: display }
            return updated
          })
        }
        // معالجة metadata وتنظيف الروابط في نهاية الـ stream
        const metaIdx = accumulated.lastIndexOf(META_LINE)
        if (metaIdx !== -1) {
          const validIdsStr = accumulated.slice(metaIdx + META_LINE.length)
          const validIds = new Set(validIdsStr.split(",").filter(Boolean))
          let cleanText = accumulated.slice(0, metaIdx)
          cleanText = clientStripInvalidLinks(cleanText, validIds)
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: "assistant", content: cleanText }
            return updated
          })
        }
        return  // تجاوز setMessages في الأسفل
      } else {
        botReply = await response.text() || "لم يتم استلام رد."
      }

      setMessages([
        ...newMessages,
        { role: "assistant", content: botReply }
      ])
    } catch (err) {
      setMessages([
        ...newMessages,
        {
          role: "assistant",
          content: "⚠️ حدث خطأ في الاتصال. حاول مرة أخرى."
        }
      ])
    } finally {
      setIsLoading(false)
      setIsStreaming(false)
      textareaRef.current?.focus()
    }
  }

  const clearChat = () => {
    setMessages([])
    setShowWelcome(true)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const renderMarkdown = (text: string) => {
    if (!text) return ""

    // ── افصل سطور المصادر (📖 أو 🎬) عن نص الجواب ──────────────────────────
    const lines = text.split("\n")
    const sourceLines: string[] = []
    const bodyLines: string[] = []
    for (const line of lines) {
      if (/^[📖🎬]/.test(line.trim())) {
        sourceLines.push(line.trim())
      } else {
        bodyLines.push(line)
      }
    }

    const processBody = (raw: string) => {
      let html = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(
          /\[([^\]]+)\]\(([^)]+)\)/g,
          '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
        )
        .replace(/^(\d+)\.\s+(.+)$/gm, "<li>$2</li>")
        .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
        .replace(/^### (.+)$/gm, "<h3>$1</h3>")
        .replace(/^## (.+)$/gm, "<h2>$1</h2>")
        .replace(/\n/g, "<br>")
      html = html.replace(/((<li>.+?<\/li>)(<br>)?)+/g, match => {
        const items = match.replace(/<br>/g, "")
        return "<ol>" + items + "</ol>"
      })
      return html
    }

    let html = processBody(bodyLines.join("\n"))

    // ── عرض المصادر بشكل احترافي ─────────────────────────────────────────────
    if (sourceLines.length > 0) {
      const sourcesHtml = sourceLines.map(line => {
        // استخرج الرابط والنص
        const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
        const url    = linkMatch ? linkMatch[2] : ""
        const label  = linkMatch ? linkMatch[1] : ""
        // نص المصدر (بدون الإيموجي والرابط)
        const meta = line
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "")
          .replace(/[📖🎬]/g, "")
          .replace(/\*([^*]*)\*/g, "$1")
          .replace(/—\s*🔗\s*$/, "")
          .replace(/—\s*$/, "")
          .trim()

        const isVideo = line.startsWith("🎬")

        // SVG inline من Lucide — احترافي ونظيف
        const svgBook = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
        const svgVideo = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
        const svgArrow = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
        const iconSvg = isVideo ? svgVideo : svgBook

        return `<a class="gm-source-card" href="${url}" target="_blank" rel="noopener noreferrer">
          <span class="gm-source-right">
            <span class="gm-source-svg-icon">${iconSvg}</span>
            <span class="gm-source-text">${label}</span>
          </span>
          <span class="gm-source-arrow">${svgArrow}</span>
        </a>`
      }).join("")

      html += `<div class="gm-sources-block">
        <div class="gm-sources-sep"></div>
        <div class="gm-sources-title">المصادر</div>
        <div class="gm-sources-list">${sourcesHtml}</div>
      </div>`
    }

    return html
  }

  const quickButtons = [
    { emoji: "📚", label: "المشاريع الثقافية", query: "أعرض لي المشاريع الثقافية" },
    { emoji: "🎓", label: "المشاريع التعليمية", query: "أعرض لي المشاريع التعليمية" },
    { emoji: "🕌", label: "مشاريع الصحن ومقترباته", query: "أعرض لي مشاريع الصحن ومقترباته" },
    { emoji: "🏥", label: "المشاريع الطبية", query: "أعرض لي المشاريع الطبية" },
    { emoji: "📈", label: "المشاريع التنموية", query: "أعرض لي المشاريع التنموية" },
    { emoji: "🔧", label: "خدمات عامة", query: "أعرض لي خدمات عامة" },
    { emoji: "🏛️", label: "تشكيلات إدارية", query: "أعرض لي تشكيلات إدارية" }
  ]

  const hasMessages = messages.length > 0

  return (
    <>
      <style jsx global>{`
        /* ═══════════════════════════════════════════════
           ROOT
        ═══════════════════════════════════════════════ */
        .gm-root {
          display: flex;
          flex-direction: column;
          height: 100%;
          width: 100%;
          background: #ffffff;
          direction: rtl;
          font-family: 'Google Sans', 'Segoe UI', system-ui, sans-serif;
          color: #1f1f1f;
          overflow: hidden;
        }

        /* ═══════════════════════════════════════════════
           HEADER
        ═══════════════════════════════════════════════ */
        .gm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0 24px;
          height: 56px;
          border-bottom: 1px solid #e8eaed;
          flex-shrink: 0;
          background: #fff;
        }

        .gm-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 16px;
          font-weight: 500;
          color: #1f1f1f;
        }

        .gm-logo-dot {
          width: 26px;
          height: 26px;
          border-radius: 50%;
          background: #4e6833;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 10px;
          font-weight: 700;
          color: #fff;
          flex-shrink: 0;
        }

        .gm-clear-btn {
          background: transparent;
          border: 1px solid #dadce0;
          color: #5f6368;
          padding: 7px 16px;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          font-family: inherit;
        }
        .gm-clear-btn:hover {
          background: #f8f9fa;
          border-color: #bdc1c6;
        }

        /* ═══════════════════════════════════════════════
           STAGE  (relative container for all layers)
        ═══════════════════════════════════════════════ */
        .gm-stage {
          flex: 1;
          position: relative;
          overflow: hidden;
        }

        /* ═══════════════════════════════════════════════
           WELCOME LAYER  (fades out when messages arrive)
        ═══════════════════════════════════════════════ */
        .gm-welcome-layer {
          position: absolute;
          inset: 0;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: flex-start;
          padding: 64px 24px 0;
          text-align: center;
          gap: 20px;
          opacity: 1;
          transition: opacity 0.35s ease, transform 0.35s ease;
          pointer-events: all;
          overflow: hidden;
        }
        .gm-welcome-layer.out {
          opacity: 0;
          transform: translateY(-12px);
          pointer-events: none;
        }

        .gm-welcome-title {
          font-size: 26px;
          font-weight: 400;
          color: #1f1f1f;
          margin: 0;
          line-height: 1.45;
        }
        .gm-welcome-title em {
          font-style: normal;
          font-weight: 600;
          color: #4e6833;
        }

        .gm-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          justify-content: center;
          max-width: 640px;
        }

        .gm-chip {
          background: #fff;
          border: 1px solid #dadce0;
          color: #3c4043;
          padding: 9px 18px;
          border-radius: 20px;
          font-size: 13.5px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .gm-chip:hover {
          background: #f8f9fa;
          border-color: #9aa0a6;
        }

        /* ═══════════════════════════════════════════════
           MESSAGES LAYER  (fades in, scrollable)
        ═══════════════════════════════════════════════ */
        .gm-messages-layer {
          position: absolute;
          inset: 0;
          overflow-y: auto;
          padding: 28px 16px 110px;
          opacity: 0;
          transition: opacity 0.3s ease 0.1s;
          pointer-events: none;
          scrollbar-width: thin;
          scrollbar-color: #dadce0 transparent;
        }
        .gm-messages-layer::-webkit-scrollbar { width: 4px; }
        .gm-messages-layer::-webkit-scrollbar-thumb {
          background: #dadce0;
          border-radius: 2px;
        }
        .gm-messages-layer.in {
          opacity: 1;
          pointer-events: all;
        }

        .gm-messages-inner {
          max-width: 720px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        /* ═══════════════════════════════════════════════
           MESSAGE ROWS
        ═══════════════════════════════════════════════ */
        .gm-row {
          display: flex;
          gap: 12px;
          animation: msgIn 0.3s ease;
        }

        @keyframes msgIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* كل الرسائل من اليمين — المشروع عربي بالكامل */
        .gm-row.user,
        .gm-row.assistant {
          flex-direction: row;
          justify-content: flex-start;
          align-items: flex-start;
        }

        .gm-ai-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1px solid #dadce0;
          background: #fff;
          color: #4e6833;
          font-size: 9px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 3px;
        }

        /* فقاعة المستخدم */
        .gm-row.user .gm-bubble {
          background: #f1f3f4;
          color: #1f1f1f;
          border: 1px solid #e8eaed;
          border-radius: 18px 4px 18px 18px;
          padding: 11px 18px;
          max-width: 65%;
          font-size: 15px;
          line-height: 1.7;
        }

        /* نص البوت — بدون فقاعة، فقط نص */
        .gm-row.assistant .gm-bubble {
          color: #1f1f1f;
          max-width: 78%;
          font-size: 15px;
          line-height: 1.8;
          padding: 4px 0;
        }

        /* Markdown */
        .gm-bubble strong  { font-weight: 600; }
        .gm-bubble a       { color: #4e6833; text-decoration: underline; }
        .gm-bubble ol,
        .gm-bubble ul      { margin: 8px 0; padding-right: 20px; }
        .gm-bubble li      { margin: 5px 0; }
        .gm-bubble h2,
        .gm-bubble h3      { font-size: 15.5px; font-weight: 600; margin: 12px 0 5px; }

        /* ═══════════════════════════════════════════════
           TYPING DOTS
        ═══════════════════════════════════════════════ */
        .gm-typing {
          display: flex;
          gap: 5px;
          align-items: center;
          padding: 8px 0;
        }
        .gm-typing span {
          width: 7px; height: 7px; border-radius: 50%;
          background: #9aa0a6;
          animation: typingDot 1.4s ease-in-out infinite;
        }
        .gm-typing span:nth-child(2) { animation-delay: 0.2s; }
        .gm-typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes typingDot {
          0%, 80%, 100% { opacity: 0.35; transform: scale(0.75); }
          40%           { opacity: 1;    transform: scale(1); }
        }

        /* ── Loading phrase ── */
        .gm-loading-text {
          display: inline-block;
          font-size: 14.5px;
          color: #5f6368;
          opacity: 0;
          transform: translateY(8px);
          transition: opacity 0.32s ease, transform 0.32s ease;
        }
        .gm-loading-text.visible {
          opacity: 1;
          transform: translateY(0);
        }

        /* ═══════════════════════════════════════════════
           SOURCES BLOCK
        ═══════════════════════════════════════════════ */
        .gm-sources-block {
          margin-top: 16px;
          direction: rtl;
        }

        .gm-sources-sep {
          height: 1px;
          background: #e8eaed;
          margin-bottom: 12px;
        }

        .gm-sources-title {
          font-size: 11px;
          font-weight: 600;
          color: #bdc1c6;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          margin-bottom: 8px;
        }

        .gm-sources-list {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .gm-source-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 10px 14px;
          border: 1px solid #e8eaed;
          border-radius: 8px;
          text-decoration: none !important;
          background: #fff;
          color: #3c4043;
          transition: background 0.15s, border-color 0.15s;
          direction: rtl;
        }
        .gm-source-card:hover {
          background: #f8f9fa;
          border-color: #bdc1c6;
        }

        .gm-source-right {
          display: flex;
          align-items: center;
          gap: 9px;
          overflow: hidden;
        }

        .gm-source-svg-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: #5f6368;
        }

        .gm-source-text {
          font-size: 13.5px;
          color: #3c4043;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 400;
        }

        .gm-source-arrow {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: #bdc1c6;
          margin-right: 10px;
        }

        /* ═══════════════════════════════════════════════
           STREAMING CURSOR
        ═══════════════════════════════════════════════ */
        .gm-cursor {
          display: inline-block;
          width: 2px;
          height: 1em;
          background: #4e6833;
          margin-right: 2px;
          vertical-align: text-bottom;
          animation: blink 0.7s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        /* ═══════════════════════════════════════════════
           INPUT ZONE
           — يبدأ في المنتصف العمودي، ينزل للأسفل بـ transition
        ═══════════════════════════════════════════════ */
        .gm-input-zone {
          position: absolute;
          left: 50%;
          transform: translateX(-50%);
          width: calc(100% - 32px);
          max-width: 680px;
          bottom: 16px;
          transition: bottom 0.48s cubic-bezier(0.4, 0, 0.2, 1);
          z-index: 10;
        }
        /* الوضع الأولي: أسفل المنتصف عمودياً */
        .gm-input-zone.centered {
          bottom: 28%;
        }

        .gm-input-box {
          display: flex;
          align-items: flex-end;
          background: #fff;
          border: 1px solid #dadce0;
          border-radius: 24px;
          padding: 12px 16px;
          gap: 10px;
          transition: border-color 0.2s;
        }
        .gm-input-box:focus-within {
          border-color: #9aa0a6;
        }

        .gm-textarea {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: #1f1f1f;
          font-size: 15px;
          font-family: inherit;
          resize: none;
          max-height: 130px;
          min-height: 24px;
          line-height: 1.5;
          direction: rtl;
        }
        .gm-textarea::placeholder { color: #9aa0a6; }

        .gm-send-btn {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          border: none;
          background: #4e6833;
          color: #fff;
          font-size: 17px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.2s, opacity 0.2s;
          line-height: 1;
        }
        .gm-send-btn:hover:not(:disabled) { background: #3a5025; }
        .gm-send-btn:disabled {
          background: #e8eaed;
          color: #9aa0a6;
          cursor: not-allowed;
        }

        .gm-hint {
          text-align: center;
          font-size: 11px;
          color: #9aa0a6;
          margin-top: 9px;
        }
      `}</style>

      <div className="gm-root">

        {/* ── Header ── */}
        <div className="gm-header">
          <div className="gm-logo">
            <div className="gm-logo-dot">AI</div>
            <span>المساعد الذكي — شبكة الكفيل</span>
          </div>
          {hasMessages && (
            <button className="gm-clear-btn" onClick={clearChat}>محادثة جديدة</button>
          )}
        </div>

        {/* ── Stage ── */}
        <div className="gm-stage">

          {/* Welcome Layer */}
          <div className={`gm-welcome-layer${hasMessages ? " out" : ""}`}>
            <h1 className="gm-welcome-title">
              مرحباً،<br />كيف يمكنني <em>مساعدتك</em> اليوم؟
            </h1>
            <div className="gm-chips">
              {quickButtons.map((btn, i) => (
                <button key={i} className="gm-chip" onClick={() => sendMessage(btn.query)}>
                  <span>{btn.emoji}</span>
                  {btn.label}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Layer */}
          <div className={`gm-messages-layer${hasMessages ? " in" : ""}`}>
            <div className="gm-messages-inner">
              {messages.map((msg, i) => (
                <div key={i} className={`gm-row ${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className="gm-ai-dot">AI</div>
                  )}
                  <div
                    className="gm-bubble"
                    dangerouslySetInnerHTML={{
                      __html:
                        renderMarkdown(msg.content) +
                        (isStreaming && i === messages.length - 1 && msg.role === "assistant"
                          ? '<span class="gm-cursor"></span>'
                          : "")
                    }}
                  />
                </div>
              ))}

              {isLoading && !isStreaming && (
                <div className="gm-row assistant">
                  <div className="gm-ai-dot">AI</div>
                  <div className="gm-bubble">
                    <span
                      className={`gm-loading-text${phaseVisible ? " visible" : ""}`}
                    >
                      {loadingPhrases[loadingPhase]}
                    </span>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* Input Zone — slides from center to bottom */}
          <div className={`gm-input-zone${!hasMessages ? " centered" : ""}`}>
            <div className="gm-input-box">
              <textarea
                ref={textareaRef}
                className="gm-textarea"
                value={input}
                onChange={e => {
                  setInput(e.target.value)
                  e.target.style.height = "auto"
                  e.target.style.height = Math.min(e.target.scrollHeight, 130) + "px"
                }}
                onKeyDown={handleKeyDown}
                placeholder="اسألني أي شيء…"
                rows={1}
                disabled={isLoading}
              />
              <button
                className="gm-send-btn"
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
              >
                {isLoading ? "⟳" : "↑"}
              </button>
            </div>
            <div className="gm-hint">Enter للإرسال &nbsp;·&nbsp; Shift+Enter لسطر جديد</div>
          </div>

        </div>
      </div>
    </>
  )
}
