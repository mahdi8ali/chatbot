# 🚀 دليل التضمين السريع - Widget مساعد المشاريع

## الكود الكامل للتضمين

```html
<!-- في نهاية ملف blade الخاص بك، قبل </body> -->

<!-- AlKafeel Widget - ملف واحد فقط! -->
<script src="https://YOUR-VERCEL-DOMAIN/api/widget"></script>

<script>
  // تهيئة الودجت
  AlkafeelWidget.init({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    title: 'مساعدك في المشاريع',
    subtitle: 'اسأل عن مشاريع العتبة العباسية',
    position: 'left'  // يمكن تغييره إلى 'right'
  });
</script>
```

---

## 📍 أين أضع الكود؟

### في Laravel (Blade):

**ملف:** `resources/views/layouts/app.blade.php`

```blade
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>@yield('title')</title>
    <!-- باقي head content -->
</head>
<body>
    <!-- محتوى الصفحة -->
    @yield('content')
    
    <!-- ✨ أضف الكود هنا ✨ -->
    <script src="https://YOUR-VERCEL-DOMAIN/api/widget"></script>
    <script>
        new AlkafeelChatWidget({
            apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
            title: 'مساعدك في المشاريع',
            position: 'left'
        });
    </script>
</body>
</html>
```

---

## ⚙️ التخصيص

### تغيير موضع الزر (يمين أو يسار)

```javascript
new AlkafeelChatWidget({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    position: 'right'  // أو 'left'
});
```

### تخصيص النصوص

```javascript
new AlkafeelChatWidget({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    title: 'مساعد العتبة الذكي',
    subtitle: 'كيف يمكنني خدمتك؟'
});
```

### تخصيص الألوان والحجم

```javascript
new AlkafeelChatWidget({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    buttonSize: '70px',
    buttonText: '🤖',
    buttonColor: '#10b981'
});
```

---

## 🔗 الحصول على الدومين

بعد نشر المشروع على Vercel:

1. اذهب إلى Vercel Dashboard
2. اختر المشروع
3. انسخ الدومين (مثل: `chatbot-alkafeel.vercel.app`)
4. استبدل `YOUR-VERCEL-DOMAIN` في الكود أعلاه

---

## ✅ التحقق من التثبيت

1. افتح موقعك
2. يجب أن تشاهد زراً عائماً (💬) في الجانب الأيسر أو الأيمن
3. اضغط على الزر
4. يجب أن تفتح نافذة المحادثة
5. جرب إرسال سؤال

---

## 🐛 حل المشاكل الشائعة

### الزر لا يظهر؟

**السبب المحتمل:** رابط السكريبت خاطئ

**الحل:**
1. تأكد من استبدال `YOUR-VERCEL-DOMAIN` بالدومين الفعلي
2. افتح Console في المتصفح (F12)
3. تحقق من عدم وجود أخطاء 404

### الزر يظهر لكن لا يفتح؟

**السبب المحتمل:** خطأ في JavaScript

**الحل:**
1. افتح Console (F12)
2. ابحث عن أخطاء باللون الأحمر
3. تأكد من أن السكريبت يتم تحميله بالكامل

### الودجت يفتح لكن لا يرد؟

**السبب المحتمل:** مشكلة في API endpoint

**الحل:**
1. تحقق من صحة `apiEndpoint`
2. افتح Network tab في المتصفح
3. تحقق من أن الطلب يصل إلى `/api/chat/site`
4. تأكد من عدم وجود خطأ 403 أو 500

---

## 📞 الدعم

إذا واجهت أي مشكلة:
1. تحقق من [WIDGET_INTEGRATION.md](WIDGET_INTEGRATION.md) للدليل الكامل
2. تواصل مع فريق التطوير

---

## 🎉 تم!

الودجت الآن يعمل على موقعك! 🚀
