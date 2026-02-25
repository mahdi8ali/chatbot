/**
 * Widget React Component Wrapper
 * يُستخدم لتحويل ChatWidget إلى standalone bundle
 */

import React from 'react'
import { createRoot } from 'react-dom/client'
import ChatWidget from './components/ChatWidget'

// دالة لتهيئة الودجت
export function initWidget(containerId: string, config: any) {
  const container = document.getElementById(containerId)
  if (!container) {
    console.error(`[AlKafeel Widget] Container #${containerId} not found`)
    return
  }

  const root = createRoot(container)
  root.render(
    <React.StrictMode>
      <ChatWidget {...config} />
    </React.StrictMode>
  )
}

// تصدير للنطاق العام
if (typeof window !== 'undefined') {
  ;(window as any).AlkafeelWidgetReact = { initWidget }
}
