"use client"

import { useRef, useState } from "react"
import type { Message } from "./types"
import { META_LINE, clientStripInvalidLinks } from "./linkValidation"

export function useChat(apiEndpoint: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)

  const sendMessage = async (text?: string) => {
    const messageText = (text || input).trim()
    if (!messageText || isLoading) return

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
        const data = await response.json()
        botReply = data.message || "لم أتمكن من فهم الرد."
      } else if (response.body) {
        setIsStreaming(true)
        let accumulated = ""
        setMessages([...newMessages, { role: "assistant", content: "" }])
        const reader = response.body.getReader()
        const decoder = new TextDecoder()
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          accumulated += decoder.decode(value, { stream: true })
          const mIdx = accumulated.lastIndexOf(META_LINE)
          const display = mIdx !== -1 ? accumulated.slice(0, mIdx) : accumulated
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { role: "assistant", content: display }
            return updated
          })
        }
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
        return
      } else {
        botReply = await response.text() || "لم يتم استلام رد."
      }

      setMessages([...newMessages, { role: "assistant", content: botReply }])
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        setMessages([
          ...newMessages,
          { role: "assistant", content: "⚠️ حدث خطأ في الاتصال. حاول مرة أخرى." }
        ])
      }
    } finally {
      abortControllerRef.current = null
      setIsLoading(false)
      setIsStreaming(false)
    }
  }

  const clearChat = () => setMessages([])

  const stopGeneration = () => abortControllerRef.current?.abort()

  return {
    messages,
    input,
    setInput,
    isLoading,
    isStreaming,
    sendMessage,
    clearChat,
    stopGeneration
  }
}
