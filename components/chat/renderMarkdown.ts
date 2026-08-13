const svgPin   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
const svgPhone = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>`
const svgMail  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
const svgBook  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
const svgVideo = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
const svgLinkOut = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
const svgArrow = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`

const ATTACH_IMG_RE = /^!\[([^\]]*)\]\((https:\/\/projects\.alkafeel\.net\/uploads\/projects\/attachments\/thumb\/[^)]+)\)$/

// ────────────────────────────────────────────────────────────────────────────
//  التهريب وسلامة الروابط
//  ⚠️ كل ناتج هذا الملف يُحقن عبر dangerouslySetInnerHTML في MessageList.
//  لذلك: أي قيمة تدخل نصّاً أو سمة HTML يجب أن تمرّ بـ escapeHtml/escapeAttr،
//  وأي رابط يجب أن يمرّ بـ safeUrl/safeAssetUrl. المصدر غير موثوق: نصّ النموذج
//  مشتقّ من محتوى قاعدة البيانات ومن رسالة المستخدم (حقن غير مباشر ممكن).
// ────────────────────────────────────────────────────────────────────────────

/** يهرّب النصّ المعروض (يشمل علامتَي الاقتباس لأن النصّ قد يقع داخل سمة). */
function escapeHtml(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

/** يهرّب قيمة تُوضَع داخل سمة HTML (نفس القواعد — اسم صريح لتوضيح القصد). */
const escapeAttr = escapeHtml

/** البروتوكولات المسموح بها في الروابط. أي شيء آخر (javascript:, data:, vbscript:) يُرفض. */
const SAFE_PROTOCOLS = new Set(["http:", "https:", "mailto:", "tel:"])

/** نطاقات الصور المسموح تحميلها (منع تسريب المُحيل/التتبّع عبر صور خارجية). */
const ALLOWED_IMAGE_HOSTS = [
  "alkafeel.net",
  "projects.alkafeel.net",
  "static1.alkafeel.net",
  "www.alkafeel.net",
]

/**
 * يتحقّق أن الرابط بروتوكوله مسموح، ويعيده مُهرَّباً جاهزاً لسمة href.
 * يعيد null عند الرفض (بروتوكول خطر أو رابط غير قابل للتحليل) فيسقط المتصل الرابط.
 * الروابط النسبية (تبدأ بـ "/") مقبولة لأنها ضمن نفس الأصل.
 */
function safeUrl(raw: string): string | null {
  const value = String(raw ?? "").trim()
  if (!value) return null
  if (value.startsWith("/") && !value.startsWith("//")) return escapeAttr(value)
  try {
    const u = new URL(value)
    if (!SAFE_PROTOCOLS.has(u.protocol)) return null
    return escapeAttr(u.toString())
  } catch {
    return null
  }
}

/**
 * كـ safeUrl لكن لأصول الكفيل (صور، فيديو، بطاقات الفيديو): https فقط ومن
 * النطاقات المعروفة. يمنع تحميل أصول من خوادم خارجية (تتبّع/تسريب المُحيل)
 * ويمنع بطاقة فيديو تنتحل مصدراً رسمياً وتشير إلى موقع خارجي.
 */
function safeAssetUrl(raw: string): string | null {
  const value = String(raw ?? "").trim()
  if (!value) return null
  if (value.startsWith("/") && !value.startsWith("//")) return escapeAttr(value)
  try {
    const u = new URL(value)
    if (u.protocol !== "https:") return null
    const host = u.hostname.toLowerCase()
    const ok = ALLOWED_IMAGE_HOSTS.some(h => host === h || host.endsWith("." + h))
    if (!ok) return null
    return escapeAttr(u.toString())
  } catch {
    return null
  }
}

function buildGalleryLoadingHtml(count: number): string {
  return '<div class="gm-img-gallery gm-gallery-loading">' +
    '<div class="gm-thumb-wrap"></div>'.repeat(count) +
    '</div>'
}

function buildGalleryBlock(lines: string[]): string {
  const thumbs = lines.map((line, i) => {
    const m = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/)
    if (!m) return ""
    const alt = escapeAttr(m[1] || ("صورة " + (i + 1)))
    const thumbSrc = safeAssetUrl(m[2])
    if (!thumbSrc) return ""
    // نمرّر الأصل عبر data-original (يقرأه lightbox في MessageList).
    const originalSrc = safeAssetUrl(m[2].replace("/attachments/thumb/", "/attachments/")) || thumbSrc
    // بلا onerror مضمّن: المعالجة تتم عبر تفويض الأحداث في MessageList (data-gm-fallback).
    return `<div class="gm-thumb-wrap"><img class="gm-thumb" src="${thumbSrc}" alt="${alt}" loading="lazy" data-original="${originalSrc}" data-gm-fallback="1" /></div>`
  }).join("")
  return `<div class="gm-img-gallery">${thumbs}</div>`
}

