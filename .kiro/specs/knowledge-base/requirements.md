# Requirements Document

## Introduction

هذه الوثيقة تُوثّق متطلّبات ميزة **قاعدة المعرفة الخاصة (Private Knowledge Base)**،
وهي مُشتقّة عكسياً من وثيقة التصميم المعتمدة (`design.md`) في المجلّد نفسه.

قاعدة المعرفة مخزن معرفي خاص وقابل للبحث يحتوي معلومات وإجابات كاملة **غير منشورة على
الموقع** وغير موجودة في قاعدتَي المحتوى (`ka_db` / `alkafeel_projects`)، لكن يجب أن يكون
البوت قادراً على الإجابة منها. تُستشار هذه القاعدة **بعد** الإجابات المنسّقة
(`matchCurated`) و**قبل** حارس النطاق والنموذج وبقية الأدوات. عند وجود إصابة مؤكّدة تُحقَن
نتائجها كسياق موثوق يصوغ منه النموذج إجابته وفق قاعدة «السرد والشرح من النتائج حصراً».

الميزة **إضافية وقابلة للعكس بالكامل**: جدول واحد في قاعدة السجلّات المعزولة، طبقة خدمة
تحاكي `curated-service.ts`، وواجهات إدارة محمية، ونقطة حقن واحدة في مسار الشات — بحيث لا
يتعطّل مسار الإجابة أبداً عند أي فشل.

## Glossary

- **Knowledge_Base (قاعدة المعرفة)**: المخزن المعرفي الخاص القابل للبحث، ممثَّلاً بجدول `kb_articles`.
- **KB_Service (خدمة قاعدة المعرفة)**: طبقة الخدمة `lib/server/kb-service.ts` التي تملك كل استعلامات SQL والكاش والبحث وعمليات CRUD.
- **KB_Validator (مُتحقِّق قاعدة المعرفة)**: الوحدة `lib/server/kb-validation.ts` التي تتحقّق من مدخلات المقالات.
- **KB_Admin_API (واجهة إدارة قاعدة المعرفة)**: مسارات `/api/knowledge`، `/api/knowledge/[id]`، `/api/knowledge/refresh`.
- **KB_Admin_UI (واجهة إدارة المستخدم)**: قسم «قاعدة المعرفة» في لوحة الإدارة وصفحة `app/[locale]/admin/knowledge/page.tsx`.
- **Chat_Pipeline (خطّ معالجة الشات)**: المسار في `app/api/chat/site/route.ts` من استقبال الرسالة حتى بثّ الإجابة.
- **Curated_Store (مخزن الإجابات المنسّقة)**: ميزة `curated_answers` القائمة (مطابقة حرفية وقصر مسار)، وهي منفصلة عن قاعدة المعرفة.
- **KbHit (نتيجة بحث)**: عنصر نتيجة يحوي `id, title, body, keywords, priority, score`.
- **KbRow (صفّ إداري)**: صفّ القائمة الكامل للوحة الإدارة بما يشمل غير المفعّل و`updated_at` و`note`.
- **KbInput (حمولة المدخلات)**: حمولة الإنشاء/التعديل بعد التحقّق (`title, body, keywords?, priority?, active?, note?`).
- **Confidence_Threshold (عتبة الثقة)**: `CONFIDENCE_THRESHOLD` — أدنى درجة صلة تُعتبر عندها النتيجة إصابة مؤكّدة.
- **Min_Length (الحدّ الأدنى للطول)**: `MIN_LENGTH` — أدنى طول للنصّ المطبّع قبل تنفيذ أي استعلام بحث.
- **Relevance_Score (درجة الصلة)**: ناتج `MATCH(search_text) AGAINST(? IN NATURAL LANGUAGE MODE)`.
- **normalizeArabic (التطبيع العربي)**: دالة التطبيع في `lib/server/faq.ts` (توحيد الهمزات/الألف/التاء المربوطة).
- **Logs_Database (قاعدة السجلّات)**: قاعدة `local_chatbot_logs` المعزولة.
- **requireAdmin (حارس الإدارة)**: دالة الحماية في `lib/server/admin-auth.ts`.
- **Cache_TTL (مدّة صلاحية الكاش)**: `CACHE_TTL_MS` — مدّة بقاء الكاش الداخلي قبل إعادة التحميل.

## Requirements

### Requirement 1: مخزن معرفي خاص متميّز عن الإجابات المنسّقة

**User Story:** كمشغّل للبوت، أريد مخزناً معرفياً خاصاً منفصلاً عن الإجابات المنسّقة، حتى يجيب البوت من معلومات غير منشورة دون إعادتها حرفياً.

