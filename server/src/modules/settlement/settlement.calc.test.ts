import { describe, expect, it } from "vitest"

import { computePayslip } from "../payroll/payroll.calc"
import { dec } from "../payroll/payroll.money"
import { parseDateOnly } from "../../utils/dates"
import {
  completedServiceYears,
  computeGratuity,
  computeNoticePay,
  computePendingSalary,
  finalAmount,
  serviceYears,
  wagesBase,
} from "./settlement.calc"
import { EXIT_POLICIES } from "./settlement.policy"

const components = [
  { code: "HOUSE_RENT", label: "House rent", kind: "EARNING" as const, calc: "PERCENT_OF_BASIC" as const, value: dec(50), sortOrder: 1, countsAsWages: true },
  { code: "MEDICAL", label: "Medical", kind: "EARNING" as const, calc: "FIXED" as const, value: dec(3000), sortOrder: 2, countsAsWages: true },
  { code: "BONUS", label: "Attendance bonus", kind: "EARNING" as const, calc: "FIXED" as const, value: dec(2000), sortOrder: 3, countsAsWages: false },
  { code: "PF", label: "Provident fund", kind: "DEDUCTION" as const, calc: "PERCENT_OF_BASIC" as const, value: dec(10), sortOrder: 1, countsAsWages: false },
]

describe("serviceYears", () => {
  it("counts a whole number of years on the anniversary", () => {
    expect(serviceYears(parseDateOnly("2020-01-06"), parseDateOnly("2026-01-06")).toFixed(2)).toBe("6.00")
  })

  it("does not credit the final year one day early", () => {
    // Gratuity turns on *completed* years, so 5 January must still read 5.
    expect(completedServiceYears(parseDateOnly("2020-01-06"), parseDateOnly("2026-01-05"))).toBe(5)
  })

  it("reports a fraction mid-year", () => {
    const years = serviceYears(parseDateOnly("2020-01-06"), parseDateOnly("2026-07-06"))
    expect(years.toNumber()).toBeGreaterThan(6.4)
    expect(years.toNumber()).toBeLessThan(6.6)
    expect(completedServiceYears(parseDateOnly("2020-01-06"), parseDateOnly("2026-07-06"))).toBe(6)
  })

  it("is zero when the exit date precedes the joining date", () => {
    expect(serviceYears(parseDateOnly("2026-01-06"), parseDateOnly("2020-01-06")).toFixed(2)).toBe("0.00")
  })

  it("counts completed years independently of the rounded display figure", () => {
    // 2020-01-06 to 2026-01-05 is 5.997 years, which rounds to 6.00 for the
    // Decimal(5,2) column. Flooring *that* would credit a sixth year the
    // employee did not complete, and gratuity multiplies by exactly this
    // number — so the two must never be derived from one another.
    const joining = parseDateOnly("2020-01-06")
    const exit = parseDateOnly("2026-01-05")
    expect(serviceYears(joining, exit).toFixed(2)).toBe("6.00")
    expect(completedServiceYears(joining, exit)).toBe(5)
  })
})

describe("wagesBase", () => {
  it("sums basic and countsAsWages earnings only", () => {
    // Basic 50,000 + house rent 25,000 + medical 3,000. The attendance bonus
    // is excluded: §119 and §2(10) both exclude bonus from wages.
    expect(wagesBase(dec(50000), components).toFixed(2)).toBe("78000.00")
  })

  it("excludes deductions entirely", () => {
    const base = wagesBase(dec(50000), components)
    expect(base.toFixed(2)).not.toBe("73000.00")
  })

  // A flat structure has nothing to sum, so the negotiated monthly figure is
  // itself the base. Pinned because a settlement is the one place a
  // component-less structure could silently have produced zero.
  it("is the salary itself when the structure has no components", () => {
    expect(wagesBase(dec(50000), []).toFixed(2)).toBe("50000.00")
  })
})

describe("computeGratuity — the 30/45-day boundary", () => {
  const base = dec(78000)

  it("pays 30 days per year at 9 years", () => {
    const result = computeGratuity(base, 9, "RESIGNATION")
    expect(result.daysPerYear).toBe(30)
    expect(result.amount.toFixed(2)).toBe("702000.00")
  })

  it("still pays 30 days at exactly 10 years — the Act says *exceeds* ten", () => {
    // The most likely place to be off by one.
    const result = computeGratuity(base, 10, "RESIGNATION")
    expect(result.daysPerYear).toBe(30)
    expect(result.amount.toFixed(2)).toBe("780000.00")
  })

  it("pays 45 days at 11 years", () => {
    const result = computeGratuity(base, 11, "RESIGNATION")
    expect(result.daysPerYear).toBe(45)
    expect(result.amount.toFixed(2)).toBe("1287000.00")
  })

  it("uses completed years, ignoring the fraction", () => {
    const result = computeGratuity(base, 4, "RESIGNATION")
    expect(result.completedYears).toBe(4)
    expect(result.amount.toFixed(2)).toBe("312000.00")
  })

  it("pays nothing below one completed year, and says why", () => {
    const result = computeGratuity(base, 0, "RESIGNATION")
    expect(result.eligible).toBe(false)
    expect(result.amount.toFixed(2)).toBe("0.00")
    expect(result.reason).toContain("completed year")
  })

  it("shows its working rather than a bare number", () => {
    // A settlement is disputed far more often than a payslip.
    const result = computeGratuity(base, 4, "RESIGNATION")
    expect(result.reason).toBe("30 days × 4 completed year(s) on wages of 78000.00")
  })
})

