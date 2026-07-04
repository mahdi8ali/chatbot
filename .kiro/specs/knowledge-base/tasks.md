# Implementation Plan: قاعدة المعرفة الخاصة (Private Knowledge Base)

## Overview

خطّة تنفيذ تدريجية لميزة قاعدة المعرفة على Next.js 14 (App Router) + TypeScript.
كل خطوة تبني على سابقتها وتنتهي بربط المكوّنات في مسار الشات ولوحة الإدارة، دون أي
شيفرة معلّقة. الميزة **إضافية وقابلة للعكس بالكامل**: جدول واحد في `local_chatbot_logs`
عبر `CREATE TABLE IF NOT EXISTS`، طبقة خدمة تحاكي `curated-service.ts`، واجهات إدارة
محمية بـ `requireAdmin`، ونقطة حقن واحدة في `app/api/chat/site/route.ts`.

بناءً على قرار المشروع (المتّسق مع spec لوحة الإدارة): **لا تُكتب اختبارات آلية جديدة**
لهذه الميزة. التحقّق يتمّ عبر `npx tsc --noEmit` و`npx next lint` في مهمّة نهائية واحدة.
كل الأنواع والمواصفات مأخوذة من `design.md`، وكل مرجع متطلّب يشير إلى بنود `requirements.md`.

## Tasks

- [ ] 1. طبقة الخدمة والتحقّق (الأساس)
  - [ ] 1.1 إنشاء `lib/server/kb-service.ts` (المجمّع المعزول + الأنواع + الكاش + البحث + CRUD)
    - إنشاء ملف `lib/server/kb-service.ts` يحاكي أنماط `lib/server/curated-service.ts`.
    - تعريف الأنواع المُصدَّرة: `KbHit`, `KbRow`, `KbInput`, `KbSearchOpts` كما في design.md.
    - إنشاء مجمّع اتصال `mysql2/promise` معزول خاص إلى `local_chatbot_logs` عبر `getDatabaseConfig` بحدّ `connectionLimit: 3`؛ عدم الوصول إلى `ka_db`/`alkafeel_projects`.
    - `ensureTable()`: `CREATE TABLE IF NOT EXISTS kb_articles` بالأعمدة `id, title, body, keywords, search_text, active, priority, note, created_at, updated_at`، مع فهرس `FULLTEXT ft_search (search_text) WITH PARSER ngram` وفهرس `idx_active_priority (active, priority)`؛ حارس `tableReady` لمنع التكرار؛ لا `ALTER`/`DROP`.
    - الكاش الداخلي: `cache`, `cacheLoadedAt`, `CACHE_TTL_MS = 5 * 60 * 1000`، ودالة `refresh()` التي تُبطل الكاش (`cache = null`).
    - الثوابت: `MIN_LENGTH = 5`, `DEFAULT_LIMIT = 3`, `CONFIDENCE_THRESHOLD = 4.0`, `SHORT_CIRCUIT_THRESHOLD = 12.0`.
    - `kbSearch(query, opts)`: تطبيع عبر `normalizeArabic` من `lib/server/faq.ts`؛ حارس `MIN_LENGTH` يُرجع `[]` بلا استعلام؛ استعلام `MATCH ... AGAINST(? IN NATURAL LANGUAGE MODE)` واحد مُعامَل؛ ترشيح بـ `CONFIDENCE_THRESHOLD` (أو `opts.minScore`)؛ ترتيب تنازلي `(score, priority)`؛ `LIMIT` مُقيَّد بين 1 و10 (افتراضي 3)؛ `mapHit` يُسقط الصفوف المعطوبة عند تعذّر تحليل `keywords`.
    - CRUD: `listAll`, `getById`, `create`, `update`, `setActive`, `remove` — كلها SQL مُعامَل (`?`)؛ `create`/`update` تشتقّ `search_text = normalizeArabic(title + " " + body + " " + keywords)` في الخدمة؛ كل عمليات الكتابة الناجحة تستدعي `refresh()`؛ `getById`/`update`/`setActive` تُعيد `null` عند غياب المُعرّف، و`remove` تُعيد `boolean`.
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6, 4.1, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 10.3, 11.1, 11.3, 12.1_

  - [ ] 1.2 إنشاء `lib/server/kb-validation.ts` (تحقّق نقيّ برسائل عربية)
    - إنشاء ملف `lib/server/kb-validation.ts` يحاكي أنماط `lib/server/curated-validation.ts`.
    - `validateKbInput(body, { partial })` دالة نقيّة تُعيد `{ ok, error?, value? }`: رفض `title` الفارغ برسالة «العنوان مطلوب»؛ رفض `body` الفارغ برسالة «نص المقالة مطلوب»؛ رفض `priority` غير الصحيح برسالة «الأولوية يجب أن تكون عدداً صحيحاً»؛ رفض `active` غير المنطقي برسالة «الحقل active يجب أن يكون قيمة منطقية».
    - في الوضع الجزئي (`partial`): رفض إفراغ الحقلين الإلزاميين `title` و`body`.
    - `parseKeywords(raw)` دالة نقيّة تُحوّل نصّاً مفصولاً بفواصل/أسطر إلى مصفوفة مع التقليم وإسقاط الفارغ وإزالة التكرار.
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.7_

