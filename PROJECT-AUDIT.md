# دراسة تقنية شاملة — مساعد شبكة الكفيل (alkafeel_chatbot)

> **مصدر هذه الوثيقة:** قراءة مباشرة للشيفرة (كل ملفات `lib/server/`, `app/`, `components/`, `public/widget.js`, `middleware.ts`, الاختبارات، وملفات الإعداد) + تشغيل فعلي لـ `tsc --noEmit` و`jest` و`next lint`.
> **لم أعتمد على أي ملف `.md` موجود** (README، feedback، docs/، .kiro/specs) — كلها قد تكون قديمة أو تصف نوايا لم تُنفّذ.
> **تاريخ الدراسة:** 2026-08-10 — الفرع `idrak` — آخر commit `6f616e1`.
> هذه الوثيقة هي مرجعي المعتمد عند أي تطوير لاحق في هذا المشروع.

---

## 0. ملخص تنفيذي (اقرأ هذا أولاً)

المشروع **مساعد ذكي عربي** يعمل فوق قواعد بيانات MySQL الخاصة بالعتبة العباسية المقدسة، مبني على Next.js 14 App Router + OpenAI Function Calling. المعمارية سليمة في جوهرها: طبقة خدمات منفصلة، قائمة أدوات بيضاء (whitelist)، حارس نطاق حتمي، مخزن إجابات منسّقة، قاعدة معرفة خاصة، لوحة إدارة بمصادقة حقيقية، وتسجيل كامل للمحادثات مع تحليلات.

> ### ✅ حالة المعالجة — آخر تحديث 2026-08-12
> **المشاكل الحرجة الثلاث عولجت**، ومعها: محرّك البحث على قاعدة البيانات، تسمية
> الأدوات، ثلاثة أعطال تمسّ الإجابة، عيب مطابقة المخزن المنسّق، وسبع إصلاحات تشغيلية.
>
> **الحالة الآن:** `tsc` نظيف · `lint` بلا أخطاء · **285 اختباراً ناجحاً / 17 ملفاً**
> (تنتهي المجموعة ذاتياً) · `next build` ناجح · فحص حيّ لكل المسارات.
>
> **أدوات القياس المتاحة:**
> ```
> npm run eval                  جودة الاسترجاع (recall@k, MRR)
> npm run eval -- --compare baseline    مقارنة بخطّ الأساس (بوّابة انحدار)
> npm run eval:tools            أثر أي تعديل على اختيار الأداة وصياغة الاستعلام
> npm run eval:turns            التسلسلية متعدّدة الدورات (حلّ الضمائر)
> npm run eval:selection        دقّة اختيار الأداة الصحيحة من بين الكل (97.4%)
> ```
>
> **ما يبقى مؤجّلاً بوعي:** فهرس FULLTEXT (ينتظر قرار المالك — DDL على جدول إنتاجي) ·
> `kb_articles` فارغ (قرار محتوى) · تفكيك `route.ts` والتبعيات الميتة (دَين لا يشعر به المستخدم).

كانت هناك **٣ مشاكل حرجة**:

| # | المشكلة | الأثر | الحالة |
|---|---|---|---|
| **ح-1** | `ADMIN_SESSION_SECRET` الغائب = مفتاح HMAC فارغ → **أي شخص يستطيع تزوير جلسة إدارة** | اختراق كامل للوحة الإدارة | ✅ عولجت |
| **ح-2** | `renderMarkdown` يبني HTML بدون تهريب علامات الاقتباس ثم يُحقن عبر `dangerouslySetInnerHTML` | **XSS مخزّن** عبر محتوى قاعدة البيانات | ✅ عولجت |
| **ح-3** | CORS يعكس أي `origin` + Rate Limit في الذاكرة فقط | **استنزاف رصيد OpenAI** من أي موقع خارجي | ✅ عولج شقّ CORS — الحدّ المشترك ما يزال مطلوباً |

وهناك **خلل وظيفي صامت مهم**: `searchProjectsDB` يجلب أول **200 مشروع فقط** (`LIMIT 200` ثم فلترة في Node) بينما القاعدة فيها 358 مشروعاً → **158 مشروعاً غير قابل للبحث إطلاقاً**. ✅ عولج.

كذلك كانت **مجموعة الاختبارات حمراء**: 8 اختبارات فاشلة من 131، و`npm test` **لا ينتهي أبداً** (يتعلّق للأبد بسبب `setInterval` غير مُحرَّر). ✅ عولج.

---

## 0.1 ⭐ أي واجهة هي «المشروع»؟ (تصحيح جوهري — أفاده المالك)

عند التشغيل تظهر **واجهتان**، وهما **ليستا متكافئتين**:

### ① الودجت الكامل — **هذا هو المشروع الأصلي** ⭐
```
app/[locale]/page.tsx  →  زر «المساعد الذكي»  →  overlay ملء الشاشة
   └── components/ChatWidget.tsx
        └── components/chat/{ChatStyles,ChatHeader,MessageList,InputZone,
                             FeedbackButtons,renderMarkdown,useChat,linkValidation}
```
- ~1,200 سطر موزّعة على 8 وحدات + **206 قاعدة نمط** (`gm-*`) في `ChatStyles.tsx`
- **كل التجربة الغنيّة هنا حصراً:** معرض صور مع lightbox (تنقّل بالأسهم والسحب)، بطاقات مصادر، مشغّل فيديو مدمج بصورة مصغّرة، بطاقات اتصال، معاينة خرائط OpenStreetMap، أطوار تحميل متحرّكة، وضع ليلي
- التجربة: `npm run dev` ثم `/ar`

### ② الودجت الجانبي الصغير — 🗑️ **محذوف بتاريخ 2026-08-10**
كان فقاعة عائمة 460×600 تُحقن في مواقع خارجية بسطرين. أفاد المالك أنه **قديم وغير مطلوب**، فحُذف بالكامل هو وملحقاته (§11.1). لم يكن يملك أياً من مزايا الواجهة الكاملة — نصّ وروابط وأزرار تقييم فقط.

### الأثر على القرارات

| البند | الأثر |
|---|---|
| **الأولوية** | كل إصلاح وميزة يبدأ وينتهي في `components/chat/*` — لم تعد هناك واجهة ثانية |
| **XSS (ح-2)** | الخطر كان في `renderMarkdown.ts` أي في الواجهة الأصلية (وقد عولج) |
| **CORS (ح-3)** | الواجهة الأصلية **نفس الأصل** (same-origin)، فتشديد CORS لا يمسّها. بعد حذف الودجت الصغير لم يبقَ أي مستهلك خارجي مشروع — يمكن تشديد القائمة أكثر مستقبلاً |
| **ازدواج العرض (§7.5)** | ✅ **زال من جذوره بالحذف** — لم يعد منطق العرض مُنفَّذاً مرتين |
| **قياس «اكتمال» ميزة** | ميزة لم تظهر في الواجهة الكاملة = غير منجزة |

---

## 1. البنية العامة والمكدّس التقني

### 1.1 المكدّس الفعلي (لا المُعلن)

```
Next.js 14 (App Router) + React 18 + TypeScript (strict: true)
└── OpenAI SDK v4  — Chat Completions + Function Calling + Streaming
└── mysql2/promise — 3 قواعد بيانات منفصلة
└── لا Tailwind فعلياً (لا يوجد tailwind.config.js أصلاً)
└── لا i18n فعلياً (مسار [locale] شكلي فقط)
└── التنسيق: styled-jsx + CSS inline + سلاسل CSS في widget.js
```

**ملاحظة مهمة:** `package.json` يعلن ~60 تبعية إنتاجية، **المستخدم منها فعلياً 5 فقط**: `next`, `react`, `react-dom`, `openai`, `mysql2`, `lucide-react`. تفاصيل في §7.1.

### 1.2 قواعد البيانات الثلاث

| القاعدة | متغير البيئة | المحتوى | مَن يقرؤها |
|---|---|---|---|
| **ka_db** (الرئيسية) | `DB_NAME` | `news`, `news_type`, `news_image_attachments`, `abbas`, `history_contents/sections`, `video_files/sections`, `contact_main/divisions/sub_divisions`, `places_data/categories`, `salah` | `db.ts` pool |
| **alkafeel_projects** | `PROJECTS_DB_NAME` | `projects`, `sections`, `project_section`, `properties`, `project_property`, `project_images` | pool منفصل ×2 |
| **local_chatbot_logs** | `LOGS_DB_NAME` | `chat_logs`, `chat_feedback`, `curated_answers`, `kb_articles` | pools منفصلة ×4 |

### 1.3 خريطة الملفات (16,549 سطراً)

```
app/
├── api/chat/site/route.ts        ← 624س — قلب النظام (المسار الوحيد للمحادثة)
├── api/chat/feedback/route.ts    ← تقييمات المستخدمين (بلا مصادقة)
├── api/analytics/route.ts        ← 11 استعلام SQL للوحة التحليلات (محمي)
├── api/knowledge/**              ← CRUD قاعدة المعرفة (محمي)
├── api/curated/**                ← CRUD الإجابات المنسّقة (محمي)
├── api/admin/auth/{login,logout} ← مصادقة الإدارة
├── api/widget/route.ts           ← يخدم public/widget.js
└── [locale]/
    ├── page.tsx                  ← صفحة تجريبية (ChatWidget بملء الشاشة)
    └── admin/{,exceptions,knowledge,login}

lib/server/                       ← كل المنطق الخادمي (لا شيء يعمل على العميل)
├── ── تنسيق (Orchestration) ──
│   ├── site-api-service.ts       ← موزّع الأدوات + البحث الموحّد
│   └── function-calling-handler.ts ← حلقة استدعاء الأدوات
├── ── مصادر البيانات ──
│   ├── db.ts                     ← Pool + خوارزميات التطبيع/التسجيل العربي
│   ├── news-service.ts, sira-service.ts, history-service.ts
│   ├── video-service.ts, projects-service.ts, projects-db-service.ts
│   ├── contacts-service.ts, places-service.ts, prayer-service.ts
│   └── analytics-service.ts      ← 897س — أدوات العدّ/التحليل عبر SQL
├── ── ضوابط الجودة ──
│   ├── system-prompts.ts         ← 412س من الموجّه (prompt)
│   ├── scope-guard.ts            ← حارس نطاق حتمي (بلا نموذج)
│   ├── curated-service.ts        ← إجابات منسّقة (قصر مسار)
│   ├── kb-service.ts             ← قاعدة معرفة خاصة (حقن سياق)
│   ├── faq.ts                    ← بذرة الإجابات الثابتة
│   └── smart-suggestions.ts + site-categories.ts
├── ── أمن وتشغيل ──
│   ├── admin-auth.ts + admin-auth-server.ts
│   ├── rate-limiter.ts, data-sanitizer.ts, chat-logger.ts
│   └── {kb,curated}-validation.ts

components/chat/                  ← ⭐ الواجهة الأصلية الكاملة (انظر §0.1)
public/widget.js                  ← 789س — الودجت الجانبي الصغير (تضمين خارجي)
public/widget-loader.js           ← 399س — ⚠️ ميت تماماً، لا مرجع له
```

---

## 2. تدفّق الطلب — المسار الكامل لسؤال واحد

هذا أهم قسم في الوثيقة. `app/api/chat/site/route.ts` هو **نقطة الدخول الوحيدة**.

```
POST /api/chat/site  { messages[], session_id, use_tools }
│
├─① Rate Limit ─────────── rate-limiter.ts (20 طلب/دقيقة/IP، حظر 5 دقائق)
│                          ⚠️ خريطة في الذاكرة → عديم الفائدة على Serverless
│
├─② Sanitization ───────── data-sanitizer.ts
│     sanitizeMessages()  → يُطبَّق على **كل** الرسائل (بما فيها ردود المساعد!)
│     validateAndSanitize() → آخر رسالة فقط: طول ≤2000، رفض أنماط ضارّة
│
├─③ فحص مفتاح OpenAI ───── ⚠️ يرمي 500 هنا حتى للمسارات التي لا تستعمل النموذج
│
├─④ المخزن المنسّق ──────── curated-service.matchCurated()
│     تطابق حدود كلمة على أنماط مخزّنة (مرتّبة بالأولوية)
│     إصابة ⇒ **بثّ الإجابة فوراً** بلا OpenAI إطلاقاً  ← أسرع مسار
│
├─⑤ قاعدة المعرفة ──────── kb-service.kbSearch()
│     تسجيل نقاط في الذاكرة (0..10) = (رموز مطابَقة ÷ إجمالي الرموز) × 10
│     score ≥ 4.0 ⇒ حقن النتائج كرسالة system موثوقة (لا قصر مسار)
│     ثابت KB_SHORT_CIRCUIT_ENABLED = false (خيار معطّل)
│
├─⑥ حارس النطاق ────────── scope-guard.classifyScope()  [نقي، بلا I/O]
│     يُتخطّى إن وُجدت إصابة KB
│     خارج النطاق (تحويل هجري / توقيت مناسبة) ⇒ بثّ FALLBACK_OUT_OF_SCOPE
│
├─⑦ بناء الرسائل ───────── [system prompt] + [kb context?] + [تاريخ المحادثة]
│
├─⑧ حلقة الأدوات ───────── function-calling-handler.resolveToolCalls()
│     تكرار 1: tool_choice = "required"  ← إجبار استدعاء أداة
│     تكرار 2-3: tool_choice = "auto"
│     temperature = 0، max_tokens = 200 (اختيار الأداة فقط)
│     تنفيذ متوازٍ لكل tool_calls عبر Promise.all
│
├─⑨ الاستدعاء النهائي ──── openai.chat.completions.create({ stream: true })
│     ⚠️ max_tokens = 500 ثابت (يتجاهل ما يرسله العميل)
│
├─⑩ createPendingLog() ─── إدراج صفّ في chat_logs → يُعاد id في X-Chat-Log-Id
│
└─⑪ ReadableStream ─────── بثّ الأجزاء + إلحاق "\n__VALID_IDS__:1,2,3" في النهاية
                           ثم updateChatLog() في finally
```

### 2.1 آلية منع الروابط المهلوسة (مهمة وفيها ثغرة تصميمية)

- الخادم يستخرج IDs المقالات الحقيقية من نتائج الأدوات (`extractValidArticleIds`) ويُلحقها في نهاية البثّ.
- **العميل** (`useChat.ts` و`widget.js`) هو من يحذف أي رابط `alkafeel.net/news` غير موجود في القائمة.
- ⚠️ الخادم يُعرِّف `stripInvalidLinks()` في `route.ts:107` **لكنه لا يستدعيها أبداً** — شيفرة ميتة.
- **النتيجة:** أي عميل لا يطبّق التنظيف (أو استدعاء API مباشر) يحصل على روابط مهلوسة كما هي. **الحماية تجميلية لا حقيقية.**

---

## 3. المشاكل الحرجة (✅ عولجت — التفاصيل في §11)

### ح-1 — تزوير جلسة الإدارة عند غياب `ADMIN_SESSION_SECRET`

`lib/server/admin-auth.ts:63-67`
```ts
function sign(data: string): string {
  return createHmac("sha256", process.env.ADMIN_SESSION_SECRET ?? "")
    .update(data).digest("base64url")
}
```

`lookupAdmin()` مغلق افتراضياً عند غياب البيئة (جيد)، **لكن `verifySession()` ليس كذلك**. و`requireAdmin()` يعتمد على `verifySession` فقط.

**السيناريو:** نُشر التطبيق بدون `ADMIN_SESSION_SECRET` (نسيان، بيئة جديدة، Preview deployment على Vercel) ⇒ مفتاح HMAC = سلسلة فارغة ⇒ أي مهاجم يعرف البنية (`base64url(JSON).signature`) يولّد كوكي صالحة ويحصل على:
- كامل سجل المحادثات وأسئلة المستخدمين (`/api/analytics`)
- تعديل/حذف الإجابات المنسّقة وقاعدة المعرفة ⇒ **التحكّم بما يقوله البوت باسم العتبة**

**العلاج:**
```ts
function getSecret(): string {
  const s = process.env.ADMIN_SESSION_SECRET
  if (!s || s.length < 32) throw new Error("ADMIN_SESSION_SECRET missing/too short")
  return s
}
// وفي verifySession: إن رمى getSecret ⇒ أعِد null (رفض) بدل القبول
```
+ فحص عند الإقلاع (fail-fast) + توثيق أن غياب السرّ = تعطيل اللوحة لا فتحها.

---

### ح-2 — XSS مخزّن عبر `renderMarkdown` + `dangerouslySetInnerHTML`

`components/chat/renderMarkdown.ts:31-56` — دالة `processPlainText` تهرّب `&` و`<` و`>` **فقط**، ولا تهرّب `"`:

```ts
.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
...
.replace(/!\[([^\]]*)\]\(([^)]+)\)/g,
  '<img class="gm-project-img" src="$2" alt="$1" loading="lazy" />')
```

نصّ مثل `![x](" onerror="…)` يكسر سمة `src` ويحقن معالج حدث. والنتيجة تُحقن في `MessageList.tsx:10` عبر `dangerouslySetInnerHTML`.

**نقاط أخرى بلا تهريب إطلاقاً في نفس الملف:**
- `buildContactCard` (س71-85): `seg.name` و`content` خام
- `buildSourcesBlock` (س87-174): `url`, `label`, `cardTitle`, `mp4Url`, `posterUrl` خام داخل `href=""` و`src=""`
- `buildGalleryBlock` (س19-29): `alt` و`thumbSrc` خام
- معالجات inline (`onclick=`, `onerror=`) مكتوبة يدوياً ⇒ يمنع تطبيق CSP صارم لاحقاً

**مسارات الاستغلال:**
1. **مخزّن (الأخطر):** حقن أمر داخل محتوى خبر/مشروع في قاعدة البيانات ⇒ يخرج في `description` ⇒ النموذج يعيد صياغته ⇒ يُنفَّذ في متصفح **كل** مستخدم يسأل عن الموضوع.
2. **مباشر:** رسالة المستخدم تُعرض هي أيضاً عبر `renderMarkdown`؛ المُنظِّف يحذف `<` و`>` لكنه **لا يحذف `"`**.
3. لا يوجد `javascript:` blocking في أي من الطريقين (لا في `renderMarkdown` ولا في `widget.js:_fmt`).

**العلاج:**
- دالة `escapeAttr()` تُطبَّق على كل قيمة تدخل سمة HTML (`"`, `'`, `&`, `<`, `>`)
- قائمة بيضاء للبروتوكولات: `https:`, `http:`, `mailto:`, `tel:` فقط — ورفض أي شيء آخر
- قائمة بيضاء للنطاقات في الصور (`alkafeel.net`, `projects.alkafeel.net`, `static1.alkafeel.net`)
- استبدال المعالجات المضمّنة بـ event delegation (موجود أصلاً في `MessageList.handleMsgClick`)
- إضافة `Content-Security-Policy` على صفحات التطبيق (حالياً غير موجودة إطلاقاً)

> ملاحظة: `public/widget.js:_fmt` **أفضل حالاً** لأنه يهرّب أولاً عبر `textContent` (فتتحول `"` إلى `&quot;`)، لكنه ما زال يسمح بـ `[نص](javascript:...)`.

---

### ح-3 — CORS مفتوح + Rate Limit في الذاكرة = استنزاف رصيد OpenAI

`app/api/chat/site/route.ts:140-164`
```ts
const ALLOWED_ORIGINS = [ ... ]   // ⚠️ مُعرَّف ولا يُستعمل أبداً — شيفرة ميتة

function getSecurityHeaders(origin?: string | null): HeadersInit {
  // السماح لأي origin لأن الودجت يُضمّن في مواقع خارجية
  return { "Access-Control-Allow-Origin": origin || "*", ... }
}
```

نقطة `/api/chat/site` **عامّة تماماً وبلا مصادقة**، وكل طلب فيها:
- 1–3 استدعاءات OpenAI لاختيار الأداة + 1 استدعاء بثّ
- استعلامات MySQL ثقيلة (§4.1)

الحماية الوحيدة = عدّاد في `Map` داخل الذاكرة (`rate-limiter.ts:43`). على Vercel/Serverless: كل instance له خريطته الخاصة، والـ instances تُنشأ وتُدمَّر ⇒ **الحدّ الفعلي = 20 × عدد الـ instances**، ويصفّر مع كل cold start.

وتزوير `x-forwarded-for` سهل لأن `getClientIP` يأخذ أول قيمة في الترويسة بلا تحقّق من الوكيل الموثوق.

**العلاج المرحلي:**
1. قائمة بيضاء حقيقية للـ Origins (استعمل `ALLOWED_ORIGINS` الموجود) + قصر `*` على `OPTIONS` فقط.
2. Rate limiting مشترك: Vercel KV / Upstash Redis / جدول MySQL بسيط.
3. رمز ودجت موقّع (widget token) قصير العمر يُصدره الخادم للنطاقات المصرّح لها.
4. سقف يومي للإنفاق على مستوى الجلسة والـ IP + تنبيه عند التجاوز.

---

## 4. مشاكل الأداء والقابلية للتوسّع

### 4.1 ⚠️ تحميل قاعدة البيانات كاملة إلى ذاكرة العملية

`lib/server/site-api-service.ts:243-244` — **أثر جانبي عند استيراد الوحدة**:
```ts
Promise.all([getAllNews(), getAllAbbas(), getAllHistory(), getAllVideos(), getAllProjects()])
```

- `getAllNews()` (`news-service.ts:102`): `SELECT ... FROM news WHERE active=1` — **بلا LIMIT، ومع عمود `content`**، ثم `mapNewsToItem` على كل صفّ (يبني `searchText` + جذور + هياكل ساكنة).
- `getAllVideos()`: 20,769 فيديو حسب وصف الأداة.
- كل مصدر يُخزَّن في متغيّر وحدة (module-level cache) لمدة 10 دقائق.

**العواقب:**
| المشكلة | التفصيل |
|---|---|
| استهلاك ذاكرة | مئات الميغابايت لكل instance (النصوص العربية UTF-16 في V8) |
| Cold start بطيء | كل instance جديد يعيد جلب كل شيء |
| `siteSearch` O(n) | تسجيل نقاط على **كل** العناصر لكل بحث (`site-api-service.ts:92-123`) — مع Levenshtein عند فشل المطابقة الحرفية |
| كاش غير متّسق | كل instance له نسخته → إجابات مختلفة لنفس السؤال حسب مَن ردّ |
| `refresh()` الإداري | يُبطل كاش **instance واحد فقط** — بقية الـ instances تبقى على البيانات القديمة حتى 5-10 دقائق |

