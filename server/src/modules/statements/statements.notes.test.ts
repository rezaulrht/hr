import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("../../config/prisma", () => ({ default: { statementNote: { findMany: vi.fn() } } }))
vi.mock("./statements.balances", async () => ({ ...(await vi.importActual<typeof import("./statements.balances")>("./statements.balances")), balancesFor: vi.fn(), loadChart: vi.fn() }))
import prisma from "../../config/prisma"
import { Prisma } from "../../generated/prisma/client"
import { balancesFor, loadChart } from "./statements.balances"
import { statementNotes } from "./statements.notes"
import { utcDate } from "../accounting/accounting.utils"
const D = (v: string | number) => new Prisma.Decimal(v)
const range = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }
const rows = [
  { id: "admin", code: "5200", name: "Administrative & Selling Expenses", type: "EXPENSE", parentId: null, isGroup: true, isActive: true, systemRole: null, noteRef: "17.00", cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "salary", code: "5201", name: "Salary and Allowances", type: "EXPENSE", parentId: "admin", isGroup: false, isActive: true, systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "pay", code: "2110", name: "Trade and other Payables", type: "LIABILITY", parentId: null, isGroup: false, isActive: true, systemRole: null, noteRef: "12.00", cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
]
const chart = { all: rows, byId: new Map(rows.map((r) => [r.id, r])), byRole: new Map(), byNoteRef: new Map([["17.00", rows[0]], ["12.00", rows[2]]]), childrenOf: (id: string) => rows.filter((r) => r.parentId === id), leavesUnder: (id: string) => rows.filter((r) => r.parentId === id), equityRoot: rows[0] }
beforeEach(() => { vi.clearAllMocks(); (loadChart as any).mockResolvedValue(chart); (balancesFor as any).mockResolvedValue(new Map([["salary", { debit: D(0), credit: D(0), signed: D("120000") }], ["pay", { debit: D(0), credit: D(0), signed: D("117000") }]])); (prisma.statementNote.findMany as any).mockResolvedValue([]) })
describe("statementNotes", () => {
  it("breaks group and leaf anchors into rows", async () => { const r = await statementNotes(range); const by = Object.fromEntries(r.notes.map((n) => [n.ref, n])); expect(by["17.00"].rows[0].code).toBe("5201"); expect(by["12.00"].rows).toHaveLength(1) })
  it("merges narrative text and sorts refs numerically", async () => { (prisma.statementNote.findMany as any).mockResolvedValue([{ ref: "10.00", title: "Ten", body: "text", sortOrder: 0 }, { ref: "2.08", title: "Two", body: "policy", sortOrder: 0 }]); const r = await statementNotes(range); expect(r.notes.map((n) => n.ref)).toEqual(["2.08", "10.00", "12.00", "17.00"]); expect(r.notes[0].body).toBe("policy") })
})
