# 🚀 التشغيل السريع (5 دقائق)

## للمستعجلين! 

إذا كنت تريد التشغيل بأسرع طريقة ممكنة:

---

## 1️⃣ التثبيت (دقيقة واحدة)

```powershell
npm install
```

---

## 2️⃣ إعداد Supabase (دقيقتان)

### أ) اذهب إلى: https://supabase.com/dashboard

### ب) "New Project" → املأ:
- Name: `chatbot-dev`
- Password: (أي شيء)
- Region: (الأقرب لك)

### ج) انتظر دقيقة واحدة...

### د) `Settings` → `API` → انسخ:
```
Project URL:  https://xxxxx.supabase.co
anon key:     eyJhbGc...
service_role: eyJhbGc... (اضغط Reveal)
```

---

## 3️⃣ رفع قاعدة البيانات (دقيقة واحدة)

```powershell
# تثبيت CLI
npm install -g supabase

# تسجيل دخول
supabase login

# ربط (استبدل xxxxx بـ Reference ID من Settings → General)
supabase link --project-ref xxxxx

# رفع
supabase db push
```

---

## 4️⃣ تعديل .env.local (30 ثانية)

افتح `.env.local` وعدّل:

```env
# من الخطوة 2
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...

# مفتاح OpenAI الخاص بك
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o

# اتركهم فارغين الآن
SITE_API_BASE_URL=
SITE_API_TOKEN=
```

---

## 5️⃣ تشغيل! (30 ثانية)

```powershell
npm run dev
```

افتح: **http://localhost:3000**

---

## ✅ هل يعمل؟

- [ ] الصفحة تفتح بدون أخطاء
- [ ] تستطيع عمل Sign Up
- [ ] تظهر واجهة الدردشة
- [ ] تستطيع إرسال رسالة ويرد البوت

**نجح؟ مبروك! 🎉**

**فشل؟** → راجع [README-SETUP.md](./README-SETUP.md) لحل المشاكل

---

## ⏭️ الخطوة التالية؟

الآن المشروع يعمل! اقرأ [README-SETUP.md](./README-SETUP.md) لفهم التفاصيل وبدء التطوير.