**الاتجاه الصحيح:** نقل البحث إلى قاعدة البيانات (FULLTEXT مع ngram parser للعربية، أو MeiliSearch/Typesense/OpenSearch)، مع الاحتفاظ بالتسجيل الحالي كطبقة إعادة ترتيب (re-ranking) على أفضل 100 نتيجة فقط. أدوات التحليل (`analytics-service.ts`) تفعل هذا بالفعل بشكل صحيح — استخدمها كنموذج.

### 4.2 انفجار Connection Pools

| الملف | القاعدة | `connectionLimit` | `socketPath` |
|---|---|---|---|
| `db.ts:22` | ka_db | `DB_CONNECTION_LIMIT` (افتراضي **50**) | ❌ **لا يُمرَّر** |
| `projects-db-service.ts:33` | alkafeel_projects | نفس الرقم (50) | ✅ |
| `projects-service.ts:774` | alkafeel_projects (**مكرّر!**) | نفس الرقم (50) | ❌ |
| `chat-logger.ts:16` | logs | 5 | ✅ |
| `curated-service.ts:34` | logs | 3 | ✅ |
| `kb-service.ts:64` | logs | 3 | ✅ |
| `api/analytics/route.ts:12` | logs | 3 | ✅ |

**سبع بِرَك** لثلاث قواعد، حتى **114 اتصالاً محتملاً لكل instance**. مع 10 instances على Vercel ⇒ 1,140 اتصالاً ⇒ `max_connections` في MySQL (افتراضي 151) ينهار.

**زيادةً على ذلك — تسريب اتصال مؤكّد** في `news-service.ts:209-221`:
```ts
const projDb = await mysql.createConnection({...})
const [prows] = await projDb.query("SELECT COUNT(*) ...")   // إن رمى هنا…
await projDb.end()                                          // …لا يُنفَّذ أبداً
} catch (e) { console.error(...) }                          // والخطأ يُبتلع
```
كل استدعاء لـ `get_statistics` يفتح اتصالاً جديداً بدل استعمال البِركة الموجودة.

**العلاج:** بِركة واحدة لكل قاعدة في وحدة مركزية، `connectionLimit` منخفض (3–5 على Serverless)، `socketPath` موحّد، و`try/finally` حول `end()`.

### 4.3 كلفة الزمن (Latency)

الحدّ الأدنى لسؤال يستدعي أداة:
```
OpenAI اختيار أداة (~600-1200ms)
  + تنفيذ الأداة (DB — قد تكون مصحوبة بإعادة تحميل الكاش ~ثوانٍ)
  + احتمال fallback إلى search_projects (تنفيذ أداة ثانٍ)
  + createPendingLog (رحلة DB — مُنتظَرة قبل بدء البثّ!)
  + OpenAI البثّ النهائي
```
- `await createPendingLog(...)` قبل إنشاء `ReadableStream` (`route.ts:486`) يضيف رحلة DB كاملة إلى **زمن أول بايت**. يجب أن يكون `void createPendingLog(...)` غير مُنتظَر، مع تمرير الـ id لاحقاً أو استخدام UUID مولَّد محلياً.
- لا يوجد `export const maxDuration` في `route.ts` ولا في `vercel.json` ⇒ على خطط Vercel المحدودة قد يُقطع الطلب عند 10 ثوانٍ في منتصف الجواب.

### 4.4 استعلامات التحليلات ستتدهور مع الزمن

`app/api/analytics/route.ts` ينفّذ 11 استعلاماً، منها:
- `GROUP BY user_question` مرتين (على عمود `TEXT` بلا فهرس) → فرز مؤقّت على القرص
- `UNION ALL` + `GROUP BY` على كامل `chat_logs`
- لا يوجد **أي حدّ زمني** على الاستعلامات الإجمالية (`SELECT COUNT(*) FROM chat_logs` كاملاً)

مع 100 ألف سجلّ ستصبح اللوحة غير قابلة للاستخدام. **الحاجة:** سياسة احتفاظ (retention)، جداول تجميع (rollup) يومية، فهرس على `user_question(191)` أو عمود hash.

---

## 5. أخطاء وظيفية مؤكّدة (Bugs)

### ب-1 — 🔴 `search_projects_db` يرى 200 مشروعاً فقط من 358

`lib/server/projects-db-service.ts:197-212`
```sql
FROM projects p ... WHERE p.deleted_at IS NULL
${sectionFilter}
ORDER BY p.id
LIMIT 200          -- ← ثم كل الفلترة تحدث في Node.js
```
الفلترة والمطابقة التقريبية كلها تجري **بعد** القصّ. أي مشروع ترتيبه بعد الـ 200 (حسب `id`) **لا يمكن العثور عليه أبداً** — وهذا يشمل المشاريع الأحدث. وصف الأداة نفسه يقول "358 مشروع".

**العلاج:** نقل شرط البحث إلى `WHERE` في SQL (`LIKE` على `name`/`description`/`properties_text` بعد التطبيع)، أو رفع الحدّ إلى ما بعد إجمالي الصفوف مع كاش، أو FULLTEXT.

### ب-2 — 🔴 `limit` مُهمَل في `get_latest_projects`

`lib/server/site-api-service.ts:210`
```ts
case "get_latest_projects":
  return await siteGetLatest(undefined, args.section)   // ← args.limit مفقود
```
`siteGetLatest` افتراضه `limit = 2`. طلب "آخر 5 أخبار" يُعيد خبرين دائماً، رغم أن وصف الأداة يعد بـ "أقصى 20".

**العلاج:** `siteGetLatest(args.limit, args.section)`.

### ب-3 — 🔴 تشويه تاريخ المحادثة: أرقام هواتف المساعد تتحوّل إلى `[PHONE]`

`lib/server/data-sanitizer.ts:227-234` — `sanitizeMessages` يطبّق `sanitizeUserInput` (ومنها `maskPersonalInfo`) على **كل** الرسائل بلا تمييز دور:

```ts
export function sanitizeMessages(messages) {
  return messages.map(msg => ({ role: msg.role, content: sanitizeUserInput(msg.content) }))
}
```

السيناريو: يسأل المستخدم عن رقم قسم ⇒ المساعد يردّ بالأرقام ⇒ في **السؤال التالي** يُرسل العميل التاريخ كاملاً ⇒ كل الأرقام تصير `[PHONE]` ⇒ النموذج يفقد سياقه ويقول "الأرقام غير متوفرة" أو يخترع.

وكذلك `sanitizeUserInput` يقصّ كل رسالة عند **1000 محرف**، فالردود الطويلة تُبتر في التاريخ.

**العلاج:** إخفاء المعلومات الشخصية على رسائل `user` فقط؛ رسائل `assistant` تُنظَّف من HTML لا أكثر. (والتسجيل في `chat-logger.sanitizePII` يبقى كما هو — هناك موضعه الصحيح.)

### ب-4 — 🟠 `max_tokens = 500` ثابت يبتر الأجوبة

`route.ts:453-458` — الاستدعاء النهائي المتدفّق يستعمل `max_tokens: 500` و`temperature: 0.5` مثبّتين، ويتجاهل `max_tokens` (افتراضي 1200) و`temperature` القادمين من العميل. الواجهة ترسل 1200–2000 بلا أثر.

الأجوبة الطويلة (قوائم اتصال متعدّدة الأقسام، معارض صور، تحليلات مع عيّنات) **تُقطع في منتصفها**، وأخطر ما فيها أن كتلة "المصادر" تقع في نهاية الجواب فتضيع.

### ب-5 — 🟠 `OPENAI_API_KEY` مطلوب حتى للمسارات التي لا تستعمل النموذج

`route.ts:271-274` — فحص المفتاح يقع **قبل** المخزن المنسّق وقاعدة المعرفة وحارس النطاق. أي أن الإجابات المنسّقة (التي صُمّمت للعمل بلا OpenAI) تفشل بـ 500 عند غياب المفتاح.

هذا بالضبط سبب **6 من الاختبارات الفاشلة الـ 8** (§6).

**العلاج:** نقل الفحص إلى ما قبل السطر 432 مباشرةً (`if (use_tools)`).

### ب-6 — 🟠 `tool_choice: "required"` يُجبر البحث على التحيّات والشكر

`function-calling-handler.ts:563` — التكرار الأول يُجبر استدعاء أداة دائماً. حارس النطاق لا يلتقط إلا التحويل الهجري وتوقيت المناسبات، فرسائل مثل «شكراً»، «مرحبا»، «تمام» تذهب إلى بحث كامل في قاعدة البيانات + استدعاء نموذج إضافي.

**الأثر:** كلفة + زمن + احتمال جواب غريب على تحية بسيطة. والموجّه نفسه يطلب عكس ذلك (قسم «قاعدة الكلمات القصيرة أو الغامضة» في `system-prompts.ts:44-46`) — تناقض بين الموجّه والشيفرة.

### ب-7 — 🟠 التقاط الأخطاء يضاعف كلفة OpenAI

`route.ts:529-533` — أي خطأ في مسار الأدوات يسقط إلى «الوضع القياسي» الذي يستدعي OpenAI **مرة أخرى فوراً**. إن كان الخطأ الأصلي `429 rate limit` من OpenAI، فنحن نعيد المحاولة بلا تأخّر تصاعدي (backoff) — يفاقم المشكلة.

### ب-8 — 🟡 المنطقة الزمنية في أدوات التحليل

`analytics-service.ts:110-118` يفترض صراحةً أن `created_at` بتوقيت الخادم وأن الخادم متّسق مع القاعدة. على Vercel الخادم **UTC** بينما القاعدة على الأرجح **بغداد (UTC+3)** ⇒ نافذة «اليوم» و«آخر 7 أيام» مزاحة 3 ساعات ⇒ أعداد خاطئة عند حدود اليوم.

**العلاج:** تثبيت `TZ=Asia/Baghdad` في بيئة النشر، أو تمرير المنطقة صراحةً وبناء النوافذ بها.

### ب-9 — 🟡 غياب الحدّ الأقصى لعدد الرسائل

لا شيء يحدّ طول `messages` القادم من العميل. المستخدم (أو المهاجم) يستطيع إرسال 500 رسالة ⇒ سياق ضخم ⇒ كلفة ضخمة وبطء. الحدّ الوحيد 1000 محرف **لكل رسالة**، لا لمجموعها.

**العلاج:** الاحتفاظ بآخر 8–10 رسائل + سقف إجمالي للرموز (tokens).

### ب-10 — 🟡 نقطة التقييم مفتوحة وقابلة للتسميم

`app/api/chat/feedback/route.ts` — بلا مصادقة، بلا rate limit، بلا تحقّق من أن `chat_log_id` موجود أو يعود لهذه الجلسة. و`chat_log_id` رقم متسلسل يُكشف في ترويسة `X-Chat-Log-Id`.

⇒ يستطيع أي طرف إغراق `chat_feedback` بتقييمات سلبية على معرّفات متسلسلة، فتفسد لوحة التحليلات وقرارات التطوير المبنية عليها.

**العلاج:** ربط التقييم بـ `session_id` المسجَّل في `chat_logs`، rate limit، و`UNIQUE(chat_log_id, session_id)` لمنع التكرار.

### ب-11 — 🟡 `sanitizePII` يشوّه أرقام السجلات

`chat-logger.ts:75` — `.replace(/\b\d{14,16}\b/g, "[ID]")` يطبَّق على `final_answer`. أرقام هواتف العتبة بصيغة `009647700479212` طولها 15 رقماً ⇒ **تُحفظ في السجلّ كـ `[ID]`** ⇒ لا يمكن مراجعة صحّة إجابات الاتصال من لوحة التحليلات.

### ب-12 — 🟡 تناقض قاعدة السجلّات الاحتياطية

`curated-service.ts:40-44` و`kb-service.ts:70-75` و`chat-logger.ts:21`:
```ts
database: process.env.LOGS_DB_NAME || process.env.PROJECTS_DB_NAME || cfg.database || "local_chatbot_logs"
```
إن غاب `LOGS_DB_NAME` ⇒ جداول `chat_logs`, `curated_answers`, `kb_articles` **تُنشأ داخل قاعدة المشاريع الإنتاجية** عبر `CREATE TABLE IF NOT EXISTS` في وقت التشغيل. هذا يعني:
- خلط بيانات التشغيل ببيانات المحتوى
- الحاجة إلى صلاحيات DDL لمستخدم التطبيق في الإنتاج (خطر أمني بحدّ ذاته)
- والأدهى: `curated-service.seed()` سيبذر الجدول لأنه "فارغ" في القاعدة الخاطئة

**العلاج:** لا احتياطيات صامتة — إن غاب `LOGS_DB_NAME` فارمِ خطأً واضحاً؛ ونقل الـ DDL إلى Migrations خارج مسار الطلب.

### ب-13 — 🟡 `dbResultCount` عمود `SMALLINT`

`chat-logger.ts:42` — `db_result_count SMALLINT DEFAULT 0` (حدّه 32,767 موقّعاً). القيمة تأتي من `Math.max(validIds.size, countAllToolResults(...))`. آمنة اليوم (حدود الأدوات ≤ 20/30) لكنها هشّة إن رُفعت الحدود مستقبلاً — يُفضَّل `INT`.

---

## 6. حالة الجودة والاختبارات وقت التدقيق الأول (للسياق التاريخي — الحالة الآن في §11)

| الفحص | النتيجة |
|---|---|
| `npx tsc --noEmit` | ✅ **نظيف تماماً** (strict مفعّل) |
| `npx next lint` | ✅ يمرّ — 6 تحذيرات فقط (`<img>` بدل `next/image`, Google Font) |
| `npx jest` | ❌ **8 فاشل / 123 ناجح** — و**لا ينتهي أبداً بلا `--forceExit`** |

### 6.1 🔴 `npm test` لا ينتهي — `setInterval` غير مُحرَّر

`lib/server/rate-limiter.ts:75`
```ts
setInterval(cleanupOldEntries, CLEANUP_INTERVAL)   // على مستوى الوحدة، بلا unref()
```
Jest ينهي كل الاختبارات في ~1.1 ثانية ثم **يتعلّق للأبد** لأن حلقة الأحداث تبقى حيّة. `package.json` يعلن `"test:run": "jest --ci --runInBand"` بلا `--forceExit` ⇒ **أي CI pipeline سيتوقّف حتى انتهاء المهلة**.

**العلاج (سطر واحد):**
```ts
const t = setInterval(cleanupOldEntries, CLEANUP_INTERVAL)
if (typeof t.unref === "function") t.unref()
```

### 6.2 الاختبارات الفاشلة — كلها انحراف بين الشيفرة والاختبارات

| الملف | العدد | السبب الجذري |
|---|---|---|
| `route.site.integration.test.ts` | 6 | فحص `OPENAI_API_KEY` انتقل إلى ما قبل حارس النطاق (ب-5) ⇒ كل الحالات تُعيد 500 بدل السلوك المتوقّع |
| `analytics-service.sql.test.ts` | 1 | `matchClause` صار يبني `"% غزه%"` (حدّ كلمة) والاختبار ما زال يتوقّع `"%غزه%"` |
| `analytics-service.pure.test.ts` | 1 | خاصية `?` count تفشل على السلسلة الفارغة `""` بعد تغيّر `matchClause` |

**الأخطر أن هذا يعني:** التغييرات الأخيرة على `route.ts` و`analytics-service.ts` **نُشرت دون تشغيل الاختبارات**. الاختبارات مكتوبة جيداً (fast-check، mocking نظيف للـ DB والنموذج) لكنها فقدت قيمتها كشبكة أمان.

### 6.3 تعليقات توثيقية مضلّلة داخل الاختبارات

`function-calling-handler.test.ts` — الترويسة تقول «يتحقق أن `resolveToolCalls` يمرّر `tool_choice: "auto"` في التكرار الأول» بينما الاختبار نفسه (والشيفرة) يستعملان `"required"`. تعليق قديم لم يُحدَّث بعد تغيير السلوك.

### 6.4 فجوات التغطية

لا اختبارات إطلاقاً لـ:
- `renderMarkdown.ts` (أعلى مخاطرة أمنية في المشروع!)
- `kb-service.ts` و`curated-service.ts` (منطق المطابقة الذي يحدّد أي سؤال يُختصر مساره)
- `data-sanitizer.ts`
- `admin-auth.ts` (`verifySession`, `verifyPassword`)
- `projects-db-service.ts` (منطق البحث ذو الأربع خطوات + Levenshtein)
- أي اختبار واجهة (React Testing Library مثبّت لكن بلا استعمال)

---

## 7. الديون التقنية والصيانة

### 7.1 ~55 تبعية إنتاجية ميتة

فحصت كل حزمة مقابل الاستيرادات الفعلية. **المستخدم فعلياً:** `next`, `react`, `react-dom`, `openai`, `mysql2`, `lucide-react`.

**غير مستخدم إطلاقاً (0 استيراد):**
```
@anthropic-ai/sdk   @azure/openai   @google/generative-ai   @mistralai/mistralai
@supabase/supabase-js   @supabase/ssr   @xenova/transformers   langchain   ai
@radix-ui/* (25 حزمة)   @tabler/icons-react   @vercel/analytics   @vercel/edge-config
pdf-parse   mammoth   next-pwa   gpt-tokenizer   d3-dsv   endent   date-fns
i18next   react-i18next   next-i18n-router   react-markdown   remark-gfm   remark-math
react-syntax-highlighter   react-hook-form   next-themes   sonner   cmdk   uuid   zod
```

**الأثر:** حجم `node_modules` ضخم، بناء أبطأ، و**سطح هجوم سلسلة التوريد** واسع بلا مقابل. `@xenova/transformers` وحدها ثقيلة جداً.

**ملاحظة مرتبطة:** `.eslintrc.json` يشير إلى `tailwind.config.js` **وهو غير موجود** — بقايا قالب مشروع قديم (يبدو أن الأساس كان Chatbot UI).

### 7.2 شيفرة ميتة مؤكّدة

| الموضع | الوصف |
|---|---|
| `public/widget-loader.js` (399س) | نسخة قديمة كاملة من الودجت — **بلا أي مرجع** وتُخدَم علناً |
| `route.ts:99-134` | `extractNewsId` + `stripInvalidLinks` — مُعرَّفتان ولا تُستدعيان |
| `route.ts:140-145` | `ALLOWED_ORIGINS` مُعرَّف ولا يُستعمل |
| `route.ts:21` | استيراد `saveChatLog` بلا استخدام |
| `function-calling-handler.ts:614-715` | `executeFunctionCallingFlow` + `executeSimpleFunctionCall` — legacy بلا استدعاء |
| `faq.ts:searchFAQ` | استُبدلت بـ `curated-service` (تبقى `FAQ_ENTRIES` للبذر فقط) |
| `smart-suggestions.ts` | `generateOutOfScopeSuggestions`, `generateAmbiguousSuggestions`, `generateContextualSuggestions`, `formatSuggestionsForResponse`, `extractQueryFromMessage` — مستوردة في `function-calling-handler` لكن غير مستعملة |
| `public/worker-development.js` | بقايا next-pwa |
| `route.ts:26` | `KB_SHORT_CIRCUIT_ENABLED = false` — مسار كامل معطّل بثابت |

### 7.3 🟠 قيم ثابتة ستنكسر مع الزمن

`lib/server/system-prompts.ts:69`
```
**السنة الحالية = 2026** — إذا ذكر المستخدم شهراً بدون سنة → أضف سنة 2026
```
**في 1 يناير 2027 سيبدأ البوت بالبحث في سنة خاطئة لكل سؤال زمني.** يجب حقن التاريخ ديناميكياً:
```ts
`التاريخ اليوم: ${new Date().toLocaleDateString("ar-IQ", { timeZone: "Asia/Baghdad" })}`
```

**أرقام أخرى مثبّتة في الموجّه ووصف الأدوات** ستتقادم ويعلنها البوت كحقائق:
- «358 مشروع» (`system-prompts.ts:119`, `site-tools-definitions.ts:187`)
- «20,769 فيديو» (`site-tools-definitions.ts:300`)
- «4,084 مكاناً (892 فندقاً)» (`site-tools-definitions.ts:260`, `system-prompts.ts:170`)
- «43 قسماً» للفيديو (`site-tools-definitions.ts:331`)
- خرائط `type_id`: `2=تقارير، 3=انفوغراف` مكتوبة يدوياً في مكانين

**العلاج:** جلبها من `get_statistics` وحقنها في الموجّه عند الإقلاع (مع كاش)، أو حذف الأرقام من الصياغة.

### 7.4 موجّه بطول 412 سطراً — هشّ وباهظ

`system-prompts.ts` يُرسل **بالكامل مع كل طلب** (وفي كل تكرار من تكرارات اختيار الأداة). تقدير: 4,000–5,000 رمز × 2–4 استدعاءات لكل سؤال.

**مشاكل بنيوية فيه:**
- **قواعد متناقضة:** «لا تجب بدون أداة» مقابل «صحّح الخطأ الإملائي بالاعتماد على معرفتك بأسماء كيانات العتبة»
- **أحرف صينية مسرّبة** داخل النصّ العربي: `معلومات动态ة` (س25)، `它是 للبحث` (س110) — أثر ترجمة آلية، قد يشوّش النموذج
- 15+ قسماً بعناوين متشابهة، ودمج بين المنطق (متى تُستدعى أداة) والعرض (كيف تُنسَّق النتيجة)

**الاتجاه الصحيح:**
1. تقسيمه إلى: (أ) موجّه أساس ثابت مختصر، (ب) تعليمات عرض تُحقن **فقط** بعد معرفة الأداة المستدعاة، (ج) قواعد اختيار الأداة تنتقل إلى `description` الأدوات (مكانها الطبيعي).
2. تفعيل **Prompt Caching** — يخفّض كلفة الجزء الثابت بنسبة كبيرة.
3. توحيد قواعد العرض داخل الأدوات نفسها بدل الموجّه العام.

### 7.5 ازدواجية منطق العرض بين الواجهة الأصلية والودجت التابع

> اقرأ §0.1 أولاً: الواجهة الكاملة (`components/chat/*`) هي **المشروع**، و`widget.js` تابع للتضمين الخارجي. الاتجاه ليس «توحيد نسختين متكافئتين» بل **استخراج المشترك من الأصلية ليستهلكه التابع**.

منطق العرض مُنفَّذ **مرتين** بلغتين مختلفتين:

