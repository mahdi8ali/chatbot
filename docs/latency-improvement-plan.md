# خطة تحسين سرعة الاستجابة

**الهدف**: تقليل زمن الانتظار من 8-17 ثانية إلى 3-6 ثوانٍ  
**المقترح**: Streaming Function Calling (دمج الاتصالين في اتصال واحد)

---

## المشكلة الحالية — توضيح مرئي

```
المستخدم يكتب
     │
     ▼
┌────────────────────────────────────────────┐
│  اتصال 1 — اختيار الأداة (blocking)       │  2-6 ثانية
│  OpenAI يقرأ السؤال ويختار tool           │
│  مثل: "استدعِ search_projects_db"         │
└────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────┐
│  تنفيذ قاعدة البيانات                      │  100ms
└────────────────────────────────────────────┘
     │
     ▼
┌────────────────────────────────────────────┐
│  اتصال 2 — كتابة الرد (streaming)         │  3-8 ثانية
│  OpenAI يقرأ النتائج ويكتب الجواب         │
└────────────────────────────────────────────┘
     │
     ▼
المستخدم يرى الرد — بعد 5-14 ثانية صمت تام
```

---

## الحل المقترح — Streaming Function Calling

```
المستخدم يكتب
     │
     ▼
┌─────────────────────────────────────────────────────────────┐
│  اتصال واحد streaming                                       │
│                                                             │
│  [300-800ms] OpenAI يقرر: "أحتاج search_projects_db"       │
│       ↓ في نفس اللحظة                                       │
│  [100ms] قاعدة البيانات تُنفّذ                              │
│       ↓                                                     │
│  [stream مستمر] OpenAI يكمل الرد فوراً                     │
└─────────────────────────────────────────────────────────────┘
     │
     ▼
المستخدم يرى أول كلمة بعد 1.5-3 ثانية
```

**الفرق**: نحذف رحلة الشبكة الكاملة لـ OpenAI الخاصة بالاتصال الأول.

---

## الملفات التي ستتغير

### 1. `lib/server/function-calling-handler.ts` — تغيير جوهري

**الدالة الحالية**: `resolveToolCalls()`  
- تعمل بشكل **blocking** (تنتظر الرد الكامل)  
- تُرجع رسائل كاملة لـ `route.ts` ليُرسلها في اتصال ثانٍ

**الدالة الجديدة**: `streamWithToolCalls()`  
- تفتح stream من OpenAI  
- تقرأ chunks — إذا وجدت tool_call chunk تُنفّذ الأداة **فوراً**  
- ترسل النتائج لـ OpenAI ليكمل الـ stream  
- ترسل كل chunk نصي مباشرة للمستخدم عبر controller

```typescript
// الكود الجديد تقريباً (مبسّط)
export async function* streamWithToolCalls(openai, model, messages, tools) {
  const stream = await openai.chat.completions.create({
    model, messages, tools,
    tool_choice: "auto",
    stream: true,
    max_tokens: 600
  })

  let toolCallBuffer = {}  // يجمّع chunks الـ tool call

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta

    // نص عادي → أرسله للمستخدم فوراً
    if (delta?.content) {
      yield delta.content
    }

    // بداية tool call → ابدأ التجميع
    if (delta?.tool_calls) {
      // ... جمع اسم الأداة وarguments
    }

    // انتهاء الـ chunk → نفّذ الأداة وأكمل
    if (chunk.choices[0]?.finish_reason === "tool_calls") {
      const toolResult = await executeToolByName(toolCallBuffer)
      // أرسل النتيجة لـ OpenAI وابدأ stream جديد للإكمال
      yield* continueWithToolResult(openai, model, messages, toolResult)
    }
  }
}
```

### 2. `app/api/chat/site/route.ts` — تغيير بسيط

**الحالي**: يستدعي `resolveToolCalls()` ثم يفتح stream منفصل  
**الجديد**: يستدعي `streamWithToolCalls()` ويضخّ chunks مباشرة في الـ ReadableStream

```typescript
// الحالي (مبسّط):
const toolResult = await resolveToolCalls(...)      // blocking
const finalStream = await openai.create({ stream: true, ... })  // ثانٍ

// الجديد (مبسّط):
const readable = new ReadableStream({
  async start(controller) {
    for await (const chunk of streamWithToolCalls(...)) {
      controller.enqueue(enc.encode(chunk))
    }
    controller.close()
  }
})
```

