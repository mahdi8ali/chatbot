/**
 * AlKafeel Chat Widget - Standalone Bundle
 * Version: 1.0.0
 * 
 * تضمين بسيط:
 * <script src="https://YOUR-DOMAIN/widget.js"></script>
 * <script>AlkafeelWidget.init({ apiEndpoint: 'YOUR-API-URL' });</script>
 */

(function(window, document) {
  'use strict';

  // منع التحميل المتكرر
  if (window.AlkafeelWidget) {
    console.warn('[AlKafeel Widget] Already loaded');
    return;
  }

  // ============================================
  // CSS STYLES (مدمج مع prefix لتجنب التعارضات)
  // ============================================
  const WIDGET_STYLES = `
    /* Reset للودجت فقط */
    .alkw-widget *, .alkw-widget *::before, .alkw-widget *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    /* الزر العائم */
    .alkw-chat-button {
      position: fixed;
      bottom: 20px;
      width: 60px;
      height: 60px;
      border-radius: 50%;
      background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%);
      color: white;
      border: none;
      font-size: 28px;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      z-index: 999998;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      justify-content: center;
      user-select: none;
      -webkit-tap-highlight-color: transparent;
    }

    .alkw-chat-button.alkw-left {
      left: 20px;
    }

    .alkw-chat-button.alkw-right {
      right: 20px;
    }

    .alkw-chat-button:hover {
      transform: scale(1.1);
      box-shadow: 0 6px 20px rgba(30, 64, 175, 0.5);
    }

    .alkw-chat-button:active {
      transform: scale(0.95);
    }

    .alkw-chat-button.alkw-open {
      transform: rotate(180deg);
    }

    .alkw-chat-button.alkw-open:hover {
      transform: rotate(180deg) scale(1.1);
    }

    /* نافذة الودجت */
    .alkw-widget-container {
      position: fixed;
      bottom: 100px;
      width: 400px;
      height: 600px;
      max-width: calc(100vw - 40px);
      max-height: calc(100vh - 140px);
      z-index: 999999;
      opacity: 0;
      visibility: hidden;
      transform: translateY(20px) scale(0.95);
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      font-family: 'Readex Pro', -apple-system, BlinkMacSystemFont, 'Segoe UI', 
                   'Helvetica Neue', Arial, sans-serif;
      direction: rtl;
    }

    .alkw-widget-container.alkw-left {
      left: 20px;
    }

    .alkw-widget-container.alkw-right {
      right: 20px;
    }

    .alkw-widget-container.alkw-open {
      opacity: 1;
      visibility: visible;
      transform: translateY(0) scale(1);
    }

    /* محتوى الودجت */
    .alkw-widget-inner {
      width: 100%;
      height: 100%;
      background: #111827;
      border-radius: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      box-shadow: 0 20px 60px rgba(0,0,0,0.5);
      border: 1px solid #1f2937;
    }

    /* الهيدر */
    .alkw-header {
      background: linear-gradient(135deg, #1e40af 0%, #7c3aed 100%);
      color: white;
      padding: 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid rgba(255, 255, 255, 0.1);
      flex-shrink: 0;
    }

    .alkw-header-text h2 {
      margin: 0;
      font-size: 18px;
      font-weight: 600;
      line-height: 1.2;
    }

    .alkw-header-text p {
      margin: 4px 0 0 0;
      font-size: 12px;
      opacity: 0.9;
      line-height: 1.2;
    }

    .alkw-close-btn {
      background: rgba(255, 255, 255, 0.15);
      border: none;
      padding: 6px 12px;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      cursor: pointer;
      transition: background 0.2s;
      font-family: inherit;
    }

    .alkw-close-btn:hover {
      background: rgba(255, 255, 255, 0.25);
    }

    /* منطقة الرسائل */
    .alkw-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      background: #0f172a;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }

    .alkw-messages::-webkit-scrollbar {
      width: 6px;
    }

    .alkw-messages::-webkit-scrollbar-track {
      background: #1e293b;
      border-radius: 3px;
    }

    .alkw-messages::-webkit-scrollbar-thumb {
      background: #475569;
      border-radius: 3px;
    }

    .alkw-messages::-webkit-scrollbar-thumb:hover {
      background: #64748b;
    }

    /* رسالة الترحيب */
    .alkw-welcome {
      text-align: center;
      padding: 40px 20px;
      color: #94a3b8;
    }

    .alkw-welcome h3 {
      color: white;
      margin: 0 0 12px 0;
      font-size: 20px;
      font-weight: 600;
    }

    .alkw-welcome p {
      margin: 0 0 20px 0;
      font-size: 14px;
      line-height: 1.6;
    }

    /* الأزرار السريعة */
    .alkw-quick-buttons {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      justify-content: center;
      margin-top: 16px;
    }

    .alkw-quick-btn {
      background: #1e293b;
      border: 1px solid #334155;
      padding: 8px 14px;
      border-radius: 8px;
      color: #e2e8f0;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.2s;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-family: inherit;
    }

    .alkw-quick-btn:hover {
      background: #334155;
      border-color: #475569;
      transform: translateY(-1px);
    }

    /* رسالة واحدة */
    .alkw-message {
      display: flex;
      gap: 10px;
      animation: alkw-fadeInUp 0.3s ease;
      max-width: 100%;
    }

    @keyframes alkw-fadeInUp {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    .alkw-message.alkw-user {
      flex-direction: row-reverse;
    }

    .alkw-avatar {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 16px;
      flex-shrink: 0;
    }

    .alkw-message.alkw-user .alkw-avatar {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
    }

    .alkw-message.alkw-assistant .alkw-avatar {
      background: linear-gradient(135deg, #10b981 0%, #06b6d4 100%);
    }

    .alkw-message-content {
      max-width: calc(100% - 42px);
      padding: 12px 16px;
      border-radius: 12px;
      line-height: 1.6;
      font-size: 14px;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }

    .alkw-message.alkw-user .alkw-message-content {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      color: white;
      border-bottom-left-radius: 4px;
    }

    .alkw-message.alkw-assistant .alkw-message-content {
      background: #1e293b;
      color: #e2e8f0;
      border: 1px solid #334155;
      border-bottom-right-radius: 4px;
    }

    .alkw-message-content a {
      color: #60a5fa;
      text-decoration: underline;
    }

    .alkw-message-content strong {
      font-weight: 600;
    }

    .alkw-message-content ol,
    .alkw-message-content ul {
      margin: 8px 0;
      padding-right: 20px;
    }

    .alkw-message-content li {
      margin: 4px 0;
    }

    /* Loading indicator */
    .alkw-loading {
      display: flex;
      gap: 6px;
      padding: 12px 16px;
    }

    .alkw-loading span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #60a5fa;
      animation: alkw-pulse 1.4s infinite;
    }

    .alkw-loading span:nth-child(2) {
      animation-delay: 0.2s;
    }

    .alkw-loading span:nth-child(3) {
      animation-delay: 0.4s;
    }

    @keyframes alkw-pulse {
      0%, 80%, 100% {
        opacity: 0.3;
        transform: scale(0.8);
      }
      40% {
        opacity: 1;
        transform: scale(1);
      }
    }

    /* منطقة الإدخال */
    .alkw-input-area {
      padding: 16px;
      background: #1e293b;
      border-top: 1px solid #334155;
      flex-shrink: 0;
    }

    .alkw-input-wrapper {
      display: flex;
      gap: 10px;
      align-items: flex-end;
    }

    .alkw-textarea {
      flex: 1;
      background: #0f172a;
      border: 1px solid #334155;
      border-radius: 8px;
      padding: 12px 14px;
      color: white;
      font-size: 14px;
      font-family: inherit;
      resize: none;
      max-height: 120px;
      min-height: 44px;
      line-height: 1.4;
      transition: border-color 0.2s;
    }

    .alkw-textarea:focus {
      outline: none;
      border-color: #3b82f6;
    }

    .alkw-textarea::placeholder {
      color: #64748b;
    }

    .alkw-send-btn {
      background: linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%);
      border: none;
      padding: 12px 20px;
      border-radius: 8px;
      color: white;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.2s;
      min-width: 70px;
      font-family: inherit;
    }

    .alkw-send-btn:hover:not(:disabled) {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(59, 130, 246, 0.4);
    }

    .alkw-send-btn:active:not(:disabled) {
      transform: translateY(0);
    }

    .alkw-send-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    /* Mobile Responsive */
    @media (max-width: 768px) {
      .alkw-widget-container {
        left: 10px !important;
        right: 10px !important;
        bottom: 80px;
        width: calc(100vw - 20px);
        height: calc(100vh - 100px);
        max-width: 100%;
        max-height: calc(100vh - 100px);
      }

      .alkw-chat-button {
        bottom: 15px;
      }

      .alkw-chat-button.alkw-left {
        left: 15px;
      }

      .alkw-chat-button.alkw-right {
        right: 15px;
      }

      .alkw-widget-inner {
        border-radius: 8px;
      }
    }

    /* تحسينات إضافية */
    @media (prefers-reduced-motion: reduce) {
      .alkw-widget-container,
      .alkw-chat-button,
      .alkw-message {
        animation: none;
        transition: none;
      }
    }
  `;

  // ============================================
  // WIDGET CLASS
  // ============================================
  class AlkafeelChatWidget {
    constructor(config = {}) {
      this.config = {
        apiEndpoint: config.apiEndpoint || '/api/chat/site',
        title: config.title || 'مساعدك في المشاريع',
        subtitle: config.subtitle || 'اسأل عن مشاريع العتبة العباسية',
        position: config.position || 'left',
        buttonText: config.buttonText || '💬',
        buttonSize: config.buttonSize || '60px',
        zIndex: config.zIndex || 999998,
        ...config
      };

      this.isOpen = false;
      this.messages = [];
      this.isLoading = false;
      this.elements = {};

      this.init();
    }

    init() {
      this.injectStyles();
      this.createElements();
      this.attachEvents();
      console.log('[AlKafeel Widget] Initialized successfully');
    }

    injectStyles() {
      if (document.getElementById('alkw-styles')) return;

      const style = document.createElement('style');
      style.id = 'alkw-styles';
      style.textContent = WIDGET_STYLES;
      document.head.appendChild(style);
    }

    createElements() {
      // إنشاء الزر
      this.elements.button = this.createElement('button', {
        className: `alkw-chat-button alkw-${this.config.position}`,
        innerHTML: this.config.buttonText,
        style: { fontSize: this.config.buttonSize }
      });

      // إنشاء Container
      this.elements.container = this.createElement('div', {
        className: `alkw-widget-container alkw-${this.config.position} alkw-widget`
      });

      // البنية الداخلية
      this.elements.container.innerHTML = `
        <div class="alkw-widget-inner">
          <div class="alkw-header">
            <div class="alkw-header-text">
              <h2>${this.escapeHtml(this.config.title)}</h2>
              <p>${this.escapeHtml(this.config.subtitle)}</p>
            </div>
            <button class="alkw-close-btn">✕ إغلاق</button>
          </div>
          <div class="alkw-messages" id="alkw-messages-area">
            ${this.getWelcomeHTML()}
          </div>
          <div class="alkw-input-area">
            <div class="alkw-input-wrapper">
              <textarea 
                id="alkw-input" 
                class="alkw-textarea" 
                placeholder="اكتب سؤالك هنا..."
                rows="1"
              ></textarea>
              <button id="alkw-send-btn" class="alkw-send-btn">إرسال</button>
            </div>
          </div>
        </div>
      `;

      document.body.appendChild(this.elements.button);
      document.body.appendChild(this.elements.container);

      // الحصول على العناصر الداخلية
      this.elements.messagesArea = document.getElementById('alkw-messages-area');
      this.elements.input = document.getElementById('alkw-input');
      this.elements.sendBtn = document.getElementById('alkw-send-btn');
      this.elements.closeBtn = this.elements.container.querySelector('.alkw-close-btn');
    }

    attachEvents() {
      // فتح/إغلاق
      this.elements.button.addEventListener('click', () => this.toggle());
      this.elements.closeBtn.addEventListener('click', () => this.close());

      // إرسال رسالة
      this.elements.sendBtn.addEventListener('click', () => this.sendMessage());
      
      // Enter للإرسال
      this.elements.input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          this.sendMessage();
        }
      });

      // Auto-resize textarea
      this.elements.input.addEventListener('input', (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
      });

      // الأزرار السريعة
      this.elements.messagesArea.addEventListener('click', (e) => {
        if (e.target.classList.contains('alkw-quick-btn')) {
          const query = e.target.getAttribute('data-query');
          if (query) {
            this.elements.input.value = query;
            this.sendMessage();
          }
        }
      });
    }

    toggle() {
      this.isOpen ? this.close() : this.open();
    }

    open() {
      this.isOpen = true;
      this.elements.container.classList.add('alkw-open');
      this.elements.button.classList.add('alkw-open');
      this.elements.button.innerHTML = '✕';
      this.elements.input.focus();
    }

    close() {
      this.isOpen = false;
      this.elements.container.classList.remove('alkw-open');
      this.elements.button.classList.remove('alkw-open');
      this.elements.button.innerHTML = this.config.buttonText;
    }

    async sendMessage() {
      const text = this.elements.input.value.trim();
      if (!text || this.isLoading) return;

      // إضافة رسالة المستخدم
      this.addMessage('user', text);
      this.elements.input.value = '';
      this.elements.input.style.height = 'auto';

      // إزالة الترحيب إن وجد
      const welcome = this.elements.messagesArea.querySelector('.alkw-welcome');
      if (welcome) welcome.remove();

      // عرض loading
      this.isLoading = true;
      this.elements.sendBtn.disabled = true;
      const loadingId = 'loading-' + Date.now();
      this.addLoadingMessage(loadingId);

      try {
        // ✅ إرسال بنفس الشكل الذي يتوقعه /api/chat/site
        const response = await fetch(this.config.apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            messages: this.messages,
            temperature: 0.7,
            max_tokens: 2000,
            use_tools: true
          })
        });

        // حذف loading
        this.removeLoadingEl(loadingId);

        // ✅ معالجة أخطاء HTTP مع استخدام fallback من الـ API
        if (!response.ok) {
          let errMsg = '⚠️ عذراً، حدث خطأ. يُرجى المحاولة مرة أخرى.';
          try {
            const errData = await response.json();
            errMsg = errData.fallback || errData.error || errMsg;
          } catch(e) { /* ignore parse error */ }
          this.addMessage('assistant', errMsg);
          return;
        }

        // ✅ تحديد نوع الرد: JSON (Function Calling) أو Stream (الوضع العادي)
        const contentType = (response.headers.get('content-type') || '').toLowerCase();

        if (contentType.includes('application/json')) {
          // --- الوضع الأساسي: Function Calling يرجع JSON ---
          const data = await response.json();
          const reply = data.message || 'عذراً، لم أتمكن من الحصول على رد.';
          this.addMessage('assistant', reply);

        } else if (response.body) {
          // --- الوضع الاحتياطي: Stream نصي (text/plain) ---
          await this.handleStreamResponse(response);

        } else {
          // --- fallback أخير: نص عادي ---
          const plainText = await response.text();
          this.addMessage('assistant', plainText || 'لم يتم استلام رد.');
        }

      } catch (error) {
        console.error('[AlKafeel Widget] Error:', error);
        this.removeLoadingEl(loadingId);
        this.addMessage('assistant', '⚠️ عذراً، حدث خطأ في الاتصال. يُرجى المحاولة مرة أخرى.');
      } finally {
        this.isLoading = false;
        this.elements.sendBtn.disabled = false;
        this.elements.input.focus();
      }
    }

    /**
     * معالجة الرد المتدفق (Streaming) — يعرض النص حرفاً بحرف
     */
    async handleStreamResponse(response) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      // إنشاء عنصر رسالة فارغ للتحديث التدريجي
      const streamId = 'stream-' + Date.now();
      const { contentEl } = this.createAssistantBubble(streamId);

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          fullText += decoder.decode(value, { stream: true });
          contentEl.innerHTML = this.formatMessage(fullText);
          this.scrollToBottom();
        }
      } catch (e) {
        console.error('[AlKafeel Widget] Stream error:', e);
        if (!fullText) fullText = '⚠️ حدث خطأ أثناء استلام الرد.';
      }

      // حفظ الرد الكامل في سجل المحادثة
      this.messages.push({ role: 'assistant', content: fullText });
    }

    /**
     * إنشاء فقاعة رسالة المساعد (بدون حفظ في history)
     * تُستخدم للـ streaming حيث نحدّث المحتوى تدريجياً
     */
    createAssistantBubble(id) {
      const messageEl = this.createElement('div', {
        className: 'alkw-message alkw-assistant',
        id: id
      });
      const avatar = this.createElement('div', {
        className: 'alkw-avatar',
        innerHTML: '🤖'
      });
      const contentEl = this.createElement('div', {
        className: 'alkw-message-content'
      });
      messageEl.appendChild(avatar);
      messageEl.appendChild(contentEl);
      this.elements.messagesArea.appendChild(messageEl);
      this.scrollToBottom();
      return { messageEl, contentEl };
    }

    /**
     * حذف عنصر loading بالـ ID
     */
    removeLoadingEl(id) {
      const el = document.getElementById(id);
      if (el) el.remove();
    }

    addMessage(role, content) {
      // حفظ في التاريخ
      this.messages.push({ role, content });

      // إنشاء عنصر الرسالة
      const messageEl = this.createElement('div', {
        className: `alkw-message alkw-${role}`
      });

      const avatar = this.createElement('div', {
        className: 'alkw-avatar',
        innerHTML: role === 'user' ? '👤' : '🤖'
      });

      const messageContent = this.createElement('div', {
        className: 'alkw-message-content',
        innerHTML: this.formatMessage(content)
      });

      messageEl.appendChild(avatar);
      messageEl.appendChild(messageContent);
      this.elements.messagesArea.appendChild(messageEl);

      this.scrollToBottom();
    }

    addLoadingMessage(id) {
      const messageEl = this.createElement('div', {
        className: 'alkw-message alkw-assistant',
        id: id
      });

      const avatar = this.createElement('div', {
        className: 'alkw-avatar',
        innerHTML: '🤖'
      });

      const loadingEl = this.createElement('div', {
        className: 'alkw-message-content'
      });

      loadingEl.innerHTML = `
        <div class="alkw-loading">
          <span></span>
          <span></span>
          <span></span>
        </div>
      `;

      messageEl.appendChild(avatar);
      messageEl.appendChild(loadingEl);
      this.elements.messagesArea.appendChild(messageEl);

      this.scrollToBottom();
    }

    formatMessage(text) {
      if (!text) return '';
      
      let html = this.escapeHtml(text);
      
      // Markdown formatting
      html = html
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
        .replace(/^(\d+)\.\s+(.+)$/gm, '<li>$2</li>')
        .replace(/^[-•]\s+(.+)$/gm, '<li>$1</li>')
        .replace(/\n/g, '<br>');

      // تحويل القوائم
      html = html.replace(/((<li>.+?<\/li>)(<br>)?)+/g, (match) => {
        const items = match.replace(/<br>/g, '');
        return '<ol>' + items + '</ol>';
      });

      return html;
    }

    scrollToBottom() {
      setTimeout(() => {
        this.elements.messagesArea.scrollTop = this.elements.messagesArea.scrollHeight;
      }, 100);
    }

    getWelcomeHTML() {
      const quickButtons = [
        { emoji: '📚', label: 'المشاريع الثقافية', query: 'أعرض لي المشاريع الثقافية' },
        { emoji: '🎓', label: 'المشاريع التعليمية', query: 'أعرض لي المشاريع التعليمية' },
        { emoji: '🕌', label: 'مشاريع الصحن', query: 'أعرض لي مشاريع الصحن ومقترباته' },
        { emoji: '🏥', label: 'المشاريع الطبية', query: 'أعرض لي المشاريع الطبية' },
      ];

      const buttonsHTML = quickButtons.map(btn => 
        `<button class="alkw-quick-btn" data-query="${this.escapeHtml(btn.query)}">
          <span>${btn.emoji}</span>
          <span>${this.escapeHtml(btn.label)}</span>
        </button>`
      ).join('');

      return `
        <div class="alkw-welcome">
          <h3>👋 مرحباً بك!</h3>
          <p>أنا مساعدك الذكي للاستعلام عن مشاريع العتبة العباسية المقدسة</p>
          <div class="alkw-quick-buttons">
            ${buttonsHTML}
          </div>
        </div>
      `;
    }

    createElement(tag, props = {}) {
      const el = document.createElement(tag);
      Object.keys(props).forEach(key => {
        if (key === 'className') {
          el.className = props[key];
        } else if (key === 'innerHTML') {
          el.innerHTML = props[key];
        } else if (key === 'style') {
          Object.assign(el.style, props[key]);
        } else {
          el[key] = props[key];
        }
      });
      return el;
    }

    escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    destroy() {
      if (this.elements.button) this.elements.button.remove();
      if (this.elements.container) this.elements.container.remove();
      const styles = document.getElementById('alkw-styles');
      if (styles) styles.remove();
    }
  }

  // ============================================
  // PUBLIC API
  // ============================================
  window.AlkafeelWidget = {
    /**
     * تهيئة الودجت
     * @param {Object} config - إعدادات الودجت
     * @returns {AlkafeelChatWidget} instance
     */
    init: function(config) {
      const widget = new AlkafeelChatWidget(config);
      
      // حفظ reference للاستخدام لاحقاً
      if (!window.AlkafeelWidget._instances) {
        window.AlkafeelWidget._instances = [];
      }
      window.AlkafeelWidget._instances.push(widget);
      
      return widget;
    },

    /**
     * إزالة جميع الودجتات
     */
    destroyAll: function() {
      if (window.AlkafeelWidget._instances) {
        window.AlkafeelWidget._instances.forEach(w => w.destroy());
        window.AlkafeelWidget._instances = [];
      }
    },

    version: '1.0.0'
  };

  // Auto-init إذا كان هناك config
  if (window.ALKAFEEL_WIDGET_CONFIG) {
    window.AlkafeelWidget.init(window.ALKAFEEL_WIDGET_CONFIG);
  }

  console.log('[AlKafeel Widget] Loaded successfully v1.0.0');

})(window, document);
