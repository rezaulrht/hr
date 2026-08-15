import { describe, expect, it } from "vitest"
import { resolveAccountCode } from "./posting.rules"
import { POSTING_RULES, REQUIRED_KEYS } from "./posting.rules.seed"
import { POSTING_EVENTS } from "./posting.types"
import type { ResolvedRules } from "./posting.types"
const rules = (entries: Array<[string, string]>): ResolvedRules => ({ event: "PAYROLL_ACCRUAL", byKey: new Map(entries) })
describe("resolveAccountCode", () => {
  it("uses exact, prefix, then bare fallback", () => { const r = rules([["DIRECT:BASIC", "5122"], ["DIRECT:*", "5199"], ["*", "5201"]]); expect(resolveAccountCode(r, "DIRECT:BASIC")).toBe("5122"); expect(resolveAccountCode(r, "DIRECT:OVERTIME")).toBe("5199"); expect(resolveAccountCode(r, "OTHER:X")).toBe("5201") })
  it("does not route deductions to earnings", () => { const r = rules([["DEDUCTION:*", "2132"], ["*", "5201"]]); expect(resolveAccountCode(r, "DEDUCTION:PF")).toBe("2132") })
  it("throws naming an unresolved event and key", () => { expect(() => resolveAccountCode(rules([]), "BANK")).toThrow(/PAYROLL_ACCRUAL.*BANK/) })
})

describe("posting rule defaults", () => {
  it("provides a settlement account for each required cost nature", () => {
    for (const key of REQUIRED_KEYS.SETTLEMENT_ACCRUAL) {
      if (key.endsWith(":BASIC")) {
        expect(POSTING_RULES).toContainEqual(expect.objectContaining({ event: "SETTLEMENT_ACCRUAL", key }))
      }
    }
  })
})

describe("asset posting rules", () => {
  it("seeds every key the asset events require", () => {
    for (const event of ["ASSET_ACQUISITION", "ASSET_PAYMENT", "ASSET_DEPRECIATION", "ASSET_DISPOSAL"] as const) {
      expect(POSTING_EVENTS).toContain(event)
      for (const key of REQUIRED_KEYS[event]) {
        expect(POSTING_RULES.some((r) => r.event === event && r.key === key)).toBe(true)
      }
    }
  })

  /**
   * Spec Decision 2. A chair capitalised as a laptop is invisible until
   * Annexure-A is read by somebody who knows the company, so an unmapped
   * category must stop rather than land on a default.
   */
  it("gives ASSET_ACQUISITION no bare wildcard", () => {
    expect(POSTING_RULES.some((r) => r.event === "ASSET_ACQUISITION" && r.key === "*")).toBe(false)
  })

  /**
   * 4200 Other Income and 5200 Administrative & Selling are groups, and
   * postSystemJournal refuses to post to a group. Every rule must name a leaf.
   */
  it("points the disposal rules at leaf accounts", () => {
    const disposal = POSTING_RULES.filter((r) => r.event === "ASSET_DISPOSAL")
    expect(disposal.find((r) => r.key === "GAIN")?.account).toBe("4290")
    expect(disposal.find((r) => r.key === "LOSS")?.account).toBe("5217")
    // Introduced in Task 5, where the need becomes visible: a disposal with
    // proceeds throws at runtime without BANK.
    expect(disposal.find((r) => r.key === "BANK")?.account).toBe("1242")
  })
})
