# تضمين Widget - مساعد مشاريع العتبة العباسية

## 📝 دليل التضمين السريع

### الطريقة الأولى: التضمين الأساسي

أضف هذا الكود قبل إغلاق `</body>` في صفحتك:

```html
<!-- AlKafeel Widget - ملف واحد فقط! -->
<script src="https://YOUR-VERCEL-DOMAIN/api/widget"></script>

<script>
  AlkafeelWidget.init({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    title: 'مساعدك في المشاريع',
    subtitle: 'اسأل عن مشاريع العتبة العباسية',
    position: 'left'
  });
</script>
```

### الطريقة الثانية: مع خيارات مخصصة

```html
<script src="https://YOUR-VERCEL-DOMAIN/api/widget"></script>

<script>
  AlkafeelWidget.init({
    apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
    title: 'مساعد العتبة العباسية',
    subtitle: 'كيف يمكنني مساعدتك؟',
    position: 'left',        // 'left' أو 'right'
    buttonText: '💬',        // الأيقونة على الزر
    buttonSize: '60px',      // حجم الزر
    zIndex: 999998           // ترتيب العرض
  });
</script>
```

---

## ⚙️ الخيارات المتاحة

| الخيار | النوع | الافتراضي | الوصف |
|--------|------|-----------|-------|
| `apiEndpoint` | `string` | `/api/chat/site` | رابط API للشات |
| `title` | `string` | `مساعدك في المشاريع` | عنوان الودجت |
| `subtitle` | `string` | `اسأل عن مشاريع العتبة العباسية` | نص فرعي |
| `position` | `'left' \| 'right'` | `'left'` | موضع الزر العائم |
| `buttonText` | `string` | `💬` | النص/الأيقونة على الزر |
| `buttonSize` | `string` | `60px` | حجم الزر العائم |
| `buttonColor` | `string` | `#1e40af` | لون خلفية الزر |
| `zIndex` | `number` | `999999` | ترتيب العرض (z-index) |

---

## 🎨 أمثلة التخصيص

### زر في الجانب الأيمن

```javascript
new AlkafeelChatWidget({
  apiEndpoint: 'https://YOUR-DOMAIN/api/chat/site',
  position: 'right'
});
```

### تخصيص الألوان والحجم

```javascript
new AlkafeelChatWidget({
  apiEndpoint: 'https://YOUR-DOMAIN/api/chat/site',
  buttonColor: '#10b981',
  buttonSize: '70px',
  buttonText: '🤖'
});
```

### تخصيص النصوص

```javascript
new AlkafeelChatWidget({
  apiEndpoint: 'https://YOUR-DOMAIN/api/chat/site',
  title: 'مساعد المشاريع الذكي',
  subtitle: 'اطرح أسئلتك هنا'
});
```

---

## 🔧 التكامل مع Laravel Blade

### في ملف `resources/views/layouts/app.blade.php`

```blade
<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
    <!-- Head content -->
</head>
<body>
    @yield('content')
    
    <!-- AlKafeel Chat Widget -->
    <script src="https://YOUR-VERCEL-DOMAIN/api/widget"></script>
    <script>
        new AlkafeelChatWidget({
            apiEndpoint: 'https://YOUR-VERCEL-DOMAIN/api/chat/site',
            title: 'مساعدك في المشاريع',
            subtitle: 'اسأل عن مشاريع العتبة العباسية',
            position: 'left'
        });
    </script>
</body>
</html>
```

### استخدام مع متغيرات البيئة

```blade
<script src="{{ env('WIDGET_URL', 'https://YOUR-VERCEL-DOMAIN/api/widget') }}"></script>
<script>
    new AlkafeelChatWidget({
        apiEndpoint: '{{ env('WIDGET_API_URL', 'https://YOUR-VERCEL-DOMAIN/api/chat/site') }}',
        title: 'مساعدك في المشاريع',
        position: 'left'
    });
</script>
```

ثم في `.env`:
```env
WIDGET_URL=https://your-vercel-domain.vercel.app/api/widget
WIDGET_API_URL=https://your-vercel-domain.vercel.app/api/chat/site
```

---

## 🚀 النشر على Vercel

1. **رفع الكود إلى GitHub**
```bash
git add .
git commit -m "Add widget functionality"
git push origin main
```

2. **النشر على Vercel**
   - افتح [Vercel Dashboard](https://vercel.com)
   - اربط المشروع من GitHub
   - انشر المشروع

3. **تحديث الروابط**
   - بعد النشر، احصل على الدومين (مثل: `your-project.vercel.app`)
   - استبدل `YOUR-VERCEL-DOMAIN` في الكود أعلاه بالدومين الفعلي

---

## 🌐 دومين مخصص (اختياري)

إذا أردت استخدام دومين مخصص مثل `chatbot.alkafeel.net`:

1. اذهب إلى Vercel → Project Settings → Domains
2. أضف الدومين المخصص
3. أضف DNS Records في لوحة إدارة النطاق:
   ```
   Type: CNAME
   Name: chatbot
   Value: cname.vercel-dns.com
   ```

4. استخدم الدومين المخصص في الكود:
```html
<script src="https://chatbot.alkafeel.net/api/widget"></script>
```

---

## ✅ اختبار الودجت

للاختبار محلياً، افتح:
```
http://localhost:3000/test-widget.html
```

---

## 🔒 الأمان

- الودجت محمي بـ Rate Limiting (20 طلب/دقيقة)
- Data Sanitization لجميع المدخلات
- CORS محدد للدومينات المسموح بها
- يدعم HTTPS فقط في الإنتاج

---

## 📱 التوافق

- ✅ جميع المتصفحات الحديثة
- ✅ متجاوب مع Mobile و Desktop
- ✅ دعم كامل للغة العربية (RTL)
- ✅ يعمل مع جميع أنظمة إدارة المحتوى

---

## 🐛 استكشاف الأخطاء

### الودجت لا يظهر؟
- تحقق من أن السكريبت يتم تحميله بنجاح (افتح Console في المتصفح)
- تأكد من صحة الروابط (لا توجد أخطاء 404)
- تحقق من عدم وجود تعارض مع CSS موقعك

### الودجت لا يرد على الرسائل؟
- تحقق من صحة `apiEndpoint`
- افتح Network tab وتحقق من استجابة API
- تأكد من أن المتغيرات البيئية مضبوطة على Vercel

### مشاكل في التصميم؟
- تحقق من عدم وجود `z-index` أعلى في موقعك
- جرب زيادة `zIndex` في خيارات الودجت
- تحقق من عدم تعارض CSS

---

## 📞 الدعم

لأي مشاكل أو استفسارات، تواصل مع فريق التطوير.

---

## 📄 الترخيص

هذا المشروع خاص بالعتبة العباسية المقدسة.
