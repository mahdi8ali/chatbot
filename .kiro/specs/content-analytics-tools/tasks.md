# Implementation Plan: أدوات تحليل المحتوى (content-analytics-tools)

## Overview

تُبنى الميزة بشكل تدرّجي وقابل للعكس: نبدأ بالأنواع المشتركة والدالة النقية `resolvePeriod`
والمساعدات الداخلية (خالية من قاعدة البيانات وقابلة للاختبار مباشرةً)، ثم دوال التجميع عبر
SQL معلّم، ثم تسجيل الأدوات في `site-tools-definitions.ts`، ثم توجيهها في
`function-calling-handler.ts` عبر فروع early-return (على نمط `search_projects_db`)، وأخيراً
نقطة تحقق للبناء والفحص. كل خطوة تبني على سابقتها وتنتهي بربط الكود ضمن خط الأنابيب القائم
دون كود معلّق أو غير مُدمج.

**اللغة:** TypeScript (كما في التصميم والشيفرة القائمة).

**بيئة الاختبار:** موجودة مسبقاً (`jest.config.js` + `ts-jest` + `fast-check` +
مجلد `lib/server/__tests__`) من مواصفة سابقة — **يُعاد استخدامها ولا تُنشأ من جديد**.
تُشغَّل الاختبارات بنمط تشغيل مفرد: `npm run test:run` (أي `jest --ci --runInBand`) وليس وضع المراقبة (watch).

## Tasks

- [x] 1. تأسيس الأنواع المشتركة وأشكال النتائج
  - [x] 1.1 إنشاء `lib/server/analytics-service.ts` وتعريف الأنواع
    - إنشاء الملف الجديد `lib/server/analytics-service.ts`.
    - تعريف وتصدير الأنواع: `PeriodSpec`، `ResolvedWindow`، `Granularity`، `AnalyticsBasis`.
    - تعريف وتصدير أشكال النتائج: `CountMentionsResult`، `TimelineResult`، `TopTopicsResult`، `CountNewsResult`.
    - ملاحظة: التأكد من وجود بيئة الاختبار القائمة (`jest.config.js`, `ts-jest`, `fast-check`, `lib/server/__tests__`) وإعادة استخدامها دون إنشاء جديد.
    - _Requirements: 1.4, 2.4, 3.4, 4.3, 6.2, 6.3_

- [x] 2. تنفيذ مُحلّل الفترة الزمنية (Period Resolver) واختباره
  - [x] 2.1 تنفيذ الدالة النقية `resolvePeriod(spec, now)`
    - الدالة حتمية تعتمد على `now` المُمرَّرة فقط (لا استدعاء داخلي لـ `Date.now`).
    - أولوية الحلّ: `from`/`to` الصريحة ثم `lastDays` ثم `period`.
    - `from` → بداية اليوم `00:00:00`، `to` → نهاية اليوم `23:59:59`.
    - `period`: `day`=اليوم، `week`=7 أيام، `month`=30، `quarter`=90، `year`=365، `all`=`{null,null}`.
    - قصّ (clamp) `lastDays` ضمن `[1, 3650]`.
    - النافذة الفارغة (`from > to`) تُنتج `label` توضيحياً؛ القيم غير الصالحة تعود لافتراضي آمن (شهر) مع تحذير.
    - تضمين `label` عربي بشري للنافذة.
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 7.5, 8.2_

  - [x]* 2.2 اختبار خاصية (property-based) لحتمية `resolvePeriod`
    - **Property 1: حتمية مُحلّل الفترة**
    - **Validates: Requirements 5.1**
    - استخدام `fast-check`: لأي `spec` و`now` ثابتة، استدعاءان متتاليان يُنتجان نفس `ResolvedWindow`.

  - [x]* 2.3 اختبار خاصية (property-based) لتقييد الحدود في `resolvePeriod`
    - **Property 5: تقييد الحدود**
    - **Validates: Requirements 7.5, 5.3**
    - التحقق أن `lastDays` بعد الحلّ يبقى ضمن `[1, 3650]` مهما كانت قيمة المُدخل.

  - [x]* 2.4 اختبار خاصية (property-based) للنافذة الفارغة في `resolvePeriod`
    - **Property 6: النافذة الفارغة**
    - **Validates: Requirements 8.1, 8.2**
    - عند `from > to` يُنتج المُحلّل `label` يوضّح غياب البيانات (تمهيداً لقصر دائرة الاستعلام).

  - [x]* 2.5 اختبارات وحدة لكل أنماط الفترة في `resolvePeriod`
    - تغطية `day/week/month/quarter/year/all`، `lastDays`، `from`/`to` الصريحة، وأولوية الحلّ عند التعارض.
    - _Requirements: 5.2, 5.4, 5.5, 5.6, 5.7_

