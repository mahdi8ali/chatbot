# ربط REST API الحقيقي

## نظرة عامة

حالياً، البوت يستخدم **Mock Data** أثناء التطوير. هذا الدليل يشرح كيفية ربط **REST API الحقيقي** للموقع.

---

## 📋 المتطلبات الأساسية

قبل البدء، تأكد من:
- ✅ لديك وصول إلى REST API الفعلي
- ✅ لديك `API Token` صالح للمصادقة
- ✅ تعرف `Base URL` الخاص بـ API (مثل: `https://api.projects.alkafeel.net`)
- ✅ لديك وثائق الـ Endpoints (Swagger/OpenAPI أو ما شابه)

---

## 🔧 الخطوات

### **الخطوة 1: تحديث متغيرات البيئة**

افتح `.env.local` وعدّل:

```env
# ❌ قبل (Development):
SITE_API_BASE_URL=http://localhost:8080/api
SITE_API_TOKEN=dev-token-12345

# ✅ بعد (Production):
SITE_API_BASE_URL=https://api.projects.alkafeel.net
SITE_API_TOKEN=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...  # Token حقيقي
```

> **مهم**: لا تشارك الـ API Token على GitHub. استخدم `.env.local` فقط (محلي وغير مُتتبع).

---

### **الخطوة 2: تحديد مسارات API (Endpoints)**

افتح `lib/server/site-api-service.ts` وتأكد من أن المسارات تطابق REST API.

#### مثال على التطابق:

| الدالة | المسار الحالي | المسار الحقيقي المحتمل |
|--------|---------------|------------------------|
| `siteSearch()` | `/api/projects/search` | ✅ أو `/v1/projects/search` |
| `siteGetProject()` | `/api/projects/{id}` | ✅ أو `/v1/projects/{id}` |
| `siteListCategories()` | `/api/projects/categories` | ✅ أو `/v1/categories` |
| `siteGetLatest()` | `/api/projects/latest` | ✅ أو `/v1/projects/latest` |
| `siteFAQ()` | `/api/faq/search` | ✅ أو `/v1/faq` |

إذا كانت API تستخدم `/v1/` أو مسار مختلف، عدّل الكود:

```typescript
async function siteSearch(query: string, category?: string, limit: number = 10) {
  return callSiteAPI('/v1/projects/search', { // ← عدّل المسار
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })
}
```

---

### **الخطوة 3: إزالة Mock Data**

في كل دالة داخل `lib/server/site-api-service.ts`، احذف أو علّق قسم Mock Data:

#### مثال: **`siteSearch()`**

```typescript
// ❌ قبل:
async function siteSearch(query: string, category?: string, limit: number = 10): Promise<string> {
  // Mock data for development
  if (process.env.NODE_ENV === 'development') {
    return JSON.stringify({
      success: true,
      results: [
        {
          id: 1,
          title: "مشروع تطوير التعليم",
          category: "تعليم",
          status: "قيد التنفيذ",
          description: "مشروع لتطوير البنية التحتية للتعليم"
        }
      ],
      total: 1,
      _warning: "هذه بيانات تجريبية - سيتم استبدالها بـ API الحقيقي"
    })
  }

  return callSiteAPI('/api/projects/search', {
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })
}
```

```typescript
// ✅ بعد:
async function siteSearch(query: string, category?: string, limit: number = 10): Promise<string> {
  const response = await callSiteAPI('/api/projects/search', {
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })
  
  return JSON.stringify(response) // API response
}
```

#### نفس الشيء لباقي الدوال:
- `siteGetProject()`
- `siteListCategories()`
- `siteGetLatest()`
- `siteFAQ()`

---

### **الخطوة 4: تعديل طريقة المصادقة (إذا لزم الأمر)**

إذا كانت API تستخدم أسلوب مصادقة مختلف عن `Bearer Token`، عدّل `callSiteAPI()`:

#### مثال 1: **API Key في Header مخصص**
```typescript
async function callSiteAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const baseUrl = getSiteAPIBaseURL()
  const apiKey = getSiteAPIToken()

  const response = await fetch(`${baseUrl}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey, // ← بدلاً من Authorization
      ...options.headers,
    },
  })

  if (!response.ok) {
    throw new Error(`API Error: ${response.status} ${response.statusText}`)
  }

  return response.json()
}
```

#### مثال 2: **Basic Auth**
```typescript
headers: {
  'Content-Type': 'application/json',
  'Authorization': `Basic ${btoa(`${username}:${apiKey}`)}`,
  ...options.headers,
}
```

#### مثال 3: **OAuth Token**
_(احتفظ بـ Bearer Token كما هو - الأفضل للـ OAuth)_

---

### **الخطوة 5: التعامل مع هيكل البيانات**

إذا كانت API تُرجع بيانات بهيكل مختلف عن المتوقع، قد تحتاج لتحويله.

#### مثال:
API تُرجع:
```json
{
  "data": {
    "items": [...],
    "count": 10
  },
  "status": "success"
}
```

بينما الكود يتوقع:
```json
{
  "results": [...],
  "total": 10
}
```

**الحل:**
```typescript
async function siteSearch(query: string, category?: string, limit: number = 10): Promise<string> {
  const response = await callSiteAPI('/api/projects/search', {
    method: 'POST',
    body: JSON.stringify({ query, category, limit })
  })

  // تحويل الهيكل:
  const transformed = {
    success: response.status === 'success',
    results: response.data.items,
    total: response.data.count
  }

  return JSON.stringify(transformed)
}
```

---

### **الخطوة 6: اختبار الربط**

#### 1. أعد تشغيل السيرفر:
```bash
npm run dev
```

#### 2. اختبر كل أداة:
```bash
# Test 1: site_search
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"ابحث عن مشاريع التعليم\"}], \"use_tools\": true}"

