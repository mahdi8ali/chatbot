"use client"

import { useRef, useState } from "react"
import type { Message } from "./types"
import { META_LINE, clientStripInvalidLinks } from "./linkValidation"

export type LocationStatus = "idle" | "requesting" | "granted" | "denied" | "unsupported"

export function useChat(apiEndpoint: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortControllerRef = useRef<AbortController | null>(null)
  const sessionIdRef = useRef<string>(
    typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36)
  )

  // ── موقع الزائر (اختياري، بمبادرته فقط) ──────────────────────────────────
  // يُطلب فقط عند ضغط الزائر زرّ "شارك موقعك" — المتصفح نفسه يعرض نافذة إذن
  // رسمية لا يمكن تجاوزها. الإحداثيات تبقى في الذاكرة (state) طوال الجلسة
  // فقط، تُرسَل مع كل رسالة لاحقة إن وُجدت، ولا تُخزَّن ولا تُستخدم لأي غرض
  // غير حساب القرب الجغرافي في search_places (انظر route.ts وsystem-prompts.ts).
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locationStatus, setLocationStatus] = useState<LocationStatus>("idle")

  const requestLocation = () => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      setLocationStatus("unsupported")
      return
    }
    setLocationStatus("requesting")
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setLocationStatus("granted")
      },
      () => {
        setLocationStatus("denied")
      },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }

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
          use_tools: true,
          session_id: sessionIdRef.current,
          ...(userLocation ? { user_location: userLocation } : {}),
        })
      })

      if (!response.ok) throw new Error("خطأ " + response.status)

      const chatLogId = response.headers.get("x-chat-log-id") || undefined

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
            updated[updated.length - 1] = { role: "assistant", content: cleanText, chatLogId }
            return updated
          })
        } else if (chatLogId) {
          setMessages(prev => {
            const updated = [...prev]
            updated[updated.length - 1] = { ...updated[updated.length - 1], chatLogId }
            return updated
          })
        }
        return
      } else {
        botReply = await response.text() || "لم يتم استلام رد."
      }

      setMessages([...newMessages, { role: "assistant", content: botReply, chatLogId }])
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
    stopGeneration,
    sessionId: sessionIdRef.current,
    locationStatus,
    requestLocation,
  }
}
