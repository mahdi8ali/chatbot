# دليل التشغيل المحلي السريع - بدون Docker

## نظرة عامة

هذا المشروع مبني على [Chatbot UI](https://github.com/mckaywrigley/chatbot-ui) v2.0 وتم تخصيصه ليعمل كبوت زوّار للموقع يعتمد على REST API كمصدر وحيد للمعلومات.

**وظيفة OpenAI**: فهم الأسئلة، اختيار الـ endpoint المناسب، وصياغة الردود بشكل احترافي.

---

## المتطلبات الأساسية

✅ **فقط ما تحتاجه:**

- **Node.js** v18 أو أحدث ✅ (لديك v22.11.0)
- **npm** ✅ (لديك v10.9.0)
- **محرر نصوص** (VS Code مثلاً)
- **حساب Supabase مجاني** (بدون Docker!)

❌ **لا تحتاج:**
- Docker Desktop
- Supabase CLI (اختياري فقط للنشر)
- أي أدوات معقدة

---

## 🚀 خطوات التشغيل المحلي (بدون Docker)

### الخطوة 1️⃣: تثبيت المكتبات

افتح PowerShell في مجلد المشروع:

```powershell
npm install
```

⏱️ **المدة**: 2-3 دقائق

---

### الخطوة 2️⃣: إنشاء قاعدة بيانات Supabase (مجانية)

**أ) افتح**: https://supabase.com/dashboard

**ب) اضغط**: "New Project" 

**ج) املأ البيانات**:
- Organization: (اختر أو أنشئ جديدة)
- Name: `chatbot-dev` (أي اسم)
- Database Password: (احفظها!) 🔒
- Region: اختر الأقرب لك

**د) اضغط**: "Create new project"

⏱️ **انتظر**: ~1-2 دقيقة للإعداد

---

### الخطوة 3️⃣: الحصول على مفاتيح Supabase

من لوحة التحكم:

**أ) اذهب إلى**: `Settings` (⚙️) → `API`

**ب) انسخ هذه القيم**:

```
📋 Project URL:    https://xxxxx.supabase.co
📋 anon public:    eyJhbGc...
📋 service_role:   eyJhbGc... (اضغط "Reveal" أولاً)
```

**احتفظ بهم للخطوة التالية!** 📝

---

### الخطوة 4️⃣: رفع قاعدة البيانات

**أ) احصل على Project Reference ID**:

من لوحة التحكم → `Settings` → `General`:
```
Reference ID: xxxxx
```

**ب) في PowerShell، نفذ**:

```powershell
# تثبيت Supabase CLI (مرة واحدة)
npm install -g supabase

# تسجيل الدخول
supabase login

# ربط المشروع (استبدل xxxxx بـ Reference ID الخاص بك)
supabase link --project-ref xxxxx

# رفع قاعدة البيانات
supabase db push
```

✅ **ينبغي أن تظهر**: "Finished supabase db push"

---

### الخطوة 5️⃣: تكوين ملف .env.local

### الخطوة 5️⃣: تكوين ملف .env.local

ملف `.env.local` **موجود بالفعل** في المشروع!

**افتحه وعدّل هذه القيم فقط**:

```env
# 1. Supabase (من الخطوة 3)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# 2. OpenAI (مفتاح API الخاص بك)
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o

# 3. REST API للموقع (سنضيفه لاحقاً)
SITE_API_BASE_URL=https://api.yoursite.com
SITE_API_TOKEN=your-token-if-needed
```

**⚠️ مهم**: احذف كل مفاتيح API الأخرى (Anthropic, Google, إلخ) إذا لن تستخدمها.

---

### الخطوة 6️⃣: تشغيل المشروع! 🎉

```powershell
npm run dev
```

**يجب أن ترى**:
```
✓ Ready in 3.2s
○ Local:   http://localhost:3000
```

**افتح المتصفح**: http://localhost:3000

---

### الخطوة 7️⃣: إنشاء حساب تجريبي

1. اذهب إلى: http://localhost:3000
2. اضغط "Start Chatting"
3. اضغط "Sign Up"
4. أدخل:
   - Email: `test@test.com`
   - Password: `test123456`
5. سجّل الدخول!

✅ **الآن المشروع يعمل محلياً!**

---

## 🛠️ الأوامر المتاحة

| الأمر | الوصف | متى تستخدمه |
|------|--------|-------------|
| `npm run dev` | تشغيل التطوير | دائماً للاختبار المحلي |
| `npm run build` | بناء للإنتاج | قبل النشر |
| `npm start` | تشغيل الإنتاج | بعد البناء |
| `npm run lint` | فحص الأخطاء | قبل الـ commit |
| `npm test` | تشغيل الاختبارات | للتأكد من الجودة |

---

## 🔒 الأمان والخصوصية

### ✅ جميع المفاتيح محمية (Server-side فقط)

المفاتيح التالية **لا تُرسل للمتصفح أبداً**:

```env
✅ OPENAI_API_KEY          → Server فقط
✅ OPENAI_MODEL            → Server فقط  
✅ SITE_API_BASE_URL       → Server فقط
✅ SITE_API_TOKEN          → Server فقط
✅ SUPABASE_SERVICE_ROLE_KEY → Server فقط
```

المفاتيح الوحيدة المرئية للمتصفح:
```env
🌐 NEXT_PUBLIC_SUPABASE_URL      → آمنة (URL عامة)
🌐 NEXT_PUBLIC_SUPABASE_ANON_KEY → آمنة (محمية بـ RLS)
```

