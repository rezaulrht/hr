import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { ageInDays, bdt, days, money, ofTotal, percent } from "./dashboard.format"
import { toneFor } from "./dashboard.tone"

describe("bdt", () => {
  it("reads a payroll total in lakh, not millions", () => {
    // ৳1.92M is not how anyone in Bangladesh reads a payroll total. The
    // millions in the original mock were a dollar-template artefact.
    expect(bdt(1_920_000)).toBe("৳19.2L")
  })

  it("reads a large total in crore", () => {
    expect(bdt(12_600_000)).toBe("৳1.26Cr")
  })

  it("groups a small amount with separators", () => {
    expect(bdt(4820)).toBe("৳4,820")
  })

  it("renders zero as ৳0", () => {
    expect(bdt(0)).toBe("৳0")
  })

  it("puts the sign before the symbol", () => {
    // "৳-4,820" reads as a currency called "-৳" for the half-second that
    // matters.
    expect(bdt(-4820)).toBe("-৳4,820")
  })

  it("formats a Decimal identically to the equivalent number", () => {
    expect(bdt(new Prisma.Decimal("1920000.00"))).toBe(bdt(1_920_000))
    expect(bdt(new Prisma.Decimal("4820.50"))).toBe("৳4,821")
  })

  it("trims a trailing zero rather than padding", () => {
    expect(bdt(2_000_000)).toBe("৳20L")
    expect(bdt(10_000_000)).toBe("৳1Cr")
  })

  it("switches unit exactly at the boundary", () => {
    expect(bdt(99_999)).toBe("৳99,999")
    expect(bdt(100_000)).toBe("৳1L")
    expect(bdt(9_999_999)).toBe("৳100L")
    expect(bdt(10_000_000)).toBe("৳1Cr")
  })
})

describe("money", () => {
  it("uses the payslip's own currency", () => {
    // Someone paid in USD reading a BDT-only card cannot reconcile it
    // against their bank statement.
    expect(money(2000, "USD")).toBe("$2,000")
  })

  it("falls back to the code for a currency it has no symbol for", () => {
    expect(money(2000, "EUR")).toBe("EUR 2,000")
  })
})

describe("percent", () => {
  it("reads an empty denominator as — rather than 0%", () => {
    // A roster with no working days has no attendance rate. Reporting 0%
    // would say every single person was absent.
    expect(percent(0, 0)).toBe("—")
  })

  it("rounds to whole percent by default", () => {
    expect(percent(14, 16)).toBe("88%")
  })
})

describe("days and ofTotal", () => {
  it("singularises one day", () => {
    expect(days(1)).toBe("1 day")
    expect(days(3)).toBe("3 days")
  })

  it("reads zero and negative as today", () => {
    expect(days(0)).toBe("today")
    expect(days(-2)).toBe("today")
  })

  it("renders a count against its denominator", () => {
    expect(ofTotal(14, 16)).toBe("14 of 16")
  })
})

describe("ageInDays", () => {
  it("never returns a negative age", () => {
    const a = new Date("2026-08-10T00:00:00.000Z")
    const b = new Date("2026-08-01T00:00:00.000Z")
    expect(ageInDays(a, b)).toBe(0)
    expect(ageInDays(b, a)).toBe(9)
  })
})

describe("toneFor", () => {
  it("calls an empty queue green and a long one red", () => {
    expect(toneFor.queue(0)).toBe("green")
    expect(toneFor.queue(5)).toBe("yellow")
    expect(toneFor.queue(6)).toBe("red")
  })

  it("escalates an ageing queue", () => {
    expect(toneFor.aging(1)).toBe("neutral")
    expect(toneFor.aging(2)).toBe("yellow")
    expect(toneFor.aging(5)).toBe("red")
  })

  it("has no 'a bit blocked'", () => {
    expect(toneFor.blockers(0)).toBe("green")
    expect(toneFor.blockers(1)).toBe("red")
  })

  it("escalates staleness", () => {
    expect(toneFor.staleness(0)).toBe("green")
    expect(toneFor.staleness(2)).toBe("green")
    expect(toneFor.staleness(7)).toBe("yellow")
    expect(toneFor.staleness(8)).toBe("red")
  })

  it("reads a rate in whichever direction is good", () => {
    // 95% attendance is good; 95% attrition is a catastrophe. No single
    // comparison covers both.
    expect(toneFor.rate(95, { good: 90, bad: 80 })).toBe("green")
    expect(toneFor.rate(85, { good: 90, bad: 80 })).toBe("yellow")
    expect(toneFor.rate(70, { good: 90, bad: 80 })).toBe("red")

    expect(toneFor.rate(4, { good: 10, bad: 20 })).toBe("green")
    expect(toneFor.rate(15, { good: 10, bad: 20 })).toBe("yellow")
    expect(toneFor.rate(25, { good: 10, bad: 20 })).toBe("red")
  })
})
