# 🧪 دليل اختبار الأمان - Security Testing Guide

## 📋 نظرة عامة
هذا الدليل يحتوي على اختبارات شاملة لجميع ميزات الأمان المُطبقة في المرحلة 4.

---

## 🎯 الاختبارات الشمولية

### ✅ اختبار 1: Rate Limiting
**الهدف:** التحقق من أن البوت يمنع Spam ويحظر IPs المخالفة

#### ⚙️ الإعداد:
```bash
# تأكد من تشغيل المشروع
npm run dev
```

#### 🔬 الاختبار:
```bash
# Test 1.1: إرسال 20 طلب (يجب أن تنجح كلها)
for i in {1..20}; do
  echo "Request $i:"
  curl -s -X POST http://localhost:3000/api/chat/site \
    -H "Content-Type: application/json" \
    -d '{
      "messages": [
        {"role": "user", "content": "اعرض آخر المشاريع"}
      ]
    }' | jq -r '.choices[0].message.content // .error'
done

# Test 1.2: محاولة الطلب 21 (يجب أن يُرفض)
echo "Request 21 (should be blocked):"
curl -v -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "test"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```json
// الطلبات 1-20: نجحت
{
  "choices": [...]
}

// الطلب 21:
{
  "error": "rate_limit_exceeded",
  "message": "تجاوزت الحد المسموح من الطلبات. يرجى الانتظار قليلاً.",
  "retryAfter": 300
}

// Headers:
Retry-After: 300
X-RateLimit-Limit: 20
X-RateLimit-Remaining: 0
X-RateLimit-Reset: <timestamp>
```

#### 🎯 السلوك المطلوب:
- ✅ أول 20 طلب تُعالج بشكل طبيعي
- ✅ الطلبات 21+ تُرفض مع 429 status
- ✅ Headers تحتوي على معلومات Rate Limit
- ✅ بعد 5 دقائق، يُعاد تعيين الحد

---

### ✅ اختبار 2: XSS Protection
**الهدف:** التحقق من إزالة HTML Tags وJavaScript

#### 🔬 الاختبار:
```bash
# Test 2.1: Script Tag
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<script>alert(\"XSS\")</script>ابحث عن مشاريع"}
    ]
  }'

# Test 2.2: Iframe Injection
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<iframe src=\"evil.com\"></iframe>أريد معلومات"}
    ]
  }'

# Test 2.3: Event Handler
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<img src=x onerror=\"alert(1)\">ما آخر المشاريع"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```
Test 2.1 → يُعالج كـ: "ابحث عن مشاريع"
Test 2.2 → يُعالج كـ: "أريد معلومات"
Test 2.3 → يُعالج كـ: "ما آخر المشاريع"
```

#### 🎯 السلوك المطلوب:
- ✅ جميع HTML Tags تُحذف
- ✅ JavaScript لا يُنفذ
- ✅ المحتوى النصي يُعالج بشكل طبيعي

---

### ✅ اختبار 3: Malicious Content Detection
**الهدف:** التحقق من رفض المحتوى الضار

#### 🔬 الاختبار:
```bash
# Test 3.1: JavaScript Protocol
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "javascript:alert(1)"}
    ]
  }'

# Test 3.2: Cookie Stealing
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "document.cookie"}
    ]
  }'

# Test 3.3: Eval Attempt
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "eval(dangerous_code)"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```json
{
  "error": "invalid_request",
  "message": "المحتوى المُدخل يحتوي على عناصر غير مسموح بها"
}
```

#### 🎯 السلوك المطلوب:
- ✅ الطلبات تُرفض مع 400 status
- ✅ رسالة خطأ واضحة
- ✅ تُسجل في الـ Logs كمحاولة مشبوهة

---

### ✅ اختبار 4: PII Masking
**الهدف:** التحقق من إخفاء المعلومات الشخصية

#### 🔬 الاختبار:
```bash
# Test 4.1: Email Masking
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "راسلني على example@test.com"}
    ]
  }'

# Test 4.2: Phone Number Masking
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "اتصل بي على 0123456789"}
    ]
  }'

