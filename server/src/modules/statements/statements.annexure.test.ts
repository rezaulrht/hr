import { beforeEach, describe, expect, it, vi } from "vitest"
vi.mock("./statements.balances", async () => ({ ...(await vi.importActual<typeof import("./statements.balances")>("./statements.balances")), balancesFor: vi.fn(), loadChart: vi.fn() }))
import { Prisma } from "../../generated/prisma/client"
import { balancesFor, loadChart } from "./statements.balances"
import { annexureA } from "./statements.annexure"
import { utcDate } from "../accounting/accounting.utils"
const D = (v: string | number) => new Prisma.Decimal(v); const range = { from: utcDate(2024, 7, 1), to: utcDate(2025, 6, 30) }
const rows = [
  { id: "ppe", code: "1110", name: "Property, Plant & Equipment", type: "ASSET", isGroup: true, isActive: true, parentId: null, systemRole: "PPE_COST", noteRef: null, cashFlowKind: "INVESTING", depreciationRate: null, contraAccountId: null },
  { id: "ad", code: "1120", name: "Accumulated Depreciation", type: "ASSET", isGroup: true, isActive: true, parentId: null, systemRole: "PPE_ACCUM_DEP", noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "furn", code: "1111", name: "Furniture & Fixture", type: "ASSET", isGroup: false, isActive: true, parentId: "ppe", systemRole: null, noteRef: null, cashFlowKind: "INVESTING", depreciationRate: D("10"), contraAccountId: "ad-furn" },
  { id: "comp", code: "1114", name: "Computer / Laptop", type: "ASSET", isGroup: false, isActive: true, parentId: "ppe", systemRole: null, noteRef: null, cashFlowKind: "INVESTING", depreciationRate: D("20"), contraAccountId: "ad-comp" },
  { id: "ad-furn", code: "1121", name: "Acc. Dep. — Furniture & Fixture", type: "ASSET", isGroup: false, isActive: true, parentId: "ad", systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
  { id: "ad-comp", code: "1124", name: "Acc. Dep. — Computer / Laptop", type: "ASSET", isGroup: false, isActive: true, parentId: "ad", systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
]
const chart = { all: rows, byId: new Map(rows.map((r) => [r.id, r])), byRole: new Map([["PPE_COST", rows[0]], ["PPE_ACCUM_DEP", rows[1]]]), byNoteRef: new Map(), childrenOf: (id: string) => rows.filter((r) => r.parentId === id), leavesUnder: () => [], equityRoot: rows[0] }
beforeEach(() => { vi.clearAllMocks(); (loadChart as any).mockResolvedValue(chart); (balancesFor as any).mockImplementation(async (opts: any) => opts.from === undefined ? new Map() : new Map([["furn", { debit: D("60500"), credit: D(0), signed: D("60500") }], ["comp", { debit: D("95500"), credit: D(0), signed: D("95500") }], ["ad-furn", { debit: D(0), credit: D("6050"), signed: D("-6050") }], ["ad-comp", { debit: D(0), credit: D("23600"), signed: D("-23600") }]])) })
describe("annexureA", () => {
  it("uses debit additions, credit depreciation and disclosed rates", async () => { const r = await annexureA(range); expect(r.rows.map((x) => x.costAddition)).toEqual(["60500.00", "95500.00"]); expect(r.rows.map((x) => x.depCharged)).toEqual(["6050.00", "23600.00"]); expect(r.rows.map((x) => x.rate)).toEqual(["10.00", "20.00"]); expect(r.total.writtenDownValue).toBe("126350.00") })
  it("refuses a cost account without a contra link", async () => {
    const brokenRows = rows.map((r) => r.id === "comp" ? { ...r, contraAccountId: null } : r)
    const broken = { ...chart, all: brokenRows, byId: new Map(brokenRows.map((r) => [r.id, r])), childrenOf: (id: string) => brokenRows.filter((r) => r.parentId === id) }
    ;(loadChart as any).mockResolvedValue(broken)
    await expect(annexureA(range)).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("1114") })
  })
})
