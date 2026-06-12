"use client"

import { useEffect, useState, useCallback } from "react"
import {
  MessageSquare, ThumbsUp, Clock, Wrench,
  TrendingUp, AlertTriangle, RefreshCw,
  ChevronDown, Minus
} from "lucide-react"

// ─── Types ────────────────────────────────────────────────────────────────────
interface Overview {
  total: number; avg_ms: number; tool_used_count: number; no_tool_count: number
  total_fb: number; helpful: number; not_helpful: number; satisfaction: number | null
}
interface RecentLog {
  id: number; user_question: string; tool_called: string | null
  response_time_ms: number; db_result_count: number; final_answer: string | null
  created_at: string; rating: "helpful" | "not_helpful" | null; feedback_note: string | null
}
interface NegativeNote {
  user_question: string; final_answer: string | null; feedback_note: string | null; created_at: string
}
interface DailyLog { day: string; questions: number; avg_ms: number; tool_used: number }
interface TopTool { tool_called: string; cnt: number }
interface NoResult { user_question: string; tool_called: string; response_time_ms: number; created_at: string }
interface NoToolQuestion { user_question: string; response_time_ms: number; final_answer: string | null; created_at: string }
interface ImprovementTask { user_question: string; no_results_count: number; negative_fb_count: number; total_issues: number; last_seen: string }
interface RepeatedQuestion { user_question: string; cnt: number; last_seen: string; avg_ms: number }
interface AnalyticsData {
  overview: Overview; recent: RecentLog[]; negativeNotes: NegativeNote[]
  daily: DailyLog[]; topTools: TopTool[]; noResults: NoResult[]
  noTool: NoToolQuestion[]; improvements: ImprovementTask[]; repeated: RepeatedQuestion[]
}

