"use client"

/**
 * AdminShell — قشرة الإدارة العميلة (Client Component)
 *
 * ترويسة (الشعار/العنوان يميناً + اسم المستخدم وزر «تسجيل الخروج» يساراً) وشريط
 * تنقّل مُوجَّه بالبيانات مُشتقّ من ADMIN_SECTIONS. تمييز القسم النشط عبر
 * usePathname(). لوحة الألوان C وخط FONT_FAMILY من _shared.tsx، RTL.
 *
 * قابلية التوسّع: إضافة قسم إداري جديد = عنصر واحد في ADMIN_SECTIONS + صفحته فقط.
 *
 * عند غياب اسم المستخدم (مثلاً صفحة تسجيل الدخول العامّة) تُعرض children وحدها بلا
 * ترويسة/تنقّل، فتبدو الصفحة مستقلّة.
 */

import React from "react"
import { usePathname } from "next/navigation"
import { C, FONT_FAMILY } from "./_shared"

// ─── تعريف الأقسام (data-driven) ────────────────────────────────────────────────
// إضافة قسم مستقبلي = عنصر جديد هنا + صفحته فقط، بلا تعديل في القشرة.
interface AdminSection { key: string; label: string; href: string; icon: string }

const ADMIN_SECTIONS: AdminSection[] = [
  { key: "analytics",  label: "التحليلات",   href: "/admin",            icon: "📊" },
  { key: "exceptions", label: "الاستثناءات", href: "/admin/exceptions", icon: "⚠️" },
  // أقسام مستقبلية تُضاف هنا فقط، مثل:
  // { key: "contacts", label: "جهات الاتصال", href: "/admin/contacts", icon: "📇" },
]

export function AdminShell({
  locale,
  username,
  children,
}: {
  locale: string
  username: string
  children: React.ReactNode
}) {
  const pathname = usePathname()

  // صفحة تسجيل الدخول العامّة (بلا جلسة): اعرض المحتوى وحده بلا قشرة.
  if (!username) return <>{children}</>

  async function handleLogout() {
    try {
      await fetch("/api/admin/auth/logout", { method: "POST" })
    } finally {
      window.location.href = `/${locale}/admin/login`
    }
  }

  // القسم نشط إذا طابق مساره الحالي المسار المُوطّن (localized href).
  function isActive(href: string): boolean {
    const localized = `/${locale}${href}`
    // /admin بالضبط ⇒ التحليلات (لا نستخدم startsWith كي لا تُضاء دائماً).
    if (href === "/admin") return pathname === localized
    return pathname === localized || pathname.startsWith(localized + "/")
  }

  return (
    <div style={{
      fontFamily: FONT_FAMILY, direction: "rtl",
      background: C.bg, minHeight: "100vh", color: C.text,
    }}>
      {/* ── الترويسة ── */}
      <div style={{
        background: C.navy, padding: "0 32px", display: "flex",
        alignItems: "center", justifyContent: "space-between", height: 58,
      }}>
        {/* الشعار/العنوان (يمين) */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 28, background: C.gold, borderRadius: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: "0.01em" }}>
              لوحة الإدارة
            </div>
            <div style={{ fontSize: 11, color: C.goldLight, marginTop: 1 }}>
              بوت العتبة العباسية المقدسة
            </div>
          </div>
        </div>

        {/* اسم المستخدم + خروج (يسار) */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span style={{ fontSize: 12, color: "#94a3b8" }}>
            {username}
          </span>
          <button
            onClick={handleLogout}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, padding: "7px 16px",
              border: `1px solid ${C.gold}`, borderRadius: 7,
              background: "transparent", cursor: "pointer",
              color: C.goldLight, fontFamily: "inherit", transition: "all .2s",
            }}
          >
            تسجيل الخروج
          </button>
        </div>
      </div>

      {/* ── شريط التنقّل المُوجَّه بالبيانات ── */}
      <nav style={{
        background: "#fff", borderBottom: `1px solid ${C.border}`,
        padding: "0 24px", display: "flex", alignItems: "center", gap: 4,
      }}>
        {ADMIN_SECTIONS.map(section => {
          const active = isActive(section.href)
          return (
            <a
              key={section.key}
              href={`/${locale}${section.href}`}
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "14px 18px", fontSize: 13, fontWeight: active ? 700 : 500,
                textDecoration: "none",
                color: active ? C.navy : C.muted,
                borderBottom: `2px solid ${active ? C.gold : "transparent"}`,
                fontFamily: "inherit", transition: "all .2s",
              }}
            >
              <span style={{ fontSize: 15, lineHeight: 1 }}>{section.icon}</span>
              {section.label}
            </a>
          )
        })}
      </nav>

      {/* ── منطقة المحتوى ── */}
      <main>
        {children}
      </main>
    </div>
  )
}
