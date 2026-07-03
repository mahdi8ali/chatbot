# Requirements Document

# وثيقة المتطلّبات: لوحة الإدارة الموحّدة (admin-dashboard)

## Introduction

## المقدّمة

تصف هذه الوثيقة متطلّبات **لوحة إدارة موحّدة** تُبنى بالكامل داخل تطبيق Next.js 14 (App Router) بلغة TypeScript وReact. تُطوّر صفحة التحليلات القائمة إلى قشرة إدارة مشتركة ذات تنقّل مُوجَّه بالبيانات، وتضمّ قسمين: **التحليلات** (تبقى كما هي وظيفياً) و**الاستثناءات (الإجابات المنسّقة)** التي تتيح إدارة إجابات البوت والمواقف الفقهية عبر واجهة CRUD كاملة دون تغيير في الشيفرة.

النطاق **إضافي وقابل للعكس**: لا تُنفَّذ أيّ عمليات `ALTER` أو `DROP` على جداول قائمة. يُعاد استخدام جدول `curated_answers` كما هو، وهو يقيم في قاعدة السجلّات المعزولة `local_chatbot_logs`. لا مساس بقاعدتي المحتوى `ka_db` و`alkafeel_projects`.

بما أن قسم الاستثناءات يتحكّم بإجابات البوت، فإن الوصول دون مصادقة غير مقبول. لذلك تُضاف **مصادقة حقيقية قائمة على تسجيل الدخول** (اسم مستخدم + كلمة مرور مُجزّأة بـ scrypt) و**جلسة موقّعة** (HMAC-SHA256) في كوكي `HttpOnly`، مع إنفاذ بطبقتين. كل ذلك مكتفٍ ذاتياً باستخدام `node:crypto` فقط بلا تبعيات جديدة.

## Glossary

## المصطلحات

- **النظام (System)**: تطبيق لوحة الإدارة المبني على Next.js 14 App Router الموصوف في هذه الوثيقة.
- **قشرة الإدارة (Admin_Shell)**: التخطيط المشترك `app/[locale]/admin/layout.tsx` الذي يحمل الترويسة وشريط التنقّل المشترك واسم المستخدم وزر الخروج.
- **مصفوفة الأقسام (Admin_Sections)**: بنية بيانات (`ADMIN_SECTIONS`) تُشتقّ منها عناصر التنقّل في قشرة الإدارة.
- **قسم الاستثناءات (Exceptions_Section)**: صفحة `app/[locale]/admin/exceptions/page.tsx` لإدارة الإجابات المنسّقة عبر واجهة CRUD.
- **الإجابة المنسّقة (Curated_Answer)**: صفّ في جدول `curated_answers` يمثّل إجابة أو موقفاً فقهياً بحقول `category` و`patterns` و`answer` و`url` و`priority` و`active`.
- **طبقة الخدمة (Curated_Service)**: الوحدة `lib/server/curated-service.ts` التي تملك استعلامات SQL والكاش، وتوفّر دوال `listAll/create/update/setActive/remove/getById/mapRowFull`.
- **حارس الـ API (Require_Admin)**: الدالة `requireAdmin` التي تحرس مسارات الـ API وتعيد `401` عند غياب جلسة صالحة.
- **الحارس الأمامي (Page_Guard)**: منطق `middleware.ts` الذي يحرس صفحات الإدارة ويعيد التوجيه إلى صفحة تسجيل الدخول.
- **وحدة المصادقة (Auth_Module)**: الوحدة `lib/server/admin-auth.ts` التي توفّر `hashPassword/verifyPassword/createSession/verifySession/requireAdmin/getAdminSession`.
- **كوكي الجلسة (Session_Cookie)**: الكوكي `admin_session` الذي يحمل قيمة الجلسة الموقّعة بسمات `HttpOnly` و`Secure` و`SameSite=Lax` و`Path=/`.
- **قاعدة السجلّات المعزولة (Isolated_Logs_DB)**: قاعدة البيانات `local_chatbot_logs` التي تُقيم فيها جداول السجلّات وجدول `curated_answers`.
- **المُدقّق (Validator)**: الدالة `validateCuratedInput` التي تتحقّق من حمولة الإنشاء/التعديل.

## Requirements

