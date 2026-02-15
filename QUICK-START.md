# 🚀 Quick Start Guide - البدء السريع

## 🎯 نظرة عامة

هذا الدليل يساعدك على تشغيل البوت محلياً في **أقل من 10 دقائق**.

---

## ✅ المتطلبات

- Node.js 18+ (تحميل من [nodejs.org](https://nodejs.org/))
- npm أو yarn
- حساب OpenAI مع API Key ([platform.openai.com](https://platform.openai.com/))
- حساب Supabase (Optional - للمزايا الكاملة)
- REST API Token من موقع projects.alkafeel.net

---

## 📦 التثبيت السريع

### 1. Clone المشروع
```bash
git clone <repository-url>
cd chatbot
```

### 2. تثبيت Dependencies
```bash
npm install
```

### 3. إعداد Environment Variables

إنشاء `.env.local` في جذر المشروع:

```env
# ===== OpenAI (مطلوب) =====
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxx

# ===== Site API (مطلوب للمرحلة 2-4) =====
SITE_API_BASE_URL=https://api.projects.alkafeel.net
SITE_API_TOKEN=your-api-token-here
SITE_DOMAIN=https://projects.alkafeel.net

# ===== Supabase (اختياري - للمزايا الكاملة) =====
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
```

### 4. Setup Supabase (اختياري)

إذا كنت تريد المزايا الكاملة:

```bash
# تثبيت Supabase CLI
npm install -g supabase

# تهيئة Supabase
npx supabase init

# تشغيل Supabase محلياً
npx supabase start

# تطبيق Migrations
npx supabase db push
```

انسخ الـ URL و Keys من output وضعها في `.env.local`.

### 5. تشغيل المشروع
```bash
npm run dev
```

افتح المتصفح على: `http://localhost:3000`

---

## 🧪 اختبار سريع

### Test 1: Chat Endpoint
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "اعرض آخر المشاريع"}
    ]
  }'
```

**المتوقع:** رد من OpenAI بآخر المشاريع

### Test 2: Rate Limiting
```bash
# إرسال 21 طلب سريع
for i in {1..21}; do
  echo "Request $i"
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/chat/site \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}'
done
```

**المتوقع:** 
- الطلبات 1-20: `200`
- الطلب 21: `429 (Rate Limited)`

### Test 3: XSS Protection
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<script>alert(1)</script>ابحث عن مشاريع"}
    ]
  }'
```

**المتوقع:** يُعالج كـ "ابحث عن مشاريع" (بدون script tag)

---

## 📚 ماذا بعد؟

### للبدء بالتطوير:
1. اقرأ [ALL-PHASES-SUMMARY.md](ALL-PHASES-SUMMARY.md) - نظرة شاملة على المشروع
2. اقرأ [PHASE-1-SYSTEM-PROMPTS.md](PHASE-1-SYSTEM-PROMPTS.md) - فهم سلوك البوت
3. اقرأ [PHASE-2-FUNCTION-CALLING.md](PHASE-2-FUNCTION-CALLING.md) - فهم تكامل API

### للاختبار:
1. اقرأ [SECURITY-TESTING-GUIDE.md](SECURITY-TESTING-GUIDE.md) - اختبارات شاملة
2. نفّذ جميع الاختبارات للتأكد من سلامة التشغيل

### للنشر:
1. اقرأ [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) - دليل النشر الكامل
2. اتبع الـ Checklist قبل النشر

---

## 🎯 الميزات الأساسية

### ✅ ما يستطيع البوت فعله:
- 🔍 **البحث** عن المشاريع بالنص
- 📊 **عرض التفاصيل** لمشروع محدد
- 🔢 **فلترة** المشاريع (نوع، حالة، تاريخ)
- 📈 **الإحصائيات** العامة
- 🆕 **آخر المشاريع** المضافة

### ❌ ما لا يستطيع البوت فعله:
- ❌ الإجابة عن السياسة أو الدين
- ❌ الحديث عن مواضيع خارج المشاريع
- ❌ طلب معلومات شخصية (email, phone, etc.)
- ❌ تنفيذ JavaScript أو HTML

### 🛡️ الأمان:
- ✅ Rate Limiting: 20 طلب/دقيقة
- ✅ XSS Protection
- ✅ Data Sanitization
- ✅ CORS Protection
- ✅ Privacy Policy

---

## 🐛 حل المشاكل الشائعة

### مشكلة: "OpenAI API Key not found"
**الحل:** 
1. تأكد من وجود `OPENAI_API_KEY` في `.env.local`
2. أعد تشغيل `npm run dev`

### مشكلة: "Site API token invalid"
**الحل:** 
1. تحقق من `SITE_API_TOKEN` في `.env.local`
2. تأكد من صلاحية الـ Token على الموقع