function processPlainText(raw: string): string {
  // التهريب أولاً على كامل النصّ (يشمل " و ' كي لا تُكسر السمات لاحقاً)،
  // ثم يُبنى الـ HTML فوق نصّ مُهرَّب — فلا يمكن لمحتوى النموذج حقن عناصر أو سمات.
  let html = escapeHtml(raw)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      (match, alt, src) => {
        // src هنا مُهرَّب مسبقاً؛ نفكّ &amp; فقط ليصحّ تحليل الـ URL ثم نعيد التهريب.
        const safe = safeAssetUrl(String(src).replace(/&amp;/g, "&"))
        if (!safe) return escapeHtml(String(alt || ""))
        return `<img class="gm-project-img" src="${safe}" alt="${escapeAttr(alt)}" loading="lazy" />`
      }
    )
    .replace(
      /\[([^\]]+)\]\((https:\/\/maps\.google\.com\/\?q=([-\d.]+),([-\d.]+))\)/g,
      (_, label, url, lat, lng) => {
        const fLat = parseFloat(lat)
        const fLng = parseFloat(lng)
        if (!Number.isFinite(fLat) || !Number.isFinite(fLng)) return String(label)
        const safe = safeUrl(String(url).replace(/&amp;/g, "&"))
        if (!safe) return String(label)
        const d = 0.004
        // الإحداثيات أعداد مُتحقَّق منها (Number.isFinite) ⇒ آمنة داخل الـ URL.
        const bbox = `${fLng - d},${fLat - d},${fLng + d},${fLat + d}`
        const embedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&amp;layer=mapnik&amp;marker=${fLat},${fLng}`
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer" class="gm-maps-link">${label}</a><div class="gm-map-preview"><div class="gm-map-clip"><iframe src="${embedUrl}" width="210" height="145" frameborder="0" scrolling="no" loading="lazy" title="خريطة الموقع"></iframe></div></div>`
      }
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      (match, label, url) => {
        const safe = safeUrl(String(url).replace(/&amp;/g, "&"))
        if (!safe) return String(label) // بروتوكول مرفوض (javascript:…) ⇒ يبقى النصّ بلا رابط
        return `<a href="${safe}" target="_blank" rel="noopener noreferrer">${label}</a>`
      }
    )
    .replace(/^(\d+)\.\s+(.+)$/gm, "<li>$2</li>")
    .replace(/^[-•]\s+(.+)$/gm, "<li>$1</li>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/\n/g, "<br>")
  html = html.replace(/((<li>.+?<\/li>)(<br>)?)+/g, match => {
    const items = match.replace(/<br>/g, "")
    return "<ol>" + items + "</ol>"
  })
  html = html.replace(/(00964\d{7,12})/g, n => `<a href="tel:${n}" class="gm-phone-link">${n}</a>`)
  html = html.replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, e => `<a href="mailto:${e}" class="gm-email-link">${e}</a>`)
  return html
}

function buildContactCard(seg: { lines: string[]; name?: string }): string {
  const rowsHtml = seg.lines.map(r => {
    const firstChar = [...r][0]
    const content = r.replace(firstChar, "").trim()
    let svgIcon = svgPin
    let rowClass = "gm-contact-row"
    if (firstChar === "📞") { svgIcon = svgPhone; rowClass += " phone" }
    else if (firstChar === "📧") { svgIcon = svgMail; rowClass += " email" }
    // تهريب المحتوى قبل بناء الروابط التلقائية (الأنماط أرقام/بريد فقط ⇒ آمنة داخل href).
    const formatted = escapeHtml(content)
      .replace(/(00964\d{7,12})/g, n => `<a class="gm-phone-link" href="tel:${n}">${n}</a>`)
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, e => `<a class="gm-email-link" href="mailto:${e}">${e}</a>`)
    return `<div class="${rowClass}"><span class="ci-icon">${svgIcon}</span><span>${formatted}</span></div>`
  }).join("")
  return `<div class="gm-contact-block"><div class="gm-contact-name">${escapeHtml(seg.name || "")}</div>${rowsHtml}</div>`
}

