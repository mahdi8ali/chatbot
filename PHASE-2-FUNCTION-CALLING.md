# المرحلة 2 - تكامل REST API عبر Function Calling

## نظرة عامة

تم في هذه المرحلة تحويل البوت إلى **نظام ذكي يتصل بـ REST API تلقائياً** باستخدام **OpenAI Function Calling**. البوت الآن:

- ✅ يفهم سؤال المستخدم ويختار الأداة المناسبة تلقائياً
- ✅ يستدعي REST API الصحيح بناءً على السياق
- ✅ يبني الإجابة من البيانات المُرجعة فقط
- ✅ يمنع استخدام أي معرفة عامة خارج النظام

---

## 🏗️ بنية الحل (Architecture)

```
User Message
     ↓
Chat Endpoint (/api/chat/site)
     ↓
[System Prompt + Message] → OpenAI API
     ↓
OpenAI → يحلل السؤال ويختار Tool
     ↓
Function Calling Handler
     ↓
[تحقق من Whitelist] → Tool Validator
     ↓
API Service Layer → executeToolByName()
     ↓
REST API Call (مع Authorization)
     ↓
← API Response Data
     ↓
Format & Return → OpenAI للصياغة النهائية
     ↓
← Final Answer to User
```

---

## 📦 الملفات المُنشأة

### 1. **`lib/server/site-tools-definitions.ts`**
📝 **الغرض**: تعريف الأدوات (Tools) الخمسة للبوت بصيغة OpenAI

```typescript
export const TOOL_SITE_SEARCH: ChatCompletionTool = {
  type: "function",
  function: {
    name: "site_search",
    description: "البحث عن مشاريع في موقع projects.alkafeel.net",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "كلمة البحث" },
        category: { type: "string", description: "الفئة (اختياري)" },
        limit: { type: "number", description: "عدد النتائج (افتراضي: 10)" }
      },
      required: ["query"]
    }
  }
}
```

#### الأدوات المتاحة:

| الأداة | الاسم | المعاملات | الاستخدام |
|-------|------|----------|-----------|
| 🔍 | `site_search` | `query`, `category?`, `limit?` | البحث عن مشاريع بكلمات مفتاحية |
| 📄 | `site_get_project` | `id` | جلب تفاصيل مشروع معين |
| 📚 | `site_list_categories` | `include_counts?` | عرض فئات المشاريع |
| ⏰ | `site_get_latest` | `limit?`, `category?` | آخر المشاريع المضافة |
| ❓ | `site_faq` | `query` | البحث في الأسئلة الشائعة |

#### 🛡️ Whitelist Security:
```typescript
export const ALLOWED_TOOL_NAMES: string[] = [
  "site_search",
  "site_get_project",
  "site_list_categories",
  "site_get_latest",
  "site_faq",
]

export function isAllowedTool(toolName: string): boolean {
  return ALLOWED_TOOL_NAMES.includes(toolName)
}
```

---

### 2. **`lib/server/site-api-service.ts`**
📝 **الغرض**: Service Layer للتعامل مع REST API بشكل آمن

#### التصميم:
```typescript
export async function executeToolByName(
  toolName: string,
  args: Record<string, any>
): Promise<string> {
  // Dispatcher يوجه إلى الدالة المناسبة حسب toolName
  switch (toolName) {
    case "site_search":
      return await siteSearch(args.query, args.category, args.limit)
    case "site_get_project":
      return await siteGetProject(args.id)
    // ...
  }
}
```

#### مثال على دالة API:
```typescript
async function siteSearch(
  query: string,
  category?: string,
  limit: number = 10
): Promise<string> {
  // في حالة Development → استخدم Mock Data
  if (process.env.NODE_ENV === 'development') {
    return JSON.stringify({
      success: true,
      results: [
        {
          id: 1,
          title: "مشروع تطوير التعليم",
          category: "تعليم",
          status: "قيد التنفيذ"
        }
      ],
      _warning: "هذه بيانات تجريبية للتطوير"
    })
  }

  // في Production → استدعاء حقيقي
  return callSiteAPI('/api/projects/search', {
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })
}
```

