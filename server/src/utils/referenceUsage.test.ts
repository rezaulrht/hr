import { describe, expect, it } from "vitest"

import { describeUsage } from "./referenceUsage"

describe("describeUsage", () => {
  it("returns null for an empty list", () => {
    expect(describeUsage([])).toBeNull()
  })

  it("returns null when every count is zero", () => {
    expect(
      describeUsage([
        { noun: "employee", count: 0 },
        { noun: "announcement", count: 0 },
      ])
    ).toBeNull()
  })

  it("pluralises with a trailing s", () => {
    expect(describeUsage([{ noun: "employee", count: 4 }])).toBe("4 employees")
  })

  it("keeps a count of one singular", () => {
    expect(describeUsage([{ noun: "employee", count: 1 }])).toBe("1 employee")
  })

  it("drops zero counts so callers can pass every relation unconditionally", () => {
    expect(
      describeUsage([
        { noun: "employee", count: 0 },
        { noun: "announcement", count: 2 },
      ])
    ).toBe("2 announcements")
  })

  it("joins two with 'and'", () => {
    expect(
      describeUsage([
        { noun: "employee", count: 4 },
        { noun: "announcement", count: 2 },
      ])
    ).toBe("4 employees and 2 announcements")
  })

  it("joins three with commas and a final 'and'", () => {
    expect(
      describeUsage([
        { noun: "employee", count: 4 },
        { noun: "announcement", count: 2 },
        { noun: "asset", count: 1 },
      ])
    ).toBe("4 employees, 2 announcements and 1 asset")
  })

  it("handles a multi-word noun", () => {
    expect(describeUsage([{ noun: "leave request", count: 3 }])).toBe("3 leave requests")
  })
})
