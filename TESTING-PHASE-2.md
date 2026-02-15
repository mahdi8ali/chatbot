# اختبار المرحلة 2 - Function Calling

## 🎯 الهدف
التأكد من أن البوت يستخدم Function Calling بشكل صحيح لاستدعاء REST API تلقائياً بناءً على سؤال المستخدم.

---

## 🚀 التحضير للاختبار

### 1. تشغيل السيرفر المحلي
```bash
cd c:\Users\mm\Documents\GitHub\chatbot
npm run dev
```

السيرفر سيعمل على: **http://localhost:3000**

### 2. أدوات الاختبار

#### أ) **cURL** (من PowerShell أو CMD):
```powershell
# للتحقق من أن cURL موجود:
curl --version
```

#### ب) **Postman** (اختياري):
- URL: `http://localhost:3000/api/chat/site`
- Method: `POST`
- Headers: `Content-Type: application/json`
- Body: _(انظر الأمثلة أدناه)_

#### ج) **من متصفح** (JavaScript Console):
```javascript
fetch('http://localhost:3000/api/chat/site', {
  method: 'POST',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({
    messages: [{role: 'user', content: 'ابحث عن مشاريع التعليم'}],
    use_tools: true
  })
})
.then(r => r.json())
.then(console.log)
```

---

## 🧪 حالات الاختبار

### ✅ **Test 1: البحث عن مشاريع** - `site_search`

#### السؤال:
```
"ابحث عن مشاريع التعليم"
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"ابحث عن مشاريع التعليم\"}], \"use_tools\": true}"
```

#### النتيجة المتوقعة:
```json
{
  "message": "بناءً على بيانات النظام، وجدت المشاريع التالية المتعلقة بالتعليم:\n\n• مشروع تطوير التعليم (قيد التنفيذ)\n...",
  "iterations": 2
}
```

#### ماذا يحدث خلف الكواليس:
1. OpenAI يفهم أن السؤال يحتاج `site_search`
2. يستدعي: `site_search({query: "التعليم"})`
3. الـ Handler يتحقق من Whitelist ✅
4. Service Layer ينفذ البحث (Mock Data في Development)
5. OpenAI يصيغ الإجابة بالعربية

---

### ✅ **Test 2: الحصول على تفاصيل مشروع** - `site_get_project`

#### السؤال:
```
"أعطني تفاصيل المشروع رقم 5"
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"أعطني تفاصيل المشروع رقم 5\"}], \"use_tools\": true}"
```

#### النتيجة المتوقعة:
```json
{
  "message": "بناءً على بيانات النظام، إليك تفاصيل المشروع رقم 5:\n\n📌 العنوان: مشروع توسعة المكتبة\n📂 الفئة: ثقافة\n...",
  "iterations": 2
}
```

#### Tool Call المتوقع:
```json
{
  "name": "site_get_project",
  "arguments": "{\"id\": 5}"
}
```

---

### ✅ **Test 3: قائمة الفئات** - `site_list_categories`

#### السؤال:
```
"ما هي الفئات المتاحة؟"
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"ما هي الفئات المتاحة؟\"}], \"use_tools\": true}"
```

#### النتيجة المتوقعة:
```json
{
  "message": "الفئات المتاحة في النظام هي:\n\n1. تعليم (12 مشروع)\n2. صحة (8 مشاريع)\n3. ثقافة (5 مشاريع)\n...",
  "iterations": 2
}
```

#### Tool Call المتوقع:
```json
{
  "name": "site_list_categories",
  "arguments": "{\"include_counts\": true}"
}
```

---

### ✅ **Test 4: آخر المشاريع** - `site_get_latest`

#### السؤال:
```
"أعطني آخر 5 مشاريع"
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"أعطني آخر 5 مشاريع\"}], \"use_tools\": true}"
```

#### النتيجة المتوقعة:
```json
{
  "message": "آخر 5 مشاريع مُضافة في النظام:\n\n1. مشروع تطوير البنية التحتية (اليوم)\n2. مشروع دعم الأسر (3 أيام مضت)\n...",
  "iterations": 2
}
```

#### Tool Call المتوقع:
```json
{
  "name": "site_get_latest",
  "arguments": "{\"limit\": 5}"
}
```

---

### ✅ **Test 5: الأسئلة الشائعة** - `site_faq`

#### السؤال:
```
"كيف أسجل مشروع جديد؟"
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"كيف أسجل مشروع جديد؟\"}], \"use_tools\": true}"
```

#### النتيجة المتوقعة:
```json
{
  "message": "لتسجيل مشروع جديد، اتبع الخطوات التالية:\n\n1. اذهب لصفحة \"مشاريع جديدة\"\n2. املأ النموذج...\n...",
  "iterations": 2
}
```

#### Tool Call المتوقع:
```json
{
  "name": "site_faq",
  "arguments": "{\"query\": \"تسجيل مشروع جديد\"}"
}
```

---

## 🔀 اختبارات متقدمة

### ✅ **Test 6: استخدام أداتين متتاليتين**

#### السؤال:
```
"ابحث عن مشاريع الصحة وأعطني تفاصيل الأول"
```

#### ماذا يحدث:
1. OpenAI يستدعي `site_search({query: "الصحة"})`
2. يحصل على نتائج: `[{id: 3, title: "..."}, ...]`
3. OpenAI يستدعي `site_get_project({id: 3})`
4. يصيغ الإجابة النهائية