| المفهوم | ⭐ الواجهة الأصلية (React) | الودجت التابع |
|---|---|---|
| تحويل Markdown | `renderMarkdown.ts` (~370س بعد التهريب) | `widget.js:_fmt` (~18س) |
| تنظيف الروابط | `linkValidation.ts` | `widget.js:_stripInvalidLinks` |
| أزرار التقييم | `FeedbackButtons.tsx` | `widget.js:_renderFeedback` |
| البثّ | `useChat.ts` | `widget.js:_readStream` |
| معرض/بطاقات/فيديو | ✅ موجود | ❌ غير موجود |

الفجوة الوظيفية واسعة عمداً، لكن **الإصلاحات الأمنية يجب أن تصل للاثنين** — كما حدث في ح-2 (تهريب في الأصلية + منع `javascript:` في التابع). وهذا مصدر انحراف مؤكّد إن نُسي أحدهما.

**العلاج:** استخراج `META_LINE` + تنظيف الروابط + دوال `escapeHtml`/`safeUrl`/`safeAssetUrl` إلى وحدة مشتركة، تُستورد في React وتُبنى (bundle) للودجت — مع بقاء المزايا الغنيّة حكراً على الواجهة الأصلية.

### 7.6 غياب المراقبة والملاحظة (Observability)

- 27 نداء `console.log` في `lib/server` بمستوى واحد وبلا معرّف ارتباط (correlation id) ⇒ سجلّات متشابكة عند التوازي
- **لا تتبّع لاستهلاك الرموز أو الكلفة** — لا يوجد أي مكان يسجّل `usage` من ردّ OpenAI، ولا حقل له في `chat_logs`
- لا معدّل أخطاء، لا تنبيهات، لا فحص صحّة (`/api/health`)
- `console.log("[Tool Execution]", args)` يطبع مدخلات المستخدم كاملة في السجلّات

### 7.7 ملاحظات أصغر

- `.DS_Store` مُتتبَّع في Git (الجذر و`public/` و`scripts/`) — `.gitignore` يذكره لكنه أُضيف قبل ذلك
- `tsconfig.tsbuildinfo` (96KB) مُتتبَّع رغم أن `.gitignore` يستثني `*.tsbuildinfo`
- `vercel.json` فيه `"public": true` — يُتيح فحص السجلّات والمصادر علناً؛ يجب أن يكون `false`
- رسائل الخطأ الخام تُعاد للعميل: `Response.json({ error: err.message }, { status: 500 })` في كل مسارات `knowledge`/`curated`/`analytics`/`login` ⇒ تسريب أسماء جداول وقواعد بيانات
- `middleware.ts` يقبل أي `locale` (`/anything/admin`) — بلا قائمة بيضاء
- سجلّ Git: 20 من آخر 25 رسالة هي حرفياً `"push"` — تاريخ غير قابل للتتبّع أو المراجعة
- `scripts/seed-curated.ts` يحلّل `.env.local` بتعبير نمطي هشّ (`^\s*([A-Z_]+)\s*=`) يفشل مع القيم ذات علامات الاقتباس أو الأسطر المتعددة

---

## 8. تقييم نقاط القوة (ما يجب الحفاظ عليه)

لأنه من المهم عدم كسر ما يعمل جيداً:

1. **`analytics-service.ts` نموذج يُحتذى** — كل القيم عبر معاملات `?`، تطبيع عربي متماثل على طرفَي المطابقة (النمط والعمود)، حقل `basis` يوضّح أن الرقم تقريبي، قصر دائرة للنوافذ الفارغة، وتوثيق داخلي ممتاز. **استخدمه كمرجع لأي خدمة جديدة.**
2. **`scope-guard.ts`** — وحدة نقيّة حتمية بفلسفة «محافظة عند الشك»، مغطّاة باختبارات. تصميم صحيح.
3. **بنية الأدوات** — قائمة بيضاء (`isAllowedTool`) + توزيع مركزي (`executeToolByName`) + تنفيذ متوازٍ. إضافة مصدر جديد = ملف خدمة واحد + سطر في المحوّل.
4. **`admin-auth.ts`** — scrypt + HMAC + `timingSafeEqual` + رسالة فشل موحّدة تمنع تعداد المستخدمين. مكتفٍ ذاتياً بلا تبعيات (شريطة إصلاح ح-1).
5. **معمارية الطبقات الثلاث للجودة** (منسّق → معرفة → حارس نطاق → أدوات) — تصميم ذكي: يعطي تحكماً تحريرياً بشرياً فوق النموذج الاحتمالي، بأسرع مسار وأقلّ كلفة.
6. **حلقة التغذية الراجعة** — `chat_logs` + `chat_feedback` + لوحة تحليلات تُظهر «أسئلة بلا نتائج» و«أسئلة أُجيبت بلا أداة» و«مهام التحسين». هذه أصول تشغيلية حقيقية.
7. **`db.ts`** — خوارزميات التطبيع العربي (جذور، هياكل ساكنة، Levenshtein بسقف) مكتوبة بعناية وفعّالة للغة العربية.
8. **الودجت المستقل** — تحميل كسول (زرّ أولاً، اللوحة عند أول فتح)، `all:initial` لعزل أنماط الموقع المضيف، بلا تبعيات. هندسة جيدة.

---

## 9. خارطة طريق مقترحة (مرتّبة حسب العائد/المخاطرة)

### المرحلة صفر — إيقاف النزيف (أيام)
| # | المهمة | الملف |
|---|---|---|
| 1 | رفض الجلسة عند غياب/قِصَر `ADMIN_SESSION_SECRET` | `admin-auth.ts:63` |
| 2 | `unref()` على `setInterval` ⇒ إصلاح تعليق `npm test` | `rate-limiter.ts:75` |
| 3 | تهريب السمات + قائمة بروتوكولات بيضاء في `renderMarkdown` | `renderMarkdown.ts` كامل |
| 4 | نقل فحص `OPENAI_API_KEY` بعد مسارات القصر ⇒ يُصلح 6 اختبارات | `route.ts:271` |
| 5 | تمرير `args.limit` إلى `siteGetLatest` | `site-api-service.ts:210` |
| 6 | رفع `LIMIT 200` / نقل البحث إلى SQL | `projects-db-service.ts:209` |
| 7 | `maskPersonalInfo` على رسائل `user` فقط | `data-sanitizer.ts:227` |
| 8 | `try/finally` حول `projDb.end()` | `news-service.ts:213` |
| 9 | `vercel.json`: `"public": false` | `vercel.json` |

### المرحلة الأولى — الأمن والتكلفة (أسبوع)
- قائمة بيضاء حقيقية للـ Origins + رمز ودجت موقّع
- Rate limiting مشترك (Redis/KV) + سقف إنفاق يومي
- ربط `/api/chat/feedback` بالجلسة + rate limit + `UNIQUE`
- CSP على صفحات التطبيق + إزالة المعالجات المضمّنة
- إخفاء رسائل الخطأ الداخلية عن العميل
- سقف عدد الرسائل في التاريخ (8–10) وسقف رموز إجمالي
- `max_tokens` قابل للضبط (أو 1200 على الأقل)

### المرحلة الثانية — الأداء (أسبوعان)
- **الأهم:** نقل البحث النصّي إلى قاعدة البيانات (FULLTEXT/ngram أو محرّك بحث) ⇒ حذف `getAllNews()` وكاش الذاكرة كلياً
- توحيد الـ pools (واحدة لكل قاعدة، `connectionLimit` 3–5)
- `createPendingLog` غير مُنتظَر
- `export const maxDuration` + إعداد Vercel
- فهارس: `news(active, deleted_at, created_at)`، `chat_logs(created_at)`، تجميعات يومية للتحليلات
- سياسة احتفاظ لـ `chat_logs`

### المرحلة الثالثة — الصيانة (شهر)
- تنظيف `package.json` من ~55 تبعية ميتة + حذف الشيفرة الميتة
- إصلاح الاختبارات الثلاثة الفاشلة + إضافة تغطية لـ `renderMarkdown` و`kb-service` و`admin-auth`
- توحيد منطق العرض بين React والودجت في وحدة مشتركة
- تفكيك الموجّه + حقن التاريخ ديناميكياً + تفعيل Prompt Caching + إزالة الأرقام المثبّتة
- تسجيل `usage` (الرموز والكلفة) في `chat_logs` + `/api/health` + معرّف ارتباط في السجلّات
- نقل `CREATE TABLE` إلى Migrations خارج مسار الطلب
- تثبيت `TZ=Asia/Baghdad`

---

## 11.6 دقّة اختيار الأداة — قياس، إصلاح، وقياس مجدّداً — 2026-08-12

### السؤال
هل النموذج ذكي فعلاً في تمييز نيّة السؤال واختيار الصحيح من بين 19 أداة، أم
يخمّن؟ وهل يمكن الوصول لأعلى دقّة ممكنة؟

### الأداة: `npm run eval:selection`
`eval/tool-selection.ts` — 38 حالة بـ`temperature: 0` (شبه حتمي): 19 حالة أساسية
(سؤال مباشر واحد لكل أداة) + 19 حالة أزواج متشابهة يسهل الخلط بينها (عدّ/بحث،
مكان/مشروع، فيديو/بحث، اتصال/هوية، استنتاج نيّة بالعامية).

### القياس الأول: 78.9% (30/38) — واكتشاف عكس التوقّع

النتيجة المعكوسة كانت الأهمّ: **الأزواج "الصعبة" سجّلت 89.5%**، بينما **الحالات
"البسيطة" (أداة واحدة واضحة) سجّلت 68% فقط**. تتبّع السبب أثبته رقمياً:

| الأداة | ذُكرت في الموجّه |
|---|---|
| `list_news_categories`, `get_video_sections`, `top_topics`, `get_news_images` | **0 مرّة** |
| `search_places`, `search_contacts`, `search_videos` (لم تخطئ إطلاقاً) | 6–9 مرّة |

**العلاقة مباشرة: أداة غير مذكورة في الموجّه = يتجاهلها النموذج**، بصرف النظر
عن دقّة تعريفها الفني (JSON schema). النموذج ماهر في فهم النيّة الغامضة، لكنه
لا "يتذكّر" أداة لم يرَ لها مثالاً استخدام.

وفشلان إضافيان: **«من هو رئيس قسم الإعلام؟»** اختار `search_contacts` رغم قاعدة
موجودة تنصّ صراحةً على عكس ذلك — قاعدة مكتوبة كـ«ملاحظة» لطيفة فتجوهلت.

### الإصلاح — أربعة أسطر توجيه + تقوية قاعدة قائمة

بنفس نمط الأدوات الناجحة («استخدم X فوراً وبدون تردد عندما...»):
- 4 كتل توجيه جديدة لـ`list_news_categories`, `get_video_sections`, `top_topics`, `get_news_images`
- 4 صفوف في جدول الأدوات الرئيسي (أعلى الموجّه، أول ما يُقرأ)
- قاعدة أسئلة الهوية رُفعت من «ملاحظة» إلى «⛔ قاعدة صارمة» (نفس صرامة `search_places`)
- سطر توجيه لعامية «آخر خبر» (شنو اخر خبر، شكو جديد) بعد ظهور فجوة لهجة محدّدة

**لم يُلمس منطق التوزيع ولا الخدمات — تعديل نصّي في الموجّه حصراً.**

### القياس بعد الإصلاح: 78.9% → 94.7% → **97.4%** (37/38)

| الجولة | الإجمالي | الفئة الأساسية |
|---|---|---|
| قبل | 78.9% | 68% (13/19) |
| بعد الإصلاح الأول | 94.7% | **100%** (19/19) |
| بعد سدّ فجوة اللهجة | **97.4%** | 100% |

الإخفاق الوحيد المتبقّي متعمّد الغموض في تصميم الاختبار نفسه («هل يوجد تغطية
إعلامية لزيارة الأربعين؟» — لا فرق حقيقي بين خبر وفيديو هنا)، ولم يُمسّ الموجّه
لأجله تفادياً لِفرط الملاءمة (overfitting) على حالة اختبار واحدة اصطناعية.

**تحقّق حيّ على خادم فعلي** (لا محاكاة): الأسئلة الثلاثة التي كانت تفشل —
«أقسام مكتبة الفيديو»، «شنو اخر خبر»، «من هو رئيس قسم الإعلام» — اختارت
`get_video_sections` و`get_latest_news` و`search_content` على التوالي، مؤكَّدة
من سجلّ الخادم `[Function Call] Tool: ...`.

### الدرس العام
هذا **ثالث انحدار/فجوة يمسكها القياس** (بعد خلل ترتيب معاملات SQL في §11.2،
وفرضية فصل الموجّه المرفوضة في §11.4). النمط ثابت: **دقّة أدوات النموذج تتناسب
مع التكرار في الموجّه لا مع جودة تعريف الأداة**، وهذا مبدأ عملي لأي أداة تُضاف
مستقبلاً — تعريف JSON دقيق وحده لا يكفي، يلزمه سطر توجيه صريح بجانبه.

### التحقّق
`tsc` نظيف · `lint` بلا أخطاء · **285 اختباراً ناجحاً** · `npm run eval:selection` متاح لإعادة القياس بعد أي تعديل مستقبلي.

---

## 11.7 إضافة مصدرين جديدين كلياً — الإصدارات والتواصل الاجتماعي — 2026-08-13

### الاكتشاف
فحص كل الجداول غير المستخدمة في القاعدتين كشف مصدرَي بيانات حقيقيين بلا أي
أداة تصل إليهما:
- **`publications`** — 3,416 صفّاً (3,390 عربياً): كتب ومجلات ودراسات (سلاسل
  مناهل الطف، رياض الزهراء، عطاء الشباب، منشورات المكتبة...). كان سؤال «هل
  يوجد كتاب عن سيرة العباس؟» يذهب لـ`search_content` فيفشل — قاعدة منفصلة كلياً.
- **`social_media`** — 5 صفوف (فيسبوك، تويتر، إنستغرام، يوتيوب، تيليغرام)
  بروابط كاملة جاهزة. بلا أداة، كان البوت إمّا يرفض أو **يخترع** رابط حساب.

فحوصات استُبعدت بعد تحقيق فعلي لا افتراض: `zyara_categories` (750 صفّاً، بدت
واعدة لإدخال «متى الأربعين» ضمن النطاق) — **صفّ واحد فقط مفعّل بتاريخ حقيقي،
وليس عن الأربعين** — غير صالحة اليوم. `abouts` فارغ تماماً بلا أعمدة محتوى.
`partners` أسماء placeholder ("1", "2", "3") بلا نصّ حقيقي.

### البناء — نفس المعمارية المُثبَتة (4 طبقات، §1)
```
lib/server/publications-service.ts   lib/server/social-media-service.ts
lib/server/site-tools-definitions.ts  ← 3 تعريفات + القائمة البيضاء
lib/server/function-calling-handler.ts ← DIRECT_TOOL_HANDLERS (شكل نتيجة مختلف
                                          عن "مشروع" فتُوفَّر من cleanResultForGPT)
lib/server/system-prompts.ts          ← 3 كتل توجيه + 3 صفوف جدول (درس §11.6:
                                          أداة غير مذكورة بالاسم = يتجاهلها النموذج)
```

### ثلاثة أخطاء حقيقية اكتشفها الفحص الحيّ أثناء البناء — لا نظرياً

**١. لا كاش على مستوى الوحدة، بلا استثناء.** التزمت بقاعدتي الخاصة (§10):
كل استدعاء استعلام SQL مُعامَل طازج، لا تحميل شامل في الذاكرة — تفادياً لتكرار
درس §11.2 (تحميل 56,819 عنصراً كان يكلّف ثوانٍ عند كل إقلاع بارد).

**٢. تلوّث لغوي في التصنيفات.** `getPublicationCategories()` أعادت تصنيفات
بالأردية والتركية مختلطة بالعربية عند أول فحص حيّ — الجدولان متعدّدا اللغة
فعلياً. تحقّقت من جدول `languages`: `id=1` هو العربية. `publications.language_id`
صريح (1 لكل الصفوف العربية)، أمّا `publication_categories.language_id`
**يساوي NULL** للسلاسل العربية الأصلية (35 سلسلة) بينما الترجمات تحمل أرقاماً
صريحة >1 — تفصيل غير بديهي وثّقته في الشيفرة كي لا يُكرَّر الخطأ.

**٣. بحث AND الصارم يُفوّت نتائج حقيقية.** «هل يوجد كتاب عن سيرة أبي الفضل
العباس؟» اختارت الأداة الصحيحة **(search_publications)** لكن أعادت صفر نتيجة،
رغم وجود **10 إصدارات حقيقية** عن العباس (عليه السلام) — لأن الاشتراط الصارم
لكل الكلمات الأربع معاً («سيرة»+«أبي»+«الفضل»+«العباس») لم يطابق أي عنوان
حرفياً. أُضيفت **خطوة ثانية fallback** (بنفس نمط `searchProjectsDB` الراسخ في
`projects-db-service.ts`): عند فراغ AND، تُجرَّب OR مرتّبة بعدد الكلمات
المطابقة ثم المشاهدات. **بعد الإصلاح: 8 نتائج بدل صفر**، وتحقّق حيّ عبر مسار
الدردشة الكامل يعرض العناوين الفعلية بجواب طبيعي.

الاختبار الأهمّ هنا (`publications-service.test.ts`) يتحقّق تحديداً من سلامة
معاملات **الخطوة الثانية**: تعبير `matchCount` في `ORDER BY` يُكرّر أنماط
`WHERE` — بالضبط نوع التعقيد الذي أنتج خلل ترتيب المعاملات الصامت في
`search-engine.ts` سابقاً (§11.2). لن يتكرّر بصمت هنا؛ الاختبار يحرسه.

### القياس — 100% على 45 حالة (كانت 38)
أُضيفت 7 حالات جديدة لـ`eval:selection`: 3 أساسية (سؤال مباشر لكل أداة) + 4
أزواج متشابهة مصمَّمة عمداً لاختبار الفخّ المتوقّع (إصدار يُخلط مع خبر، عامية
عراقية لكلٍّ من الإصدارات والتواصل الاجتماعي، وحالة تمييز: خبر *عن* كتاب
جديد يجب أن يبقى `search_content` لا `search_publications`).

```
── حسب الفئة ──
   22/22  (100%)  أساسي         (شمل: b-pub-search, b-pub-cats, b-social)
   3/3    (100%)  إصدارات/أخبار
   1/1    (100%)  تواصل اجتماعي
   … (بقية الفئات القديمة 100% كما في §11.6، بلا انحدار)
── الإجمالي ──
   45/45  (100.0%)
```

### ✅ روابط الملفات الثلاثة — فُعِّلت بالكامل (2026-08-13، بعد تأكيد المالك)
زوّدني المالك بثلاث عيّنات حقيقية من الموقع على دفعتين:
```
https://alkafeel.net/publications/pdf/a31f46fd82.pdf   (تصفّح)
https://alkafeel.net/publications/down/a855cc01de.zip  (تحميل)
https://alkafeel.net/publications/img/c798fbfe41.png   (غلاف — أُضيفت لاحقاً)
```
تحقّقت أولاً من عيّنة 8 صفوف حقيقية: عمودا `pdf`/`download_link` ينتهيان
بامتدادهما المتوقّع دائماً (`.pdf`/`.zip`) — القيمة المخزَّنة اسم ملف **كامل
بامتداده**، وكل عمود بمساره الخاص (`/pdf/`، `/down/`، `/img/`) لا نفس المسار
بامتداد متغيّر.

**فحص إضافي مهمّ عند إضافة `image`:** أول عيّنة (8 صفوف) كانت كلها `.jpg`
صدفةً، وكاد ذلك يُوهم بامتداد ثابت. مثال المالك جاء `.png` فناقض الافتراض —
فحصت **توزيع الامتداد على كامل الجدول** بدل الاكتفاء بعيّنة صغيرة: 2,946 jpg
+ 439 png + 5 gif من 3,390 صفّاً عربياً. الامتداد **غير ثابت فعلاً**، فيُؤخذ من
القيمة المخزَّنة نفسها حرفياً — لا افتراضاً واحداً يُطبَّق على الكل. هذا مثال
مباشر على قاعدة المشروع: عيّنة صغيرة قد تُخفي تبايناً حقيقياً في البيانات.

النتيجة: `publicationAssetUrl(segment, filename)` دالة واحدة تخدم الحقول
الثلاثة، وكل نتيجة تحمل `image_url`/`pdf_url`/`download_url` (أو `null` عند
غياب الملف — بلا رابط مكسور أبداً).

**تحقّق حيّ عبر مسار الدردشة الكامل** (سؤال: "أرني غلاف مجلة رياض الزهراء"):
```
![مجلة رياض الزهراء](https://alkafeel.net/publications/img/27c7fa19c5.png)
📖 *مجلة رياض الزهراء* — 🔗 [تصفّح PDF](https://alkafeel.net/publications/pdf/51573d5bd0.pdf) · [تحميل](https://alkafeel.net/publications/down/dc7852a95f.zip)
```
صورة الغلاف تُعرض مباشرة (نطاق `alkafeel.net` ضمن `ALLOWED_IMAGE_HOSTS` في
`renderMarkdown.ts` أصلاً — لم يلزم أي تعديل هناك)، وروابط PDF/التحميل حقيقية
قابلة للنقر، لا مُخترعة. **لا مجهول متبقٍّ في هذا المصدر.**

`get_social_media_links` **لم تحتج أي تأكيد إضافي أصلاً** — عمود `link` في
جدول `social_media` يخزّن الرابط الكامل الجاهز مباشرة (وثّقته وتحقّقت منه في
الجولة الأولى)، بخلاف `publications` حيث الأعمدة أسماء ملفات مجرّدة تحتاج
بناء مسار.

### 🔴 خلل «العدد المضلّل» — أمسكه فحص المالك، لا أنا

بعد النشر مباشرةً سأل المالك «كم عدد الاصدارات لدينا» عبر الواجهة الحيّة، فردّ
البوت: **«لا تتوفر في قاعدة بيانات شبكة الكفيل معلومات عن عدد الإصدارات
المتاحة»** — رغم اختياره `search_publications` بشكل صحيح تماماً.

**السبب:** `data.total` كانت مساوية لـ`results.length` — أي طول المصفوفة
**بعد** حدّ `LIMIT` (8 افتراضياً)، لا العدد الحقيقي (3,390). النموذج، إذ رأى
`total: 8` يطابق حدّ الصفحة تماماً، رفض (محقّاً) اعتماده كإجابة ورفض أيضاً
الاختراع، فسقط في رفض الإجابة كلياً. **نفس فصيلة خلل «العدد المضلّل» الذي
أُصلح لـ`search_content` في §11.2/§7 (total_is_partial)** — أعدت إنتاجه هنا
سهواً رغم معرفتي المسبقة بالنمط، لأنني لم أختبر سؤال عدّ صريحاً وقت البناء.

