import { describe, expect, it } from "vitest"

import { isOverdue, summariseCosts } from "./cost.derive"

const asOf = new Date("2026-08-15T00:00:00.000Z")
const bill = (over: Partial<Parameters<typeof isOverdue>[0]> = {}) => ({
  status: "PENDING" as const,
  dueDate: new Date("2026-08-05T00:00:00.000Z"),
  ...over,
})

describe("isOverdue", () => {
  it("is true for a PENDING bill past its due date", () => {
    expect(isOverdue(bill(), asOf)).toBe(true)
  })

  it("is false on the due date itself — due today is not yet late", () => {
    expect(isOverdue(bill({ dueDate: asOf }), asOf)).toBe(false)
  })

  it("is false for a PAID bill however old", () => {
    // Storing overdue would need a job to unset it on payment; deriving it
    // makes that class of stale data unreachable.
    expect(isOverdue(bill({ status: "PAID" }), asOf)).toBe(false)
  })

  it("is false when there is no due date", () => {
    expect(isOverdue(bill({ dueDate: null }), asOf)).toBe(false)
  })
})

describe("summariseCosts", () => {
  const rows = [
    { status: "PAID", dueDate: null, amount: "25000.00", currency: "BDT", categoryId: "c1", categoryName: "Office rent" },
    { status: "PENDING", dueDate: new Date("2026-08-05T00:00:00.000Z"), amount: "4200.50", currency: "BDT", categoryId: "c2", categoryName: "Electricity" },
    { status: "PENDING", dueDate: null, amount: "1800.00", currency: "BDT", categoryId: "c2", categoryName: "Electricity" },
  ] as never[]

  it("groups by category and splits paid from outstanding", () => {
    const s = summariseCosts(rows, asOf)

    expect(s.totals).toEqual([
      { currency: "BDT", total: "31000.50", paid: "25000.00", outstanding: "6000.50" },
    ])
    expect(s.categories).toHaveLength(2)
    const electricity = s.categories.find((c) => c.categoryId === "c2")!
    expect(electricity.total).toBe("6000.50")
    expect(electricity.billCount).toBe(2)
  })

  it("counts overdue bills, not overdue categories", () => {
    expect(summariseCosts(rows, asOf).overdueCount).toBe(1)
  })

  it("NEVER adds two currencies into one figure", () => {
    // The bug this guards: BDT 25,000 rent + USD 50 hosting summed to
    // "25050.00", a number that is not money in either currency — and it is
    // the headline figure on the screen.
    const mixed = [
      ...rows,
      { status: "PAID", dueDate: null, amount: "50.00", currency: "USD", categoryId: "c3", categoryName: "Internet" },
    ] as never[]

    const s = summariseCosts(mixed, asOf)

    expect(s.totals).toHaveLength(2)
    expect(s.totals.find((t) => t.currency === "BDT")!.total).toBe("31000.50")
    expect(s.totals.find((t) => t.currency === "USD")!.total).toBe("50.00")
    expect(s.totals.every((t) => t.total !== "31050.50")).toBe(true)
  })

  it("splits one category into two rows when it holds two currencies", () => {
    const mixed = [
      { status: "PAID", dueDate: null, amount: "1200.00", currency: "BDT", categoryId: "c3", categoryName: "Internet" },
      { status: "PAID", dueDate: null, amount: "50.00", currency: "USD", categoryId: "c3", categoryName: "Internet" },
    ] as never[]

    const s = summariseCosts(mixed, asOf)

    expect(s.categories).toHaveLength(2)
    expect(s.categories.map((c) => c.currency).sort()).toEqual(["BDT", "USD"])
  })

  it("returns empty totals rather than a fabricated zero for a month with no bills", () => {
    // A month with no bills has no currency, so there is no figure to
    // report. A hard-coded "0.00 BDT" would be inventing a currency the
    // month never had.
    const s = summariseCosts([], asOf)
    expect(s.totals).toEqual([])
    expect(s.categories).toEqual([])
    expect(s.overdueCount).toBe(0)
  })
})
