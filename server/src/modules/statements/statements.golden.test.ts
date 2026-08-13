/**
 * The audited FY 2024-25 financial statements of BYTESPATE LIMITED
 * (G. Nabi & Co., Chartered Accountants; report dated 22 January 2026,
 * DVC 2601220453AS194034), reproduced from the ledger.
 *
 * The fixture below is the trial balance those statements imply. If a change
 * to the builders breaks this file, the change is wrong until proven
 * otherwise — these are figures somebody signed.
 */

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
import { buildEquity } from "./statements.equity"
import { buildPnl } from "./statements.pnl"
import { buildPosition } from "./statements.position"

const D = (v: string | number) => new Prisma.Decimal(v)

const g = (id: string, code: string, name: string, type: string, parentId: string | null, systemRole: string | null = null) =>
  ({ id, code, name, type, parentId, isGroup: true, isActive: true, systemRole })
const a = (id: string, code: string, name: string, type: string, parentId: string) =>
  ({ id, code, name, type, parentId, isGroup: false, isActive: true, systemRole: null })

/** The seeded chart, trimmed to the accounts these statements touch. */
const ACCOUNTS = [
  g("assets", "1000", "Assets", "ASSET", null),
  g("nca", "1100", "Non-Current Assets", "ASSET", "assets", "NON_CURRENT_ASSETS"),
  g("ppe", "1110", "Property, Plant & Equipment", "ASSET", "nca", "PPE_COST"),
  a("ppe-furn", "1111", "Furniture & Fixture", "ASSET", "ppe"),
  a("ppe-office", "1112", "Office Equipments", "ASSET", "ppe"),
  a("ppe-soft", "1113", "Software / Domain", "ASSET", "ppe"),
  a("ppe-comp", "1114", "Computer / Laptop", "ASSET", "ppe"),
  g("accdep", "1120", "Accumulated Depreciation", "ASSET", "nca", "PPE_ACCUM_DEP"),
  a("accdep-furn", "1121", "Acc. Dep. — Furniture & Fixture", "ASSET", "accdep"),
  a("accdep-office", "1122", "Acc. Dep. — Office Equipments", "ASSET", "accdep"),
  a("accdep-soft", "1123", "Acc. Dep. — Software / Domain", "ASSET", "accdep"),
  a("accdep-comp", "1124", "Acc. Dep. — Computer / Laptop", "ASSET", "accdep"),
  g("prelim", "1130", "Preliminary Expenses", "ASSET", "nca"),
  a("prelim-reg", "1131", "Registration Cost", "ASSET", "prelim"),
  a("prelim-lic", "1132", "Trade Licence", "ASSET", "prelim"),
  g("ca", "1200", "Current Assets", "ASSET", "assets", "CURRENT_ASSETS"),
  g("inv", "1210", "Inventories", "ASSET", "ca"),
  a("inv-raw", "1212", "Raw Materials", "ASSET", "inv"),
  a("receivables", "1220", "Trade and other Receivables", "ASSET", "ca"),
  g("advances", "1230", "Advance, Deposit & Prepayments", "ASSET", "ca"),
  a("adv-rent", "1231", "Advance against Office Rent", "ASSET", "advances"),
  g("cash", "1240", "Cash & Cash Equivalents", "ASSET", "ca"),
  a("cash-hand", "1241", "Cash in Hand", "ASSET", "cash"),
  a("cash-bank", "1242", "City Bank — A/C 1104400708001", "ASSET", "cash"),

  g("liab", "2000", "Liabilities", "LIABILITY", null),
  g("cl", "2100", "Current Liabilities", "LIABILITY", "liab", "CURRENT_LIABILITIES"),
  a("payables", "2110", "Trade and other Payables", "LIABILITY", "cl"),
  a("tax-prov", "2120", "Provision for Income Tax", "LIABILITY", "cl"),
  g("accrued", "2130", "Liabilities for Expenses", "LIABILITY", "cl"),
  a("accrued-audit", "2131", "Audit Fee Payable", "LIABILITY", "accrued"),
  g("ncl", "2200", "Non-Current Liabilities", "LIABILITY", "liab", "NON_CURRENT_LIABILITIES"),
  a("loan", "2210", "Loan Payable", "LIABILITY", "ncl"),

  g("equity", "3000", "Equity", "EQUITY", null),
  a("cap", "3100", "Share Capital", "EQUITY", "equity"),
  a("money", "3200", "Share Money Deposit", "EQUITY", "equity"),
  { ...a("retained", "3300", "Retained Earnings", "EQUITY", "equity"), systemRole: "RETAINED_EARNINGS" },

  g("income", "4000", "Income", "INCOME", null),
  g("revenue", "4100", "Revenue", "INCOME", "income", "REVENUE"),
  a("rev-export", "4110", "Service Revenue — Export", "INCOME", "revenue"),
  g("other-income", "4200", "Other Income", "INCOME", "income", "OTHER_INCOME"),
  a("interest", "4210", "Interest Income", "INCOME", "other-income"),

  g("expenses", "5000", "Expenses", "EXPENSE", null),
  g("cogs", "5100", "Cost of Goods Sold", "EXPENSE", "expenses", "COST_OF_SALES"),
  a("cogs-mat", "5110", "Materials Consumed", "EXPENSE", "cogs"),
  g("admin", "5200", "Administrative & Selling Expenses", "EXPENSE", "expenses", "ADMIN_SELLING"),
  a("adm-salary", "5201", "Salary and Allowances", "EXPENSE", "admin"),
  a("adm-stationary", "5203", "Stationary", "EXPENSE", "admin"),
  a("adm-software", "5204", "Software Licence", "EXPENSE", "admin"),
  a("adm-entertain", "5205", "Entertainment", "EXPENSE", "admin"),
  a("adm-rent", "5206", "Office Rent", "EXPENSE", "admin"),
  a("adm-office", "5207", "Office Expense", "EXPENSE", "admin"),
  a("adm-travel", "5208", "Travel and Conveyance", "EXPENSE", "admin"),
  a("adm-electric", "5209", "Electricity", "EXPENSE", "admin"),
  a("adm-wasa", "5210", "WASA Bill", "EXPENSE", "admin"),
  a("adm-internet", "5211", "Internet Bill", "EXPENSE", "admin"),
  a("adm-it", "5212", "IT Accessories", "EXPENSE", "admin"),
  a("adm-repair", "5213", "Repair & Maintenance", "EXPENSE", "admin"),
  a("adm-audit", "5214", "Audit Fee", "EXPENSE", "admin"),
  a("adm-dep", "5215", "Depreciation — Admin", "EXPENSE", "admin"),
  a("adm-misc", "5217", "Miscellaneous Expenses", "EXPENSE", "admin"),
  g("finance", "5300", "Financial Expenses", "EXPENSE", "expenses", "FINANCIAL_EXPENSE"),
  a("fin-bank", "5310", "Bank Interest & Charges", "EXPENSE", "finance"),
  g("taxexp", "5400", "Income Tax Expense", "EXPENSE", "expenses", "TAX_EXPENSE"),
  a("tax-current", "5410", "Current Tax", "EXPENSE", "taxexp"),
]

