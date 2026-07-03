# نظام التقييم والتحليل — توثيق كامل

**المشروع:** بوت العتبة العباسية المقدسة  
**تاريخ التنفيذ:** 2026-06-01  
**النطاق:** تسجيل الأسئلة والأجوبة + تقييم المستخدمين

---

## 1. المعمارية العامة

```
المستخدم
   │
   ▼
useChat.ts  ──── session_id (UUID دائم للجلسة) ────►  route.ts
                                                          │
                                              ┌───────────┴────────────┐
                                              │  saveChatLog()         │
                                              │  (fire-and-forget)     │
                                              └───────────┬────────────┘
                                                          │
                                                    chat_logs (DB)
   │
   ◄──── X-Chat-Log-Id (header) ────────────── route.ts
   │
FeedbackButtons.tsx
   │
   ▼
POST /api/chat/feedback
   │
   ▼
saveFeedback()  ──►  chat_feedback (DB)
```

---

## 2. الملفات المُنشأة والمُعدَّلة

### الملفات الجديدة

| الملف | الوظيفة |
|-------|---------|
| `lib/server/chat-logger.ts` | طبقة الوصول لقاعدة البيانات — حفظ السجلات والتقييمات |
| `app/api/chat/feedback/route.ts` | API endpoint لاستقبال تقييمات المستخدمين |
| `components/chat/FeedbackButtons.tsx` | مكوّن React لأزرار 👍 / 👎 |
| `docs/feedback-analytics.md` | هذا الملف |

### الملفات المُعدَّلة

| الملف | التعديل |
|-------|---------|
| `app/api/chat/site/route.ts` | إضافة التسجيل + رأس `X-Chat-Log-Id` |
| `components/chat/types.ts` | إضافة `chatLogId?: string` لـ `Message` |
| `components/chat/useChat.ts` | إنشاء `sessionId` + قراءة `chatLogId` من headers |
| `components/chat/MessageList.tsx` | عرض `FeedbackButtons` أسفل كل رسالة مكتملة |
| `components/chat/ChatStyles.tsx` | أنماط CSS لأزرار التقييم (light + dark) |
| `components/ChatWidget.tsx` | تمرير `sessionId` إلى `MessageList` |

---

## 3. قاعدة البيانات

**قاعدة البيانات:** `alkafeel_projects`  
**الجداول تُنشأ تلقائياً** عند أول طلب (`CREATE TABLE IF NOT EXISTS`)

### جدول `chat_logs`