# Test 2: site_get_project
curl -X POST http://localhost:3000/api/chat/site ^
  -H "Content-Type: application/json" ^
  -d "{\"messages\": [{\"role\": \"user\", \"content\": \"أعطني تفاصيل المشروع رقم 5\"}], \"use_tools\": true}"

# ... باقي الأدوات
```

#### 3. تحقق من الأخطاء:
```typescript
// أضف Logging مؤقت لرؤية البيانات:
async function callSiteAPI(endpoint: string, options: RequestInit = {}): Promise<any> {
  const response = await fetch(`${baseUrl}${endpoint}`, { ... })
  const data = await response.json()
  
  console.log('API Response:', data) // ← للـ Debugging
  
  return data
}
```

---

## 🛠️ استكشاف الأخطاء الشائعة

### ❌ **خطأ 1: "API Error: 401 Unauthorized"**
**السبب:** الـ Token غير صحيح أو منتهي الصلاحية.

**الحل:**
1. تحقق من `.env.local`:
   ```env
   SITE_API_TOKEN=your-valid-token
   ```
2. تحقق من أن التطبيق الخارجي أصدر Token صالح.
3. جرّب استدعاء API مباشرة باستخدام cURL:
   ```bash
   curl https://api.projects.alkafeel.net/api/projects/search \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -d '{"query": "test"}'
   ```

---

### ❌ **خطأ 2: "API Error: 404 Not Found"**
**السبب:** المسار غير صحيح.

**الحل:**
- تحقق من وثائق API.
- جرّب المسارات المحتملة:
  - `/api/projects/search`
  - `/v1/projects/search`
  - `/projects/search`

---

### ❌ **خطأ 3: CORS Errors**
**السبب:** API لا تسمح بطلبات من `localhost:3000`.

**الحل:**
- البوت يستدعي API من **السيرفر** (لا CORS).
- إذا ظهر CORS، تأكد من أن الاستدعاء من **API Route** (`/api/chat/site`) وليس من Client.

---

### ❌ **خطأ 4: "Cannot read property 'results' of undefined"**
**السبب:** هيكل البيانات مختلف عن المتوقع.

**الحل:**
- اطبع البيانات أولاً:
  ```typescript
  console.log('API Response:', response)
  ```
- حوّل الهيكل كما في **الخطوة 5**.

---

## 🎯 Checklist النهائي

قبل الانتقال للإنتاج:

- [ ] `.env.local` محدّث بـ API الحقيقي
- [ ] جميع المسارات صحيحة في `site-api-service.ts`
- [ ] Mock Data تم حذفها/تعطيلها
- [ ] التحقق من طريقة المصادقة (Bearer/API Key/Basic)
- [ ] اختبار كل أداة على حدة
- [ ] التعامل مع أخطاء API (404, 500, timeout)
- [ ] Logging للأخطاء موجود لـ Debugging
- [ ] البيانات المُرجعة تتطابق مع ما يتوقعه OpenAI

---

## 📊 مثال عملي: ربط API حقيقي

### قبل:
```typescript
async function siteGetProject(id: number): Promise<string> {
  if (process.env.NODE_ENV === 'development') {
    return JSON.stringify({
      id: id,
      title: "مشروع توسعة المكتبة",
      category: "ثقافة",
      status: "قيد التنفيذ",
      _warning: "Mock Data"
    })
  }

  return callSiteAPI(`/api/projects/${id}`, { method: 'GET' })
}
```

### بعد (Production):
```typescript
async function siteGetProject(id: number): Promise<string> {
  try {
    const response = await callSiteAPI(`/v1/projects/${id}`, { 
      method: 'GET' 
    })

    // تحويل البيانات إذا لزم الأمر:
    const project = {
      id: response.project_id,
      title: response.project_title,
      category: response.category_name,
      status: response.project_status,
      description: response.project_description,
      progress: response.completion_percentage
    }

    return JSON.stringify(project)

  } catch (error) {
    console.error('Error fetching project:', error)
    return JSON.stringify({
      error: true,
      message: `فشل في جلب المشروع رقم ${id}`
    })
  }
}
```

---

## 🔗 الخطوة التالية

بعد ربط API بنجاح:
1. ✅ اختبر مع بيانات حقيقية
2. ✅ راقب Logs للأخطاء
3. ✅ حسّن معالجة الأخطاء
4. ✅ انتقل للمرحلة 3: تخصيص الواجهة

---

**جاهز للربط! 🔗**