#### Acceptance Criteria

1. THE Knowledge_Base SHALL تخزين مقالات معرفية قابلة للبحث في جدول `kb_articles` منفصل عن مخزن `curated_answers`.
2. WHEN تُصاغ إجابة من نتائج قاعدة المعرفة، THE Chat_Pipeline SHALL توجيه النموذج إلى السرد والشرح من النتائج حصراً دون اختراع معلومات خارجها.
3. THE Knowledge_Base SHALL استخدام بحث نصّي كامل مع درجة صلة للمطابقة بدلاً من المطابقة الحرفية المستخدمة في Curated_Store.
4. WHERE توجد إصابة مؤكّدة من قاعدة المعرفة, THE Chat_Pipeline SHALL إتاحة صياغة النموذج للإجابة من النتائج دون إرجاعها كنصّ حرفي مثل Curated_Store.

### Requirement 2: الأولوية والترتيب داخل خطّ المعالجة

**User Story:** كمشغّل للبوت، أريد أن تُستشار قاعدة المعرفة بترتيب محدّد داخل خطّ المعالجة، حتى تكون المصدر الأوثق دون تعطيل بقية المسار.

#### Acceptance Criteria

1. WHEN تُصيب `matchCurated` رسالة المستخدم, THE Chat_Pipeline SHALL إرجاع الإجابة المنسّقة الحرفية دون استشارة Knowledge_Base.
2. IF لم تُصِب `matchCurated`, THEN THE Chat_Pipeline SHALL تنفيذ `kbSearch` قبل `classifyScope` وقبل استدعاء النموذج وقبل بقية الأدوات.
3. WHEN تُرجِع `kbSearch` إصابة مؤكّدة, THE Chat_Pipeline SHALL حقن النتائج كرسالة نظام موثوقة ضمن رسائل النموذج ثمّ صياغة الإجابة منها.
4. WHERE توجد إصابة مؤكّدة من قاعدة المعرفة, THE Chat_Pipeline SHALL تخطّي `classifyScope` منطقياً لأن وجود المعرفة الصريحة يُثبت أن السؤال ضمن النطاق.
5. IF لم تُرجِع `kbSearch` أي إصابة مؤكّدة, THEN THE Chat_Pipeline SHALL متابعة المسار الطبيعي (حارس النطاق ثمّ النموذج والأدوات) دون تغيير.

### Requirement 3: الأداء دون الثانية

**User Story:** كمستخدم، أريد أن يبقى زمن الإجابة دون الثانية، حتى لا تُبطئ قاعدة المعرفة تجربة الحوار.

#### Acceptance Criteria

1. WHEN يُنفَّذ `kbSearch`, THE KB_Service SHALL إصدار استعلام بحث فهرسي واحد على فهرس FULLTEXT (ngram).
2. THE KB_Service SHALL الاحتفاظ بكاش داخلي في الذاكرة بمدّة صلاحية `Cache_TTL` لتفادي إعادة التحميل عند كل طلب.
3. WHEN تُنفَّذ أي عملية كتابة إدارية ناجحة, THE KB_Service SHALL استدعاء `refresh()` لإبطال الكاش الداخلي.
4. IF لم توجد إصابة مؤكّدة, THEN THE KB_Service SHALL إضافة استعلام فهرسي واحد فقط إلى المسار الطبيعي.
5. THE KB_Service SHALL تحديد عدد نتائج البحث بقيمة `limit` صغيرة (افتراضي 3، أقصى 10).
6. THE KB_Service SHALL استخدام مجمّع اتصال معزول بحدّ `connectionLimit` يساوي 3.

### Requirement 4: عتبة الثقة وحدّية الطول والترتيب

**User Story:** كمشغّل للبوت، أريد قرار إصابة حتمياً قائماً على عتبة رقمية، حتى تكون الإجابات متّسقة وقابلة للضبط.

#### Acceptance Criteria

1. WHEN تتجاوز أعلى درجة صلة قيمة `Confidence_Threshold` أو تساويها, THE KB_Service SHALL اعتبار النتيجة إصابة مؤكّدة.
2. IF كان طول النصّ المطبّع بـ `normalizeArabic` أقلّ من `Min_Length`, THEN THE KB_Service SHALL إرجاع مصفوفة فارغة دون تنفيذ أي استعلام.
3. THE KB_Service SHALL إرجاع نتائج البحث مرتّبة تنازلياً حسب `(score, priority)`.
4. WHEN تُرجَع نتائج `kbSearch`, THE KB_Service SHALL ضمان أن كل عنصر يحقّق `score` أكبر من أو يساوي العتبة المعتمدة.
5. IF لم تبلغ أي نتيجة العتبة, THEN THE KB_Service SHALL إرجاع مصفوفة فارغة دون أي أثر جانبي على قاعدة البيانات.

