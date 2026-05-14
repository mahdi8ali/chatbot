"use client"

interface ChatHeaderProps {
  darkMode: boolean
  onToggleDark: () => void
  onClear: () => void
  onClose?: () => void
}

export default function ChatHeader({ darkMode, onToggleDark, onClear, onClose }: ChatHeaderProps) {
  return (
    <div className="gm-header">
      <div className="gm-logo">
        <img src={darkMode ? "/kaf-dark.svg" : "/kaf.svg"} alt="الكفيل" />
        <div className="gm-logo-sub">
          <span className="gm-logo-title">المساعد الذكي</span>
          <span className="gm-logo-subtitle">وضع الذكاء الاصطناعي</span>
        </div>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
        <button className="gm-clear-btn" onClick={onClear}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          محادثة جديدة
        </button>
        <button className="gm-dark-btn" onClick={onToggleDark} title={darkMode ? "الوضع الفاتح" : "الوضع الداكن"}>
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
          <button className="gm-dark-btn" onClick={onClose} title="إغلاق">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        )}
      </div>
    </div>
  )
}
