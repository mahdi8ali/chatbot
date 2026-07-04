/**
 * contacts-service.ts — بيانات التواصل من جداول `contact_main` و `contact_divisions`
 */

import { APICallResult, getPool, fuzzyNorm, levenshtein } from "./db"

export async function searchContacts(query?: string): Promise<APICallResult> {
  try {
    const db = getPool()

    const [mainRows] = await db.query(
      `SELECT type, contact_info FROM contact_main WHERE deleted_at IS NULL ORDER BY id`
    )

    const [divRows] = await db.query(
      `SELECT cd.id, cd.title AS division_title, cd.address,
              csd.name AS contact_name, csd.phone, csd.email, csd.title AS contact_title
       FROM contact_divisions cd
       LEFT JOIN contact_sub_divisions csd ON csd.contact_division_id = cd.id AND csd.deleted_at IS NULL
       WHERE cd.deleted_at IS NULL
       ORDER BY cd.id, csd.id`
    )

    const divisionsMap = new Map<number, any>()
    for (const row of divRows as any[]) {
      if (!divisionsMap.has(row.id)) {
        divisionsMap.set(row.id, {
          id: row.id,
          title: row.division_title,
          address: row.address,
          contacts: []
        })
      }
      if (row.contact_name) {
        let phones: string[] = []
        try { phones = JSON.parse(row.phone || "[]") } catch { phones = row.phone ? [row.phone] : [] }
        divisionsMap.get(row.id).contacts.push({
          name: row.contact_name,
          phones,
          email: row.email || null,
          title: row.contact_title || null
        })
      }
    }

    let divisions = Array.from(divisionsMap.values())

    if (query && query.trim()) {
      const normalize = (s: string) => s
        .toLowerCase()
        .replace(/[ًٌٍَُِّْ]/g, "")
        .replace(/[أإآ]/g, "ا")
        .replace(/[ةه]/g, "ه")
        .replace(/[ىي]/g, "ي")

      const words = normalize(query).split(/\s+/).filter(w => w.length > 1)
      divisions = divisions.filter(d => {
        const text = normalize([d.title, d.address, ...d.contacts.map((c: any) => c.name + " " + (c.title || ""))].join(" "))
        // مطابقة حرفية: أي كلمة موجودة في النص
        if (words.some(w => text.includes(w))) return true
        // مطابقة تقريبية: Levenshtein على كلمات العنوان (للأخطاء الإملائية)
        const titleWords = text.split(/\s+/).filter(Boolean)
        for (const w of words) {
          if (w.length < 4) continue
          const nw = fuzzyNorm(w)
          const maxDist = nw.length <= 5 ? 1 : 2
          for (const tw of titleWords) {
            const ntw = fuzzyNorm(tw)
            if (Math.abs(ntw.length - nw.length) > maxDist) continue
            if (levenshtein(nw, ntw, maxDist) <= maxDist) return true
          }
        }
        return false
      })
    }

    const contacts: any[] = []
    for (const div of divisions) {
      if (div.contacts.length > 0) {
        for (const c of div.contacts) {
          contacts.push({
            department: div.title,
            name: c.name || null,
            title: c.title || null,
            address: div.address || null,
            phones: c.phones,
            email: c.email || null
          })
        }
      } else {
        contacts.push({
          department: div.title,
          name: null,
          title: null,
          address: div.address || null,
          phones: [],
          email: null
        })
      }
    }

    const general: { phones: string[]; emails: string[] } = { phones: [], emails: [] }
    for (const row of mainRows as any[]) {
      if (row.type === "phone") general.phones.push(row.contact_info)
      else if (row.type === "email") general.emails.push(row.contact_info)
    }

    return { success: true, data: { contacts, general, total: contacts.length } }
  } catch (error: any) {
    return { success: false, error: error.message }
  }
}