## المتطلّبات

### المتطلّب 1: قشرة الإدارة الموحّدة والتنقّل المُوجَّه بالبيانات

**قصة المستخدم:** بصفتي مسؤولاً، أريد قشرة إدارة موحّدة بتنقّل مشترك، لكي أنتقل بين أقسام الإدارة من مكان واحد متّسق بصرياً.

#### معايير القبول

1. THE Admin_Shell SHALL تعرض ترويسةً تحوي الشعار واسم المستخدم المسجّل وزرّ تسجيل الخروج.
2. THE Admin_Shell SHALL تبني عناصر التنقّل من Admin_Sections بحيث يقابل كلُّ عنصرٍ في Admin_Sections عنصرَ تنقّلٍ واحداً.
3. WHEN يزور المستخدم مسار قسمٍ معرَّف في Admin_Sections، THE Admin_Shell SHALL تُميّز عنصر التنقّل المقابل لذلك المسار كعنصر نشط.
4. THE Admin_Shell SHALL تعرض المحتوى باتجاه RTL وبخط `'Readex Pro'` ولوحة الألوان `C` المستخدمة في صفحة التحليلات.
5. WHEN يُضاف قسمٌ جديد كعنصرٍ في Admin_Sections مع صفحته تحت `app/[locale]/admin/`، THE Admin_Shell SHALL تعرض عنصر تنقّلٍ لذلك القسم دون تعديلٍ في شيفرة القشرة.

### المتطلّب 2: نقل صفحة التحليلات وإعادة توجيه المسار القديم

**قصة المستخدم:** بصفتي مسؤولاً، أريد الوصول إلى التحليلات ضمن قشرة الإدارة مع بقاء الروابط القديمة تعمل، لكي لا أفقد أيّ وظيفةٍ أو رابطٍ قائم.

#### معايير القبول

1. THE System SHALL تعرض لوحة التحليلات على المسار `/[locale]/admin` بنفس وظائف صفحة التحليلات القائمة دون تغيير سلوكي.
2. WHEN يزور المستخدم المسار `/[locale]/analytics`، THE System SHALL يعيد توجيهه إلى `/[locale]/admin`.
3. THE System SHALL يعرض لوحة التحليلات ضمن Admin_Shell مستخدماً شريط التنقّل والترويسة المشتركة.

### المتطلّب 3: إدارة الإجابات المنسّقة (CRUD)

**قصة المستخدم:** بصفتي مسؤولاً، أريد إضافة وتعديل وتفعيل وتعطيل وحذف الإجابات المنسّقة والمواقف الفقهية عبر واجهة، لكي أدير إجابات البوت دون تغييرٍ في الشيفرة.

#### معايير القبول

1. THE Exceptions_Section SHALL يعرض جميع الإجابات المنسّقة (المفعّلة وغير المفعّلة) مرتّبةً حسب `priority` تنازلياً ثم `updated_at` تنازلياً.
2. WHEN يُرسل المستخدم حمولةَ إنشاءٍ صالحة إلى `POST /api/curated`، THE System SHALL ينشئ إجابةً منسّقةً جديدة ويعيد صفّها الكامل برمز `201`.
3. WHEN يُرسل المستخدم حمولةَ تعديلٍ صالحة إلى `PUT /api/curated/{id}` لمُعرّفٍ موجود، THE System SHALL يحدّث الحقول المُرسَلة ويعيد الصفّ المحدّث برمز `200`.
4. WHEN يُرسل المستخدم `PATCH /api/curated/{id}` بقيمة `active` منطقية لمُعرّفٍ موجود، THE System SHALL يضبط حالة التفعيل ويعيد الصفّ المحدّث برمز `200`.
5. WHEN يُرسل المستخدم `DELETE /api/curated/{id}` لمُعرّفٍ موجود، THE System SHALL يحذف الصفّ ويعيد `{ deleted: true }` برمز `200`.
6. IF أُرسل `PUT` أو `PATCH` أو `DELETE` لمُعرّفٍ غير موجود، THEN THE System SHALL يعيد رمز `404`.
7. WHEN يطلب المستخدم قائمة الإجابات عبر `GET /api/curated` بجلسةٍ صالحة، THE System SHALL يعيد `{ entries: CuratedRow[] }` برمز `200`.

