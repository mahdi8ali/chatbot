/**
 * db.ts — Connection Pool المشترك + دوال المساعدة المشتركة بين جميع الـ services
 */

import mysql, { Pool, RowDataPacket } from "mysql2/promise"
import { getDatabaseConfig } from "./site-api-config"

// ── نوع النتيجة المشترك ──────────────────────────────────────────────────────
export interface APICallResult {
  success: boolean
  data?: any
  error?: string
  statusCode?: number
}

// ── Connection Pool ──────────────────────────────────────────────────────────
let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const config = getDatabaseConfig()
  pool = mysql.createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit,
    charset: "utf8mb4"
  })
  return pool
}

// ── دوال المساعدة المشتركة ────────────────────────────────────────────────────

export function stripHtml(input: string): string {
  if (!input) return ""
  return input
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
}

export function excerpt(text: string | null | undefined, max: number = 280): string {
  if (!text) return ""
  const clean = stripHtml(text)
  if (clean.length <= max) return clean
  return clean.slice(0, max) + "..."
}

export function normalizeArabicWord(word: string): string {
  return word
    .replace(/[ًٌٍَُِّْ]/g, "")
    .replace(/(ة|ي|ا|ون|ين|ات|ان|اً|ية|يّ)$/, "")
    .replace(/^(ال|وال|فال|بال|كال)/, "")
}

export function consonantSkeleton(word: string): string {
  if (word.length < 4) return word
  const first = word[0]
  const last = word[word.length - 1]
  const middle = word.slice(1, -1).replace(/[اوي]/g, "")
  const result = first + middle + last
  return result.length >= 3 ? result : word
}

export function parseJsonAr(jsonStr: string | null): string {
  if (!jsonStr) return ""
  try {
    const obj = typeof jsonStr === "string" ? JSON.parse(jsonStr) : jsonStr
    return obj["ar"] || obj["en"] || (Object.values(obj)[0] as string) || ""
  } catch {
    return String(jsonStr)
  }
}

export function buildTitleExtras(title: string): { roots: string; skeletons: string } {
  const words = (title || "").split(/\s+/)
  const roots = words.map(normalizeArabicWord).filter(w => w.length >= 3).join(" ").toLowerCase()
  const skeletons = words.map(w => consonantSkeleton(normalizeArabicWord(w))).filter(w => w.length >= 3).join(" ").toLowerCase()
  return { roots, skeletons }
}

/** تطبيع خفيف لمقارنة التشابه (توحيد الألف/الهمزات/التاء المربوطة/الياء وحذف التشكيل). */
export function fuzzyNorm(w: string): string {
  return (w || "")
    .replace(/[ًٌٍَُِّْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
}

/**
 * مسافة تحرير (Levenshtein) مع سقف: تتوقّف مبكراً وتُعيد max+1 إن تجاوزت الحدّ.
 * تُستخدم لمطابقة الأخطاء الإملائية (مثل «العنيد» ↔ «العميد») على كلمات العنوان.
 */
export function levenshtein(a: string, b: string, max: number): number {
  const al = a.length, bl = b.length
  if (Math.abs(al - bl) > max) return max + 1
  let prev = new Array(bl + 1)
  for (let j = 0; j <= bl; j++) prev[j] = j
  for (let i = 1; i <= al; i++) {
    const cur = new Array(bl + 1)
    cur[0] = i
    let best = i
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return max + 1
    prev = cur
  }
  return prev[bl]
}

export function scoreItem(
  item: { searchText: string; name: string; titleSkeletonText: string; sections?: any[] },
  words: string[],
  wordRoots: (string | null)[],
  wordSkeletons: (string | null)[],
  safeQuery: string,
  sectionLower: string | null
): number {
  const text = item.searchText || ""
  const titleLower = (item.name || "").toLowerCase()
  const titleSkeleton = item.titleSkeletonText || ""
  let score = 0

  if (safeQuery && text.includes(safeQuery)) score += 15

  // كلمات العنوان مطبّعة (تُحسب مرّة واحدة) للمطابقة التقريبية عند فشل المطابقة الحرفية
  let titleWordsNorm: string[] | null = null

  for (let i = 0; i < words.length; i++) {
    const w = words[i]
    const root = wordRoots[i]
    const skeleton = wordSkeletons[i]
    if (text.includes(w)) {
      score += titleLower.includes(w) ? 8 : 3
    } else if (root && root.length >= 3 && text.includes(root)) {
      score += titleLower.includes(root) ? 5 : 2
    } else if (skeleton && skeleton.length >= 3 && text.includes(skeleton)) {
      score += titleSkeleton.includes(skeleton) ? 4 : 1
    } else if (w.length >= 4) {
      // مطابقة تقريبية للأخطاء الإملائية على كلمات العنوان فقط (رخيصة ودقيقة)
      const nw = fuzzyNorm(w)
      const maxDist = nw.length <= 5 ? 1 : 2
      if (titleWordsNorm === null) {
        titleWordsNorm = titleLower.split(/\s+/).filter(Boolean).map(fuzzyNorm)
      }
      for (const tw of titleWordsNorm) {
        if (Math.abs(tw.length - nw.length) > maxDist) continue
        if (levenshtein(nw, tw, maxDist) <= maxDist) { score += 4; break }
      }
    }
  }

  if (sectionLower) {
    const inSection = (item.sections || []).some((s: any) =>
      String(s.name || "").toLowerCase().includes(sectionLower)
    )
    if (!inSection) score = 0
  }
  return score
}

// ── re-export RowDataPacket للاستخدام في الـ services ────────────────────────
export type { RowDataPacket }
