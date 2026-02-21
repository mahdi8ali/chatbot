"use client"

import { useEffect, useRef, useState } from "react"

interface Message {
  role: "user" | "assistant"
  content: string
}

export default function HomePage() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

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
      const response = await fetch("/api/chat/site", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          chatSettings: {
            model: "gpt-4o",
            prompt: "user",
            temperature: 0.5
          }
        })
      })

      if (!response.ok) throw new Error("خطأ " + response.status)

      const data = await response.json()
      const botReply =
        data.message || data.reply || "لم أتمكن من فهم الرد."

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
    let html = text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(
        /\[([^\]]+)\]\(([^)]+)\)/g,
        '<a href="$2" target="_blank" rel="noopener">$1</a>'
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

  const quickButtons = [
    { emoji: "📚", label: "المشاريع الثقافية", query: "أعرض لي المشاريع الثقافية" },
    { emoji: "🎓", label: "المشاريع التعليمية", query: "أعرض لي المشاريع التعليمية" },
    { emoji: "🕌", label: "مشاريع الصحن ومقترباته", query: "أعرض لي مشاريع الصحن ومقترباته" },
    { emoji: "🏥", label: "المشاريع الطبية", query: "أعرض لي المشاريع الطبية" },
    { emoji: "📈", label: "المشاريع التنموية", query: "أعرض لي المشاريع التنموية" },
    { emoji: "🔧", label: "خدمات عامة", query: "أعرض لي خدمات عامة" },
    { emoji: "🏛️", label: "تشكيلات إدارية", query: "أعرض لي تشكيلات إدارية" }
  ]

  return (
    <>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: 'Readex Pro', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
          background: #0a1628;
          height: 100vh;
          display: flex;
          justify-content: center;
          align-items: center;
          padding: 16px !important;
        }
        .chat-container {
          max-width: 460px;
          height: 90vh;
          background: #111827;
          border-radius: 8px;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-shadow: 0 8px 40px rgba(0,0,0,0.5);
          border: 1px solid #1f2937;
        }
        .chat-header {
          background: #04504d;
          padding: 16px 20px;
          display: flex;
          align-items: center;
          gap: 12px;
        }
        .chat-header .avatar {
          width: 42px;
          height: 42px;
          border-radius: 50%;
          overflow: hidden;
          flex-shrink: 0;
        }
        .chat-header .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .chat-header .info h2 {
          color: #fff;
          font-size: 15px;
          font-weight: 600;
        }
        .chat-header .info p {
          color: #a7f3d0;
          font-size: 12px;
          margin-top: 2px;
        }
        .status-dot {
          width: 8px;
          height: 8px;
          background: #34d399;
          border-radius: 50%;
          display: inline-block;
          margin-left: 5px;
          animation: pulse 2s infinite;
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
        .clear-btn {
          margin-right: auto;
          background: rgba(255,255,255,0.15);
          border: none;
          color: #fff;
          padding: 6px 12px;
          border-radius: 8px;
          cursor: pointer;
          font-size: 12px;
          font-family: inherit;
          transition: background 0.2s;
        }
        .clear-btn:hover { background: rgba(255,255,255,0.25); }
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 16px;
          display: flex;
          flex-direction: column;
          gap: 12px;
          scroll-behavior: smooth;
        }
        .chat-messages::-webkit-scrollbar { width: 4px; }
        .chat-messages::-webkit-scrollbar-track { background: transparent; }
        .chat-messages::-webkit-scrollbar-thumb { background: #374151; border-radius: 4px; }
        .message {
          max-width: 85%;
          padding: 10px 14px;
          border-radius: 12px;
          font-size: 14px;
          line-height: 1.7;
          word-wrap: break-word;
          animation: fadeIn 0.3s ease;
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .message.user {
          align-self: flex-start;
          background: #065f46;
          color: #fff;
        }
        .message.bot {
          align-self: flex-end;
          background: #1f2937;
          color: #e5e7eb;
          border: 1px solid #374151;
        }
        .message.bot a {
          color: #34d399;
          text-decoration: none;
        }
        .message.bot a:hover { text-decoration: underline; }
        .message.bot strong { color: #fff; }
        .typing {
          align-self: flex-end;
          background: #1f2937;
          border: 1px solid #374151;
          padding: 12px 18px;
          border-radius: 12px;
          display: flex;
          gap: 5px;
          animation: fadeIn 0.3s ease;
        }
        .typing span {
          width: 7px;
          height: 7px;
          background: #6b7280;
          border-radius: 50%;
          animation: bounce 1.4s infinite ease-in-out;
        }
        .typing span:nth-child(1) { animation-delay: 0s; }
        .typing span:nth-child(2) { animation-delay: 0.2s; }
        .typing span:nth-child(3) { animation-delay: 0.4s; }
        @keyframes bounce {
          0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
          40% { transform: scale(1); opacity: 1; }
        }
        .welcome {
          text-align: center;
          color: #6b7280;
          padding: 30px 20px;
        }
        .welcome .icon { margin-bottom: 12px; }
        .welcome .icon img { width: 70px; height: 70px; border-radius: 50%; object-fit: cover; }
        .welcome h3 { color: #9ca3af; font-size: 16px; margin-bottom: 8px; }
        .welcome p { font-size: 13px; line-height: 1.8; }
        .quick-btns {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          justify-content: center;
          margin-top: 16px;
        }
        .quick-btn {
          background: #1f2937;
          border: 1px solid #374151;
          color: #d1d5db;
          padding: 7px 14px;
          border-radius: 8px;
          font-size: 12px;
          cursor: pointer;
          font-family: inherit;
          transition: all 0.2s;
        }
        .quick-btn:hover {
          background: #065f46;
          border-color: #047857;
          color: #fff;
        }
        .chat-input {
          padding: 12px 16px;
          background: #111827;
          border-top: 1px solid #1f2937;
          display: flex;
          gap: 10px;
          align-items: flex-end;
        }
        .chat-input textarea {
          flex: 1;
          background: #1f2937;
          border: 1px solid #374151;
          border-radius: 12px;
          padding: 10px 14px;
          color: #e5e7eb;
          font-size: 14px;
          font-family: inherit;
          resize: none;
          outline: none;
          max-height: 100px;
          min-height: 42px;
          line-height: 1.5;
          transition: border-color 0.2s;
        }
        .chat-input textarea:focus { border-color: #047857; }
        .chat-input textarea::placeholder { color: #6b7280; }
        .send-btn {
          width: 42px;
          height: 42px;
          background: #f3bf3d;
          border: none;
          border-radius: 12px;
          color: #fff;
          font-size: 18px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: background 0.2s;
          flex-shrink: 0;
          transform: scaleX(-1);
        }
        .send-btn:hover { background: #d4a832; }
        .send-btn:disabled { background: #374151; cursor: not-allowed; }
        .msg-count {
          text-align: center;
          font-size: 11px;
          color: #4b5563;
          padding: 4px;
        }
        .message.bot ol, .message.bot ul { padding-right: 20px; margin: 6px 0; }
        .message.bot li { margin: 4px 0; }
        .message.bot p { margin: 4px 0; }
      `}</style>

      <div className="chat-container">
        {/* Header */}
        <div className="chat-header">
          <div className="avatar">
            <img src="/logo.png" alt="مساعد الكفيل" />
          </div>
          <div className="info">
            <h2>مشاريع الكفيل</h2>
            <p>
              <span className="status-dot"></span> متصل
            </p>
          </div>
          <button className="clear-btn" onClick={clearChat}>
            + محادثة جديدة
          </button>
        </div>

        {/* Messages */}
        <div className="chat-messages">
          {showWelcome && (
            <div className="welcome">
              <div className="icon">
                <img src="/logo.png" alt="مساعد الكفيل" />
              </div>
              <h3>مرحباً بك ، انا مساعدك الشخصي</h3>
              <p>
                اسألني أي سؤال عن مشاريع العتبة العباسية المقدسة وتفاصيلهن
                بشكل كامل
              </p>
              <div className="quick-btns">
                {quickButtons.map((btn, i) => (
                  <button
                    key={i}
                    className="quick-btn"
                    onClick={() => sendMessage(btn.query)}
                  >
                    {btn.emoji} {btn.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={`message ${msg.role === "user" ? "user" : "bot"}`}
              dangerouslySetInnerHTML={
                msg.role === "assistant"
                  ? { __html: renderMarkdown(msg.content) }
                  : undefined
              }
            >
              {msg.role === "user" ? msg.content : undefined}
            </div>
          ))}

          {isLoading && (
            <div className="typing">
              <span></span>
              <span></span>
              <span></span>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Message count */}
        <div className="msg-count">
          {messages.length > 0 ? `المحادثة: ${messages.length} رسالة` : ""}
        </div>

        {/* Input */}
        <div className="chat-input">
          <textarea
            ref={textareaRef}
            rows={1}
            placeholder="اكتب رسالتك هنا..."
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            className="send-btn"
            onClick={() => sendMessage()}
            disabled={isLoading}
          >
            ➤
          </button>
        </div>
      </div>
    </>
  )
}
