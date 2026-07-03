import { requireAdmin } from "@/lib/server/admin-auth"
import { refresh } from "@/lib/server/curated-service"

// ⚠️ منع Next.js من تخزين النتائج — دائماً اقرأ من DB مباشرة
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * POST /api/curated/refresh — إبطال كاش المطابقة يدوياً.
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function POST(req: Request) {
  const deny = requireAdmin(req)
  if (deny) return deny

  try {
    refresh()
    return Response.json({ refreshed: true })
  } catch (err: any) {
    console.error("[Curated API refresh]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