### Requirement 5: نموذج بيانات معزول وقابل للعكس

**User Story:** كمهندس، أريد نموذج بيانات معزولاً وقابلاً للعكس، حتى لا تمسّ الميزة قواعد المحتوى القائمة.

#### Acceptance Criteria

1. THE KB_Service SHALL إنشاء جدول `kb_articles` في قاعدة `local_chatbot_logs` فقط عبر `CREATE TABLE IF NOT EXISTS`.
2. THE `kb_articles` SHALL تضمين الأعمدة: `id, title, body, keywords, search_text, active, priority, note, created_at, updated_at`.
3. THE `kb_articles` SHALL امتلاك فهرس FULLTEXT بمحلّل ngram على العمود `search_text` وفهرس `(active, priority)`.
4. THE KB_Service SHALL اشتقاق قيمة `search_text` داخل الخدمة عبر `normalizeArabic(title + body + keywords)` لا من مدخلات الـ API.
5. THE KB_Service SHALL الامتناع عن إصدار عبارات `ALTER` أو `DROP` على أي جدول.
6. THE KB_Service SHALL الامتناع عن الوصول إلى `ka_db` أو `alkafeel_projects` أو أي جدول محتوى.

### Requirement 6: طبقة الخدمة والبحث وعمليات CRUD

**User Story:** كمهندس، أريد طبقة خدمة موحّدة تملك كل منطق قاعدة المعرفة، حتى تكون العمليات آمنة ومتّسقة.

#### Acceptance Criteria

1. THE KB_Service SHALL توفير دالة `kbSearch(query, opts)` ودالة `refresh()`.
2. THE KB_Service SHALL توفير عمليات CRUD: `listAll`، `getById`، `create`، `update`، `setActive`، `remove`.
3. WHEN تُنفَّذ عملية `create` أو `update`, THE KB_Service SHALL اشتقاق `search_text` من المدخلات قبل التخزين.
4. WHEN تكتمل أي عملية كتابة (`create`، `update`، `setActive`، `remove`) بنجاح, THE KB_Service SHALL استدعاء `refresh()`.
5. THE KB_Service SHALL تمرير كل قيم المستخدم في استعلامات SQL عبر معاملات `?` دون دمج سلاسل.
6. THE KB_Service SHALL امتلاك كل عبارات SQL حصراً دون كتابتها في طبقة الواجهة أو الإدارة.

### Requirement 7: التحقّق من المدخلات برسائل عربية

**User Story:** كمشرف، أريد تحقّقاً صارماً من مدخلات المقالات برسائل عربية، حتى تبقى البيانات سليمة ومفهومة.

#### Acceptance Criteria

1. IF كان `title` فارغاً بعد التقليم, THEN THE KB_Validator SHALL رفض المدخلات برسالة «العنوان مطلوب».
2. IF كان `body` فارغاً بعد التقليم, THEN THE KB_Validator SHALL رفض المدخلات برسالة «نص المقالة مطلوب».
3. IF لم تكن `priority` عدداً صحيحاً, THEN THE KB_Validator SHALL رفض المدخلات برسالة «الأولوية يجب أن تكون عدداً صحيحاً».
4. IF لم تكن `active` قيمة منطقية, THEN THE KB_Validator SHALL رفض المدخلات برسالة «الحقل active يجب أن يكون قيمة منطقية».
5. WHEN تُقدَّم `keywords`, THE KB_Validator SHALL تنظيفها بالتقليم وإسقاط الفارغ وإزالة التكرار عبر `parseKeywords`.
6. IF فشل التحقّق, THEN THE KB_Admin_API SHALL إرجاع الرمز 400 دون أي تعديل على الجدول.
7. WHERE يعمل التحقّق في الوضع الجزئي (`partial`), THE KB_Validator SHALL رفض إفراغ الحقول الإلزامية `title` و`body`.

### Requirement 8: واجهات إدارة CRUD محمية

**User Story:** كمشرف، أريد واجهات إدارة محمية لإدارة المقالات، حتى أتحكّم بالمحتوى بأمان.

#### Acceptance Criteria

