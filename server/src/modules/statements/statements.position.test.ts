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
import { balancesFor, loadChart } from "./statements.balances"
import { buildPosition } from "./statements.position"

const D = (v: string | number) => new Prisma.Decimal(v)

const ACCOUNTS = [
  { id: "a-root", code: "1000", name: "Assets", type: "ASSET", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "a-ncur", code: "1100", name: "Non-Current Assets", type: "ASSET", parentId: "a-root", isGroup: true, isActive: true, systemRole: "NON_CURRENT_ASSETS" },
  { id: "ppe", code: "1110", name: "Property, Plant & Equipment", type: "ASSET", parentId: "a-ncur", isGroup: true, isActive: true, systemRole: "PPE_COST" },
  { id: "ppe-comp", code: "1114", name: "Computer / Laptop", type: "ASSET", parentId: "ppe", isGroup: false, isActive: true, systemRole: null },
  { id: "acc-dep", code: "1120", name: "Accumulated Depreciation", type: "ASSET", parentId: "a-ncur", isGroup: true, isActive: true, systemRole: "PPE_ACCUM_DEP" },
  { id: "acc-dep-comp", code: "1124", name: "Acc. Dep. — Computer / Laptop", type: "ASSET", parentId: "acc-dep", isGroup: false, isActive: true, systemRole: null },
  { id: "prelim", code: "1130", name: "Preliminary Expenses", type: "ASSET", parentId: "a-ncur", isGroup: false, isActive: true, systemRole: null },
  { id: "a-cur", code: "1200", name: "Current Assets", type: "ASSET", parentId: "a-root", isGroup: true, isActive: true, systemRole: "CURRENT_ASSETS" },
  { id: "advance", code: "1231", name: "Advance against Office Rent", type: "ASSET", parentId: "a-cur", isGroup: false, isActive: true, systemRole: null },
  { id: "cash-grp", code: "1240", name: "Cash & Cash Equivalents", type: "ASSET", parentId: "a-cur", isGroup: true, isActive: true, systemRole: null },
  { id: "bank", code: "1242", name: "City Bank", type: "ASSET", parentId: "cash-grp", isGroup: false, isActive: true, systemRole: null },

  { id: "l-root", code: "2000", name: "Liabilities", type: "LIABILITY", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "l-cur", code: "2100", name: "Current Liabilities", type: "LIABILITY", parentId: "l-root", isGroup: true, isActive: true, systemRole: "CURRENT_LIABILITIES" },
  { id: "payables", code: "2110", name: "Trade and other Payables", type: "LIABILITY", parentId: "l-cur", isGroup: false, isActive: true, systemRole: null },
  { id: "l-ncur", code: "2200", name: "Non-Current Liabilities", type: "LIABILITY", parentId: "l-root", isGroup: true, isActive: true, systemRole: "NON_CURRENT_LIABILITIES" },
  { id: "loan", code: "2210", name: "Loan Payable", type: "LIABILITY", parentId: "l-ncur", isGroup: false, isActive: true, systemRole: null },

  { id: "e-root", code: "3000", name: "Equity", type: "EQUITY", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "cap", code: "3100", name: "Share Capital", type: "EQUITY", parentId: "e-root", isGroup: false, isActive: true, systemRole: null },
  { id: "retained", code: "3300", name: "Retained Earnings", type: "EQUITY", parentId: "e-root", isGroup: false, isActive: true, systemRole: "RETAINED_EARNINGS" },

  { id: "i-root", code: "4000", name: "Income", type: "INCOME", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "rev", code: "4110", name: "Service Revenue", type: "INCOME", parentId: "i-root", isGroup: false, isActive: true, systemRole: null },
  { id: "x-root", code: "5000", name: "Expenses", type: "EXPENSE", parentId: null, isGroup: true, isActive: true, systemRole: null },
  { id: "sal", code: "5201", name: "Salary and Allowances", type: "EXPENSE", parentId: "x-root", isGroup: false, isActive: true, systemRole: null },
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
  return {
    all: ACCOUNTS,
    byId,
    byRole,
    childrenOf,
    leavesUnder,
    equityRoot: byId.get("e-root"),
  }
}

function balanceMap(entries: Record<string, string>) {
  const map = new Map()
  for (const [id, signed] of Object.entries(entries)) {
    map.set(id, { debit: D(0), credit: D(0), signed: D(signed) })
  }
  return map
}

/** The audited position at 30 June 2025, as signed balances. */
const AUDITED = {
  "ppe-comp": "156000.00",
  "acc-dep-comp": "-29650.00",
  prelim: "52505.00",
  advance: "15000.00",
  bank: "614845.00",
  payables: "65635.00",
  cap: "1000000.00",
  rev: "0.00",
  sal: "256935.00",
}