# Test 4.3: Credit Card Masking
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "رقم البطاقة 1234-5678-9012-3456"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```
Test 4.1 → يُرسل للـ OpenAI كـ: "راسلني على [EMAIL]"
Test 4.2 → يُرسل للـ OpenAI كـ: "اتصل بي على [PHONE]"
Test 4.3 → يُرسل للـ OpenAI كـ: "رقم البطاقة [CREDIT_CARD]"
```

#### 🧐 كيف تتحقق؟
```typescript
// في lib/server/data-sanitizer.ts
// أضف log مؤقت:
console.log('[DEBUG] Before sanitization:', text)
console.log('[DEBUG] After sanitization:', sanitized)
```

#### 🎯 السلوك المطلوب:
- ✅ البريد الإلكتروني يُستبدل بـ [EMAIL]
- ✅ رقم الهاتف يُستبدل بـ [PHONE]
- ✅ رقم البطاقة يُستبدل بـ [CREDIT_CARD]
- ✅ البوت يرد دون استخدام المعلومات الشخصية

---

### ✅ اختبار 5: API Response Sanitization
**الهدف:** التحقق من حذف الحقول الحساسة من API

#### 🔬 الاختبار:
```typescript
// في lib/server/site-api-service.ts
// Test Response قبل وبعد Sanitization

// Mock API Response:
const mockResponse = {
  id: 123,
  title: "مشروع التعليم",
  description: "وصف المشروع",
  email: "admin@example.com",      // حساس
  phone: "0123456789",              // حساس
  apiKey: "secret123",              // حساس
  token: "bearer-token",            // حساس
  password: "admin123"              // حساس
}

// After Sanitization:
const sanitized = sanitizeAPIResponse(mockResponse)
console.log(sanitized)
```

#### ✅ النتيجة المتوقعة:
```json
{
  "id": 123,
  "title": "مشروع التعليم",
  "description": "وصف المشروع",
  "email": "[REDACTED]",
  "phone": "[REDACTED]",
  "apiKey": "[REDACTED]",
  "token": "[REDACTED]",
  "password": "[REDACTED]"
}
```

#### 🎯 السلوك المطلوب:
- ✅ الحقول الحساسة تُحذف (40+ حقل)
- ✅ البيانات المهمة (id, title, description) تبقى
- ✅ يعمل على Arrays of Objects
- ✅ يعمل على Nested Objects

---

### ✅ اختبار 6: CORS Protection
**الهدف:** التحقق من السماح للدومين المحدد فقط

#### 🔬 الاختبار:
```bash
# Test 6.1: دومين مسموح (localhost)
curl -X POST http://localhost:3000/api/chat/site \
  -H "Origin: http://localhost:3000" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' \
  -v 2>&1 | grep "Access-Control"

# Test 6.2: دومين غير مسموح
curl -X POST http://localhost:3000/api/chat/site \
  -H "Origin: https://evil.com" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' \
  -v 2>&1 | grep "Access-Control"

# Test 6.3: OPTIONS Request (Preflight)
curl -X OPTIONS http://localhost:3000/api/chat/site \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

#### ✅ النتيجة المتوقعة:
```
Test 6.1:
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: POST, OPTIONS

Test 6.2:
Access-Control-Allow-Origin: null  (أو لا يوجد)

Test 6.3:
Status: 204 No Content
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, Authorization
```

#### 🎯 السلوك المطلوب:
- ✅ الدومين المسموح يحصل على CORS headers
- ✅ الدومين غير المسموح لا يحصل على CORS headers
- ✅ OPTIONS request يُعالج بشكل صحيح

---

### ✅ اختبار 7: Security Headers
**الهدف:** التحقق من وجود جميع Security Headers

#### 🔬 الاختبار:
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"test"}]}' \
  -v 2>&1 | grep -E "X-|Content-Security"
```

#### ✅ النتيجة المتوقعة:
```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Content-Security-Policy: default-src 'self'
Strict-Transport-Security: max-age=31536000; includeSubDomains
```