### مشكلة: "Cannot connect to Supabase"
**الحل:**
1. تأكد من تشغيل Supabase: `npx supabase start`
2. تحقق من الـ Keys في `.env.local`
3. أو اجعل Supabase اختياري - البوت سيعمل بدونه للـ Chat فقط

### مشكلة: "Rate limit not working"
**الحل:**
1. تأكد من استخدام نفس الـ IP للطلبات
2. انتظر 5 دقائق لإعادة تعيين الـ Count
3. تحقق من Logs: `console.log` في rate-limiter.ts

### مشكلة: "TypeScript errors"
**الحل:**
```bash
# حذف node_modules وإعادة التثبيت:
rm -rf node_modules
rm package-lock.json
npm install

# إذا استمرت المشكلة:
npm run build
```

---

## 📁 البنية الأساسية

```
chatbot/
├── app/
│   └── api/
│       └── chat/
│           └── site/
│               └── route.ts       ← Main Chat Endpoint
├── lib/
│   └── server/
│       ├── system-prompts.ts      ← Phase 1
│       ├── site-api-tools.ts      ← Phase 2
│       ├── site-api-service.ts    ← Phase 2
│       ├── rate-limiter.ts        ← Phase 4
│       └── data-sanitizer.ts      ← Phase 4
└── .env.local                     ← Configuration
```

---

## 🔑 Environment Variables الإضافية (اختيارية)

```env
# ===== Redis (للـ Production Scale) =====
REDIS_URL=redis://localhost:6379

# ===== Custom Timeouts =====
API_TIMEOUT_MS=15000              # Default: 15 seconds
MAX_RETRIES=2                     # Default: 2

# ===== Rate Limiting =====
RATE_LIMIT_MAX=20                 # Default: 20 requests
RATE_LIMIT_WINDOW_MS=60000        # Default: 60 seconds

# ===== Logging =====
LOGTAIL_TOKEN=xxx                 # Optional: Logtail logging service
```

---

## 📊 الـ Endpoints المتاحة

### 1. Chat Endpoint
```
POST /api/chat/site
Content-Type: application/json

Body:
{
  "messages": [
    {"role": "user", "content": "ابحث عن مشاريع"}
  ]
}
```

### 2. Health Check
```
GET /api/health

Response:
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

---

## 💡 نصائح للتطوير

### 1. تفعيل Detailed Logging:
```typescript
// في lib/server/rate-limiter.ts
console.log('[Rate Limiter]', {
  ip,
  count: clientData.requestCount,
  allowed: result.allowed
})
```

### 2. تعطيل Rate Limiting مؤقتاً:
```typescript
// في app/api/chat/site/route.ts
// قم بالتعليق على:
// const rateLimitResult = applyRateLimit(request, ...)
// if (!rateLimitResult.allowed) { ... }
```

### 3. اختبار مع Mock API:
```typescript
// في lib/server/site-api-service.ts
// أضف mock data:
if (process.env.NODE_ENV === 'development') {
  return { 
    projects: [
      {id: 1, title: 'مشروع تجريبي', status: 'active'}
    ]
  }
}
```

---

## 📞 الدعم

### الوثائق الكاملة:
- [ALL-PHASES-SUMMARY.md](ALL-PHASES-SUMMARY.md) - ملخص شامل
- [PHASE-1-SYSTEM-PROMPTS.md](PHASE-1-SYSTEM-PROMPTS.md) - System Prompts
- [PHASE-2-FUNCTION-CALLING.md](PHASE-2-FUNCTION-CALLING.md) - Function Calling
- [PHASE-3-NO-HALLUCINATION.md](PHASE-3-NO-HALLUCINATION.md) - Anti-Hallucination
- [PHASE-4-SECURITY.md](PHASE-4-SECURITY.md) - Security
- [SECURITY-TESTING-GUIDE.md](SECURITY-TESTING-GUIDE.md) - Testing
- [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) - Deployment

### للمساعدة:
1. تحقق من الـ Logs: `console.log` في Terminal
2. راجع الـ Errors: `npm run build` للتحقق من TypeScript
3. استخدم الـ Testing Guide للتأكد من سلامة الميزات

---

## ✅ Checklist البدء السريع

- [ ] Node.js 18+ مُثبت
- [ ] `npm install` نجح
- [ ] `.env.local` موجود ومضبوط
- [ ] `OPENAI_API_KEY` صحيح
- [ ] `SITE_API_TOKEN` صحيح (optional)
- [ ] `npm run dev` يعمل
- [ ] `http://localhost:3000` يفتح
- [ ] Chat Endpoint يستجيب

---

**استمتع بالتطوير! 🚀✨**

إذا واجهت أي مشاكل، راجع [PRODUCTION-DEPLOYMENT.md](PRODUCTION-DEPLOYMENT.md) → Troubleshooting.
