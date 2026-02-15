# مساعد مشاريع الكفيل 🕌

مساعد ذكي للاستعلام عن مشاريع العتبة العباسية المقدسة، مبني على **Next.js** و **OpenAI GPT-4o** مع Function Calling.

## المميزات

- 🔍 بحث عميق في أكثر من 358 مشروع
- 🗂️ تصفية حسب 25 قسم (طبية، تعليمية، إنشائية، ثقافية...)
- 💬 محادثة تتابعية تحفظ السياق
- 📊 إحصائيات المشاريع
- 🔒 Function Calling آمن مع Whitelist

## التقنيات

- **Next.js 14** - إطار العمل
- **OpenAI GPT-4o** - الذكاء الاصطناعي مع Function Calling
- **TypeScript** - لغة البرمجة
- **Tailwind CSS** - التنسيق

## التشغيل

```bash
# تثبيت الحزم
npm install

# إعداد المتغيرات
cp .env.local.example .env.local
# أضف مفتاح OpenAI في .env.local

# تشغيل السيرفر
npm run dev
```

ثم افتح `test-api.html` في المتصفح.

## متغيرات البيئة

| المتغير | الوصف |
|---------|-------|
| `OPENAI_API_KEY` | مفتاح OpenAI API |
| `OPENAI_MODEL` | النموذج (افتراضي: gpt-4o) |
| `SITE_API_BASE_URL` | رابط API المشاريع |

## هيكل المشروع

```
app/api/chat/site/     → API endpoint الرئيسي
lib/server/            → خدمات البحث والأدوات
  ├── site-api-service.ts      → البحث العميق والتصفية
  ├── site-tools-definitions.ts → تعريف أدوات Function Calling
  ├── function-calling-handler.ts → معالج الأدوات
  ├── system-prompts.ts        → تعليمات GPT
  └── data-sanitizer.ts        → تنظيف البيانات
test-api.html          → واجهة الشات
public/logo.png        → شعار البوت
```