**الإصلاح:** كل طبقة بحث (AND ثم OR الاحتياطية) تنفّذ الآن **نداءين**:
`SELECT` بحدّ `LIMIT` للعرض، و`COUNT(*)` بنفس شرط `WHERE` (بلا `LIMIT` ولا
معاملات `ORDER BY`) للعدّ الحقيقي. حقل جديد `returned` يحمل طول المصفوفة
المعروضة فعلياً، و`total` صار عدداً موثوقاً دائماً. أُضيف توجيه صريح في
الموجّه: خلافاً لـ`search_content.total` (تقريبي، محظور استعماله للعدّ)،
`search_publications.total` **موثوق ويُستعمل مباشرة**.

**تحقّق حيّ:**
```
searchPublications({})                                  → total=3390 (133ms)
searchPublications({query:"سيرة أبي الفضل العباس"})      → total=23   (61ms)
```
وعبر الدردشة الفعلية، بنفس سؤال المالك حرفياً («كم عدد الاصدارات لدينا»):
> «عدد الإصدارات المتوفرة في قاعدة بيانات شبكة الكفيل هو **3390** إصداراً...»

**الدرس:** لم يكفِ تذكّر النمط من إصلاح سابق — لزم اختبار **سؤال عدّ صريح**
وقت البناء الأول، لا الاكتفاء باختبارات البحث والفلترة. أُضيف اختبار مخصّص
(`total عدد حقيقي لا طول النتائج المعروضة`) يحرس هذا تحديداً في
`publications-service.test.ts`.

### التحقّق النهائي (بعد إصلاح العدّ)
`tsc` نظيف · `lint` بلا أخطاء · **309 اختباراً ناجحاً / 19 ملفاً** · `next build`
ناجح · فحص حيّ يطابق سؤال المالك الحرفي.

### التحقّق
`tsc` نظيف · `lint` بلا أخطاء · **306 اختباراً ناجحاً / 19 ملفاً** · `next build`
ناجح · `npm run eval:selection` 100% (45/45) · فحص حيّ لكل مسار عبر
`/api/chat/site` الفعلي، بما فيها إعادة الفحص بعد إصلاح الخطوة الثانية وتفعيل
الحقول الثلاثة (image_url/pdf_url/download_url) بروابط حقيقية.

### الملفات المضافة
```
lib/server/publications-service.ts
lib/server/social-media-service.ts
lib/server/__tests__/publications-service.test.ts
lib/server/__tests__/social-media-service.test.ts
```

---

## 11.8 خلل «رقم عدد خاطئ بثقة كاملة» — تشخيصان، الأول خاطئ صححه المالك — 2026-08-13

### التقرير الأول
عبر الفحص الحيّ، طلب المالك «العدد ٥٠ من مجلة الرياحين»، فأعاد البوت **العدد
١٧٥** (مع صورته) بثقة كاملة، كأنه المطابقة الصحيحة.

### تشخيصي الأول — ناقص، وأنتج إصلاحاً بالغ التقييد
افترضت خطأً أن رقم العدد **لا يُخزَّن كرقم إطلاقاً**، استناداً إلى أن أول ~27
عنواناً في السلسلة مكتوبة بألفاظ عربية («العدد الخمسون») وبقيتها عناوين
عامّة بلا رقم بالنصّ. بنيت على هذا فلتراً: أي طلب فيه رقم صريح لا يحويه نصّ
عنوان أي نتيجة ⇒ رفض صادق (`total=0`) بدل بديل خاطئ. بدا الإصلاح صحيحاً في
اختباراتي، **لكنه كان خاطئاً من أساسه** — لم أفحص كل أعمدة الجدول قبل الحكم.

**نبّهني المالك مباشرة** بطلبَي فحص حقيقيَّين لم يُجب عليهما البوت: «العدد ٦٠
من مجلة رياض الزهراء» و«العدد رقم ٥٠ من مجلة الرياحين» — كلاهما رُفض برسالة
«لا تتوفر معلومات»، رغم وجودهما فعلاً. رفض إصلاحي طلبات **صحيحة** بقدر ما منع
طلبات خاطئة — إصلاح أعمى بلا فهم كامل للبيانات.

### التشخيص الحقيقي (بعد `SHOW COLUMNS FROM publications`)
يوجد عمود **`version`** (varchar) **منفصل تماماً عن `title`** يخزّن رقم العدد
الحقيقي لكل صفّ، بصرف النظر عن نصّ العنوان:
```
id=847  title="مجلة الرياحين"        (بلا رقم بالنصّ!)  version="50"   ← الصحيح
id=62   title="رياض الزهراء"          (بلا رقم بالنصّ!)  version="60"   ← الصحيح
id=3166 title="مجلة الرياحين"        (بلا رقم بالنصّ!)  version="175"  ← ما أعادته النسخة القديمة خطأً
```
البحث — بنسختيه الأولى والثانية معاً — كان يعتمد **حصراً على نصّ العنوان**،
فلا علاقة له بعمود `version` إطلاقاً. هذا يفسّر الخللين معاً: النسخة الأصلية
خمّنت عبر كلمات نصّية عامة («رياحين»، «العدد») فأصابت رقماً عشوائياً (175)؛
إصلاحي الأول رفض أي تخمين نصّي فصار يرفض حتى ما هو موجود فعلاً بلا تخمين على
الإطلاق طالما لا يحوي العنوان الرقم — لأن مصدر الحقيقة الفعلي (`version`) لم
يُستشَر قط في أيّ من النسختين.

### الإصلاح الحقيقي
أُعيدت بنية `searchPublications()`: توكن رقمي واحد بالضبط في الاستعلام ⇒
مطابقة **حصراً** عبر `p.version = ?` (بعد تحويل الأرقام الهندية ٠-٩ إلى
غربية)، مع تضييق اختياري ببقية الكلمات (اسم السلسلة) لتمييز سلاسل تشارك نفس
رقم العدد. **بلا سقوط** لبحث AND/OR النصّي إن لم يُعثر على الرقم — نتيجة
فارغة صادقة تبقى أفضل من عدد آخر. مسار AND/OR النصّي القديم (§11.7) لم يُمسّ
ويبقى للاستعلامات بلا رقم صريح واحد (مثل «سيرة أبي الفضل العباس») أو بأكثر
من رقم (حالة نادرة تُبقي حماية الفلتر السابقة كخط دفاع أخير). أُضيف أيضاً حقل
**`issue_number`** لكل نتيجة (من `version`، ويُعرض فقط إن كان رقماً صرفاً —
فحصّ حيّ كشف صفوفاً يخزّن `version` فيها نصّاً غير رقمي مثل "عش السلام"، فلا
يُعرض كرقم عدد إطلاقاً) ليتحقّق النموذج من الرقم المطابق قبل التأكيد.

### خلل ثانٍ اكتُشف أثناء التحقّق الحيّ: النموذج يحذف الرقم من الاستدعاء
بعد إصلاح `version`، أعاد الفحص الحيّ لنفس سؤال المالك حرفياً («اريد العدد
رقم ٥٠ من مجلة الرياحين») **نفس الخلل القديم** رغم أن `searchPublications()`
تُثبت مباشرة أنها تعمل بشكل صحيح تماماً لنفس النصّ. تتبّع سجلّ الخادم (`console.log`
مؤقّت لمعامَلات النداء) كشف السبب الحقيقي: **النموذج نفسه** استدعى الأداة
بـ`query: "الرياحين"` فقط — حذف الرقم "٥٠" كلياً قبل حتى وصوله للخدمة. لا
علاقة للخلل بطبقة البيانات إطلاقاً هنا؛ المشكلة في وصف الأداة/الموجّه، إذ لم
يكن هناك أي تعليمة تُلزم النموذج بالإبقاء على الرقم داخل `query`.

**الإصلاح:** أُضيف تحذير صريح في `parameters.query.description` (في
`site-tools-definitions.ts`) وفي كتلة توجيه `search_publications` بالموجّه
(`system-prompts.ts`): يجب وضع الرقم **كرقم داخل query حرفياً** مع اسم
السلسلة، ولا يُكتفى باسم السلسلة وحده أبداً. كما أُضيف توجيه للتحقّق من حقل
`issue_number` في النتيجة قبل تأكيد أنه العدد المطلوب.

### التحقّق الحيّ النهائي (بعد كلا الإصلاحين، وبعد إعادة تشغيل الخادم يدوياً)
> «اريد العدد رقم ٥٠ من مجلة الرياحين» → «العدد رقم ٥٠ من مجلة الرياحين
> متوفر... [رابط PDF/تحميل حقيقيان]» — `__VALID_IDS__:847` (الصفّ الصحيح تماماً)

> «اريد العدد ٦٠ من مجلة رياض الزهراء» → «العدد 60 من مجلة رياض الزهراء صدر
> في رمضان 1433 هـ...» — `__VALID_IDS__:62` (الصفّ الصحيح تماماً)

> «اريد العدد ٩٩٩٩ من مجلة الرياحين» (رقم غير موجود فعلاً، فحص سلبي) → «لا
> تتوفر... معلومات عن العدد ٩٩٩٩» — رفض صادق صحيح، لا بديل مختلق.

تحقّق أيضاً أن الإصلاحات الأقدم لم تنتكس: «كم عدد الاصدارات لدينا» → 3390
(حين يختار النموذج `search_publications`؛ لاحظت **أحياناً** يختار `count_news`
خطأً لنفس السؤال — تذبذب اختيار أداة موجود مسبقاً وغير ناتج عن تغييرات هذا
القسم، يستحق متابعة منفصلة لاحقاً)، «سيرة أبي الفضل العباس» → نتائج AND/OR
الصحيحة كما في §11.7 غالباً (رصدت أيضاً تذبذباً طفيفاً هنا عبر `eval:selection`
— راجع ملاحظة أدناه).

**⚠️ ملاحظة اختيار الأداة:** `npm run eval:selection` سجّل 43/45 (95.6%) في
جولتين متتاليتين بعد هذا الإصلاح (كان 45/45 قبل التعديلات)، لكن **الإخفاقات
تغيّرت بين الجولتين** (فشلت حالات مختلفة تماماً، بعضها لا علاقة له بـ
search_publications مثل توجيه سؤال فيسبوك) — مؤشّر على تذبذب طبيعي في اختيار
النموذج للأداة عبر الاستدعاءات المتكررة، لا انحداراً ثابتاً سبّبه هذا
التعديل تحديداً. يستحق قياساً مخصّصاً منفصلاً (تكرار كل حالة عدّة مرات) لو
احتاج المالك حسماً قاطعاً.

**⚠️ ملاحظة منهجية (مكرّرة من الفحص الحيّ الأول):** خادم Next dev لم يُحدَّث
تلقائياً بعد تعديل ملف خدمة عميق الاستيراد أكثر من مرة في هذا القسم وحده؛
لزم `kill` وإعادة تشغيل يدوية لضمان أن أي فحص حيّ يعكس الكود الفعلي الحالي.

**الدرس الأهمّ في هذا القسم:** إصلاح مبنيّ على فحص جزئي للبيانات (عنوان فقط،
بلا فحص كل الأعمدة) قد يبدو منطقياً ومُختبَراً بالكامل، لكنه يبقى خاطئاً إن
فاته عمود بيانات حقيقي هو مصدر الحقيقة الفعلي. `SHOW COLUMNS` على الجدول
كاملاً كان يجب أن يسبق أي افتراض حول "أين يُخزَّن رقم العدد"، لا أن يأتي بعد
اعتراض المستخدم.

### اختبارات جديدة/معدَّلة
`publications-service.test.ts`: استُبدل اختبارا الفلتر النصّي القديم بمجموعة
اختبارات لمسار `version` الجديد (رقم+سلسلة، رقم مجرّد، أرقام هندية، رقم غير
موجود، فلتر تصنيف)، واختبار `issue_number` (رقم صرف يُعرض، نصّ غير رقمي أو
غياب يُصبح `null`)، وأُبقي اختبار واحد لحالة ≥2 توكن رقمي (نادرة) يحرس مسار
الحماية النصّية القديم.

### التحقّق
`tsc` نظيف · **316 اختباراً ناجحاً / 19 ملفاً** · فحص حيّ عبر `/api/chat/site`
الفعلي بصياغة المالك الحرفية لكلا السؤالين، وبفحص سلبي (رقم غير موجود).

---

## 11.9 ثلاثة مصادر جديدة + إصلاح كلفة زمنية + قياس تذبذب — 2026-08-14

بعد سؤال المالك عن "ماذا لدينا بعد لنكون أذكى وأدوات أخرى تفيد المستخدم"، فحصت
**كل** جداول القاعدتين غير المستخدمة (٨٠+ جدولاً) بحثاً حياً لا تخميناً —
نفس منهجية اكتشاف publications/social_media في §11.7. معظمها فارغ أو
placeholder (كما `zyara_categories`/`abouts` سابقاً)، لكن ثلاثة مصادر حقيقية
ونشطة برزت، فبناها المالك بالتسلسل مع إصلاحين إضافيين.

### ١. سجلّ المفقودات (`search_lost_items`) — `lost_items` (24,447 صفّاً)
هويات ومستمسكات (بطاقة وطنية، جواز سفر...) عُثر عليها وسُجّلت باسم صاحبها —
تحقّقت من `lost_item_types` (36 نوعاً رسمياً) لتأكيد الطبيعة. بما أن الغرض
الأصلي من نشرها أصلاً تعريف صاحبها بها، البحث باسم محدَّد لا يزيد كشفاً عن
الغرض المعلَن للبيانات — بخلاف تصفّح جماعي، **ممنوع كلياً**: استعلام فارغ
يُرفض فوراً (`success:false`، صفر نداءات DB) قبل أي محاولة بحث.

**خلل حقيقي اكتُشف بفحص حيّ أثناء البناء نفسه:** توكن بحرفين مثل "لا" (أداة
نفي، لا اسم) طابق عبر `LIKE %لا%` أي اسم يحويه بأي موضع (مثل "علاء") فأعاد
اختبار سلبي بسيط **3,515 "نتيجة"** بدل رفض صادق. الحدّ الأدنى لطول التوكن
رُفع من 2 إلى 3 أحرف خصّيصاً لهذه الخدمة (أسماء عربية مفردة بحرفين حقيقية
نادرة جداً) — أُصلح **قبل** الشحن لا بعده، بخلاف نمط "العدد الخاطئ" في §11.8.
النتائج تُعرض دائماً كـ"احتمال" لا تطابق قاطع (توجيه صريح في الموجّه)، وتنصح
بمراجعة الإدارة شخصياً للاستلام — لا استلام عبر الدردشة بداهة.

### ٢. البثّ المباشر (`get_live_streams`) — `live_streams` (6 صفوف)
كاميرات حقيقية (الضريح، الصحن، مدخل الحرم...) بروابط HLS مباشرة على
`stream.alkafeel.net` (تحقّقت من الروابط الستّة). عمود `title` نصّ JSON خام
متعدّد اللغة (`{"ar": "...", ...}`) — يُستخرج مفتاح "ar" في JS. صفّ واحد فقط
عادة `active=1` في أي لحظة (الكاميرا المعروضة فعلياً)؛ الموجّه يُلزم بعرض
النشطة فقط، وبقول صريح إن كانت كلّها معطّلة بدل تقديم رابط قد لا يعمل. لم
يُبنَ `image_url` (اسم ملف مجرّد بلا مسار أساس مؤكَّد، بخلاف publications) —
لا تخمين مسار.

### ٣. أرشيف خطب الجمعة (`search_friday_sermons`) — `friday_sermons` (462 خطبة)
نصوص خطب كاملة لخطيبَي العتبة (تحقّقت من `friday_preachers`: السيد أحمد
الصافي، الشيخ عبد المهدي الكربلائي). **اكتشاف حاسم قبل الشحن:** أحدث خطبة
مسجَّلة (`id=484`) تاريخها الفعلي **28/02/2020** (`created_at` يؤكّد ذلك،
بخلاف `updated_at` الأحدث بكثير — ترحيل جماعي للبيانات لا تحديث محتوى حقيقي)؛
**لا خطب مسجَّلة بعد هذا التاريخ إطلاقاً**. لولا هذا الفحص لكان البوت سيصف
خطبة عمرها سنوات بـ"آخر خطبة" أو "هذا الأسبوع" مضلِّلاً المستخدم — نفس فصيلة
مبدأ عدم التضليل الملتزَم به في كل مكان آخر بالمشروع. الموجّه يُلزم بذكر
تاريخ الخطبة الحقيقي صراحةً دائماً؛ تحقّق حيّ لاحق أكّد الالتزام الفعلي بهذا
(انظر أدناه). `content` (~1,200 حرف، ملخّص) يُعاد لا `first_sermon`/
`second_sermon` (~15,000+ حرف لكل منهما) تفادياً لإغراق الاستجابة؛
`first_sermon_video_id`/`second_sermon_video_id` مفاتيح أجنبية حقيقية إلى
`video_files.id` (تحقّقت بربط مباشر) فتُبنى روابط mp4 فعلية بنفس نمط
`video-service.ts`، لا تخميناً.

### ٤. إصلاح كلفة زمنية — `createPendingLog` لم يعد يحجب أول بايت
مذكور في §4.3 كمشكلة أداء غير مُصلَحة منذ الجرد الأصلي: كل مسار من الستّة
(المخزن المنسّق/قاعدة المعرفة/التسلية/حارس النطاق/الأداة/fallback) كان
ينفّذ `await createPendingLog(...)` بمعزل تماماً قبل بدء `ReadableStream`،
فيضيف رحلة DB كاملة أمام أول بايت من كل استجابة.

**القيد الحقيقي الذي منع حلاً ساذجاً (`void` بلا انتظار):** الـ id الحقيقي
(`BIGINT AUTO_INCREMENT`) يصل الواجهة عبر ترويسة `X-Chat-Log-Id` **متزامنة**
عند بناء `Response`، ويُستهلك لاحقاً بـ`chat_feedback.chat_log_id` (مفتاح
أجنبي حقيقي) عند ضغط المستخدم 👍/👎 — فقدان الـ id الحقيقي يكسر زرّ التقييم
كلياً. إعادة تصميم الترويسة إلى ملحق داخل الـ stream (كـ`__VALID_IDS__`)
كانت ستحلّ المشكلة جذرياً لكنها تمسّ ميزة أمامية تعمل فعلاً (`useChat.ts`،
`FeedbackButtons.tsx`) بمخاطرة أكبر من العائد المُقاس.

**الحلّ المُطبَّق:** وعد واحد `pendingLogPromise = createPendingLog(...)`
يُبدأ فور معرفة `session_id`/`lastMessage.content` (بعد التطهير مباشرة)،
**قبل** أي من matchCurated/kbSearch/classifyScope/نداءات OpenAI اللاحقة —
كل المسارات الستّة تستهلك نفس المرجع بالضبط (`lastMessage` عنصر واحد في
`sanitizedMessages`). كل موقع `await createPendingLog(...)` استُبدل بـ
`await pendingLogPromise`. بحلول أي نقطة استهلاك فعلية، يكون الإدراج
الصغير (صفّ واحد على قاعدة محلّية) قد اكتمل عملياً غالباً وراء الكواليس أثناء
انشغال الكود بعمليات أطول بكثير (matchCurated، kbSearch، أو نداءات OpenAI
التي تستغرق 600-1200ms+) — فيتحوّل الانتظار اللاحق إلى شبه معدوم دون أي
تغيير في العقد الظاهري (الترويسة، شكل الاستجابة، سلوك زرّ التقييم).

**تحقّق حيّ للسلسلة كاملة بعد الإصلاح** (سؤال حقيقي → ترويسة → تقييم → DB):
```
POST /api/chat/site  →  x-chat-log-id: 316
POST /api/chat/feedback {chat_log_id:"316", rating:"helpful"}  →  {"success":true}
SELECT chat_logs WHERE id=316        → الصفّ الكامل موجود وصحيح (tool_called، final_answer...)
SELECT chat_feedback WHERE chat_log_id=316  → صفّ تقييم واحد، FK سليم
```
لا انتكاس في مسار الترويسة أو زرّ التقييم.

### ٥. قياس تذبذب اختيار الأداة (مهمّة قياس صرفة، لا إصلاح شامل)
أُضيفت 8 حالات جديدة لـ`eval:selection` (3 أساسية + 5 أزواج متشابهة مصمَّمة
عمداً: مفقودات/اتصال، بثّ مباشر/فيديو مسجَّل، خطبة/خبر عام) ثم شُغِّل 3 مرات
متتالية لقياس التذبذب (لا مرّة واحدة، تعلّماً من §11.8):

```
جولة 1:  53/54 (98.1%)  — إخفاق واحد: "عدد التقارير..." → search_content
جولة 2:  52/54 (96.3%)  — إخفاقان: + "سيرة أبي الفضل العباس" → search_content
جولة 3:  52/54 (96.3%)  — نفس إخفاقَي الجولة 2 بالضبط
```

**النتيجة الحاسمة: الأدوات الثلاث الجديدة 100% في الجولات الثلاث (18/18
حالة فردية)** بما فيها أزواج التمييز المتعمَّدة — لا تذبذب، لا حاجة لمزيد
من التوجيه. أمّا الإخفاقان المتبقّيان فمن الحالات **القديمة** غير المرتبطة
بعمل اليوم إطلاقاً: "عدد التقارير الخبرية المنشورة هذا الشهر" أخفق **3 من 3**
مرّات (search_content بدل count_news) — **ليس تذبذباً بل خللاً منهجياً
قابلاً للإصلاح** يستحق جلسة توجيه مخصّصة لاحقاً؛ "سيرة أبي الفضل العباس"
أخفق مرّتين من ثلاث — تذبذب حقيقي بحدود الاحتمال، لا نمط ثابت. كلاهما خارج
نطاق عمل اليوم، مُسجَّل هنا كأثر قياس صادق لا كمهمة مُنجَزة.

