/**
 * @jest-environment jsdom
 */

/**
 * renderMarkdown.security.test.ts — اختبارات انحدار لثغرة XSS في طبقة العرض.
 *
 * الثغرة الأصلية: كانت `processPlainText` تهرّب `&` و`<` و`>` فقط — دون علامة
 * الاقتباس المزدوجة — ثم يُحقن الناتج عبر dangerouslySetInnerHTML في MessageList.
 * فنصّ مثل `![x](" onerror="…)` يكسر سمة src ويحقن معالج حدث. وبقيّة البُناة
 * (بطاقات الاتصال، بطاقات المصادر، المعرض) كانت بلا تهريب إطلاقاً.
 *
 * مصدر النصّ غير موثوق: مخرجات النموذج مشتقّة من محتوى قاعدة البيانات ومن رسالة
 * المستخدم، فحقن غير مباشر (prompt injection) يكفي لبلوغ هذه الدوال.
 */

import { renderMarkdown } from "../renderMarkdown"

/**
 * يفحص الناتج عبر مُحلّل DOM حقيقي لا عبر تعبير نمطي.
 * السبب: النصّ المُهرَّب يحوي سلاسل مثل "onerror=" **كنصّ مرئي** وهو غير ضارّ؛
 * ما يهمّ هو ما يصير عنصراً أو سمة فعلية بعد التحليل. الفحص بالتعبير النمطي
 * يعطي إيجابيات كاذبة هنا ويفوّت حالات ترميز أخرى.
 */
function hasInjection(html: string): boolean {
  const root = document.createElement("div")
  root.innerHTML = html

  for (const el of Array.from(root.querySelectorAll("*"))) {
    // (1) أي سمة معالج حدث فعلية
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name)) return true
    }
    // (2) عناصر تنفيذية
    const tag = el.tagName.toLowerCase()
    if (tag === "script" || tag === "object" || tag === "embed") return true
    // (3) iframe غير معاينة الخرائط المعروفة
    if (tag === "iframe" && !/openstreetmap\.org/.test(el.getAttribute("src") || "")) return true
    // (4) بروتوكول تنفيذ في أي رابط/مصدر
    for (const name of ["href", "src", "xlink:href"]) {
      const v = (el.getAttribute(name) || "").trim().toLowerCase()
      if (v.startsWith("javascript:") || v.startsWith("data:text/html") || v.startsWith("vbscript:")) {
        return true
      }
    }
  }
  return false
}

/** يجمع قيم سمة معيّنة من كل عناصر الناتج (للتأكيد على النطاقات). */
function attrValues(html: string, selector: string, attr: string): string[] {
  const root = document.createElement("div")
  root.innerHTML = html
  return Array.from(root.querySelectorAll(selector)).map(el => el.getAttribute(attr) || "")
}

describe("renderMarkdown — كسر السمات عبر علامة الاقتباس", () => {
  it("لا يسمح بحقن معالج حدث عبر رابط صورة", () => {
    const html = renderMarkdown('![x](" onerror="alert(1))')
    expect(hasInjection(html)).toBe(false)
  })

  it("لا يسمح بحقن معالج حدث عبر رابط نصّي", () => {
    const html = renderMarkdown('[انقر](" onmouseover="alert(1))')
    expect(hasInjection(html)).toBe(false)
  })

  it("يهرّب علامات الاقتباس في النصّ العادي", () => {
    const html = renderMarkdown('مرحباً "بك" في العتبة')
    expect(html).not.toContain('"بك"')
    expect(html).toContain("&quot;")
  })

  it("يهرّب وسوم HTML الخام", () => {
    const html = renderMarkdown("<script>alert(1)</script>")
    expect(hasInjection(html)).toBe(false)
    expect(html).toContain("&lt;script&gt;")
  })
})

describe("renderMarkdown — بروتوكولات الروابط", () => {
  it("يُسقط رابط javascript: ويُبقي النصّ", () => {
    const html = renderMarkdown("[اضغط هنا](javascript:alert(1))")
    expect(hasInjection(html)).toBe(false)
    expect(html).not.toContain("<a")
    expect(html).toContain("اضغط هنا")
  })

  it("يُسقط رابط data: ", () => {
    const html = renderMarkdown("[x](data:text/html;base64,PHNjcmlwdD4=)")
    expect(html).not.toContain("<a")
  })

  it("يُبقي روابط https العادية", () => {
    const html = renderMarkdown("[خبر](https://alkafeel.net/news/index.php?id=5)")
    expect(html).toContain("<a")
    expect(html).toContain("alkafeel.net/news")
    expect(html).toContain('rel="noopener noreferrer"')
  })
})

