/**
 * قشرة لوحة الإدارة (Server Component) — admin/layout.tsx
 *
 * مكوّن خادمي (بلا "use client") لأن getAdminSession() يقرأ الكوكيز عبر
 * next/headers (خادمي حصراً). يقرأ اسم المستخدم من الجلسة ويمرّره إلى مكوّن
 * التنقّل العميل <AdminShell/> الذي يتولّى الترويسة والتنقّل وزر الخروج.
 *
 * الحماية الفعلية مفروضة خادمياً (middleware + requireAdmin)؛ قراءة الجلسة هنا
 * لعرض اسم المستخدم فقط (طبقة تأكيد إضافية). صفحة تسجيل الدخول تقع تحت هذه القشرة
 * أيضاً، لكنها عامّة — و AdminShell يعرض المحتوى فقط (بلا ترويسة/تنقّل) عند غياب
 * اسم مستخدم، فتبدو صفحة الدخول مستقلّة.
 */

import React from "react"
import { getAdminSession } from "@/lib/server/admin-auth-server"
import { AdminShell } from "./_AdminShell"

export default function AdminLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { locale: string }
}) {
  const session = getAdminSession()
  const username = session?.username ?? ""

  return (
    <AdminShell locale={params.locale} username={username}>
      {children}
    </AdminShell>
  )
}
