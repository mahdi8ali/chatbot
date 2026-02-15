# 🚀 دليل النشر للإنتاج - Production Deployment Guide

## 📋 نظرة عامة
هذا الدليل يحتوي على جميع الخطوات المطلوبة لنشر البوت في بيئة الإنتاج بشكل آمن.

---

## ✅ Checklist قبل النشر

### 1. المتطلبات الأساسية
- [ ] TypeScript compiled بدون أخطاء
- [ ] جميع الاختبارات في [SECURITY-TESTING-GUIDE.md](SECURITY-TESTING-GUIDE.md) نجحت
- [ ] Environment Variables جاهزة
- [ ] Domain Name جاهز
- [ ] SSL Certificate (HTTPS)

### 2. الأمان
- [ ] Rate Limiting مُفعّل
- [ ] CORS مضبوط على الـ production domain
- [ ] Security Headers موجودة
- [ ] Privacy Policy في System Prompt
- [ ] Data Sanitization مُفعّل
- [ ] API Token آمن وغير مكشوف

### 3. الأداء
- [ ] Redis جاهز للـ Rate Limiting (اختياري لكن مُنصح به)
- [ ] CDN/Proxy محافظ على Real IP headers
- [ ] Timeout/Retry مضبوط على قيم مناسبة
- [ ] Logging System جاهز

---

## 🔧 إعداد Environment Variables

### في Production Server:

```bash
# ===== الأساسية (موجودة مسبقاً) =====
OPENAI_API_KEY=sk-xxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# ===== الجديدة للمرحلة 2-4 =====
SITE_API_BASE_URL=https://api.projects.alkafeel.net
SITE_API_TOKEN=your-secure-token-here
SITE_DOMAIN=https://projects.alkafeel.net

# ===== اختيارية =====
NODE_ENV=production
REDIS_URL=redis://localhost:6379  # للـ Rate Limiting (مُنصح به)
```

### ملاحظات:
- ⚠️ **لا تُضف أبداً** `.env.local` للـ Git
- ✅ استخدم Secrets Manager (مثل AWS Secrets Manager أو Vercel Env Vars)
- ✅ تأكد من قوة الـ `SITE_API_TOKEN`

---

## 🌐 إعداد Domain & CORS

### 1. تحديث CORS في الكود:

📂 `app/api/chat/site/route.ts`

```typescript
const ALLOWED_ORIGINS = [
  process.env.SITE_DOMAIN || "https://projects.alkafeel.net",
  // حذف أو علّق localhost في Production:
  // "http://localhost:3000"
]
```

### 2. تأكد من HTTPS:
```bash
# تحقق من الـ SSL Certificate:
curl -v https://projects.alkafeel.net 2>&1 | grep "SSL"
```

### 3. تحقق من CORS بعد النشر:
```bash
curl -X OPTIONS https://projects.alkafeel.net/api/chat/site \
  -H "Origin: https://projects.alkafeel.net" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

**المتوقع:**
```
Access-Control-Allow-Origin: https://projects.alkafeel.net
Access-Control-Allow-Methods: POST, OPTIONS
Status: 204
```

---

## 🗄️ إعداد Redis للـ Rate Limiting (مُنصح به)

### لماذا Redis؟
- ✅ يدعم Multiple Instances (Load Balancing)
- ✅ أسرع من In-Memory
- ✅ TTL تلقائي للبيانات
- ✅ مشاركة البيانات بين الـ Servers

### الخيار 1: Redis Cloud (سهل)
```bash
# استخدم خدمة مثل:
# - Upstash (https://upstash.com/)
# - Redis Labs (https://redis.com/)
# - AWS ElastiCache

# أضف في .env:
REDIS_URL=redis://:password@host:port
```

### الخيار 2: Self-Hosted Redis
```bash
# تثبيت Redis:
# Ubuntu/Debian:
sudo apt-get install redis-server

# macOS:
brew install redis

# Windows:
# استخدم Docker أو WSL

# تشغيل:
redis-server

# في .env:
REDIS_URL=redis://localhost:6379
```

### الخيار 3: Docker
```yaml
# docker-compose.yml
version: '3.8'
services:
  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data

volumes:
  redis-data:
```

### تحديث Rate Limiter:

📂 `lib/server/rate-limiter.ts`

```typescript
import Redis from 'ioredis'