### المتطلّب 4: طبقة الخدمة وإبطال الكاش

**قصة المستخدم:** بصفتي مطوّراً، أريد أن تملك طبقةُ الخدمة استعلامات SQL والكاش وأن تُبطل الكاش بعد كل كتابة، لكي تظهر التغييرات فوراً في مسار الدردشة بمصدرٍ واحدٍ للحقيقة.

#### معايير القبول

1. THE Curated_Service SHALL يوفّر الدوال `listAll` و`create` و`update` و`setActive` و`remove` و`getById` و`mapRowFull`.
2. WHEN تكتمل أيّ عملية كتابة ناجحة (`create` أو `update` أو `setActive` أو `remove`)، THE Curated_Service SHALL يستدعي `refresh()` لإبطال كاش المطابقة.
3. WHEN يُرسل المستخدم `POST /api/curated/refresh` بجلسةٍ صالحة، THE System SHALL يستدعي `refresh()` ويعيد `{ refreshed: true }` برمز `200`.
4. THE System SHALL يحصر كتابة استعلامات SQL في Curated_Service، بحيث تستدعي مسارات الـ API طبقةَ الخدمة فقط دون كتابة استعلامات SQL مباشرة.
5. WHEN تُنشأ إجابةٌ منسّقة عبر `create`، THE Curated_Service SHALL يجعلها ظاهرةً في نتيجة `listAll()` اللاحقة بنفس `category` و`patterns` و`answer` وبمُعرّفٍ جديد.

### المتطلّب 5: التحقّق من صحّة المدخلات

**قصة المستخدم:** بصفتي مسؤولاً، أريد أن تُرفض المدخلات غير الصالحة برسائل عربية واضحة، لكي أتجنّب إدخال بياناتٍ فاسدة تؤثّر على إجابات البوت.

#### معايير القبول

1. THE Validator SHALL يقبل قيمة `category` فقط ضمن المجموعة `{ "faq", "stance" }`، وإلّا يعيد الرسالة «الفئة غير صالحة».
2. THE Validator SHALL يشترط أن تحوي `patterns` بعد التقليم عنصراً نصّياً واحداً غير فارغ على الأقل، وإلّا يعيد الرسالة «يجب إدخال نمط واحد على الأقل».
3. THE Validator SHALL يشترط أن يكون `answer` نصّاً غير فارغ بعد التقليم، وإلّا يعيد الرسالة «نص الإجابة مطلوب».
4. IF وُجدت قيمة `url` ولم تكن سلسلة `http(s)` صالحة ولا `null`، THEN THE Validator SHALL يعيد الرسالة «الرابط غير صالح».
5. IF وُجدت قيمة `priority` ولم تكن عدداً صحيحاً، THEN THE Validator SHALL يعيد الرسالة «الأولوية يجب أن تكون عدداً صحيحاً».
6. THE Validator SHALL ينظّف `patterns` بالتقليم وإسقاط العناصر الفارغة وإزالة التكرار قبل تمريرها إلى طبقة الخدمة.
7. WHEN يُستدعى `parsePatterns` بنصٍّ مفصولٍ بفواصل أو أسطر جديدة، THE System SHALL يحوّله إلى مصفوفة نصوصٍ مقلّمة خاليةٍ من العناصر الفارغة.
8. IF فشل التحقّق من حمولةٍ في مسار كتابة، THEN THE System SHALL يعيد رمز `400` برسالةٍ عربية دون تعديل جدول `curated_answers`.
9. WHEN يُرسل تعديلٌ جزئي عبر `PUT`، THE Validator SHALL يتحقّق من الحقول الموجودة فقط ويرفض تفريغ أيّ حقلٍ إلزامي (مثل `patterns: []`).

### المتطلّب 6: مصادقة تسجيل الدخول والجلسة الموقّعة

**قصة المستخدم:** بصفتي مسؤولاً، أريد تسجيل الدخول باسم مستخدم وكلمة مرور والحصول على جلسةٍ آمنة، لكي أصل إلى منطقة الإدارة بأمانٍ دون سرٍّ مشترك.

#### معايير القبول

