import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { assertBalanced } from "../accounting/accounting.utils"
import type { ResolvedRules } from "../posting/posting.types"
import {
  buildSettlementAccrualLines,
  buildSettlementPaymentLines,
  type SettlementForPosting,
} from "./settlement.posting"

const D = (v: string) => new Prisma.Decimal(v)

const accrualRules: ResolvedRules = {
  event: "SETTLEMENT_ACCRUAL",
  byKey: new Map([
    ["ADMINISTRATIVE:BASIC", "5201"], ["DIRECT:BASIC", "5122"],
    ["ADMINISTRATIVE:LEAVE_ENCASHMENT", "5201"], ["DIRECT:LEAVE_ENCASHMENT", "5122"],
    ["GRATUITY", "5220"], ["NOTICE_PAY", "5221"], ["REIMBURSEMENT", "2135"],
    ["ADVANCE_RECOVERY", "1250"], ["NET_PAY", "2132"],
  ]),
}
const paymentRules: ResolvedRules = {
  event: "SETTLEMENT_PAYMENT",
  byKey: new Map([["NET_PAY", "2132"], ["BANK", "1242"]]),
}

function settlement(over: Partial<SettlementForPosting> = {}): SettlementForPosting {
  return {
    id: "s1", employeeId: "e1", employeeCode: "BS-EMP-001", employeeName: "Ayesha Rahman",
    departmentId: "d1", costNature: "ADMINISTRATIVE",
    currency: "BDT", fxRateToBdt: D("1"),
    pendingSalary: D("1000.00"), gratuity: D("500.00"), noticePay: D("200.00"),
    expenseReimbursement: D("100.00"), leaveEncashment: D("0"),
    outstandingDeductions: D("300.00"), finalAmountBdt: D("1500.00"),
    ...over,
  }
}

const balanced = (lines: ReturnType<typeof buildSettlementAccrualLines>) =>
  assertBalanced(lines.map((l) => ({ debit: D(l.debit ?? "0"), credit: D(l.credit ?? "0") })))

const sum = (lines: ReturnType<typeof buildSettlementAccrualLines>, side: "debit" | "credit") =>
  lines.reduce((t, l) => t.plus(l[side] ?? 0), D("0"))

describe("buildSettlementAccrualLines", () => {
  it("debits each head to its own account and credits the recovery and the payable", () => {
    const lines = buildSettlementAccrualLines(settlement(), accrualRules)

    expect(lines.map((l) => [l.accountCode, l.debit ?? `(${l.credit})`])).toEqual([
      ["5201", "1000.00"],
      ["5220", "500.00"],
      ["5221", "200.00"],
      ["2135", "100.00"],
      ["1250", "(300.00)"],
      ["2132", "(1500.00)"],
    ])
    expect(() => balanced(lines)).not.toThrow()
  })

  it("balances by construction — the heads less the recovery are the final amount", () => {
    const lines = buildSettlementAccrualLines(settlement(), accrualRules)
    expect(sum(lines, "debit").toFixed(2)).toBe(sum(lines, "credit").toFixed(2))
  })

  it("omits a head that is nil rather than posting a zero line", () => {
    const lines = buildSettlementAccrualLines(
      settlement({ gratuity: D("0"), noticePay: D("0"), finalAmountBdt: D("800.00") }),
      accrualRules
    )

    expect(lines.map((l) => l.accountCode)).not.toContain("5220")
    expect(() => balanced(lines)).not.toThrow()
  })

  /**
   * The regression. Heads are stored in `Settlement.currency` while
   * `finalAmountBdt` is the converted total, so debiting the heads raw and
   * crediting `finalAmountBdt` balanced only when the currency happened to be
   * BDT. A USD settlement was refused outright — and would have been the
   * wrong figure anyway, the ledger being BDT only.
   */
  it("converts a foreign-currency settlement to BDT at its frozen rate", () => {
    const lines = buildSettlementAccrualLines(
      settlement({ currency: "USD", fxRateToBdt: D("122.50"), finalAmountBdt: D("183750.00") }),
      accrualRules
    )

    expect(lines.find((l) => l.accountCode === "5201")?.debit).toBe("122500.00")
    expect(lines.find((l) => l.accountCode === "5220")?.debit).toBe("61250.00")
    expect(lines.find((l) => l.accountCode === "1250")?.credit).toBe("36750.00")
    expect(lines.find((l) => l.accountCode === "2132")?.credit).toBe("183750.00")
    expect(() => balanced(lines)).not.toThrow()
  })

  it("carries the original figure as a memo on a converted line", () => {
    const lines = buildSettlementAccrualLines(
      settlement({ currency: "USD", fxRateToBdt: D("122.50"), finalAmountBdt: D("183750.00") }),
      accrualRules
    )

    expect(lines[0]).toMatchObject({ sourceCurrency: "USD", sourceAmount: "1000.00", fxRateToBdt: "122.500000" })
  })

  it("carries no memo on a BDT settlement", () => {
    expect(buildSettlementAccrualLines(settlement(), accrualRules)[0].sourceCurrency).toBeUndefined()
  })

  it("still ties when the rate makes every head round", () => {
    // Three heads that cannot each convert cleanly. The debits must still
    // reach finalAmountBdt exactly, or assertBalanced refuses the journal.
    const lines = buildSettlementAccrualLines(
      settlement({
        currency: "USD", fxRateToBdt: D("122.37"),
        pendingSalary: D("333.33"), gratuity: D("333.33"), noticePay: D("333.34"),
        expenseReimbursement: D("0"), outstandingDeductions: D("0"),
        finalAmountBdt: D("122370.00"),
      }),
      accrualRules
    )

    expect(sum(lines, "debit").toFixed(2)).toBe("122370.00")
    expect(() => balanced(lines)).not.toThrow()
  })

  it("puts leave encashment on its own rule key, not on salary's", () => {
    const lines = buildSettlementAccrualLines(
      settlement({ leaveEncashment: D("400.00"), finalAmountBdt: D("1900.00") }),
      accrualRules
    )

    expect(lines.find((l) => l.narration === "Leave encashment")).toMatchObject({ debit: "400.00" })
    expect(() => balanced(lines)).not.toThrow()
  })

  it("splits a direct employee's final salary to cost of sales", () => {
    const lines = buildSettlementAccrualLines(settlement({ costNature: "DIRECT" }), accrualRules)
    expect(lines[0].accountCode).toBe("5122")
  })
})

describe("buildSettlementPaymentLines", () => {
  it("clears the payable against the bank in BDT", () => {
    const lines = buildSettlementPaymentLines(
      settlement({ currency: "USD", fxRateToBdt: D("122.50"), finalAmountBdt: D("183750.00") }),
      paymentRules
    )

    expect(lines).toMatchObject([
      { accountCode: "2132", debit: "183750.00" },
      { accountCode: "1242", credit: "183750.00" },
    ])
    expect(() => balanced(lines)).not.toThrow()
  })
})