const redis = process.env.REDIS_URL 
  ? new Redis(process.env.REDIS_URL)
  : null

async function checkRateLimitRedis(
  ip: string,
  maxRequests: number,
  windowMs: number
): Promise<RateLimitResult> {
  if (!redis) {
    // Fallback للـ In-Memory
    return checkRateLimit(ip, maxRequests, windowMs)
  }

  const key = `rate:${ip}`
  const now = Date.now()
  const windowStart = now - windowMs

  // Redis Transaction
  const multi = redis.multi()
  
  // إزالة الطلبات القديمة
  multi.zremrangebyscore(key, 0, windowStart)
  
  // عد الطلبات الحالية
  multi.zcard(key)
  
  // أضف الطلب الحالي
  multi.zadd(key, now, `${now}`)
  
  // تعيين TTL
  multi.expire(key, Math.ceil(windowMs / 1000))
  
  const results = await multi.exec()
  const count = results![1][1] as number

  return {
    allowed: count < maxRequests,
    limit: maxRequests,
    remaining: Math.max(0, maxRequests - count - 1),
    reset: now + windowMs,
    retryAfter: count >= maxRequests ? Math.ceil(windowMs / 1000) : undefined
  }
}
```

### اختبار Redis:
```bash
# تأكد من الاتصال:
redis-cli ping
# الرد: PONG

# عرض الـ Keys:
redis-cli keys "rate:*"

# عرض count لـ IP معين:
redis-cli zcard "rate:192.168.1.1"
```

---

## 🔍 إعداد Logging & Monitoring

### 1. Structured Logging:

📂 `lib/server/logger.ts` (جديد)

```typescript
export interface LogData {
  level: 'info' | 'warn' | 'error'
  message: string
  ip?: string
  timestamp: string
  [key: string]: any
}

export function log(data: LogData) {
  const entry = {
    ...data,
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV
  }

  if (process.env.NODE_ENV === 'production') {
    // إرسال للـ Logging Service
    console.log(JSON.stringify(entry))
  } else {
    // Development - formatted
    console.log(
      `[${entry.level.toUpperCase()}] ${entry.message}`,
      entry
    )
  }
}
```

### 2. Security Logging:

📂 `lib/server/rate-limiter.ts`

```typescript
import { log } from './logger'

// في applyRateLimit():
if (!result.allowed) {
  log({
    level: 'warn',
    message: 'Rate limit exceeded',
    ip: result.ip,
    limit: result.limit,
    reset: new Date(result.reset).toISOString()
  })
}
```

### 3. Error Logging:

📂 `app/api/chat/site/route.ts`

```typescript
import { log } from '@/lib/server/logger'

try {
  // ... كود المعالجة
} catch (error) {
  log({
    level: 'error',
    message: 'Chat API error',
    error: error.message,
    stack: error.stack,
    ip: getClientIP(request)
  })
  
  return new Response(...)
}
```

### 4. Logging Services (اختر واحد):

#### Vercel (Built-in):
```bash
# Vercel Logs تلقائية
# عرض في Dashboard: https://vercel.com/<project>/logs
```

#### Logtail:
```typescript
import { Logtail } from '@logtail/node'
const logtail = new Logtail(process.env.LOGTAIL_TOKEN)

export function log(data: LogData) {
  if (process.env.NODE_ENV === 'production') {
    logtail[data.level](data.message, data)
  }
}
```

#### Datadog:
```bash
# تثبيت:
npm install dd-trace

# في كود التطبيق:
const tracer = require('dd-trace').init()
```

---

## 📊 Monitoring & Alerts

### 1. Rate Limit Monitoring:

```typescript
// إضافة endpoint للـ Stats:
// app/api/admin/stats/route.ts

export async function GET(request: Request) {
  // تحقق من Admin Token
  const token = request.headers.get('authorization')
  if (token !== process.env.ADMIN_TOKEN) {
    return new Response('Unauthorized', { status: 401 })
  }

  const stats = getRateLimitStats()
  
  return Response.json({
    totalClients: stats.size,
    blockedClients: Array.from(stats.values())
      .filter(s => s.isBlocked)
      .length,
    topRequesters: Array.from(stats.entries())
      .sort((a, b) => b[1].requestCount - a[1].requestCount)
      .slice(0, 10)
  })
}
```

### 2. Health Check Endpoint:

```typescript
// app/api/health/route.ts