- [x] 3. تنفيذ المساعدات الداخلية للمطابقة وبناء الاستعلام واختبارها
  - [x] 3.1 تنفيذ `escapeLike` و`buildLikeTerms`
    - `escapeLike` يهرّب المحارف `%` و`_` و`\`.
    - `buildLikeTerms` يطبّع النص العربي الخفيف (تشكيل/تطويل/توحيد الحروف) ويعيد أنماطاً بصيغة `"%" + escapeLike(term) + "%"`.
    - _Requirements: 7.3_

  - [x] 3.2 تنفيذ `windowClause` و`matchClause` وخريطة `granularity → DATE_FORMAT`
    - `windowClause(w)` يعيد `{ sql, params }` لشرط النافذة الزمنية (`created_at >= ?` / `<= ?`).
    - `matchClause(query)` يعيد `{ sql, params }` لمطابقة `title`/`content` عبر `LIKE`.
    - خريطة داخلية ثابتة: `day → '%Y-%m-%d'`، `week → '%x-W%v'`، `month → '%Y-%m'` مع قائمة بيضاء للـ enum.
    - _Requirements: 2.2, 7.1, 7.2, 7.4_

  - [x]* 3.3 اختبار خاصية (property-based) لسلامة المعاملات في `windowClause`/`matchClause`
    - **Property 3: سلامة المعاملات**
    - **Validates: Requirements 7.1, 7.2**
    - التحقق أن عدد علامات `?` في `sql` يساوي طول `params` لأي مُدخل.

  - [x]* 3.4 اختبارات وحدة لـ `escapeLike`/`buildLikeTerms` وخريطة الحبيبة
    - التحقق من تهريب `% _ \`، والتطبيع العربي، ورفض قيم `granularity` خارج القائمة البيضاء (استخدام الافتراضي `month`).
    - _Requirements: 7.3, 7.4, 10.3_

- [x] 4. نقطة تحقق — التأكد من نجاح اختبارات الطبقة النقية
  - تشغيل `npm run test:run` والتأكد من نجاح اختبارات `resolvePeriod` والمساعدات الداخلية، وطرح الأسئلة عند وجود إشكال.

- [x] 5. تنفيذ دوال التجميع عبر SQL معلّم في `analytics-service.ts`
  - [x] 5.1 تنفيذ `countMentions`
    - `COUNT(*)` كامل عبر `getPool().execute` مع `active = 1 AND deleted_at IS NULL` وشرط النافذة والمطابقة.
    - قصر دائرة النافذة الفارغة: عند `from > to` يعيد `total: 0` دون استعلام.
    - عيّنة اختيارية عند `sample=true`: حتى 5 صفوف مرتّبة تنازلياً حسب `created_at` مع `id`/`title`/`created_at`/`url` و`LIMIT 5` ثابت.
    - رفض `query` الفارغ بنتيجة فشل واضحة، وتضمين `window` و`basis`.
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.1, 6.2, 6.3, 7.1, 7.6, 8.1, 10.2, 11.2_

  - [x] 5.2 تنفيذ `mentionsTimeline`
    - `GROUP BY DATE_FORMAT(created_at, ?)` مع نمط مختار من الخريطة الثابتة حسب الحبيبة، مرتّب تصاعدياً.
    - `granularity` خارج القائمة البيضاء → افتراضي `month` مع تحذير.
    - تضمين `window`، `granularity`، `basis`؛ وقصر دائرة النافذة الفارغة.
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 7.1, 7.4, 7.6, 8.1, 10.3_

  - [x] 5.3 تنفيذ `topTopics`
    - `GROUP BY category_id` مرتّب تنازلياً حسب `count`، البُعد الافتراضي `category`.
    - قصّ `limit` ضمن `[1, 20]` قبل التمرير؛ تصفية اختيارية على `section`؛ تضمين `window`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 7.1, 7.5, 7.6_

  - [x] 5.4 تنفيذ `countNews`
    - `COUNT(*)` ضمن النافذة مع تصفية `category_id` اختيارية؛ تضمين `window` و`category_id` (أو `null`).
    - قصر دائرة النافذة الفارغة، ومعالجة فشل قاعدة البيانات بـ `{ success:false, error }`.
    - _Requirements: 4.1, 4.2, 4.3, 7.1, 7.6, 8.1, 10.1_

  - [x]* 5.5 اختبار SQL بـ pool وهمي (mock) لـ `countMentions`/`countNews`/`topTopics`
    - تمرير pool وهمي واعتراض `execute` للتحقق من نصّ SQL المُولَّد ومصفوفة المعاملات (تطابق `?`، القائمة البيضاء، القصّ) دون قاعدة بيانات حقيقية.
    - التحقق أن كل استعلام يتضمّن `active = 1 AND deleted_at IS NULL`.
    - _Requirements: 7.1, 7.2, 7.4, 7.5, 7.6_

  - [x]* 5.6 اختبار خاصية (property-based) لانتظام الأعداد الزمنية في `mentionsTimeline`
    - **Property 2: انتظام الأعداد الزمنية**
    - **Validates: Requirements 2.3**
    - بـ pool وهمي يعيد دلاءً معلومة: التحقق أن `Σ buckets.count === total` لنفس النافذة والاستعلام.

  - [x]* 5.7 اختبارات وحدة لقصر دائرة النافذة الفارغة ومعالجة الأخطاء
    - التحقق أن `from > to` يعيد `total: 0` دون استدعاء `execute`، وأن فشل الاتصال يعيد `{ success:false }`.
    - **Property 6: النافذة الفارغة**
    - _Requirements: 8.1, 8.2, 10.1, 10.2_

- [x] 6. نقطة تحقق — التأكد من نجاح اختبارات طبقة التجميع
  - تشغيل `npm run test:run` والتأكد من نجاح اختبارات دوال SQL (mock)، وطرح الأسئلة عند وجود إشكال.

- [x] 7. تسجيل الأدوات في `lib/server/site-tools-definitions.ts`
  - إضافة الثوابت الأربعة: `TOOL_COUNT_MENTIONS`، `TOOL_MENTIONS_TIMELINE`، `TOOL_TOP_TOPICS`، `TOOL_COUNT_NEWS` بمخططاتها كما في التصميم.
  - إضافتها إلى مصفوفة `ALL_SITE_TOOLS`.
  - إضافة أسمائها (`count_mentions`, `mentions_timeline`, `top_topics`, `count_news`) إلى `ALLOWED_TOOL_NAMES` (فتُشتقّ تلقائياً في `AllowedToolName` وتُقبل في `isAllowedTool`).
  - _Requirements: 9.1, 9.2_

- [x] 8. توجيه الأدوات في `lib/server/function-calling-handler.ts`
  - [x] 8.1 إضافة فروع early-return في `processToolCall`
    - استيراد `countMentions`, `mentionsTimeline`, `topTopics`, `countNews` من `./analytics-service`.
    - إضافة فروع لكل أداة تحليلية بعد فرع `search_projects_db` وقبل `executeToolByName` (نفس النمط).
    - تسلسل النتيجة عبر `JSON.stringify` مباشرةً دون المرور على `cleanResultForGPT`/`cleanProject`.
    - _Requirements: 9.3, 9.4_

  - [x]* 8.2 اختبار ربط الأدوات في `function-calling-handler.test.ts`
    - التحقق أن الأدوات الأربع موجودة في `ALLOWED_TOOL_NAMES` وأن `isAllowedTool` يعيد `true` لكلٍّ منها.
    - التحقق أن `processToolCall` يعيد JSON صالحاً لأداة تحليلية (مع mock لـ `analytics-service`).
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

- [x] 9. توثيق توصية الفهرسة (خطوة قاعدة بيانات غير حاصرة)
  - إضافة تعليق توثيقي في رأس `analytics-service.ts` يوصي بفهرس `idx_news_created_at` على `created_at` (ويفضّل المركّب `(active, deleted_at, created_at)`) — خطوة تشغيلية غير مُلزمة للكود.
  - _Requirements: 11.1_

- [x] 10. نقطة تحقق نهائية — الفحص والبناء
  - تشغيل `npm run lint` ثم `npm run build` ثم `npm run test:run` والتأكد من خلوّها من الأخطاء، وطرح الأسئلة عند وجود إشكال.

## Notes

- المهام المعلّمة بـ `*` اختبارية واختيارية ويمكن تخطّيها لأجل MVP أسرع؛ المهام غير المعلّمة أساسية تُنفَّذ.
- الاختبارات تُشغَّل بنمط تشغيل مفرد `npm run test:run` (`jest --ci --runInBand`) وليس وضع المراقبة.
- بيئة الاختبار (`jest.config.js`, `ts-jest`, `fast-check`, `lib/server/__tests__`) قائمة ويُعاد استخدامها.
- اختبارات الوحدة تغطّي أمثلة وحالات الحافة، واختبارات الخاصية تغطّي الخصائص الكونية (Properties 1, 2, 3, 5, 6).
- الميزة قابلة للعكس بالكامل: حذف `analytics-service.ts` وإزالة الإدخالات الأربعة والفروع الأربعة يعيد النظام لحالته السابقة.
- اختبارات SQL الفعلية على قاعدة MySQL حيّة اختيارية وتُوسَم منفصلة؛ الاختبارات المُدرجة هنا تعتمد pool وهمياً (mock) دون قاعدة بيانات حقيقية.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "3.2"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "3.3", "3.4"] },
    { "id": 3, "tasks": ["5.1", "5.2", "5.3", "5.4"] },
    { "id": 4, "tasks": ["5.5", "5.6", "5.7", "7.1"] },
    { "id": 5, "tasks": ["8.1", "9.1"] },
    { "id": 6, "tasks": ["8.2"] }
  ]
}
```