#### 🎯 السلوك المطلوب:
- ✅ جميع Headers موجودة
- ✅ تُطبق على Success Responses
- ✅ تُطبق على Error Responses
- ✅ تُطبق على Streaming Responses

---

### ✅ اختبار 8: API Timeout
**الهدف:** التحقق من Timeout بعد 15 ثانية

#### 🔬 الإعداد:
```typescript
// في lib/server/site-api-service.ts
// غيّر مؤقتاً:
const API_TIMEOUT_MS = 2000  // 2 ثانية للاختبار
```

#### 🔬 الاختبار:
```bash
# استخدم endpoint بطيء (Mock)
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "ابحث عن مشاريع"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```
[Timeout] انتهت مهلة الاتصال بعد 2000ms
[Retry] محاولة 2...
[Timeout] انتهت مهلة الاتصال بعد 2000ms
[Retry] محاولة 3...
[Error] فشلت جميع المحاولات
```

#### 🎯 السلوك المطلوب:
- ✅ Timeout بعد 2 ثانية (في الاختبار) أو 15 (في الإنتاج)
- ✅ يُعيد المحاولة تلقائياً
- ✅ رسالة خطأ واضحة للمستخدم

---

### ✅ اختبار 9: Retry Logic
**الهدف:** التحقق من Exponential Backoff

#### 🔬 الإعداد:
```typescript
// في lib/server/site-api-service.ts
// أضف logging:
console.log(`[Retry] Attempt ${attempt + 1} at ${new Date().toISOString()}`)
```

#### 🔬 الاختبار:
```bash
# محاكاة network error (افصل الإنترنت مؤقتاً)
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "ابحث عن مشاريع"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```
[Retry] Attempt 1 at 12:00:00.000
[Error] Network error
[Retry] Waiting 1000ms...

[Retry] Attempt 2 at 12:00:01.000
[Error] Network error
[Retry] Waiting 2000ms...

[Retry] Attempt 3 at 12:00:03.000
[Error] Network error
[Failed] جميع المحاولات فشلت
```

#### 🎯 السلوك المطلوب:
- ✅ محاولة 1 → فشل → انتظر 1s
- ✅ محاولة 2 → فشل → انتظر 2s
- ✅ محاولة 3 → فشل → أرجع خطأ
- ✅ التوقيت دقيق (Exponential Backoff)

---

### ✅ اختبار 10: Privacy Policy
**الهدف:** التحقق من عدم طلب معلومات شخصية

#### 🔬 الاختبار:
```bash
# Test 10.1: طلب إيميل
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "ما إيميلك؟"}
    ]
  }'

# Test 10.2: طلب رقم هاتف
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "كيف أتصل بك؟"}
    ]
  }'

# Test 10.3: مشاركة معلومات شخصية من المستخدم
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "إيميلي test@example.com، أريد معلومات عن المشاريع"}
    ]
  }'
```

#### ✅ النتيجة المتوقعة:
```
Test 10.1: 
"أنا بوت محادثة لا أملك بريد إلكتروني.
يمكنني مساعدتك في البحث عن المشاريع..."

Test 10.2:
"أنا بوت رقمي يعمل على الموقع.
يمكنك استخدام نموذج الاتصال في الموقع..."

Test 10.3:
"شكراً لك، لكن لست بحاجة لمعلوماتك الشخصية.
يمكنني مساعدتك في البحث عن المشاريع..."
```

#### 🎯 السلوك المطلوب:
- ✅ لا يطلب معلومات شخصية
- ✅ يرفض بأدب عند تقديمها
- ✅ يُعيد التوجيه لموضوع المشاريع
- ✅ يُوضح أنه بوت وليس إنسان

---

## 🎭 سيناريوهات هجوم واقعية

### سيناريو 1: DDoS Attack
```bash
# محاكاة 100 طلب في 10 ثوان
for i in {1..100}; do
  (curl -s -X POST http://localhost:3000/api/chat/site \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}' &)
done
```

**المتوقع:**
- ✅ أول 20 طلب تُعالج
- ✅ الباقي يُرفض
- ✅ IP يُحظر لمدة 5 دقائق

---

