"use client"

import { useEffect, useState } from "react"
import type { ChatWidgetProps } from "./chat/types"
import { useChat } from "./chat/useChat"
import ChatStyles from "./chat/ChatStyles"
import ChatHeader from "./chat/ChatHeader"
import MessageList from "./chat/MessageList"
import InputZone from "./chat/InputZone"

export default function ChatWidget({
  apiEndpoint = "/api/chat/site",
  onClose
}: ChatWidgetProps) {
  const { messages, input, setInput, isLoading, isStreaming, sendMessage, clearChat, stopGeneration, sessionId } = useChat(apiEndpoint)
  const [darkMode, setDarkMode] = useState(false)

  // Loading phase animation
  const [loadingPhase, setLoadingPhase] = useState(0)
  const [phaseVisible, setPhaseVisible] = useState(true)
  const LOADING_PHRASES_COUNT = 4
  useEffect(() => {
    if (!isLoading || isStreaming) return
    setLoadingPhase(0)
    setPhaseVisible(true)
    const interval = setInterval(() => {
      setPhaseVisible(false)
      setTimeout(() => {
        setLoadingPhase(p => (p + 1) % LOADING_PHRASES_COUNT)
        setPhaseVisible(true)
      }, 350)
    }, 2200)
    return () => clearInterval(interval)
  }, [isLoading, isStreaming])

  // Welcome phrase rotation
  const [welcomeIdx, setWelcomeIdx] = useState(0)
  const [welcomeVisible, setWelcomeVisible] = useState(true)
  const WELCOME_COUNT = 5
  useEffect(() => {
    if (messages.length > 0) return
    const interval = setInterval(() => {
      setWelcomeVisible(false)
      setTimeout(() => {
        setWelcomeIdx(i => (i + 1) % WELCOME_COUNT)
        setWelcomeVisible(true)
      }, 400)
    }, 2800)
    return () => clearInterval(interval)
  }, [messages.length])

  const hasMessages = messages.length > 0

  return (
    <>
      <ChatStyles />
      <div className={`gm-root${darkMode ? " dark" : ""}${hasMessages ? " chat-active" : ""}`}>
        <ChatHeader
          darkMode={darkMode}
          onToggleDark={() => setDarkMode(d => !d)}
          onClear={clearChat}
          onClose={onClose}
        />
        <div className="gm-stage">
          <div className={`gm-welcome-layer${hasMessages ? " out" : ""}`} />
          <MessageList
            messages={messages}
            isLoading={isLoading}
            isStreaming={isStreaming}
            loadingPhase={loadingPhase}
            phaseVisible={phaseVisible}
            darkMode={darkMode}
            sessionId={sessionId}
          />
          <InputZone
            hasMessages={hasMessages}
            input={input}
            setInput={setInput}
            isLoading={isLoading}
            onSend={sendMessage}
            onStop={stopGeneration}
            welcomeIdx={welcomeIdx}
            welcomeVisible={welcomeVisible}
          />
        </div>
      </div>
    </>
  )
}