export async function GET() {
  const checks = {
    timestamp: new Date().toISOString(),
    status: 'ok',
    redis: false,
    api: false
  }

  // تحقق من Redis
  try {
    if (redis) {
      await redis.ping()
      checks.redis = true
    }
  } catch (error) {
    checks.status = 'degraded'
  }

  // تحقق من Site API
  try {
    const response = await fetch(
      `${process.env.SITE_API_BASE_URL}/health`,
      { timeout: 5000 }
    )
    checks.api = response.ok
  } catch (error) {
    checks.status = 'degraded'
  }

  return Response.json(checks, {
    status: checks.status === 'ok' ? 200 : 503
  })
}
```

### 3. Uptime Monitoring:
```bash
# استخدم خدمات مثل:
# - UptimeRobot (https://uptimerobot.com/)
# - Pingdom (https://www.pingdom.com/)
# - Better Uptime (https://betteruptime.com/)

# راقب:
https://projects.alkafeel.net/api/health
```

---

## 🛡️ Security Best Practices

### 1. API Token Security:
```typescript
// ✅ صحيح:
const token = process.env.SITE_API_TOKEN  // Server-side only

// ❌ خطأ:
const token = "hardcoded-token"           // Never!
const token = process.env.NEXT_PUBLIC_*   // Exposed to client!
```

### 2. Rate Limit Tuning:

```typescript
// للمواقع الصغيرة (< 10,000 زائر/يوم):
maxRequests: 20,        // 20 طلب
windowMs: 60 * 1000     // لكل دقيقة

// للمواقع المتوسطة (10k-100k زائر/يوم):
maxRequests: 60,        // 60 طلب
windowMs: 60 * 1000     // لكل دقيقة

// للمواقع الكبيرة (> 100k زائر/يوم):
maxRequests: 100,       // 100 طلب
windowMs: 60 * 1000     // لكل دقيقة
// + استخدم Redis + CDN
```

### 3. IP Headers Configuration:

```typescript
// في rate-limiter.ts
function getClientIP(request: Request): string {
  // الأولوية حسب الـ Infrastructure:
  
  // Cloudflare:
  const cfIP = request.headers.get('cf-connecting-ip')
  if (cfIP) return cfIP
  
  // AWS CloudFront:
  const awsIP = request.headers.get('cloudfront-viewer-address')
  if (awsIP) return awsIP?.split(':')[0] || ''
  
  // Nginx/Apache:
  const forwardedFor = request.headers.get('x-forwarded-for')
  if (forwardedFor) return forwardedFor.split(',')[0].trim()
  
  // Direct:
  const realIP = request.headers.get('x-real-ip')
  if (realIP) return realIP
  
  return 'unknown'
}
```

### 4. HTTPS Only:

```typescript
// middleware.ts
export function middleware(request: NextRequest) {
  // أجبر HTTPS في Production
  if (
    process.env.NODE_ENV === 'production' &&
    request.headers.get('x-forwarded-proto') !== 'https'
  ) {
    return NextResponse.redirect(
      `https://${request.headers.get('host')}${request.nextUrl.pathname}`,
      301
    )
  }
  
  return NextResponse.next()
}
```

---

## 🚀 خطوات النشر

### الخطوة 1: Build محلي
```bash
# تأكد من عدم وجود أخطاء:
npm run build

# اختبر Production Build محلياً:
npm run start
```

### الخطوة 2: Environment Variables
```bash
# في Vercel Dashboard:
# Settings → Environment Variables

# أضف جميع المتغيرات:
OPENAI_API_KEY=xxx
SITE_API_BASE_URL=xxx
SITE_API_TOKEN=xxx
SITE_DOMAIN=xxx
REDIS_URL=xxx (اختياري)
```

### الخطوة 3: Deploy
```bash
# باستخدام Vercel CLI:
vercel --prod

# أو Git Push:
git push origin main  # إذا ربطت Vercel بـ GitHub
```

### الخطوة 4: Verification
```bash
# 1. تحقق من Health:
curl https://projects.alkafeel.net/api/health

