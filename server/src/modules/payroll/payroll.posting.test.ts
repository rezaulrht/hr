import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { assertBalanced } from "../accounting/accounting.utils"
import type { ResolvedRules } from "../posting/posting.types"
import { buildAccrualLines, buildPaymentLines, type PayslipForPosting } from "./payroll.posting"

const D = (v: string) => new Prisma.Decimal(v)

const accrualRules: ResolvedRules = {
  event: "PAYROLL_ACCRUAL",
  byKey: new Map([
    ["DIRECT:BASIC", "5122"], ["ADMINISTRATIVE:BASIC", "5201"],
    ["DIRECT:FESTIVAL_BONUS", "5123"], ["ADMINISTRATIVE:FESTIVAL_BONUS", "5202"],
    ["DIRECT:*", "5122"], ["ADMINISTRATIVE:*", "5201"],
    ["DEDUCTION:TDS", "2140"], ["DEDUCTION:*", "2132"], ["NET_PAY", "2132"],
  ]),
}
const paymentRules: ResolvedRules = {
  event: "PAYROLL_PAYMENT",
  byKey: new Map([["NET_PAY", "2132"], ["REIMBURSEMENT", "2135"], ["BANK", "1242"]]),
}

function payslip(over: Partial<PayslipForPosting> = {}): PayslipForPosting {
  return {
    id: "p1", employeeId: "e1", departmentId: "d1", costNature: "ADMINISTRATIVE",
    currency: "BDT", fxRateToBdt: D("1"),
    grossPayBdt: D("80000.00"), totalDeductionsBdt: D("5000.00"),
    netPayBdt: D("75000.00"), netPayableBdt: D("75000.00"),
    breakdown: {
      earnings: [{ code: "BASIC", label: "Basic", amount: "80000.00" }],
      deductions: [{ code: "TDS", label: "Tax deducted", amount: "5000.00" }],
      adjustments: [],
      reimbursements: [],
    },
    ...over,
  }
}

/** Every builder's output goes through the same rule a typed journal does. */
const balanced = (lines: ReturnType<typeof buildAccrualLines>) =>
  assertBalanced(lines.map((l) => ({ debit: D(l.debit ?? "0"), credit: D(l.credit ?? "0") })))

const totals = (lines: ReturnType<typeof buildAccrualLines>) =>
  lines.reduce(
    (t, l) => ({ debit: t.debit.plus(l.debit ?? 0), credit: t.credit.plus(l.credit ?? 0) }),
    { debit: D("0"), credit: D("0") }
  )

