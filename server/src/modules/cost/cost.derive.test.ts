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

    expect(s.total).toBe("31000.50")
    expect(s.paid).toBe("25000.00")
    expect(s.outstanding).toBe("6000.50")
    expect(s.categories).toHaveLength(2)
    const electricity = s.categories.find((c) => c.categoryId === "c2")!
    expect(electricity.total).toBe("6000.50")
    expect(electricity.billCount).toBe(2)
  })

  it("counts overdue bills, not overdue categories", () => {
    expect(summariseCosts(rows, asOf).overdueCount).toBe(1)
  })

  it("returns zeroes rather than an empty shape for a month with no bills", () => {
    // A month with no bills is a real answer. Returning null would make
    // every caller handle a case that means "zero".
    const s = summariseCosts([], asOf)
    expect(s.total).toBe("0.00")
    expect(s.categories).toEqual([])
  })
})
