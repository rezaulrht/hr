import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { assertBalanced } from "../accounting/accounting.utils"
import type { ResolvedRules } from "../posting/posting.types"
import { buildClaimAccrualLines, type ClaimForPosting } from "./expense.posting"

const D = (v: string) => new Prisma.Decimal(v)

const rules: ResolvedRules = {
  event: "EXPENSE_ACCRUAL",
  byKey: new Map([
    ["TRAVEL", "5208"], ["ENTERTAINMENT", "5205"], ["*", "5217"], ["REIMBURSEMENT", "2135"],
  ]),
}

function claim(over: Partial<ClaimForPosting> = {}): ClaimForPosting {
  return {
    id: "c1", employeeId: "e1", departmentId: "d1", categoryCode: "TRAVEL",
    currency: "BDT", amount: D("1200.00"), fxRateToBdt: null,
    description: "Client visit, Chattogram",
    ...over,
  }
}

const balanced = (lines: ReturnType<typeof buildClaimAccrualLines>) =>
  assertBalanced(lines.map((l) => ({ debit: D(l.debit ?? "0"), credit: D(l.credit ?? "0") })))

describe("buildClaimAccrualLines", () => {
  it("debits the category account and credits the reimbursement liability", () => {
    // Decision 8: a claim is a liability the moment it is approved. There is
    // no expense *payment* event — payroll clears 2135 later — because
    // expensing it twice is what that would do.
    const lines = buildClaimAccrualLines(claim(), rules)

    expect(lines).toMatchObject([
      { accountCode: "5208", debit: "1200.00" },
      { accountCode: "2135", credit: "1200.00" },
    ])
    expect(() => balanced(lines)).not.toThrow()
  })

  it("falls back to miscellaneous for a category with no rule of its own", () => {
    expect(buildClaimAccrualLines(claim({ categoryCode: "TRAINING" }), rules)[0].accountCode).toBe("5217")
  })

  it("converts a foreign-currency claim at its frozen rate", () => {
    const lines = buildClaimAccrualLines(
      claim({ currency: "USD", amount: D("50.00"), fxRateToBdt: D("122.50") }),
      rules
    )

    expect(lines[0].debit).toBe("6125.00")
    expect(lines[1].credit).toBe("6125.00")
    expect(() => balanced(lines)).not.toThrow()
  })

  it("carries the original figure as a memo on a converted claim", () => {
    const lines = buildClaimAccrualLines(
      claim({ currency: "USD", amount: D("50.00"), fxRateToBdt: D("122.50") }),
      rules
    )

    expect(lines[0]).toMatchObject({ sourceCurrency: "USD", sourceAmount: "50.00", fxRateToBdt: "122.500000" })
  })

  it("carries no memo on a BDT claim", () => {
    expect(buildClaimAccrualLines(claim(), rules)[0].sourceCurrency).toBeUndefined()
  })

  it("treats a missing rate as one rather than dropping the claim", () => {
    const lines = buildClaimAccrualLines(claim({ fxRateToBdt: null }), rules)
    expect(lines[0].debit).toBe("1200.00")
  })

  it("stamps employee and department for the analysis dimensions", () => {
    for (const line of buildClaimAccrualLines(claim(), rules)) {
      expect(line).toMatchObject({ employeeId: "e1", departmentId: "d1" })
    }
  })

  it("puts the claim description on the expense line", () => {
    expect(buildClaimAccrualLines(claim(), rules)[0].narration).toBe("Client visit, Chattogram")
  })
})
