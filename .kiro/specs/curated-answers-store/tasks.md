# Implementation Plan: مخزن الإجابات المنسّقة (curated-answers-store)

## Overview
## نظرة عامة

تحوّل هذه الخطة تصميم الميزة إلى خطوات برمجية تراكمية بلغة **TypeScript** (مطابقة للكود القائم).
المبدأ: تغييرات **إضافية وقابلة للعكس** فقط، تُبنى كل خطوة على سابقتها، وتنتهي بالربط في `route.ts`
دون كود معلّق أو غير مُدمج. نُعيد استخدام بيئة الاختبار القائمة (**Jest + ts-jest + fast-check** تحت
`lib/server/__tests__/`) — لا إعادة إنشاء لها. كل مهمة مربوطة بمتطلّباتها (R1–R13) وبخصائص الصحّة
(Property N) من وثيقة التصميم.

> ملاحظة بيئة: أوامر الاختبار المتاحة `npm run test` و`npm run test:run` (= `jest --ci --runInBand`).
> نتجنّب `next build` الكامل في نقاط التحقّق لأنه بطيء بسبب تسخين قاعدة البيانات؛ نكتفي بالاختبارات
> و`tsc --noEmit` + `npm run lint`.

## Tasks
## المهام

- [ ] 1. تصدير `normalizeArabic` من `faq.ts` (تغيير أدنى قابل للعكس)
  - [ ] 1.1 جعل `normalizeArabic` دالة مُصدَّرة في `lib/server/faq.ts`
    - تحويل `function normalizeArabic` (الخاصّة حالياً) إلى `export function normalizeArabic`
    - عدم تغيير منطق التطبيع إطلاقاً (توحيد الهمزات/الألف/التاء المربوطة/«أبو↔أبي»/«فاضل↔فضل»)
    - إبقاء `searchFAQ` و`FAQ_ENTRIES` دون تغيير (يبقى الملف مصدر بذرة واختبار)
    - _Requirements: 5.1_

