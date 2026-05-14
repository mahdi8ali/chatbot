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
  onClose?: () => void
}

export default function ChatWidget({
  apiEndpoint = "/api/chat/site",
  title = "مساعدك في المشاريع",
  subtitle = "اسأل عن مشاريع العتبة العباسية",
  onClose
}: ChatWidgetProps) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const [showWelcome, setShowWelcome] = useState(true)
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [phaseVisible, setPhaseVisible] = useState(true)
  const [darkMode, setDarkMode] = useState(false)

  const welcomePhrases = [
    { prefix: "اطرح",    word: "تساؤلك" },
    { prefix: "اكتشف",  word: "مشاريعنا" },
    { prefix: "تعرّف على", word: "إنجازاتنا" },
    { prefix: "ابحث في", word: "أرشيفنا" },
    { prefix: "استفسر عن", word: "مبادراتنا" },
  ]
  const [welcomeIdx, setWelcomeIdx] = useState(0)
  const [welcomeVisible, setWelcomeVisible] = useState(true)

  useEffect(() => {
    if (messages.length > 0) return
    const interval = setInterval(() => {
      setWelcomeVisible(false)
      setTimeout(() => {
        setWelcomeIdx(i => (i + 1) % welcomePhrases.length)
        setWelcomeVisible(true)
      }, 400)
    }, 2800)
    return () => clearInterval(interval)
  }, [messages.length])
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

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const response = await fetch(apiEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
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
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages([
          ...newMessages,
          {
            role: "assistant",
            content: "⚠️ حدث خطأ في الاتصال. حاول مرة أخرى."
          }
        ])
      }
    } finally {
      abortControllerRef.current = null
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

    // ── افصل سطور المصادر (📖 أو 🎬 أو 🔗) عن نص الجواب ─────────────────────
    const lines = text.split("\n")
    const sourceLines: string[] = []
    const bodyLines: string[] = []
    for (const line of lines) {
      const t = line.trim()
      if (/^[\u{1F4D6}\u{1F3AC}]/u.test(t)) {
        sourceLines.push(t)
      } else if (/^🔗\s*\[/.test(t) || /^\*\(تاريخ/.test(t)) {
        sourceLines.push(t)
      } else {
        bodyLines.push(line)
      }
    }

    // ── تحويل النص العادي إلى HTML ─────────────────────────────────────────
    const processPlainText = (raw: string): string => {
      let html = raw
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*([^*]+)\*/g, "<em>$1</em>")
        .replace(
          /!\[([^\]]*)\]\(([^)]+)\)/g,
          '<img class="gm-project-img" src="$2" alt="$1" loading="lazy" />'
        )
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
      // أرقام هاتف وإيميلات → روابط قابلة للنقر
      html = html.replace(/(00964\d{7,12})/g, n => `<a href="tel:${n}" class="gm-phone-link">${n}</a>`)
      html = html.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, e => `<a href="mailto:${e}" class="gm-email-link">${e}</a>`)
      return html
    }

    // ── كشف كتل الاتصال وتحويلها لبطاقات جميلة ─────────────────────────────
    // نقسّم الـ body إلى مقاطع: نص عادي / بطاقة اتصال
    const CONTACT_EMOJI = /^(📍|📞|📧)/u
    const inputLines = bodyLines
    const segments: Array<{ type: "text" | "contact"; lines: string[]; name?: string }> = []
    let i = 0
    while (i < inputLines.length) {
      const line = inputLines[i]
      const trimmed = line.trim()
      // هل هذا رأس بطاقة اتصال؟ (سطر **نص** يتبعه سطر يبدأ بإيموجي اتصال)
      const isContactHeader =
        /^\*\*[^*]+\*\*\s*$/.test(trimmed) &&
        inputLines.slice(i + 1, i + 6).some(l => CONTACT_EMOJI.test(l.trim()))
      if (isContactHeader) {
        const name = trimmed.replace(/^\*\*|\*\*$/g, "")
        const contactLines: string[] = []
        i++
        while (i < inputLines.length && CONTACT_EMOJI.test(inputLines[i].trim())) {
          contactLines.push(inputLines[i].trim())
          i++
        }
        segments.push({ type: "contact", lines: contactLines, name })
      } else {
        // أضف للمقطع النصي الأخير أو ابدأ مقطعاً جديداً
        if (segments.length === 0 || segments[segments.length - 1].type !== "text") {
          segments.push({ type: "text", lines: [] })
        }
        segments[segments.length - 1].lines.push(line)
        i++
      }
    }

    // ── ابنِ HTML النهائي ─────────────────────────────────────────────────────
    let html = ""
    for (const seg of segments) {
      if (seg.type === "text") {
        html += processPlainText(seg.lines.join("\n"))
      } else {
        // بطاقة اتصال
        const svgPin   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
        const svgPhone = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>`
        const svgMail  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
        const rowsHtml = seg.lines.map(r => {
          const firstChar = [...r][0]
          const content = r.replace(firstChar, "").trim()
          let svgIcon = svgPin
          let rowClass = "gm-contact-row"
          if (firstChar === "📞") { svgIcon = svgPhone; rowClass += " phone" }
          else if (firstChar === "📧") { svgIcon = svgMail; rowClass += " email" }
          const formatted = content
            .replace(/(00964\d{7,12})/g, n => `<a class="gm-phone-link" href="tel:${n}">${n}</a>`)
            .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, e => `<a class="gm-email-link" href="mailto:${e}">${e}</a>`)
          return `<div class="${rowClass}"><span class="ci-icon">${svgIcon}</span><span>${formatted}</span></div>`
        }).join("")
        html += `<div class="gm-contact-block"><div class="gm-contact-name">${seg.name}</div>${rowsHtml}</div>`
      }
    }

    // ── عرض المصادر بشكل احترافي ─────────────────────────────────────────────
    if (sourceLines.length > 0) {
      const sourcesHtml = sourceLines.map(line => {
        // استخرج الرابط والنص
        const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
        const url    = linkMatch ? linkMatch[2] : ""
        const label  = linkMatch ? linkMatch[1] : ""

        // تجاهل الكارد إذا لم يكن هناك رابط حقيقي
        if (!url || url === "" || url === "#") return ""
        // نص المصدر (بدون الإيموجي والرابط)
        const meta = line
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "")
          .replace(/[📖🎬🔗]/g, "")
          .replace(/\*([^*]*)\*/g, "$1")
          .replace(/—\s*🔗\s*$/, "")
          .replace(/—\s*$/, "")
          .trim()

        // العنوان الرئيسي للكارد: meta إن وُجد، وإلا label
        const cardTitle = meta || label

        const isVideo = line.startsWith("🎬")
        const isLink  = line.startsWith("🔗")

        // SVG inline من Lucide — احترافي ونظيف
        const svgBook  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
        const svgVideo = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
        const svgLinkOut = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
        const svgArrow = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`
        const iconSvg = isVideo ? svgVideo : isLink ? svgLinkOut : svgBook

        return `<a class="gm-source-card" href="${url}" target="_blank" rel="noopener noreferrer">
          <span class="gm-source-right">
            <span class="gm-source-svg-icon">${iconSvg}</span>
            <span class="gm-source-info">
              <span class="gm-source-title">${cardTitle}</span>
              ${meta ? `<span class="gm-source-action">${label}</span>` : ""}
            </span>
          </span>
          <span class="gm-source-arrow">${svgArrow}</span>
        </a>`
      }).join("")

      if (sourcesHtml.trim()) {
        html += `<div class="gm-sources-block">
          <div class="gm-sources-sep"></div>
          <div class="gm-sources-title">المصادر</div>
          <div class="gm-sources-list">${sourcesHtml}</div>
        </div>`
      }
    }

    return html
  }

  const quickButtons = [
    { emoji: "📚", label: "المشاريع الثقافية", query: "أعرض لي المشاريع الثقافية" },
    { emoji: "🎓", label: "المشاريع التعليمية", query: "أعرض لي المشاريع التعليمية" },
    { emoji: "🕌", label: "مشاريع الصحن ومقترباته", query: "أعرض لي مشاريع الصحن ومقترباته" },
    { emoji: "🏥", label: "المشاريع الطبية", query: "أعرض لي المشاريع الطبية" },
    { emoji: "📈", label: "المشاريع التنموية", query: "أعرض لي المشاريع التنموية" },
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
          background: #f0f4f9;
          direction: rtl;
          font-family: 'Google Sans', 'Segoe UI', system-ui, sans-serif;
          color: #1f1f1f;
          overflow: hidden;
          transition: background 0.4s ease;
        }
        .gm-root.chat-active {
          background: #ffffff;
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
          border-bottom: 1px solid #dde3ea;
          flex-shrink: 0;
          background: inherit;
        }

        .gm-logo {
          display: flex;
          align-items: center;
          gap: 10px;
          font-size: 15px;
          font-weight: 600;
          color: #1f1f1f;
        }

        .gm-logo img {
          width: 28px;
          height: 28px;
          object-fit: contain;
          flex-shrink: 0;
        }

        .gm-logo-sub {
          display: flex;
          flex-direction: column;
          line-height: 1.2;
        }
        .gm-logo-sub .gm-logo-title {
          font-size: 14px;
          font-weight: 700;
          color: #1f1f1f;
        }
        .gm-logo-sub .gm-logo-subtitle {
          font-size: 10.5px;
          font-weight: 400;
          color: #80868b;
        }

        .gm-clear-btn {
          background: transparent;
          border: 1px solid #dadce0;
          color: #5f6368;
          padding: 7px 14px;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 6px;
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
          align-items: flex-end;
          justify-content: flex-start;
          padding: 9% 48px 0;
          text-align: right;
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

        .gm-welcome-greeting {
          font-size: 17px;
          font-weight: 400;
          color: #5f6368;
          margin: 0 0 4px;
          display: block;
        }

        .gm-welcome-title {
          font-size: 38px;
          font-weight: 500;
          color: #1f1f1f;
          margin: 0;
          line-height: 1.3;
        }
        .gm-welcome-title em {
          font-style: normal;
          font-weight: 600;
          color: #b1bd52;
        }

        .gm-welcome-head {
          text-align: right;
          margin-bottom: 20px;
          padding: 0 4px;
        }

        .gm-welcome-title span.rotating {
          display: inline-block;
          transition: opacity 0.35s ease, transform 0.35s ease;
          opacity: 1;
          transform: translateY(0);
        }
        .gm-welcome-title span.rotating.hidden {
          opacity: 0;
          transform: translateY(-14px);
        }

        /* chips below input */
        .gm-chips {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          max-width: 680px;
          margin-top: 14px;
          animation: msgIn 0.3s ease;
        }

        .gm-chip {
          background: #fff;
          border: 1px solid #dde3ea;
          color: #3c4043;
          padding: 9px 16px;
          border-radius: 20px;
          font-size: 13px;
          cursor: pointer;
          transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
          font-family: inherit;
          display: flex;
          align-items: center;
          gap: 6px;
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
        }
        .gm-chip:hover {
          background: #f8f9fa;
          border-color: #bdc1c6;
          box-shadow: 0 2px 6px rgba(0,0,0,0.1);
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

        @property --gm-spin-angle {
          syntax: '<angle>';
          initial-value: 0deg;
          inherits: false;
        }
        @keyframes gm-border-spin {
          to { --gm-spin-angle: 360deg; }
        }

        .gm-ai-dot {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: 1.5px solid #dadce0;
          background: #fff;
          color: #b1bd52;
          font-size: 9px;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 3px;
          overflow: hidden;
          padding: 4px;
          transition: border-color 0.3s;
        }
        .gm-ai-dot.loading {
          border: 2px solid transparent;
          background:
            linear-gradient(#fff, #fff) padding-box,
            conic-gradient(from var(--gm-spin-angle), #b1bd52 0%, #8fc9f5 40%, #b1bd52 70%, #e0e8a0 90%, #b1bd52 100%) border-box;
          animation: gm-border-spin 1.4s linear infinite;
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
        .gm-bubble strong  { font-weight: 700; color: #1a1a1a; }
        .gm-bubble em      { font-style: normal; color: #444; }
        .gm-bubble a       { color: #b1bd52; text-decoration: underline; }
        .gm-phone-link     { color: #1a1a1a !important; font-weight: 700; text-decoration: none !important; font-family: monospace; font-size: 14px; direction: ltr; display: inline-block; background: #ffffff; padding: 2px 8px; border-radius: 5px; }
        .gm-phone-link:hover { background: #dadce0; }
        .gm-email-link     { color: #1a1a1a !important; font-weight: 700; text-decoration: none !important; font-size: 14px; background: #e8eaed; padding: 2px 8px; border-radius: 5px; }
        .gm-email-link:hover { background: #dadce0; }
        .gm-root.dark .gm-phone-link,
        .gm-root.dark .gm-email-link { color: #e8eaed !important; background: #3c4043; }
        .gm-root.dark .gm-phone-link:hover,
        .gm-root.dark .gm-email-link:hover { background: #4a4f52; }
        .gm-bubble ol,
        .gm-bubble ul      { margin: 8px 0; padding-right: 20px; }
        .gm-bubble li      { margin: 5px 0; }
        .gm-bubble h2,
        .gm-bubble h3      { font-size: 15.5px; font-weight: 700; margin: 14px 0 6px; color: #1a1a1a; }
        .gm-bubble br + br { display: block; margin-top: 4px; content: ""; }

        /* صور المشاريع */
        .gm-project-img {
          width: 100%;
          max-width: 340px;
          height: auto;
          border-radius: 10px;
          margin: 10px 0;
          display: block;
          border: 1px solid #e8eaed;
          object-fit: cover;
        }
        .gm-root.dark .gm-project-img { border-color: #3c3f43; }

        /* بلوكات معلومات الاتصال */
        .gm-contact-block {
          background: #f8f9fa;
          border: 1px solid #e8eaed;
          border-radius: 12px;
          padding: 14px 16px;
          margin: 10px 0;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .gm-contact-block .gm-contact-name {
          font-weight: 700;
          font-size: 15px;
          color: #1a1a1a;
          margin-bottom: 4px;
        }
        .gm-contact-block .gm-contact-row {
          font-size: 14.5px;
          color: #3c4043;
          display: flex;
          align-items: flex-start;
          gap: 6px;
          direction: rtl;
        }
        .gm-contact-block .gm-contact-row .ci-icon { flex-shrink: 0; opacity: 0.55; margin-top: 1px; }
        .gm-contact-block .gm-contact-row.phone .ci-icon,
        .gm-contact-block .gm-contact-row.email .ci-icon { opacity: 0.65; }
        .gm-contact-block .gm-contact-row a {
          color: #1a1a1a;
          font-weight: 700;
          text-decoration: none !important;
          font-family: monospace;
          font-size: 14px;
          direction: ltr;
          display: inline-block;
          background: #e8eaed;
          padding: 2px 8px;
          border-radius: 5px;
        }
        .gm-contact-block .gm-contact-row a:hover { background: #dadce0; }
        .gm-root.dark .gm-contact-block {
          background: #2d2d2d;
          border-color: #404040;
        }
        .gm-root.dark .gm-contact-block .gm-contact-name { color: #e8eaed; }
        .gm-root.dark .gm-contact-block .gm-contact-row  { color: #bdc1c6; }

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
          flex: 1;
        }

        .gm-source-svg-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
          color: #5f6368;
        }

        .gm-source-info {
          display: flex;
          flex-direction: column;
          gap: 2px;
          overflow: hidden;
        }

        .gm-source-title {
          font-size: 13.5px;
          color: #3c4043;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 400;
          line-height: 1.4;
        }

        .gm-source-action {
          font-size: 11.5px;
          color: #9aa0a6;
          line-height: 1.3;
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
          background: #b1bd52;
          margin-right: 2px;
          vertical-align: text-bottom;
          animation: blink 0.7s step-end infinite;
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0; }
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
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
        /* الوضع الأولي: أسفل العنوان مباشرة */
        .gm-input-zone.centered {
          bottom: auto;
          top: 220px;
        }

        .gm-input-box {
          display: flex;
          align-items: center;
          background: #fff;
          border: 1px solid #dde3ea;
          border-radius: 24px;
          padding: 12px 16px;
          gap: 10px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .gm-input-box:focus-within {
          border-color: #9aa0a6;
          box-shadow: 0 2px 8px rgba(0,0,0,0.12);
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
          background: #b1bd52;
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
        .gm-send-btn:hover:not(:disabled) { background: #9aaa3e; }
        .gm-send-btn.stop {
          background: #f1f3f4;
          color: #444;
          border: 2px solid #dadce0;
        }
        .gm-send-btn.stop:hover { background: #e8eaed; }
        .gm-send-btn:disabled {
          background: #e8eaed;
          color: #9aa0a6;
          cursor: not-allowed;
        }

        .gm-hint {
          text-align: center;
          font-size: 12px;
          color: #6e757c;
          margin-top: 9px;
        }

        /* ── Dark mode toggle button ── */
        .gm-dark-btn {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          border: 1px solid #dadce0;
          background: transparent;
          color: #5f6368;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          transition: background 0.15s, border-color 0.15s, color 0.15s;
        }
        .gm-dark-btn:hover {
          background: #f1f3f4;
          border-color: #bdc1c6;
        }

        /* ═══════════════════════════════════════════════
           DARK MODE
        ═══════════════════════════════════════════════ */
        .gm-root.dark {
          background: #131314;
          color: #e3e3e3;
        }
        .gm-root.dark .gm-header {
          background: #1e1f20;
          border-color: #3c3f43;
        }
        .gm-root.dark .gm-logo {
          color: #e3e3e3;
        }
        .gm-root.dark .gm-logo-sub .gm-logo-title { color: #e3e3e3; }
        .gm-root.dark .gm-logo-sub .gm-logo-subtitle { color: #7a7f84; }
        .gm-root.dark .gm-clear-btn {
          border-color: #3c3f43;
          color: #9aa0a6;
        }
        .gm-root.dark .gm-clear-btn:hover {
          background: #2d2e30;
          border-color: #5f6368;
        }
        .gm-root.dark .gm-dark-btn {
          border-color: #3c3f43;
          color: #9aa0a6;
        }
        .gm-root.dark .gm-dark-btn:hover {
          background: #2d2e30;
          border-color: #5f6368;
        }
        .gm-root.dark .gm-welcome-greeting {
          color: #9aa0a6;
        }
        .gm-root.dark .gm-welcome-title {
          color: #e3e3e3;
        }
        .gm-root.dark .gm-chip {
          background: #2d2e30;
          border-color: #3c3f43;
          color: #bdc1c6;
          box-shadow: none;
        }
        .gm-root.dark .gm-chip:hover {
          background: #2d2e30;
          border-color: #5f6368;
        }
        .gm-root.dark .gm-row.user .gm-bubble {
          background: #2d2e30;
          border-color: #3c3f43;
          color: #e3e3e3;
        }
        .gm-root.dark .gm-row.assistant .gm-bubble {
          color: #e3e3e3;
        }
        .gm-root.dark .gm-row.assistant .gm-bubble strong,
        .gm-root.dark .gm-row.assistant .gm-bubble b {
          color: #ffffff;
        }
        .gm-root.dark .gm-bubble a {
          color: #b1bd52;
        }
        .gm-root.dark .gm-ai-dot {
          background: #1e1f20;
          border-color: #3c3f43;
          color: #b1bd52;
        }
        .gm-root.dark .gm-ai-dot.loading {
          background:
            linear-gradient(#1e1f20, #1e1f20) padding-box,
            conic-gradient(from var(--gm-spin-angle), #b1bd52 0%, #8fc9f5 40%, #b1bd52 70%, #e0e8a0 90%, #b1bd52 100%) border-box;
        }
        .gm-root.dark .gm-input-box {
          background: #1e1f20;
          border-color: #3c3f43;
        }
        .gm-root.dark .gm-input-box:focus-within {
          border-color: #5f6368;
        }
        .gm-root.dark .gm-textarea {
          color: #e3e3e3;
        }
        .gm-root.dark .gm-textarea::placeholder {
          color: #5f6368;
        }
        .gm-root.dark .gm-send-btn:disabled {
          background: #2d2e30;
          color: #5f6368;
        }
        .gm-root.dark .gm-sources-sep {
          background: #3c3f43;
        }
        .gm-root.dark .gm-source-card {
          background: #1e1f20;
          border-color: #3c3f43;
          color: #bdc1c6;
        }
        .gm-root.dark .gm-source-card:hover {
          background: #2d2e30;
          border-color: #5f6368;
        }
        .gm-root.dark .gm-source-title {
          color: #e3e3e3;
        }
        .gm-root.dark .gm-source-svg-icon {
          color: #b1bd52;
        }
        .gm-root.dark .gm-source-arrow {
          color: #5f6368;
        }
        .gm-root.dark .gm-loading-text {
          color: #9aa0a6;
        }
        .gm-root.dark .gm-hint {
          color: #5f6368;
        }
        .gm-root.dark .gm-messages-layer::-webkit-scrollbar-thumb {
          background: #3c3f43;
        }
      `}</style>

      <div className={`gm-root${darkMode ? " dark" : ""}${hasMessages ? " chat-active" : ""}`}>

        {/* ── Header ── */}
        <div className="gm-header">
          <div className="gm-logo">
            <img src={darkMode ? "/kaf-dark.svg" : "/kaf.svg"} alt="الكفيل" />
            <div className="gm-logo-sub">
              <span className="gm-logo-title">المساعد الذكي</span>
              <span className="gm-logo-subtitle">وضع الذكاء الاصطناعي</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <button className="gm-clear-btn" onClick={clearChat}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
              </svg>
              محادثة جديدة
            </button>
            <button
              className="gm-dark-btn"
              onClick={() => setDarkMode(d => !d)}
              title={darkMode ? "الوضع الفاتح" : "الوضع الداكن"}
            >
              {darkMode ? (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5"/>
                  <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                  <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                </svg>
              ) : (
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                </svg>
              )}
            </button>
            {onClose && (
              <button
                className="gm-dark-btn"
                onClick={onClose}
                title="إغلاق"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            )}
          </div>
        </div>
        <div className="gm-stage">

          {/* Welcome Layer — empty placeholder */}
          <div className={`gm-welcome-layer${hasMessages ? " out" : ""}`} />

          {/* Messages Layer */}
          <div className={`gm-messages-layer${hasMessages ? " in" : ""}`}>
            <div className="gm-messages-inner">
              {messages.map((msg, i) => (
                <div key={i} className={`gm-row ${msg.role}`}>
                  {msg.role === "assistant" && (
                    <div className={`gm-ai-dot${isStreaming && i === messages.length - 1 ? " loading" : ""}`}>
                      <img src={darkMode ? "/kaf-dark.svg" : "/kaf.svg"} alt="" style={{ width: "18px", height: "18px", objectFit: "contain" }} />
                    </div>
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
                  <div className="gm-ai-dot loading">
                    <img src={darkMode ? "/kaf-dark.svg" : "/kaf.svg"} alt="" style={{ width: "18px", height: "18px", objectFit: "contain" }} />
                  </div>
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
            {!hasMessages && (
              <div className="gm-welcome-head">
                <span className="gm-welcome-greeting">السلام عليكم،</span>
                <h1 className="gm-welcome-title">
                  <span className={`rotating${welcomeVisible ? "" : " hidden"}`}>
                    {welcomePhrases[welcomeIdx].prefix}{" "}
                    <em>{welcomePhrases[welcomeIdx].word}</em>
                  </span>
                </h1>
              </div>
            )}
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
              />
              <button
                className={`gm-send-btn${isLoading ? " stop" : ""}`}
                onClick={() => {
                  if (isLoading) {
                    abortControllerRef.current?.abort()
                  } else {
                    sendMessage()
                  }
                }}
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
              <div className="gm-hint" style={{ marginTop: "10px" }}>المساعد الذكي هو نموذج ذكاء اصطناعي وقد ينتج عنه أخطاء.</div>
            )}
            {!hasMessages && (
              <div className="gm-chips">
                {quickButtons.map((btn, i) => (
                  <button key={i} className="gm-chip" onClick={() => sendMessage(btn.query)}>
                    <span>{btn.emoji}</span>
                    {btn.label}
                  </button>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </>
  )
}