describe("renderMarkdown — نطاقات الصور", () => {
  it("يرفض صورة من نطاق خارجي", () => {
    const html = renderMarkdown("![شعار](https://evil.example.com/track.png)")
    expect(html).not.toContain("evil.example.com")
    expect(html).not.toContain("<img")
  })

  it("يقبل صورة من نطاق الكفيل", () => {
    const html = renderMarkdown("![مشروع](https://projects.alkafeel.net/uploads/projects/a.jpg)")
    expect(html).toContain("<img")
    expect(html).toContain("projects.alkafeel.net")
  })
})

describe("renderMarkdown — بطاقات المصادر (كانت بلا تهريب)", () => {
  it("لا يسمح بحقن عبر رابط المصدر", () => {
    const html = renderMarkdown('📖 *خبر* — 🔗 [اقرأ المزيد](" onfocus="alert(1))')
    expect(hasInjection(html)).toBe(false)
  })

  it("يهرّب عنوان المصدر (يبقى نصّاً ولا يصير عنصراً)", () => {
    const html = renderMarkdown('📖 *<img src=x onerror=alert(1)>* — 🔗 [اقرأ](https://alkafeel.net/news?id=1)')
    expect(hasInjection(html)).toBe(false)
    // لم يُنشأ عنصر <img> من نصّ الحقن
    expect(attrValues(html, "img", "src")).toHaveLength(0)
  })

  it("يُسقط بطاقة مصدر ببروتوكول خطر", () => {
    const html = renderMarkdown("📖 *عنوان* — 🔗 [اقرأ](javascript:alert(1))")
    expect(hasInjection(html)).toBe(false)
    expect(html).not.toContain("gm-source-card")
  })
})

describe("renderMarkdown — بطاقات الاتصال (كانت بلا تهريب)", () => {
  it("يهرّب اسم القسم ومحتوى الأسطر", () => {
    const html = renderMarkdown(
      ['**<img src=x onerror=alert(1)>**', '📞 009647700479212', '📍 "كربلاء"'].join("\n")
    )
    expect(hasInjection(html)).toBe(false)
    expect(attrValues(html, "img", "src")).toHaveLength(0)
  })

  it("يُبقي رابط الهاتف يعمل", () => {
    const html = renderMarkdown(["**قسم مقام الإمام المهدي**", "📞 009647700479212"].join("\n"))
    expect(html).toContain('href="tel:009647700479212"')
  })
})

describe("renderMarkdown — المعرض والفيديو (إزالة المعالجات المضمّنة)", () => {
  const thumb = (n: number) =>
    `![صورة ${n}](https://projects.alkafeel.net/uploads/projects/attachments/thumb/${n}.jpg)`

  it("المعرض بلا onerror مضمّن ويستعمل data-gm-fallback", () => {
    const html = renderMarkdown([thumb(1), thumb(2)].join("\n"))
    expect(hasInjection(html)).toBe(false)
    expect(html).toContain("data-gm-fallback")
    expect(html).toContain("gm-img-gallery")
  })

  it("مشغّل الفيديو بلا onclick مضمّن ويستعمل data-gm-video", () => {
    const html = renderMarkdown(
      "🎬 *زيارة الأربعين* [مشاهدة](https://static1.alkafeel.net/videos/00026a6c/00026a6c.mp4)"
    )
    expect(hasInjection(html)).toBe(false)
    expect(html).toContain("data-gm-video")
    expect(html).toContain(".mp4")
  })

  it("يرفض فيديو من نطاق خارجي", () => {
    const html = renderMarkdown("🎬 *x* [مشاهدة](https://evil.example.com/a.mp4)")
    expect(html).not.toContain("evil.example.com")
  })
})

describe("renderMarkdown — حفظ السلوك الطبيعي", () => {
  it("يبني التنسيق الأساسي كما كان", () => {
    const html = renderMarkdown("**عريض** و *مائل*\n- عنصر أول\n- عنصر ثانٍ")
    expect(html).toContain("<strong>عريض</strong>")
    expect(html).toContain("<em>مائل</em>")
    expect(html).toContain("<li>عنصر أول</li>")
  })

  it("يبني رابط الخرائط مع معاينة OpenStreetMap", () => {
    const html = renderMarkdown("📍 **فندق** — [🗺️ انتقل](https://maps.google.com/?q=32.617,44.032)")
    expect(html).toContain("openstreetmap.org")
    expect(html).toContain("gm-maps-link")
  })

  it("يعيد سلسلة فارغة لنصّ فارغ", () => {
    expect(renderMarkdown("")).toBe("")
  })
})
