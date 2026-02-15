# المرحلة 4 - الأمان والتحكم بالاستخدام

## 🎯 الهدف
حماية البوت من إساءة الاستخدام وضمان أمان البيانات للنشر العام.

---

## ✅ ما تم إنجازه

### 1. **Rate Limiting**  📊
📂 `lib/server/rate-limiter.ts`

#### الميزات:
- ✅ **حد الطلبات**: 20 طلب لكل دقيقة لكل IP
- ✅ **حظر مؤقت**: 5 دقائق عند التجاوز
- ✅ **تنظيف تلقائي**: كل 5 دقائق
- ✅ **دعم Multiple Headers**: x-forwarded-for, x-real-ip, cf-connecting-ip

#### كيف يعمل:
```typescript
// في Route.ts
const rateLimitResult = applyRateLimit(request, {
  maxRequests: 20,      // 20 طلب
  windowMs: 60 * 1000,  // لكل دقيقة
  blockDurationMs: 5 * 60 * 1000 // حظر 5 دقائق
})

if (!rateLimitResult.allowed) {
  return createRateLimitResponse(rateLimitResult.retryAfter!)
}
```

#### Response عند التجاوز:
```json
{
  "error": "rate_limit_exceeded",
  "message": "تجاوزت الحد المسموح من الطلبات",
  "retryAfter": 300
}
```

#### الـ Headers المُرجعة:
- `Retry-After`: وقت الانتظار بالثواني
- `X-RateLimit-Limit`: الحد الأقصى
- `X-RateLimit-Remaining`: المتبقي
- `X-RateLimit-Reset`: وقت إعادة التعيين

---

### 2. **Data Sanitization** 🧹
📂 `lib/server/data-sanitizer.ts`

#### أ) حذف الحقول الحساسة:
```typescript
SENSITIVE_FIELDS = [
  // معلومات شخصية
  "password", "token", "apiKey", "secret",
  "email", "phone", "address",
  
  // معلومات مالية
  "creditCard", "bankAccount", "iban",
  
  // معلومات هوية
  "ssn", "nationalId", "passportNumber"
]
```

يتم استبدالها بـ `[REDACTED]` تلقائياً.

#### ب) إزالة HTML Tags (XSS Protection):
```typescript
// قبل:
"<script>alert('xss')</script>Hello"

// بعد:
"Hello"
```

#### ج) إخفاء المعلومات الشخصية في النصوص:
```typescript
// قبل:
"اتصل بي على example@email.com أو 0123456789"

// بعد:
"اتصل بي على [EMAIL] أو [PHONE]"
```

#### د) التحقق من المحتوى الضار:
```typescript
const validation = validateAndSanitize(userInput)

if (!validation.valid) {
  return error(validation.error)
}

// استخدام النص النظيف
const cleanInput = validation.sanitized
```

---

### 3. **API Timeouts & Retries** ⏱️
📂 `lib/server/site-api-service.ts`

#### الإعدادات:
```typescript
const API_TIMEOUT_MS = 15000        // 15 ثانية
const MAX_RETRIES = 2               // محاولتين إضافيتين
const RETRY_DELAY_MS = 1000         // ثانية واحدة
```

#### Fetch مع Timeout:
```typescript
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    })
    return response
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error('انتهت مهلة الاتصال')
    }
    throw error
  }
}
```

#### Retry Logic مع Exponential Backoff:
```typescript
async function retryOperation(operation, maxRetries, delayMs) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      if (attempt === maxRetries) throw error
      
      await delay(delayMs)
      delayMs *= 2  // مضاعفة التأخير
    }
  }
}
```

#### التدفق الكامل:
```
محاولة 1 → فشل → انتظر 1s
محاولة 2 → فشل → انتظر 2s
محاولة 3 → فشل → أرجع خطأ
```

---

### 4. **CORS & Security Headers** 🔒
📂 `app/api/chat/site/route.ts`

#### CORS Configuration:
```typescript
const ALLOWED_ORIGINS = [
  process.env.SITE_DOMAIN || "https://projects.alkafeel.net",
  "http://localhost:3000"  // للتطوير
]
```

#### Security Headers:
```typescript
{
  "Access-Control-Allow-Origin": "<allowed-origin>",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "X-XSS-Protection": "1; mode=block",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Content-Security-Policy": "default-src 'self'"
}
```

#### معالجة OPTIONS Request:
```typescript
export async function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: getSecurityHeaders(request.headers.get("origin"))
  })
}
```