---

## ماذا لن يتغير؟

| العنصر | الحالة |
|--------|--------|
| منطق البحث في DB | بدون تغيير |
| system prompt | بدون تغيير |
| rate limiting | بدون تغيير |
| security headers | بدون تغيير |
| FAQ cache | بدون تغيير |
| `__VALID_IDS__` (التحقق من الروابط) | يحتاج تكيّف بسيط |
| الـ Frontend / ChatWidget | **بدون أي تغيير** |

---

## الفرق المتوقع في الأداء

| السيناريو | الآن | بعد التغيير |
|-----------|------|-------------|
| سؤال بسيط (بدون أدوات) | 3-6s | 1.5-3s |
| سؤال يحتاج أداة واحدة | 6-12s | 2-5s |
| سؤال يحتاج أداتين | 10-17s | 3-7s |

> الأرقام تقديرية وتعتمد على ضغط OpenAI في تلك اللحظة.

---

## المخاطر والتعقيدات

### 1. تجميع الـ tool call arguments (متوسط التعقيد)
OpenAI يُرسل الـ arguments مجزأة في chunks متعددة. يجب تجميعها قبل التنفيذ:
```
chunk 1: { "name": "search_proj"
chunk 2: ects_db", "arguments": "{\"quer
chunk 3: y\": \"طب بشري\"}"
```
هذا يحتاج buffer ومنطق تجميع — مكتوب جيداً في مكتبات OpenAI ولكن يجب الحذر.

### 2. أدوات متوازية (parallel_tool_calls)
حالياً النظام يدعم `parallel_tool_calls: true`. في الـ streaming، يجب تنفيذها كلها معاً قبل الإكمال — ممكن لكن يزيد التعقيد قليلاً.

### 3. استخراج `__VALID_IDS__`
حالياً يُستخرج بعد اكتمال كل الـ tool calls. في streaming يجب الاحتفاظ بـ IDs أثناء التنفيذ وإلحاقها في نهاية الـ stream — نفس المنطق لكن موضع مختلف.

### 4. إذا فشل tool call أثناء الـ stream
الحالي: الخطأ يُعالج قبل بدء الـ stream، سهل.  
الجديد: الخطأ يحدث وسط الـ stream — يجب إغلاق الـ stream بشكل نظيف وإرسال رسالة خطأ.

---

## خيارات بديلة أبسط (إذا قررت لاحقاً)

### الخيار أ — تحسين UX بدون تغيير backend (أسهل)
إضافة رسالة حالة فورية في الـ stream:
```
المستخدم يكتب → يظهر فوراً: "⏳ جاري البحث..."
(بعد 8 ثوانٍ) → يظهر الرد الفعلي
```
المستخدم يشعر بالاستجابة فوراً حتى لو الوقت الفعلي لم يتغير.  
**التغيير**: سطر واحد في `route.ts` يرسل رمز Unicode فارغ كـ ping فوري.

### الخيار ب — تخزين الأسئلة المتكررة (cache)
إذا سأل 100 شخص "وين أروح أدرس طب؟" → الإجابة الأولى تُخزّن 30 دقيقة.  
**التغيير**: إضافة `Map` بسيط في الذاكرة.  
**القيد**: لا يفيد للأسئلة الفريدة.

---

## توصيتي

```
إذا الأولوية هي سرعة التنفيذ:
  → ابدأ بـ الخيار أ (UX ping) ← يوم واحد، مخاطرة صفر

إذا الأولوية هي تحسين حقيقي:
  → الـ Streaming Function Calling ← 2-3 أيام عمل، نتيجة ملموسة

إذا الأولوية هي الحصول على كلا الأمرين:
  → ابدأ بـ أ ثم نفّذ الـ Streaming
```

---

## تقدير وقت التنفيذ

| المهمة | الوقت المتوقع |
|--------|---------------|
| إعادة كتابة `resolveToolCalls` → `streamWithToolCalls` | يوم |
| تكيّف `route.ts` | ساعة |
| معالجة `__VALID_IDS__` في الـ stream | ساعة |
| اختبار كل السيناريوهات | يوم |
| **المجموع** | **2-3 أيام** |
