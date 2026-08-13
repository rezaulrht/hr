import { describe, expect, it } from "vitest"
import { resolveAccountCode } from "./posting.rules"
import type { ResolvedRules } from "./posting.types"
const rules = (entries: Array<[string, string]>): ResolvedRules => ({ event: "PAYROLL_ACCRUAL", byKey: new Map(entries) })
describe("resolveAccountCode", () => {
  it("uses exact, prefix, then bare fallback", () => { const r = rules([["DIRECT:BASIC", "5122"], ["DIRECT:*", "5199"], ["*", "5201"]]); expect(resolveAccountCode(r, "DIRECT:BASIC")).toBe("5122"); expect(resolveAccountCode(r, "DIRECT:OVERTIME")).toBe("5199"); expect(resolveAccountCode(r, "OTHER:X")).toBe("5201") })
  it("does not route deductions to earnings", () => { const r = rules([["DEDUCTION:*", "2132"], ["*", "5201"]]); expect(resolveAccountCode(r, "DEDUCTION:PF")).toBe("2132") })
  it("throws naming an unresolved event and key", () => { expect(() => resolveAccountCode(rules([]), "BANK")).toThrow(/PAYROLL_ACCRUAL.*BANK/) })
})
