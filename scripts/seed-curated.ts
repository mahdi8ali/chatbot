/**
 * seed-curated.ts — تشغيل بذرة مخزن الإجابات المنسّقة يدوياً (لتجهيز الجدول فوراً).
 * الاستخدام: npx ts-node scripts/seed-curated.ts
 */
import fs from "fs"
import path from "path"

// تحميل .env.local يدوياً (ts-node لا يحمّله تلقائياً)
const envPath = path.join(__dirname, "..", ".env.local")
for (const line of fs.readFileSync(envPath, "utf8").split("\n")) {
  const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/)
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
}

async function main() {
  const svc = await import("../lib/server/curated-service")
  await svc.seed()
  const entries = await svc.matchCurated("__نداء_تحميل__لعرض_الكل__")
  // نطبع عدد المداخل عبر إعادة التحميل الداخلي
  console.log("seed() executed successfully.")
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("seed failed:", e)
    process.exit(1)
  })