#### 🔐 Authorization:
```typescript
async function callSiteAPI(endpoint: string, options: RequestInit = {}) {
  const baseUrl = getSiteAPIBaseURL()
  const apiToken = getSiteAPIToken()

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiToken}`,
      ...options.headers,
    },
  })

  return response.json()
}
```

---

### 3. **`lib/server/function-calling-handler.ts`**
📝 **الغرض**: إدارة دورة Function Calling الكاملة

#### الوظائف الرئيسية:

##### أ) **`processToolCall()`** - تنفيذ أداة واحدة
```typescript
async function processToolCall(toolCall: ChatCompletionMessageToolCall) {
  const functionName = toolCall.function.name
  const functionArgs = JSON.parse(toolCall.function.arguments)

  // ✅ تحقق من Whitelist
  if (!isAllowedTool(functionName)) {
    throw new Error(`الأداة ${functionName} غير مسموحة`)
  }

  // ✅ تنفيذ الأداة
  const result = await executeToolByName(functionName, functionArgs)
  return result
}
```

##### ب) **`handleToolCalls()`** - معالجة متعددة
```typescript
async function handleToolCalls(toolCalls: ChatCompletionMessageToolCall[]) {
  const results: ChatCompletionToolMessageParam[] = []

  for (const toolCall of toolCalls) {
    try {
      const result = await processToolCall(toolCall)
      results.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: result
      })
    } catch (error) {
      results.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: `خطأ: ${error.message}`
      })
    }
  }

  return results
}
```

##### ج) **`executeFunctionCallingFlow()`** - الدورة الكاملة
```typescript
export async function executeFunctionCallingFlow(
  messages: ChatCompletionMessageParam[],
  tools: ChatCompletionTool[]
) {
  const conversationHistory = [...messages]
  let iteration = 0
  const MAX_ITERATIONS = 5

  while (iteration < MAX_ITERATIONS) {
    const completion = await openai.chat.completions.create({
      model: getOpenAIModel(),
      messages: conversationHistory,
      tools: tools,
      tool_choice: "auto"
    })

    const responseMessage = completion.choices[0]?.message

    // ✅ إذا لم يطلب OpenAI استدعاء أدوات → ارجع الإجابة
    if (!responseMessage?.tool_calls) {
      return {
        message: responseMessage.content || "",
        iterations: iteration + 1
      }
    }

    // ✅ إذا طلب أدوات → نفذها وأضفها للمحادثة
    conversationHistory.push(responseMessage)
    const toolResults = await handleToolCalls(responseMessage.tool_calls)
    conversationHistory.push(...toolResults)

    iteration++
  }

  throw new Error("تجاوز الحد الأقصى للتكرارات")
}
```

---

### 4. **`app/api/chat/site/route.ts`** - تحديث Endpoint
📝 **الغرض**: دعم Function Calling في مسار الـ Chat

#### التحديثات:

##### أ) الاستيراد:
```typescript
import { ALL_SITE_TOOLS } from "@/lib/server/site-tools-definitions"
import { executeFunctionCallingFlow } from "@/lib/server/function-calling-handler"
```

##### ب) POST Handler مُحدّث:
```typescript
export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { messages, use_tools = true } = body

    // ✅ إضافة System Prompt
    const messagesWithSystem = [
      { role: "system", content: SITE_BOT_SYSTEM_PROMPT },
      ...messages
    ]

    // ✅ إذا use_tools = true → استخدم Function Calling
    if (use_tools) {
      const result = await executeFunctionCallingFlow(
        messagesWithSystem,
        ALL_SITE_TOOLS
      )
      
      return new Response(JSON.stringify({
        message: result.message,
        iterations: result.iterations
      }), {
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // ✅ وإلا → استخدم Streaming العادي
    const stream = await OpenAIStream(/* ... */)
    return new StreamingTextResponse(stream)

  } catch (error) {
    return new Response(JSON.stringify({
      error: "حدث خطأ في معالجة طلبك"
    }), { status: 500 })
  }
}
```

---

## 🧪 كيفية الاختبار

### 1. تشغيل السيرفر المحلي
```bash
npm run dev
```

### 2. اختبار الأدوات

#### أ) اختبار `site_search`:
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "ابحث عن مشاريع التعليم"}
    ],
    "use_tools": true
  }'
```

**النتيجة المتوقعة:**
```json
{
  "message": "بناءً على بيانات النظام، وجدت المشاريع التالية في مجال التعليم:\n- مشروع تطوير التعليم (قيد التنفيذ)\n...",
  "iterations": 2
}
```

#### ب) اختبار `site_list_categories`:
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "ما هي الفئات المتاحة؟"}
    ],
    "use_tools": true
  }'
```

#### ج) اختبار `site_get_latest`:
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "أعطني آخر 5 مشاريع"}
    ],
    "use_tools": true
  }'
```

#### د) اختبار `site_faq`:
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "كيف أسجل مشروع جديد؟"}
    ],
    "use_tools": true
  }'
