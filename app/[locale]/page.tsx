"use client"

import ChatWidget from "@/components/ChatWidget"

export default function HomePage() {
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
          padding: 10px !important;
        }
        .chat-container {
          max-width: 460px;
          height: 85vh;
        }
        @media (max-width: 768px) {
          body { padding: 0 !important; align-items: stretch; }
          .chat-container { width: 100%; max-width: 100%; height: 100vh; height: 100dvh; border-radius: 0; }
        }
      `}</style>

      <div className="chat-container">
        <ChatWidget />
      </div>
    </>
  )
}