function chartIndex() {
  const byId = new Map(ACCOUNTS.map((x) => [x.id, x]))
  const byRole = new Map(ACCOUNTS.filter((x) => x.systemRole).map((x) => [x.systemRole!, x]))
  const childrenOf = (id: string) => ACCOUNTS.filter((x) => x.parentId === id)
  const leavesUnder = (id: string): any[] => {
    const root = byId.get(id)
    if (!root) return []
    if (!root.isGroup) return [root]
    return childrenOf(id).flatMap((c) => leavesUnder(c.id))
  }
  return { all: ACCOUNTS, byId, byRole, childrenOf, leavesUnder, equityRoot: byId.get("equity") }
}

/**
 * Note 17.00, Administrative & Selling Expenses. Fourteen lines summing to
 * 254,530. Depreciation — Admin (5215) is deliberately absent: in the
 * audited FY 2024-25 accounts the 29,650 depreciation appears only as the
 * accumulated-depreciation contra asset on the balance sheet, not as a P&L
 * admin expense — otherwise the net loss would be 286,585, not the signed
 * 256,935.
 */
const ADMIN_EXPENSES: Record<string, string> = {
  "adm-salary": "119520.00",
  "adm-stationary": "3535.00",
  "adm-software": "13400.00",
  "adm-entertain": "580.00",
  "adm-rent": "70500.00",
  "adm-office": "5000.00",
  "adm-travel": "4025.00",
  "adm-electric": "2000.00",
  "adm-wasa": "2500.00",
  "adm-internet": "2500.00",
  "adm-it": "1970.00",
  "adm-repair": "3000.00",
  "adm-audit": "25000.00",
  "adm-misc": "1000.00",
}

