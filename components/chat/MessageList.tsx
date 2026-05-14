"use client"

import { useRef } from "react"
import type { Message } from "./types"
import { renderMarkdown } from "./renderMarkdown"

const LOADING_PHRASES = [
  "جارٍ تحليل طلبك…",
  "جارٍ البحث في المصادر…",
  "جارٍ جلب المعلومات…",
  "جارٍ صياغة الإجابة…",
]

interface MessageListProps {
  messages: Message[]
  isLoading: boolean
  isStreaming: boolean
  loadingPhase: number
  phaseVisible: boolean
  darkMode: boolean
}

export default function MessageList({
  messages, isLoading, isStreaming, loadingPhase, phaseVisible, darkMode
}: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null)

  return (
    <div className={`gm-messages-layer${messages.length > 0 ? " in" : ""}`}>
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
              <span className={`gm-loading-text${phaseVisible ? " visible" : ""}`}>
                {LOADING_PHRASES[loadingPhase]}
              </span>
            </div>
          </div>
        )}
        <div ref={endRef} />
      </div>
    </div>
  )
}
