export default function ChatStyles() {
  return (
    <style jsx global>{`
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
      .gm-root.chat-active { background: #ffffff; }

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
      .gm-logo { display: flex; align-items: center; gap: 10px; font-size: 15px; font-weight: 600; color: #1f1f1f; }
      .gm-logo img { width: 28px; height: 28px; object-fit: contain; flex-shrink: 0; }
      .gm-logo-sub { display: flex; flex-direction: column; line-height: 1.2; }
      .gm-logo-sub .gm-logo-title { font-size: 14px; font-weight: 700; color: #1f1f1f; }
      .gm-logo-sub .gm-logo-subtitle { font-size: 10.5px; font-weight: 400; color: #80868b; }
      .gm-clear-btn {
        background: transparent; border: 1px solid #dadce0; color: #5f6368;
        padding: 7px 14px; border-radius: 20px; font-size: 13px; cursor: pointer;
        transition: background 0.15s, border-color 0.15s; font-family: inherit;
        display: flex; align-items: center; gap: 6px;
      }
      .gm-clear-btn:hover { background: #f8f9fa; border-color: #bdc1c6; }

      .gm-stage { flex: 1; position: relative; overflow: hidden; }

      .gm-welcome-layer {
        position: absolute; inset: 0; display: flex; flex-direction: column;
        align-items: flex-end; justify-content: flex-start;
        padding: 9% 48px 0; text-align: right;
        opacity: 1; transition: opacity 0.35s ease, transform 0.35s ease;
        pointer-events: all; overflow: hidden;
      }
      .gm-welcome-layer.out { opacity: 0; transform: translateY(-12px); pointer-events: none; }
      .gm-welcome-greeting { font-size: 17px; font-weight: 400; color: #5f6368; margin: 0 0 4px; display: block; }
      .gm-welcome-title { font-size: 38px; font-weight: 500; color: #1f1f1f; margin: 0; line-height: 1.3; }
      .gm-welcome-title em { font-style: normal; font-weight: 600; color: #b1bd52; }
      .gm-welcome-head { text-align: right; margin-bottom: 20px; padding: 0 4px; }
      .gm-welcome-title span.rotating {
        display: inline-block; transition: opacity 0.35s ease, transform 0.35s ease;
        opacity: 1; transform: translateY(0);
      }
      .gm-welcome-title span.rotating.hidden { opacity: 0; transform: translateY(-14px); }

      .gm-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; max-width: 680px; margin-top: 14px; animation: msgIn 0.3s ease; }
      .gm-chip {
        background: #fff; border: 1px solid #dde3ea; color: #3c4043;
        padding: 9px 16px; border-radius: 20px; font-size: 13px; cursor: pointer;
        transition: background 0.15s, border-color 0.15s, box-shadow 0.15s;
        font-family: inherit; display: flex; align-items: center; gap: 6px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06);
      }
      .gm-chip:hover { background: #f8f9fa; border-color: #bdc1c6; box-shadow: 0 2px 6px rgba(0,0,0,0.1); }

      .gm-messages-layer {
        position: absolute; inset: 0; overflow-y: auto; padding: 28px 16px 110px;
        opacity: 0; transition: opacity 0.3s ease 0.1s; pointer-events: none;
        scrollbar-width: thin; scrollbar-color: #dadce0 transparent;
      }
      .gm-messages-layer::-webkit-scrollbar { width: 4px; }
      .gm-messages-layer::-webkit-scrollbar-thumb { background: #dadce0; border-radius: 2px; }
      .gm-messages-layer.in { opacity: 1; pointer-events: all; }
      .gm-messages-inner { max-width: 720px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }

      .gm-row { display: flex; gap: 12px; animation: msgIn 0.3s ease; }
      @keyframes msgIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      .gm-row.user, .gm-row.assistant { flex-direction: row; justify-content: flex-start; align-items: flex-start; }

      @property --gm-spin-angle { syntax: '<angle>'; initial-value: 0deg; inherits: false; }
      @keyframes gm-border-spin { to { --gm-spin-angle: 360deg; } }
      .gm-ai-dot {
        width: 28px; height: 28px; border-radius: 50%; border: 1.5px solid #dadce0;
        background: #fff; color: #b1bd52; font-size: 9px; font-weight: 700;
        display: flex; align-items: center; justify-content: center;
        flex-shrink: 0; margin-top: 3px; overflow: hidden; padding: 4px; transition: border-color 0.3s;
      }
      .gm-ai-dot.loading {
        border: 2px solid transparent;
        background: linear-gradient(#fff, #fff) padding-box,
          conic-gradient(from var(--gm-spin-angle), #b1bd52 0%, #8fc9f5 40%, #b1bd52 70%, #e0e8a0 90%, #b1bd52 100%) border-box;
        animation: gm-border-spin 1.4s linear infinite;
      }

      .gm-row.user .gm-bubble {
        background: #f1f3f4; color: #1f1f1f; border: 1px solid #e8eaed;
        border-radius: 18px 4px 18px 18px; padding: 11px 18px;
        max-width: 65%; font-size: 15px; line-height: 1.7;
      }
      .gm-row.assistant .gm-bubble { width: 100%; max-width: 78%; color: #1f1f1f; font-size: 15px; line-height: 1.8; padding: 4px 0; }

      .gm-bubble strong { font-weight: 700; color: #1a1a1a; }
      .gm-bubble em { font-style: normal; color: #444; }
      .gm-bubble a { color: #b1bd52; text-decoration: underline; }
      .gm-phone-link { color: #1a1a1a !important; font-weight: 700; text-decoration: none !important; font-family: monospace; font-size: 14px; direction: ltr; display: inline-block; background: #ffffff; padding: 2px 8px; border-radius: 5px; }
      .gm-phone-link:hover { background: #dadce0; }
      .gm-email-link { color: #1a1a1a !important; font-weight: 700; text-decoration: none !important; font-size: 14px; background: #e8eaed; padding: 2px 8px; border-radius: 5px; }
      .gm-email-link:hover { background: #dadce0; }
      .gm-root.dark .gm-phone-link, .gm-root.dark .gm-email-link { color: #e8eaed !important; background: #3c4043; }
      .gm-root.dark .gm-phone-link:hover, .gm-root.dark .gm-email-link:hover { background: #4a4f52; }
      .gm-bubble ol, .gm-bubble ul { margin: 8px 0; padding-right: 20px; }
      .gm-bubble li { margin: 5px 0; }
      .gm-bubble h2, .gm-bubble h3 { font-size: 15.5px; font-weight: 700; margin: 14px 0 6px; color: #1a1a1a; }
      .gm-bubble br + br { display: block; margin-top: 4px; content: ""; }
      .gm-project-img { width: 100%; max-width: 340px; height: auto; border-radius: 10px; margin: 10px 0; display: block; border: 1px solid #e8eaed; object-fit: cover; cursor: zoom-in; transition: transform 0.2s ease, box-shadow 0.2s ease; }
      .gm-project-img:hover { transform: scale(1.02); box-shadow: 0 4px 20px rgba(0,0,0,0.15); }

      /* Image gallery grid */
      .gm-img-gallery { display: flex; flex-wrap: wrap; gap: 5px; margin: 8px 0; direction: rtl; }
      .gm-thumb-wrap { width: 80px; height: 80px; border-radius: 6px; flex-shrink: 0; overflow: hidden; }
      .gm-gallery-loading .gm-thumb-wrap { background: linear-gradient(90deg, #e8eaed 25%, #f0f0f0 50%, #e8eaed 75%); background-size: 200% 100%; animation: gmShimmer 1.4s infinite; }
      @keyframes gmShimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
      .gm-thumb { width: 80px; height: 80px; object-fit: cover; border-radius: 6px; cursor: zoom-in; display: block; transition: transform 0.15s ease, box-shadow 0.15s ease; }
      .gm-thumb:hover { transform: scale(1.08); box-shadow: 0 4px 14px rgba(0,0,0,0.22); }
      .gm-root.dark .gm-gallery-loading .gm-thumb-wrap { background: linear-gradient(90deg, #2a2d30 25%, #363a3e 50%, #2a2d30 75%); background-size: 200% 100%; }

      /* Lightbox */
      .gm-lightbox { position: fixed; inset: 0; z-index: 9999; background: rgba(0,0,0,0.88); display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px; animation: lbIn 0.2s ease; backdrop-filter: blur(6px); cursor: zoom-out; }
      @keyframes lbIn { from { opacity: 0; } to { opacity: 1; } }
      .gm-lightbox-img { max-width: min(92vw, 900px); max-height: 80vh; border-radius: 10px; object-fit: contain; box-shadow: 0 20px 60px rgba(0,0,0,0.6); cursor: default; transition: opacity 0.18s ease; }
      .gm-lightbox-close { position: absolute; top: 16px; left: 16px; width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,0.15); border: none; color: #fff; font-size: 18px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; line-height: 1; }
      .gm-lightbox-close:hover { background: rgba(255,255,255,0.28); }
      .gm-lightbox-caption { color: rgba(255,255,255,0.75); font-size: 13px; margin-top: 14px; text-align: center; max-width: 600px; direction: rtl; }
      .gm-lightbox-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border-radius: 50%; background: rgba(255,255,255,0.18); border: none; color: #fff; font-size: 22px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s; line-height: 1; }
      .gm-lightbox-nav:hover { background: rgba(255,255,255,0.32); }
      .gm-lightbox-nav:disabled { opacity: 0.25; cursor: default; }
      .gm-lightbox-nav.prev { right: 16px; }
      .gm-lightbox-nav.next { left: 16px; }
      .gm-lightbox-counter { position: absolute; bottom: 16px; left: 50%; transform: translateX(-50%); color: rgba(255,255,255,0.6); font-size: 13px; }
      .gm-root.dark .gm-project-img { border-color: #3c3f43; }

      .gm-contact-block { background: #f8f9fa; border: 1px solid #e8eaed; border-radius: 12px; padding: 14px 16px; margin: 10px 0; display: flex; flex-direction: column; gap: 6px; }
      .gm-contact-block .gm-contact-name { font-weight: 700; font-size: 15px; color: #1a1a1a; margin-bottom: 4px; }
      .gm-contact-block .gm-contact-row { font-size: 14.5px; color: #3c4043; display: flex; align-items: flex-start; gap: 6px; direction: rtl; }
      .gm-contact-block .gm-contact-row .ci-icon { flex-shrink: 0; opacity: 0.55; margin-top: 1px; }
      .gm-contact-block .gm-contact-row.phone .ci-icon, .gm-contact-block .gm-contact-row.email .ci-icon { opacity: 0.65; }
      .gm-contact-block .gm-contact-row a { color: #1a1a1a; font-weight: 700; text-decoration: none !important; font-family: monospace; font-size: 14px; direction: ltr; display: inline-block; background: #e8eaed; padding: 2px 8px; border-radius: 5px; }
      .gm-contact-block .gm-contact-row a:hover { background: #dadce0; }
      .gm-root.dark .gm-contact-block { background: #2d2d2d; border-color: #404040; }
      .gm-root.dark .gm-contact-block .gm-contact-name { color: #e8eaed; }
      .gm-root.dark .gm-contact-block .gm-contact-row { color: #bdc1c6; }

      .gm-map-preview { margin: 5px 0 2px 0; }
      .gm-map-clip { width: 210px; height: 105px; overflow: hidden; border-radius: 8px; border: 1px solid #e0e0e0; }
      .gm-map-clip iframe { display: block; border: none; margin-top: -2px; }
      .gm-root.dark .gm-map-clip { border-color: #444; }

      .gm-typing { display: flex; gap: 5px; align-items: center; padding: 8px 0; }
      .gm-typing span { width: 7px; height: 7px; border-radius: 50%; background: #9aa0a6; animation: typingDot 1.4s ease-in-out infinite; }
      .gm-typing span:nth-child(2) { animation-delay: 0.2s; }
      .gm-typing span:nth-child(3) { animation-delay: 0.4s; }
      @keyframes typingDot { 0%, 80%, 100% { opacity: 0.35; transform: scale(0.75); } 40% { opacity: 1; transform: scale(1); } }
      .gm-loading-text { display: inline-block; font-size: 14.5px; color: #5f6368; opacity: 0; transform: translateY(8px); transition: opacity 0.32s ease, transform 0.32s ease; }
      .gm-loading-text.visible { opacity: 1; transform: translateY(0); }

      .gm-sources-block { margin-top: 16px; direction: rtl; }
      .gm-sources-sep { height: 1px; background: #e8eaed; margin-bottom: 12px; }
      .gm-sources-title { font-size: 11px; font-weight: 600; color: #bdc1c6; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 8px; }
      .gm-sources-list { display: flex; flex-direction: column; gap: 6px; }
      .gm-source-card { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border: 1px solid #e8eaed; border-radius: 8px; text-decoration: none !important; background: #fff; color: #3c4043; transition: background 0.15s, border-color 0.15s; direction: rtl; }
      .gm-source-card:hover { background: #f8f9fa; border-color: #bdc1c6; }
      .gm-source-right { display: flex; align-items: center; gap: 9px; overflow: hidden; flex: 1; }
      .gm-source-svg-icon { display: flex; align-items: center; flex-shrink: 0; color: #5f6368; }
      .gm-source-info { display: flex; flex-direction: column; gap: 2px; overflow: hidden; }
      .gm-source-title { font-size: 13.5px; color: #3c4043; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-weight: 400; line-height: 1.4; }
      .gm-source-action { font-size: 11.5px; color: #9aa0a6; line-height: 1.3; }
      .gm-source-arrow { display: flex; align-items: center; flex-shrink: 0; color: #bdc1c6; margin-right: 10px; }

      /* بطاقة الفيديو (بدون mp4 مباشر) */
      .gm-video-card { width: 100%; display: flex; align-items: center; gap: 12px; padding: 10px 12px; border: 1px solid #e8eaed; border-radius: 10px; text-decoration: none !important; background: #fff; color: inherit; transition: background 0.15s, border-color 0.15s, transform 0.15s; direction: rtl; overflow: hidden; box-sizing: border-box; }
      .gm-video-card:hover { background: #f8f9fa; border-color: #b1bd52; transform: translateY(-1px); }
      .gm-video-thumb { width: 72px; height: 48px; min-width: 72px; background: linear-gradient(135deg, #1a1a2e 0%, #2d4a6b 50%, #1a3a1a 100%); border-radius: 7px; display: flex; align-items: center; justify-content: center; position: relative; overflow: hidden; flex-shrink: 0; }
      .gm-video-play-icon { display: flex; align-items: center; justify-content: center; z-index: 1; }
      .gm-video-duration-badge { position: absolute; bottom: 3px; left: 3px; background: rgba(0,0,0,0.7); color: #fff; font-size: 9px; padding: 1px 4px; border-radius: 3px; }
      .gm-video-info { display: flex; flex-direction: column; gap: 4px; flex: 1; overflow: hidden; }
      .gm-video-title { font-size: 13.5px; font-weight: 500; color: #1f1f1f; line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
      .gm-video-cta { font-size: 11.5px; color: #b1bd52; font-weight: 500; }

      /* مشغّل الفيديو المدمج (mp4 مباشر) */
      .gm-video-player { width: 100%; border: 1px solid #e8eaed; border-radius: 12px; overflow: hidden; background: #000; margin: 4px 0; box-shadow: 0 2px 12px rgba(0,0,0,0.12); }
      .gm-video-title-bar { display: flex; align-items: center; gap: 8px; padding: 9px 14px 9px; background: #f8f9fa; color: #1f1f1f; font-size: 13px; font-weight: 500; direction: rtl; line-height: 1.4; border-bottom: 1px solid #e8eaed; margin-bottom: 6px; }
      .gm-video-title-bar svg { flex-shrink: 0; }
      .gm-video-wrapper { position: relative; cursor: pointer; background: #000; overflow: hidden; aspect-ratio: 16/9; }
      .gm-poster-img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: transform 0.3s ease; }
      .gm-video-wrapper:hover .gm-poster-img { transform: scale(1.03); }
      .gm-play-overlay { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; background: rgba(0,0,0,0.22); transition: background 0.25s; }
      .gm-video-wrapper:hover .gm-play-overlay { background: rgba(0,0,0,0.38); }
      .gm-play-btn { width: 62px; height: 62px; background: rgba(0,0,0,0.65); border-radius: 50%; display: flex; align-items: center; justify-content: center; transition: transform 0.2s ease, background 0.2s ease; box-shadow: 0 4px 16px rgba(0,0,0,0.45); backdrop-filter: blur(4px); }
      .gm-play-btn svg { width: 26px; height: 26px; margin-right: -3px; }
      .gm-video-wrapper:hover .gm-play-btn { transform: scale(1.12); background: rgba(177,189,82,0.88); }
      .gm-video-el { display: none; position: absolute; inset: 0; width: 100%; height: 100%; background: #000; }
      .gm-video-wrapper.gm-playing { cursor: default; }
      .gm-video-wrapper.gm-playing .gm-poster-img,
      .gm-video-wrapper.gm-playing .gm-play-overlay { display: none; }
      .gm-video-wrapper.gm-playing .gm-video-el { display: block; }

      .gm-cursor { display: inline-block; width: 2px; height: 1em; background: #b1bd52; margin-right: 2px; vertical-align: text-bottom; animation: blink 0.7s step-end infinite; }
      @keyframes blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      .gm-input-zone {
        position: absolute; left: 50%; transform: translateX(-50%);
        width: calc(100% - 32px); max-width: 680px; bottom: 16px;
        transition: bottom 0.48s cubic-bezier(0.4, 0, 0.2, 1); z-index: 10;
      }
      .gm-input-zone.centered { bottom: auto; top: 220px; }
      .gm-input-box { display: flex; align-items: center; background: #fff; border: 1px solid #dde3ea; border-radius: 24px; padding: 12px 16px; gap: 10px; transition: border-color 0.2s, box-shadow 0.2s; }
      .gm-input-box:focus-within { border-color: #9aa0a6; box-shadow: 0 2px 8px rgba(0,0,0,0.12); }
      .gm-textarea { flex: 1; background: transparent; border: none; outline: none; color: #1f1f1f; font-size: 15px; font-family: inherit; resize: none; max-height: 130px; min-height: 24px; line-height: 1.5; direction: rtl; }
      .gm-textarea::placeholder { color: #9aa0a6; }
      .gm-send-btn { width: 36px; height: 36px; border-radius: 50%; border: none; background: #b1bd52; color: #fff; font-size: 17px; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.2s, opacity 0.2s; line-height: 1; }
      .gm-send-btn:hover:not(:disabled) { background: #9aaa3e; }
      .gm-send-btn.stop { background: #f1f3f4; color: #444; border: 2px solid #dadce0; }
      .gm-send-btn.stop:hover { background: #e8eaed; }
      .gm-send-btn:disabled { background: #e8eaed; color: #9aa0a6; cursor: not-allowed; }
      .gm-hint { text-align: center; font-size: 12px; color: #6e757c; margin-top: 9px; }
      .gm-dark-btn { width: 34px; height: 34px; border-radius: 50%; border: 1px solid #dadce0; background: transparent; color: #5f6368; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: background 0.15s, border-color 0.15s, color 0.15s; }
      .gm-dark-btn:hover { background: #f1f3f4; border-color: #bdc1c6; }

      /* Dark Mode */
      .gm-root.dark { background: #131314; color: #e3e3e3; }
      .gm-root.dark .gm-header { background: #1e1f20; border-color: #3c3f43; }
      .gm-root.dark .gm-logo { color: #e3e3e3; }
      .gm-root.dark .gm-logo-sub .gm-logo-title { color: #e3e3e3; }
      .gm-root.dark .gm-logo-sub .gm-logo-subtitle { color: #7a7f84; }
      .gm-root.dark .gm-clear-btn { border-color: #3c3f43; color: #9aa0a6; }
      .gm-root.dark .gm-clear-btn:hover { background: #2d2e30; border-color: #5f6368; }
      .gm-root.dark .gm-dark-btn { border-color: #3c3f43; color: #9aa0a6; }
      .gm-root.dark .gm-dark-btn:hover { background: #2d2e30; border-color: #5f6368; }
      .gm-root.dark .gm-welcome-greeting { color: #9aa0a6; }
      .gm-root.dark .gm-welcome-title { color: #e3e3e3; }
      .gm-root.dark .gm-chip { background: #2d2e30; border-color: #3c3f43; color: #bdc1c6; box-shadow: none; }
      .gm-root.dark .gm-chip:hover { background: #2d2e30; border-color: #5f6368; }
      .gm-root.dark .gm-row.user .gm-bubble { background: #2d2e30; border-color: #3c3f43; color: #e3e3e3; }
      .gm-root.dark .gm-row.assistant .gm-bubble { color: #e3e3e3; }
      .gm-root.dark .gm-row.assistant .gm-bubble strong,
      .gm-root.dark .gm-row.assistant .gm-bubble b { color: #ffffff; }
      .gm-root.dark .gm-bubble a { color: #b1bd52; }
      .gm-root.dark .gm-ai-dot { background: #1e1f20; border-color: #3c3f43; color: #b1bd52; }
      .gm-root.dark .gm-ai-dot.loading {
        background: linear-gradient(#1e1f20, #1e1f20) padding-box,
          conic-gradient(from var(--gm-spin-angle), #b1bd52 0%, #8fc9f5 40%, #b1bd52 70%, #e0e8a0 90%, #b1bd52 100%) border-box;
      }
      .gm-root.dark .gm-input-box { background: #1e1f20; border-color: #3c3f43; }
      .gm-root.dark .gm-input-box:focus-within { border-color: #5f6368; }
      .gm-root.dark .gm-textarea { color: #e3e3e3; }
      .gm-root.dark .gm-textarea::placeholder { color: #5f6368; }
      .gm-root.dark .gm-send-btn:disabled { background: #2d2e30; color: #5f6368; }
      .gm-root.dark .gm-sources-sep { background: #3c3f43; }
      .gm-root.dark .gm-source-card { background: #1e1f20; border-color: #3c3f43; color: #bdc1c6; }
      .gm-root.dark .gm-source-card:hover { background: #2d2e30; border-color: #5f6368; }
      .gm-root.dark .gm-source-title { color: #e3e3e3; }
      .gm-root.dark .gm-source-svg-icon { color: #b1bd52; }
      .gm-root.dark .gm-source-arrow { color: #5f6368; }
      .gm-root.dark .gm-video-card { background: #1e1f20; border-color: #3c3f43; }
      .gm-root.dark .gm-video-card:hover { background: #2d2e30; border-color: #b1bd52; }
      .gm-root.dark .gm-video-title { color: #e3e3e3; }
      .gm-root.dark .gm-video-player { border-color: #3c3f43; }
      .gm-root.dark .gm-video-title-bar { background: #1e2023; color: #e3e3e3; border-bottom-color: #3c3f43; }
      .gm-root.dark .gm-loading-text { color: #9aa0a6; }
      .gm-root.dark .gm-hint { color: #5f6368; }
      .gm-root.dark .gm-messages-layer::-webkit-scrollbar-thumb { background: #3c3f43; }

      /* ===== Feedback Buttons ===== */
      .gm-feedback { display: flex; align-items: center; gap: 6px; margin-top: 6px; padding-right: 2px; }
      .gm-feedback-label { font-size: 11px; color: #9aa0a6; }
      .gm-feedback-btn { background:#f1f3f4; border:1.5px solid #dadce0; border-radius:20px; height:30px; width:34px; min-width:34px; flex-shrink:0; padding:0; font-size:12px; line-height:1; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; gap:5px; transition:background .15s, border-color .15s, color .15s; white-space:nowrap; color:#5f6368; }
      .gm-feedback-btn:hover { background: #e8eaed; border-color: #b0b8c1; }
      .gm-feedback-btn.active, .gm-feedback-btn:active { background: #dcfce7; border-color: #16a34a; color: #15803d; }
      .gm-feedback-btn:disabled { opacity: 0.5; cursor: default; }
      .gm-feedback-done { font-size: 12px; color: #6b7280; margin-top: 6px; padding-right: 2px; }
      .gm-feedback-note { display: flex; flex-direction: column; gap: 6px; margin-top: 6px; max-width: 78%; }
      .gm-feedback-textarea { font-family: inherit; font-size: 13px; direction: rtl; border: 1px solid #dadce0; border-radius: 8px; padding: 6px 10px; resize: vertical; background: #f8f9fa; color: #1f1f1f; outline: none; }
      .gm-feedback-textarea:focus { border-color: #b1bd52; }
      .gm-feedback-actions { display: flex; gap: 8px; }
      .gm-feedback-send { font-size: 12px; background: #b1bd52; color: #fff; border: none; border-radius: 6px; padding: 4px 12px; cursor: pointer; transition: background 0.15s; }
      .gm-feedback-send:hover { background: #9aa844; }
      .gm-feedback-send:disabled { opacity: 0.6; cursor: default; }
      .gm-feedback-cancel { font-size: 12px; background: none; color: #9aa0a6; border: 1px solid #dadce0; border-radius: 6px; padding: 4px 10px; cursor: pointer; }
      .gm-feedback-cancel:hover { border-color: #bdc1c6; color: #5f6368; }

      /* Dark mode — feedback */
      .gm-root.dark .gm-feedback-label { color: #9aa0a6; }
      .gm-root.dark .gm-feedback-btn { background: #2d2e30; border-color: #3c3f43; color: #e3e3e3; }
      .gm-root.dark .gm-feedback-btn:hover { background: #35363a; border-color: #5f6368; }
      .gm-root.dark .gm-feedback-btn.active, .gm-root.dark .gm-feedback-btn:active { background: #14532d; border-color: #16a34a; color: #86efac; }
      .gm-root.dark .gm-feedback-done { color: #9aa0a6; }
      .gm-root.dark .gm-feedback-textarea { background: #1e1f20; border-color: #3c3f43; color: #e3e3e3; }
      .gm-root.dark .gm-feedback-textarea:focus { border-color: #b1bd52; }
      .gm-root.dark .gm-feedback-cancel { border-color: #3c3f43; color: #9aa0a6; }
      .gm-root.dark .gm-feedback-cancel:hover { border-color: #5f6368; color: #bdc1c6; }
    `}</style>
  )
}