// ─── Palette ──────────────────────────────────────────────────────────────────
const C = {
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

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ms(n: number) { if (!n) return "—"; return n >= 1000 ? `${(n / 1000).toFixed(1)}ث` : `${n}ms` }
function truncate(s: string, n = 80) { return s?.length > n ? s.slice(0, n) + "…" : s }

// ─── Conversation Modal ───────────────────────────────────────────────────────────────────────────────
interface ModalData {
  question: string
  answer: string | null
  note?: string | null
  time?: string
}

function ConvModal({ data, onClose }: { data: ModalData; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,0.45)", display: "flex",
        alignItems: "center", justifyContent: "center", padding: 24,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 12, width: "100%", maxWidth: 680,
          maxHeight: "80vh", overflow: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          direction: "rtl", fontFamily: "'Readex Pro','Segoe UI',sans-serif",
        }}
      >
        {/* Header */}
        <div style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "16px 20px", borderBottom: `1px solid ${C.border}`,
        }}>
          <span style={{ fontWeight: 700, fontSize: 14, color: C.text }}>تفاصيل المحادثة</span>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: 18, color: C.muted, lineHeight: 1, padding: "2px 6px"
          }}>×</button>
        </div>

        {/* Body */}
        <div style={{ padding: "20px 20px 24px", display: "flex", flexDirection: "column", gap: 14 }}>

          {/* User bubble */}
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{
              maxWidth: "80%", background: C.navy, color: "#fff",
              borderRadius: "12px 12px 4px 12px", padding: "12px 16px",
              fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word"
            }}>
              {data.question}
            </div>
          </div>

          {/* Bot bubble */}
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{
              maxWidth: "85%", background: "#f4f6f9",
              borderRadius: "12px 12px 12px 4px", padding: "12px 16px",
              fontSize: 13, lineHeight: 1.8, whiteSpace: "pre-wrap", wordBreak: "break-word",
              color: C.text
            }}>
              {data.answer || <span style={{ color: C.light, fontStyle: "italic" }}>لم يتم تسجيل جواب</span>}
            </div>
          </div>

          {/* Feedback note if exists */}
          {data.note && (
            <div style={{
              background: C.redPale, border: `1px solid #fca5a5`,
              borderRadius: 8, padding: "10px 14px", fontSize: 12,
              color: C.red, display: "flex", gap: 8, alignItems: "flex-start"
            }}>
              <span style={{ fontWeight: 600, flexShrink: 0 }}>ملاحظة المستخدم:</span>
              <span>{data.note}</span>
            </div>
          )}

          {data.time && (
            <div style={{ fontSize: 11, color: C.light, textAlign: "center" }}>{data.time}</div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, accent, valueColor }: {
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

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHead({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
      <span style={{ color: C.gold }}>{icon}</span>
      <span style={{ fontWeight: 600, fontSize: 13, color: C.navy }}>{title}</span>
    </div>
  )
}

// ─── Bar Row ──────────────────────────────────────────────────────────────────
function Bar({ label, val, max, color }: { label: string; val: number; max: number; color: string }) {
  const w = max === 0 ? 0 : Math.round((val / max) * 100)
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
      <span style={{ width: 44, fontSize: 11, color: C.muted, textAlign: "left", flexShrink: 0 }}>{label}</span>
      <div style={{ flex: 1, background: "#f0f2f5", borderRadius: 4, height: 14, overflow: "hidden" }}>
        <div style={{ width: `${w}%`, background: color, height: "100%", borderRadius: 4, transition: "width .4s ease" }} />
      </div>
      <span style={{ width: 26, fontSize: 11, color: C.muted, textAlign: "left", flexShrink: 0 }}>{val}</span>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────
function Badge({ text, bg, color }: { text: string; bg: string; color: string }) {
  return (
    <span style={{ fontSize: 11, background: bg, color, borderRadius: 5, padding: "2px 8px", whiteSpace: "nowrap" }}>
      {text}
    </span>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null)
  const [activeTab, setActiveTab] = useState<"recent" | "negative" | "noResults" | "noTool" | "improvements" | "repeated">("recent")
  const [spinning, setSpinning] = useState(false)
  const [modal, setModal] = useState<ModalData | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true); setError(null); setSpinning(true)
    try {
      const res = await fetch("/api/analytics", { cache: "no-store" })
      if (!res.ok) throw new Error("HTTP " + res.status)
      const json = await res.json()
      if (json.error) throw new Error(json.error)
      setData(json); setLastRefresh(new Date())
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false); setTimeout(() => setSpinning(false), 600) }
  }, [])

  useEffect(() => { fetchData() }, [fetchData])
  const ov = data?.overview

  return (
    <div style={{ fontFamily: "'Readex Pro','Segoe UI',sans-serif", direction: "rtl", background: C.bg, minHeight: "100vh", color: C.text }}>
      {modal && <ConvModal data={modal} onClose={() => setModal(null)} />}

      {/* ── Header ── */}
      <div style={{ background: C.navy, padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 58 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ width: 3, height: 28, background: C.gold, borderRadius: 2 }} />
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "#fff", letterSpacing: "0.01em" }}>
              تحليل المحادثات
            </div>
            <div style={{ fontSize: 11, color: C.goldLight, marginTop: 1 }}>بوت العتبة العباسية المقدسة</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {lastRefresh && (
            <span style={{ fontSize: 11, color: "#94a3b8" }}>
              آخر تحديث: {lastRefresh.toLocaleTimeString("ar-IQ")}
            </span>
          )}
          <button
            onClick={fetchData} disabled={loading}
            style={{
              display: "flex", alignItems: "center", gap: 6,
              fontSize: 12, padding: "7px 16px",
              border: `1px solid ${C.gold}`, borderRadius: 7,
              background: "transparent", cursor: loading ? "default" : "pointer",
              color: C.goldLight, fontFamily: "inherit",
              opacity: loading ? 0.7 : 1, transition: "all .2s"
            }}
          >
            <RefreshCw size={13} style={{ transform: spinning ? "rotate(360deg)" : "none", transition: "transform .6s" }} />
            تحديث
          </button>
        </div>
      </div>

      {/* ── Accent line ── */}
      <div style={{ height: 2, background: "#e5e7eb" }} />

      <div style={{ maxWidth: 1140, margin: "0 auto", padding: "28px 24px 60px" }}>

        {error && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            background: C.redPale, border: `1px solid #fca5a5`, borderRadius: 8,
            padding: "12px 18px", color: C.red, marginBottom: 20, fontSize: 13
          }}>
            <AlertTriangle size={16} />
            خطأ في الاتصال: {error}
          </div>
        )}

        {loading && !data && (
          <div style={{ textAlign: "center", padding: 80, color: C.light, fontSize: 14 }}>
            جارٍ تحميل البيانات…
          </div>
        )}

        {ov && (<>

          {/* ── Stat Cards ── */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 14, marginBottom: 20 }}>
            <StatCard
              icon={<MessageSquare size={20} />} label="إجمالي الأسئلة"
              value={ov.total?.toLocaleString("en-US") ?? 0} accent="#555555"
            />
            <StatCard
              icon={<ThumbsUp size={20} />} label="نسبة الرضا"
              value={ov.satisfaction != null ? `${ov.satisfaction}%` : "—"}
              valueColor={ov.satisfaction != null ? (ov.satisfaction >= 70 ? C.green : C.red) : C.text}
              sub={`${ov.helpful ?? 0} مفيدة من ${ov.total_fb ?? 0} تقييم`}
              accent="#555555"
            />
            <StatCard
              icon={<Clock size={20} />} label="متوسط الاستجابة"
              value={ms(ov.avg_ms)} sub="من الطلب حتى نهاية الرد"
              valueColor={ov.avg_ms > 12000 ? C.red : ov.avg_ms > 0 && ov.avg_ms < 5000 ? C.green : C.text}
              accent="#555555"
            />
            <StatCard
              icon={<Wrench size={20} />} label="استخدام أدوات البحث"
              value={ov.tool_used_count ?? 0}
              sub={`بلا بحث: ${ov.no_tool_count ?? 0} سؤال`}
              accent="#555555"
            />
          </div>

          {/* ── Charts ── */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>

            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px" }}>
              <SectionHead icon={<TrendingUp size={15} />} title="النشاط اليومي — آخر 14 يوم" />
              {data!.daily.length === 0
                ? <div style={{ color: C.light, fontSize: 13, padding: "12px 0" }}>لا توجد بيانات بعد</div>
                : data!.daily.map((d, i) => (
                    <Bar key={i} label={d.day} val={d.questions}
                      max={Math.max(...data!.daily.map(x => x.questions), 1)}
                      color={C.blue} />
                  ))
              }
            </div>

            <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, padding: "20px 24px" }}>
              <SectionHead icon={<Wrench size={15} />} title="أكثر الأدوات استخداماً" />
              {data!.topTools.length === 0
                ? <div style={{ color: C.light, fontSize: 13, padding: "12px 0" }}>لا توجد بيانات بعد</div>
                : data!.topTools.map((t, i) => (
                    <Bar key={i} label={t.tool_called.replace(/_/g, " ").slice(0, 18)}
                      val={t.cnt} max={data!.topTools[0]?.cnt || 1} color={C.gold} />
                  ))
              }
            </div>
          </div>

          {/* ── Tabs ── */}
          <div style={{ background: "#fff", border: `1px solid ${C.border}`, borderRadius: 10, overflow: "hidden" }}>

            {/* Tab bar */}
            <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, background: "#fafbfc" }}>
              {([
                { key: "recent",       label: "آخر الأسئلة",          count: data!.recent.length,          color: "#333"   },
                { key: "negative",     label: "ملاحظات سلبية",         count: data!.negativeNotes.length,   color: C.red    },
                { key: "noResults",    label: "أسئلة بلا نتائج",       count: data!.noResults.length,       color: C.red    },
                { key: "noTool",       label: "أسئلة بلا أداة",        count: data!.noTool.length,          color: C.muted  },
                { key: "improvements", label: "تحويل إلى مهمة تحسين",   count: data!.improvements.length,   color: C.amber  },
                { key: "repeated",     label: "أسئلة متكررة",           count: data!.repeated.length,        color: C.muted  },
              ] as { key: typeof activeTab; label: string; count: number; color: string }[]).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)} style={{
                  background: "none", border: "none", cursor: "pointer",
                  padding: "12px 20px", fontSize: 13, fontFamily: "inherit",
                  display: "flex", alignItems: "center", gap: 8,
                  color: activeTab === t.key ? C.navy : C.muted,
                  fontWeight: activeTab === t.key ? 700 : 400,
                  borderBottom: activeTab === t.key ? `2px solid ${C.navy}` : "2px solid transparent",
                  marginBottom: -1, transition: "color .15s"
                }}>
                  {t.label}
                  <span style={{
                    fontSize: 11, fontWeight: 600, borderRadius: 20, padding: "1px 7px",
                    background: activeTab === t.key ? t.color + "18" : "#f0f0f0",
                    color: activeTab === t.key ? t.color : C.light,
                    transition: "all .15s"
                  }}>{t.count}</span>
                </button>
              ))}
            </div>

            {/* ── Tab: Recent ── */}
            {activeTab === "recent" && (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                      {["#", "السؤال", "الأداة", "نتائج", "زمن", "تقييم", "وقت"].map((h, i) => (
                        <th key={i} style={thStyle}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data!.recent.map((r, i) => (
                      <tr key={r.id}
                        onClick={() => setModal({ question: r.user_question, answer: r.final_answer, note: r.feedback_note, time: r.created_at })}
                        style={{ borderBottom: `1px solid ${C.border}`, background: i % 2 === 0 ? "#fff" : "#fafbfc", cursor: "pointer" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                        onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? "#fff" : "#fafbfc")}
                      >
                        <td style={{ ...tdStyle, color: C.light, width: 40 }}>{r.id}</td>
                        <td style={{ ...tdStyle, maxWidth: 340 }}>
                          <div title={r.user_question} style={{ color: C.text }}>{truncate(r.user_question, 75)}</div>
                          {r.feedback_note && (
                            <div style={{ fontSize: 11, color: C.light, marginTop: 3, display: "flex", alignItems: "center", gap: 4 }}>
                              <ChevronDown size={10} />
                              {truncate(r.feedback_note, 60)}
                            </div>
                          )}
                        </td>
                        <td style={tdStyle}>
                          {r.tool_called
                            ? <Badge text={r.tool_called.replace(/_/g, " ")} bg={C.bluePale} color={C.blue} />
                            : <Minus size={14} color={C.border} />}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {r.db_result_count > 0
                            ? <span style={{ color: C.green, fontWeight: 700 }}>{r.db_result_count}</span>
                            : <span style={{ color: C.red, fontWeight: 700 }}>0</span>}
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          <span style={{ color: r.response_time_ms > 12000 ? C.red : C.text }}>{ms(r.response_time_ms)}</span>
                        </td>
                        <td style={{ ...tdStyle, textAlign: "center" }}>
                          {r.rating === "helpful"
                            ? <span title="مفيدة" style={{ fontSize: 15 }}>👍</span>
                            : r.rating === "not_helpful"
                            ? <span title="غير مفيدة" style={{ fontSize: 15 }}>👎</span>
                            : <Minus size={14} color={C.border} />}
                        </td>
                        <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{r.created_at}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── Tab: Negative ── */}
            {activeTab === "negative" && (
              data!.negativeNotes.length === 0
                ? <EmptyState text="لا توجد تقييمات سلبية" />
                : <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                          {["السؤال", "ملاحظة المستخدم", "جواب البوت", "وقت"].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data!.negativeNotes.map((n, i) => (
                          <tr key={i}
                            onClick={() => setModal({ question: n.user_question, answer: n.final_answer, note: n.feedback_note, time: n.created_at })}
                            style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fff5f5")}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}
                          >
                            <td style={{ ...tdStyle, maxWidth: 220 }}>{truncate(n.user_question, 80)}</td>
                            <td style={{ ...tdStyle, maxWidth: 220 }}>
                              {n.feedback_note
                                ? <span style={{ color: C.red, fontWeight: 500 }}>{n.feedback_note}</span>
                                : <span style={{ color: C.light, fontStyle: "italic" }}>لم يكتب ملاحظة</span>}
                            </td>
                            <td style={{ ...tdStyle, maxWidth: 280, color: C.muted, fontSize: 12 }}>
                              {n.final_answer ? truncate(n.final_answer, 100) : "—"}
                            </td>
                            <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{n.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}

            {/* ── Tab: No Tool ── */}
            {activeTab === "noTool" && (
              data!.noTool.length === 0
                ? <EmptyState text="كل الأسئلة استخدمت أداة بحث" />
                : <div style={{ overflowX: "auto" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 18px", background: C.bluePale,
                      borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted
                    }}>
                      هذه الأسئلة أجاب عنها البوت من معرفته الخاصة دون بحث في قاعدة البيانات
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                          {["السؤال", "جواب البوت", "زمن", "وقت"].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data!.noTool.map((r, i) => (
                          <tr key={i}
                            onClick={() => setModal({ question: r.user_question, answer: r.final_answer, time: r.created_at })}
                            style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#f0f4ff")}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}
                          >
                            <td style={{ ...tdStyle, maxWidth: 320 }}>{truncate(r.user_question, 80)}</td>
                            <td style={{ ...tdStyle, maxWidth: 320, color: C.muted, fontSize: 12 }}>{r.final_answer ? truncate(r.final_answer, 90) : "—"}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>{ms(r.response_time_ms)}</td>
                            <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{r.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}

            {/* ── Tab: Improvements ── */}
            {activeTab === "improvements" && (
              data!.improvements.length === 0
                ? <EmptyState text="لا توجد مهام تحسين حالياً" />
                : <div style={{ overflowX: "auto" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 18px", background: "#fffbeb",
                      borderBottom: `1px solid #fde68a`, fontSize: 12, color: "#92400e"
                    }}>
                      <AlertTriangle size={14} />
                      هذه الأسئلة إما لم تجد نتائج في قاعدة البيانات أو حصلت على تقييم سلبي — راجعها لتحسين البيانات أو المطالبات
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                          {["السؤال", "بلا نتائج", "تقييم سلبي", "الإجمالي", "آخر ظهور"].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data!.improvements.map((r, i) => (
                          <tr key={i}
                            style={{ borderBottom: `1px solid ${C.border}` }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fffbeb")}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}
                          >
                            <td style={{ ...tdStyle, maxWidth: 380 }}>{truncate(r.user_question, 90)}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              {r.no_results_count > 0
                                ? <span style={{ color: C.red, fontWeight: 700 }}>{r.no_results_count}</span>
                                : <span style={{ color: C.light }}>—</span>}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              {r.negative_fb_count > 0
                                ? <span style={{ color: C.red, fontWeight: 700 }}>{r.negative_fb_count}</span>
                                : <span style={{ color: C.light }}>—</span>}
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <span style={{
                                fontWeight: 700, fontSize: 13,
                                color: r.total_issues >= 3 ? C.red : r.total_issues >= 2 ? "#d97706" : C.muted
                              }}>{r.total_issues}</span>
                            </td>
                            <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{r.last_seen}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}

            {/* ── Tab: Repeated ── */}
            {activeTab === "repeated" && (
              data!.repeated.length === 0
                ? <EmptyState text="لا توجد أسئلة متكررة" />
                : <div style={{ overflowX: "auto" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 18px", background: C.goldPale,
                      borderBottom: `1px solid ${C.border}`, fontSize: 12, color: C.muted
                    }}>
                      الأسئلة التي طرحها المستخدمون أكثر من مرة — اعتبرها اهتماماً حقيقياً ويمكن تحويلها إلى FAQ أو تحسين إجاباتها
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                          {["السؤال", "مرات التكرار", "متوسط الزمن", "آخر ظهور"].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data!.repeated.map((r, i) => (
                          <tr key={i}
                            style={{ borderBottom: `1px solid ${C.border}` }}
                            onMouseEnter={e => (e.currentTarget.style.background = C.goldPale)}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}
                          >
                            <td style={{ ...tdStyle, maxWidth: 400 }}>{truncate(r.user_question, 90)}</td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>
                              <span style={{
                                fontWeight: 700,
                                color: r.cnt >= 5 ? C.red : r.cnt >= 3 ? "#d97706" : C.green
                              }}>{r.cnt}</span>
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center", color: r.avg_ms > 12000 ? C.red : C.text }}>{ms(r.avg_ms)}</td>
                            <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{r.last_seen}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}

            {/* ── Tab: No Results ── */}
            {activeTab === "noResults" && (
              data!.noResults.length === 0
                ? <EmptyState text="كل الأسئلة وجدت نتائج" />
                : <div style={{ overflowX: "auto" }}>
                    <div style={{
                      display: "flex", alignItems: "center", gap: 8,
                      padding: "10px 18px", background: C.amberPale,
                      borderBottom: `1px solid #fde68a`, fontSize: 12, color: C.amber
                    }}>
                      <AlertTriangle size={14} />
                      هذه الأسئلة بحثت في قاعدة البيانات ولم تجد نتائج — تحتاج إضافة بيانات أو تحسين مصطلحات البحث
                    </div>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#fafbfc", borderBottom: `2px solid ${C.border}` }}>
                          {["السؤال", "الأداة", "زمن", "وقت"].map((h, i) => (
                            <th key={i} style={thStyle}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {data!.noResults.map((r, i) => (
                          <tr key={i}
                            onClick={() => setModal({ question: r.user_question, answer: null, time: r.created_at })}
                            style={{ borderBottom: `1px solid ${C.border}`, cursor: "pointer" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#fffbeb")}
                            onMouseLeave={e => (e.currentTarget.style.background = "")}
                          >
                            <td style={{ ...tdStyle, maxWidth: 420 }}>{truncate(r.user_question, 95)}</td>
                            <td style={tdStyle}>
                              <Badge text={r.tool_called.replace(/_/g, " ")} bg={C.amberPale} color={C.amber} />
                            </td>
                            <td style={{ ...tdStyle, textAlign: "center" }}>{ms(r.response_time_ms)}</td>
                            <td style={{ ...tdStyle, fontSize: 11, color: C.light, whiteSpace: "nowrap" }}>{r.created_at}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
            )}
          </div>

        </>)}
      </div>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div style={{ padding: "36px 0", textAlign: "center", color: "#c0c0c0", fontSize: 13 }}>{text}</div>
}

const thStyle: React.CSSProperties = {
  padding: "10px 14px", textAlign: "right",
  fontWeight: 600, fontSize: 12, color: "#6b7280", whiteSpace: "nowrap"
}
const tdStyle: React.CSSProperties = { padding: "10px 14px", verticalAlign: "top" }
