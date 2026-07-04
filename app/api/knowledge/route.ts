import { requireAdmin } from "@/lib/server/admin-auth"
import { listAll, create } from "@/lib/server/kb-service"
import { validateKbInput } from "@/lib/server/kb-validation"

// ⚠️ منع Next.js من تخزين النتائج — دائماً اقرأ من DB مباشرة
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

/**
 * GET /api/knowledge — قائمة كل مقالات قاعدة المعرفة (لوحة الإدارة).
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function GET(req: Request) {
  const deny = requireAdmin(req)
  if (deny) return deny

  try {
    const entries = await listAll()
    return Response.json(
      { entries },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (err: any) {
    console.error("[KB API GET]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

/**
 * POST /api/knowledge — إنشاء مقالة معرفة جديدة (وضع تحقّق كامل).
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function POST(req: Request) {
  const deny = requireAdmin(req)
  if (deny) return deny

  try {
    const body = await req.json()
    const result = validateKbInput(body)
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 })
    }
    const entry = await create(result.value!)
    return Response.json({ entry }, { status: 201 })
  } catch (err: any) {
    console.error("[KB API POST]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
