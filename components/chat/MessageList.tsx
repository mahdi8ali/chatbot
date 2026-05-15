"use client"

import { memo, useRef, useState, useCallback, useEffect, useMemo } from "react"
import type { Message } from "./types"
import { renderMarkdown } from "./renderMarkdown"

// مُقيَّد بـ memo حتى لا يُعاد الرسم عند كل ضغطة كيبورد في الإدخال
const MsgBubble = memo(function MsgBubble({ html }: { html: string }) {
  return <div className="gm-bubble" dangerouslySetInnerHTML={{ __html: html }} />
})

interface LightboxImage { src: string; alt: string }

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
  const [lbImages, setLbImages] = useState<LightboxImage[]>([])
  const [lbIndex, setLbIndex] = useState(0)

  const lbOpen = lbImages.length > 0
  const lbCurrent = lbImages[lbIndex]

  // إغلاق عند Escape، تنقل بالأسهم
  useEffect(() => {
    if (!lbOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLbImages([])
      else if (e.key === "ArrowLeft" || e.key === "ArrowDown")
        setLbIndex(i => Math.min(i + 1, lbImages.length - 1))
      else if (e.key === "ArrowRight" || e.key === "ArrowUp")
        setLbIndex(i => Math.max(i - 1, 0))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [lbOpen, lbImages.length])

  // swipe للموبايل
  const touchStartX = useRef<number | null>(null)
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }, [])
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const dx = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(dx) < 40) return           // حركة قصيرة جداً → تجاهل
    if (dx < 0) {
      // سحب لليسار → الصورة التالية
      setLbIndex(i => Math.min(i + 1, lbImages.length - 1))
    } else {
      // سحب لليمين → الصورة السابقة
      setLbIndex(i => Math.max(i - 1, 0))
    }
  }, [lbImages.length])

  // event delegation — يلتقط الضغط على أي صورة داخل الرسائل
  const handleMsgClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    if (target.tagName !== "IMG") return
    const img = target as HTMLImageElement

    if (img.classList.contains("gm-thumb")) {
      // اجمع كل صور الغاليري المحيطة
      const gallery = img.closest(".gm-img-gallery")
      if (gallery) {
        const thumbs = Array.from(gallery.querySelectorAll<HTMLImageElement>("img.gm-thumb"))
        const images: LightboxImage[] = thumbs.map(t => ({
          src: (t as any).dataset?.original || t.src,
          alt: t.alt || "",
        }))
        const idx = thumbs.indexOf(img)
        setLbImages(images)
        setLbIndex(idx >= 0 ? idx : 0)
      }
    } else if (img.classList.contains("gm-project-img")) {
      setLbImages([{ src: img.src, alt: img.alt || "" }])
      setLbIndex(0)
    }
  }, [])

  // memoize HTML لكل رسالة مكتملة — يُعاد الحساب فقط عند تغيّر المحتوى
  const renderedMessages = useMemo(() =>
    messages.map((msg, i) => {
      const isLastAndStreaming = isStreaming && i === messages.length - 1 && msg.role === "assistant"
      return renderMarkdown(msg.content, isLastAndStreaming)
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [messages, isStreaming]
  )

  return (
    <>
      <div className={`gm-messages-layer${messages.length > 0 ? " in" : ""}`}>
        <div className="gm-messages-inner" onClick={handleMsgClick}>
          {messages.map((msg, i) => {
            const isLastAndStreaming = isStreaming && i === messages.length - 1 && msg.role === "assistant"
            return (
            <div key={i} className={`gm-row ${msg.role}`}>
              {msg.role === "assistant" && (
                <div className={`gm-ai-dot${isLastAndStreaming ? " loading" : ""}`}>
                  <img src={darkMode ? "/kaf-dark.svg" : "/kaf.svg"} alt="" style={{ width: "18px", height: "18px", objectFit: "contain" }} />
                </div>
              )}
              <MsgBubble html={
                    renderedMessages[i] +
                    (isLastAndStreaming ? '<span class="gm-cursor"></span>' : "")
                  } />
            </div>
          )})}

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

      {/* Lightbox */}
      {lbOpen && lbCurrent && (
        <div
          className="gm-lightbox"
          onClick={() => setLbImages([])}
          onTouchStart={handleTouchStart}
          onTouchEnd={handleTouchEnd}
        >          <button className="gm-lightbox-close" onClick={() => setLbImages([])}>✕</button>

          {/* سهم للسابق (RTL: يمين = سابق) */}
          {lbImages.length > 1 && (
            <button
              className="gm-lightbox-nav prev"
              disabled={lbIndex === 0}
              onClick={e => { e.stopPropagation(); setLbIndex(i => Math.max(i - 1, 0)) }}
            >›</button>
          )}

          <img
            className="gm-lightbox-img"
            src={lbCurrent.src}
            alt={lbCurrent.alt}
            onClick={e => e.stopPropagation()}
          />

          {/* سهم للتالي */}
          {lbImages.length > 1 && (
            <button
              className="gm-lightbox-nav next"
              disabled={lbIndex === lbImages.length - 1}
              onClick={e => { e.stopPropagation(); setLbIndex(i => Math.min(i + 1, lbImages.length - 1)) }}
            >‹</button>
          )}

          {lbImages.length > 1 && (
            <span className="gm-lightbox-counter">{lbIndex + 1} / {lbImages.length}</span>
          )}
          {lbCurrent.alt && <p className="gm-lightbox-caption">{lbCurrent.alt}</p>}
        </div>
      )}
    </>
  )
}