#### النتيجة المتوقعة:
```json
{
  "message": "وجدت عدة مشاريع في مجال الصحة. تفاصيل المشروع الأول:\n\n📌 العنوان: مشروع تطوير المستشفيات\n...",
  "iterations": 3
}
```

---

### ✅ **Test 7: سؤال خارج النطاق** (لا يستدعي أدوات)

#### السؤال:
```
"ما هي عاصمة العراق؟"
```

#### النتيجة المتوقعة:
```json
{
  "message": "أنا متخصص في الإجابة عن أسئلة متعلقة بموقع projects.alkafeel.net والمشاريع المسجلة فيه فقط.\n\nللإجابة على سؤالك، يُفضل التواصل مع الجهة المختصة.\n\nكيف يمكنني مساعدتك بخصوص المشاريع؟",
  "iterations": 1
}
```

#### Note:
لا يستدعي أي أداة لأن السؤال خارج نطاق النظام.

---

### ✅ **Test 8: سؤال بدون نتائج**

#### السؤال:
```
"ابحث عن مشاريع الفضاء"
```

#### النتيجة المتوقعة:
```json
{
  "message": "عذراً، لا توجد مشاريع متاحة حالياً في النظام عن \"الفضاء\".\n\nيمكنك:\n• البحث عن مشاريع بكلمات أخرى\n• تصفح الفئات المتاحة",
  "iterations": 2
}
```

---

### ✅ **Test 9: تعطيل Tools** (`use_tools: false`)

#### السؤال:
```
Same as Test 1 but with use_tools: false
```

#### الـ cURL Command:
```bash
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"ابحث عن مشاريع التعليم\"}], \"use_tools\": false}"
```

#### النتيجة المتوقعة:
يجب أن يستخدم **Streaming Mode** العادي بدلاً من Function Calling.

---

## 🛠️ استكشاف الأخطاء (Debugging)

### 1. البوت لا يستدعي الأدوات
**الأسباب المحتملة:**
- ❌ `use_tools: false` في الطلب
- ❌ `ALL_SITE_TOOLS` فارغ أو غير محمّل
- ❌ OpenAI API Key غير صحيح

**الحل:**
```typescript
// تحقق من أن ALL_SITE_TOOLS محمّل:
console.log('Tools:', ALL_SITE_TOOLS.length) // يجب أن يكون 5
```

---

### 2. خطأ "أداة غير مسموحة"
**السبب:**
- OpenAI طلب أداة خارج Whitelist

**الحل:**
```typescript
// تحقق من Whitelist:
console.log(ALLOWED_TOOL_NAMES) // ["site_search", ...]
```

---

### 3. Mock Data لا تظهر
**السبب:**
- `NODE_ENV` ليس `development`

**الحل:**
```bash
# في .env.local:
NODE_ENV=development
```

---

### 4. خطأ "تجاوز الحد الأقصى للتكرارات"
**السبب:**
- OpenAI استمر في استدعاء الأدوات أكثر من 5 مرات

**الحل:**
```typescript
// في function-calling-handler.ts:
const MAX_ITERATIONS = 5 // زد هذا إذا احتجت
```

---

## 📊 سجل النتائج (Test Log)

| # | الأداة | السؤال | Pass/Fail | ملاحظات |
|---|--------|---------|-----------|----------|
| 1 | `site_search` | "ابحث عن مشاريع التعليم" | ☐ | |
| 2 | `site_get_project` | "تفاصيل المشروع 5" | ☐ | |
| 3 | `site_list_categories` | "ما الفئات المتاحة؟" | ☐ | |
| 4 | `site_get_latest` | "آخر 5 مشاريع" | ☐ | |
| 5 | `site_faq` | "كيف أسجل مشروع؟" | ☐ | |
| 6 | Mixed | "ابحث وأعطني التفاصيل" | ☐ | |
| 7 | None | "ما عاصمة العراق؟" | ☐ | |
| 8 | Empty | "ابحث عن الفضاء" | ☐ | |
| 9 | Disabled | `use_tools: false` | ☐ | |

---

## 🎯 معايير النجاح

✅ **الاختبار ناجح إذا**:
1. OpenAI يختار الأداة الصحيحة تلقائياً
2. يتم التحقق من Whitelist قبل التنفيذ
3. Mock Data تُرجع بنجاح في Development
4. الإجابة منسّقة بالعربية وواضحة
5. الأسئلة خارج النطاق تُرفض بأدب

❌ **الاختبار فاشل إذا**:
1. OpenAI يستخدم معرفته العامة بدلاً من الأدوات
2. أخطاء في التنفيذ (Whitelist, Arguments, etc.)
3. الـ Iterations تصل للحد الأقصى بدون سبب
4. Mock Data لا تظهر في Development
5. البوت يُجيب على أسئلة خارج النطاق

---

## 🔗 الخطوة التالية

بعد نجاح الاختبارات:
1. ✅ انتقل لربط **REST API الحقيقي**
2. ✅ عدّل `site-api-service.ts` لاستخدام `callSiteAPI()` بدلاً من Mock
3. ✅ اختبر مع بيانات حقيقية

---

**جاهز للاختبار! 🚀**
