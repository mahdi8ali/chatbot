/**
 * AlKafeel Chat Widget - Standalone Bundle
 * Version: 2.0.0
 *
 * Usage (two lines):
 *   <script src="https://YOUR-DOMAIN/widget.js" defer></script>
 *   <script>AlkafeelWidget.init({ apiEndpoint: '...' });</script>
 *
 * CSP note – if the host site blocks external scripts, either:
 *   1. Add  script-src 'self' https://YOUR-DOMAIN  to their CSP header, or
 *   2. Self-host: download this file and serve it from the same origin.
 */

(function(window, document) {
  'use strict';

  // ── Guard: prevent double-load ──
  if (window.AlkafeelWidget && window.AlkafeelWidget._loaded) {
    console.warn('[AlKafeel Widget] Already loaded — skipping.');
    return;
  }

  // ==========================================================================
  //  §1  BUTTON-ONLY CSS  –  injected immediately, ~0.5 KB
  //      Everything else is deferred until the user opens the panel.
  // ==========================================================================
  var BTN_STYLES = [
    '.alkw-chat-button{',
      'all:initial;',                           // ← reset ALL inherited styles
      'position:fixed;bottom:20px;',
      'width:60px;height:60px;border-radius:50%;',
      'background:linear-gradient(135deg,#1e40af 0%,#7c3aed 100%);',
      'color:#fff;border:none;font-size:28px;cursor:pointer;',
      'box-shadow:0 4px 12px rgba(0,0,0,.3);z-index:999998;',
      'transition:all .3s cubic-bezier(.4,0,.2,1);',
      'display:flex;align-items:center;justify-content:center;',
      'user-select:none;-webkit-tap-highlight-color:transparent;',
      'font-family:sans-serif;line-height:1;',
    '}',
    '.alkw-chat-button.alkw-left{left:20px}',
    '.alkw-chat-button.alkw-right{right:20px}',
    '.alkw-chat-button:hover{transform:scale(1.1);box-shadow:0 6px 20px rgba(30,64,175,.5)}',
    '.alkw-chat-button:active{transform:scale(.95)}',
    '.alkw-chat-button.alkw-open{transform:rotate(180deg)}',
    '.alkw-chat-button.alkw-open:hover{transform:rotate(180deg) scale(1.1)}',
    '@media(max-width:768px){',
      '.alkw-chat-button{bottom:15px}',
      '.alkw-chat-button.alkw-left{left:15px}',
      '.alkw-chat-button.alkw-right{right:15px}',
    '}',
  ].join('\n');

  // ==========================================================================
  //  §2  PANEL CSS  –  injected ONLY on first open  (lazy)
  // ==========================================================================
  var PANEL_STYLES = [
    /* ── Hard reset: cut off ALL inheritance from host page ── */
    '.alkw-widget-container,.alkw-widget-container *,.alkw-widget-container *::before,.alkw-widget-container *::after{',
      'all:initial;box-sizing:border-box;font-family:inherit;',
    '}',

    /* ── Container ── */
    '.alkw-widget-container{',
      'position:fixed;bottom:100px;width:400px;height:600px;',
      'max-width:calc(100vw - 40px);max-height:calc(100vh - 140px);',
      'z-index:999999;opacity:0;visibility:hidden;',
      'transform:translateY(20px) scale(.95);',
      'transition:opacity .3s ease,visibility .3s ease,transform .3s ease;',
      'font-family:"Readex Pro",-apple-system,BlinkMacSystemFont,"Segoe UI","Helvetica Neue",Arial,sans-serif;',
      'direction:rtl;display:block;',
    '}',
    '.alkw-widget-container.alkw-left{left:20px}',
    '.alkw-widget-container.alkw-right{right:20px}',
    '.alkw-widget-container.alkw-open{opacity:1;visibility:visible;transform:translateY(0) scale(1)}',

    /* ── Inner wrapper ── */
    '.alkw-widget-inner{',
      'width:100%;height:100%;background:#111827;border-radius:12px;',
      'display:flex;flex-direction:column;overflow:hidden;',
      'box-shadow:0 20px 60px rgba(0,0,0,.5);border:1px solid #1f2937;',
    '}',

    /* ── Header ── */
    '.alkw-header{',
      'background:linear-gradient(135deg,#1e40af 0%,#7c3aed 100%);',
      'color:#fff;padding:16px;display:flex;justify-content:space-between;',
      'align-items:center;border-bottom:1px solid rgba(255,255,255,.1);flex-shrink:0;',
    '}',
    '.alkw-header-text{display:block}',
    '.alkw-header-text h2{margin:0;font-size:18px;font-weight:600;line-height:1.2;color:#fff;display:block}',
    '.alkw-header-text p{margin:4px 0 0;font-size:12px;opacity:.9;line-height:1.2;color:#fff;display:block}',
    '.alkw-close-btn{',
      'all:initial;background:rgba(255,255,255,.15);border:none;padding:6px 12px;',
      'border-radius:6px;color:#fff;font-size:13px;cursor:pointer;',
      'transition:background .2s;font-family:inherit;',
    '}',
    '.alkw-close-btn:hover{background:rgba(255,255,255,.25)}',

    /* ── Messages area ── */
    '.alkw-messages{',
      'flex:1;overflow-y:auto;padding:16px;background:#0f172a;',
      'display:flex;flex-direction:column;gap:12px;',
    '}',
    '.alkw-messages::-webkit-scrollbar{width:6px}',
    '.alkw-messages::-webkit-scrollbar-track{background:#1e293b;border-radius:3px}',
    '.alkw-messages::-webkit-scrollbar-thumb{background:#475569;border-radius:3px}',
    '.alkw-messages::-webkit-scrollbar-thumb:hover{background:#64748b}',

    /* ── Welcome ── */
    '.alkw-welcome{text-align:center;padding:40px 20px;color:#94a3b8;display:block}',
    '.alkw-welcome h3{color:#fff;margin:0 0 12px;font-size:20px;font-weight:600;display:block}',
    '.alkw-welcome p{margin:0 0 20px;font-size:14px;line-height:1.6;color:#94a3b8;display:block}',
    '.alkw-quick-buttons{display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin-top:16px}',
    '.alkw-quick-btn{',
      'all:initial;background:#1e293b;border:1px solid #334155;padding:8px 14px;',
      'border-radius:8px;color:#e2e8f0;font-size:13px;cursor:pointer;',
      'transition:all .2s;display:inline-flex;align-items:center;gap:6px;font-family:inherit;',
    '}',
    '.alkw-quick-btn:hover{background:#334155;border-color:#475569;transform:translateY(-1px)}',
    '.alkw-quick-btn span{display:inline;color:inherit;font-size:inherit}',

    /* ── Message bubble ── */
    '.alkw-message{display:flex;gap:10px;animation:alkw-fadeInUp .3s ease;max-width:100%}',
    '@keyframes alkw-fadeInUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
    '.alkw-message.alkw-user{flex-direction:row-reverse}',
    '.alkw-avatar{',
      'width:32px;height:32px;border-radius:50%;display:flex;',
      'align-items:center;justify-content:center;font-size:16px;flex-shrink:0;',
    '}',
    '.alkw-message.alkw-user .alkw-avatar{background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%)}',
    '.alkw-message.alkw-assistant .alkw-avatar{background:linear-gradient(135deg,#10b981 0%,#06b6d4 100%)}',
    '.alkw-message-content{',
      'max-width:calc(100% - 42px);padding:12px 16px;border-radius:12px;',
      'line-height:1.6;font-size:14px;word-wrap:break-word;overflow-wrap:break-word;',
      'display:block;color:#e2e8f0;',
    '}',
    '.alkw-message.alkw-user .alkw-message-content{',
      'background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);color:#fff;border-bottom-left-radius:4px;',
    '}',
    '.alkw-message.alkw-assistant .alkw-message-content{',
      'background:#1e293b;color:#e2e8f0;border:1px solid #334155;border-bottom-right-radius:4px;',
    '}',

    /* ── Rich text inside bubbles ── */
    '.alkw-message-content a{color:#60a5fa;text-decoration:underline;display:inline}',
    '.alkw-message-content strong{font-weight:600;display:inline;color:inherit}',
    '.alkw-message-content ol,.alkw-message-content ul{margin:8px 0;padding-right:20px;display:block}',
    '.alkw-message-content li{margin:4px 0;display:list-item;color:inherit}',
    '.alkw-message-content br{display:block}',

    /* ── Loading dots ── */
    '.alkw-loading{display:flex;gap:6px;padding:12px 16px}',
    '.alkw-loading span{',
      'width:8px;height:8px;border-radius:50%;background:#60a5fa;',
      'animation:alkw-pulse 1.4s infinite;display:block;',
    '}',
    '.alkw-loading span:nth-child(2){animation-delay:.2s}',
    '.alkw-loading span:nth-child(3){animation-delay:.4s}',
    '@keyframes alkw-pulse{0%,80%,100%{opacity:.3;transform:scale(.8)}40%{opacity:1;transform:scale(1)}}',

    /* ── Input area ── */
    '.alkw-input-area{padding:16px;background:#1e293b;border-top:1px solid #334155;flex-shrink:0;display:block}',
    '.alkw-input-wrapper{display:flex;gap:10px;align-items:flex-end}',
    '.alkw-textarea{',
      'all:initial;flex:1;background:#0f172a;border:1px solid #334155;border-radius:8px;',
      'padding:12px 14px;color:#fff;font-size:14px;font-family:inherit;',
      'resize:none;max-height:120px;min-height:44px;line-height:1.4;',
      'transition:border-color .2s;direction:rtl;display:block;',
    '}',
    '.alkw-textarea:focus{outline:none;border-color:#3b82f6}',
    '.alkw-textarea::placeholder{color:#64748b}',
    '.alkw-send-btn{',
      'all:initial;background:linear-gradient(135deg,#3b82f6 0%,#8b5cf6 100%);',
      'border:none;padding:12px 20px;border-radius:8px;color:#fff;font-size:14px;',
      'font-weight:500;cursor:pointer;transition:all .2s;min-width:70px;',
      'font-family:inherit;text-align:center;display:block;',
    '}',
    '.alkw-send-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 4px 12px rgba(59,130,246,.4)}',
    '.alkw-send-btn:active:not(:disabled){transform:translateY(0)}',
    '.alkw-send-btn:disabled{opacity:.5;cursor:not-allowed}',

    /* ── Mobile ── */
    '@media(max-width:768px){',
      '.alkw-widget-container{left:10px!important;right:10px!important;bottom:80px;width:calc(100vw - 20px);height:calc(100vh - 100px);max-width:100%;max-height:calc(100vh - 100px)}',
      '.alkw-widget-inner{border-radius:8px}',
    '}',

    /* ── Reduced motion ── */
    '@media(prefers-reduced-motion:reduce){',
      '.alkw-widget-container,.alkw-chat-button,.alkw-message{animation:none!important;transition:none!important}',
    '}',
  ].join('\n');

  // ==========================================================================
  //  §3  HELPERS
  // ==========================================================================
  var _esc = function(text) {
    var d = document.createElement('div');
    d.textContent = text;
    return d.innerHTML;
  };

  var _el = function(tag, props) {
    var el = document.createElement(tag);
    if (!props) return el;
    for (var k in props) {
      if (k === 'className')       el.className = props[k];
      else if (k === 'innerHTML')  el.innerHTML = props[k];
      else if (k === 'style')      Object.assign(el.style, props[k]);
      else                         el[k] = props[k];
    }
    return el;
  };

  // ==========================================================================
  //  §4  WIDGET CLASS
  //      init()  →  button only (< 1 KB CSS, 1 DOM node)
  //      open()  →  first time: build panel + inject panel CSS  (lazy)
  // ==========================================================================
  function AlkafeelChatWidget(config) {
    this.config = {
      apiEndpoint: '/api/chat/site',
      title:       'مساعدك في المشاريع',
      subtitle:    'اسأل عن مشاريع العتبة العباسية',
      position:    'left',
      buttonText:  '💬',
      buttonSize:  '60px',
      zIndex:      999998,
    };
    // Merge user config
    for (var k in config) {
      if (config.hasOwnProperty(k)) this.config[k] = config[k];
    }

    this.isOpen       = false;
    this.messages      = [];
    this.isLoading     = false;
    this._panelBuilt   = false;          // ← lazy flag
    this.el            = {};             // DOM refs

    this._initButton();
  }

  // ---------- Phase 1: Button only (runs immediately) ----------

  AlkafeelChatWidget.prototype._initButton = function() {
    // Inject button-only CSS (tiny)
    if (!document.getElementById('alkw-btn-css')) {
      var s = document.createElement('style');
      s.id = 'alkw-btn-css';
      s.textContent = BTN_STYLES;
      document.head.appendChild(s);
    }

    this.el.button = _el('button', {
      className: 'alkw-chat-button alkw-' + this.config.position,
      innerHTML: this.config.buttonText,
    });
    this.el.button.style.zIndex = this.config.zIndex;
    this.el.button.setAttribute('aria-label', 'فتح المحادثة');
    document.body.appendChild(this.el.button);

    var self = this;
    this.el.button.addEventListener('click', function() { self.toggle(); });

    console.log('[AlKafeel Widget] Button ready (panel deferred)');
  };

  // ---------- Phase 2: Panel (runs on FIRST open) ----------

  AlkafeelChatWidget.prototype._buildPanel = function() {
    if (this._panelBuilt) return;
    this._panelBuilt = true;

    // Inject panel CSS now
    if (!document.getElementById('alkw-panel-css')) {
      var s = document.createElement('style');
      s.id = 'alkw-panel-css';
      s.textContent = PANEL_STYLES;
      document.head.appendChild(s);
    }

    // Build container — use scoped querySelector, NO global IDs
    var pos = this.config.position;
    this.el.container = _el('div', {
      className: 'alkw-widget-container alkw-' + pos,
    });
    this.el.container.style.zIndex = this.config.zIndex + 1;

    this.el.container.innerHTML = [
      '<div class="alkw-widget-inner">',
        '<div class="alkw-header">',
          '<div class="alkw-header-text">',
            '<h2>' + _esc(this.config.title) + '</h2>',
            '<p>'  + _esc(this.config.subtitle) + '</p>',
          '</div>',
          '<button class="alkw-close-btn">\u2715 إغلاق</button>',
        '</div>',
        '<div class="alkw-messages">' + this._welcomeHTML() + '</div>',
        '<div class="alkw-input-area">',
          '<div class="alkw-input-wrapper">',
            '<textarea class="alkw-textarea" placeholder="اكتب سؤالك هنا..." rows="1"></textarea>',
            '<button class="alkw-send-btn">إرسال</button>',
          '</div>',
        '</div>',
      '</div>',
    ].join('');

    document.body.appendChild(this.el.container);

    // ── Scoped refs (NO document.getElementById) ──
    this.el.messagesArea = this.el.container.querySelector('.alkw-messages');
    this.el.input        = this.el.container.querySelector('.alkw-textarea');
    this.el.sendBtn      = this.el.container.querySelector('.alkw-send-btn');
    this.el.closeBtn     = this.el.container.querySelector('.alkw-close-btn');

    this._attachPanelEvents();
    console.log('[AlKafeel Widget] Panel built (lazy)');
  };

  AlkafeelChatWidget.prototype._attachPanelEvents = function() {
    var self = this;
    this.el.closeBtn.addEventListener('click', function() { self.close(); });
    this.el.sendBtn.addEventListener('click', function()  { self.sendMessage(); });

    this.el.input.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); self.sendMessage(); }
    });
    this.el.input.addEventListener('input', function(e) {
      e.target.style.height = 'auto';
      e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
    });
    // Quick-suggestion buttons (delegated)
    this.el.messagesArea.addEventListener('click', function(e) {
      var btn = e.target.closest('.alkw-quick-btn');
      if (btn) {
        var q = btn.getAttribute('data-query');
        if (q) { self.el.input.value = q; self.sendMessage(); }
      }
    });
  };

  // ---------- Toggle / Open / Close ----------

  AlkafeelChatWidget.prototype.toggle = function() {
    this.isOpen ? this.close() : this.open();
  };

  AlkafeelChatWidget.prototype.open = function() {
    this._buildPanel();                            // lazy — no-op if already built
    this.isOpen = true;
    this.el.container.classList.add('alkw-open');
    this.el.button.classList.add('alkw-open');
    this.el.button.innerHTML = '\u2715';
    this.el.button.setAttribute('aria-label', 'إغلاق المحادثة');
    this.el.input.focus();
  };

  AlkafeelChatWidget.prototype.close = function() {
    this.isOpen = false;
    if (this.el.container) this.el.container.classList.remove('alkw-open');
    this.el.button.classList.remove('alkw-open');
    this.el.button.innerHTML = this.config.buttonText;
    this.el.button.setAttribute('aria-label', 'فتح المحادثة');
  };

  // ---------- Chat I/O ----------

  AlkafeelChatWidget.prototype.sendMessage = function() {
    var text = this.el.input.value.trim();
    if (!text || this.isLoading) return;

    this.addMessage('user', text);
    this.el.input.value = '';
    this.el.input.style.height = 'auto';

    // Remove welcome
    var w = this.el.messagesArea.querySelector('.alkw-welcome');
    if (w) w.remove();

    this.isLoading = true;
    this.el.sendBtn.disabled = true;
    var loadingId = 'alkw-ld-' + Date.now();
    this._addLoading(loadingId);

    var self = this;
    fetch(this.config.apiEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages:   self.messages,
        temperature: 0.7,
        max_tokens:  2000,
        use_tools: true,
      }),
    })
    .then(function(response) {
      self._removeById(loadingId);

      if (!response.ok) {
        return response.json().catch(function() { return {}; }).then(function(d) {
          self.addMessage('assistant', d.fallback || d.error || '⚠️ عذراً، حدث خطأ. يُرجى المحاولة مرة أخرى.');
        });
      }

      var ct = (response.headers.get('content-type') || '').toLowerCase();

      if (ct.indexOf('application/json') !== -1) {
        return response.json().then(function(data) {
          self.addMessage('assistant', data.message || 'عذراً، لم أتمكن من الحصول على رد.');
        });
      }

      if (response.body) {
        return self._readStream(response);
      }

      return response.text().then(function(t) {
        self.addMessage('assistant', t || 'لم يتم استلام رد.');
      });
    })
    .catch(function(err) {
      console.error('[AlKafeel Widget]', err);
      self._removeById(loadingId);
      self.addMessage('assistant', '⚠️ عذراً، حدث خطأ في الاتصال. يُرجى المحاولة مرة أخرى.');
    })
    .finally(function() {
      self.isLoading = false;
      self.el.sendBtn.disabled = false;
      self.el.input.focus();
    });
  };

  AlkafeelChatWidget.prototype._readStream = function(response) {
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var full = '';
    var id = 'alkw-st-' + Date.now();
    var bubble = this._makeBubble(id);
    var self = this;

    function pump() {
      return reader.read().then(function(result) {
        if (result.done) {
          self.messages.push({ role: 'assistant', content: full });
          return;
        }
        full += decoder.decode(result.value, { stream: true });
        bubble.innerHTML = self._fmt(full);
        self._scroll();
        return pump();
      });
    }
    return pump().catch(function(e) {
      console.error('[AlKafeel Widget] Stream error:', e);
      if (!full) {
        full = '⚠️ حدث خطأ أثناء استلام الرد.';
        bubble.innerHTML = self._fmt(full);
      }
      self.messages.push({ role: 'assistant', content: full });
    });
  };

  // ---------- DOM helpers ----------

  AlkafeelChatWidget.prototype.addMessage = function(role, content) {
    this.messages.push({ role: role, content: content });

    var row = _el('div', { className: 'alkw-message alkw-' + role });
    var av  = _el('div', { className: 'alkw-avatar', innerHTML: role === 'user' ? '👤' : '🤖' });
    var bub = _el('div', { className: 'alkw-message-content', innerHTML: this._fmt(content) });
    row.appendChild(av);
    row.appendChild(bub);
    this.el.messagesArea.appendChild(row);
    this._scroll();
  };

  AlkafeelChatWidget.prototype._addLoading = function(id) {
    var row = _el('div', { className: 'alkw-message alkw-assistant' });
    row.setAttribute('data-alkw-id', id);
    var av  = _el('div', { className: 'alkw-avatar', innerHTML: '🤖' });
    var bub = _el('div', { className: 'alkw-message-content' });
    bub.innerHTML = '<div class="alkw-loading"><span></span><span></span><span></span></div>';
    row.appendChild(av); row.appendChild(bub);
    this.el.messagesArea.appendChild(row);
    this._scroll();
  };

  AlkafeelChatWidget.prototype._makeBubble = function(id) {
    var row = _el('div', { className: 'alkw-message alkw-assistant' });
    row.setAttribute('data-alkw-id', id);
    var av  = _el('div', { className: 'alkw-avatar', innerHTML: '🤖' });
    var bub = _el('div', { className: 'alkw-message-content' });
    row.appendChild(av); row.appendChild(bub);
    this.el.messagesArea.appendChild(row);
    this._scroll();
    return bub;
  };

  AlkafeelChatWidget.prototype._removeById = function(id) {
    var el = this.el.container.querySelector('[data-alkw-id="' + id + '"]');
    if (el) el.remove();
  };

  AlkafeelChatWidget.prototype._scroll = function() {
    var ma = this.el.messagesArea;
    setTimeout(function() { ma.scrollTop = ma.scrollHeight; }, 80);
  };

  AlkafeelChatWidget.prototype._fmt = function(text) {
    if (!text) return '';
    var h = _esc(text);
    h = h.replace(/\*\*(.+?)\*\*/g,                                  '<strong>$1</strong>');
    h = h.replace(/\[([^\]]+)\]\(([^)]+)\)/g,                        '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    h = h.replace(/^(\d+)\.\s+(.+)$/gm,                              '<li>$2</li>');
    h = h.replace(/^[-\u2022]\s+(.+)$/gm,                            '<li>$1</li>');
    h = h.replace(/\n/g,                                              '<br>');
    h = h.replace(/((<li>.+?<\/li>)(<br>)*)+/g, function(m) {
      return '<ol>' + m.replace(/<br>/g, '') + '</ol>';
    });
    return h;
  };

  AlkafeelChatWidget.prototype._welcomeHTML = function() {
    var btns = [
      { e:'📚', l:'المشاريع الثقافية',  q:'أعرض لي المشاريع الثقافية' },
      { e:'🎓', l:'المشاريع التعليمية',  q:'أعرض لي المشاريع التعليمية' },
      { e:'🕌', l:'مشاريع الصحن',       q:'أعرض لي مشاريع الصحن ومقترباته' },
      { e:'🏥', l:'المشاريع الطبية',     q:'أعرض لي المشاريع الطبية' },
    ];
    var html = btns.map(function(b) {
      return '<button class="alkw-quick-btn" data-query="' + _esc(b.q) + '">'
           + '<span>' + b.e + '</span><span>' + _esc(b.l) + '</span></button>';
    }).join('');
    return '<div class="alkw-welcome">'
         + '<h3>\uD83D\uDC4B مرحباً بك!</h3>'
         + '<p>أنا مساعدك الذكي للاستعلام عن مشاريع العتبة العباسية المقدسة</p>'
         + '<div class="alkw-quick-buttons">' + html + '</div></div>';
  };

  AlkafeelChatWidget.prototype.destroy = function() {
    if (this.el.button)    this.el.button.remove();
    if (this.el.container) this.el.container.remove();
    var s1 = document.getElementById('alkw-btn-css');   if (s1) s1.remove();
    var s2 = document.getElementById('alkw-panel-css'); if (s2) s2.remove();
  };

  // ==========================================================================
  //  §5  PUBLIC API
  // ==========================================================================
  window.AlkafeelWidget = {
    _loaded: true,
    _instances: [],
    version: '2.0.0',

    /**
     * تهيئة الودجت
     * @param {Object} config
     * @returns {AlkafeelChatWidget}
     */
    init: function(config) {
      var w = new AlkafeelChatWidget(config || {});
      this._instances.push(w);
      return w;
    },

    /** إزالة جميع instances */
    destroyAll: function() {
      this._instances.forEach(function(w) { w.destroy(); });
      this._instances = [];
    },
  };

  // Auto-init
  if (window.ALKAFEEL_WIDGET_CONFIG) {
    window.AlkafeelWidget.init(window.ALKAFEEL_WIDGET_CONFIG);
  }

  console.log('[AlKafeel Widget] v2.0.0 loaded');

})(window, document);