function buildSourcesBlock(sourceLines: string[]): string {
  const sourcesHtml = sourceLines.map(line => {
    const isVideo = line.startsWith("🎬")
    const isLink  = line.startsWith("🔗")

    // فيديو مع رابط mp4 مباشر → مشغّل مدمج
    if (isVideo) {
      // البحث عن أي رابط mp4 في السطر بغض النظر عن الصيغة
      const mp4UrlMatch = line.match(/https?:\/\/[^\s"'<>)\]]+\.mp4/i)
      const mp4Url = mp4UrlMatch ? safeAssetUrl(mp4UrlMatch[0]) : null
      if (mp4Url) {
        // استخراج العنوان: كل النص بين 🎬 وأول [ (بداية الرابط)
        const beforeLink = line.split('[')[0]  // كل ما قبل أول [
        const title = escapeHtml(
          beforeLink
            .replace(/^🎬/, '')
            .replace(/\*/g, '')
            .replace(/\s*—.*$/, '')
            .trim() || 'فيديو'
        )
        // استخراج request_id من رابط MP4 وبناء رابط الصورة المصغّرة
        // (المُعرّف hex فقط بحكم التعبير النمطي ⇒ آمن داخل الرابط)
        const reqMatch = mp4UrlMatch![0].match(/\/videos\/([a-f0-9]+)\/[a-f0-9]+\.mp4$/i)
        const posterUrl = reqMatch
          ? `https://alkafeel.net/videos/mcroped/765/${reqMatch[1]}.jpg`
          : ''
        const svgPlay = `<svg viewBox="0 0 24 24" fill="white"><polygon points="6,3 20,12 6,21"/></svg>`
        // بلا onclick مضمّن: التشغيل يُعالَج بتفويض الأحداث في MessageList (data-gm-video).
        return `<div class="gm-video-player">
          <div class="gm-video-title-bar">${svgVideo} <span>${title}</span></div>
          <div class="gm-video-wrapper" data-gm-video="1">
            ${posterUrl ? `<img class="gm-poster-img" src="${posterUrl}" alt="" />` : `<div style="aspect-ratio:16/9;background:#111"></div>`}
            <div class="gm-play-overlay">
              <div class="gm-play-btn">${svgPlay}</div>
            </div>
            <video class="gm-video-el" preload="none" src="${mp4Url}">
              <a href="${mp4Url}" target="_blank" rel="noopener noreferrer">مشاهدة الفيديو</a>
            </video>
          </div>
        </div>`
      }
      // فيديو بدون mp4 مباشر → بطاقة بصرية.
      // نستعمل safeAssetUrl (لا safeUrl) لأن بطاقة الفيديو تُعرض كمصدر رسمي؛
      // رابط فيديو خارجي هنا يعني انتحال مصدر، وكل روابط الفيديو الحقيقية
      // تأتي من video-service بنطاق alkafeel.net/media أو static1.alkafeel.net.
      const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
      const url   = linkMatch ? safeAssetUrl(linkMatch[2]) : null
      const label = escapeHtml(linkMatch ? linkMatch[1] : "")
      if (!url) return ""
      const meta = escapeHtml(line.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "").replace(/[📖🎬🔗]/g, "").replace(/\*([^*]*)\*/g, "$1").replace(/—\s*🔗\s*$/, "").replace(/—\s*$/, "").trim())
      const cardTitle = meta || label
      const svgPlay = `<svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="12" fill="rgba(255,255,255,0.15)"/><polygon points="9.5,7 18,12 9.5,17" fill="white"/></svg>`
      return `<a class="gm-video-card" href="${url}" target="_blank" rel="noopener noreferrer">
        <div class="gm-video-thumb">
          <div class="gm-video-play-icon">${svgPlay}</div>
          <div class="gm-video-duration-badge">فيديو</div>
        </div>
        <div class="gm-video-info">
          <span class="gm-video-title">${cardTitle}</span>
          <span class="gm-video-cta">▶ مشاهدة الفيديو على موقع الكفيل</span>
        </div>
      </a>`
    }

    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
    const rawUrl = linkMatch ? linkMatch[2] : ""
    const url   = rawUrl && rawUrl !== "#" ? safeUrl(rawUrl) : null
    const label = escapeHtml(linkMatch ? linkMatch[1] : "")
    if (!url) return ""
    const meta = escapeHtml(line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "")
      .replace(/[📖🎬🔗]/g, "")
      .replace(/\*([^*]*)\*/g, "$1")
      .replace(/—\s*🔗\s*$/, "")
      .replace(/—\s*$/, "")
      .trim())
    const cardTitle = meta || label
    const iconSvg = isLink ? svgLinkOut : svgBook
    return `<a class="gm-source-card" href="${url}" target="_blank" rel="noopener noreferrer">
      <span class="gm-source-right">
        <span class="gm-source-svg-icon">${iconSvg}</span>
        <span class="gm-source-info">
          <span class="gm-source-title">${cardTitle}</span>
          ${meta ? `<span class="gm-source-action">${label}</span>` : ""}
        </span>
      </span>
      <span class="gm-source-arrow">${svgArrow}</span>
    </a>`
  }).join("")
  if (!sourcesHtml.trim()) return ""
  return `<div class="gm-sources-block">
    <div class="gm-sources-sep"></div>
    <div class="gm-sources-title">المصادر</div>
    <div class="gm-sources-list">${sourcesHtml}</div>
  </div>`
}

