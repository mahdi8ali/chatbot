# Implementation Plan: لوحة الإدارة الموحّدة (admin-dashboard)

## Overview

خطة تنفيذ إضافية وقابلة للعكس ضمن تطبيق Next.js 14 (App Router) بلغة TypeScript/React. تُبنى الطبقات من الأسفل إلى الأعلى: وحدة المصادقة (`node:crypto` فقط) ← طبقة الخدمة والتحقّق ← مكوّنات UI المشتركة ← مسارات الـ API ← الحراسة بطبقتين (middleware + `requireAdmin`) ← صفحات القشرة والدخول والاستثناءات ← ضبط البيئة. كل خطوة تبني على سابقتها وتنتهي بربط المكوّنات، بلا شيفرة معلّقة.

القيود الملزمة عبر كل المهام:
- **إضافي وقابل للعكس فقط**: لا `ALTER`/`DROP`؛ جدول `curated_answers` يُستخدم كما هو (مُنشأ ومبذور مسبقاً)، والإنشاء عند الحاجة عبر `CREATE TABLE IF NOT EXISTS` القائم فقط.
- **بلا تبعيات جديدة**: المصادقة عبر `node:crypto` حصراً.
- **العزل**: كل استعلامات لوحة الإدارة إلى `local_chatbot_logs` عبر مجمّع الخدمة الخاص فقط.
- **بلا اختبارات جديدة**: بناءً على طلب المستخدم الصريح، لا تُكتب اختبارات تلقائية جديدة لهذه الميزة. التحقّق يقتصر على `npx tsc --noEmit` و`npx next lint`.

## Tasks

- [x] 1. وحدة المصادقة الأساسية (`node:crypto` فقط)
  - [x] 1.1 إنشاء `lib/server/admin-auth.ts`
    - `hashPassword` عبر scrypt مع ملح عشوائي يعيد `"saltHex:hashHex"`، و`verifyPassword` بمقارنة `timingSafeEqual` ثابتة الزمن مع إرجاع `false` بلا استثناء لأي صيغة مخزون مشوّهة
    - `createSession(username)` يعيد `"<payloadBase64url>.<signatureBase64url>"` بحمولة `{ sub, iat, exp }` و`exp = iat + TTL` (افتراضي 8 ساعات أو `ADMIN_SESSION_TTL_HOURS`)، و`verifySession` يتحقّق من HMAC-SHA256 بمقارنة ثابتة الزمن ويرفض العبث أو انتهاء `exp` بإرجاع `null`
    - `requireAdmin(req)` يقرأ كوكي `admin_session` من رأس الطلب ويعيد `Response 401 { error: "غير مصرّح" }` أو `null`، و`getAdminSession()` يقرأ الجلسة عبر `next/headers` cookies لمكوّنات الخادم
    - `lookupAdmin(username)` يقرأ `ADMIN_USERNAME`/`ADMIN_PASSWORD_HASH` (مغلق افتراضياً عند غياب البيئة)، وثابت `COOKIE_NAME = "admin_session"`
    - _Requirements: 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 6.10, 7.2, 7.3, 8.2, 8.3, 8.5_

  - [x] 1.2 إنشاء `scripts/gen-admin-hash.mjs`
    - أداة CLI لمرّة واحدة تقرأ كلمة المرور من `argv` وتطبع سطر `ADMIN_PASSWORD_HASH=saltHex:hashHex` عبر scrypt بنفس صيغة `hashPassword`
    - عدم تخزين أو طباعة كلمة المرور الصريحة
    - _Requirements: 6.3, 8.2_