1. WHEN يُرسل المستخدم `POST /api/admin/auth/login` باسم مستخدم وكلمة مرور صحيحين، THE System SHALL يُصدر Session_Cookie موقّعاً ويعيد `{ ok: true, username }` برمز `200`.
2. IF فشلت المصادقة لأيّ سبب (اسم مستخدم غير موجود أو كلمة مرور خاطئة)، THEN THE System SHALL يعيد رمز `401` بالرسالة الموحّدة «بيانات الدخول غير صحيحة» دون تمييز أيّ الحقلين خاطئ.
3. WHEN يُستدعى `hashPassword` بكلمة مرور، THE Auth_Module SHALL يعيد سلسلةً بصيغة `"saltHex:hashHex"` مولّدةً عبر scrypt مع ملحٍ عشوائي.
4. WHEN يُستدعى `verifyPassword(p, hashPassword(p))`، THE Auth_Module SHALL يعيد `true`، ولأيّ كلمة مرور مختلفة يعيد `false`.
5. IF كانت صيغة المخزون المُمرَّرة إلى `verifyPassword` مشوّهة (فارغة أو بلا فاصلة نقطية أو بطول hash غير مطابق)، THEN THE Auth_Module SHALL يعيد `false` دون رمي استثناء.
6. THE Auth_Module SHALL يقارن قيمة كلمة المرور المُجزّأة عبر `timingSafeEqual` لمنع تسريب التوقيت.
7. WHEN يُستدعى `createSession(username)`، THE Auth_Module SHALL يعيد قيمةً بصيغة `"<payloadBase64url>.<signatureBase64url>"` حيث الحمولة `{ sub, iat, exp }` وقيمة `exp = iat + TTL` (افتراضي 8 ساعات أو `ADMIN_SESSION_TTL_HOURS`).
8. WHEN يُستدعى `verifySession(createSession(u))` قبل انتهاء `exp`، THE Auth_Module SHALL يعيد `{ username: u }`.
9. IF عُدِّل أيّ بايت في حمولة الجلسة أو توقيعها، THEN THE Auth_Module SHALL يعيد `null` من `verifySession` عبر مقارنةٍ ثابتة الزمن على HMAC.
10. IF كانت `exp` أقدم من الوقت الحالي، THEN THE Auth_Module SHALL يعيد `null` من `verifySession` حتى لو كان التوقيع صحيحاً.
11. WHEN يُرسل المستخدم `POST /api/admin/auth/logout`، THE System SHALL يمسح Session_Cookie بضبط `Max-Age=0` ويعيد `{ ok: true }`.

### المتطلّب 7: التحكّم بالوصول بطبقتين (دفاع بالعمق)

**قصة المستخدم:** بصفتي مالكاً للنظام، أريد حراسةَ صفحات الإدارة وواجهات الـ API معاً بطبقتين مستقلّتين، لكي يبقى الوصول ممنوعاً حتى لو أخفقت إحدى الطبقتين.

#### معايير القبول

1. IF زار مستخدمٌ مساراً ضمن `/[locale]/admin/**` (عدا `login`) دون جلسةٍ صالحة، THEN THE Page_Guard SHALL يعيد توجيهه إلى `/[locale]/admin/login` مع تمرير مَعلمة `next` للمسار المقصود.
2. IF وصل طلب API إلى `/api/curated` أو `/api/curated/{id}` أو `/api/curated/refresh` أو `/api/analytics` دون جلسةٍ صالحة، THEN THE Require_Admin SHALL يعيد رمز `401` بالرسالة «غير مصرّح» قبل تنفيذ أيّ منطق.
3. THE Require_Admin SHALL يتحقّق من الجلسة قبل استدعاء طبقة الخدمة، بحيث لا يصل طلبٌ غير مصرّحٍ إلى Curated_Service.
4. THE System SHALL يجعل صفحة `/[locale]/admin/login` عامّةً وخارج حراسة Page_Guard.
5. THE System SHALL يحرس صفحات الإدارة عبر Page_Guard ويحرس واجهات الـ API عبر Require_Admin بحيث لا تعتمد إحدى الطبقتين على الأخرى.
6. WHEN يستقبل العميل رمز `401` من أيّ طلب، THE System SHALL يعيد توجيه المستخدم إلى صفحة تسجيل الدخول.

