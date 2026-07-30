import { describe, expect, it } from "vitest"

import {
  dec,
  fromBdt,
  ONE,
  percentOf,
  prorate,
  REPORTING_CURRENCY,
  round2,
  sum,
  toBdt,
  toMoneyString,
  ZERO,
} from "./payroll.money"

describe("round2", () => {
  it("rounds half up at .005", () => {
    expect(round2(dec("2.005")).toFixed(2)).toBe("2.01")
    expect(round2(dec("2.004")).toFixed(2)).toBe("2.00")
  })

  it("rounds a negative away from zero, matching the positive case", () => {
    // A deduction should round the same direction as the equivalent earning,
    // not quietly favour whichever side of zero it landed on.
    expect(round2(dec("-2.005")).toFixed(2)).toBe("-2.01")
  })

  it("leaves a value already at 2dp alone", () => {
    expect(round2(dec("1234.56")).toFixed(2)).toBe("1234.56")
  })
})

describe("sum", () => {
  it("is 0 for an empty list, not NaN", () => {
    // A structure with no deduction components is legal, and its total has to
    // be a number the rest of the calculation can keep using.
    expect(sum([]).equals(ZERO)).toBe(true)
  })

  it("adds without float error — the test that fails on `number`", () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point.
    expect(sum([dec("0.1"), dec("0.2")]).equals(dec("0.3"))).toBe(true)
  })

  it("stays exact across many small values", () => {
    const tenth = Array.from({ length: 10 }, () => dec("0.1"))
    expect(sum(tenth).equals(ONE)).toBe(true)
  })
})

describe("percentOf", () => {
  it("gives exactly 5000.00 for 10% of 50000", () => {
    expect(percentOf(dec(50000), dec(10)).toFixed(2)).toBe("5000.00")
  })

  it("handles the 50% house-rent convention", () => {
    expect(percentOf(dec(50000), dec(50)).toFixed(2)).toBe("25000.00")
  })

  it("rounds a fractional result to 2dp", () => {
    expect(percentOf(dec("1000"), dec("3.333")).toFixed(2)).toBe("33.33")
  })
})

describe("prorate", () => {
  it("reproduces the spec's worked example exactly", () => {
    // 80,000 over 28 payable of 31 calendar days. If this drifts, the spec
    // and the code disagree and one of them is wrong.
    expect(prorate(dec(80000), dec(28), dec(31)).toFixed(2)).toBe("72258.06")
  })

  it("returns the full amount when every day is payable", () => {
    expect(prorate(dec(80000), dec(31), dec(31)).toFixed(2)).toBe("80000.00")
  })

  it("returns zero for a full month of loss of pay", () => {
    expect(prorate(dec(80000), ZERO, dec(31)).toFixed(2)).toBe("0.00")
  })

  it("gives a different per-day rate in February than in July", () => {
    // The same salary and the same number of payable days produce different
    // money, because the denominator is the real month length.
    const feb = prorate(dec(28000), dec(14), dec(28))
    const jul = prorate(dec(28000), dec(14), dec(31))
    expect(feb.toFixed(2)).toBe("14000.00")
    expect(jul.toFixed(2)).toBe("12645.16")
  })
})

describe("toMoneyString", () => {
  it("always emits 2dp, including for a whole number", () => {
    expect(toMoneyString(dec(50000))).toBe("50000.00")
    expect(toMoneyString(dec("0"))).toBe("0.00")
  })

  it("rounds before formatting rather than truncating", () => {
    expect(toMoneyString(dec("1.005"))).toBe("1.01")
  })
})

describe("currency conversion", () => {
  it("multiplies to BDT and divides back", () => {
    expect(toBdt(dec(2000), dec("122.5")).toFixed(2)).toBe("245000.00")
    expect(fromBdt(dec(245000), dec("122.5")).toFixed(2)).toBe("2000.00")
  })

  it("round-trips exactly for a range of amounts and rates", () => {
    // The guarantee the single-stored-direction rule exists to provide: both
    // directions derive from one number, so they cannot drift. Storing
    // 122.500000 and 0.008163 as separate rows would lose money here.
    const amounts = ["0.01", "1", "1234.56", "2000", "99999.99", "50000.55"]
    const rates = ["122.5", "122.456789", "1", "3.333333"]
    for (const a of amounts) {
      for (const r of rates) {
        const x = dec(a)
        expect(fromBdt(toBdt(x, dec(r)), dec(r)).equals(x)).toBe(true)
      }
    }
  })

  it("is the identity at a rate of 1, so a BDT payslip needs no branch", () => {
    expect(toBdt(dec("1234.56"), ONE).equals(dec("1234.56"))).toBe(true)
    expect(fromBdt(dec("1234.56"), ONE).equals(dec("1234.56"))).toBe(true)
  })

  it("does not round, leaving that to the caller", () => {
    // Rounding here would break the round trip above for a stored-inverse
    // rate, which is the concrete failure the single-direction rule prevents.
    expect(toBdt(dec("0.01"), dec("122.456789")).toFixed(6)).toBe("1.224568")
  })
})

describe("REPORTING_CURRENCY", () => {
  it("is BDT", () => {
    expect(REPORTING_CURRENCY).toBe("BDT")
  })
})
