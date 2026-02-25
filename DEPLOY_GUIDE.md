# 🚀 دليل النشر السريع - Vercel

## الخطوات (5 دقائق):

### 1️⃣ **Commit & Push:**
```bash
git add .
git commit -m "Complete AlKafeel Widget - Ready for production"
git push origin main
```

### 2️⃣ **النشر على Vercel:**

#### الطريقة الأولى - من Dashboard:
1. افتح [vercel.com/new](https://vercel.com/new)
2. اضغط "Import Git Repository"
3. اختر المشروع من GitHub
4. اضغط "Deploy"
5. انتظر 2-3 دقائق ✅

#### الطريقة الثانية - من CLI:
```bash
# إذا لم يكن مثبت
npm i -g vercel

# Deploy
vercel

# Production deploy
vercel --prod
```

### 3️⃣ **احصل على الدومين:**
بعد النشر، ستحصل على رابط مثل:
```
https://alkafeel-chatbot-widget.vercel.app
```

### 4️⃣ **اختبر الودجت:**
```bash
# اختبر API Route
curl https://YOUR-DOMAIN.vercel.app/api/widget

# اختبر Static File
curl https://YOUR-DOMAIN.vercel.app/widget.js
```

### 5️⃣ **استخدم في Laravel:**
```blade
{{-- في layout.blade.php قبل </body> --}}
<script src="https://YOUR-DOMAIN.vercel.app/api/widget"></script>
<script>
  AlkafeelWidget.init({
    apiEndpoint: 'https://YOUR-DOMAIN.vercel.app/api/chat/site',
    title: 'مساعدك في المشاريع',
    position: 'left'
  });
</script>
```

---

## 📋 Environment Variables

إذا لم تكن موجودة، أضفها في Vercel Dashboard:

**Settings → Environment Variables:**

```
OPENAI_API_KEY=sk-...
SITE_API_BASE_URL=https://projects.alkafeel.net/api
SITE_API_TOKEN=...
SITE_DOMAIN=https://projects.alkafeel.net
```

ثم أعد Deploy:
```bash
vercel --prod
```

---

## ✅ التحقق من النجاح

### اختبار 1: Widget Script
افتح في المتصفح:
```
https://YOUR-DOMAIN.vercel.app/api/widget
```
**المتوقع:** يظهر كود JavaScript

### اختبار 2: Test Page
افتح:
```
https://YOUR-DOMAIN.vercel.app/test-widget.html
```
**المتوقع:** صفحة مع زر عائم 💬

### اختبار 3: Example Page
افتح:
```
https://YOUR-DOMAIN.vercel.app/example-laravel.html
```
**المتوقع:** صفحة مثال مع الودجت يعمل

---

## 🌐 Custom Domain (اختياري)

### إذا كان لديك دومين مثل `chatbot.alkafeel.net`:

1. **في Vercel:**
   - Settings → Domains
   - Add Domain: `chatbot.alkafeel.net`

2. **في DNS Provider:**
   ```
   Type: CNAME
   Name: chatbot
   Value: cname.vercel-dns.com
   TTL: 3600
   ```

3. **انتظر 5-10 دقائق للـ DNS propagation**

4. **استخدم الدومين الجديد:**
   ```html
   <script src="https://chatbot.alkafeel.net/api/widget"></script>
   ```

---

## 🔍 Troubleshooting

### المشكلة: Build Failed
**الحل:**
```bash
# اختبر محلياً أولاً
npm run build

# إذا نجح، push مرة أخرى
git push origin main
```

### المشكلة: Environment Variables
**الحل:**
- تأكد من إضافتها في Vercel Dashboard
- أعد Deploy بعد الإضافة

### المشكلة: CORS Error
**الحل:**
- استخدم `/api/widget` بدلاً من `/widget.js`
- تحقق من `vercel.json` headers

---

## 📊 بعد النشر

### الرابط النهائي للتسليم:

**للـ Widget:**
```
https://YOUR-DOMAIN.vercel.app/api/widget
```

**للـ API:**
```
https://YOUR-DOMAIN.vercel.app/api/chat/site
```

**للاختبار:**
```
https://YOUR-DOMAIN.vercel.app/test-widget.html
```

---

## 🎉 تم!

الآن لديك:
- ✅ Widget منشور على Vercel
- ✅ CDN Edge Network عالمي
- ✅ HTTPS تلقائي
- ✅ Automatic Deployments
- ✅ رابط ثابت جاهز للتسليم

**استخدمه في أي موقع Laravel أو HTML! 🚀**