- [ ] 2. واجهات الإدارة المحمية (Admin API)
  - [ ] 2.1 إنشاء `app/api/knowledge/route.ts` (GET/POST)
    - `export const dynamic = "force-dynamic"` و`export const runtime = "nodejs"`.
    - `GET`: أول سطر `const deny = requireAdmin(req); if (deny) return deny`؛ يستدعي `listAll()`؛ يُعيد `{ entries }` مع `Cache-Control: no-store`.
    - `POST`: `requireAdmin` أولاً؛ يقرأ body ويستدعي `validateKbInput`؛ يُعيد 400 عند فشل التحقّق دون تعديل الجدول؛ يستدعي `create(result.value)` ويُعيد 201.
    - `try/catch` يُعيد 500 مع تسجيل عبر `console.error`.
    - _Requirements: 6.6, 7.6, 8.1, 8.4, 8.6, 11.2_

  - [ ] 2.2 إنشاء `app/api/knowledge/[id]/route.ts` (PUT/PATCH/DELETE)
    - `dynamic = "force-dynamic"` و`runtime = "nodejs"`؛ كل معالج يبدأ بـ `requireAdmin`.
    - `PUT`: تحقّق جزئي عبر `validateKbInput(body, { partial: true })`؛ 400 عند الفشل؛ يستدعي `update(id, value)`؛ يُعيد 404 عند غياب المُعرّف.
    - `PATCH`: يستدعي `setActive(id, active)`؛ يُعيد 404 عند غياب المُعرّف.
    - `DELETE`: يستدعي `remove(id)`؛ يُعيد 404 عند غياب المُعرّف.
    - `try/catch` يُعيد 500 مع `console.error`.
    - _Requirements: 6.6, 7.6, 7.7, 8.2, 8.4, 8.5, 8.6, 11.2_

  - [ ] 2.3 إنشاء `app/api/knowledge/refresh/route.ts` (POST)
    - `dynamic = "force-dynamic"` و`runtime = "nodejs"`؛ `POST` يبدأ بـ `requireAdmin`؛ يستدعي `refresh()` من الخدمة ويُعيد نجاحاً؛ `try/catch` يُعيد 500 مع `console.error`.
    - _Requirements: 8.3, 8.4, 8.6, 11.2_

- [ ] 3. تكامل خطّ معالجة الشات (Chat Pipeline)
  - [ ] 3.1 حقن قاعدة المعرفة في `app/api/chat/site/route.ts`
    - بعد فشل `matchCurated` وقبل `classifyScope`: تنفيذ `kbSearch(lastMessage.content)` داخل `try/catch` (تدهور آمن — عند الخطأ سجّل عبر `console.error` وتابع المسار الطبيعي بلا حقن).
    - عند وجود إصابة مؤكّدة: بناء رسالة نظام موثوقة عبر `buildKbContext(hits)` («أجب من هذه المعلومات حصراً…») وحقنها في `messagesWithSystem` قبل رسائل المستخدم؛ وتخطّي `classifyScope` منطقياً لتلك الإصابة.
    - عند عدم الإصابة أو الخطأ: متابعة المسار الطبيعي (حارس النطاق ثمّ النموذج والأدوات) دون تغيير.
    - إبقاء خيار قصر المسار عالي الثقة (`SHORT_CIRCUIT_THRESHOLD`) خلف علم (flag) معطّل افتراضياً.
    - _Requirements: 1.2, 1.4, 2.1, 2.2, 2.3, 2.4, 2.5, 3.4, 10.1, 10.2, 11.5, 12.2_

