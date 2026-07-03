import { requireAdmin } from "@/lib/server/admin-auth"
import { update, setActive, remove } from "@/lib/server/curated-service"
import { validateCuratedInput } from "@/lib/server/curated-validation"

// ⚠️ منع Next.js من تخزين النتائج — دائماً اقرأ من DB مباشرة
export const dynamic = "force-dynamic"
export const runtime = "nodejs"

interface Ctx {
  params: { id: string }
}

/**
 * يحلّل المُعرّف من مسار الطلب؛ يعيد عدداً صحيحاً موجباً أو null إن كان غير صالح.
 */
function parseId(ctx: Ctx): number | null {
  const id = Number(ctx.params.id)
  if (!Number.isInteger(id) || id <= 0) return null
  return id
}

/**
 * PUT /api/curated/[id] — تحديث جزئي لمدخلة قائمة.
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function PUT(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req)
  if (deny) return deny

  const id = parseId(ctx)
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 })
  }

  try {
    const body = await req.json()
    const result = validateCuratedInput(body, { partial: true })
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 })
    }
    const row = await update(id, result.value!)
    if (!row) {
      return Response.json({ error: "العنصر غير موجود" }, { status: 404 })
    }
    return Response.json({ entry: row })
  } catch (err: any) {
    console.error("[Curated API PUT]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

/**
 * PATCH /api/curated/[id] — تبديل حالة التفعيل فقط.
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function PATCH(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req)
  if (deny) return deny

  const id = parseId(ctx)
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 })
  }

  try {
    const body = await req.json()
    const active = (body as { active?: unknown })?.active
    if (typeof active !== "boolean") {
      return Response.json(
        { error: "الحقل active يجب أن يكون قيمة منطقية" },
        { status: 400 }
      )
    }
    const row = await setActive(id, active)
    if (!row) {
      return Response.json({ error: "العنصر غير موجود" }, { status: 404 })
    }
    return Response.json({ entry: row })
  } catch (err: any) {
    console.error("[Curated API PATCH]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}

/**
 * DELETE /api/curated/[id] — حذف مدخلة.
 * محمي بـ requireAdmin قبل أي منطق.
 */
export async function DELETE(req: Request, ctx: Ctx) {
  const deny = requireAdmin(req)
  if (deny) return deny

  const id = parseId(ctx)
  if (id === null) {
    return Response.json({ error: "معرّف غير صالح" }, { status: 400 })
  }

  try {
    const ok = await remove(id)
    if (!ok) {
      return Response.json({ deleted: false }, { status: 404 })
    }
    return Response.json({ deleted: true })
  } catch (err: any) {
    console.error("[Curated API DELETE]", err)
    return Response.json({ error: err.message }, { status: 500 })
  }
}