### التحقّق النهائي لكل ما سبق
`tsc` نظيف · **347 اختباراً ناجحاً / 22 ملفاً** (زيادة 31 اختباراً: 17
مفقودات + 5 بثّ مباشر + 9 خطب جمعة) · فحص حيّ مباشر لكل خدمة عبر القاعدة قبل
الربط · فحص حيّ عبر `/api/chat/site` الفعلي للأدوات الثلاث (بعد إعادة تشغيل
خادم التطوير لضمان تحميل الكود — الدرس من §11.8 مطبَّق هذه المرّة من البداية
لا بعد فشل) · تحقّق سلسلة الترويسة/التقييم/DB كاملة بعد إصلاح الأداء.

### الملفات المضافة
```
lib/server/lost-items-service.ts           lib/server/__tests__/lost-items-service.test.ts
lib/server/live-streams-service.ts         lib/server/__tests__/live-streams-service.test.ts
lib/server/friday-sermons-service.ts       lib/server/__tests__/friday-sermons-service.test.ts
```

---

## 11.10 "دليل الزائرين" (الأماكن/الفنادق) — تحليل + ميزة "أقرب مني" بموقع حقيقي — 2026-08-14

### الطلب والسياق
سأل المالك عن نظام "دليل الزائرين" (فنادق/أماكن كربلاء) — هل يعرفه، وما رأيي
لتطويره. دراسة حيّة لجدولَي `places_data`/`places_categories` (عبر
`places-service.ts` القائم مسبقاً، أداة `search_places`) كشفت:
- **69% من كامل الدليل (2,812/4,056) "مواكب خدمية"** (محطات إطعام/راحة مجانية
  ينصبها مواكب أهلية) — أكبر فئة بفارق كبير عن الفنادق (892)، شبه غائبة من
  أمثلة الموجّه رغم حجمها.
- **296 مكاناً (٧٪) بلا تصنيف (`place_category IS NULL`)** رغم كونها فنادق/
  حسينيات حقيقية واضحة الاسم ("فندق أرض النور2"، "حسينة أبناء النجف
  الأشرف"...) — لن تظهر أبداً في بحث بالفئة رغم مطابقتها.
- إصلاح ترميز موجود مسبقاً وسليم (`DECODE()` في `places-service.ts` يعالج
  mojibake حقيقي في تخزين `place_data` الخام) — تحقّقت أن كل الصفوف الـ4,056
  متأثرة بالترميز الخام لكن `searchPlaces()` تُصحّحه دائماً في وقت الاستعلام.
- لا أسعار ولا صور ولا هواتف ولا تقييمات في المصدر أصلاً — سقف بيانات حقيقي
  لا يُحلّ من كود البوت.

### توضيح المالك — نقطة حاسمة لشكل الميزة
المالك أوضح أن الدور **إرشادي لا تجاري**: لا يريد أن يظهر البوت وكأنه يوصي
بفندق تجارياً (مخاطرة سمعة إن ساء فندقٌ لاحقاً) — الحسينيات/المواكب مجانية
فلا قيد عليها. **فحصت الموجّه الحالي فوجدت هذا محلولاً مسبقاً وبدقة**: قاعدة
صريحة (`⛔ التقييم والترويج محظور تماماً`) ترفض أسئلة "أفضل فندق"، وتنويه
إلزامي في نهاية كل قائمة ("إرشادية... يُنصح بالتحقق من التقييمات"). تحقّق
حيّ أكّد الالتزام الفعلي (لا كلمة مديح في أي رد، التنويه حاضر دائماً) — لم
يكن هناك شيء يُصلَح هنا، فقط تأكيد وطمأنة بالدليل الحيّ.

### السؤال التقني: "هل أحتاج إذن الموقع لأعطيه الأقرب؟"
ميّزت بين حالتين موجودتين فعلاً في الكود قبل اليوم:
1. **"الأقرب من الحرم"** (السلوك القائم): إحداثيات ثابتة مبرمجة مسبقاً
   (32.6163,44.0325)، بلا أي حاجة لإذن — يغطّي أغلب الاستخدام الفعلي.
2. **"الأقرب مني أنا شخصياً"**: غير موجود إطلاقاً، **يتطلّب فعلاً** إذن
   موقع حقيقياً من متصفّح الزائر (لا يمكن تجاوزه، حماية خصوصية قياسية).

طلب المالك بناء الحالة الثانية.

### البناء
**الواجهة** (`components/chat/useChat.ts`): حالة `userLocation` + `locationStatus`
("idle"/"requesting"/"granted"/"denied"/"unsupported") + دالة `requestLocation()`
تستدعي `navigator.geolocation.getCurrentPosition()` — المتصفّح وحده يملك قرار
عرض نافذة الإذن، لا كود المشروع. الإحداثيات تُرسَل مع كل رسالة لاحقة (`user_location`
في جسم الطلب) إن وُجدت، ولا تُخزَّن أبداً. زرّ 📍 جديد في `InputZone.tsx`
(4 حالات بصرية) + تنسيق في `ChatStyles.tsx` (فاتح/داكن).

**الخادم** (`route.ts`): `validateUserLocation()` يتحقّق من الشكل والمدى
(lat: -90..90، lng: -180..180، رقمان محدودان فعلاً) — القيمة من طرف العميل
غير موثوقة كأي مُدخل خارجي آخر، تُهمَل بصمت إن كانت فاسدة بدل رفض الطلب
كاملاً. عند وجود موقع صالح، يُحقَن كـ`customInstructions` عبر آلية
`getSiteSystemPrompt()` **الموجودة مسبقاً** (نفس نمط `{{TODAY}}` الديناميكي)
— لا مسار حقن جديد.

### 🔴 خلل حقيقي اكتُشف بالفحص الحيّ: ادّعاء موقع لم يُزوَّد
أول توجيه كتبته للموجّه ("إن غاب الموقع، اطلبه أو توقّف") **لم يُتّبع فعلياً**:
سؤال "اقرب فندق مني" بلا `user_location` جعل النموذج يستخدم إحداثيات الحرم
الثابتة بصمت **ويصفها بأنها "لموقعك الحالي"** — ادّعاء كاذب، أخطر مما قبل
الميزة (لم يكن يخترع "موقعك" سابقاً لأن المفهوم لم يكن موجوداً أصلاً). حاولت
تقوية قاعدة "توقّف واطلب" (سيناريو صريح + مثال حرفي) — **لم تتغيّر النتيجة
حتى بعد التقوية**، بل جاء الادّعاء الكاذب بصياغة أوضح.

**الدرس (يُضاف لدرس §11.8/§11.9 عن تذبذب اختيار الأداة):** طلب "توقّف عن
الإجابة واسأل" يبدو أضعف امتثالاً من النموذج مقارنة بطلب "لا تكتب عبارة
معيّنة" — نفس النمط الذي لوحظ سابقاً مع رفض "أفضل فندق" (لم يتوقف عن استدعاء
الأداة، لكن التزم بعدم المديح). **الإصلاح الفعّال**: بدل مطاردة السلوك
الإجرائي الأصعب، ضيّقت الطلب لقاعدة صياغة ثابتة أسهل امتثالاً: *"لا تكتب
'قرب موقعك' إلا إن استخدمت فعلاً إحداثيات حقيقية وصلتك؛ نتائج إحداثيات
الحرم الثابتة تُوصَف بـ'قرب الحرم' فقط."* **تحقّق حيّ 3/3 محاولات متتالية
بعد هذا الإصلاح: لا ادّعاء كاذب في أيٍّ منها** — الفجوة الجوهرية (تضليل)
أُغلقت، حتى لو بقي السلوك الإجرائي (طلب الإذن استباقياً) غير مضمون 100%.

### التحقّق الحيّ الكامل (بعد إعادة تشغيل الخادم في كل مرحلة)
```
"اقرب فندق مني" (بلا موقع)          → "أقرب الفنادق إلى الحرم الحسيني..." (صادق، لا ادّعاء شخصي) — 3/3
"اقرب فندق مني" + user_location حقيقي (باب بغداد) → نتائج مختلفة فعلاً + مسافات حقيقية (0.034 كم...) + "لموقعك الحالي" (صحيح هذه المرّة)
user_location فاسد (lat:999, lng:"نص") → يُتجاهل بصمت، الطلب ينجح بلا خطأ (HTTP 200)
```

### التحقّق
`tsc` نظيف · **347 اختباراً ناجحاً / 22 ملفاً** (بلا اختبارات جديدة — لا
بنية اختبار مكوّنات React قائمة في المشروع بعد؛ التحقّق كان حيّاً بالكامل
عبر `/api/chat/site` الفعلي، وتحقّق يدوي مطلوب من المالك لتفاعل زرّ الموقع
الفعلي في المتصفّح نفسه، إذ لا تتوفر لي أداة أتمتة متصفّح لمحاكاة نقرة
المستخدم ونافذة إذن المتصفّح الحقيقية).

### الملفات المعدَّلة
```
components/chat/useChat.ts       components/chat/InputZone.tsx
components/chat/ChatStyles.tsx   components/ChatWidget.tsx
app/api/chat/site/route.ts       lib/server/system-prompts.ts
```

---

## 11.11 بحث الفيديو يفوّت نتائج مطابقة موضوعياً — همزات + تطابق جنس نحوي — 2026-08-21

### التقرير
أبلغ المالك: البحث عن "الحفل القرآني المرتل في الصحن" لم يُرجع أي نتيجة رغم
وجود محتوى حقيقي مطابق تماماً لموضوع السؤال.

### السبب — خللان متراكبان، كلاهما في `stripped()`/تقطيع الكلمات القديمين
`searchVideos()` (`video-service.ts`) كانت تحذف التشكيل فقط (`stripDiacritics`)
بلا أي توحيد أحرف، بخلاف `normalize()`/`fuzzyNorm()` المستخدَمة في بقية
الخدمات (publications/lost-items/friday-sermons/contacts/kb/projects-db).
تحقّقت حرفياً: العنوان الحقيقي المطابق موضوعياً "الختمة القرآنية الرمضانية
**المرتلة**" يختلف عن كلمتَي استعلام المالك حرفياً بسببين:
1. **همزة**: "القرآني" (بالمستخدم، حرف آ) ≠ "القرانية" (بالعنوان الحقيقي،
   حرف ا عادي بلا همزة ممدودة) — حرف مختلف فعلياً في الموضع الخامس.
2. **تطابق جنس نحوي**: "المرتل" (مذكّر) ≠ "المرتلة" (مؤنّث، تاء زائدة تطابق
   "الختمة" المؤنّثة) — مطابقة الكلمة الكاملة بحدود المسافة (`% كلمة %`)
   لا تلتقط اختلاف لاحقة واحدة كهذا رغم أن "المرتل" بادئة حرفية صحيحة
   لـ"المرتلة".

النتيجة: خطوة AND فشلت (متوقَّع، الكلمات فعلاً مختلفة حرفياً)، وخطوة OR
الاحتياطية (تجرّب كل كلمة **منفردة** وتُعيد أول نتيجة تُصادفها، بلا ترتيب
بعدد الكلمات المطابقة) أعادت فيديوهات تقارير إخبارية غير ذات صلة تحتوي
"القرآني" (مذكّر) بمعزل عن باقي الاستعلام.

### الإصلاح
1. **fuzzyNorm بدل stripDiacritics**: استُبدلت دالة تقطيع كلمات البحث
   (JS) بـ`fuzzyNorm()` الموحَّدة مسبقاً في `db.ts` (تشكيل + همزات أ/إ/آ→ا +
   ة→ه + ى→ي)، ونُسخ نفس التطبيع داخل `stripped()` (SQL) عبر سلسلة
   `REPLACE()` — يجب أن يتطابق الجانبان تماماً وإلا ينكسر التطابق بصمت.
2. **مطابقة بادئة (prefix) للكلمات ٤+ أحرف في خطوة OR**: `% كلمة%` بدل
   `% كلمة %` — تلتقط اختلاف اللواحق النحوية بأمان (بادئة مربوطة بحدّ كلمة
   يسارياً فقط، فلا تصادم شبيه بخلل "لا" في §11.8/lost-items الذي كان
   يطابق وسط الكلمة). كلمات قصيرة (٢-٣ أحرف، حروف جر شائعة كـ"في") تبقى
   بمطابقة كلمة كاملة صارمة تفادياً للضجيج.
3. **إعادة تصميم خطوة OR من "أول كلمة تُصادف نتيجة" إلى OR مرتَّب بعدد
   المطابقات**: كانت الحلقة القديمة تجرّب الكلمات الأطول أولاً وتُرجع فوراً
   عند أول نجاح — فيديو يطابق كلمة عامة واحدة قد يفوز على الفيديو الحقيقي
   الأكثر صلة. الآن نداء SQL واحد بشرط OR بين كل الكلمات المميّزة معاً،
   مرتَّب بعدد الكلمات المطابقة فعلياً ثم الأحدث — نفس نمط
   publications-service.ts/lost-items-service.ts المُثبَت هذا الأسبوع.

### التحقّق الحيّ (قبل/بعد، مباشرة عبر `searchVideos()`)
```
قبل: "الحفل القرآني المرتل في الصحن" → فيديوهات تقارير إخبارية غير ذات صلة
بعد: نفس الاستعلام → أعلى نتيجة: "العتبة العباسية المقدسة تختتم الختمة
      القرآنية التعليمية في الصحن الشريف" (تطابق موضوعي حقيقي)
     "الختمة القرآنية المرتلة" (نصّ العنوان الحرفي) → يطابق الآن عبر AND مباشرة
```
وعبر `/api/chat/site` الفعلي بصياغة المالك الحرفية: أعاد رابط فيديو حقيقي
يعمل (`https://static1.alkafeel.net/videos/e612b342/e612b342.mp4`) لفيديو
مطابق تماماً لموضوع السؤال.

### التحقّق
`tsc` نظيف · **354 اختباراً ناجحاً / 23 ملفاً** (+7 اختبارات جديدة في
`video-search.test.ts`، أول ملف اختبار مخصّص لـ`video-service.ts`) · فحص
حيّ عبر `/api/chat/site` الفعلي بصياغة المالك الحرفية.

### الملفات المعدَّلة/المضافة
```
lib/server/video-service.ts    lib/server/__tests__/video-search.test.ts (جديد)
```

---

## 11.12 رابط قسم فيديو خاطئ + تنسيق عرض خاطئ (خرائط بدل فيديو) — 2026-08-21

### التقرير
سأل المالك "هل توجد سلسلة للصم والبكم في مكتبة الفيديو"، فأجاب البوت بصيغة
تنسيق مكان (📍 اسم — 🗺️ رابط خرائط) بدل تنسيق فيديو، وبرابط **عام** لمكتبة
الفيديو كلها لا رابط السلسلة المحدَّدة. زوّد المالك رابطاً حقيقياً صحيحاً
لمقارنته: `https://alkafeel.net/mediacat/d0d55?lang=ar`.

### السبب — خللان مستقلّان
**١. رابط القسم خاطئ في `getVideoSections()` نفسها** — كانت تبني
`https://alkafeel.net/media/{request}` (مسار صفحة **فيديو مفرد**، نفس مسار
`mapVideoToItem()`) بدل `https://alkafeel.net/mediacat/{request}?lang=ar`
(مسار صفحة **قسم/سلسلة**). تحقّقت مباشرة من مثال المالك: `request='d0d55'`
يطابق فعلاً `id=45 "النشرة بلغة الإشارة"` — القسم الصحيح تماماً — لكن بمسار
مختلف كلياً عن الصحيح. الحقل موجود ومُمرَّر للنموذج سليماً (لا يمرّ عبر
`cleanResultForGPT` الذي يُبقي شكل `{sections, total}` كما هو)، لكن قيمته
كانت خاطئة من الأساس.

**٢. لا توجد أي توجيهات عرض لـ`get_video_sections` في الموجّه إطلاقاً** —
فقط "متى تستخدمها"، بلا كلمة عن الصيغة. النموذج استعار تنسيق `search_places`
(📍/🗺️) الأبرز في الموجّه لأنه أقرب نمط "قائمة بروابط" رآه، فطبّقه خطأً على
نتيجة فيديو.

### الإصلاح
1. **مسار صحيح**: `url` في `getVideoSections()` صار
   `https://alkafeel.net/mediacat/${request}?lang=ar`.
2. **توجيه عرض صريح جديد**: كل قسم يُعرض بحقل `url` **الخاص به تحديداً** لا
   رابط عام، بصيغة 🎬 *[اسم القسم]* — [تصفّح السلسلة](url)، مع تحذير صريح:
   **لا تُستخدم أبداً صيغة 📍/🗺️ المخصَّصة حصراً لـ search_places**. أُضيف
   أيضاً توجيه: عند سؤال "هل توجد سلسلة X؟" يُبحث عن الاسم المطابق ضمن
   نتيجة sections ويُجاب باسمها الحقيقي إن وُجدت.

