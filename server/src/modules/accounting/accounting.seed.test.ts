import { describe, expect, it } from "vitest"

import { CHART } from "./accounting.seed"
import { validateAccountCode } from "./accounting.utils"

describe("CHART", () => {
  it("gives every account a code whose first digit matches its type", () => {
    for (const entry of CHART) {
      expect(() => validateAccountCode(entry.code, entry.type)).not.toThrow()
    }
  })

  it("has no duplicate codes", () => {
    const codes = CHART.map((e) => e.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it("lists every parent before its children, so a single ordered pass can create them", () => {
    const seen = new Set<string>()
    for (const entry of CHART) {
      if (entry.parent) expect(seen.has(entry.parent)).toBe(true)
      seen.add(entry.code)
    }
  })

  it("only ever parents an account to a group", () => {
    const groups = new Set(CHART.filter((e) => e.isGroup).map((e) => e.code))
    for (const entry of CHART) {
      if (entry.parent) expect(groups.has(entry.parent)).toBe(true)
    }
  })

  it("never puts a child under a parent of a different type", () => {
    const typeByCode = new Map(CHART.map((e) => [e.code, e.type]))
    for (const entry of CHART) {
      if (entry.parent) expect(typeByCode.get(entry.parent)).toBe(entry.type)
    }
  })

  it("defines each system role exactly once", () => {
    const roles = CHART.map((e) => e.systemRole).filter(Boolean)
    expect(new Set(roles).size).toBe(roles.length)
  })

  it("carries the thirteen roles the statements and year-end depend on", () => {
    const roles = new Set(CHART.map((e) => e.systemRole).filter(Boolean))

    for (const role of [
      "NON_CURRENT_ASSETS",
      "CURRENT_ASSETS",
      "CURRENT_LIABILITIES",
      "NON_CURRENT_LIABILITIES",
      "PPE_COST",
      "PPE_ACCUM_DEP",
      "REVENUE",
      "OTHER_INCOME",
      "COST_OF_SALES",
      "ADMIN_SELLING",
      "FINANCIAL_EXPENSE",
      "TAX_EXPENSE",
      "RETAINED_EARNINGS",
    ]) {
      expect(roles).toContain(role)
    }
  })

  it("puts RETAINED_EARNINGS on a leaf, since year-end posts to it", () => {
    const retained = CHART.find((e) => e.systemRole === "RETAINED_EARNINGS")!
    expect(retained.isGroup).toBe(false)
  })

  it("puts every other role on a group, since those carry the statement structure", () => {
    for (const entry of CHART) {
      if (entry.systemRole && entry.systemRole !== "RETAINED_EARNINGS") {
        expect(entry.isGroup).toBe(true)
      }
    }
  })

  it("tags exactly one cash account and at least one bank account", () => {
    expect(CHART.filter((e) => e.cashKind === "CASH")).toHaveLength(1)
    expect(CHART.filter((e) => e.cashKind === "BANK").length).toBeGreaterThanOrEqual(1)
  })

  it("never tags a group as cash or bank — a book must render postable lines", () => {
    for (const entry of CHART) {
      if (entry.cashKind && entry.cashKind !== "NONE") expect(entry.isGroup).toBe(false)
    }
  })

  it("reproduces the four-way expense split the audited P&L uses", () => {
    const groups = CHART.filter((e) => e.type === "EXPENSE" && e.isGroup && !e.parent)
    expect(groups.map((g) => g.code).sort()).toEqual(["5000"])

    const blocks = CHART.filter((e) => e.parent === "5000").map((e) => e.name)
    expect(blocks).toEqual([
      "Cost of Goods Sold",
      "Administrative & Selling Expenses",
      "Financial Expenses",
      "Income Tax Expense",
    ])
  })

  it("carries salary in both the direct and the administrative block", () => {
    const salaries = CHART.filter((e) => e.name.toLowerCase().includes("salary"))
    expect(salaries.map((s) => s.code)).toContain("5122")
    expect(salaries.map((s) => s.code)).toContain("5201")
  })
})
