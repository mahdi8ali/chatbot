import { redirect } from "next/navigation"

/**
 * المسار القديم /[locale]/analytics — أُعيد توجيهه إلى لوحة الإدارة الموحّدة.
 * صفحة التحليلات انتقلت إلى /[locale]/admin داخل قشرة الإدارة.
 */
export default function AnalyticsRedirect({ params }: { params: { locale: string } }) {
  redirect(`/${params.locale}/admin`)
}
