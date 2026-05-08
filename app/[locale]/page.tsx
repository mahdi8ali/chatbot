"use client"

import { useState } from "react"
import ChatWidget from "@/components/ChatWidget"

export default function HomePage() {
  const [aiOpen, setAiOpen] = useState(false)

  return (
    <>
      <style jsx global>{`
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body {
          width: 100%;
          height: 100%;
          overflow: hidden;
          font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        }
        body {
          background: url('/org.png') no-repeat center center fixed;
          background-size: cover;
        }

        /* ── Top Bar ── */
        .top-bar {
          position: fixed;
          top: 0; left: 0; right: 0;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          padding: 0 24px;
          background: rgba(0,0,0,0.25);
          backdrop-filter: blur(12px);
          -webkit-backdrop-filter: blur(12px);
          border-bottom: 1px solid rgba(255,255,255,0.08);
          z-index: 100;
          direction: rtl;
        }

        .ai-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 18px;
          border-radius: 999px;
          border: 1.5px solid rgba(255,255,255,0.25);
          background: rgba(255,255,255,0.1);
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.25s ease;
          backdrop-filter: blur(8px);
          letter-spacing: 0.5px;
        }

        .ai-btn:hover {
          background: rgba(255,255,255,0.2);
          border-color: rgba(255,255,255,0.45);
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        }

        .ai-btn-icon {
          width: 22px;
          height: 22px;
          background: linear-gradient(135deg, #4f8ef7, #a855f7);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          color: white;
          flex-shrink: 0;
        }

        /* ── AI Overlay ── */
        .ai-overlay {
          position: fixed;
          inset: 0;
          z-index: 200;
          background: rgba(0,0,0,0.6);
          backdrop-filter: blur(6px);
          display: flex;
          align-items: stretch;
          justify-content: stretch;
          animation: overlayIn 0.3s ease;
        }

        @keyframes overlayIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .ai-panel {
          flex: 1;
          display: flex;
          flex-direction: column;
          animation: panelIn 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }

        @keyframes panelIn {
          from { transform: translateY(30px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }

      `}</style>

      {/* Top Bar */}
      <div className="top-bar">
        <button className="ai-btn" onClick={() => setAiOpen(true)}>
          <span className="ai-btn-icon">AI</span>
          <span>المساعد الذكي</span>
        </button>
      </div>

      {/* AI Fullscreen Overlay */}
      {aiOpen && (
        <div className="ai-overlay">
          <div className="ai-panel">
            <ChatWidget
              apiEndpoint="/api/chat/site"
              title="المساعد الذكي"
              subtitle="شبكة الكفيل"
              onClose={() => setAiOpen(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