- [ ] 2. بناء خدمة الإجابات المنسّقة `lib/server/curated-service.ts`
  - [ ] 2.1 إنشاء النوع والمجمّع المعزول و`ensureTable`
    - إنشاء ملف `lib/server/curated-service.ts` وتعريف الواجهة `CuratedEntry`
    - إضافة مجمّع اتصال خاص على نمط `chat-logger.ts` (استيراد `getDatabaseConfig`، دعم `socketPath` عبر `process.env.DB_SOCKET`، قاعدة `process.env.LOGS_DB_NAME || ... || "local_chatbot_logs"`، `connectionLimit: 3`)
    - كتابة `ensureTable()` مع حارس `tableReady` تنفّذ DDL الجدول عبر `CREATE TABLE IF NOT EXISTS curated_answers (...)` بما يشمل فهرس `idx_active_priority (active, priority)` و`idx_category`
    - قصر عمليات القاعدة على `curated_answers` وعلى المجمّع المعزول حصراً (لا `getPool` المحتوى)
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 11.2_
    - **يخدم: Property 3**

  - [ ] 2.2 إضافة `mapRow` و`loadEntries` والكاش الداخلي بـ TTL
    - كتابة `mapRow(row)` مع `JSON.parse` آمن لحقل `patterns`: عند فشل التحليل تُسقط المدخلة المعطوبة فقط (تُعيد `null`) دون إسقاط بقيّة التحميل
    - كتابة `loadEntries()` مع كاش داخلي (`cache`, `cacheLoadedAt`) و`CACHE_TTL_MS` بين 5 و10 دقائق؛ إعادة الكاش داخل TTL دون استعلام
    - عند انتهاء TTL أو الكاش الفارغ: `SELECT ... WHERE active = 1 ORDER BY priority DESC, id ASC` ثمّ `map(mapRow).filter(Boolean)` وتحديث الطابع الزمني
    - استخدام استعلامات مُعاملة (`db.execute`) حصراً
    - _Requirements: 3.2, 9.3, 10.1, 10.2, 10.3, 10.4, 11.1_
    - **يخدم: Property 1, Property 8**

  - [ ] 2.3 كتابة بذرة `seed()` idempotent
    - `seed()` تستدعي `ensureTable()` ثمّ تتحقّق `SELECT COUNT(*)`؛ إن كان المخزن غير فارغ تعود دون أي إدراج
    - عند الفراغ: إدراج مداخل الفئة `faq` من `FAQ_ENTRIES` (أولوية 0)، ثمّ مدخلة موقف التراويح من الفئة `stance` بأولوية أعلى (10) مع نصّ الموقف المنقول من `system-prompts.ts`
    - تخزين `patterns` كمصفوفة JSON نصّية عبر `JSON.stringify(e.patterns)` باستعلامات مُعاملة
    - _Requirements: 2.1, 2.2, 2.3, 2.4_
    - **يخدم: Property 3**

  - [ ] 2.4 كتابة `matchCurated(userMessage)`
    - استيراد `normalizeArabic` من `./faq` وإعادة استخدامه على الرسالة وعلى الأنماط
    - حارس الطول: `MIN_LENGTH = 5`؛ إن كانت الرسالة فارغة/مسافات أو طولها بعد التطبيع < 5 تُعاد `null`
    - `loadEntries()` (مرتّبة تنازلياً بالأولوية) ثمّ فحص تطابق حدود الكلمة عبر regex `(^|\s)pattern($|\s)` مع تهريب الرموز الخاصّة
    - إعادة أوّل مدخلة مطابِقة (الأعلى أولوية) ⇒ حتمية وأسبقية `stance` على `faq`
    - _Requirements: 3.1, 3.3, 4.1, 4.2, 5.2, 5.3, 6.1, 6.2, 7.1, 7.2_
    - **يخدم: Property 1, Property 4, Property 5, Property 6, Property 7**

  - [ ]* 2.5 اختبار خاصّية: حتمية المطابقة
    - ملف `lib/server/__tests__/curated-match.determinism.property.test.ts` بكاش مُثبَّت/مُحقَن
    - **Property 1: حتمية المطابقة** — نفس الرسالة عبر استدعاءين متتاليين تُعيد المدخلة نفسها
    - **Validates: Requirements 3.1, 3.2**

  - [ ]* 2.6 اختبار خاصّية: حارس الطول الأدنى
    - ملف `lib/server/__tests__/curated-match.length-guard.property.test.ts`
    - **Property 4: حارس الطول** — كل رسالة طولها بعد التطبيع < 5 (وكذلك الفارغة/المسافات) تُعيد `null`
    - **Validates: Requirements 4.1, 4.2**

  - [ ]* 2.7 اختبار خاصّية: التطبيع العربي المتّسق
    - ملف `lib/server/__tests__/curated-match.normalization.property.test.ts`
    - **Property 5: تطبيع عربي متّسق** — رسالتان تنتجان النصّ نفسه بعد التطبيع تُعطيان نتيجة المطابقة نفسها («أبو↔أبي»، «فاضل↔فضل»، الهمزات/التاء المربوطة)
    - **Validates: Requirements 5.2, 5.3**

  - [ ]* 2.8 اختبار خاصّية: مطابقة حدود الكلمة
    - ملف `lib/server/__tests__/curated-match.word-boundary.property.test.ts`
    - **Property 6: تطابق حدود الكلمة** — النمط ككلمة مستقلة يُطابق؛ النمط كجزء من كلمة أطول لا يُطابق (منع الإيجابيات الكاذبة)
    - **Validates: Requirements 6.1, 6.2**

  - [ ]* 2.9 اختبار خاصّية: أولوية المواقف على الأسئلة الشائعة
    - ملف `lib/server/__tests__/curated-match.priority.property.test.ts`
    - **Property 7: أولوية المواقف** — رسالة تطابق `stance` و`faq` معاً تُعيد `stance` (الأعلى أولوية)
    - **Validates: Requirements 7.1, 7.2**

  - [ ]* 2.10 اختبار وحدة: تحليل JSON آمن في `mapRow`
    - ملف `lib/server/__tests__/curated-service.map-row.test.ts`
    - **Property 8: التدهور الآمن (جزء التحليل)** — صفّ بحقل `patterns` غير صالح يُسقط وحده وتُحمَّل بقيّة الصفوف
    - **Validates: Requirements 9.3**

  - [ ]* 2.11 اختبار: idempotency للبذرة (بمجمّع مُحاكى)
    - ملف `lib/server/__tests__/curated-service.seed.test.ts` بمحاكاة `mysql2/promise`
    - تنفيذ `seed()` مرّتين على جدول مبذور (COUNT>0) ⇒ لا `INSERT` إضافي (لا صفوف مكرّرة)
    - **Property 3: إضافي فقط على القاعدة**
    - **Validates: Requirements 2.2**

- [ ] 3. نقطة تحقّق — تأكّد من نجاح اختبارات الخدمة
  - نفّذ `npm run test:run`، وتأكّد من نجاح جميع اختبارات الخدمة، واسأل المستخدم عند ظهور أي إشكال.