/** Signed balances at 30 June 2025, per the Statement of Financial Position. */
const CUMULATIVE_TO_30_JUN_2025: Record<string, string> = {
  // Annexure-A: cost 156,000 across four classes.
  "ppe-furn": "20000.00",
  "ppe-office": "10500.00",
  "ppe-soft": "30000.00",
  "ppe-comp": "95500.00",
  // Accumulated depreciation 29,650 — a credit balance on an ASSET account.
  "accdep-furn": "-2000.00",
  "accdep-office": "-1050.00",
  "accdep-soft": "-7500.00",
  "accdep-comp": "-19100.00",
  // Note 5.00
  "prelim-reg": "47158.00",
  "prelim-lic": "5347.00",
  // Note 8.00 — the 15,000 advance that takes Current Assets to 629,845.
  "adv-rent": "15000.00",
  // Note 9.00
  "cash-hand": "2250.00",
  "cash-bank": "612595.00",
  // Note 12.00 and 14.00
  payables: "40635.00",
  "accrued-audit": "25000.00",
  // Note 10.00
  cap: "1000000.00",
  ...ADMIN_EXPENSES,
  "fin-bank": "2405.00",
}

/** Nothing before 1 July 2024 — the company was incorporated 13 Dec 2024. */
const NOTHING: Record<string, string> = {}

function balanceMap(entries: Record<string, string>) {
  const map = new Map()
  for (const [id, signed] of Object.entries(entries)) {
    map.set(id, { debit: D(0), credit: D(0), signed: D(signed) })
  }
  return map
}

const FY = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }

beforeEach(() => {
  vi.clearAllMocks()
  ;(loadChart as any).mockResolvedValue(chartIndex())
})

describe("Statement of Profit or Loss, FY 2024-25", () => {
  beforeEach(() => {
    ;(balancesFor as any)
      .mockResolvedValueOnce(balanceMap({ ...ADMIN_EXPENSES, "fin-bank": "2405.00" }))
      .mockResolvedValueOnce(balanceMap(NOTHING))
  })

  it("matches the filed statement line for line", async () => {
    const result = await buildPnl(FY)
    const by = Object.fromEntries(result.lines.map((l) => [l.key, l.current]))

    expect(by.REVENUE).toBe("0.00")
    expect(by.COST_OF_SALES).toBe("0.00")
    expect(by.GROSS_PROFIT).toBe("0.00")
    expect(by.ADMIN_SELLING).toBe("254530.00")
    expect(by.OPERATING_PROFIT).toBe("-254530.00")
    expect(by.OTHER_INCOME).toBe("0.00")
    expect(by.FINANCIAL_EXPENSE).toBe("2405.00")
    expect(by.PROFIT_BEFORE_TAX).toBe("-256935.00")
    expect(by.TAX_EXPENSE).toBe("0.00")
    expect(by.PROFIT_AFTER_TAX).toBe("-256935.00")
  })

  it("breaks Administrative & Selling down to note 17.00's lines", async () => {
    const result = await buildPnl(FY)
    const admin = result.lines.find((l) => l.key === "ADMIN_SELLING")!

    // Fourteen lines carry balances; Depreciation — Admin (5215) is an
    // active account in the chart, so Decision 9 shows it at nil too.
    expect(admin.breakdown).toHaveLength(15)
    expect(admin.breakdown.find((b) => b.code === "5206")!.current).toBe("70500.00")
    expect(admin.breakdown.find((b) => b.code === "5214")!.current).toBe("25000.00")
    expect(admin.breakdown.find((b) => b.code === "5215")!.current).toBe("0.00")
  })

  it("shows nil for both comparative years, the company being newly incorporated", async () => {
    const result = await buildPnl(FY)

    expect(result.netProfit.comparative).toBe("0.00")
  })
})