- [ ] 4. واجهة إدارة المستخدم (Admin UI)
  - [ ] 4.1 إضافة قسم «قاعدة المعرفة» إلى `ADMIN_SECTIONS`
    - إضافة عنصر واحد `{ key: "knowledge", label: "قاعدة المعرفة", href: "/admin/knowledge", icon: "📚" }` إلى مصفوفة `ADMIN_SECTIONS` في `app/[locale]/admin/_AdminShell.tsx` دون أي تعديل آخر في القشرة.
    - _Requirements: 9.1_

  - [ ] 4.2 إنشاء صفحة `app/[locale]/admin/knowledge/page.tsx`
    - مكوّن `"use client"` يحاكي `app/[locale]/admin/exceptions/page.tsx`: جدول CRUD (الأعمدة: `# | العنوان | معاينة المتن | الكلمات المفتاحية | الأولوية | مفعّل | آخر تحديث | إجراءات`)، نموذج إضافة/تعديل منبثق، مفتاح تبديل التفعيل (PATCH)، حوار تأكيد الحذف، وزر «تحديث الكاش» (POST `/api/knowledge/refresh`)، وإشعارات (Toast).
    - إعادة استخدام مكوّنات `_shared.tsx` (`C`, `FONT_FAMILY`, `thStyle`, `tdStyle`, `Badge`, `EmptyState`, `Toast`, `ConfirmDialog`).
    - تعريف نوع محلّي على شكل `KbRow` دون استيراد شيفرة خادم داخل مكوّن العميل.
    - عند 401 من أي طلب: إعادة التوجيه إلى `/{locale}/admin/login`.
    - _Requirements: 9.2, 9.3, 9.4, 11.4_

- [ ] 5. التحقّق النهائي
  - [ ] 5.1 التحقّق من النوع والفحص (بلا build كامل)
    - تشغيل `npx tsc --noEmit` وإصلاح أي أخطاء نوع.
    - تشغيل `npx next lint` وإصلاح أي مخالفات lint.
    - تجنّب `next build` الكامل.
    - _Requirements: 5.5, 6.5, 11.1_

## Notes

- المهام مرتّبة تدريجياً وكل مهمّة تبني على سابقتها وتنتهي بالربط في مسار الشات ولوحة الإدارة.
- **لا اختبارات آلية جديدة** لهذه الميزة (قرار متّسق مع spec لوحة الإدارة)؛ التحقّق عبر `npx tsc --noEmit` و`npx next lint` فقط.
- **العزل**: كل عمليات KB على `local_chatbot_logs.kb_articles` فقط؛ لا وصول إلى `ka_db`/`alkafeel_projects`.
- **لا `ALTER`/`DROP`**: إنشاء الجدول عبر `CREATE TABLE IF NOT EXISTS` فقط — إضافي وقابل للعكس.
- **SQL مُعامَل**: كل قيم المستخدم عبر `?` دون دمج سلاسل (بحث + CRUD).
- **التدهور الآمن**: أي فشل في KB يُلتقط في `try/catch` ويُتابَع المسار الطبيعي دون تعطيل الإجابة.
- **لا تبعيات جديدة**: يُعاد استخدام `mysql2/promise`, `normalizeArabic`, `getDatabaseConfig`, `requireAdmin`, ومكوّنات `_shared.tsx`/`ADMIN_SECTIONS` القائمة.
- خيار قصر المسار عالي الثقة يبقى خلف علم معطّل افتراضياً.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1", "2.2", "2.3", "3.1", "4.1", "4.2"] },
    { "id": 2, "tasks": ["5.1"] }
  ]
}
```
