import { Metadata, Viewport } from "next"
import { notFound } from "next/navigation"
import { ReactNode } from "react"
import "./globals.css"

/**
 * اللغات المدعومة. التطبيق عربي فقط حالياً (html lang="ar" dir="rtl" مثبّت أدناه).
 *
 * ⚠️ بدون هذا الحصر يبتلع المقطع الديناميكي [locale] **أي** مسار من المستوى الأول
 * ويعيد صفحة المحادثة بحالة 200 — فمثلاً /widget.js (الودجت القديم المحذوف)
 * كان يُعيد HTML بدل 404، أي أن أي تضمين قديم يحمّل صفحة على أنها سكربت.
 */
const SUPPORTED_LOCALES = new Set(["ar"])

const APP_NAME = "مساعد مشاريع العتبة العباسية"
const APP_DEFAULT_TITLE = "مساعد مشاريع العتبة العباسية"
const APP_DESCRIPTION = "مساعد ذكي للاستعلام عن مشاريع العتبة العباسية المقدسة"

interface RootLayoutProps {
  children: ReactNode
  params: {
    locale: string
  }
}

export const metadata: Metadata = {
  applicationName: APP_NAME,
  title: APP_DEFAULT_TITLE,
  description: APP_DESCRIPTION,
  manifest: "/manifest.json",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
    shortcut: "/logo.png",
    other: [
      { rel: "icon", url: "/logo.png", type: "image/png" },
      { rel: "icon", url: "/logo.png", sizes: "192x192", type: "image/png" },
      { rel: "icon", url: "/logo.png", sizes: "512x512", type: "image/png" }
    ]
  }
}

export const viewport: Viewport = {
  themeColor: "#0a1628"
}

export default async function RootLayout({
  children,
  params: { locale }
}: RootLayoutProps) {
  if (!SUPPORTED_LOCALES.has(locale)) notFound()

  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Readex+Pro:wght@200;300;400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link rel="icon" href="/logo.png" type="image/png" />
        <link rel="shortcut icon" href="/logo.png" type="image/png" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  )
}
