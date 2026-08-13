import { describe, expect, it } from "vitest"

import { Prisma } from "../../generated/prisma/client"
import { cashFlowContribution, compareRefs, movementOf } from "./statements.refs"

const D = (v: string | number) => new Prisma.Decimal(v)
const bal = (signed: string) => ({ debit: D(0), credit: D(0), signed: D(signed) })

describe("compareRefs", () => {
  it("orders 9.01 before 10.00", () => {
    expect(compareRefs("9.01", "10.00")).toBeLessThan(0)
    expect("9.01" < "10.00").toBe(false)
  })
  it("orders a sub-note after its parent", () => expect(compareRefs("16.00", "16.01")).toBeLessThan(0))
  it("handles three segments", () => expect(compareRefs("2.11.3", "2.11.10")).toBeLessThan(0))
  it("treats missing segments as zero", () => expect(compareRefs("2", "2.00")).toBe(0))
  it("sorts the filed sequence numerically", () => {
    const refs = ["17.00", "9.01", "2.11", "10.00", "4.00", "16.01", "16.00", "9.00"]
    expect([...refs].sort(compareRefs)).toEqual(["2.11", "4.00", "9.00", "9.01", "10.00", "16.00", "16.01", "17.00"])
  })
})

describe("movementOf", () => {
  it("returns signed movement", () => expect(movementOf(new Map([["a", bal("1500.00")]]), "a").toFixed(2)).toBe("1500.00"))
  it("defaults missing movement to zero", () => expect(movementOf(new Map(), "ghost").toFixed(2)).toBe("0.00"))
})

describe("cashFlowContribution", () => {
  it("negates debit-normal movement", () => expect(cashFlowContribution("ASSET", D("40000.00")).toFixed(2)).toBe("-40000.00"))
  it("passes credit-normal movement", () => expect(cashFlowContribution("LIABILITY", D("40000.00")).toFixed(2)).toBe("40000.00"))
  it("treats equity as credit-normal", () => expect(cashFlowContribution("EQUITY", D("1000000.00")).toFixed(2)).toBe("1000000.00"))
  it("turns an asset decrease into an inflow", () => expect(cashFlowContribution("ASSET", D("-40000.00")).toFixed(2)).toBe("40000.00"))
})