---

### 5. **Privacy Policy** 🔐
📂 `lib/server/system-prompts.ts`

#### القواعد المضافة:

**أ) المعلومات الممنوع طلبها:**
```
❌ معلومات شخصية: الاسم، تاريخ الميلاد، الجنسية
❌ معلومات اتصال: إيميل، هاتف، عنوان
❌ معلومات مالية: بطاقات ائتمان، حسابات بنكية
❌ معلومات هوية: رقم وطني، جواز سفر
❌ كلمات المرور
```

**ب) إذا قدم المستخدم معلومات شخصية:**
```
1. لا تخزنها أو تستخدمها
2. أخبر المستخدم: "لست بحاجة لمعلوماتك الشخصية"
3. أعد توجيه السؤال للموقع
```

**ج) مبادئ الأمان:**
- الشفافية: أنت بوت، لست إنسان
- الخصوصية: لا طلب أو تخزين معلومات شخصية
- الأمان: معالجة آمنة على السيرفر
- الثقة: لا مشاركة مع جهات خارجية

---

## 🛡️ طبقات الحماية (Security Layers)

### المستوى 1️⃣: Network Layer
- ✅ **Rate Limiting**: منع Spam وDDoS
- ✅ **CORS**: السماح فقط من دومين محدد
- ✅ **Security Headers**: حماية من XSS، Clickjacking

### المستوى 2️⃣: Input Layer
- ✅ **Validation**: التحقق من صحة المدخلات
- ✅ **Sanitization**: تنظيف HTML وSpecial Chars
- ✅ **Length Limits**: حد أقصى 2000 حرف

### المستوى 3️⃣: API Layer
- ✅ **Timeouts**: 15 ثانية لكل طلب
- ✅ **Retries**: محاولتين إضافيتين
- ✅ **Data Sanitization**: حذف الحقول الحساسة

### المستوى 4️⃣: Output Layer
- ✅ **Masking**: إخفاء معلومات شخصية في الردود
- ✅ **Privacy Policy**: عدم طلب بيانات حساسة
- ✅ **Logging**: تسجيل المحاولات المشبوهة

---

## 📊 أمثلة عملية

### مثال 1: محاولة Spam
```
المستخدم يُرسل 25 طلب في دقيقة واحدة

✅ الطلبات 1-20: تُعالج بشكل طبيعي
❌ الطلبات 21-25: تُرفض مع:
   - Status: 429 Too Many Requests
   - Retry-After: 300 seconds
   - Message: "تجاوزت الحد المسموح"
```

### مثال 2: محاولة XSS
```
المستخدم يُرسل:
"<script>alert('hack')</script>أريد البحث عن مشاريع"

✅ يتم تنظيفها تلقائياً إلى:
"أريد البحث عن مشاريع"

✅ البوت يُعالج السؤال بأمان
```

### مثال 3: طلب معلومات شخصية
```
المستخدم: "ما إيميلك؟"

✅ البوت يرد:
"أنا بوت محادثة لا أملك بريد إلكتروني.
يمكنني مساعدتك في البحث عن المشاريع بدلاً من ذلك.
كيف يمكنني مساعدتك؟"
```

### مثال 4: تسريب بيانات من API
```
API Response:
{
  "id": 123,
  "title": "مشروع التعليم",
  "email": "admin@example.com",    ← حساس
  "phone": "0123456789",            ← حساس
  "apiKey": "secret123"             ← حساس
}

✅ بعد Sanitization:
{
  "id": 123,
  "title": "مشروع التعليم",
  "email": "[REDACTED]",
  "phone": "[REDACTED]",
  "apiKey": "[REDACTED]"
}
```

---

## 🔧 الإعدادات المطلوبة

### في `.env.local`:
```env
# دومين الموقع المسموح
SITE_DOMAIN=https://projects.alkafeel.net

# إعدادات API (موجودة مسبقاً)
SITE_API_BASE_URL=https://api.projects.alkafeel.net
SITE_API_TOKEN=your-token-here
```

### في Production:
```env
NODE_ENV=production
SITE_DOMAIN=https://projects.alkafeel.net
```

---

## 🧪 اختبار الأمان

### Test 1: Rate Limiting
```bash
# إرسال 25 طلب سريع
for i in {1..25}; do
  curl -X POST http://localhost:3000/api/chat/site \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}'
done

# المتوقع: الطلبات 21-25 تُرفض بـ 429
```