1. THE KB_Admin_API SHALL توفير `GET` و`POST` على المسار `/api/knowledge`.
2. THE KB_Admin_API SHALL توفير `PUT` و`PATCH` و`DELETE` على المسار `/api/knowledge/[id]`.
3. THE KB_Admin_API SHALL توفير `POST` على المسار `/api/knowledge/refresh` لإبطال الكاش يدوياً.
4. WHEN يُستقبَل أي طلب على مسارات الإدارة, THE KB_Admin_API SHALL استدعاء `requireAdmin` قبل تنفيذ أي منطق آخر.
5. IF لم يوجد المُعرّف المطلوب في `PUT` أو `PATCH` أو `DELETE`, THEN THE KB_Admin_API SHALL إرجاع الرمز 404.
6. IF وقع خطأ غير متوقّع, THEN THE KB_Admin_API SHALL إرجاع الرمز 500 مع تسجيل الخطأ عبر `console.error`.

### Requirement 9: واجهة إدارة المستخدم

**User Story:** كمشرف، أريد واجهة مستخدم لإدارة قاعدة المعرفة تعيد استخدام مكوّنات اللوحة القائمة، حتى تكون التجربة متّسقة.

#### Acceptance Criteria

1. THE KB_Admin_UI SHALL إضافة قسم «قاعدة المعرفة» إلى `ADMIN_SECTIONS` الموجَّه بالبيانات.
2. THE KB_Admin_UI SHALL توفير صفحة `app/[locale]/admin/knowledge/page.tsx` تعيد استخدام مكوّنات `_shared.tsx` (الجدول، النموذج المنبثق للإضافة/التعديل، مفتاح التفعيل، حوار تأكيد الحذف، زرّ تحديث الكاش، والإشعارات).
3. WHEN يستقبل المشرف الرمز 401 من أي طلب, THE KB_Admin_UI SHALL إعادة التوجيه إلى `/{locale}/admin/login`.
4. THE KB_Admin_UI SHALL تعريف نوع محلّي على شكل `KbRow` دون استيراد شيفرة خادم داخل مكوّن العميل.

### Requirement 10: التدهور الآمن

**User Story:** كمستخدم، أريد أن يستمرّ البوت في الإجابة حتى لو فشلت قاعدة المعرفة، حتى لا تتعطّل التجربة أبداً.

#### Acceptance Criteria

1. IF وقع أي خطأ أثناء `kbSearch` (اتصال أو SQL أو إنشاء جدول), THEN THE Chat_Pipeline SHALL التقاطه ومتابعة المسار الطبيعي دون حقن أي سياق.
2. WHEN يُلتقَط خطأ في قاعدة المعرفة, THE Chat_Pipeline SHALL تسجيله عبر `console.error` مع إكمال الإجابة.
3. IF تعذّر تحليل `keywords` لصفّ معطوب, THEN THE KB_Service SHALL إسقاط ذلك الصفّ مع الإبقاء على بقية النتائج سليمة.

### Requirement 11: الأمان والعزل والخصوصية

**User Story:** كمسؤول أمن، أريد ضمانات أمنية على الميزة، حتى تبقى البيانات الخاصة والاتصالات محمية.

#### Acceptance Criteria

1. THE KB_Service SHALL تنفيذ كل استعلامات SQL (بحث وCRUD) عبر معاملات `?` دون دمج سلاسل.
2. THE KB_Admin_API SHALL حماية كل مسارات `/api/knowledge*` عبر `requireAdmin` قبل أي منطق.
3. THE Knowledge_Base SHALL البقاء معزولاً في `local_chatbot_logs` دون وصول إلى بيانات المحتوى الحسّاسة.
4. THE KB_Service SHALL إبقاء أسرار قاعدة البيانات وإعداداتها على الخادم دون تسريبها عبر أي متغيّر `NEXT_PUBLIC_`.
5. THE Chat_Pipeline SHALL إعادة محتوى قاعدة المعرفة كسياق للنموذج ضمن الطلب نفسه فقط دون إرساله إلى أي وجهة عامّة.

### Requirement 12: قابلية التوسّع المستقبلية

**User Story:** كمهندس، أريد تصميماً قابلاً للتوسّع مستقبلاً، حتى يمكن الترقية إلى البحث الدلالي دون إعادة هيكلة السطح.

#### Acceptance Criteria

1. THE KB_Service SHALL إبقاء توقيع `kbSearch(query, opts): Promise<KbHit[]>` ثابتاً لإتاحة ترقية التنفيذ الداخلي مستقبلاً.
2. WHERE يُرقّى التنفيذ لاحقاً إلى embeddings/RAG, THE Chat_Pipeline SHALL البقاء دون تغيير في `route.ts` وسطح الإدارة.
3. THE Knowledge_Base SHALL اعتبار تنفيذ البحث الدلالي/الشعاعي (embeddings/RAG) خارج نطاق هذه الوثيقة حالياً.
