import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { dec } from "../payroll/payroll.money"
import type { ResolvedRules } from "../posting/posting.types"
import { buildDepreciationLines } from "./depreciation.posting"
import type { ComputedCharge } from "./depreciation.compute"

const D = (v: string) => new Prisma.Decimal(v)

const rules: ResolvedRules = {
  event: "ASSET_DEPRECIATION",
  byKey: new Map([
    ["DIRECT", "5128"],
    ["ADMINISTRATIVE", "5215"],
  ]),
}

const contra = new Map<string, string>([
  ["1111", "1121"],
  ["1112", "1122"],
  ["1113", "1123"],
  ["1114", "1124"],
])

const charge = (over: Partial<ComputedCharge> = {}): ComputedCharge => ({
  assetId: "a-1",
  amount: D("100.00"),
  openingBookValue: D("1000.00"),
  rate: D("20.00"),
  months: 1,
  classAccountCode: "1114",
  costNature: "ADMINISTRATIVE",
  ...over,
})

describe("buildDepreciationLines", () => {
  it("aggregates a hundred assets into two lines per class", () => {
    const charges = Array.from({ length: 100 }, (_, i) => charge({ assetId: `a-${i}`, amount: dec(100) }))
    const lines = buildDepreciationLines(charges, contra, rules)
    expect(lines).toHaveLength(2)
    expect(lines[0]).toMatchObject({ accountCode: "5215", debit: "10000.00" })
    expect(lines[1]).toMatchObject({ accountCode: "1124", credit: "10000.00" })
  })

  it("splits the debit by the owning department's cost nature", () => {
    const lines = buildDepreciationLines(
      [charge({ costNature: "DIRECT", amount: dec(300) }), charge({ costNature: "ADMINISTRATIVE", amount: dec(700) })],
      contra, rules
    )
    expect(lines.find((l) => l.accountCode === "5128")?.debit).toBe("300.00")
    expect(lines.find((l) => l.accountCode === "5215")?.debit).toBe("700.00")
  })

  it("credits each class its own accumulated-depreciation contra", () => {
    const lines = buildDepreciationLines(
      [charge({ classAccountCode: "1111", amount: dec(100) }), charge({ classAccountCode: "1114", amount: dec(200) })],
      contra, rules
    )
    expect(lines.find((l) => l.accountCode === "1121")?.credit).toBe("100.00")
    expect(lines.find((l) => l.accountCode === "1124")?.credit).toBe("200.00")
  })

  it("balances", () => {
    const lines = buildDepreciationLines(
      [charge({ costNature: "DIRECT", amount: dec(300) }), charge({ costNature: "ADMINISTRATIVE", amount: dec(700) })],
      contra, rules
    )
    const d = lines.reduce((t, l) => t.plus(l.debit ?? 0), dec(0))
    const c = lines.reduce((t, l) => t.plus(l.credit ?? 0), dec(0))
    expect(d.toFixed(2)).toBe(c.toFixed(2))
  })

  it("throws naming the class when it has no linked contra account", () => {
    expect(() => buildDepreciationLines([charge({ classAccountCode: "1115" })], contra, rules)).toThrow(/1115/)
  })
})
