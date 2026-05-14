const svgPin   = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>`
const svgPhone = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.62 3.38 2 2 0 0 1 3.6 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L7.91 8.6a16 16 0 0 0 6 6l.94-.94a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 21.73 16z"/></svg>`
const svgMail  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>`
const svgBook  = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`
const svgVideo = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>`
const svgLinkOut = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`
const svgArrow = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>`

function processPlainText(raw: string): string {
  let html = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(
      /!\[([^\]]*)\]\(([^)]+)\)/g,
      '<img class="gm-project-img" src="$2" alt="$1" loading="lazy" />'
    )
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>'
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
    const formatted = content
      .replace(/(00964\d{7,12})/g, n => `<a class="gm-phone-link" href="tel:${n}">${n}</a>`)
      .replace(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/g, e => `<a class="gm-email-link" href="mailto:${e}">${e}</a>`)
    return `<div class="${rowClass}"><span class="ci-icon">${svgIcon}</span><span>${formatted}</span></div>`
  }).join("")
  return `<div class="gm-contact-block"><div class="gm-contact-name">${seg.name}</div>${rowsHtml}</div>`
}

function buildSourcesBlock(sourceLines: string[]): string {
  const sourcesHtml = sourceLines.map(line => {
    const linkMatch = line.match(/\[([^\]]+)\]\(([^)]+)\)/)
    const url   = linkMatch ? linkMatch[2] : ""
    const label = linkMatch ? linkMatch[1] : ""
    if (!url || url === "" || url === "#") return ""
    const meta = line
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "")
      .replace(/[📖🎬🔗]/g, "")
      .replace(/\*([^*]*)\*/g, "$1")
      .replace(/—\s*🔗\s*$/, "")
      .replace(/—\s*$/, "")
      .trim()
    const cardTitle = meta || label
    const isVideo = line.startsWith("🎬")
    const isLink  = line.startsWith("🔗")
    const iconSvg = isVideo ? svgVideo : isLink ? svgLinkOut : svgBook
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

export function renderMarkdown(text: string): string {
  if (!text) return ""

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
  type Segment = { type: "text" | "contact"; lines: string[]; name?: string }
  const segments: Segment[] = []
  let i = 0
  while (i < bodyLines.length) {
    const line = bodyLines[i]
    const trimmed = line.trim()
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
  for (const seg of segments) {
    html += seg.type === "text"
      ? processPlainText(seg.lines.join("\n"))
      : buildContactCard(seg)
  }

  html += buildSourcesBlock(sourceLines)
  return html
}
