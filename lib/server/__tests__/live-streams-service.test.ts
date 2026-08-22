/**
 * live-streams-service.test.ts — اختبارات خدمة كاميرات البثّ المباشر.
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

import { getLiveStreams } from "../live-streams-service"

beforeEach(() => {
  mockExecute.mockReset()
})

describe("getLiveStreams", () => {
  it("يستخرج مفتاح ar من JSON نصّ title، ويضبط is_active من العمود active", async () => {
    mockExecute.mockResolvedValueOnce([[
      { id: 36, title: JSON.stringify({ ar: "نافذة الكفيل", en: "Window" }), source: "https://stream.alkafeel.net/live/alkafeel/playlist.m3u8", active: 1, sort: 1 },
      { id: 41, title: JSON.stringify({ ar: "الضريح الشريف" }), source: "https://stream.alkafeel.net/live/alkafeel/x.m3u8", active: 0, sort: 2 },
    ]])
    const r = await getLiveStreams()
    const data = r.data as any
    expect(data.streams[0]).toEqual({ id: 36, title: "نافذة الكفيل", url: "https://stream.alkafeel.net/live/alkafeel/playlist.m3u8", is_active: true })
    expect(data.streams[1].is_active).toBe(false)
    expect(data.active_count).toBe(1)
    expect(data.total).toBe(2)
  })

  it("لا معاملات مستخدم — استعلام ثابت بلا أي `?`", async () => {
    mockExecute.mockResolvedValueOnce([[]])
    await getLiveStreams()
    const [sql, params] = mockExecute.mock.calls[0]
    expect(sql).not.toContain("?")
    expect(params).toBeUndefined()
  })

  it("يشترط deleted_at IS NULL ويرتّب بـ sort", async () => {
    mockExecute.mockResolvedValueOnce([[]])
    await getLiveStreams()
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("deleted_at IS NULL")
    expect(sql).toContain("ORDER BY sort ASC")
  })

  it("title JSON غير صالح ⇒ عنوان احتياطي بدل رمي استثناء", async () => {
    mockExecute.mockResolvedValueOnce([[
      { id: 1, title: "not json at all", source: "https://stream.alkafeel.net/x.m3u8", active: 0, sort: 1 },
    ]])
    const r = await getLiveStreams()
    expect((r.data as any).streams[0].title).toBe("بثّ مباشر")
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await getLiveStreams()
    expect(r.success).toBe(false)
  })
})