### التحقّق الحيّ (بصياغة المالك الحرفية، بعد إعادة تشغيل الخادم)
> "هل توجد سلسلة للصم والبكم في مكتبة الفيديو" →
> "نعم، توجد... بعنوان 'النشرة بلغة الإشارة'... 🎬 *النشرة بلغة الإشارة* —
> [تصفّح السلسلة](https://alkafeel.net/mediacat/d0d55?lang=ar)"

تنسيق فيديو صحيح، اسم السلسلة الحقيقي، ورابطها الخاص المطابق تماماً لمثال
المالك — لا رابط عام، لا تنسيق خرائط.

### التحقّق
`tsc` نظيف · **355 اختباراً ناجحاً / 23 ملفاً** (+اختبار جديد يحرس مسار
`/mediacat/` تحديداً) · فحص حيّ عبر `/api/chat/site` الفعلي.

---

## 11.13 «كم فيديو فيها؟» — عدد مضلِّل للمرّة الثالثة + query إلزامي يُنقِص العدّ — 2026-08-21

### التقرير
سأل المالك مباشرة بعد §11.12 عن "كم فيديو فيها" (سلسلة "النشرة بلغة
الإشارة")، فأجاب البوت "10"، فأبلغ المالك أنها أكثر من ذلك فعلياً.

### السبب — خللان مركّبان
**١. «العدد المضلّل» للمرّة الثالثة**: `searchVideos()` كانت تُعيد
`total: results.length` (طول المصفوفة **بعد** حدّ limit) لا `COUNT(*)`
حقيقياً — نفس فصيلة الخلل المُصلَح في §11.2 (search_content) و§11.7
(search_publications)، أُعيد إنتاجه هنا سهواً حين بُنيت `search_videos`
أصلاً. تحقّقت حياً: العدد الحقيقي لسلسلة "النشرة بلغة الإشارة" **57**، لا
10 (= limit الذي مرّره النموذج).

**٢. أخطر من الأول: `query` كانت إلزامية في تعريف الأداة، فأجبرت النموذج
على تكرار اسم القسم كـquery أيضاً** — حتى بعد إصلاح COUNT(*)، هذا التكرار
يشترط ظهور **كل** كلمة من اسم السلسلة حرفياً في عنوان/وصف كل فيديو (فوق
شرط القسم نفسه)، فأنقص العدّ الحقيقي 57 إلى **43** رغم أن COUNT أصبح
"حقيقياً" تقنياً — عدد صحيح حسابياً لكنه يجيب سؤالاً مختلفاً عمّا قصده
المستخدم. اكتُشف بفحص حيّ مباشر لعدّة تراكيب معاملات لتحديد مصدر الفرق
57↔43 بالضبط، لا بالتخمين.

### الإصلاح
1. **COUNT(*) حقيقي في كلتا الطبقتين** (AND ثم OR الاحتياطية) — نفس نمط
   `runTier()` المُثبَت في publications/lost-items/friday-sermons. حقل
   `returned` جديد لطول المصفوفة المعروضة فعلياً (يُفقَد عبر
   `cleanResultForGPT` لأن شكل النتيجة `{results:[...]}` يمرّ بإعادة بناء
   صريحة تُبقي `total`/`query` فقط — لا ضرر إذ `total` وهو الحقل الحرج يبقى).
2. **`query` صارت اختيارية** (في تعريف الأداة **وتوقيع الدالة** معاً) —
   طبقة جديدة كلياً: query فارغ/غائب ⇒ عدّ نظيف بلا أي شرط عنوان/وصف، القسم
   فقط (أو كل الفيديوهات النشطة إن غاب أيضاً). كانت القيمة الفارغة "تعمل"
   سابقاً بالصدفة فقط (نمط `"%  %"` يطابق caption الفارغ NULL→'' تلقائياً
   بلا قصد فعلي في التصميم) — سلوك هشّ استُبدل بفرع صريح موثوق.
3. **توجيه صريح في وصف الأداة والموجّه معاً**: عند سؤال "كم فيديو في سلسلة
   X؟" لا يُكرَّر اسم السلسلة في query — يُترك فارغاً ويُمرَّر section فقط.

### التحقّق الحيّ (3 محاولات متتالية، بعد إعادة تشغيل الخادم)
> "كم فيديو فيها" (بعد سؤال سابق عن سلسلة الصمّ والبكم) →
> "...تحتوي على **57** فيديو حتى الآن..." — 3/3 محاولات، رقم صحيح ثابت.

### التحقّق
`tsc` نظيف · **359 اختباراً ناجحاً / 23 ملفاً** (+7 اختبارات جديدة: عدّ
حقيقي + طبقة query الفارغة الجديدة بثلاث حالات) · فحص حيّ عبر
`/api/chat/site` الفعلي 3 مرّات متتالية.

### الملفات المعدَّلة
```
lib/server/video-service.ts        lib/server/site-tools-definitions.ts
lib/server/system-prompts.ts       lib/server/__tests__/video-search.test.ts
```

---

## 11.14 «أكثر فيديو مشاهدة؟» — عمود views موجود لكن غير مستعمَل إطلاقاً — 2026-08-21

### التقرير
سأل المالك "ماهو اكثر فيديو مشاهدة لديكم؟"، فاعتذر البوت بأن المعلومة "غير
متوفرة ضمن نتائج البحث الحالية".

### السبب
تحقّقت من مخطّط `video_files`: يوجد عمود **`views`** حقيقي (كما `downloads`،
`resolution`...) — لكن `searchVideos()` لم تكن تختاره في أي SELECT ولا
تدعم أي ترتيب به إطلاقاً؛ لا يوجد مسار برمجي واحد للإجابة عن "الأكثر
مشاهدة"، فاعتذر البوت بصدق تقني لكن بخلل تصميم حقيقي — نفس الفجوة التي
كانت موجودة لـsearch_content قبل إضافة sort_by (موثَّقة سابقاً في §١).

### الإصلاح
1. **`sortBy?: "views" | "recent"`** جديد في `searchVideos()` — يُطبَّق
   على الطبقات الثلاث كلّها (لا استعلام، AND، OR الاحتياطية) بنفس المتغيّر
   `orderByMain`، وفي طبقة OR يبقى ترتيب عدد المطابقات أولوية أولى ثم
   `orderByMain` ثانوياً (لا يكسر منطق §11.11).
2. **`vf.views` أُضيف إلى كل SELECT** + حقل `views` في `mapVideoToItem()`.
3. **🔴 خلل ثانٍ اكتُشف أثناء التحقّق**: `cleanProject()` في
   `function-calling-handler.ts` تُعيد بناء كل نتيجة بقائمة حقول صريحة
   محدودة (id/name/description/url/video_url/source_label/length) — كانت
   ستحذف `views` بصمت رغم وجوده في `mapVideoToItem()`، فيغيب عن النموذج
   كلياً دون أي خطأ ظاهر. أُضيف صراحة لقائمة الحقول المُبقاة.
4. **`sort_by` أُضيف لتعريف الأداة** (نفس قيم search_content: هنا
   "recent"/"views")، وتوجيه صريح في الموجّه يمنع الاعتذار ويُلزم
   باستخدام sort_by="views" لهذا السؤال تحديداً.

### التحقّق الحيّ (مرّتان متتاليتان، بعد إعادة تشغيل الخادم)
> "ماهو اكثر فيديو مشاهدة لديكم ؟" →
> "...هو 'فيديو كليب (براءة العشق) للحاج باسم الكربلائي 1435 هـ'، حيث حقق
> أكثر من 194 ألف مشاهدة..." + رابط فيديو حقيقي يعمل.

تحقّقت مباشرة من القاعدة: `id=803, views=194413` — مطابق تماماً لما ذكره
البوت («أكثر من 194 ألف»). لا مزيد من الاعتذار الكاذب بعدم التوفّر.

### التحقّق
`tsc` نظيف · **362 اختباراً ناجحاً / 23 ملفاً** (+3 اختبارات لـsort_by:
ترتيب صحيح، عدم انتكاس الافتراضي، وصول حقل views دائماً) · فحص حيّ عبر
`/api/chat/site` الفعلي مرّتين، وتحقّق مباشر من القاعدة يطابق الرقم المذكور
بالضبط.

### الملفات المعدَّلة
```
lib/server/video-service.ts            lib/server/site-tools-definitions.ts
lib/server/site-api-service.ts         lib/server/system-prompts.ts
lib/server/function-calling-handler.ts lib/server/__tests__/video-search.test.ts
```

---

## 11.15 استغلال كامل لبيانات خطب الجمعة — طلب مباشر من المالك — 2026-08-21

### الطلب
طلب المالك دراسة كل ما هو متوفر فعلياً في قاعدة بيانات خطب الجمعة (§11.9)
لاستغلاله بالكامل، لا الاكتفاء بما بُني وقتها.

### الجرد الحيّ (`friday_sermons`/`friday_preachers`) — ثلاث فجوات حقيقية
- **`friday_preachers`**: عمودان فقط (id, title) — لا سيرة ولا صورة، لا شيء
  إضافي يُستغلّ هناك.
- **`views` حقيقي ومتفاوت فعلياً** (7,456–23,898 مشاهدة، متوسط 18,289) —
  **لم يكن له أي مسار ترتيب إطلاقاً** — نفس فجوة §11.14 (الفيديو) بالضبط،
  غير مكتشَفة وقت بناء §11.9 لأن السؤال المحدِّد لم يُطرَح وقتها.
- **`content` (المُستخدَم كملخّص) فارغ في 55% من الخطب فعلياً** (207/462
  فقط) — بينما `first_sermon` (النصّ الكامل) متوفّر في 99% (456/462).
  خطب كثيرة كانت تُعاد بـ`summary: null` رغم توفّر نصّ كامل قابل
  للتلخيص منه — فجوة لم تُكتشف وقت §11.9 لأن اختباراته لم تُغطِّ توزيع
  تعبئة الأعمدة الفعلي، فقط سلوك الحقل حين يكون فارغاً أو ممتلئاً.
- **لا فلتر خطيب** رغم توازن العدد فعلياً (السيد الصافي 229 خطبة، الشيخ
  الكربلائي 233) — البحث كان بالعنوان فقط، والاسم نادراً ما يظهر فيه.

### الإصلاح — ثلاث إضافات لنفس searchFridaySermons()
1. **`sortBy: "views" | "recent"`** — يُطبَّق على الطبقات الثلاث (بلا
   استعلام، AND، OR)، بنفس ترتيب عدد المطابقات أولاً في طبقة OR ثم
   الترتيب المطلوب ثانوياً (لا يكسر منطق §11.11).
2. **ملخّص بديل من `first_sermon`** عند فراغ `content` — تحقّقت حيّاً من
   عيّنات: بداية `first_sermon` في هذه الحالات تحديداً نصّ صحفي موضوعي
   مباشر (لا مقدّمة دينية نمطية)، فأخذ أول 600 حرف منه مفيد فعلاً بلا
   حاجة لتخطّي مقدّمة. وسوم `<br>` تُستبدَل بمسافة.
3. **`preacher`** فلتر جديد (`fp.title LIKE ?`) في الطبقات الثلاث.

### 🔴 خللان حقيقيّان اكتُشفا بالفحص الحيّ (لا الاختبارات الوهمية)
كلاهما فاتا كل الاختبارات المُصاغة (تُحاكي `db.execute` فتلتقط نصّ SQL
بلا تنفيذه فعلياً على قاعدة حقيقية) — درسٌ مباشر لقيمة التحقّق الحيّ:

1. **دمج نصّي بلا فاصل**: `` `${baseWhere}${preacherWhere}` `` أنتج
   `"...IS NULLAND fp.title LIKE ?"` (خطأ SQL حرفي) في طبقة "بلا استعلام،
   بفلتر خطيب فقط" — أُصلح بإضافة مسافة قائدة لنصّ `preacherWhere` نفسه.
2. **`fp` غير معرَّف في استعلام العدّ**: `runTier()` تنفّذ `COUNT(*)` من
   `FROM friday_sermons fs` فقط (بلا `LEFT JOIN friday_preachers`) —
   عند إضافة فلتر `preacher` (يشير لـ`fp.title`) صار الاستعلام يفشل بـ
   `Unknown column 'fp.title'`. أُصلح بإضافة نفس الـJOIN لاستعلام COUNT.

### التحقّق الحيّ (بعد كلا الإصلاحين، وبعد إعادة تشغيل الخادم)
```
searchFridaySermons({ sortBy: "views" })        → id=164 (23,898 مشاهدة، فتوى الجهاد الكفائي 2014)
searchFridaySermons({ preacher: "الصافي" })      → total=229 (يطابق الجرد المباشر بالضبط)
searchFridaySermons({ preacher: "الكربلائي" })   → total=233 (يطابق الجرد المباشر بالضبط)
```
وعبر `/api/chat/site` الفعلي: "ما اشهر خطبة جمعة لديكم؟" أعادت الخطبة
الصحيحة بعدد المشاهدات الدقيق ورابطَي فيديو حقيقيَّين؛ "اعطني خطب السيد
الصافي" أعادت خطباً منسوبة له تحديداً بروابط أخبار وفيديو حقيقية.

### التحقّق
`tsc` نظيف · **371 اختباراً ناجحاً / 23 ملفاً** (+11 اختباراً جديداً:
ملخّص بديل، preacher، sort_by، وحارس صريح ضدّ خلل "NULLAND" تحديداً) ·
فحص حيّ مباشر ضدّ القاعدة الحقيقية (كشف الخللين أعلاه، لم تكشفهما
الاختبارات الوهمية) · فحص حيّ عبر `/api/chat/site` الفعلي.

### الملفات المعدَّلة
```
lib/server/friday-sermons-service.ts       lib/server/site-tools-definitions.ts
lib/server/function-calling-handler.ts     lib/server/system-prompts.ts
lib/server/__tests__/friday-sermons-service.test.ts
```

---

## 11.16 «كم خطبة جمعة لديكم؟» — توجيه أداة خاطئ (count_news بدل الأرشيف) — 2026-08-21

### التقرير
سأل المالك مباشرة بعد §11.15 "كم خطبة جمعة لديكم"، فأجاب البوت **35,019**؛
لاحظ المالك فوراً أن الرقم غير معقول (العدد الحقيقي 462، موثَّق للتوّ).

### السبب — توجيه أداة خاطئ، لا خلل بيانات
تتبّعت سجلّ الخادم مباشرة: النموذج استدعى **count_news**، لا
search_friday_sermons. count_news تعدّ **أخباراً** تذكر كلمتَي "خطبة"/
"جمعة" كمُدخلة مفتاحية — رقم كبير من قاعدة مختلفة تماماً (الأخبار)، لا
علاقة له بعدد خطب الجمعة الفعلي في أرشيفها المنفصل. الموجّه لم يكن يحوي
أي استثناء صريح يمنع هذا التوجيه الخاطئ — قاعدة "أسئلة العدد → count_news"
عامة بما يكفي لتغطية هذا السؤال خطأً رغم وجود أداة عدّ مخصّصة وأدقّ.

### الإصلاح
تحذير صريح بالاتجاهين: (١) في كتلة search_friday_sermons — «كم خطبة جمعة
لديكم؟» ← search_friday_sermons حصراً، لا count_news/count_mentions
أبداً. (٢) في كتلة count_news العامة — استثناء صريح لخطب الجمعة يوجّه إلى
search_friday_sermons، بنفس الأسلوب الذي نجح مسبقاً مع top_topics
(استثناء صريح من الاتجاهين معاً، لا اتجاه واحد فقط).

### التحقّق الحيّ (3 محاولات متتالية، بعد إعادة تشغيل الخادم)
كل الثلاث استدعت **search_friday_sermons** (لا count_news إطلاقاً) وأعادت
**462** بثقة، مع تفاصيل حقيقية (أقدم/أحدث خطبة، أمثلة بروابط فعلية).

### التحقّق
`tsc` نظيف · **371 اختباراً ناجحاً / 23 ملفاً** (بلا تغيير بنيوي، إصلاح
موجّه صرف) · فحص حيّ 3 مرّات متتالية عبر `/api/chat/site` الفعلي، تتبّع
سجلّ الخادم لتأكيد الأداة المُستدعاة فعلياً لا افتراضها.

---

## 11.17 «أول خطبة جمعة؟» — لا خيار تصاعدي إطلاقاً في الأداة — 2026-08-21

### التقرير
سأل المالك مباشرة بعد §11.16 "ماهي اول خطبة جمعة تم نشرها بأي تاريخ"،
فأعاد البوت خطبة 28/02/2020 (id=484) ووصفها بـ"الأولى" — لاحظ المالك فوراً
أنها الأحدث لا الأقدم (موثَّق مراراً في هذا الملف كتاريخ توقّف الأرشيف).

### السبب
تتبّعت سجلّ الخادم: النموذج استدعى **search_friday_sermons** (الأداة
الصحيحة هذه المرّة، بخلاف §11.16). لكن `sortBy` كانت تدعم **فقط**
"views" أو الافتراضي (id DESC، أي الأحدث) — **لا يوجد خيار تصاعدي (id ASC)
إطلاقاً**. لم يكن أمام النموذج أي وسيلة لطلب الأقدم فعلياً، فأعاد الافتراضي
(الأحدث) ووصفه خطأً بـ"الأولى" — خطأ منطقي ناتج عن فجوة حقيقية في الأداة،
لا سوء استخدام.

### الإصلاح
`sortBy: "views" | "recent" | "oldest"` — القيمة الجديدة "oldest" تُترجَم
إلى `ORDER BY fs.id ASC` (الأقدم أولاً، بالاعتماد على توافق id مع التسلسل
الزمني المؤكَّد سابقاً). طُبِّقت على الطبقتين (بلا استعلام، AND) بنفس نمط
"views". تحذير صريح جديد في الموجّه: الافتراضي بلا sort_by يُعيد **الأحدث**
لا الأقدم — لا يُفترَض عكس ذلك أبداً.

### التحقّق الحيّ
```
searchFridaySermons({ sortBy: "oldest" }) → id=1، تاريخ 25 جمادى الأولى 1432هـ (٢٠١١م)
```
يطابق تماماً "id=1 ⇐ 1432هـ" الموثَّق في §11.9 كأقدم خطبة معروفة. وعبر
`/api/chat/site` الفعلي (مرّتان متتاليتان): أعاد نفس الخطبة الصحيحة
(id=1، تاريخ 2011) بدل خطبة 2020 الخاطئة.

### التحقّق
`tsc` نظيف · **374 اختباراً ناجحاً / 23 ملفاً** (+3 اختبارات لـsort_by="oldest")
· فحص حيّ مباشر ضدّ القاعدة يطابق الأقدم المعروف مسبقاً بالضبط · فحص حيّ
مرّتين عبر `/api/chat/site` الفعلي.

### الملفات المعدَّلة
```
lib/server/friday-sermons-service.ts       lib/server/site-tools-definitions.ts
lib/server/system-prompts.ts               lib/server/__tests__/friday-sermons-service.test.ts
```

---

## 11.18 «كم إصدار من مجلة الرياحين؟» — عدّ بالنصّ يُنقِص سلسلة كاملة — 2026-08-21

### التقرير
سأل المالك عن عدد إصدارات "مجلة الرياحين"، فأجاب البوت **110**. ثم طلب
"العدد 198" فأرسله البوت بنجاح — تناقض واضح لاحظه المالك فوراً: كيف يوجد
عدد ١٩٨ ضمن سلسلة قال البوت إنها ١١٠ فقط.

### التشخيص — لا خلل بيانات، بل استعلام نصّي ناقص لسلسلة كاملة
تحقّقت من `get_publication_categories` مباشرة: **"مجلة الرياحين" ليست سلسلة
واحدة بل ثلاث تصنيفات إدارية منفصلة تماماً** تشترك في كلمة "رياحين":
```
id=15  "مجلة الرياحين للاطفال"      count=200   ← السلسلة الفعلية المقصودة
id=21  "اصدارات الرياحين الخاصة"    count=109   (109 ≈ الرقم الخاطئ 110!)
id=24  "نشرة رياحين الكفيل"         count=32
```
حين استُخدم `query: "مجلة الرياحين"` (بحث نصّي AND)، اشتُرط ظهور الكلمتين
"مجلة" و"الرياحين" **حرفياً معاً** في العنوان — لكن عناوين كثيرة داخل
التصنيف 15 نفسه لا تحوي الكلمتين معاً بهذا الشكل (تحقّقت: العنوان الفعلي
لأغلب الصفوف هو "مجلة الرياحين" وحدها بلا رقم، لكن AND النصّي أنقص العدد
إلى 110 لأسباب تطابق حرفي دقيقة، بينما العدّ الحقيقي عبر التصنيف — وهو
تصنيف المصدر الإداري الرسمي — **200**). العدد 198 (id=3492) ينتمي فعلياً
إلى `publication_category_id=15` — أي أنه ضمن الـ200 الحقيقية تماماً، لا
تناقض حين يُعتمَد التصنيف بدل النصّ.

نفس فصيلة الدرس المُثبَت في §11.13 (الفيديو: لا تُعِد اسم القسم في query)
لكن هنا بلا أي كود جديد مطلوب — **الأداة سليمة تماماً** (`searchPublications
({categoryId:15})` تُعيد 200 بدقّة عبر COUNT(*) حقيقي مُصلَح مسبقاً في
§11.7)، والفجوة بالكامل في **اختيار المسار**: النموذج لم يكن يعرف أن عدّ
سلسلة مُسمّاة يجب أن يمرّ عبر `get_publication_categories` أولاً لإيجاد
الـid ثم `category_id` بلا query، لا `query` نصّي مباشرة.

### الإصلاح
توجيه صريح جديد في كتلة search_publications: عدّ سلسلة مُسمّاة **ممنوع
بـquery نصّي** — يلزم `get_publication_categories` أولاً لإيجاد id السلسلة
المطابقة، ثم `category_id` بلا query للعدّ الموثوق الوحيد. أُضيف أيضاً
تحذير من تشابه الأسماء بين تصنيفات منفصلة فعلاً (المثال الثلاثي أعلاه) مع
توجيه لسؤال المستخدم عند الغموض. **بلا أي تعديل كود** — إصلاح موجّه صرف،
الأدوات والخدمات سليمة أصلاً.

### التحقّق الحيّ (3 محاولات متتالية، بعد إعادة تشغيل الخادم)
كل الثلاث استدعت **get_publication_categories** ثم **search_publications
(category_id=15)** وأعادت **200** بثبات — لا مزيد من التناقض. تحقّق إضافي:
طلب "العدد 198" بعدها نجح بلا أي تعارض ظاهر مع الرقم الإجمالي المذكور.

### التحقّق
`tsc` نظيف · **374 اختباراً ناجحاً / 23 ملفاً** (بلا تغيير — لا كود
مُعدَّل) · فحص حيّ 3 مرّات متتالية عبر `/api/chat/site` الفعلي + فحص
متابعة (العدد 198) للتأكّد من زوال التناقض كاملاً.

### الملفات المعدَّلة
```
lib/server/system-prompts.ts
```

---

## 11.19 «ما أصناف المشاريع؟» — أداة كانت غائبة تماماً + خلل عدّ شجري — 2026-08-21

### التقرير
سأل المالك "ماهي اصناف المشاريع في العتبة العباسية"، فأجاب البوت بتصنيفات
**الأخبار** (list_news_categories) وقال إن أصناف المشاريع "غير متوفرة" —
وزوّد المالك القائمة الصحيحة المتوقَّعة (7 أصناف: الثقافية، التعليمية،
الصحن ومقترباته، الطبية، التنموية، خدمات عامة، تشكيلات إدارية).

### التشخيص
لم تكن توجد أي أداة لسرد أصناف المشاريع إطلاقاً — نفس فجوة
get_video_sections/get_publication_categories قبل بنائهما، لكن لم تُلحَظ
لمشاريع `alkafeel_projects`. تحقّقت حيّاً: جدول `sections` (33 صفّاً) موجود
ومُستعمَل **داخلياً فقط** لفلترة searchProjectsDB (عبر معامل section)، بلا
أي أداة تعرضه مباشرة. الجدول هرمي (`parent_section_id`) — 7 أصناف رئيسية
فقط (parent_section_id IS NULL) تطابق حرفياً قائمة المالك.

### 🔴 خلل عدّ حقيقي اكتُشف أثناء البناء نفسه (قبل الشحن)
أول تنفيذ عدّ (id الصنف الرئيسي مباشرة عبر `projects.section_id` أو
`project_section`) أعاد **صفراً** لخمسة من سبعة أصناف. تحقّقت حيّاً من
السبب: **316 من 358 مشروعاً نشطاً `section_id=0` فعلياً** (العمود المباشر
غير مُعتمَد عملياً)، والربط الحقيقي عبر `project_section` (422 رابطاً)
يشير في الغالب إلى **أصناف فرعية** (مثل "الأقسام" تحت "تشكيلات إدارية"،
"المجلات الثقافية" تحت "الثقافية") لا للصنف الرئيسي مباشرة — أحياناً بعمق
3 مستويات (34 ← 28 ← 31). عدّ id الرئيسي وحده كان يفوّت كل هذا الربط الفعلي.

**الإصلاح**: بناء إغلاق شجرة كامل لكل صنف رئيسي (نفسه + كل ذرّياته مهما
عمق التداخل) في JS من نتيجة `sections` كاملة، ثم عدّ **مشاريع فريدة**
(`Set`، لا مجموع بسيط) لكل id ضمن تلك الشجرة — يمنع ازدواج العدّ لمشروع
مرتبط بأكثر من صنف فرعي واحد ضمن نفس الشجرة.

### البناء
`getProjectSections()` جديدة في `projects-db-service.ts` (نداءان: كل
الأصناف، ثم كل روابط صنف↔مشروع من المسارين معاً) + أداة `get_project_sections`
(بلا معاملات، مثل get_video_sections) + توجيه صريح في الموجّه يميّزها عن
list_news_categories (قاعدة مختلفة تماماً).

### التحقّق الحيّ (قبل/بعد إصلاح العدّ الشجري)
```
قبل: المشاريع الثقافية=0، الصحن ومقترباته=0، التنموية=0، خدمات عامة=0، تشكيلات إدارية=0 (خطأ)
بعد: المشاريع الثقافية=141، الصحن ومقترباته=36، التنموية=76، خدمات عامة=31، تشكيلات إدارية=42 (صحيح)
```
وعبر `/api/chat/site` الفعلي (مرّتان متتاليتان): أعاد الأصناف السبعة
الصحيحة بأعدادها الحقيقية، مطابقةً تماماً لما توقّعه المالك.

### التحقّق
`tsc` نظيف · **383 اختباراً ناجحاً / 24 ملفاً** (+9 اختبارات جديدة، منها
حالة تداخل بعمق 3 مستويات وحالة مشروع مرتبط بصنفين فرعيَّين لنفس الجدّ) ·
فحص حيّ مباشر ضدّ القاعدة (كشف خلل العدّ الصفري وأكّد الإصلاح) · فحص حيّ
مرّتين عبر `/api/chat/site` الفعلي.

### الملفات المضافة/المعدَّلة
```
lib/server/projects-db-service.ts (معدَّل)       lib/server/site-tools-definitions.ts (معدَّل)
lib/server/function-calling-handler.ts (معدَّل)  lib/server/system-prompts.ts (معدَّل)
lib/server/__tests__/project-sections.test.ts (جديد)
```

---

## 11.20 «كم مشروع ثقافي؟» — رقمان خاطئان مختلفان + فلتر deleted_at يخالف الموقع — 2026-08-21

### التقرير
قارن المالك مباشرة برقم الموقع الفعلي ("المشاريع الثقافية - 155")، وسأل
البوت "كم مشروع ثقافي لديكم" فأجاب **30** — فرق هائل لاحظه فوراً.

### تشخيصان منفصلان، كلاهما حقيقي

**١. `search_projects_db` (لا get_project_sections الجديدة) هي ما استُدعي
فعلياً** — تحقّقت مباشرة: فلتر `section` فيها يطابق أسماء الأصناف بمطابقة
نصّية سطحية (`name.includes("ثقافي")`) بلا مشي في الشجرة الهرمية — فيصيب
فقط صنفين اثنين ("المشاريع الثقافية" نفسها + "المجلات الثقافية"، لأن اسمها
وحده يحوي الكلمة) من أصل **9 أصناف فرعية حقيقية** تحت شجرة الثقافية
(معظمها بأسماء لا تحوي كلمة "ثقافي" إطلاقاً: "مراكز ومؤسسات"، "مؤتمرات"،
"المشاريع القرآنية"...). النتيجة: `total_found: 30` — نفس فصيلة خلل «العدد
المضلّل» المتكرّر، هنا بسبب مطابقة نصّية ضيّقة لا شجرة كاملة.

**٢. حتى `get_project_sections()` نفسها (المبنيّة للتوّ في §11.19) كانت
تُعطي 141 لا 155** — فارق 14 غير تافه. قارنته مباشرة بإزالة فلتر
`deleted_at IS NULL` من استعلام الروابط: **156** — يطابق رقم الموقع (155)
بفارق 1 فقط (متوقَّع بفارق توقيت). الخلاصة المؤكَّدة تجريبياً: **عدّاد
الموقع العام نفسه لا يُقصي المشاريع المحذوفة ناعماً من عدّه** — مفاجئ
منطقياً (يخالف "نظافة البيانات" المعتادة) لكنه الواقع الفعلي المطلوب
مطابقته أمام الزائر.

### الإصلاح
1. `getProjectSections()`: أُزيل شرط `deleted_at IS NULL` من استعلام
   الروابط (صنف↔مشروع) — يطابق الآن رقم الموقع الحقيقي، لا "الأنظف" منطقياً.
2. توجيه صريح جديد في الموجّه: «كم مشروع [صنف]؟» ← **get_project_sections**
   حصراً (اقرأ حقل count للصنف المطابق)، **لا** total_found من
   search_projects_db أبداً لهذا السؤال تحديداً — مع شرح صريح لسبب
   الاختلاف (مطابقة اسمية ضيّقة مقابل شجرة كاملة).

### التحقّق الحيّ (3 محاولات متتالية، بعد إعادة تشغيل الخادم)
كل الثلاث استدعت **get_project_sections** (لا search_projects_db) وأعادت
**156** بثبات — يطابق رقم الموقع الفعلي (155) بفارق 1 فقط، بدل الفرق
الهائل السابق (30 مقابل 155).

### التحقّق
`tsc` نظيف · **384 اختباراً ناجحاً / 24 ملفاً** (+اختبار جديد يحرس غياب
`deleted_at` من استعلام الروابط تحديداً) · فحص حيّ مباشر ضدّ القاعدة قارن
141↔156↔155 لتأكيد مصدر الفارق بدقة · فحص حيّ 3 مرّات متتالية عبر
`/api/chat/site` الفعلي.

### الملفات المعدَّلة
```
lib/server/projects-db-service.ts       lib/server/system-prompts.ts
lib/server/__tests__/project-sections.test.ts
```

---

## 11.21 توسيع فلتر section في searchProjectsDB — تصفّح لا عدّ فقط — 2026-08-21

### الطلب
سأل المالك بعد §11.20 مباشرة: العدّ صحيح الآن (156)، لكن هل التصفّح
الفعلي (لا العدّ فقط) يعاني نفس الخلل؟ تحقّقت وأكّدت: نعم — `searchProjectsDB
({section:"ثقافي"})` (تُستدعى فعلياً لأي طلب "أرني مشاريع...") كانت لا تزال
تُعيد **30** فقط، لأن فلترها يطابق اسم الصنف حرفياً بلا مشي في الشجرة —
تماماً نفس السبب الجذري المُصلَح في §11.19/§11.20 للعدّ، لم يُطبَّق بعد
على التصفّح. المالك وافق صراحةً على توسيعه.

### الإصلاح
دالة جديدة `expandWithDescendants()` تُطبَّق على الأصناف المطابقة اسمياً
قبل بناء شرط `IN` في SQL — نفس منطق بناء إغلاق الشجرة في `getProjectSections()`
لكن بصياغة عامة قابلة لإعادة الاستخدام (BFS عبر خريطة أبناء مبنية من نتيجة
`getSections()` الموسَّعة الآن لتشمل `parent_section_id`، الذي لم يكن
يُختار من قبل).

### التحقّق الحيّ
```
قبل: searchProjectsDB({section:'ثقافي'}) → total_found: 30
بعد: searchProjectsDB({section:'ثقافي'}) → total_found: 144
```
144 لا 156 (المُعادلة الدقيقة لعدّاد الموقع) — **فرق متوقَّع ومقصود لا خلل**:
`searchProjectsDB` تشترط `deleted_at IS NULL` (صحيح لعرض تصفّح فعلي — لا
يجوز ربط الزائر بمشروع محذوف)، بخلاف عدّاد `get_project_sections` الذي
يطابق عمداً عدّاد الموقع العام (يشمل المحذوف ناعماً، انظر §11.20). الفارق
(≈12) هو عدد المشاريع المحذوفة ناعماً ضمن شجرة "الثقافية" تحديداً — **هذا
الفارق صحي ومطلوب**: "كم" يطابق عدّاد الموقع، "أرني" يعرض فقط ما يصلح
فعلياً للتصفّح.

وعبر `/api/chat/site` الفعلي: "اعطني قائمة بمشاريع ثقافية متنوعة" أعاد
مشاريع متنوّعة فعلاً من فروع الشجرة المختلفة (مكتبات، مركز ترجمة، جمعية
كشافة...) لا الفنّة الضيّقة السابقة فقط.

### التحقّق
`tsc` نظيف · **388 اختباراً ناجحاً / 25 ملفاً** (+4 اختبارات جديدة لفلتر
section تحديداً، بينها حالة "بلا أي صنف مطابق" لمنع IN فارغة تُسقِط كل
النتائج خطأً) · فحص حيّ مباشر ضدّ القاعدة · فحص حيّ عبر `/api/chat/site`
الفعلي.

### ملاحظة اختبار
`getSections()` مخزَّنة مؤقّتاً على مستوى الوحدة (كاش 15 دقيقة، موجود
مسبقاً قبل اليوم) — اختبارات `search-projects-section-filter.test.ts`
تستدعي `jest.resetModules()` قبل كل حالة لمنع تسرّب كاش من اختبار لآخر.

### الملفات المعدَّلة/المضافة
```
lib/server/projects-db-service.ts (معدَّل)
lib/server/__tests__/search-projects-section-filter.test.ts (جديد)
```

---

## 11.22 جولة فحص استباقية شاملة — نمط «العدّ المضلِّل» عبر كل الأدوات — 2026-08-21

### الطلب
بعد سلسلة إصلاحات §11.15–§11.21 (كلها من نفس نمطين متكرّرين: `total:
results.length` بعد `LIMIT` بدل `COUNT(*)` حقيقي، وفلترة نصّية ضيّقة تفوّت
أصنافاً هرمية)، سأل المالك صراحةً: "نعم اعما جولة فحص استباقية شاملة" —
فحص كل الأدوات المتبقّية لنفس النمطين قبل اكتشافهما صدفة بالاستخدام الحيّ.

### المنهجية
`grep` شامل لـ`total: .*\.length` عبر `lib/server/*.ts`، ثم فحص كل نتيجة
يدوياً: هل هي فعلاً بعد `LIMIT` (خلل)، أم عدّ كامل بلا قصّ (سليم)؟ وبالتوازي
فحص كل جدول أصناف/فئات (`grep` لـ`parent_id`/`parent_section_id`) بحثاً عن
هرمية غير مُعالَجة في فلاتر النصّ.

### 🔴 وُجد: `places-service.ts` → `searchPlaces()`
نفس خلل §11.13/§11.15/§11.18 حرفياً — `total: results.length` بعد
`LIMIT ?` (1-30 صفاً)، بلا أي `COUNT(*)` مستقلّ. لا هرمية في `places_categories`
(6 صفوف مسطّحة، بلا عمود أب) فالإصلاح المطلوب هو العدّ فقط.

**الإصلاح:** استعلام `COUNT(*)` مستقلّ بنفس شروط `WHERE` (بلا `LIMIT`)،
يُنفَّذ قبل استعلام العرض المقصوص، بنفس نمط `runTier()` المستخدم اليوم في
publications/lost-items/friday-sermons/videos.

**التحقّق الحيّ (مقارَن مع `getPlaceCategories()` المستقلّة، مؤكَّدة سليمة سابقاً):**
```
searchPlaces({category:"الفنادق"}) → total: 892   (getPlaceCategories: 892 ✓)
searchPlaces({category:"المزارات"}) → total: 22    (getPlaceCategories: 22  ✓)
searchPlaces({})                    → total: 4056  (كل الجدول)
```
وعبر `/api/chat/site` الفعلي: "كم فندقاً مسجّل لديكم في دليل الأماكن؟" ⇒
"892 فندقاً" (كان سيُجيب برقم القصّ فقط، على الأرجح 8 أو أقل، قبل الإصلاح).

### ✅ فُحص وتأكَّد سليماً (لا خلل)
| الملف/الدالة | لماذا سليم |
|---|---|
| `contacts-service.ts` | بلا `LIMIT` إطلاقاً — `total: contacts.length` عدّ كامل صادق |
| `analytics-service.ts` (4 دوال) | كلها `COUNT(*)` حقيقي في SQL، لا `.length` |
| `news-service.ts` → `list_news_categories`/`get_content_statistics` | مبنيّة على `getAllNews()` بلا `LIMIT` (~36 ألف خبر، كاش 10 دقائق) — عدّ كامل |
| `site-api-service.ts` → `search_content` | حارس `total_is_partial` (من §11.2) لا يزال سليماً، لم ينتكس |
| `get_content_by_id`/`get_prayer_times`/`get_project_image(s)`/`get_news_images` | استعلامات صنف واحد بمعرّف معروف — لا مفهوم "عدّ" أصلاً |
| هرمية أصناف الأخبار | `news_type`/`category_id` مسطّحة تماماً (لا `parent_id`) — لا فجوة هرمية ممكنة |
| `search_projects_db` → `total_found` (المسار النصّي الحرّ) | `SEARCH_SCAN_LIMIT=5000` يفوق حجم الجدول الفعلي (~358-762 مشروعاً) فيُحسَب `.length` على المصفوفة **الكاملة غير المقصوصة** قبل أي `slice` نهائي — لا خلل رغم استخدام `.length` ظاهرياً |

### 🟡 وُجد ولم يُصلَح (أولوية أدنى، قرار مؤجَّل عمداً)
`news-service.ts` → `siteGetLatest` (`get_latest_news`): `total:
projects.length` حيث `projects = data.slice(0, limit)` — نفس الشكل الظاهري
للخلل، لكن الأداة غرضها "آخر N خبراً" لا العدّ، وأدوات العدّ المخصَّصة
(`count_news`/`get_content_statistics`) قائمة ومُرسَّخة في الموجّه أصلاً.
خطر الالتباس منخفض عملياً — **لم يُصلَح، ذُكر هنا صراحةً بدل تركه صامتاً**.

### التحقّق
`tsc` نظيف · **392 اختباراً ناجحاً / 26 ملفاً** (تشمل 4 اختبارات جديدة لـ
`searchPlaces`) · فحص حيّ مباشر ضدّ القاعدة (مقارَن مع مصدر مستقلّ) · فحص
حيّ عبر `/api/chat/site` الفعلي.

### الملفات المعدَّلة/المضافة
```
lib/server/places-service.ts (معدَّل)
lib/server/__tests__/places-service.test.ts (جديد)
```

---

## 10. قواعد عمل ألتزم بها عند التطوير في هذا المشروع

1. **`analytics-service.ts` هو المعيار** — أي خدمة جديدة: SQL معلّم، حدود مقصوصة، `{success, data?, error?}`، بلا رمي استثناءات، توثيق داخلي.
2. **لا شيء يصل إلى HTML بلا تهريب** — كل قيمة تدخل سمة أو عنصر تمرّ بدالة تهريب صريحة.
3. **كل قيمة مستخدم عبر `?`** — بلا استثناء، حتى للأعداد.
4. **مسارات القصر لا تعتمد على OpenAI** — المنسّق والمعرفة وحارس النطاق يجب أن تعمل والمفتاح غائب.
5. **أي تغيير في `route.ts` أو `analytics-service.ts` ⇒ `npx jest --forceExit` قبل الـ commit.**
6. **الواجهة الكاملة (`components/chat/*`) هي المشروع** (§0.1) — أي ميزة تبدأ منها، ولا تُعدّ منجزة قبل ظهورها فيها. أمّا **الإصلاحات الأمنية** فتُطبَّق في `renderMarkdown.ts` و`widget.js` معاً حتى يُستخرج المشترك.
7. **لا أرقام ولا تواريخ مثبّتة في الموجّه** — تُشتقّ من البيانات.
8. **لا كاش جديد على مستوى الوحدة** — الحالة المشتركة تعيش في القاعدة أو في مخزن خارجي.
9. **مراجعة `.env.local.example`** عند إضافة أي متغيّر بيئة، مع توثيق سلوك الغياب صراحةً (fail-fast لا احتياطي صامت).

---

## 11. سجلّ المعالجة — 2026-08-10

> ما نُفِّذ فعلاً، مع التحقّق. البنود غير المذكورة هنا **لم تُعالَج** وتبقى وفق §9.

### ✅ ح-1 — تزوير جلسة الإدارة
| الملف | التغيير |
|---|---|
| `lib/server/admin-auth.ts` | `getSessionSecret()` يرفض السرّ الغائب أو الأقصر من 32 محرفاً. `verifySession` يعيد `null` (مغلق افتراضياً) بدل القبول بمفتاح فارغ، و`createSession` يرمي بدل إصدار جلسة ضعيفة. أُضيفت `isAdminAuthConfigured()`. |
| `app/api/admin/auth/login/route.ts` | يعيد **503** برسالة إعداد صريحة عند نقص الإعداد، ولم يعد يسرّب `err.message` في الخطأ 500. |

**التحقّق:** 12 اختبار انحدار في `lib/server/__tests__/admin-auth.security.test.ts` (يشمل تزوير كوكي بمفتاح فارغ، سرّ قصير، سرّ مختلف، جلسة منتهية، قيم مشوّهة). وفحص حيّ: كوكي مزوّرة بمفتاح فارغ ⇒ **401** على `/api/knowledge` و`/api/analytics`.

### ✅ ح-2 — XSS في طبقة العرض
| الملف | التغيير |
|---|---|
| `components/chat/renderMarkdown.ts` | `escapeHtml`/`escapeAttr` يهرّبان `"` و`'` أيضاً. `safeUrl()` يقصر البروتوكولات على http/https/mailto/tel. `safeAssetUrl()` يقصر الصور والفيديو وبطاقات الفيديو على https + نطاقات الكفيل. التهريب طُبِّق على **كل** البُناة: النصّ العادي، المعرض، بطاقات الاتصال، بطاقات المصادر، مشغّل الفيديو. |
| `components/chat/renderMarkdown.ts` | حُذفت المعالجات المضمّنة `onerror=`/`onclick=` واستُبدلت بـ `data-gm-fallback` و`data-gm-video` (يفتح الطريق لـ CSP صارم لاحقاً). |
| `components/chat/MessageList.tsx` | `onErrorCapture` لبديل الصور المكسورة، وتفويض النقر لتشغيل الفيديو. |
| `public/widget.js` | `_fmt` يرفض الروابط ذات البروتوكولات الخطرة (كان يسمح بـ `javascript:`). |

**التحقّق:** 20 اختباراً في `components/chat/__tests__/renderMarkdown.security.test.ts` تفحص الناتج **عبر مُحلّل DOM حقيقي** (jsdom) لا بتعبير نمطي — تأكيد عدم وجود أي سمة `on*`، ولا عنصر تنفيذي، ولا بروتوكول خطر، مع اختبارات حفظ السلوك الطبيعي.

> ⚠️ ملاحظة اكتُشفت أثناء كتابة الاختبارات: بطاقة الفيديو الاحتياطية كانت تقبل أي مضيف https، فيمكن عرض رابط خارجي بهيئة «مصدر رسمي». صارت تستعمل `safeAssetUrl` (نطاقات الكفيل فقط). بطاقات المصادر العامة ما تزال تقبل أي https عمداً — الإجابات المنسّقة يضبطها مدير ويجوز أن تشير لجهة خارجية.

### ✅ ح-3 — CORS مفتوح
| الملف | التغيير |
|---|---|
| `lib/server/cors.ts` (**جديد**) | مصدر واحد لقرار السماح: نطاقات alkafeel.net وفروعها + `SITE_DOMAIN` + `CHAT_ALLOWED_ORIGINS` (مفصولة بفواصل) + أي منفذ localhost في التطوير فقط. `corsHeaders()` لا تُصدر `*` إطلاقاً وتضبط `Vary: Origin`. |
| `app/api/chat/site/route.ts` | يحجب الأصل غير المصرّح بـ **403 قبل** أي استدعاء OpenAI أو استعلام قاعدة بيانات. حُذف `ALLOWED_ORIGINS` الميت والاستيراد غير المستخدم `saveChatLog`. |
| `app/api/chat/feedback/route.ts` | نفس فحص الأصل + **حدّ معدّل مستقلّ** (30/دقيقة) — كانت مفتوحة تماماً وقابلة لتسميم لوحة التحليلات. |

**التحقّق:** 12 اختباراً في `lib/server/__tests__/cors.test.ts` (تشمل انتحال النطاق مثل `alkafeel.net.evil.com`). وفحص حيّ على خادم فعلي: أصل خارجي ⇒ **403** على الشات والتقييم وطلب preflight؛ `https://alkafeel.net` ⇒ 204 مع الترويسة الصحيحة؛ ومحادثة حقيقية من localhost تعمل (مسار منسّق + مسار أدوات).

> **⚠️ إجراء تشغيلي مطلوب قبل النشر:** إن كان الودجت مضمّناً في نطاق خارج `*.alkafeel.net` فأضِفه إلى `CHAT_ALLOWED_ORIGINS` وإلّا حُجب بـ 403.
> **وما يزال ناقصاً من ح-3:** حدّ المعدّل ما يزال في ذاكرة العملية — الطلبات بلا ترويسة `Origin` (خادم-إلى-خادم/curl) لا يحكمها CORS. الحماية الكاملة تحتاج مخزناً مشتركاً (§9 المرحلة الأولى).

### ✅ الخلل الصامت — بحث المشاريع
`lib/server/projects-db-service.ts`: رُفع `LIMIT 200` إلى ثابت مُوثَّق `SEARCH_SCAN_LIMIT = 5000` مع تحذير في السجلّ عند الاقتراب منه. الآن كل الـ 358 مشروعاً قابل للبحث. (الحلّ الجذري — نقل الترشيح إلى SQL/FULLTEXT — يبقى في §9 المرحلة الثانية.)

### ✅ مجموعة الاختبارات
| الملف | التغيير |
|---|---|
| `lib/server/rate-limiter.ts` | `unref()` على مؤقّت التنظيف ⇒ `npm test` **ينتهي ذاتياً** بلا `--forceExit`. |
| `app/api/chat/site/route.ts` | نُقل فحص `OPENAI_API_KEY` إلى ما قبل أول استعمال فعلي للنموذج ⇒ مسارات القصر (منسّق/معرفة/حارس) تعمل بلا مفتاح كما صُمّمت (ب-5). |
| `route.site.integration.test.ts` | حُدِّث ليحاكي `curated-service`/`kb-service` (صارا مدعومين بقاعدة بيانات بعد كتابة الاختبار). |
| `analytics-service.{pure,sql}.test.ts` | صُحّحت توقّعات قديمة تسبق المطابقة كلمة‑كلمة؛ الثابت الحاكم (عدد `?` == عدد المعاملات) بقي مُختبَراً وصار **أقوى** (`2 × عدد الرموز`). |

**النتيجة:** من 123/131 ناجح ومجموعة معلّقة ⇒ **172/172 ناجح** وتنتهي ذاتياً. `tsc --noEmit` نظيف و`next lint` بلا أخطاء.

### ملفات أُضيفت
```
lib/server/cors.ts
lib/server/__tests__/cors.test.ts
lib/server/__tests__/admin-auth.security.test.ts
components/chat/__tests__/renderMarkdown.security.test.ts
```

---

## 11.1 حذف الودجت الجانبي القديم — 2026-08-10

بقرار المالك (قديم وغير مطلوب) حُذف الودجت الصغير وكل ملحقاته:

| المحذوف | السبب |
|---|---|
| `public/widget.js` (789س) | الودجت القديم نفسه |
| `public/widget-loader.js` (399س) | نسخة أقدم، ميتة بلا أي مرجع |
| `public/preview.html` | صفحة معاينته |
| `app/api/widget/route.ts` | نقطة API التي كانت تخدمه |
| `tests/` بالكامل (3 ملفات) | سكربت يدوي غير مربوط بأي `npm script`؛ اختباراته 1/2/5 عن الودجت، واختبار CORS فيه صار يناقض الإصلاح الأمني (يتوقّع السماح لأي أصل) |

**تنظيف المراجع المتبقّية:**
- `vercel.json` — حُذفت كتلتا الترويسات لـ `/widget.js` و`/api/widget`، و`"public"` صار `false` (كان يتيح فحص السجلّات والمصادر علناً — بند من §7.7)
- `jest.config.js` — أُزيل `/tests/` من `testPathIgnorePatterns`
- `.vercelignore` — أُزيل تعليق «نحتاج widget.js»
- `README.md` — تحذير في أعلاه بأنه قديم وأن تعليمات التضمين لم تعد تعمل

**أثر جانبي اكتُشف بالفحص الحيّ وعولج:** بعد الحذف كان `/widget.js` يُطابَق كقيمة لـ `[locale]` فيُعيد **صفحة HTML بحالة 200** بدل 404 — أي أن أي تضمين قديم يحمّل صفحة على أنها سكربت. أُضيفت قائمة لغات بيضاء في `app/[locale]/layout.tsx` (`SUPPORTED_LOCALES = {"ar"}` + `notFound()`)، وهذا يعالج أيضاً بند «الـ locale بلا حصر» من §7.7.

**التحقّق:** `next build` ناجح و`/api/widget` اختفى من قائمة المسارات. وعلى خادم حيّ: `/widget.js` و`/preview.html` و`/widget-loader.js` و`/api/widget` ⇒ **404**؛ و`/ar` و`/ar/admin/login` ⇒ 200؛ و`/` ⇒ 307؛ و`/en` ⇒ 404؛ ومحادثة حقيقية (أوقات الصلاة) تعمل. `tsc` نظيف، `lint` بلا أخطاء، **172/172 اختباراً ناجحاً**.

> **ملاحظة متبقّية:** `public/worker-development.js` بقايا `next-pwa` وما يزال موجوداً — غير مرتبط بالودجت، ويُحذف ضمن تنظيف التبعيات الميتة (§7.1، §9 المرحلة الثالثة).

---

## 11.2 تنفيذ خطة النقاط الثلاث — 2026-08-10

### ① المِسطرة: مجموعة تقييم ذهبية + عدّاء

| الملف | الدور |
|---|---|
| `eval/generate-cases.ts` | يولّد الحالات من بيانات حقيقية (`npm run eval:generate`) |
| `eval/cases/known-items.json` | **70 حالة «عنصر معروف»** — مستند حقيقي + استعلام مشتقّ من عنوانه، والمتوقّع عودة معرّفه ضمن أفضل K. مرجع موضوعي بلا وسم بشري |
| `eval/cases/user-queries.json` | **149 سؤالاً حقيقياً** مستخرجاً من `chat_logs` |
| `eval/run.ts` | يحسب recall@1/@5/@10 و MRR واتفاق أفضل ٥، ويقارن بلقطة محفوظة (`npm run eval`) |

خصائص مقصودة: **لا يستدعي OpenAI إطلاقاً** (يقيس طبقة الاسترجاع مباشرةً) فهو سريع وحتمي وبلا كلفة، وفيه **بوّابة انحدار** تُفشل التشغيل عند هبوط يتجاوز 3 نقاط مئوية.

```bash
npm run eval                    # تقرير
npm run eval -- --save baseline # حفظ لقطة
npm run eval -- --compare baseline   # مقارنة (يفشل عند الانحدار)
```

**خطّ الأساس المسجَّل** (`eval/snapshots/baseline.json`): recall@1 68.6% · recall@5 90.0% · recall@10 92.9% · MRR 0.783.

### ② الأسماء الصادقة + سجلّ الأدوات

| الاسم القديم (كان يكذب) | الاسم الجديد | ما يفعله فعلاً |
|---|---|---|
| `search_projects` | `search_content` | يبحث في الأخبار والسيرة والتاريخ والفيديو والمشاريع |
| `get_project_by_id` | `get_content_by_id` | يجلب عنصراً من أي مصدر |
| `filter_projects` | `list_news_categories` | يُرجع تصنيفات الأخبار |
| `get_latest_projects` | `get_latest_news` | أحدث الأخبار |
| `get_statistics` | `get_content_statistics` | إحصاءات المحتوى |

- `LEGACY_TOOL_ALIASES` + `canonicalToolName()` يقبلان الأسماء القديمة ويترجمانها (النموذج قد يُصدرها من نمط محفوظ).
- **لم يُعَد استعمال أي اسم قديم بدلالة جديدة** عمداً، كي لا تختلط دلالة `chat_logs.tool_called` التاريخية. ولوحة التحليلات توحّد الأسماء عبر `CASE` قبل التجميع، وقوائم الاستثناء تشمل الاسمين.
- سلسلة `if (toolName === …)` ذات العشرة فروع استُبدلت بـ **`DIRECT_TOOL_HANDLERS`** (خريطة): إضافة أداة = مدخلة، لا تعديل في جسم دالة طويلة.
- **الموجّه**: حُدِّثت مراجعه، وأُزيلت أحرف صينية مسرّبة (`معلومات动态ة`، `它是`)، و**استُبدلت «السنة الحالية = 2026» المثبّتة بحقن ديناميكي** لتاريخ اليوم بتوقيت بغداد — كان البوت سيبحث في سنة خاطئة ابتداءً من 2027.

**النتيجة المقيسة:** صفر انحدار — **اتفاق 100%** على أفضل ٥ وكل المقاييس متطابقة (كما يجب: التسمية طبقة توجيه لا استرجاع).

### ③ نقل البحث إلى قاعدة البيانات

`lib/server/search-engine.ts` (جديد) — **رشِّح ثمّ أعد الترتيب**:

```
المرحلة ١ — SQL يرشّح المرشّحين:
   استعلام العنوان : أي كلمة في العنوان، ORDER BY عدد كلمات العنوان المطابقة، LIMIT 300
   استعلام المتن   : أي كلمة في المتن، ORDER BY id DESC (توقّف مبكّر)، LIMIT 250
المرحلة ٢ — Node:
   scoreItem **بلا تعديل حرف واحد** ترتّب المرشّحين
```

قرارات مبنية على قياس فعلي لا تخمين:

| القرار | السبب المقيس |
|---|---|
| `ORDER BY n.id DESC` للمتن | الترتيب بتعبير محسوب أو بـ`created_at` يجبر MySQL على تقييم كل المطابقات قبل `LIMIT`: **1.3–3.6 ثانية**. الترتيب بالمفتاح الأساسي يتوقّف مبكراً: **89–176ms** |
| تطبيع العنوان فقط (لا المتن) | التطبيع (9 REPLACE متداخلة) على عمود المحتوى (89.7 ميغابايت): **448ms** مقابل **69ms** بدونه |
| المصادر الصغيرة تبقى في الذاكرة | السيرة 13 + التاريخ 27 + المشاريع 358 = 398 عنصراً — لا مبرّر لتعقيدها |
| حذف تسخين الأخبار والفيديو | كان **3.4–7.5 ثانية** على كل إقلاع بارد |

**خلل اكتُشف بالقياس وأُصلح — ترتيب المعاملات:** وُضعت معاملات `ORDER BY` قبل معاملات `WHERE`، بينما SQL يربطها بترتيب ظهورها **النصّي**. لم يُنتج ذلك خطأ SQL بل أزاح النافذة الزمنية فالتقطت أنماط LIKE بدل التواريخ ⇒ **فساد صامت** في الترشيح: متوسط الصلة هبط إلى 20.73 و**صفر تطابق** مع المحرّك القديم. بعد الإصلاح: 25.25 واتفاق 62% على العيّنة. الاختبار `search-engine.test.ts` يحرس هذا الثابت تحديداً.

**إصلاح `total` المضلّل:** التشخيص أن `search_content` أداة **استرجاع** استُعملت كأداة عدّ. القياس على 149 سؤالاً: وسيط 44,155 من أصل 56,819، و147 سؤالاً تتجاوز الألف — والموجّه كان يأمر النموذج بعرض الرقم كـ«عدد الأخبار». الآن: الموجّه يوجّه العدّ إلى **count_news** حصراً، و`total` صار عدد المرشّحين مع علم **`total_is_partial`**.

### النتيجة النهائية المقيسة

| المقياس | قبل (ذاكرة) | بعد (قاعدة) |
|---|---|---|
| recall@1 / @5 / @10 | 68.6% / 90.0% / 92.9% | **68.6% / 90.0% / 92.9%** (متطابق) |
| MRR | 0.783 | **0.783** (متطابق) |
| نتائج غير فارغة | 100% | **100%** |
| اتفاق أفضل ٥ | — | 71.0% |
| حلقة إعادة الترتيب | **2,273ms** | **23–35ms** |
| العناصر المحمّلة للتسخين | 56,819 | **398** |
| الإقلاع البارد | 3.4–7.5 ثانية | ~0 |
| زمن التقييم الكامل | 427s | 325s |

> **تحفّظ صادق:** على عيّنة 30 سؤالاً حقيقياً بقي متوسط درجة الصلة أدنى بقليل (25.25 مقابل 26.16 ≈ 3.5%)، لأن نافذة المرشّحين محدودة بينما المحرّك القديم يرى كل شيء. مقياس «العنصر المعروف» — وهو المرجع الموضوعي — **متطابق تماماً**. إغلاق الفارق يحتاج فهرس FULLTEXT:
> ```sql
> ALTER TABLE news ADD COLUMN search_norm TEXT GENERATED ALWAYS AS (...) STORED;
> CREATE FULLTEXT INDEX ft_news_norm ON news (search_norm) WITH PARSER ngram;
> ```
> وهي عملية DDL على جدول إنتاجي — **تحتاج قرارك**، ولم أنفّذها.

> **مفتاح التراجع الفوري:** `SEARCH_ENGINE=memory` يعيد السلوك القديم بالكامل بلا نشر جديد. والافتراضي `db`.

### الملفات المضافة في هذه الجولة
```
eval/{generate-cases.ts, run.ts, tsconfig.json}
eval/cases/{known-items.json, user-queries.json}
eval/snapshots/baseline.json
lib/server/search-engine.ts
lib/server/__tests__/{search-engine.test.ts, tool-registry.test.ts}
```
**الاختبارات: 211 ناجحاً / 15 ملفاً.** `tsc` نظيف، `lint` بلا أخطاء، `next build` ناجح، وفحص حيّ على خادم فعلي.

---

## 11.3 جولة إصلاحات الجودة والتشغيل — 2026-08-10

### أ) الأعطال الثلاثة المؤثّرة على الإجابة

| العطل | الإصلاح |
|---|---|
| **بتر الأجوبة** — `max_tokens: 500` مقصلة لا أداة اختصار | القياس على 260 جواباً: الوسيط **427 محرفاً** (الإيجاز سائد أصلاً) و12.7% فقط تتجاوز 1100 — وهي القوائم التي تحتاج طولها. نُقل الاختصار إلى **«ميزانية الطول» في الموجّه** (3–6 أسطر، بلا تمهيد ولا خاتمة، استثناء التعداد الفعلي، وحماية صريحة لكتلة المصادر)، وبقي السقف **شبكة أمان عند 1000** |
| **تشويه التاريخ** — إخفاء PII على ردود المساعد يحوّل أرقامه إلى `[PHONE]` | `sanitizeMessages` صار **حسب الدور**: رسائل المستخدم تُنظَّف كاملاً، ورسائل المساعد تُجرَّد من HTML فقط (بلا إخفاء ولا قصّ) |
| **إجبار البحث على المجاملات** | لم يُغيَّر `tool_choice` (فهو ضمانة «لا إجابة بلا أداة»). أُضيف **`isSmallTalk`** — حارس حتمي محافظ في `scope-guard.ts` (أي علامة استفهام أو أداة استفهام أو >4 كلمات ⇒ ليس مجاملة) يقصر المسار قبل أي أداة أو نموذج |

**التحقّق الحيّ:** «شكراً جزيلاً» ⇒ **965ms** بلا أداة ولا نموذج · سؤال أرقام الهاتف ⇒ **الأرقام الأربعة كاملة + العنوان في 549 محرفاً** منتهياً بجملة مكتملة.

### ب) عيب مطابقة المخزن المنسّق

**القصة:** نمط واحد فضفاض («العباس») يخطف كل الأسئلة، لأن المطابقة كانت «أوّل تطابق يفوز». المحاكاة أعادت إنتاجه: «متى استشهد العباس» و«أين مرقد العباس» و«صفات العباس» ⇒ **كلها جواب أم العباس**. هذا ما دفع المالك لحذف ستّ مدخلات سليمة.

خطّا دفاع:
1. **`checkPatternBreadth`** في التحقّق — يرفض النمط الفضفاض ابتداءً (كلمة مفردة قصيرة، أو من قائمة كلمات شديدة الشيوع في النطاق: العباس/الحسين/العتبة/كربلاء/مشروع…) برسالة عربية تشرح السبب وتقترح بديلاً. القائمة **تُطبَّع عند التحميل** — بدونها تنجو صيغ مثل «العتبة» بالتاء المربوطة.
2. **`matchCurated` يختار الأكثر تحديداً** (أطول نمط مطابِق) بدل الأوّل، مع ترجيح الأولوية ثم المعرّف عند التساوي.

> **ملاحظة:** المدخلات الستّ المحذوفة **لم تُستعَد** بقرار المالك. جدول `curated_answers` فيه صفّان (7، 8) و`AUTO_INCREMENT=9`. و`kb_articles` **فارغ تماماً** — ميزة قاعدة المعرفة مبنيّة بالكامل وغير مستعملة.

### ج) إصلاحات تشغيلية

| البند | قبل | بعد |
|---|---|---|
| **أرقام العتبة في السجلّات** | 12 سجلّاً بـ`[ID]` و**صفر** برقم سليم (القاعدة `\d{14,16}` تبتلع أرقام العتبة ذات الـ15 رقماً) | تُستثنى الأرقام التي تبدأ بـ`00964`/`964`. **تحقّق حيّ: الأرقام الأربعة ظاهرة** |
| **برك الاتصال** | 7 برك لـ3 قواعد | **3 برك** — `logs-db.ts` جديد يوحّد أربع برك، و`projects-service` يشارك بِركة `projects-db-service` |
| **`LOGS_DB_NAME` الاحتياطي الصامت** | يسقط إلى قاعدة المحتوى بلا تحذير | تحذير صريح عند استعمال `PROJECTS_DB_NAME`، و**خطأ واضح** عند غياب الاثنين |
| **تسريب اتصال** في `get_content_statistics` | `createConnection` بلا `finally` | يستعمل البِركة المشتركة عبر `countProjects()` — لا اتصال جديد أصلاً |
| **أرقام مثبّتة** في الموجّه والأدوات | «358 مشروع»، «20,769 فيديو»، «4,084 مكان»، «43 قسماً» | أُزيلت كلها (بقيت أرقام مثال التنسيق فقط) |
| **تتبّع الكلفة** | معدوم | عمودا `prompt_tokens`/`completion_tokens` + `stream_options.include_usage` |
| **حدّ المعدّل** | `Map` في ذاكرة العملية فقط | `rate-limit-store.ts` — نافذة ثابتة في جدول `rate_limits` بزيادة ذرّية، **مع تدهور آمن** عند فشل القاعدة |

**اكتشاف من تتبّع الكلفة فور تفعيله:** سؤال واحد استهلك **9,226 رمز إدخال** (وآخر 12,104) مقابل 174 رمز إخراج. أي أن **الكلفة كلها تقريباً في الإدخال** — الموجّه (439 سطراً) + تعريفات الأدوات + نتائجها. هذا يجعل تقليص الموجّه وتفعيل Prompt Caching أعلى عائداً بكثير مما قدّرت سابقاً.

### التحقّق
`tsc` نظيف · `lint` بلا أخطاء · **268 اختباراً ناجحاً / 17 ملفاً** · `next build` ناجح · فحص حيّ لكل بند.

### ملفات أُضيفت
```
lib/server/logs-db.ts
lib/server/rate-limit-store.ts
lib/server/__tests__/answer-quality.test.ts
lib/server/__tests__/curated-matching.test.ts
```

---

## 11.4 قياس الكلفة وفرضية فصل الموجّه — 2026-08-11

### أ) قياس الكلفة صار كاملاً

كان التتبّع يسجّل **النداء الأخير فقط**، بينما السؤال الواحد يستهلك:

```
نداء/نداءات اختيار الأداة  →  الموجّه + تعريفات الأدوات
نداء الجواب المتدفّق       →  الموجّه + نتائج البحث
```

الآن `resolveToolCalls` يُعيد `usage` مجمّعاً، ويُضاف إليه استهلاك نداء البثّ،
وأُضيف عمود `cached_tokens`.

**الفرق هائل:** كان المسجَّل 9,226 رمزاً لسؤال، والقياس الكامل لسؤال مماثل
**32,057 رمزاً** — أي أن الرقم القديم كان يمثّل أقلّ من ثلث الكلفة.

**واكتشاف مطمئن:** التخزين المؤقّت التلقائي يعمل بكفاءة **95%** (30,336 من 32,057).
> ⚠️ **تصحيح لتوصية سابقة في §7.4:** كنت أوصيت بـ«تفعيل Prompt Caching» — وهو
> **مُفعَّل تلقائياً أصلاً** لهذا النموذج ويعمل بكفاءة عالية. التوصية كانت في غير محلّها.

### ب) فرضية فصل الموجّه — **جُرّبت وقيست ورُفضت**

**الفرضية:** إرسال الموجّه «الجوهري» فقط لنداءات اختيار الأداة (قواعد العرض لا
تلزمها)، وتوفير ~2,228 رمزاً في كل نداء اختيار.

**البرهان المُصمَّم:** نداء الاختيار يعمل بـ`temperature: 0`، فمُرّرت أسئلة حقيقية
على الموجّهين وقُورن **اسم الأداة** و**معاملاتها** (أي الاستعلام المُصاغ من اللهجة).

**النتيجة على 30 سؤالاً حقيقياً:**

| المقياس | النتيجة |
|---|---|
| نفس الأداة | **26/30 (86.7%)** |
| نفس الأداة **والمعاملات** | **17/30 (56.7%)** |
| التوفير | 2,228 رمز/نداء (وأغلبه مخزَّن مؤقتاً أصلاً) |

مثال يوضّح الخطر مباشرةً:

```
"اريد ادرس قانون بالنجف شسوي ؟"
   بالموجّه الكامل : search_projects_db {query: "جامعة الكفيل"}   ← ترجمة أدقّ
   بالجوهري        : search_projects_db {query: "جامعة", section: "تعليمية"}
```

**الاستنتاج:** أقسام العرض والأمثلة **تؤثّر فعلاً على صياغة الاستعلام من اللهجة
العامّية**، لا على التنسيق وحده. الفصل ليس محايداً، والتوفير ضئيل (وأغلبه مخزَّن
أصلاً) مقابل تغيّر سلوكي كبير ⇒ **رُفض ولم يُثبَّت**.

`route.ts` يُرسل الموجّه الكامل في كل النداءات كما كان، مع تعليق يشرح القياس.
وبقيت الأدوات لإعادة الاختبار مستقبلاً:
- `SITE_BOT_CORE_PROMPT` / `SITE_BOT_PRESENTATION_PROMPT` (و`SYSTEM_PROMPT` مركّب منهما — بلا تغيير سلوكي)
- `npm run eval:tools` — مقارنة A/B قابلة لإعادة التشغيل

> **درس عام:** لا تُفترض حيادية أي تغيير في الموجّه. القياس هنا منع انحداراً صامتاً
> كان سيمرّ لولاه — وهذا ثاني انحدار يمسكه القياس بعد خلل ترتيب المعاملات (§11.2).

### التحقّق
`tsc` نظيف · `lint` بلا أخطاء · **268 اختباراً ناجحاً** · فحص حيّ يُظهر الكلفة الكاملة.

---

## 11.5 اختبار التسلسلية (المحادثة متعدّدة الدورات) — 2026-08-12

### السؤال
هل يفهم البوت أن «كم عمره؟» تعود على الشخص الذي ذُكر في الدورة السابقة، أم يجب
على المستخدم إعادة ذكر الاسم كاملاً في كل سؤال؟

### الآلية
الواجهة ترسل **كامل تاريخ المحادثة** مع كل طلب (`useChat.ts`)، فيصل النموذج
السؤالُ الجديد مع ما سبقه. وحلّ الإشارة يظهر في **الاستعلام الذي يبنيه النموذج**
لا في نصّ السؤال.

### الأداة: `npm run eval:turns`
`eval/multi-turn.ts` — 10 سيناريوهات بردود مساعد **مُعلّبة** (لتكون حتمية ورخيصة)،
تقيس على خطوة الاختيار بـ`temperature: 0` هل حُلّت الإشارة في معاملات الأداة.

### النتيجة: **10/10**

| السيناريو | المتابعة | ما صاغه النموذج |
|---|---|---|
| ضمير على شخص | «متى تم تعيينه؟» | `query: "تعيين الأمين العام للعتبة العباسية"` |
| ضمير على مشروع | «كم نسبة إنجازه؟» | `query: "صحن أم البنين نسبة إنجاز"` |
| مكان ← هاتف | «وما رقم هاتفه؟» | `search_contacts {query: "مستشفى الكفيل"}` |
| إشارة ترتيبية | «أعطني تفاصيل الثاني» | `query: "مستشفى الزكي"` |
| **عامية عراقية** | «شنو اخر وحدة منهن؟» | `query: "مستشفى الزكي"` |
| إشارة زمنية | «وتموز؟» | `from_date: "2026-07-01", to_date: "2026-07-31"` |
| ثلاث دورات | «متى تسلّم المنصب؟» | `query: "تسلم المتولي الشرعي للعتبة"` |
| تغيير موضوع | «ما آخر أخبار العتبة؟» | لم يسحب سياق أوقات الصلاة ✅ |

> **ملاحظة منهجية:** ظهر فشل واحد في التشغيل الأول («وتموز؟») ثم تبيّن أنه **خطأ في
> الاختبار لا في البوت** — كنت أفحص حقل `query` وحده بينما النموذج وضع التاريخ في
> `from_date`/`to_date` صحيحاً. صُحّح الفحص ليشمل كامل المعاملات.

### 🔴 انحدار اكتشفه الاختبار — في حارس المجاملات الذي أُضيف في §11.3

«تمام» و«اوكي» و«طيب» و«ممتاز» كانت مصنّفة **مجاملة خالصة**. لكن في العامية
العراقية، حين يسأل البوت «هل تريد تفاصيل أعمق؟» فيردّ المستخدم «تمام» فهو **يوافق
لا يجامل** — وكان الحارس يقصر المسار ويردّ بترحيب عام فيضيع الطلب.

**الإصلاح:** `isSmallTalk(msg, { hasPriorAssistantTurn })` — قائمتان:

| الصنف | أمثلة | السلوك |
|---|---|---|
| مجاملة لا لبس فيها | شكرا، السلام عليكم، مع السلامة | تُقصَر في **أي** موضع |
| موافقة غامضة | تمام، اوكي، طيب، ممتاز، زين، ماشي | تُقصَر **فقط** إن لم يسبقها ردّ مساعد |

**تحقّق حيّ:** «تمام» بعد سؤال البوت ⇒ عرض تفاصيل المشاريع الطبية ✅ ·
«شكرا» وحدها ⇒ قصر مسار كما يجب ✅

### حدود معروفة (لا أعطال)
الطبقات السريعة (المخزن المنسّق، قاعدة المعرفة، حارس النطاق) تفحص **آخر رسالة
فقط**، فلا تُطابق أسئلة المتابعة. سلوك مقبول حالياً — الإجابات المنسّقة مخصّصة
للأسئلة المباشرة — لكنه يستحقّ المراجعة إن كثر الاعتماد عليها.

**نموّ التاريخ:** متوسط رموز الإدخال 11,239 لنداء اختيار في محادثة قصيرة، وكل
دورة تضيف ~1,500 رمز. لا سقف لعدد الرسائل ⇒ محادثة طويلة تُضاعف الكلفة (§7 ب-9).

### التحقّق
`tsc` نظيف · `lint` بلا أخطاء · **285 اختباراً ناجحاً** (17 جديداً للموافقات الغامضة).
