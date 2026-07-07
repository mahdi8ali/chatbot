// تحميل متغيرات البيئة قبل الاختبارات.
// ملاحظة: ‎@next/env يتجاهل .env.local عندما NODE_ENV=test، لذا نحمّله يدوياً
// حتى تتمكن اختبارات التكامل من الاتصال بقاعدة البيانات المحلية.
const fs = require("fs")
const path = require("path")

function loadEnvFile(file) {
  const full = path.join(process.cwd(), file)
  if (!fs.existsSync(full)) return
  const content = fs.readFileSync(full, "utf-8")
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq === -1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    // إزالة علامات الاقتباس المحيطة إن وُجدت
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1)
    }
    if (process.env[key] === undefined) process.env[key] = val
  }
}

loadEnvFile(".env.local")