describe("gratuity eligibility by exit reason", () => {
  it("forfeits on dismissal for misconduct, the ordinary §23 reading", () => {
    const result = computeGratuity(dec(78000), 6, "DISMISSAL")
    expect(result.eligible).toBe(false)
    expect(result.amount.toFixed(2)).toBe("0.00")
  })

  it.each(["RESIGNATION", "RETIREMENT", "TERMINATION", "DISCHARGE", "RETRENCHMENT", "CONTRACT_END", "DEATH"] as const)(
    "pays on %s",
    (reason) => {
      expect(computeGratuity(dec(78000), 6, reason).eligible).toBe(true)
    }
  )

  it("has a policy entry for every ExitReason, so none falls through", () => {
    const reasons = ["RESIGNATION", "RETIREMENT", "TERMINATION", "DISMISSAL", "DISCHARGE", "RETRENCHMENT", "CONTRACT_END", "DEATH"] as const
    for (const reason of reasons) {
      expect(EXIT_POLICIES[reason]).toBeDefined()
      expect(EXIT_POLICIES[reason].label).toBeTruthy()
    }
  })
})

describe("computeNoticePay", () => {
  it("pays 120 days for an employer termination with no notice served", () => {
    const result = computeNoticePay(dec(78000), "TERMINATION", false)
    expect(result.days).toBe(120)
    expect(result.amount.toFixed(2)).toBe("312000.00")
  })

  it("pays 60 days when a resigning worker does not serve notice", () => {
    const result = computeNoticePay(dec(78000), "RESIGNATION", false)
    expect(result.days).toBe(60)
    expect(result.amount.toFixed(2)).toBe("156000.00")
  })

  it("pays nothing when notice was served", () => {
    const result = computeNoticePay(dec(78000), "TERMINATION", true)
    expect(result.amount.toFixed(2)).toBe("0.00")
    expect(result.reason).toContain("served")
  })

  it("pays nothing for a reason carrying no notice period", () => {
    expect(computeNoticePay(dec(78000), "RETIREMENT", false).amount.toFixed(2)).toBe("0.00")
  })
})

describe("computePendingSalary", () => {
  it("equals what computePayslip returns for the same day count — the reuse assertion", () => {
    // A final partial month IS a payslip with a truncated payable-day count.
    // If these ever diverge, one implementation is wrong and nobody notices.
    const settlement = computePendingSalary({
      basic: dec(50000),
      components,
      calendarDays: 31,
      daysEmployed: 15,
      lopDays: 0,
      workingDays: 13,
      present: 13,
      onPaidLeave: 0,
    })
    const payslip = computePayslip({
      basic: dec(50000),
      components,
      adjustments: [],
      reimbursements: [],
      calendarDays: 31,
      workingDays: 13,
      present: 13,
      absent: 16,
      onPaidLeave: 0,
      onUnpaidLeave: 0,
    })
    expect(settlement.grossPay.equals(payslip.grossPay)).toBe(true)
    expect(settlement.netPay.equals(payslip.netPay)).toBe(true)
  })

  it("pays 15 of 31 days for a mid-month exit", () => {
    const result = computePendingSalary({
      basic: dec(50000),
      components,
      calendarDays: 31,
      daysEmployed: 15,
      lopDays: 0,
      workingDays: 13,
      present: 13,
      onPaidLeave: 0,
    })
    expect(result.payableDays.toFixed(2)).toBe("15.00")
    // grossFull 80,000 (50,000 + 25,000 + 3,000 + 2,000) × 15/31
    expect(result.grossPay.toFixed(2)).toBe("38709.68")
  })

  it("charges loss-of-pay days inside the employed span too", () => {
    const withLop = computePendingSalary({
      basic: dec(50000),
      components,
      calendarDays: 31,
      daysEmployed: 15,
      lopDays: 3,
      workingDays: 13,
      present: 10,
      onPaidLeave: 0,
    })
    expect(withLop.payableDays.toFixed(2)).toBe("12.00")
  })

  it("pays a full month when the exit falls on the last day", () => {
    const result = computePendingSalary({
      basic: dec(50000),
      components,
      calendarDays: 31,
      daysEmployed: 31,
      lopDays: 0,
      workingDays: 27,
      present: 27,
      onPaidLeave: 0,
    })
    expect(result.payableDays.toFixed(2)).toBe("31.00")
    expect(result.grossPay.equals(result.grossFull)).toBe(true)
  })
})

describe("finalAmount", () => {
  it("sums every head and subtracts outstanding deductions", () => {
    const total = finalAmount({
      pendingSalary: dec("38709.68"),
      gratuity: dec("312000.00"),
      noticePay: dec("156000.00"),
      expenseReimbursement: dec("1200.00"),
      leaveEncashment: dec(0),
      outstandingDeductions: dec("5000.00"),
    })
    expect(total.toFixed(2)).toBe("502909.68")
  })

  it("can go negative when deductions exceed the heads, rather than clamping", () => {
    // Same reasoning as a negative netPay: clamping hides a real data error.
    const total = finalAmount({
      pendingSalary: dec("1000.00"),
      gratuity: dec(0),
      noticePay: dec(0),
      expenseReimbursement: dec(0),
      leaveEncashment: dec(0),
      outstandingDeductions: dec("5000.00"),
    })
    expect(total.toFixed(2)).toBe("-4000.00")
  })

  it("treats leaveEncashment as zero this phase", () => {
    const total = finalAmount({
      pendingSalary: dec("1000.00"),
      gratuity: dec(0),
      noticePay: dec(0),
      expenseReimbursement: dec(0),
      leaveEncashment: dec(0),
      outstandingDeductions: dec(0),
    })
    expect(total.toFixed(2)).toBe("1000.00")
  })
})
