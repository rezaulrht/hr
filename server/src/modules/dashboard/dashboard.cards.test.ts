import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { settleCards } from "./dashboard.cards"
import type { DashboardStat } from "./dashboard.types"

const card = (label: string): DashboardStat => ({
  label,
  value: "12",
  sub: "sub",
  tag: "tag",
  tone: "green",
})

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => vi.restoreAllMocks())

describe("settleCards", () => {
  it("keeps the good cards when one builder rejects", async () => {
    // A dashboard that fails wholesale because one of eight queries timed out
    // is worse than one showing seven numbers and an error.
    const stats = await settleCards([
      { label: "A", build: async () => card("A") },
      { label: "B", build: async () => Promise.reject(new Error("timeout")) },
      { label: "C", build: async () => card("C") },
      { label: "D", build: async () => card("D") },
    ])

    expect(stats).toHaveLength(4)
    expect(stats.map((s) => s.label)).toEqual(["A", "B", "C", "D"])
    expect(stats.filter((s) => s.failed)).toHaveLength(1)
    expect(stats[0].value).toBe("12")
    expect(stats[2].value).toBe("12")
  })

  it("keeps a failed card's label, so the user knows what is missing", async () => {
    // The label lives outside the builder precisely so it survives the
    // rejection: "Something went wrong" with no label says nothing.
    const stats = await settleCards([
      { label: "Awaiting your approval", build: async () => Promise.reject(new Error("x")) },
    ])

    expect(stats[0].label).toBe("Awaiting your approval")
    expect(stats[0].failed).toBe(true)
    expect(stats[0].tone).toBe("red")
  })

  it("does not render a failure as zero", async () => {
    // "0" and "—" both read as a real answer. This has to read as the absence
    // of one.
    const stats = await settleCards([
      { label: "Pending leave", build: async () => Promise.reject(new Error("x")) },
    ])

    expect(stats[0].value).not.toBe("0")
    expect(stats[0].value).not.toBe("—")
    expect(stats[0].value).toBe("Unavailable")
  })

  it("logs the reason rather than swallowing it", async () => {
    // A card silently failing for a month is how a dashboard becomes
    // furniture.
    const reason = new Error("connection reset")
    await settleCards([{ label: "Headcount", build: async () => Promise.reject(reason) }])

    expect(console.error).toHaveBeenCalledWith(
      'Dashboard card "Headcount" failed',
      reason
    )
  })

  it("never throws, even when every builder rejects", async () => {
    const stats = await settleCards([
      { label: "A", build: async () => Promise.reject(new Error("a")) },
      { label: "B", build: async () => Promise.reject(new Error("b")) },
    ])

    expect(stats.every((s) => s.failed)).toBe(true)
  })

  it("returns an empty array for no builders", async () => {
    await expect(settleCards([])).resolves.toEqual([])
  })
})
