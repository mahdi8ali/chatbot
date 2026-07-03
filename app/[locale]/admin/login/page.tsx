"use client"

import { useState } from "react"
import { useParams, useSearchParams } from "next/navigation"
import { C, FONT_FAMILY } from "../_shared"

// رسالة الفشل الموحّدة — لا تكشف أي الحقلين خاطئ (متّسقة مع مسار الـ API)
const UNIFIED_ERROR = "بيانات الدخول غير صحيحة"
const GENERIC_ERROR = "تعذّر تسجيل الدخول، يرجى المحاولة مرة أخرى"

export default function AdminLoginPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  // استخراج اللغة من مسار [locale] (افتراضي "ar")
  const rawLocale = params?.locale
  const locale = (Array.isArray(rawLocale) ? rawLocale[0] : rawLocale) || "ar"

  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  // وجهة ما بعد الدخول: نقبل `next` فقط إذا كان مساراً داخل منطقة الإدارة لنفس اللغة
  function resolveDestination(): string {
    const fallback = `/${locale}/admin`
    const next = searchParams?.get("next")
    if (next && next.startsWith(`/${locale}/admin`)) return next
    return fallback
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)

    // حارس بسيط في العميل: لا نرسل إن كان أحد الحقلين فارغاً
    if (!username.trim() || !password) {
      setError(UNIFIED_ERROR)
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch("/api/admin/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      })

      if (res.ok) {
        // تنقّل كامل حتى يعيد خادم القشرة قراءة الكوكي الجديدة
        window.location.href = resolveDestination()
        return
      }

      if (res.status === 401) {
        let msg = UNIFIED_ERROR
        try {
          const data = await res.json()
          if (data?.error && typeof data.error === "string") msg = data.error
        } catch {
          /* نُبقي الرسالة الموحّدة */
        }
        setError(msg)
      } else {
        setError(GENERIC_ERROR)
      }
    } catch {
      // فشل الشبكة أو خطأ غير متوقّع
      setError(GENERIC_ERROR)
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "11px 14px",
    fontSize: 14,
    fontFamily: "inherit",
    color: C.text,
    background: submitting ? C.bg : "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    outline: "none",
    direction: "rtl",
  }

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: C.text,
    marginBottom: 7,
  }

  return (
    <div
      dir="rtl"
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: C.bg,
        fontFamily: FONT_FAMILY,
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 400,
          background: "#fff",
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "36px 32px",
          boxShadow: "0 12px 40px rgba(0,0,0,0.08)",
        }}
      >
        {/* الترويسة */}
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ fontSize: 13, color: C.muted, marginBottom: 6 }}>لوحة الإدارة</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: C.text, margin: 0 }}>
            تسجيل الدخول
          </h1>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          {/* اسم المستخدم */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="admin-username" style={labelStyle}>
              اسم المستخدم
            </label>
            <input
              id="admin-username"
              type="text"
              autoComplete="username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
          </div>

          {/* كلمة المرور */}
          <div style={{ marginBottom: 18 }}>
            <label htmlFor="admin-password" style={labelStyle}>
              كلمة المرور
            </label>
            <input
              id="admin-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              disabled={submitting}
              style={inputStyle}
            />
          </div>

          {/* رسالة الخطأ */}
          {error && (
            <div
              role="alert"
              style={{
                background: C.redPale,
                border: `1px solid #fca5a5`,
                color: C.red,
                borderRadius: 8,
                padding: "10px 14px",
                fontSize: 13,
                lineHeight: 1.7,
                marginBottom: 18,
              }}
            >
              {error}
            </div>
          )}

          {/* زر الإرسال */}
          <button
            type="submit"
            disabled={submitting}
            style={{
              width: "100%",
              padding: "12px 16px",
              fontSize: 14,
              fontWeight: 600,
              fontFamily: "inherit",
              color: "#fff",
              background: C.navy,
              border: "none",
              borderRadius: 8,
              cursor: submitting ? "not-allowed" : "pointer",
              opacity: submitting ? 0.7 : 1,
            }}
          >
            {submitting ? "جارٍ تسجيل الدخول…" : "تسجيل الدخول"}
          </button>
        </form>
      </div>
    </div>
  )
}