// عدد افتراضي للـ skeleton عند عدم معرفة الحجم الحقيقي
const DEFAULT_SKELETON_COUNT = 5

export function renderMarkdown(text: string, streaming = false): string {
  if (!text) return ""

  // أثناء الستريمنج: احذف سطور صور المرفقات (كاملة أو جزئية) واستبدلها بـ skeleton
  let galleryStripped = false
  if (streaming) {
    const cleaned = text.split("\n").filter(line => {
      const t = line.trim()
      if (t.startsWith("![") && (t.includes("/attachments/") || ATTACH_IMG_RE.test(t))) {
        galleryStripped = true
        return false
      }
      return true
    })
    if (galleryStripped) text = cleaned.join("\n")
  }

  const lines = text.split("\n")
  const sourceLines: string[] = []
  const bodyLines: string[] = []
  for (const line of lines) {
    const t = line.trim()
    if (/^[\u{1F4D6}\u{1F3AC}]/u.test(t)) {
      sourceLines.push(t)
    } else if (/^🔗\s*\[/.test(t) || /^\*\(تاريخ/.test(t)) {
      sourceLines.push(t)
    } else {
      bodyLines.push(line)
    }
  }

  const CONTACT_EMOJI = /^(📍|📞|📧)/u
  type Segment = { type: "text" | "contact" | "gallery"; lines: string[]; name?: string }
  const segments: Segment[] = []
  let i = 0
  while (i < bodyLines.length) {
    const line = bodyLines[i]
    const trimmed = line.trim()

    // Gallery: 2+ consecutive attachment image lines
    if (ATTACH_IMG_RE.test(trimmed)) {
      const galleryLines: string[] = []
      while (i < bodyLines.length && ATTACH_IMG_RE.test(bodyLines[i].trim())) {
        galleryLines.push(bodyLines[i].trim())
        i++
      }
      if (galleryLines.length >= 2) {
        segments.push({ type: "gallery", lines: galleryLines })
        continue
      }
      // Single attachment image — fall through as text
      if (segments.length === 0 || segments[segments.length - 1].type !== "text") {
        segments.push({ type: "text", lines: [] })
      }
      segments[segments.length - 1].lines.push(...galleryLines)
      continue
    }

    const isContactHeader =
      /^\*\*[^*]+\*\*\s*$/.test(trimmed) &&
      bodyLines.slice(i + 1, i + 6).some(l => CONTACT_EMOJI.test(l.trim()))
    if (isContactHeader) {
      const name = trimmed.replace(/^\*\*|\*\*$/g, "")
      const contactLines: string[] = []
      i++
      while (i < bodyLines.length && CONTACT_EMOJI.test(bodyLines[i].trim())) {
        contactLines.push(bodyLines[i].trim())
        i++
      }
      segments.push({ type: "contact", lines: contactLines, name })
    } else {
      if (segments.length === 0 || segments[segments.length - 1].type !== "text") {
        segments.push({ type: "text", lines: [] })
      }
      segments[segments.length - 1].lines.push(line)
      i++
    }
  }

  let html = ""
  let skeletonCount = DEFAULT_SKELETON_COUNT
  for (const seg of segments) {
    if (seg.type === "gallery") {
      skeletonCount = seg.lines.length
      html += streaming ? buildGalleryLoadingHtml(seg.lines.length) : buildGalleryBlock(seg.lines)
    } else if (seg.type === "contact") {
      html += buildContactCard(seg)
    } else {
      html += processPlainText(seg.lines.join("\n"))
    }
  }

  if (galleryStripped) html += buildGalleryLoadingHtml(skeletonCount)

  html += buildSourcesBlock(sourceLines)
  return html
}
