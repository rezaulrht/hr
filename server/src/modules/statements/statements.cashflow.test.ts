import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./statements.balances", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./statements.balances")>()
  return { ...actual, balancesFor: vi.fn(), loadChart: vi.fn(), assertLedgerBalanced: vi.fn(async () => undefined), assertChartCoversLedger: vi.fn(), assertEveryAccountClassified: vi.fn() }
})
vi.mock("./statements.pnl", () => ({ pnlNetProfit: vi.fn() }))

import { Prisma } from "../../generated/prisma/client"
import { balancesFor, loadChart } from "./statements.balances"
import { pnlNetProfit } from "./statements.pnl"
import { utcDate } from "../accounting/accounting.utils"
import { cashFlowStatement } from "./statements.cashflow"

const D = (v: string | number) => new Prisma.Decimal(v)
const range = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }
const accounts = [
  { id: "cash", code: "1241", name: "Cash in Hand", type: "ASSET", isGroup: false, cashFlowKind: "CASH", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
  { id: "recv", code: "1220", name: "Trade and other Receivables", type: "ASSET", isGroup: false, cashFlowKind: "OPERATING_WC", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
  { id: "pay", code: "2110", name: "Trade and other Payables", type: "LIABILITY", isGroup: false, cashFlowKind: "OPERATING_WC", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
  { id: "dep", code: "5215", name: "Depreciation — Admin", type: "EXPENSE", isGroup: false, cashFlowKind: "NON_CASH_ADDBACK", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
  { id: "ppe", code: "1114", name: "Computer / Laptop", type: "ASSET", isGroup: false, cashFlowKind: "INVESTING", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
  { id: "share", code: "3100", name: "Share Capital", type: "EQUITY", isGroup: false, cashFlowKind: "FINANCING", parentId: null, systemRole: null, noteRef: null, depreciationRate: null, contraAccountId: null },
]
const chart = { all: accounts, byId: new Map(accounts.map((a) => [a.id, a])), byRole: new Map(), byNoteRef: new Map(), childrenOf: () => [], leavesUnder: () => [], equityRoot: accounts[5] }
const bal = (signed: string, debit = "0", credit = "0") => ({ debit: D(debit), credit: D(credit), signed: D(signed) })
const rowsByKey = (result: any) => Object.fromEntries([...result.operating, ...result.investing, ...result.financing, ...result.summary].map((r: any) => [r.key, r.current]))

beforeEach(() => {
  vi.clearAllMocks()
  ;(pnlNetProfit as any).mockReturnValue(D("-256935.00"))
  ;(loadChart as any).mockResolvedValue(chart)
  ;(balancesFor as any).mockImplementation(async (opts: any) => {
    if (opts.from === undefined) return new Map([["cash", bal("0.00")]])
    if (opts.excludeClosing) return new Map([["dep", bal("29650.00", "29650.00")]])
    return new Map([
      ["cash", bal("693715.00")], ["recv", bal("40000.00")], ["pay", bal("117000.00")],
      ["ppe", bal("156000.00", "156000.00")], ["share", bal("1000000.00")],
    ])
  })
})

describe("cashFlowStatement", () => {
  it("opens with net profit after tax", async () => expect(rowsByKey(await cashFlowStatement(range)).NET_PROFIT).toBe("-256935.00"))
  it("adds depreciation back positively", async () => expect(rowsByKey(await cashFlowStatement(range)).DEPRECIATION).toBe("29650.00"))
  it("shows an increase in receivables as a use of cash", async () => expect(rowsByKey(await cashFlowStatement(range)).WC_recv).toBe("-40000.00"))
  it("shows an increase in payables as a source of cash", async () => expect(rowsByKey(await cashFlowStatement(range)).WC_pay).toBe("117000.00"))
  it("puts PP&E purchases in investing", async () => expect(rowsByKey(await cashFlowStatement(range)).INV_ppe).toBe("-156000.00"))
  it("puts a share issue in financing", async () => expect(rowsByKey(await cashFlowStatement(range)).NET_FINANCING).toBe("1000000.00"))
  it("reconciles closing cash", async () => {
    const rows = rowsByKey(await cashFlowStatement(range))
    expect(rows.NET_CHANGE).toBe("693715.00")
    expect(rows.CLOSING_CASH).toBe("693715.00")
  })
  it("refuses an unreconciled classification", async () => {
    ;(balancesFor as any).mockImplementation(async (opts: any) => {
      if (opts.from === undefined) return new Map([["cash", bal("0.00")]])
      if (opts.excludeClosing) return new Map([["dep", bal("29650.00", "29650.00")]])
      return new Map([["cash", bal("693715.00")], ["pay", bal("117000.00")], ["ppe", bal("156000.00", "156000.00")], ["share", bal("1000000.00")]])
    })
    await expect(cashFlowStatement(range)).rejects.toMatchObject({ statusCode: 409, message: expect.stringMatching(/does not reconcile/i) })
  })
  it("refuses when the prior-year column does not reconcile", async () => {
    // The current year ties; FY 2023-24 is missing the receivables movement,
    // so its sections do not add up to the movement on cash. The comparative
    // column's closing cash is derived as opening plus net change and never
    // read back, so an unchecked prior year prints a figure nothing has
    // agreed against.
    ;(balancesFor as any).mockImplementation(async (opts: any) => {
      if (opts.from === undefined) return new Map([["cash", bal("0.00")]])
      if (opts.excludeClosing) return new Map([["dep", bal("29650.00", "29650.00")]])
      const prior = opts.from.getUTCFullYear() === 2023
      return new Map([
        ["cash", bal("693715.00")],
        ...(prior ? [] : [["recv", bal("40000.00")] as const]),
        ["pay", bal("117000.00")],
        ["ppe", bal("156000.00", "156000.00")],
        ["share", bal("1000000.00")],
      ] as any)
    })

    await expect(cashFlowStatement(range)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringMatching(/comparative/i),
    })
  })

  it("suppresses nil working-capital rows", async () => {
    const result = await cashFlowStatement(range)
    expect(result.operating.some((r) => r.current === "0.00" && r.key.startsWith("WC_"))).toBe(false)
  })
  it("carries the prior-year comparative", async () => {
    const result = await cashFlowStatement(range)
    expect(result.comparativePeriod.from).toBe(utcDate(2023, 7, 1).toISOString())
  })
})