- [ ] 4. ربط `route.ts` مع `matchCurated`
  - [ ] 4.1 استبدال كتلة `searchFAQ` بـ `matchCurated` داخل `try/catch`
    - في `app/api/chat/site/route.ts`: استبدال استيراد/استدعاء `searchFAQ` باستيراد `matchCurated` من `@/lib/server/curated-service`
    - داخل كتلة `if (lastMessage.role === "user")` وقبل `classifyScope`: `await matchCurated(...)` ضمن `try/catch`؛ عند الخطأ يُسجَّل عبر `console.error` وتُضبط النتيجة على `null` والمتابعة للمسار الطبيعي
    - الحفاظ التامّ على السلوك: `createPendingLog` → `ReadableStream` يبثّ النصّ ثمّ `\n__VALID_IDS__:` ثمّ `close()` → `updateChatLog(..., wasToolUsed: false)` → `Response` بترويسات `securityHeaders` + `Content-Type: text/plain; charset=utf-8` + `X-Chat-Log-Id`
    - إلحاق سطر المصدر ورابط «اقرأ المزيد» عند توفّر `curated.url`؛ إبقاء الكتلة قبل حارس النطاق وتدفّق الأدوات
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 9.1, 9.2_
    - **يخدم: Property 2, Property 8**

  - [ ]* 4.2 اختبار تكامل: قصر المسار دون OpenAI
    - ملف `lib/server/__tests__/curated-route.short-circuit.integration.test.ts` على نمط `route.site.integration.test.ts` (محاكاة `chat-logger`، `openai`، `curated-service`)
    - عند تطابق `matchCurated`: عدم استدعاء `openai.chat.completions.create`، بثّ النصّ + `\n__VALID_IDS__:`، `updateChatLog(was_tool_used=false)`، وترويسات الأمان + `Content-Type` + `X-Chat-Log-Id`
    - **Property 2: قصر المسار ⇒ لا OpenAI**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

  - [ ]* 4.3 اختبار تكامل: التدهور الآمن عند فشل الخدمة
    - ملف `lib/server/__tests__/curated-route.graceful.integration.test.ts`
    - محاكاة رمي `matchCurated` استثناءً ⇒ المتابعة إلى `classifyScope`/تدفّق الأدوات دون رمي خطأ للمستخدم، مع تسجيل `console.error`
    - **Property 8: التدهور الآمن**
    - **Validates: Requirements 9.1, 9.2**

- [ ] 5. تنظيف `system-prompts.ts` مع الإبقاء على القاعدة العامة
  - [ ] 5.1 حذف كتلة استثناء التراويح
    - إزالة كتلة «## ⛔ استثناء ثابت — صلاة التراويح» بالكامل من `SITE_BOT_SYSTEM_PROMPT` في `lib/server/system-prompts.ts`
    - الإبقاء دون تعديل على القاعدة العامة «السرد والشرح من النتائج حصراً»
    - _Requirements: 12.1, 12.2_
    - **يخدم: Property 9**

  - [ ]* 5.2 اختبار الحفاظ على القاعدة العامة
    - ملف `lib/server/__tests__/curated-system-prompt.preservation.test.ts` على نمط `prayer-service.preservation.test.ts`
    - التحقّق أنّ `SITE_BOT_SYSTEM_PROMPT` لم يعد يحوي كتلة التراويح، وأنه **لا يزال** يحوي «السرد والشرح من النتائج حصراً»
    - **Property 9: القابلية للعكس / تنظيف الموجّه**
    - **Validates: Requirements 12.1, 12.2**

- [ ] 6. نقطة تحقّق نهائية — النوع والفحص الساكن
  - نفّذ `npm run test:run` ثمّ `npx tsc --noEmit` ثمّ `npm run lint`؛ تجنّب `next build` الكامل (بطيء بسبب تسخين DB). تأكّد من نجاح الجميع، واسأل المستخدم عند ظهور أي إشكال.

## Notes
## ملاحظات

- المهام المُعلّمة بـ `*` اختيارية (اختبارات) ويمكن تخطّيها لـ MVP أسرع، لكنها تُغطّي خصائص الصحّة.
- كل مهمة تشير إلى متطلّبات محدّدة (R1–R13) وإلى خاصّية الصحّة التي تخدمها لأغراض التتبّع.
- تُعاد استخدام بيئة الاختبار القائمة (Jest + ts-jest + fast-check) — لا إنشاء بيئة جديدة.
- جميع التغييرات إضافية وقابلة للعكس: جدول واحد عبر `CREATE TABLE IF NOT EXISTS`، وإبقاء `faq.ts`/`searchFAQ` كمصدر بذرة، بلا `ALTER`/`DROP`.
- الاختبارات لا تلمس شبكة أو قاعدة بيانات حقيقية (مجمّع/`openai`/`chat-logger` مُحاكاة).

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "5.1"] },
    { "id": 1, "tasks": ["2.2", "5.2"] },
    { "id": 2, "tasks": ["2.3", "2.10"] },
    { "id": 3, "tasks": ["2.4", "2.11"] },
    { "id": 4, "tasks": ["2.5", "2.6", "2.7", "2.8", "2.9", "4.1"] },
    { "id": 5, "tasks": ["4.2", "4.3"] }
  ]
}
```