---

## 🔧 استكشاف الأخطاء الشائعة

### ❌ "User not found" / "Profile not found"

**السبب**: لم تسجل حساب بعد.

**الحل**:
1. اذهب إلى http://localhost:3000/login
2. اضغط "Sign Up"
3. سجل بأي بريد إلكتروني

---

### ❌ "Invalid API Key" / "OpenAI API Key not found"

**السبب**: المفتاح خاطئ أو غير موجود.

**الحل**:
```powershell
# 1. افتح .env.local
# 2. تأكد أن السطر يبدأ بـ sk-proj- أو sk-
OPENAI_API_KEY=sk-proj-xxxxx

# 3. أعد تشغيل
npm run dev
```

---

### ❌ "Connection refused" / "Failed to fetch"

**السبب**: Supabase غير متاح أو مفاتيح خاطئة.

**الحل**:
1. تحقق من الاتصال بالإنترنت
2. راجع مفاتيح Supabase في `.env.local`
3. تأكد أن المشروع في Supabase لم يُوقف

---

### ❌ "Port 3000 already in use"

**الحل**:
```powershell
# إيقاف العملية القديمة
Get-Process -Name node | Stop-Process -Force

# أو استخدم port مختلف
npm run dev -- -p 3001
```

---

### ❌ الصفحة بيضاء / أخطاء في Console

**الحل**:
```powershell
# امسح cache وأعد البناء
Remove-Item -Recurse -Force .next
npm run dev
```

---

## 🧪 اختبار التشغيل

### اختبار 1: الدخول
```
✅ http://localhost:3000 يفتح بدون أخطاء
✅ تستطيع التسجيل/تسجيل الدخول
✅ تظهر واجهة الدردشة
```

### اختبار 2: الدردشة الأساسية
```
✅ تستطيع كتابة رسالة
✅ تستطيع إرسالها
✅ يرد البوت بشكل صحيح
```

### اختبار 3: المفاتيح محمية
```
✅ افتح Developer Tools → Network
✅ أرسل رسالة
✅ تأكد أن OPENAI_API_KEY لا تظهر نهائياً
```

**إذا نجحت جميع الاختبارات → المشروع جاهز للتطوير! 🎉**

---

## 📝 الخطوات القادمة

الآن المشروع يعمل! 

**المراحل التالية**:

✅ **المرحلة 0**: تشغيل محلي ← **مكتمل!**

⏭️ **المرحلة 1**: تكامل REST API
   - إنشاء service layer للتواصل مع الموقع
   - تطوير Function Calling للـ endpoints
   - اختبار الاستجابات

⏭️ **المرحلة 2**: تخصيص الواجهة
   - تبسيط الواجهة للزوار
   - إزالة المميزات غير المطلوبة
   - تحسين UX

⏭️ **المرحلة 3**: النشر
   - Vercel/Netlify deployment
   - Production optimizations

---

## 📂 بنية المشروع (مبسطة)

```
chatbot/
├── app/
│   ├── api/              # 🔒 API Routes (Server-side)
│   │   ├── chat/         # معالجة الدردشة
│   │   └── ...
│   └── [locale]/         # الصفحات (UI)
│
├── components/           # مكونات React
│   ├── chat/            # واجهة الدردشة
│   └── ui/              # مكونات أساسية
│
├── lib/
│   ├── server/          # 🔒 وظائف Server-side فقط
│   │   └── site-api-config.ts  # ⭐ إعدادات REST API
│   └── models/          # تعريفات نماذج AI
│
├── types/               # TypeScript definitions
├── db/                  # دوال قاعدة البيانات
├── supabase/            # Schema وإعدادات DB
│
└── .env.local          # 🔒 المفاتيح السرية (لا تُرفع!)
```

**الملفات المهمة للتعديل**:
- `lib/server/site-api-config.ts` ← إعدادات REST API
- `app/api/chat/` ← معالجة الرسائل
- `.env.local` ← المفاتيح

---

## ❓ الأسئلة الشائعة

### س: هل أحتاج Docker؟
**ج**: لا! نستخدم Supabase Cloud (مجاني).

### س: كم يكلف Supabase؟
**ج**: مجاني تماماً (حتى 500MB + 1GB storage).

### س: ماذا لو أردت قاعدة بيانات محلية؟
**ج**: يمكنك استخدام `supabase start` (يحتاج Docker).

### س: كيف أحصل على OpenAI API Key؟
**ج**: https://platform.openai.com/api-keys

### س: هل المفاتيح آمنة؟
**ج**: نعم! كل المفاتيح الحساسة Server-side فقط.

---

## 🆘 الدعم

إذا واجهت مشكلة:

1. ✅ تحقق من `.env.local`
2. ✅ أعد تشغيل `npm run dev`
3. ✅ امسح `.next` وحاول مجدداً
4. ✅ راجع القسم "استكشاف الأخطاء"

---

## 📚 الموارد المفيدة

- [Next.js Docs](https://nextjs.org/docs)
- [Supabase Docs](https://supabase.com/docs)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Chatbot UI Original](https://github.com/mckaywrigley/chatbot-ui)

---

**آخر تحديث**: 15 فبراير 2026  
**الإصدار**: 2.0.0-visitor-bot  
**الحالة**: ✅ جاهز للتطوير المحلي (بدون Docker)