### المتطلّب 8: خصائص الأمان

**قصة المستخدم:** بصفتي مالكاً للنظام، أريد ضماناتٍ أمنية على الجلسة والأسرار والاستعلامات، لكي أحمي منطقة الإدارة وإجابات البوت من الاختراق.

#### معايير القبول

1. THE System SHALL يضبط Session_Cookie بسمات `HttpOnly` و`Secure` و`SameSite=Lax` و`Path=/` و`Max-Age` مطابقٍ لمدّة صلاحية الجلسة.
2. THE System SHALL يمنع إرسال `ADMIN_PASSWORD_HASH` و`ADMIN_SESSION_SECRET` وكلمة المرور الصريحة إلى العميل.
3. THE System SHALL يعرّف جميع متغيّرات بيئة المصادقة بلا بادئة `NEXT_PUBLIC_` بحيث تبقى خادمية بحتة.
4. THE System SHALL ينفّذ جميع عمليات القراءة والكتابة على `curated_answers` عبر استعلاماتٍ مُعامَلة (`?`) دون دمج قيمٍ في سلاسل SQL.
5. IF غاب أيٌّ من `ADMIN_USERNAME` أو `ADMIN_PASSWORD_HASH` أو `ADMIN_SESSION_SECRET`، THEN THE System SHALL يمنع تسجيل الدخول ويجعل Require_Admin يرفض الطلبات (مغلق افتراضياً).
6. THE System SHALL يهرّب الرموز الخاصة عند بناء تعابير Regex من `patterns` لمنع الحقن في المطابقة.

### المتطلّب 9: عزل قاعدة البيانات والنطاق الإضافي القابل للعكس

**قصة المستخدم:** بصفتي مالكاً للنظام، أريد أن تبقى التغييرات معزولةً وإضافيةً وقابلةً للعكس، لكي لا تتأثّر قواعد المحتوى القائمة ولا مخطّطات الجداول.

#### معايير القبول

1. THE System SHALL يوجّه جميع استعلامات لوحة الإدارة إلى قاعدة السجلّات المعزولة `local_chatbot_logs` فقط عبر مجمّع اتصالٍ خاص.
2. THE System SHALL يمتنع عن تنفيذ أيّ عملية `ALTER` أو `DROP` على جداول قائمة.
3. THE System SHALL يمتنع عن قراءة أو الكتابة في قاعدتي `ka_db` و`alkafeel_projects`.
4. WHERE يلزم إنشاء جدول `curated_answers`، THE System SHALL ينشئه فقط عبر `CREATE TABLE IF NOT EXISTS` القائم دون تعديل مخطّطه.
5. IF فشل تحليل `patterns` كـ JSON صالح لأحد الصفوف، THEN THE Curated_Service SHALL يُسقط ذلك الصفّ من نتيجة `listAll()` دون تعطيل بقية القائمة.

### المتطلّب 10: معالجة الأخطاء وتغذية المستخدم الراجعة

**قصة المستخدم:** بصفتي مسؤولاً، أريد رسائل خطأ ونجاحٍ واضحة بعد كل عملية، لكي أفهم نتيجة إجراءاتي وأتعافى من الأخطاء.

#### معايير القبول

1. IF رمى استعلام قاعدة البيانات استثناءً غير متوقّع في أحد مسارات الـ API، THEN THE System SHALL يلتقطه ويعيد رمز `500` برسالة خطأ مع تسجيلها عبر `console.error`.
2. WHEN تكتمل عمليةُ كتابةٍ بنجاح في قسم الاستثناءات، THE Exceptions_Section SHALL يعرض توست نجاحٍ ويعيد جلب القائمة.
3. WHEN يفشل طلبٌ في قسم الاستثناءات، THE Exceptions_Section SHALL يعرض توست خطأٍ ويحافظ على الحالة السابقة.
4. WHEN يطلب المستخدم حذف إجابةٍ منسّقة، THE Exceptions_Section SHALL يعرض حوار تأكيدٍ قبل تنفيذ `DELETE`.
5. WHEN يستدعي المستخدم تحديث الكاش يدوياً وينجح، THE Exceptions_Section SHALL يعرض توست «تم تحديث الكاش — ستُطبَّق التغييرات فوراً».