describe("Statement of Financial Position at 30 June 2025", () => {
  beforeEach(() => {
    ;(balancesFor as any)
      .mockResolvedValueOnce(balanceMap(CUMULATIVE_TO_30_JUN_2025))
      .mockResolvedValueOnce(balanceMap(NOTHING))
  })

  it("matches the filed asset side", async () => {
    const result = await buildPosition(FY)
    const nonCurrent = result.assets.find((s) => s.heading === "Non-Current Assets")!
    const current = result.assets.find((s) => s.heading === "Current Assets")!

    expect(nonCurrent.lines.find((l) => l.code === "1110")!.current).toBe("126350.00")
    expect(nonCurrent.lines.find((l) => l.code === "1130")!.current).toBe("52505.00")
    expect(nonCurrent.subtotal.current).toBe("178855.00")

    expect(current.lines.find((l) => l.code === "1210")!.current).toBe("0.00")
    expect(current.lines.find((l) => l.code === "1220")!.current).toBe("0.00")
    expect(current.lines.find((l) => l.code === "1240")!.current).toBe("614845.00")
    expect(current.subtotal.current).toBe("629845.00")

    expect(result.totalAssets.current).toBe("808700.00")
  })

  it("matches the filed equity and liabilities side", async () => {
    const result = await buildPosition(FY)
    const equity = result.equityAndLiabilities.find((s) => s.heading === "Shareholders' Equity")!
    const currentLiab = result.equityAndLiabilities.find((s) => s.heading === "Current Liabilities")!

    expect(equity.lines.find((l) => l.code === "3100")!.current).toBe("1000000.00")
    expect(equity.lines.find((l) => l.key === "PROFIT_FOR_PERIOD")!.current).toBe("-256935.00")
    expect(equity.subtotal.current).toBe("743065.00")

    expect(currentLiab.lines.find((l) => l.code === "2110")!.current).toBe("40635.00")
    expect(currentLiab.lines.find((l) => l.code === "2130")!.current).toBe("25000.00")
    expect(currentLiab.subtotal.current).toBe("65635.00")

    expect(result.totalEquityAndLiabilities.current).toBe("808700.00")
  })

  it("balances", async () => {
    const result = await buildPosition(FY)

    expect(result.balances).toBe(true)
    expect(result.totalAssets.current).toBe(result.totalEquityAndLiabilities.current)
  })

  it("nets 156,000 of cost against 29,650 of depreciation into one line", async () => {
    const result = await buildPosition(FY)
    const ppe = result.assets[0].lines.find((l) => l.code === "1110")!

    const cost = ppe.breakdown
      .filter((b) => b.code.startsWith("111"))
      .reduce((t, b) => t.plus(D(b.current)), D(0))
    const dep = ppe.breakdown
      .filter((b) => b.code.startsWith("112"))
      .reduce((t, b) => t.plus(D(b.current)), D(0))

    expect(cost.toFixed(2)).toBe("156000.00")
    expect(dep.toFixed(2)).toBe("-29650.00")
    expect(cost.plus(dep).toFixed(2)).toBe(ppe.current)
  })
})

describe("Statement of Changes in Equity, FY 2024-25", () => {
  beforeEach(() => {
    ;(balancesFor as any)
      // opening: nothing existed
      .mockResolvedValueOnce(balanceMap(NOTHING))
      // movement, closing excluded: the share capital issue
      .mockResolvedValueOnce(balanceMap({ cap: "1000000.00" }))
      // profit, closing excluded
      .mockResolvedValueOnce(balanceMap({ ...ADMIN_EXPENSES, "fin-bank": "2405.00" }))
  })

  it("closes at 743,065, agreeing with the balance sheet", async () => {
    const result = await buildEquity(FY)
    const closing = result.rows.find((r) => r.kind === "CLOSING")!

    expect(closing.values.cap).toBe("1000000.00")
    expect(closing.values.money).toBe("0.00")
    expect(closing.values.retained).toBe("-256935.00")
    expect(closing.total).toBe("743065.00")
  })

  it("reaches closing by opening plus movements plus profit", async () => {
    const result = await buildEquity(FY)
    const opening = result.rows.find((r) => r.kind === "OPENING")!
    const movements = result.rows.filter((r) => r.kind === "MOVEMENT")
    const profit = result.rows.find((r) => r.kind === "PROFIT")!
    const closing = result.rows.find((r) => r.kind === "CLOSING")!

    const summed = movements
      .reduce((t, r) => t.plus(D(r.total)), D(opening.total))
      .plus(D(profit.total))

    expect(summed.toFixed(2)).toBe(closing.total)
  })

  it("shows share capital as a movement in the year, not as an opening balance", async () => {
    // The filed statement puts 1,000,000 in the opening row while its own
    // cash flow reports it as a financing inflow during the year. The
    // company was incorporated 13 December 2024, inside this year, so
    // opening equity is nil. This output is deliberately different.
    const result = await buildEquity(FY)

    expect(result.rows.find((r) => r.kind === "OPENING")!.total).toBe("0.00")
    expect(result.rows.filter((r) => r.kind === "MOVEMENT")).toHaveLength(1)
    expect(result.rows.find((r) => r.kind === "MOVEMENT")!.values.cap).toBe("1000000.00")
  })
})
