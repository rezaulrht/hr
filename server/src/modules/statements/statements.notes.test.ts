import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../config/prisma", () => ({ default: { statementNote: { findMany: vi.fn() } } }))
vi.mock("./statements.balances", async () => ({
  ...(await vi.importActual<typeof import("./statements.balances")>("./statements.balances")),
  balancesFor: vi.fn(),
  loadChart: vi.fn(),
}))
import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { balancesFor, loadChart } from "./statements.balances"
import { statementNotes } from "./statements.notes"
import { utcDate } from "../accounting/accounting.utils"

const D = (v: string | number) => new Prisma.Decimal(v)
const range = { from: utcDate(2025, 7, 1), to: utcDate(2026, 6, 30) }

// The seeded shape that actually breaks: 5100 Cost of Goods Sold (group) has
// 5110 (a leaf) and 5120 Direct Expenses (a GROUP, with 5121 under it) as its
// children — which is exactly why note 16.01 has anything to break down.
// 3100 Share Capital is a balance-sheet leaf whose money arrived in a prior year.
const rows = [
  { id: "cogs", code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", parentId: null, isGroup: true, isActive: true, systemRole: "COST_OF_SALES", noteRef: "16.00", cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "mat", code: "5110", name: "Materials Consumed", type: "EXPENSE", parentId: "cogs", isGroup: false, isActive: true, systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "direct", code: "5120", name: "Direct Expenses", type: "EXPENSE", parentId: "cogs", isGroup: true, isActive: true, systemRole: null, noteRef: "16.01", cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "hw", code: "5121", name: "Hardware Purchase", type: "EXPENSE", parentId: "direct", isGroup: false, isActive: true, systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "share", code: "3100", name: "Share Capital", type: "EQUITY", parentId: null, isGroup: false, isActive: true, systemRole: null, noteRef: "10.00", cashFlowKind: "FINANCING", depreciationRate: null, contraAccountId: null },
]

type Row = (typeof rows)[number]

const leavesUnder = (id: string): Row[] => {
  const self = rows.find((r) => r.id === id)
  if (!self) return []
  return self.isGroup ? rows.filter((r) => r.parentId === id).flatMap((c) => leavesUnder(c.id)) : [self]
}

const chart = {
  all: rows,
  byId: new Map(rows.map((r) => [r.id, r])),
  byRole: new Map(),
  byNoteRef: new Map(rows.filter((r) => r.noteRef).map((r) => [r.noteRef!, r])),
  childrenOf: (id: string) => rows.filter((r) => r.parentId === id),
  leavesUnder,
  equityRoot: null,
}

// The two shapes `balancesFor` is asked for, told apart by whether `from` was
// given. Share capital appears only in the cumulative one, which is the whole
// point: it moved in a prior year.
const MOVEMENT = new Map([
  ["mat", { debit: D(0), credit: D(0), signed: D("20000") }],
  ["hw", { debit: D(0), credit: D(0), signed: D("80000") }],
])
const CUMULATIVE = new Map([
  ["mat", { debit: D(0), credit: D(0), signed: D("20000") }],
  ["hw", { debit: D(0), credit: D(0), signed: D("80000") }],
  ["share", { debit: D(0), credit: D(0), signed: D("1000000") }],
])

beforeEach(() => {
  vi.clearAllMocks()
  ;(loadChart as any).mockResolvedValue(chart)
  ;(balancesFor as any).mockImplementation(async (o: { from?: Date }) => (o.from ? MOVEMENT : CUMULATIVE))
  ;(prisma.statementNote.findMany as any).mockResolvedValue([])
})

const noteFor = async (ref: string) => (await statementNotes(range)).notes.find((n) => n.ref === ref)!

describe("statementNotes", () => {
  it("sums a group child's leaves rather than reading the group's own nil balance", async () => {
    const n = await noteFor("16.00")
    expect(n.rows.map((r) => [r.code, r.current])).toEqual([
      ["5110", "20000.00"],
      ["5120", "80000.00"],
    ])
    expect(n.total).toBe("100000.00")
  })

  it("reads a balance-sheet anchor cumulatively, so prior-year share capital is not nil", async () => {
    expect((await noteFor("10.00")).total).toBe("1000000.00")
  })

  it("reads a profit-and-loss anchor as the period movement", async () => {
    await statementNotes(range)
    const calls = (balancesFor as any).mock.calls as Array<[{ from?: Date; excludeClosing: boolean }]>
    expect(calls.some((c) => c[0].from !== undefined && c[0].excludeClosing)).toBe(true)
    expect(calls.some((c) => c[0].from === undefined && !c[0].excludeClosing)).toBe(true)
  })

  it("breaks a leaf anchor into a single row", async () => {
    expect((await noteFor("10.00")).rows.map((r) => r.code)).toEqual(["3100"])
  })

  it("merges narrative text and sorts refs numerically", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      { ref: "10.00", title: "Ten", body: "text", sortOrder: 0 },
      { ref: "2.08", title: "Two", body: "policy", sortOrder: 0 },
    ])
    const r = await statementNotes(range)
    expect(r.notes.map((n) => n.ref)).toEqual(["2.08", "10.00", "16.00", "16.01"])
    expect(r.notes[0].body).toBe("policy")
    expect(r.notes[1].title).toBe("Ten")
    expect(r.notes[1].total).toBe("1000000.00")
  })

  it("keeps a prose-only note with no rows and no total", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      { ref: "2.08", title: "Cash Flows", body: "policy", sortOrder: 0 },
    ])
    const n = await noteFor("2.08")
    expect(n.rows).toEqual([])
    expect(n.total).toBeNull()
  })

  it("treats a blank body as no body at all", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      { ref: "16.00", title: "Cost of Goods Sold", body: "   ", sortOrder: 0 },
    ])
    const n = await noteFor("16.00")
    expect(n.body).toBeNull()
    expect(n.total).toBe("100000.00")
  })

  it("breaks a genuine ref tie on sortOrder", async () => {
    ;(prisma.statementNote.findMany as any).mockResolvedValue([
      { ref: "2.0", title: "Second", body: "b", sortOrder: 5 },
      { ref: "2", title: "First", body: "a", sortOrder: 1 },
    ])
    const r = await statementNotes(range)
    expect(r.notes.slice(0, 2).map((n) => n.title)).toEqual(["First", "Second"])
  })
})
