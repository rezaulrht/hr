import { describe, expect, it } from "vitest"

import { assertStatutoryUpdateAllowed } from "./leave.admin"

// Mirrors the seeded CASUAL row (§115): 10 days, no carry-forward, no cap.
const CASUAL = {
  name: "Casual",
  statutory: true,
  isPaid: true,
  annualQuota: 10,
  carryForwardPct: 0,
  maxConsecutive: null,
  maxAccrual: null,
  minServiceMonths: 0,
  accrualBasis: "PRO_RATED" as const,
  countsHolidays: false,
  allowsBackdating: false,
  allowsHalfDay: true,
  eligibleFor: ["FULL_TIME", "PART_TIME", "CONTRACT"] as const,
}

const EARNED = {
  ...CASUAL,
  name: "Earned",
  accrualBasis: "EARNED" as const,
  minServiceMonths: 12,
  maxAccrual: 60,
}

const PERSONAL = { ...CASUAL, name: "Personal", statutory: false }

describe("assertStatutoryUpdateAllowed — non-statutory rows", () => {
  it("allows anything on a company-policy type", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(PERSONAL as any, {
        annualQuota: 0,
        accrualBasis: "NONE",
        isPaid: false,
      })
    ).not.toThrow()
  })
})

describe("monotonic fields — raising is allowed", () => {
  it("allows raising annualQuota", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 12 })).not.toThrow()
  })

  it("allows raising carryForwardPct", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { carryForwardPct: 50 })).not.toThrow()
  })

  it("allows an unchanged value", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 10 })).not.toThrow()
  })

  it("allows widening eligibleFor", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(CASUAL as any, {
        eligibleFor: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"],
      })
    ).not.toThrow()
  })

  it("treats null maxAccrual as uncapped, so it is always allowed", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: null })).not.toThrow()
  })

  it("allows raising a capped maxAccrual", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: 90 })).not.toThrow()
  })

  it("treats null maxConsecutive as uncapped", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { maxConsecutive: null })).not.toThrow()
  })
})

describe("monotonic fields — lowering is refused", () => {
  it("refuses lowering annualQuota, naming the field and the floor", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 8 })).toThrow(
      /annualQuota cannot go below 10/
    )
  })

  it("refuses lowering carryForwardPct", () => {
    // EARNED carries 100% forward under §117, so 50 is a real reduction.
    const carrying = { ...EARNED, carryForwardPct: 100 }
    expect(() => assertStatutoryUpdateAllowed(carrying as any, { carryForwardPct: 50 })).toThrow(
      /carryForwardPct cannot go below 100/
    )
  })

  it("refuses lowering maxAccrual", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: 30 })).toThrow(
      /maxAccrual cannot go below 60/
    )
  })

  it("refuses capping an uncapped maxConsecutive", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { maxConsecutive: 5 })).toThrow(
      /maxConsecutive/
    )
  })

  it("refuses narrowing eligibleFor", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { eligibleFor: ["FULL_TIME"] })).toThrow(
      /eligibleFor/
    )
  })

  it("refuses making a statutory type unpaid", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { isPaid: false })).toThrow(/isPaid/)
  })
})

// The one that inverts. Less waiting is more generous, so the comparison
// runs the other way — a reader skimming the table will assume this is a bug.
describe("minServiceMonths inverts", () => {
  it("allows LOWERING minServiceMonths", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { minServiceMonths: 6 })).not.toThrow()
  })

  it("refuses RAISING minServiceMonths", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { minServiceMonths: 24 })).toThrow(
      /minServiceMonths cannot go above 12/
    )
  })
})

describe("locked fields", () => {
  it("refuses changing accrualBasis", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { accrualBasis: "PRO_RATED" })).toThrow(
      /accrualBasis cannot be changed/
    )
  })

  it("refuses changing countsHolidays", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { countsHolidays: true })).toThrow(
      /countsHolidays cannot be changed/
    )
  })

  it("refuses changing allowsBackdating", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { allowsBackdating: true })).toThrow(
      /allowsBackdating/
    )
  })

  it("refuses changing allowsHalfDay", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { allowsHalfDay: false })).toThrow(
      /allowsHalfDay/
    )
  })

  it("allows re-sending a locked field unchanged", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(CASUAL as any, { accrualBasis: "PRO_RATED" })
    ).not.toThrow()
  })

  it("always allows renaming", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { name: "Casual Leave" })).not.toThrow()
  })
})