```sql
CREATE TABLE IF NOT EXISTS chat_logs (
  id               BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id       VARCHAR(64),           -- UUID الجلسة
  user_question    TEXT NOT NULL,         -- سؤال المستخدم (بعد تنظيف PII)
  tool_called      VARCHAR(256),          -- اسم الأداة المُستدعاة
  tool_arguments   TEXT,                  -- معاملات الأداة (JSON)
  db_result_ids    TEXT,                  -- أرقام النتائج مفصولة بفاصلة
  db_result_count  SMALLINT DEFAULT 0,    -- عدد النتائج
  final_answer     TEXT,                  -- الجواب النهائي (أول 3000 حرف)
  response_time_ms INT DEFAULT 0,         -- زمن الاستجابة بالمللي ثانية
  model_name       VARCHAR(64),           -- اسم نموذج OpenAI المُستخدم
  was_tool_used    TINYINT(1) DEFAULT 0,  -- هل استُخدمت أداة بحث؟
  created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_created (created_at),
  INDEX idx_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### جدول `chat_feedback`

```sql
CREATE TABLE IF NOT EXISTS chat_feedback (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chat_log_id   BIGINT UNSIGNED NOT NULL,           -- ربط بـ chat_logs.id
  session_id    VARCHAR(64),
  rating        ENUM('helpful','not_helpful') NOT NULL,
  feedback_note TEXT,                               -- ملاحظة المستخدم (اختيارية)
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_chat_log (chat_log_id),
  INDEX idx_rating (rating)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 4. تدفق البيانات (Data Flow)

### عند إرسال سؤال:

1. `useChat.ts` يُنشئ `sessionId` مرة واحدة عند تحميل الويجت (`crypto.randomUUID()`)
2. يُرسَل `session_id` مع كل طلب في الـ body
3. `route.ts` يُنشئ `chatLogId` جديد لكل سؤال
4. بعد انتهاء الـ stream:
   - يُسجَّل السجل في `chat_logs` (fire-and-forget — لا يعيق الرد)
5. `route.ts` يُرجع `X-Chat-Log-Id` في headers الاستجابة
6. `useChat.ts` يقرأ هذا الـ header ويحفظه في الـ message

### عند الضغط على 👍 / 👎:

1. `FeedbackButtons.tsx` يُرسل `POST /api/chat/feedback` مع:
   - `chat_log_id`: رقم السجل في `chat_logs`
   - `session_id`: معرّف الجلسة
   - `rating`: `"helpful"` أو `"not_helpful"`
   - `feedback_note`: ملاحظة المستخدم (عند اختيار 👎)
2. `feedback/route.ts` يتحقق من المدخلات ويستدعي `saveFeedback()`
3. يُحفظ التقييم في `chat_feedback`
4. تتغير واجهة الزر إلى رسالة "شكرًا، تم تسجيل تقييمك."

---

## 5. API — نقطة التقييم

**`POST /api/chat/feedback`**

### الطلب (Request Body):

```json
{
  "chat_log_id": "123",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "rating": "not_helpful",
  "feedback_note": "الجواب غير دقيق، لم يذكر تاريخ الافتتاح"
}
```

| الحقل | النوع | مطلوب | الوصف |
|-------|-------|--------|-------|
| `chat_log_id` | string / number | ✅ | معرّف السجل في chat_logs |
| `rating` | `"helpful"` \| `"not_helpful"` | ✅ | تقييم المستخدم |
| `session_id` | string | ❌ | معرّف الجلسة |
| `feedback_note` | string | ❌ | ملاحظة نصية (حد 500 حرف) |

### الاستجابة (Response):

```json
{ "success": true }
```

---

## 6. حماية البيانات الشخصية (PII)

يُطبَّق `sanitizePII()` على كل نص قبل حفظه في قاعدة البيانات:

| النمط | يُستبدل بـ |
|-------|-----------|
| أرقام الهاتف العراقية `07xxxxxxxx` | `[PHONE]` |
| أرقام مع كود الدولة `9647xxxxxxxx` | `[PHONE]` |
| البريد الإلكتروني | `[EMAIL]` |
| مفاتيح OpenAI `sk-...` | `[TOKEN]` |
| رموز Bearer | `Bearer [TOKEN]` |
| أرقام من 14-16 خانة | `[ID]` |

---

## 7. الأداء والسلامة

- **fire-and-forget:** التسجيل يحدث بعد إغلاق الـ stream ولا يُعيق الاستجابة
- **لا يتأثر منطق OpenAI:** الكود الجديد مُعزول تماماً في `chat-logger.ts`
- **Connection Pool منفصل:** `chat-logger.ts` يستخدم pool خاص به (5 اتصالات)
- **حد الجواب:** يُحفظ أول 3000 حرف فقط من الجواب النهائي
- **حد الملاحظة:** 500 حرف للملاحظة النصية في التقييم

---

## 8. استعلامات التحليل (SQL)

### أكثر الأسئلة تكراراً:
```sql
SELECT user_question, COUNT(*) AS cnt
FROM chat_logs
GROUP BY user_question
ORDER BY cnt DESC
LIMIT 20;
```

### نسبة استخدام الأدوات:
```sql
SELECT
  was_tool_used,
  COUNT(*) AS total,
  ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER(), 1) AS pct
FROM chat_logs
GROUP BY was_tool_used;
```

### الأسئلة التي حصلت على تقييم سلبي مع ملاحظة:
```sql
SELECT
  cl.user_question,
  cf.feedback_note,
  cf.created_at
FROM chat_feedback cf
JOIN chat_logs cl ON cl.id = cf.chat_log_id
WHERE cf.rating = 'not_helpful'
  AND cf.feedback_note IS NOT NULL
ORDER BY cf.created_at DESC
LIMIT 50;
```

### متوسط زمن الاستجابة يومياً:
```sql
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS questions,
  ROUND(AVG(response_time_ms)) AS avg_ms,
  ROUND(AVG(was_tool_used) * 100, 1) AS tool_use_pct
FROM chat_logs
GROUP BY DATE(created_at)
ORDER BY day DESC;
```

### أكثر الأدوات استخداماً:
```sql
SELECT tool_called, COUNT(*) AS cnt
FROM chat_logs
WHERE tool_called IS NOT NULL
GROUP BY tool_called
ORDER BY cnt DESC;
```

### معدل الرضا اليومي:
```sql
SELECT
  DATE(cf.created_at) AS day,
  SUM(rating = 'helpful') AS helpful,
  SUM(rating = 'not_helpful') AS not_helpful,
  ROUND(SUM(rating = 'helpful') * 100.0 / COUNT(*), 1) AS satisfaction_pct
FROM chat_feedback cf
GROUP BY DATE(cf.created_at)
ORDER BY day DESC;
```

---

## 9. متغيرات البيئة المطلوبة (`.env.local`)

```env
# قاعدة البيانات (مطلوبة مسبقاً)
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=root
DB_PASSWORD=root
DB_SOCKET=/Applications/XAMPP/xamppfiles/var/mysql/mysql.sock

# اسم قاعدة بيانات المشاريع (حيث تُحفظ السجلات)
PROJECTS_DB_NAME=alkafeel_projects
```

> إذا كان `DB_SOCKET` محدداً يُستخدم socket بدلاً من TCP.  
> إذا غاب `PROJECTS_DB_NAME` يُستخدم `DB_NAME` كبديل.

---

## 10. واجهة التقييم (UX)

```
┌─────────────────────────────────────────┐
│  رسالة البوت...                         │
│                                         │
│  هل كانت الإجابة مفيدة؟  👍  👎         │
└─────────────────────────────────────────┘

── عند الضغط على 👎 ──

┌─────────────────────────────────────────┐
│  مثلاً: الجواب غير دقيق، لم يفهم...    │
│  ┌─────────────────────────────────┐    │
│  │ textarea (2 سطر، حد 500 حرف)   │    │
│  └─────────────────────────────────┘    │
│  [إرسال الملاحظة]  [إلغاء]             │
└─────────────────────────────────────────┘

── بعد الإرسال (سواء 👍 أو 👎) ──

  شكرًا، تم تسجيل تقييمك.
```

**ملاحظات UX:**
- أزرار التقييم تظهر فقط أسفل الرسائل **المكتملة** (لا تظهر أثناء الـ streaming)
- تظهر فقط إذا كان `chatLogId` موجوداً (أي تم تسجيل السؤال بنجاح)
- بعد الإرسال تختفي الأزرار وتُعرض رسالة الشكر (لا يمكن التقييم مرتين)
- إذا فشل الإرسال من الشبكة، تُعرض رسالة الشكر على أي حال (UX سلس)

---

## 11. الـ CSS Classes المُضافة

| Class | الاستخدام |
|-------|----------|
| `.gm-feedback` | الحاوية الرئيسية للأزرار |
| `.gm-feedback-label` | نص "هل كانت الإجابة مفيدة؟" |
| `.gm-feedback-btn` | زر 👍 أو 👎 |
| `.gm-feedback-btn.helpful` | زر المفيد |
| `.gm-feedback-btn.unhelpful` | زر غير المفيد |
| `.gm-feedback-done` | رسالة "شكرًا" |
| `.gm-feedback-note` | حاوية textarea الملاحظة |
| `.gm-feedback-textarea` | مربع كتابة الملاحظة |
| `.gm-feedback-actions` | صف أزرار الإرسال/الإلغاء |
| `.gm-feedback-send` | زر إرسال الملاحظة |
| `.gm-feedback-cancel` | زر الإلغاء |

جميع الأنماط تدعم **الوضع الليلي** عبر `.gm-root.dark .gm-feedback-*`
