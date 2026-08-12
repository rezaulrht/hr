import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./statements.balances", async () => {
  const actual = await vi.importActual<typeof import("./statements.balances")>(
    "./statements.balances"
  )
  return {
    ...actual,
    balancesFor: vi.fn(),
    loadChart: vi.fn(),
    assertLedgerBalanced: vi.fn(async () => undefined),
  }
})

import { Prisma } from "../../generated/prisma/client"
import { utcDate } from "../accounting/accounting.utils"
import { assertLedgerBalanced, balancesFor, loadChart } from "./statements.balances"
import { buildPnl } from "./statements.pnl"

const D = (v: string | number) => new Prisma.Decimal(v)

/** A chart with one leaf under each P&L role, plus a retired one. */
const ACCOUNTS = [
  { id: "i-root", code: "4000", name: "Income", type: "INCOME", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "rev", code: "4100", name: "Revenue", type: "INCOME", parentId: "i-root", isGroup: true, isActive: true, systemRole: "REVENUE" },
  { id: "rev-exp", code: "4110", name: "Service Revenue — Export", type: "INCOME", parentId: "rev", isGroup: false, isActive: true, systemRole: null },
  { id: "oth", code: "4200", name: "Other Income", type: "INCOME", parentId: "i-root", isGroup: true, isActive: true, systemRole: "OTHER_INCOME" },
  { id: "oth-int", code: "4210", name: "Interest Income", type: "INCOME", parentId: "oth", isGroup: false, isActive: true, systemRole: null },
  { id: "e-root", code: "5000", name: "Expenses", type: "EXPENSE", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "cogs", code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", parentId: "e-root", isGroup: true, isActive: true, systemRole: "COST_OF_SALES" },
  { id: "cogs-mat", code: "5110", name: "Materials Consumed", type: "EXPENSE", parentId: "cogs", isGroup: false, isActive: true, systemRole: null },
  { id: "admin", code: "5200", name: "Administrative & Selling Expenses", type: "EXPENSE", parentId: "e-root", isGroup: true, isActive: true, systemRole: "ADMIN_SELLING" },
  { id: "admin-sal", code: "5201", name: "Salary and Allowances", type: "EXPENSE", parentId: "admin", isGroup: false, isActive: true, systemRole: null },
  { id: "admin-old", code: "5299", name: "Retired Line", type: "EXPENSE", parentId: "admin", isGroup: false, isActive: false, systemRole: null },
  { id: "fin", code: "5300", name: "Financial Expenses", type: "EXPENSE", parentId: "e-root", isGroup: true, isActive: true, systemRole: "FINANCIAL_EXPENSE" },
  { id: "fin-bank", code: "5310", name: "Bank Interest & Charges", type: "EXPENSE", parentId: "fin", isGroup: false, isActive: true, systemRole: null },
  { id: "tax", code: "5400", name: "Income Tax Expense", type: "EXPENSE", parentId: "e-root", isGroup: true, isActive: true, systemRole: "TAX_EXPENSE" },
  { id: "tax-cur", code: "5410", name: "Current Tax", type: "EXPENSE", parentId: "tax", isGroup: false, isActive: true, systemRole: null },
]

function chartIndex() {
  const byId = new Map(ACCOUNTS.map((a) => [a.id, a]))
  const byRole = new Map(ACCOUNTS.filter((a) => a.systemRole).map((a) => [a.systemRole!, a]))
  const childrenOf = (id: string) => ACCOUNTS.filter((a) => a.parentId === id)
  const leavesUnder = (id: string): any[] => {
    const root = byId.get(id)
    if (!root) return []
    if (!root.isGroup) return [root]
    return childrenOf(id).flatMap((c) => leavesUnder(c.id))
  }
  return { all: ACCOUNTS, byId, byRole, childrenOf, leavesUnder, equityRoot: null }
}

function balanceMap(entries: Record<string, string>) {
  const map = new Map()
  for (const [id, signed] of Object.entries(entries)) {
    map.set(id, { debit: D(0), credit: D(0), signed: D(signed) })
  }
  return map
}

const range = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }

beforeEach(() => {
  vi.clearAllMocks()
  ;(loadChart as any).mockResolvedValue(chartIndex())
  // Current period: the audited FY2024-25 figures. Comparative: nothing,
  // the company was incorporated in December 2024.
  ;(balancesFor as any)
    .mockResolvedValueOnce(balanceMap({ "admin-sal": "254530.00", "fin-bank": "2405.00" }))
    .mockResolvedValueOnce(balanceMap({}))
})