```

---

## 🔧 الربط بـ API الحقيقي

### خطوات الربط:

#### 1. تعديل `.env.local`:
```env
SITE_API_BASE_URL=https://api.projects.alkafeel.net
SITE_API_TOKEN=your-actual-api-token-here
```

#### 2. تحديث `site-api-service.ts`:
في كل دالة، احذف/علّق قسم Mock Data:
```typescript
async function siteSearch(query: string, category?: string, limit: number = 10) {
  // ❌ احذف هذا القسم:
  // if (process.env.NODE_ENV === 'development') {
  //   return JSON.stringify({ ... mock data })
  // }

  // ✅ استخدم هذا مباشرة:
  return callSiteAPI('/api/projects/search', {
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })
}
```

#### 3. تأكد من تطابق Endpoints:
تحقق من أن المسارات صحيحة:
```typescript
// المسارات الحالية في الكود:
'/api/projects/search'        // للبحث
'/api/projects/{id}'           // لتفاصيل مشروع
'/api/projects/categories'     // لقائمة الفئات
'/api/projects/latest'         // لآخر المشاريع
'/api/faq/search'              // للأسئلة الشائعة
```

إذا كانت API بمسارات مختلفة، عدّلها.

#### 4. اختبار Production:
```bash
NODE_ENV=production npm run dev
```

---

## 🛡️ الأمان (Security)

### 1. Whitelist Enforcement
```typescript
// في site-tools-definitions.ts
ALLOWED_TOOL_NAMES = ["site_search", "site_get_project", ...]

// في function-calling-handler.ts
if (!isAllowedTool(functionName)) {
  throw new Error("أداة غير مسموحة")
}
```

### 2. Server-Side Only
- كل استدعاءات API تحدث على **السيرفر فقط**
- `SITE_API_TOKEN` محمي ولا يُرسل للعميل
- Endpoint: `/api/chat/site` يعمل من السيرفر

### 3. Input Validation
```typescript
// OpenAI يتحقق من المعاملات تلقائياً حسب Schema
parameters: {
  type: "object",
  properties: { ... },
  required: ["query"]  // ← مطلوب
}
```

---

## 📊 المعلومات التقنية

### تدفق Function Calling:

```
1️⃣ User → "ابحث عن مشاريع التعليم"
      ↓
2️⃣ OpenAI → يفهم أن المطلوب هو site_search
      ↓
3️⃣ Tool Call:
   {
     "name": "site_search",
     "arguments": "{\"query\": \"التعليم\"}"
   }
      ↓
4️⃣ Handler → isAllowedTool("site_search") ✅
      ↓
5️⃣ Service → executeToolByName("site_search", {query: "التعليم"})
      ↓
6️⃣ API Call → POST /api/projects/search
      ↓
7️⃣ ← Response: [{id: 1, title: "...", ...}]
      ↓
8️⃣ Return to OpenAI → مع نتائج API
      ↓
9️⃣ OpenAI → يصيغ الرد بالعربي:
   "بناءً على بيانات النظام، وجدت المشاريع التالية..."
      ↓
🔟 ← Final Answer to User
```

### Iteration Limit:
- الحد الأقصى: **5 تكرارات**
- السبب: منع Infinite Loops إذا استمر OpenAI بطلب أدوات
- في حالة التجاوز: يُرجع خطأ

---

## 🧩 التكامل مع المرحلة 1

| المرحلة 1 | المرحلة 2 |
|----------|----------|
| System Prompt ثابت | ✅ نفس System Prompt + دعم Tools |
| Validators: `isQuestionInScope()` | ✅ يعمل بجانب Tools |
| Fallback Responses | ✅ مستخدم عند فشل Tools |
| `/api/chat/site` streaming | ✅ Dual-mode: Tools or Streaming |

---

## 📝 الخلاصة

### ما تم إنجازه:
- ✅ 5 أدوات محددة بدقة مع OpenAI Function Calling
- ✅ Service Layer معزول للتعامل مع REST API
- ✅ Whitelist Security على مستوى التنفيذ
- ✅ Handler ذكي لإدارة دورة Function Calling
- ✅ Endpoint مُحدّث يدعم Tools + Streaming
- ✅ Mock Data للتطوير المحلي

### البوت الآن:
- ✅ يفهم السؤال ويختار الأداة تلقائياً
- ✅ يستدعي API الصحيح
- ✅ يبني الإجابة من البيانات **فقط**
- ✅ لا يستخدم أي معرفة خارجية

### الخطوة التالية:
- 🔄 ربط API الحقيقي (استبدال Mock Data)
- 🧪 اختبار شامل مع بيانات حقيقية
- 🎨 المرحلة 3: تخصيص الواجهة للزوار

---

## 🔗 ملفات ذات صلة

- [PHASE-1-SYSTEM-PROMPTS.md](./PHASE-1-SYSTEM-PROMPTS.md) - المرحلة 1
- [README-SETUP.md](./README-SETUP.md) - إعداد البيئة المحلية
- [QUICKSTART.md](./QUICKSTART.md) - دليل البدء السريع
- [ENVIRONMENT-SETUP.md](./ENVIRONMENT-SETUP.md) - متغيرات البيئة

---

**تم بناء المرحلة 2 بنجاح ✅**
