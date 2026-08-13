/**
 * social-media-service.test.ts — اختبار خدمة روابط التواصل الاجتماعي.
 * بلا مُدخل مستخدم إطلاقاً (استعلام ثابت بلا معاملات)، فالتركيز على شكل الخرج.
 */

const mockExecute = jest.fn()

jest.mock("../db", () => {
  const actual = jest.requireActual("../db")
  return { ...actual, getPool: () => ({ execute: mockExecute }) }
})

import { getSocialMediaLinks } from "../social-media-service"

beforeEach(() => {
  mockExecute.mockReset()
})

describe("getSocialMediaLinks", () => {
  it("يحوّل الصفوف إلى platform/url/followers", async () => {
    mockExecute.mockResolvedValueOnce([
      [
        { name: "facebook", link: "https://www.facebook.com/alkafeel.global", count: "1.9M" },
        { name: "instagram", link: "https://www.instagram.com/alkafeel.global.network/", count: "1.5M" },
      ],
    ])
    const r = await getSocialMediaLinks()
    expect(r.success).toBe(true)
    expect((r.data as any).links).toEqual([
      { platform: "facebook", url: "https://www.facebook.com/alkafeel.global", followers: "1.9M" },
      { platform: "instagram", url: "https://www.instagram.com/alkafeel.global.network/", followers: "1.5M" },
    ])
    expect((r.data as any).total).toBe(2)
  })

  it("يستثني الروابط الفارغة على مستوى SQL (WHERE link IS NOT NULL)", async () => {
    await getSocialMediaLinks()
    const [sql] = mockExecute.mock.calls[0]
    expect(sql).toContain("link IS NOT NULL")
  })

  it("لا معاملات مستخدم إطلاقاً", async () => {
    await getSocialMediaLinks()
    const [, params] = mockExecute.mock.calls[0]
    expect(params).toBeUndefined()
  })

  it("فشل الاستعلام ⇒ {success:false} بلا رمي استثناء", async () => {
    mockExecute.mockRejectedValueOnce(new Error("db down"))
    const r = await getSocialMediaLinks()
    expect(r.success).toBe(false)
  })
})