describe("buildPnl", () => {
  it("reproduces the audited FY2024-25 operating loss and net loss", async () => {
    const result = await buildPnl(range)
    const by = Object.fromEntries(result.lines.map((l) => [l.key, l.current]))

    expect(by.REVENUE).toBe("0.00")
    expect(by.COST_OF_SALES).toBe("0.00")
    expect(by.GROSS_PROFIT).toBe("0.00")
    expect(by.ADMIN_SELLING).toBe("254530.00")
    expect(by.OPERATING_PROFIT).toBe("-254530.00")
    expect(by.FINANCIAL_EXPENSE).toBe("2405.00")
    expect(by.PROFIT_BEFORE_TAX).toBe("-256935.00")
    expect(by.TAX_EXPENSE).toBe("0.00")
    expect(by.PROFIT_AFTER_TAX).toBe("-256935.00")
  })

  it("exposes the net profit separately for the balance sheet and equity statement", async () => {
    const result = await buildPnl(range)

    expect(result.netProfit.current).toBe("-256935.00")
    expect(result.netProfit.comparative).toBe("0.00")
  })

  it("subtracts revenue less cost of sales to reach gross profit", async () => {
    ;(balancesFor as any).mockReset()
    ;(balancesFor as any)
      .mockResolvedValueOnce(balanceMap({ "rev-exp": "1000000.00", "cogs-mat": "400000.00" }))
      .mockResolvedValueOnce(balanceMap({}))

    const result = await buildPnl(range)
    const by = Object.fromEntries(result.lines.map((l) => [l.key, l.current]))

    expect(by.GROSS_PROFIT).toBe("600000.00")
  })

  it("adds other income after operating profit, not before", async () => {
    ;(balancesFor as any).mockReset()
    ;(balancesFor as any)
      .mockResolvedValueOnce(balanceMap({ "admin-sal": "100000.00", "oth-int": "30000.00" }))
      .mockResolvedValueOnce(balanceMap({}))

    const result = await buildPnl(range)
    const by = Object.fromEntries(result.lines.map((l) => [l.key, l.current]))

    expect(by.OPERATING_PROFIT).toBe("-100000.00")
    expect(by.PROFIT_BEFORE_TAX).toBe("-70000.00")
  })

  it("orders the lines exactly as the audited statement does", async () => {
    const result = await buildPnl(range)

    expect(result.lines.map((l) => l.key)).toEqual([
      "REVENUE",
      "COST_OF_SALES",
      "GROSS_PROFIT",
      "ADMIN_SELLING",
      "OPERATING_PROFIT",
      "OTHER_INCOME",
      "FINANCIAL_EXPENSE",
      "PROFIT_BEFORE_TAX",
      "TAX_EXPENSE",
      "PROFIT_AFTER_TAX",
    ])
  })

  it("marks subtotals so the client can style them without matching on labels", async () => {
    const result = await buildPnl(range)
    const subtotals = result.lines.filter((l) => l.kind === "SUBTOTAL").map((l) => l.key)

    expect(subtotals).toEqual([
      "GROSS_PROFIT",
      "OPERATING_PROFIT",
      "PROFIT_BEFORE_TAX",
      "PROFIT_AFTER_TAX",
    ])
  })

  it("carries the account breakdown inline for the drill-down", async () => {
    const result = await buildPnl(range)
    const admin = result.lines.find((l) => l.key === "ADMIN_SELLING")!

    expect(admin.breakdown.map((b) => b.code)).toEqual(["5201"])
    expect(admin.breakdown[0].current).toBe("254530.00")
  })

  it("hides a deactivated account with no balance from the breakdown", async () => {
    const result = await buildPnl(range)
    const admin = result.lines.find((l) => l.key === "ADMIN_SELLING")!

    expect(admin.breakdown.map((b) => b.code)).not.toContain("5299")
  })

  it("keeps a deactivated account that still carries a balance", async () => {
    ;(balancesFor as any).mockReset()
    ;(balancesFor as any)
      .mockResolvedValueOnce(balanceMap({ "admin-old": "500.00" }))
      .mockResolvedValueOnce(balanceMap({}))

    const result = await buildPnl(range)
    const admin = result.lines.find((l) => l.key === "ADMIN_SELLING")!

    expect(admin.breakdown.map((b) => b.code)).toContain("5299")
  })

  it("gives subtotals no breakdown", async () => {
    const result = await buildPnl(range)

    for (const line of result.lines.filter((l) => l.kind === "SUBTOTAL")) {
      expect(line.breakdown).toEqual([])
    }
  })

  it("excludes CLOSING journals from both periods", async () => {
    await buildPnl(range)

    for (const call of (balancesFor as any).mock.calls) {
      expect(call[0].excludeClosing).toBe(true)
    }
  })

  it("bounds both periods, never running from inception", async () => {
    await buildPnl(range)

    const [current, comparative] = (balancesFor as any).mock.calls.map((c: any) => c[0])
    expect(current.from).toEqual(utcDate(2024, 7, 1))
    expect(comparative.from).toEqual(utcDate(2023, 7, 1))
    expect(comparative.to).toEqual(utcDate(2024, 6, 30))
  })

  it("labels both periods so the client need not re-derive them", async () => {
    const result = await buildPnl(range)

    expect(result.period.label).toBe("Jul 2024 – Jun 2025")
    expect(result.comparative.label).toBe("Jul 2023 – Jun 2024")
  })

  it("runs the trial-balance guard before computing anything", async () => {
    await buildPnl(range)

    expect(assertLedgerBalanced).toHaveBeenCalledWith(range.to)
  })

  it("propagates the guard's 409 rather than rendering figures", async () => {
    ;(assertLedgerBalanced as any).mockRejectedValue(
      Object.assign(new Error("does not agree"), { statusCode: 409 })
    )

    await expect(buildPnl(range)).rejects.toMatchObject({ statusCode: 409 })
  })
})
