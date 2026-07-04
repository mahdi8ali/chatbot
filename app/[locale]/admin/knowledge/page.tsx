"use client"

/**
 * صفحة إدارة قاعدة المعرفة (Knowledge Base CRUD) — admin/knowledge/page.tsx
 *
 * مكوّن "use client" يعرض جدول CRUD لمقالات قاعدة المعرفة مع نموذج إضافة/تعديل
 * منبثق، مفتاح تبديل التفعيل (PATCH)، حوار تأكيد قبل الحذف، وزر «تحديث الكاش».
 * يعيد استخدام لوحة الألوان C وأنماط الجدول والمكوّنات المشتركة من _shared.tsx
 * (RTL، خط 'Readex Pro'). يحاكي admin/exceptions/page.tsx بدقّة.
 *
 * الطلبات تعتمد كوكي الجلسة HttpOnly تلقائياً (بلا رأس مصادقة)؛ عند 401 يعيد
 * العميل التوجيه إلى صفحة تسجيل الدخول. بعد كل كتابة ناجحة تُعاد fetchList().
 */

import React, { useCallback, useEffect, useState } from "react"
import { useParams } from "next/navigation"
import {
  C, FONT_FAMILY, thStyle, tdStyle, Badge, EmptyState, Toast, ConfirmDialog,
} from "../_shared"

// ─── النوع المحلّي المطابق لـ KbRow ─────────────────────────────────────────────
// لا نستورد شيفرة الخادم إلى مكوّن عميل؛ نعرّف واجهة محلّية بنفس شكل الصفّ.
interface KbRow {
  id: number
  title: string
  body: string
  keywords: string[]
  active: boolean
  priority: number
  note?: string | null
  updated_at: string
}

// شكل حمولة النموذج (قبل الإرسال).
interface FormState {
  title: string
  body: string
  keywords: string
  priority: string
  active: boolean
}

// ─── مساعدات ─────────────────────────────────────────────────────────────────
function truncate(s: string, n = 90): string {
  return s && s.length > n ? s.slice(0, n) + "…" : s
}

/** يحوّل نصاً مفصولاً بأسطر/فواصل إلى string[] مقلّمة خالية من الفراغ. */
function parseKeywords(raw: string): string[] {
  return raw
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(k => k.length > 0)
}

const EMPTY_FORM: FormState = {
  title: "",
  body: "",
  keywords: "",
  priority: "0",
  active: true,
}