### Test 2: XSS Protection
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<script>alert(1)</script>test"}
    ]
  }'

# المتوقع: يُعالج كـ "test" فقط
```

### Test 3: CORS
```bash
# من دومين غير مسموح
curl -X POST http://localhost:3000/api/chat/site \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}'

# المتوقع: CORS headers تمنع الوصول
```

### Test 4: Timeout
```bash
# في site-api-service.ts، جرّب endpoint بطيء
# المتوقع: timeout بعد 15 ثانية
```

---

## 📝 Monitoring & Logging

### ما يتم تسجيله:
```typescript
// Rate Limit Violations
console.warn(`[Rate Limit] Blocked IP: ${ip}`)

// Security Issues
logSecurityIssue("Invalid Input", details, ip)

// API Retries
console.log(`[API Retry] Attempt ${attempt} failed`)

// Timeouts
console.error("[Timeout] انتهت مهلة الاتصال")
```

### في Production - يُنصح بـ:
- استخدام Redis لـ Rate Limiting (بدلاً من Memory)
- استخدام خدمة Logging مثل Logtail أو DataDog
- إضافة Alerts عند تجاوز حدود معينة
- تسجيل IPs المشبوهة في Blacklist

---

## ⚡ التحسينات المستقبلية (Optional)

### 1. **Redis للـ Rate Limiting**
```typescript
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL)

// استبدال Map بـ Redis
await redis.incr(`rate:${ip}`)
await redis.expire(`rate:${ip}`, 60)
```

### 2. **IP Blacklist**
```typescript
const BLACKLISTED_IPS = new Set([
  "192.168.1.100",
  // ...
])

if (BLACKLISTED_IPS.has(ip)) {
  return new Response("Forbidden", { status: 403 })
}
```

### 3. **WAF Integration**
- استخدام Cloudflare WAF
- أو AWS WAF
- لحماية إضافية من DDoS

### 4. **Analytics**
```typescript
// تتبع الاستخدام
trackEvent("chat_message", {
  ip: rateLimitResult.ip,
  timestamp: Date.now(),
  messageLength: lastMessage.content.length
})
```

---

## 📊 الإحصائيات

### الملفات:
- ✅ **2 ملفات جديدة**: Rate Limiter, Data Sanitizer
- ✅ **2 ملفات محدثة**: API Service, Route
- ✅ **1 ملف محدث**: System Prompts (Privacy Policy)

### الأسطر:
- **rate-limiter.ts**: ~280 سطر
- **data-sanitizer.ts**: ~390 سطر
- **API Service Updates**: ~100 سطر
- **Route Updates**: ~60 سطر
- **Prompts Updates**: ~30 سطر
- **إجمالي كود**: ~860 سطر
- **توثيق**: ~1,400 سطر

---

## ✅ Checklist النهائي

### الأمان:
- [x] Rate Limiting مُفعّل (20/min per IP)
- [x] CORS مضبوط على دومين محدد
- [x] Security Headers موجودة
- [x] Data Sanitization في المدخلات والمخرجات
- [x] XSS Protection
- [x] Privacy Policy في System Prompt

### الأداء:
- [x] Timeouts للـ API calls (15s)
- [x] Retry Logic مع Exponential Backoff
- [x] تنظيف تلقائي للـ Rate Limit data

### الخصوصية:
- [x] عدم طلب معلومات شخصية
- [x] إخفاء البيانات الحساسة من API
- [x] Logging للمحاولات المشبوهة فقط

---

## 🚀 جاهز للنشر!

البوت الآن **آمن للنشر العام** مع:
- 🛡️ حماية من Spam و DDoS
- 🔒 أمان البيانات
- 🔐 احترام خصوصية المستخدمين
- ⚡ أداء موثوق مع Retries
- 📊 Monitoring للنشاط المشبوه

---

## 📚 المراجع

- [PHASE-1: System Prompts](PHASE-1-SYSTEM-PROMPTS.md)
- [PHASE-2: Function Calling](PHASE-2-FUNCTION-CALLING.md)
- [PHASE-3: No Hallucination](PHASE-3-NO-HALLUCINATION.md)
- [PHASE-4: Security](PHASE-4-SECURITY.md) ← **أنت هنا**

---

**المرحلة 4 مكتملة! البوت الآن آمن للنشر العام! 🎉🔒🛡️**