describe("buildAccrualLines", () => {
  it("debits earnings by cost nature and credits deductions and net pay", () => {
    const lines = buildAccrualLines([payslip()], accrualRules)

    expect(lines.map((l) => [l.accountCode, l.debit ?? `(${l.credit})`])).toEqual([
      ["5201", "80000.00"],
      ["2140", "(5000.00)"],
      ["2132", "(75000.00)"],
    ])
    expect(() => balanced(lines)).not.toThrow()
  })

  it("splits direct labour from overhead on the department's cost nature", () => {
    const lines = buildAccrualLines(
      [payslip({ costNature: "DIRECT" }), payslip({ id: "p2", employeeId: "e2" })],
      accrualRules
    )

    expect(lines.filter((l) => l.debit).map((l) => l.accountCode)).toEqual(["5122", "5201"])
  })

  it("routes a festival bonus to its own account, not to salary", () => {
    const lines = buildAccrualLines(
      [
        payslip({
          grossPayBdt: D("90000.00"),
          netPayBdt: D("85000.00"),
          netPayableBdt: D("85000.00"),
          breakdown: {
            earnings: [{ code: "BASIC", label: "Basic", amount: "80000.00" }],
            deductions: [{ code: "TDS", label: "Tax", amount: "5000.00" }],
            adjustments: [{ code: "FESTIVAL_BONUS", label: "Eid bonus", amount: "10000.00", kind: "EARNING" }],
            reimbursements: [],
          },
        }),
      ],
      accrualRules
    )

    expect(lines.find((l) => l.accountCode === "5202")?.debit).toBe("10000.00")
    expect(() => balanced(lines)).not.toThrow()
  })

  it("sends an unmapped deduction to the deduction fallback, never to the earnings one", () => {
    const lines = buildAccrualLines(
      [
        payslip({
          breakdown: {
            earnings: [{ code: "BASIC", label: "Basic", amount: "80000.00" }],
            deductions: [{ code: "PF", label: "Provident fund", amount: "5000.00" }],
            adjustments: [],
            reimbursements: [],
          },
        }),
      ],
      accrualRules
    )

    // 2132 Salary Payable via DEDUCTION:*, not 5201 via a bare fallback.
    expect(lines.find((l) => l.narration === "PF")).toMatchObject({ accountCode: "2132", credit: "5000.00" })
  })

  /**
   * The regression that made every run with an absent employee unpostable.
   * `computePayslip` appends a NEGATIVE LOP_ADJUSTMENT earnings line so the
   * full-month figures on the payslip reconcile to the pro-rated gross;
   * posting it as a debit tripped "an amount cannot be negative".
   */
  it("posts a loss-of-pay adjustment as a credit, not as a negative debit", () => {
    const lines = buildAccrualLines(
      [
        payslip({
          grossPayBdt: D("72258.06"), totalDeductionsBdt: D("7500.00"),
          netPayBdt: D("64758.06"), netPayableBdt: D("64758.06"),
          breakdown: {
            earnings: [
              { code: "BASIC", label: "Basic", amount: "80000.00" },
              { code: "LOP_ADJUSTMENT", label: "Loss of pay (3.00 of 31 days)", amount: "-7741.94" },
            ],
            deductions: [{ code: "TDS", label: "Tax", amount: "7500.00" }],
            adjustments: [],
            reimbursements: [],
          },
        }),
      ],
      accrualRules
    )

    const lop = lines.find((l) => l.narration === "LOP_ADJUSTMENT")!
    expect(lop).toMatchObject({ accountCode: "5201", credit: "7741.94" })
    expect(lop.debit).toBeUndefined()
    expect(() => balanced(lines)).not.toThrow()

    // And the salary account still nets to the pro-rated figure.
    const salary = lines.filter((l) => l.accountCode === "5201")
    const net = salary.reduce((t, l) => t.plus(l.debit ?? 0).minus(l.credit ?? 0), D("0"))
    expect(net.toFixed(2)).toBe("72258.06")
  })

  it("converts a foreign-currency payslip and ties it to the frozen BDT total", () => {
    const lines = buildAccrualLines(
      [
        payslip({
          currency: "USD", fxRateToBdt: D("122.50"),
          grossPayBdt: D("612500.00"), totalDeductionsBdt: D("61250.00"),
          netPayBdt: D("551250.00"), netPayableBdt: D("551250.00"),
          breakdown: {
            earnings: [
              { code: "BASIC", label: "Basic", amount: "4000.00" },
              { code: "HOUSING", label: "Housing", amount: "1000.00" },
            ],
            deductions: [{ code: "TDS", label: "Tax", amount: "500.00" }],
            adjustments: [],
            reimbursements: [],
          },
        }),
      ],
      accrualRules
    )

    expect(totals(lines).debit.toFixed(2)).toBe("612500.00")
    expect(() => balanced(lines)).not.toThrow()
    // Decision 14: the memo answers "why 490,000?" with "USD 4,000 at 122.50".
    expect(lines[0]).toMatchObject({ sourceCurrency: "USD", sourceAmount: "4000.00", fxRateToBdt: "122.500000" })
  })

  it("carries no FX memo on a BDT payslip", () => {
    expect(buildAccrualLines([payslip()], accrualRules)[0].sourceCurrency).toBeUndefined()
  })

  it("stamps employee and department on every line, for the analysis dimensions", () => {
    for (const line of buildAccrualLines([payslip()], accrualRules)) {
      expect(line).toMatchObject({ employeeId: "e1", departmentId: "d1" })
    }
  })

  it("balances a whole run of mixed payslips", () => {
    const lines = buildAccrualLines(
      [payslip(), payslip({ id: "p2", employeeId: "e2", costNature: "DIRECT" })],
      accrualRules
    )

    expect(() => balanced(lines)).not.toThrow()
    expect(totals(lines).debit.toFixed(2)).toBe("160000.00")
  })
})

describe("buildPaymentLines", () => {
  it("clears salary payable against the bank", () => {
    const lines = buildPaymentLines([payslip()], paymentRules)

    expect(lines.map((l) => [l.accountCode, l.debit ?? `(${l.credit})`])).toEqual([
      ["2132", "75000.00"],
      ["1242", "(75000.00)"],
    ])
    expect(() => balanced(lines)).not.toThrow()
  })

  it("clears the reimbursement liability the claim accrual raised", () => {
    // Decision 8: a claim is expensed on approval against 2135. Payroll
    // clears 2135; it never expenses the same taxi fare twice.
    const lines = buildPaymentLines([payslip({ netPayableBdt: D("76200.00") })], paymentRules)

    expect(lines.find((l) => l.accountCode === "2135")).toMatchObject({ debit: "1200.00" })
    expect(lines.find((l) => l.accountCode === "1242")).toMatchObject({ credit: "76200.00" })
    expect(() => balanced(lines)).not.toThrow()
  })

  it("credits the bank once for the whole run, not once per employee", () => {
    const lines = buildPaymentLines(
      [payslip(), payslip({ id: "p2", employeeId: "e2" })],
      paymentRules
    )

    const bank = lines.filter((l) => l.accountCode === "1242")
    expect(bank).toHaveLength(1)
    expect(bank[0].credit).toBe("150000.00")
  })
})
