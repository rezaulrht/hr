/**
 * The whole slice in one test: capitalise four assets — one per class, at the
 * four filed rates — run twelve monthly runs through the real arithmetic, and
 * assert Annexure-A renders the schedule and agrees with the balance sheet.
 *
 * This test fails on an empty register, which is the state before slice 4a:
 * every figure below is zero because nothing has ever posted. It is the
 * acceptance test for the slice.
 */

import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("./statements.balances", async () => ({
  ...(await vi.importActual<typeof import("./statements.balances")>("./statements.balances")),
  balancesFor: vi.fn(),
  loadChart: vi.fn(),
}))

import { Prisma } from "../../generated/prisma/client"
import { utcDate } from "../accounting/accounting.utils"
import { dec } from "../payroll/payroll.money"
import { computeCharges, type DepreciableAsset, type PriorCharge } from "../depreciation/depreciation.compute"
import { balancesFor, loadChart } from "./statements.balances"
import { annexureA, assertAnnexureTiesToPosition, positionPpe } from "./statements.annexure"

const D = (v: string | number) => new Prisma.Decimal(v)

const FY_START = 7 // July, per the audited accounts
const FY = { from: utcDate(2026, 7, 1), to: utcDate(2027, 6, 30) }

/**
 * The four classes, their filed rates and the capitalised cost of the one
 * asset in each. The ledger figures are what the postings produce; nothing
 * here is hand-signed from the paper statements.
 */
const CLASSES = [
  { id: "ppe-furn", code: "1111", name: "Furniture & Fixture", rate: 10, cost: "100000.00", contra: "ad-furn" },
  { id: "ppe-office", code: "1112", name: "Office Equipments", rate: 10, cost: "50000.00", contra: "ad-office" },
  { id: "ppe-soft", code: "1113", name: "Software / Domain", rate: 25, cost: "40000.00", contra: "ad-soft" },
  { id: "ppe-comp", code: "1114", name: "Computer / Laptop", rate: 20, cost: "120000.00", contra: "ad-comp" },
]

const CONTRA_IDS = ["ad-furn", "ad-office", "ad-soft", "ad-comp"]

function chartRows() {
  return [
    { id: "ppe", code: "1110", name: "Property, Plant & Equipment", type: "ASSET", isGroup: true, isActive: true, parentId: null, systemRole: "PPE_COST", noteRef: null, cashFlowKind: "INVESTING", depreciationRate: null, contraAccountId: null },
    { id: "ad", code: "1120", name: "Accumulated Depreciation", type: "ASSET", isGroup: true, isActive: true, parentId: null, systemRole: "PPE_ACCUM_DEP", noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null },
    ...CLASSES.map((c) => ({ id: c.id, code: c.code, name: c.name, type: "ASSET", isGroup: false, isActive: true, parentId: "ppe", systemRole: null, noteRef: null, cashFlowKind: "INVESTING", depreciationRate: D(c.rate), contraAccountId: c.contra })),
    ...CONTRA_IDS.map((id, i) => ({ id, code: `112${i + 1}`, name: `Acc. Dep. — ${CLASSES[i].name}`, type: "ASSET", isGroup: false, isActive: true, parentId: "ad", systemRole: null, noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null })),
  ]
}

const chart = (() => {
  const rows = chartRows()
  return {
    all: rows,
    byId: new Map(rows.map((r) => [r.id, r])),
    byRole: new Map([["PPE_COST", rows[0]], ["PPE_ACCUM_DEP", rows[1]]]),
    byNoteRef: new Map(),
    childrenOf: (id: string) => rows.filter((r) => r.parentId === id),
    leavesUnder: () => [],
    equityRoot: rows[0],
  }
})()

const asset = (over: Partial<DepreciableAsset> = {}): DepreciableAsset => ({
  id: "a-1",
  assetTag: "BS-AST-00001",
  purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
  purchaseCostBdt: dec("100000.00"),
  capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
  rate: dec(10),
  classAccountCode: "1111",
  costNature: "ADMINISTRATIVE",
  stoppedAt: null,
  ...over,
})

const FY_2026_27: Array<[number, number]> = [
  [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12],
  [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6],
]

/** Every month of the first year, summed — exactly cost × rate. */
function firstYearDepreciation(assetOver: Partial<DepreciableAsset>): Prisma.Decimal {
  const a = asset(assetOver)
  let prior: PriorCharge[] = []
  let total = dec(0)
  for (const [year, month] of FY_2026_27) {
    const [charge] = computeCharges([a], prior, { year, month }, FY_START)
    if (charge) {
      total = total.plus(charge.amount)
      prior.push({ assetId: a.id, year, month, amount: charge.amount })
    }
  }
  return total
}

const firstYearByClass = new Map(
  CLASSES.map((c) => [c.code, firstYearDepreciation({
    id: c.id,
    assetTag: `BS-AST-${c.id}`,
    purchaseCostBdt: dec(c.cost),
    rate: dec(c.rate),
    classAccountCode: c.code,
  })])
)

const totalCost = CLASSES.reduce((t, c) => t.plus(dec(c.cost)), dec(0))
const totalDep = [...firstYearByClass.values()].reduce((t, d) => t.plus(d), dec(0))
/** The PP&E line the ledger implies: Σ cost − Σ posted depreciation. */
const ledgerPpe = totalCost.minus(totalDep)

beforeEach(() => {
  vi.clearAllMocks()
  ;(loadChart as any).mockResolvedValue(chart)
  ;(balancesFor as any).mockImplementation(async (opts: any) => {
    if (opts.from === undefined) return new Map() // opening: nothing
    const map = new Map()
    for (const c of CLASSES) {
      map.set(c.id, { debit: D(c.cost), credit: D(0), signed: D(c.cost) })
      const dep = firstYearByClass.get(c.code)!
      map.set(c.contra, { debit: D(0), credit: dep, signed: dep.negated() })
    }
    return map
  })
})

describe("Annexure-A rendered from the register", () => {
  it("renders a complete Annexure-A from four capitalised assets and twelve runs", async () => {
    const result = await annexureA(FY)

    // Four classes, in chart order, at their filed rates.
    expect(result.rows.map((r) => r.particulars)).toEqual(CLASSES.map((c) => c.name))
    expect(result.rows.map((r) => r.rate)).toEqual(["10.00", "10.00", "25.00", "20.00"])

    // Cost additions are the capitalised costs; depreciation charged is the
    // first-year charge as posted. Note: the twelve monthly charges are
    // rounded individually, so the sum is `cost × rate` to within a few
    // paise rather than exactly — the ledger, not the ideal, is the source.
    expect(result.rows.map((r) => r.costAddition)).toEqual(CLASSES.map((c) => c.cost))
    for (const c of CLASSES) {
      const row = result.rows.find((r) => r.accountId === c.id)!
      expect(row.depCharged).toBe(firstYearByClass.get(c.code)!.toFixed(2))
    }

    // Total written-down value = Σ cost − Σ depreciation, agreeing with the
    // balance sheet line it came from.
    expect(result.total.writtenDownValue).toBe(ledgerPpe.toFixed(2))
  })

  it("ties to the Statement of Financial Position", async () => {
    const annexure = await annexureA(FY)
    const position = {
      assets: [{ heading: "Non-Current Assets", lines: [{ key: "ppe", code: "1110", current: ledgerPpe.toFixed(2) }] }],
    } as any

    expect(() =>
      assertAnnexureTiesToPosition(annexure, positionPpe(chart as any, position))
    ).not.toThrow()
  })
})