# 2. اختبر Chat:
curl -X POST https://projects.alkafeel.net/api/chat/site \
  -H "Content-Type: application/json" \
  -H "Origin: https://projects.alkafeel.net" \
  -d '{"messages":[{"role":"user","content":"اعرض آخر المشاريع"}]}'

# 3. اختبر Rate Limiting:
# استخدم script من SECURITY-TESTING-GUIDE.md

# 4. اختبر CORS:
curl -X POST https://projects.alkafeel.net/api/chat/site \
  -H "Origin: https://evil.com" \
  -v
# المتوقع: لا CORS headers
```

---

## 📈 Post-Deployment Monitoring

### اليوم الأول:
- [ ] تحقق من Logs كل ساعة
- [ ] راقب Rate Limit blocks
- [ ] تحقق من Response Times
- [ ] راجع Security Issues logs

### الأسبوع الأول:
- [ ] تحليل Usage Patterns
- [ ] ضبط Rate Limits حسب الحاجة
- [ ] مراجعة Top IPs
- [ ] تحديد Potential Abusers

### شهرياً:
- [ ] مراجعة Security Logs
- [ ] تحديث Dependencies
- [ ] Performance Optimization
- [ ] Backup Verification

---

## 🐛 Troubleshooting

### مشكلة: Rate Limiting لا يعمل
```bash
# تحقق من IP Detection:
curl -X POST https://your-site.com/api/chat/site \
  -v 2>&1 | grep "X-Forwarded-For"

# الحل: تأكد من CDN/Proxy يمرر Real IP Headers
```

### مشكلة: CORS Errors
```bash
# تحقق من Origin Header:
curl -X OPTIONS https://your-site.com/api/chat/site \
  -H "Origin: https://your-domain.com" \
  -v

# الحل: تأكد من ALLOWED_ORIGINS يحتوي على الـ Domain الصحيح
```

### مشكلة: Redis Connection Failed
```bash
# تحقق من الاتصال:
redis-cli -u $REDIS_URL ping

# الحل: تحقق من REDIS_URL و Firewall rules
```

### مشكلة: API Timeouts
```typescript
// زد الـ Timeout في site-api-service.ts:
const API_TIMEOUT_MS = 30000  // 30 ثانية بدلاً من 15

// أو قلل عدد المحاولات:
const MAX_RETRIES = 1  // محاولة واحدة إضافية فقط
```

---

## 📚 الموارد

### الوثائق الداخلية:
- [PHASE-1-SYSTEM-PROMPTS.md](PHASE-1-SYSTEM-PROMPTS.md)
- [PHASE-2-FUNCTION-CALLING.md](PHASE-2-FUNCTION-CALLING.md)
- [PHASE-3-NO-HALLUCINATION.md](PHASE-3-NO-HALLUCINATION.md)
- [PHASE-4-SECURITY.md](PHASE-4-SECURITY.md)
- [SECURITY-TESTING-GUIDE.md](SECURITY-TESTING-GUIDE.md)

### الأدوات:
- Vercel: https://vercel.com/docs
- Redis: https://redis.io/docs/
- Upstash: https://docs.upstash.com/
- Logtail: https://betterstack.com/docs/logs/

### Security:
- OWASP Top 10: https://owasp.org/www-project-top-ten/
- Content Security Policy: https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP
- Rate Limiting: https://datatracker.ietf.org/doc/html/rfc6585

---

## ✅ Checklist النهائي

### قبل Production:
- [ ] جميع الاختبارات نجحت
- [ ] Environment Variables مضبوطة
- [ ] Redis جاهز (اختياري)
- [ ] Logging System مُفعّل
- [ ] Health Check Endpoint يعمل
- [ ] CORS مضبوط
- [ ] HTTPS مُفعّل

### في Production:
- [ ] Deploy نجح
- [ ] Health Check يرد 200
- [ ] Chat Endpoint يعمل
- [ ] Rate Limiting يعمل
- [ ] CORS يمنع Origins غير مسموحة
- [ ] Security Headers موجودة

### Post-Production:
- [ ] Monitoring مُفعّل
- [ ] Alerts مضبوطة
- [ ] Logs تُسجل بشكل صحيح
- [ ] Performance ضمن المقبول

---

**جاهز للنشر! 🎉🚀✨**