const range = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }

beforeEach(() => {
  vi.clearAllMocks()
  ;(loadChart as any).mockResolvedValue(chartIndex())
  ;(balancesFor as any)
    .mockResolvedValueOnce(balanceMap(AUDITED))
    .mockResolvedValueOnce(balanceMap({}))
})

describe("buildPosition", () => {
  it("nets accumulated depreciation into one Property, Plant & Equipment line", async () => {
    const result = await buildPosition(range)
    const nonCurrent = result.assets.find((s) => s.heading === "Non-Current Assets")!
    const ppe = nonCurrent.lines.find((l) => l.code === "1110")!

    expect(ppe.label).toBe("Property, Plant & Equipment")
    expect(ppe.current).toBe("126350.00")
    expect(nonCurrent.lines.map((l) => l.code)).not.toContain("1120")
  })

  it("keeps both cost and depreciation accounts in that line's breakdown", async () => {
    const result = await buildPosition(range)
    const ppe = result.assets[0].lines.find((l) => l.code === "1110")!

    expect(ppe.breakdown.map((b) => b.code).sort()).toEqual(["1114", "1124"])
  })

  it("subtotals each asset section and totals them", async () => {
    const result = await buildPosition(range)

    expect(result.assets.find((s) => s.heading === "Non-Current Assets")!.subtotal.current).toBe(
      "178855.00"
    )
    expect(result.assets.find((s) => s.heading === "Current Assets")!.subtotal.current).toBe(
      "629845.00"
    )
    expect(result.totalAssets.current).toBe("808700.00")
  })

  it("adds the derived profit line to equity and reaches the audited total", async () => {
    const result = await buildPosition(range)
    const equity = result.equityAndLiabilities.find((s) => s.heading === "Shareholders' Equity")!
    const profit = equity.lines.find((l) => l.kind === "DERIVED")!

    expect(profit.label).toBe("Profit/(Loss) for the period")
    expect(profit.current).toBe("-256935.00")
    expect(equity.subtotal.current).toBe("743065.00")
  })

  it("balances", async () => {
    const result = await buildPosition(range)

    expect(result.totalEquityAndLiabilities.current).toBe("808700.00")
    expect(result.totalAssets.current).toBe(result.totalEquityAndLiabilities.current)
    expect(result.balances).toBe(true)
  })

  it("balances mid-year, before any closing entry exists", async () => {
    ;(balancesFor as any).mockReset()
    ;(balancesFor as any)
      .mockResolvedValueOnce(
        balanceMap({ bank: "900000.00", cap: "1000000.00", sal: "100000.00" })
      )
      .mockResolvedValueOnce(balanceMap({}))

    const result = await buildPosition({ from: utcDate(2025, 7, 1), to: utcDate(2025, 10, 31) })

    // Assets 900,000 = Equity 1,000,000 − 100,000 loss.
    expect(result.totalAssets.current).toBe("900000.00")
    expect(result.totalEquityAndLiabilities.current).toBe("900000.00")
    expect(result.balances).toBe(true)
  })

  it("reads cumulatively from inception, not from the period start", async () => {
    await buildPosition(range)

    for (const call of (balancesFor as any).mock.calls) {
      expect(call[0].from).toBeUndefined()
    }
  })

  it("includes CLOSING journals — the closing entry legitimately moves the balance", async () => {
    await buildPosition(range)

    for (const call of (balancesFor as any).mock.calls) {
      expect(call[0].excludeClosing).toBe(false)
    }
  })

  it("reads the comparative at the prior year's end date", async () => {
    await buildPosition(range)

    const [current, comparative] = (balancesFor as any).mock.calls.map((c: any) => c[0])
    expect(current.to).toEqual(utcDate(2025, 6, 30))
    expect(comparative.to).toEqual(utcDate(2024, 6, 30))
  })

  it("presents each section in the audited order", async () => {
    const result = await buildPosition(range)

    expect(result.assets.map((s) => s.heading)).toEqual(["Non-Current Assets", "Current Assets"])
    expect(result.equityAndLiabilities.map((s) => s.heading)).toEqual([
      "Shareholders' Equity",
      "Current Liabilities",
      "Non-Current Liabilities",
    ])
  })

  it("shows a nil active line rather than dropping it", async () => {
    const result = await buildPosition(range)
    const nonCurrentLiab = result.equityAndLiabilities.find(
      (s) => s.heading === "Non-Current Liabilities"
    )!

    expect(nonCurrentLiab.lines.map((l) => l.code)).toContain("2210")
    expect(nonCurrentLiab.lines.find((l) => l.code === "2210")!.current).toBe("0.00")
  })
})
