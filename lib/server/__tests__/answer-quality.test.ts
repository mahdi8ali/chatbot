/**
 * answer-quality.test.ts — اختبارات الأعطال الثلاثة المؤثّرة على جودة الإجابة.
 *
 * (١) بتر الأجوبة: السقف صار شبكة أمان لا أداة اختصار، والاختصار يُضبط في الموجّه.
 * (٢) تشويه التاريخ: إخفاء المعلومات الشخصية يُطبَّق على رسائل المستخدم فقط،
 *     وإلّا تحوّلت أرقام الهواتف التي أعطاها البوت إلى [PHONE] في الدورة التالية.
 * (٣) إجبار البحث على المجاملات: «شكراً»/«مرحبا» تُقصَر قبل أي أداة أو نموذج.
 */

import { sanitizeMessages, sanitizeUserInput } from "../data-sanitizer"
import { isSmallTalk, classifyScope } from "../scope-guard"
import { getSiteSystemPrompt } from "../system-prompts"

// ─────────────────────────────────────────────────────────────────────────
describe("(٢) تنظيف الرسائل حسب الدور", () => {
  const PHONE_ANSWER =
    "**قسم مقام الإمام المهدي**\n- رئيس القسم: 009647700479212\n- معاون الفني: 009647715041363"

  it("يحفظ أرقام الهاتف في رسالة المساعد (كانت تتحوّل إلى [PHONE])", () => {
    const [msg] = sanitizeMessages([{ role: "assistant", content: PHONE_ANSWER }])
    expect(msg.content).toContain("009647700479212")
    expect(msg.content).not.toContain("[PHONE]")
  })

  it("يحفظ البريد الإلكتروني في رسالة المساعد", () => {
    const [msg] = sanitizeMessages([
      { role: "assistant", content: "للتواصل: info@alkafeel.net" },
    ])
    expect(msg.content).toContain("info@alkafeel.net")
  })

  it("لا يقصّ ردود القوائم الطويلة في التاريخ", () => {
    const long = "أ".repeat(2500)
    const [msg] = sanitizeMessages([{ role: "assistant", content: long }])
    expect(msg.content.length).toBe(2500)
  })

  it("يُبقي إخفاء المعلومات الشخصية على رسالة المستخدم", () => {
    const [msg] = sanitizeMessages([
      { role: "user", content: "رقمي 009647700479212 اتصلوا بي" },
    ])
    expect(msg.content).toContain("[PHONE]")
    expect(msg.content).not.toContain("009647700479212")
  })

  it("يجرّد HTML من رسالة المساعد (دفاع في العمق)", () => {
    const [msg] = sanitizeMessages([
      { role: "assistant", content: "<script>alert(1)</script>مرحباً" },
    ])
    expect(msg.content).not.toContain("<script")
    expect(msg.content).toContain("مرحبا")
  })

  it("يحافظ على ترتيب الرسائل وأدوارها", () => {
    const out = sanitizeMessages([
      { role: "user", content: "سؤال" },
      { role: "assistant", content: "جواب 009647700479212" },
      { role: "user", content: "متابعة" },
    ])
    expect(out.map(m => m.role)).toEqual(["user", "assistant", "user"])
    expect(out[1].content).toContain("009647700479212")
  })

  it("sanitizeUserInput نفسها لم تتغيّر (ما زالت تُخفي وتقصّ)", () => {
    expect(sanitizeUserInput("رقمي 009647700479212")).toContain("[PHONE]")
    expect(sanitizeUserInput("ب".repeat(2000)).length).toBeLessThanOrEqual(1000)
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe("(٣) حارس المجاملات", () => {
  const SMALLTALK = [
    "شكرا", "شكرا لك", "شكراً جزيلاً", "مشكور", "السلام عليكم", "مرحبا",
    "اهلا وسهلا", "صباح الخير", "مساء الخير", "بارك الله فيك",
    "جزاك الله خيرا", "تمام", "ممتاز", "مع السلامة", "الى اللقاء",
  ]

  it.each(SMALLTALK)("يعدّ «%s» مجاملة خالصة", (msg) => {
    expect(isSmallTalk(msg)).toBe(true)
  })

  const NOT_SMALLTALK = [
    "شكرا، ما هي أوقات الصلاة؟",
    "مرحبا اريد معلومات عن مشروع صحن أم البنين",
    "السلام عليكم كم عدد مشاريع العتبة",
    "من هو الأمين العام",
    "أوقات الصلاة اليوم",
    "شكرا على الرقم لكن اريد رقم قسم آخر",
    "ما هي المشاريع الطبية",
  ]

  it.each(NOT_SMALLTALK)("لا يعدّ «%s» مجاملة", (msg) => {
    expect(isSmallTalk(msg)).toBe(false)
  })

  it("محافظ: أي علامة استفهام تنفي المجاملة", () => {
    expect(isSmallTalk("مرحبا؟")).toBe(false)
    expect(isSmallTalk("شكرا?")).toBe(false)
  })

  it("محافظ: الرسائل الطويلة ليست مجاملة", () => {
    expect(isSmallTalk("شكرا شكرا شكرا شكرا شكرا")).toBe(false)
  })

  // ── الموافقات الغامضة: مجاملة في البداية، «نعم» في وسط المحادثة ──────────
  // انحدار رصده اختبار التسلسلية: البوت يسأل «هل تريد تفاصيل أعمق؟» فيردّ
  // المستخدم «تمام» أو «اوكي» موافقاً، فيقصر الحارس المسار ويردّ بترحيب عام
  // ويضيع الطلب. القاعدة: وجود ردّ سابق من المساعد ⇒ ليست مجاملة.
  const AMBIGUOUS = ["تمام", "اوكي", "طيب", "ممتاز", "زين", "ماشي"]

  it.each(AMBIGUOUS)("«%s» مجاملة في بداية المحادثة", (msg) => {
    expect(isSmallTalk(msg)).toBe(true)
    expect(isSmallTalk(msg, { hasPriorAssistantTurn: false })).toBe(true)
  })

  it.each(AMBIGUOUS)("«%s» ليست مجاملة بعد ردّ المساعد (موافقة)", (msg) => {
    expect(isSmallTalk(msg, { hasPriorAssistantTurn: true })).toBe(false)
  })

  const ALWAYS_SMALLTALK = ["شكرا", "السلام عليكم", "مع السلامة", "مشكور", "بارك الله فيك"]

  it.each(ALWAYS_SMALLTALK)("«%s» مجاملة في أي موضع", (msg) => {
    expect(isSmallTalk(msg)).toBe(true)
    expect(isSmallTalk(msg, { hasPriorAssistantTurn: true })).toBe(true)
  })

  it("يتعامل مع المدخلات الفارغة/غير النصّية بلا رمي استثناء", () => {
    expect(isSmallTalk("")).toBe(false)
    expect(isSmallTalk("   ")).toBe(false)
    expect(isSmallTalk(undefined as any)).toBe(false)
    expect(isSmallTalk(null as any)).toBe(false)
  })

  it("لا يتعارض مع حارس النطاق (المجاملة تبقى «داخل النطاق» شكلياً)", () => {
    // الحارسان مستقلّان؛ المجاملة تُلتقط قبل classifyScope في route.ts
    expect(classifyScope("شكرا").inScope).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────
describe("(١) ضبط الطول في الموجّه لا بالمقصلة", () => {
  const prompt = getSiteSystemPrompt()

  it("يحوي ميزانية طول صريحة", () => {
    expect(prompt).toContain("ميزانية الطول")
    expect(prompt).toMatch(/120 كلمة/)
  })

  it("يستثني التعداد الفعلي من الاختصار (القوائم تُعرض كاملة)", () => {
    expect(prompt).toMatch(/استثناء التعداد الفعلي/)
  })

  it("يحمي كتلة المصادر صراحةً", () => {
    expect(prompt).toMatch(/كتلة المصادر جزء لا يُتنازل عنه/)
  })
})