// ─── المكوّن الرئيسي ─────────────────────────────────────────────────────────────
export default function KnowledgePage() {
  const params = useParams()
  const locale = (params?.locale as string) || "ar"

  const [rows, setRows] = useState<KbRow[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null)
  const [editing, setEditing] = useState<KbRow | null>(null) // الصفّ قيد التعديل
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [confirmDel, setConfirmDel] = useState<KbRow | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // إعادة توجيه إلى تسجيل الدخول عند 401.
  const redirectToLogin = useCallback(() => {
    window.location.href = `/${locale}/admin/login`
  }, [locale])

  // إظهار توست يختفي تلقائياً بعد قليل.
  const showToast = useCallback((kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg })
    setTimeout(() => setToast(null), 4000)
  }, [])

  // ── جلب القائمة ──
  const fetchList = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch("/api/knowledge", { cache: "no-store" })
      if (res.status === 401) { redirectToLogin(); return }
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`)
      setRows((json.entries as KbRow[]) || [])
    } catch (e: any) {
      setError(e?.message || "تعذّر تحميل البيانات")
    } finally {
      setLoading(false)
    }
  }, [redirectToLogin])

  useEffect(() => { fetchList() }, [fetchList])

  // ── فتح النموذج (إضافة/تعديل) ──
  function openAdd() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function openEdit(row: KbRow) {
    setEditing(row)
    setForm({
      title: row.title,
      body: row.body,
      keywords: row.keywords.join("\n"),
      priority: String(row.priority),
      active: row.active,
    })
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setEditing(null)
  }

  // ── حفظ (POST إنشاء / PUT تعديل) ──
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    // تحقّق مبدئي في العميل (الخادم يبقى المصدر الحاسم).
    if (!form.title.trim()) {
      showToast("err", "العنوان مطلوب")
      return
    }
    if (!form.body.trim()) {
      showToast("err", "نص المقالة مطلوب")
      return
    }
    const keywords = parseKeywords(form.keywords)
    const priorityNum = Number(form.priority)
    const body = {
      title: form.title.trim(),
      body: form.body.trim(),
      keywords,
      priority: Number.isFinite(priorityNum) ? priorityNum : 0,
      active: form.active,
    }

    setSaving(true)
    try {
      const isEdit = editing !== null
      const url = isEdit ? `/api/knowledge/${editing!.id}` : "/api/knowledge"
      const method = isEdit ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      if (res.status === 401) { redirectToLogin(); return }
      const json = await res.json().catch(() => ({}))
      if (res.status === 404) {
        showToast("err", "المقالة غير موجودة")
        setModalOpen(false)
        setEditing(null)
        await fetchList()
        return
      }
      if (!res.ok) {
        // 400 وغيره: أظهر الرسالة العربية القادمة من الخادم.
        showToast("err", json?.error || "تعذّر الحفظ")
        return
      }
      setModalOpen(false)
      setEditing(null)
      showToast("ok", isEdit ? "تم تحديث المقالة" : "تمت إضافة المقالة")
      await fetchList()
    } catch (e: any) {
      showToast("err", e?.message || "فشل الاتصال بالخادم")
    } finally {
      setSaving(false)
    }
  }

  // ── تبديل التفعيل (PATCH) ──
  async function handleToggle(row: KbRow) {
    try {
      const res = await fetch(`/api/knowledge/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !row.active }),
      })
      if (res.status === 401) { redirectToLogin(); return }
      const json = await res.json().catch(() => ({}))
      if (res.status === 404) { showToast("err", "المقالة غير موجودة"); await fetchList(); return }
      if (!res.ok) { showToast("err", json?.error || "تعذّر تغيير الحالة"); return }
      showToast("ok", !row.active ? "تم التفعيل" : "تم التعطيل")
      await fetchList()
    } catch (e: any) {
      showToast("err", e?.message || "فشل الاتصال بالخادم")
    }
  }

  // ── الحذف (بعد التأكيد) ──
  async function handleDelete(row: KbRow) {
    try {
      const res = await fetch(`/api/knowledge/${row.id}`, { method: "DELETE" })
      if (res.status === 401) { redirectToLogin(); return }
      if (res.status === 404) { showToast("err", "المقالة غير موجودة"); await fetchList(); return }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { showToast("err", json?.error || "تعذّر الحذف"); return }
      showToast("ok", "تم حذف المقالة")
      await fetchList()
    } catch (e: any) {
      showToast("err", e?.message || "فشل الاتصال بالخادم")
    } finally {
      setConfirmDel(null)
    }
  }

  // ── تحديث الكاش ──
  async function handleCacheRefresh() {
    setRefreshing(true)
    try {
      const res = await fetch("/api/knowledge/refresh", { method: "POST" })
      if (res.status === 401) { redirectToLogin(); return }
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { showToast("err", json?.error || "تعذّر تحديث الكاش"); return }
      showToast("ok", "تم تحديث الكاش — ستُطبَّق التغييرات فوراً")
    } catch (e: any) {
      showToast("err", e?.message || "فشل الاتصال بالخادم")
    } finally {
      setRefreshing(false)
    }
  }

  // ─── أنماط أزرار مشتركة ─────────────────────────────────────────────────────
  const primaryBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 13, padding: "8px 16px", border: "none", borderRadius: 7,
    background: C.navy, color: "#fff", cursor: "pointer",
    fontFamily: "inherit", fontWeight: 600,
  }
  const outlineBtn: React.CSSProperties = {
    display: "flex", alignItems: "center", gap: 6,
    fontSize: 13, padding: "8px 16px",
    border: `1px solid ${C.border}`, borderRadius: 7,
    background: "#fff", color: C.text, cursor: "pointer",
    fontFamily: "inherit",
  }

  return (
    <div style={{
      fontFamily: FONT_FAMILY, direction: "rtl", color: C.text,
      maxWidth: 1140, margin: "0 auto", padding: "28px 24px 60px",
    }}>
      {toast && <Toast kind={toast.kind} msg={toast.msg} onClose={() => setToast(null)} />}

      {/* ── ترويسة القسم ── */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 20, flexWrap: "wrap", gap: 12,
      }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, color: C.navy, margin: 0 }}>
            قاعدة المعرفة
          </h1>
          <div style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
            المقالات المعرفية الخاصّة القابلة للبحث
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={openAdd} style={primaryBtn}>➕ إضافة</button>
          <button onClick={handleCacheRefresh} disabled={refreshing} style={{
            ...outlineBtn, opacity: refreshing ? 0.6 : 1,
            cursor: refreshing ? "default" : "pointer",
          }}>🔄 تحديث الكاش</button>
        </div>
      </div>

      {/* ── شريط الخطأ ── */}
      {error && (
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: C.redPale, border: `1px solid #fca5a5`, borderRadius: 8,
          padding: "12px 18px", color: C.red, marginBottom: 20, fontSize: 13,
        }}>
          ⚠️ خطأ: {error}
          <button onClick={fetchList} style={{
            ...outlineBtn, marginRight: "auto", padding: "4px 12px", fontSize: 12,
          }}>إعادة المحاولة</button>
        </div>
      )}

      {/* ── حالة التحميل ── */}
      {loading && !rows && (
        <div style={{ textAlign: "center", padding: 80, color: C.light, fontSize: 14 }}>
          جارٍ تحميل البيانات…
        </div>
      )}

      {/* ── الجدول ── */}
      {rows && (
        rows.length === 0 && !loading
          ? <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10 }}>
              <EmptyState text="لا توجد مقالات — أضف أول مقالة عبر زرّ «إضافة»" />
            </div>
          : <div style={{
              background: "#fff", border: `1px solid ${C.border}`,
              borderRadius: 10, overflow: "hidden",
            }}>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                      {["#", "العنوان", "معاينة المتن", "الكلمات المفتاحية", "الأولوية", "مفعّل", "آخر تحديث", "إجراءات"].map((h, i) => (
                        <th key={i} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={row.id} style={{
                        borderBottom: `1px solid ${C.border}`,
                        background: i % 2 === 0 ? "#fff" : "#fafbfc",
                        opacity: row.active ? 1 : 0.55,
                      }}>
                        {/* # */}
                        <td style={{ ...tdStyle, color: C.light, width: 40 }}>{row.id}</td>

                        {/* العنوان */}
                        <td style={{ ...tdStyle, maxWidth: 200, fontWeight: 600 }}>
                          <span title={row.title}>{truncate(row.title, 60)}</span>
                        </td>

                        {/* معاينة المتن */}
                        <td style={{ ...tdStyle, maxWidth: 300, color: C.muted, fontSize: 12 }}>
                          <span title={row.body}>{truncate(row.body, 90)}</span>
                        </td>

                        {/* الكلمات المفتاحية (شرائح) */}
                        <td style={{ ...tdStyle, maxWidth: 240 }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                            {row.keywords.map((k, j) => (
                              <span key={j} style={{
                                fontSize: 11, background: C.goldPale, color: C.text,
                                borderRadius: 5, padding: "2px 7px", whiteSpace: "nowrap",
                              }}>{k}</span>
                            ))}
                          </div>
                        </td>

                        {/* الأولوية */}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ fontWeight: 700 }}>{row.priority}</span>
                        </td>

                        {/* مفعّل (مفتاح تبديل) */}
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <button
                            onClick={() => handleToggle(row)}
                            role="switch"
                            aria-checked={row.active}
                            aria-label={row.active ? "تعطيل" : "تفعيل"}
                            title={row.active ? "مفعّل — اضغط للتعطيل" : "غير مفعّل — اضغط للتفعيل"}
                            style={{
                              position: "relative", width: 40, height: 22, borderRadius: 11,
                              border: "none", cursor: "pointer", padding: 0,
                              background: row.active ? C.green : C.border,
                              transition: "background .2s",
                            }}
                          >
                            <span style={{
                              position: "absolute", top: 2,
                              right: row.active ? 2 : 20,
                              width: 18, height: 18, borderRadius: "50%",
                              background: "#fff", transition: "right .2s",
                              boxShadow: "0 1px 3px rgba(0,0,0,0.3)",
                            }} />
                          </button>
                        </td>

                        {/* آخر تحديث */}
                        <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>
                          {row.updated_at}
                        </td>

                        {/* إجراءات */}
                        <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                          <div style={{ display: "flex", gap: 8 }}>
                            <button onClick={() => openEdit(row)} style={{
                              background: "none", border: `1px solid ${C.border}`,
                              borderRadius: 6, padding: "4px 10px", fontSize: 12,
                              cursor: "pointer", color: C.text, fontFamily: "inherit",
                            }}>تعديل</button>
                            <button onClick={() => setConfirmDel(row)} style={{
                              background: "none", border: `1px solid #fca5a5`,
                              borderRadius: 6, padding: "4px 10px", fontSize: 12,
                              cursor: "pointer", color: C.red, fontFamily: "inherit",
                            }}>حذف</button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
      )}

      {/* ── نموذج الإضافة/التعديل (نافذة منبثقة) ── */}
      {modalOpen && (
        <div
          onClick={closeModal}
          style={{
            position: "fixed", inset: 0, zIndex: 1000,
            background: "rgba(0,0,0,0.45)", display: "flex",
            alignItems: "center", justifyContent: "center", padding: 24,
          }}
        >
          <form
            onClick={e => e.stopPropagation()}
            onSubmit={handleSubmit}
            style={{
              background: "#fff", borderRadius: 12, width: "100%", maxWidth: 560,
              maxHeight: "88vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
              direction: "rtl", fontFamily: FONT_FAMILY,
            }}
          >
            {/* رأس النافذة */}
            <div style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
            }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>
                {editing ? "تعديل مقالة" : "إضافة مقالة"}
              </span>
              <button type="button" onClick={closeModal} style={{
                background: "none", border: "none", cursor: "pointer",
                fontSize: 18, color: C.muted, lineHeight: 1, padding: "2px 6px",
              }}>×</button>
            </div>

            {/* الحقول */}
            <div style={{ padding: "20px", display: "flex", flexDirection: "column", gap: 16 }}>
              {/* العنوان */}
              <label style={fieldLabel}>
                العنوان
                <input
                  type="text"
                  value={form.title}
                  onChange={e => setForm({ ...form, title: e.target.value })}
                  placeholder="عنوان المقالة"
                  style={inputStyle}
                />
              </label>

              {/* المتن */}
              <label style={fieldLabel}>
                نصّ المقالة
                <textarea
                  value={form.body}
                  onChange={e => setForm({ ...form, body: e.target.value })}
                  rows={8}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.8 }}
                />
              </label>

              {/* الكلمات المفتاحية */}
              <label style={fieldLabel}>
                الكلمات المفتاحية (سطر أو فاصلة لكل كلمة)
                <textarea
                  value={form.keywords}
                  onChange={e => setForm({ ...form, keywords: e.target.value })}
                  rows={3}
                  placeholder={"الوفود\nالزيارات الرسمية"}
                  style={{ ...inputStyle, resize: "vertical", lineHeight: 1.7 }}
                />
              </label>

              <div style={{ display: "flex", gap: 16, alignItems: "flex-end" }}>
                {/* الأولوية */}
                <label style={{ ...fieldLabel, flex: 1 }}>
                  الأولوية
                  <input
                    type="number"
                    value={form.priority}
                    onChange={e => setForm({ ...form, priority: e.target.value })}
                    style={inputStyle}
                  />
                </label>

                {/* التفعيل */}
                <label style={{
                  display: "flex", alignItems: "center", gap: 8,
                  fontSize: 13, color: C.text, cursor: "pointer", paddingBottom: 10,
                }}>
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={e => setForm({ ...form, active: e.target.checked })}
                    style={{ width: 16, height: 16, cursor: "pointer" }}
                  />
                  مفعّل
                </label>
              </div>
            </div>

            {/* الأزرار */}
            <div style={{
              display: "flex", justifyContent: "flex-start", gap: 10,
              padding: "16px 20px 20px", borderTop: `1px solid ${C.border}`,
            }}>
              <button type="submit" disabled={saving} style={{
                ...primaryBtn, opacity: saving ? 0.6 : 1,
                cursor: saving ? "default" : "pointer",
              }}>{saving ? "جارٍ الحفظ…" : editing ? "حفظ التعديل" : "إضافة"}</button>
              <button type="button" onClick={closeModal} disabled={saving} style={{
                background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
                borderRadius: 7, padding: "8px 18px", fontSize: 13,
                cursor: saving ? "default" : "pointer", fontFamily: "inherit",
              }}>إلغاء</button>
            </div>
          </form>
        </div>
      )}

      {/* ── حوار تأكيد الحذف ── */}
      <ConfirmDialog
        open={confirmDel !== null}
        title="تأكيد الحذف"
        message={confirmDel
          ? `هل تريد حذف المقالة رقم ${confirmDel.id}؟ لا يمكن التراجع عن هذا الإجراء.`
          : ""}
        confirmLabel="حذف"
        onConfirm={() => confirmDel && handleDelete(confirmDel)}
        onCancel={() => setConfirmDel(null)}
      />
    </div>
  )
}

// ─── أنماط الحقول ─────────────────────────────────────────────────────────────
const fieldLabel: React.CSSProperties = {
  display: "flex", flexDirection: "column", gap: 6,
  fontSize: 13, fontWeight: 600, color: C.text,
}

const inputStyle: React.CSSProperties = {
  width: "100%", boxSizing: "border-box",
  border: `1px solid ${C.border}`, borderRadius: 7,
  padding: "9px 12px", fontSize: 13, fontFamily: FONT_FAMILY,
  color: C.text, background: "#fff", fontWeight: 400,
}
