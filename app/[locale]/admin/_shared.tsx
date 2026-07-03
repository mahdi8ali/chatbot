"use client"

import React from "react"

// ─── Palette ──────────────────────────────────────────────────────────────────
// لوحة الألوان المشتركة — منسوخة حرفياً من صفحة التحليلات للاتساق البصري التام.
export const C = {
  navy:       "#1a1a1a",
  navyLight:  "#2c2c2c",
  gold:       "#555555",
  goldLight:  "#777777",
  goldPale:   "#f5f5f5",
  blue:       "#333333",
  bluePale:   "#f5f5f5",
  green:      "#16a34a",
  greenPale:  "#f0fdf4",
  red:        "#dc2626",
  redPale:    "#fef2f2",
  amber:      "#555555",
  amberPale:  "#f5f5f5",
  border:     "#e5e7eb",
  bg:         "#f4f4f4",
  text:       "#111111",
  muted:      "#6b7280",
  light:      "#9ca3af",
}

// خطّ ذو اتجاه RTL مستخدم عبر لوحة الإدارة كاملةً.
export const FONT_FAMILY = "'Readex Pro','Segoe UI',sans-serif"

// ─── Table cell styles ──────────────────────────────────────────────────────────
// أنماط خلايا الجدول — منسوخة حرفياً من صفحة التحليلات.
export const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "right",
  fontWeight: 600, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap"
}
export const tdStyle: React.CSSProperties = { padding: "10px 14px", verticalAlign: "top" }

// ─── Stat Card ────────────────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub, accent, valueColor }: {
  icon: React.ReactNode; label: string; value: string | number; sub?: string; accent: string; valueColor?: string
}) {
  return (
    <div style={{
      background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10,
      padding: "20px 22px", display: "flex", gap: 16, alignItems: "flex-start"
    }}>
      <div style={{
        width: 44, height: 44, borderRadius: 10, flexShrink: 0,
        background: "#f0f0f0", display: "flex", alignItems: "center", justifyContent: "center", color: "#555"
      }}>
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 12, color: C.muted, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color: valueColor ?? C.text, lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: C.light, marginTop: 5 }}>{sub}</div>}
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
export function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: 11, background: bg, color, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {text}
    </span>
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────
export function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: "36px 0", textAlign: "center", color: "#c0c0c0", fontSize: 13 }}>{text}</div>
}

// ─── Toast ────────────────────────────────────────────────────────────────────
// توست نجاح/خطأ بألوان C.greenPale / C.redPale — RTL، ظاهر أعلى/أسفل الشاشة.
export function Toast({ kind, msg, onClose }: { kind: "ok" | "err"; msg: string; onClose?: () => void }) {
  const isOk = kind === "ok"
  return (
    <div
      role="status"
      style={{
        position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)",
        zIndex: 1100, direction: "rtl", fontFamily: FONT_FAMILY,
        display: "flex", alignItems: "center", gap: 10,
        background: isOk ? C.greenPale : C.redPale,
        border: `1px solid ${isOk ? "#86efac" : "#fca5a5"}`,
        color: isOk ? C.green : C.red,
        borderRadius: 8, padding: "12px 18px", fontSize: 13,
        boxShadow: "0 8px 24px rgba(0,0,0,0.12)", maxWidth: 480,
      }}
    >
      <span style={{ fontWeight: 700, flexShrink: 0 }}>{isOk ? "✓" : "✕"}</span>
      <span style={{ lineHeight: 1.7, wordBreak: "break-word" }}>{msg}</span>
      {onClose && (
        <button
          onClick={onClose}
          style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 16, color: "inherit", lineHeight: 1, padding: "2px 4px",
            marginRight: 4, flexShrink: 0, fontFamily: "inherit",
          }}
          aria-label="إغلاق"
        >×</button>
      )}
    </div>
  )
}

// ─── Confirm Dialog ─────────────────────────────────────────────────────────────
// حوار تأكيد صغير بأسلوب النافذة المنبثقة القائم (ConvModal) — RTL.
export function ConfirmDialog({
  open, title, message, confirmLabel, onConfirm, onCancel,
}: {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  onConfirm: () => void
  onCancel: () => void
}) {
  if (!open) return null
  return (
    <div
      onClick={onCancel}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: "100%", maxWidth: 420,
          overflow: "hidden", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          direction: "rtl", fontFamily: FONT_FAMILY,
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>{title}</span>
          <button onClick={onCancel} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, color: C.muted, lineHeight: 1, padding: "2px 6px"
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 8px", fontSize: 13, lineHeight: 1.8, color: C.text }}>
          {message}
        </div>

        {/* Actions */}
        <div style={{
          display: "flex", justifyContent: "flex-start", gap: 10,
          padding: "16px 20px 20px",
        }}>
          <button
            onClick={onConfirm}
            style={{
              background: C.red, color: "#fff", border: "none", borderRadius: 7,
              padding: "8px 18px", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit", fontWeight: 600,
            }}
          >{confirmLabel ?? "تأكيد"}</button>
          <button
            onClick={onCancel}
            style={{
              background: "transparent", color: C.muted, border: `1px solid ${C.border}`,
              borderRadius: 7, padding: "8px 18px", fontSize: 13, cursor: "pointer",
              fontFamily: "inherit",
            }}
          >إلغاء</button>
        </div>
      </div>
    </div>
  )
}