- [x] 2. طبقة الخدمة والتحقّق من المدخلات
  - [x] 2.1 توسيع `lib/server/curated-service.ts` بطبقة التحوير
    - إضافة نوعي `CuratedInput` و`CuratedRow` (يشمل `updated_at` و`note`)، ودالة `mapRowFull` امتداداً لـ `mapRow` مع `JSON.parse` آمن يُسقط الصفوف المعطوبة
    - إضافة `getById` و`listAll` (ترتيب `priority DESC, updated_at DESC` عبر استعلام مباشر لا يمرّ بكاش المطابقة) و`create` و`update` (تحديث جزئي ديناميكي) و`setActive` و`remove`
    - كل عمليات الكتابة الناجحة تستدعي `refresh()`، وكل الاستعلامات مُعامَلة (`?`) مع `JSON.stringify(patterns)`، وحصر SQL داخل الخدمة
    - _Requirements: 3.1, 4.1, 4.2, 4.4, 4.5, 8.4, 9.1, 9.4, 9.5_

  - [x] 2.2 إنشاء مساعدات التحقّق `lib/server/curated-validation.ts`
    - `validateCuratedInput(body)` (دالة نقيّة) يفرض قواعد `category`/`patterns`/`answer`/`url`/`priority` برسائل عربية، وينظّف `patterns` بالتقليم وإسقاط الفارغ وإزالة التكرار، ويدعم التحقّق الجزئي لـ `PUT` مع رفض تفريغ حقل إلزامي
    - `parsePatterns(raw)` (دالة نقيّة) يحوّل نصاً مفصولاً بفواصل/أسطر جديدة إلى `string[]` مقلّمة خالية من الفراغ
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.9_

- [x] 3. مكوّنات UI المشتركة
  - [x] 3.1 إنشاء `app/[locale]/admin/_shared.tsx`
    - استخراج لوحة الألوان `C` و`thStyle`/`tdStyle`/`StatCard`/`Badge`/`EmptyState` من صفحة التحليلات، وإضافة `Toast` و`ConfirmDialog` بأسلوب النافذة المنبثقة القائم
    - RTL وخط `'Readex Pro'` للاتساق البصري التام
    - _Requirements: 1.4, 10.2, 10.3, 10.4_

- [x] 4. مسارات الـ API
  - [x] 4.1 إنشاء مساري المصادقة تحت `app/api/admin/auth/`
    - `login/route.ts` (POST): `lookupAdmin` + `verifyPassword` ثم `Set-Cookie: admin_session=<createSession(username)>; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<ttl>` وإرجاع `{ ok: true, username }`؛ عند الفشل `401 { error: "بيانات الدخول غير صحيحة" }` (رسالة موحّدة)
    - `logout/route.ts` (POST): مسح الكوكي بـ `Max-Age=0` بنفس السمات وإرجاع `{ ok: true }`
    - _Requirements: 6.1, 6.2, 6.11, 8.1, 8.5_

  - [x] 4.2 إنشاء مسارات `curated` وحراسة مسار التحليلات
    - `app/api/curated/route.ts`: GET (قائمة `{ entries }`) وPOST (إنشاء `201`) عبر الخدمة، مع `requireAdmin` والتحقّق قبل أي منطق و`400` للحمولة الفاسدة
    - `app/api/curated/[id]/route.ts`: PUT/PATCH/DELETE عبر الخدمة مع دلالات `404` للمُعرّف غير الموجود و`requireAdmin`
    - `app/api/curated/refresh/route.ts`: POST يستدعي `refresh()` ويعيد `{ refreshed: true }` مع `requireAdmin`
    - إضافة `requireAdmin` إلى `app/api/analytics/route.ts`، ولفّ كل الـ handlers بـ `try/catch` تعيد `500` مع `console.error`
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.3, 4.4, 7.2, 7.3, 10.1_