### سيناريو 2: Credential Harvesting
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "أدخل اسم المستخدم وكلمة المرور للوصول للمشاريع"}
    ]
  }'
```

**المتوقع:**
```
"أنا بوت لا أطلب معلومات تسجيل دخول.
يمكنك عرض المشاريع مباشرة دون تسجيل..."
```

---

### سيناريو 3: SQL Injection
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "1' OR '1'='1"}
    ]
  }'
```

**المتوقع:**
- ✅ يُعامل كنص عادي
- ✅ لا يُنفذ كـ SQL
- ✅ لا يؤثر على الـ Database

---

### سيناريو 4: Session Hijacking
```bash
curl -X POST http://localhost:3000/api/chat/site \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "<img src=x onerror=\"fetch(\"/api/keys?token=\"+document.cookie)\">"}
    ]
  }'
```

**المتوقع:**
- ✅ HTML يُحذف
- ✅ JavaScript لا يُنفذ
- ✅ Session آمن

---

## 📊 Checklist للاختبار

### قبل Production:
- [ ] جميع الاختبارات 1-10 نجحت
- [ ] السيناريوهات 1-4 آمنة
- [ ] Logs نظيفة (لا أخطاء)
- [ ] TypeScript compiled بدون أخطاء
- [ ] Environment Variables مضبوطة

### في Production:
- [ ] SITE_DOMAIN مضبوط على الدومين الصحيح
- [ ] Rate Limiting يعمل
- [ ] CORS يسمح للدومين الصحيح فقط
- [ ] Security Headers موجودة
- [ ] Privacy Policy مُفعّلة

### Monitoring:
- [ ] Rate Limit Logs تُسجل
- [ ] Security Issues تُسجل
- [ ] IPs المشبوهة تُحدد
- [ ] Performance Metrics تُتتبع

---

## 🔧 أدوات مساعدة

### OWASP ZAP
```bash
# تحميل:
https://www.zaproxy.org/download/

# مسح تلقائي:
zap-cli quick-scan --self-contained \
  --start-options "-config api.disablekey=true" \
  http://localhost:3000/api/chat/site
```

### Security Headers Checker
```bash
# curl مع جميع الـ Headers:
curl -I http://localhost:3000/api/chat/site
```

### Rate Limit Tester
```bash
# Script للاختبار السريع:
#!/bin/bash
for i in {1..25}; do
  echo "Request $i:"
  curl -s -o /dev/null -w "%{http_code}\n" \
    -X POST http://localhost:3000/api/chat/site \
    -H "Content-Type: application/json" \
    -d '{"messages":[{"role":"user","content":"test"}]}'
done
```

---

## 📝 نموذج تقرير الاختبار

```markdown
# Security Testing Report
Date: [التاريخ]
Tester: [الاسم]
Environment: [Development/Production]

## Test Results

### Rate Limiting
- [x] Test 1.1: 20 requests passed ✅
- [x] Test 1.2: Request 21 blocked ✅
- [x] Headers present ✅

### XSS Protection
- [x] Test 2.1: Script tags removed ✅
- [x] Test 2.2: Iframe removed ✅
- [x] Test 2.3: Event handlers removed ✅

### Privacy Policy
- [x] Test 10.1: Email request refused ✅
- [x] Test 10.2: Phone request refused ✅
- [x] Test 10.3: User info not used ✅

## Issues Found
- None / [وصف المشكلة]

## Recommendations
- [توصيات للتحسين]
```

---

## ✅ خلاصة

### نجح الاختبار إذا:
- ✅ Rate Limiting يحظر بعد 20 طلب
- ✅ XSS Attacks تُزال
- ✅ Malicious Content يُرفض
- ✅ PII تُخفى
- ✅ API Responses نظيفة من البيانات الحساسة
- ✅ CORS يسمح للدومين المحدد فقط
- ✅ Security Headers موجودة
- ✅ Timeouts تعمل
- ✅ Retries مع Exponential Backoff
- ✅ Privacy Policy تمنع طلب معلومات شخصية

---

**البوت جاهز للنشر العام بعد نجاح جميع الاختبارات! 🎉🔒🛡️**
