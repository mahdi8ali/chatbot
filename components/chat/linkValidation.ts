export const META_LINE = "\n__VALID_IDS__:"

export function extractNewsIdClient(url: string): string | null {
  const m = url.match(/[?&]id=(\d+)/) || url.match(/\/news\/(\d+)/)
  return m ? m[1] : null
}

export function clientStripInvalidLinks(text: string, validIds: Set<string>): string {
  const hasIds = validIds.size > 0
  text = text.replace(
    /\[([^\]]*)\]\((https:\/\/(?:www\.)?alkafeel\.net\/news[^\s)]*)\)/g,
    (match, label, url) => {
      if (!hasIds) return label
      const id = extractNewsIdClient(url)
      return (!id || validIds.has(id)) ? match : label
    }
  )
  text = text.replace(
    /https:\/\/(?:www\.)?alkafeel\.net\/news\S*/g,
    (url) => {
      if (!hasIds) return ""
      const id = extractNewsIdClient(url)
      return (!id || validIds.has(id)) ? url : ""
    }
  )
  return text.replace(/🔗\s*(?:\[اقرأ المزيد\])?\s*\n?\s*$/gm, "").trim()
}