- [x] 5. الحراسة بطبقتين والقشرة
  - [x] 5.1 تعديل `middleware.ts` لحراسة صفحات الإدارة
    - حراسة `/[locale]/admin/**` (عدا `login`) عبر `verifySession`؛ عند غياب جلسة صالحة إعادة توجيه إلى `/[locale]/admin/login` مع مَعلمة `next`، مع إبقاء تحويل `/` → `/ar` القائم
    - التصريح بـ `runtime = "nodejs"` عند الحاجة لتوفّر `node:crypto`، وإبقاء المُطابِق مستثنياً `api`
    - _Requirements: 2.2, 7.1, 7.4, 7.5_

  - [x] 5.2 إنشاء قشرة الإدارة `app/[locale]/admin/layout.tsx`
    - تنقّل مُوجَّه بالبيانات من `ADMIN_SECTIONS` (عنصر لكل قسم) مع تمييز النشط عبر `usePathname()`، وترويسة تعرض الشعار واسم المستخدم عبر `getAdminSession()` وزر «تسجيل الخروج» (POST logout ثم توجيه للـ login)
    - RTL وخط `'Readex Pro'` ولوحة الألوان `C` من `_shared.tsx`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 2.3, 6.11_

- [x] 6. صفحات الإدارة
  - [x] 6.1 نقل التحليلات وإعادة توجيه المسار القديم
    - نقل مكوّن التحليلات إلى `app/[locale]/admin/page.tsx` (دون تغيير سلوكي، مع استهلاك `_shared.tsx`)
    - تحويل `app/[locale]/analytics/page.tsx` لإعادة التوجيه إلى `/[locale]/admin`
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 6.2 إنشاء صفحة تسجيل الدخول `app/[locale]/admin/login/page.tsx`
    - نموذج `username`/`password` (RTL، لوحة `C`) يرسل `POST /api/admin/auth/login`، ويعيد التوجيه إلى `next` أو `/{locale}/admin` عند النجاح، ويعرض الرسالة الموحّدة عند `401`
    - _Requirements: 6.1, 6.2, 7.6_

  - [x] 6.3 إنشاء صفحة الاستثناءات `app/[locale]/admin/exceptions/page.tsx`
    - جدول CRUD يعرض المفعّل وغير المفعّل، نموذج إضافة/تعديل منبثق، مفتاح تبديل التفعيل (PATCH)، حوار تأكيد قبل الحذف، وزر «تحديث الكاش»
    - `fetchList` عبر GET والطلبات تعتمد كوكي الجلسة تلقائياً؛ توست نجاح/خطأ وإعادة الجلب بعد الكتابة، وإعادة التوجيه للدخول عند `401`
    - _Requirements: 3.1, 7.6, 10.2, 10.3, 10.4, 10.5_

- [x] 7. ضبط البيئة
  - [x] 7.1 تحديث `.env.local.example`
    - إضافة `ADMIN_USERNAME` و`ADMIN_PASSWORD_HASH` و`ADMIN_SESSION_SECRET` و`ADMIN_SESSION_TTL_HOURS` مع تعليقات توضيحية، وكلّها بلا بادئة `NEXT_PUBLIC_`
    - _Requirements: 8.2, 8.3, 8.5_

- [x] 8. نقطة تحقّق نهائية
  - [x] 8.1 التحقّق من الأنواع والـ lint
    - تشغيل `npx tsc --noEmit` وإصلاح أي أخطاء أنواع
    - تشغيل `npx next lint` وإصلاح أي مخالفات
    - _Requirements: جميع المتطلّبات (تحقّق شامل)_

## Notes

- بناءً على طلب المستخدم الصريح، لا تتضمّن هذه الخطة مهام اختبارات تلقائية جديدة (وحدة/تكامل/خصائص). التحقّق يقتصر على فحص الأنواع والـ lint في المهمة 8.1.
- كل مهمة تشير إلى بنود متطلّبات محدّدة للتتبّع.
- الترتيب تصاعدي: الأساسات (المصادقة/الخدمة/التحقّق/UI المشترك) أولاً، ثم مسارات الـ API، ثم الحراسة والقشرة، ثم الصفحات، مع الربط النهائي بلا شيفرة معلّقة.
- جميع التغييرات إضافية وقابلة للعكس، ولا `ALTER`/`DROP`، والمصادقة عبر `node:crypto` بلا تبعيات جديدة.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "2.1", "2.2", "3.1", "7.1"] },
    { "id": 1, "tasks": ["4.1", "4.2", "5.1", "5.2"] },
    { "id": 2, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["8.1"] }
  ]
}
```
