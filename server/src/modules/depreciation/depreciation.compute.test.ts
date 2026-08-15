import { describe, expect, it } from "vitest"

import { dec } from "../payroll/payroll.money"
import { computeCharges, type DepreciableAsset, type PriorCharge } from "./depreciation.compute"

const FY_START = 7 // July, per the audited accounts

const laptop = (over: Partial<DepreciableAsset> = {}): DepreciableAsset => ({
  id: "a-1",
  assetTag: "BS-AST-00001",
  purchaseDate: new Date("2026-07-01T00:00:00.000Z"),
  purchaseCostBdt: dec(120000),
  capitalisedAt: new Date("2026-07-05T00:00:00.000Z"),
  rate: dec(20),
  classAccountCode: "1114",
  costNature: "ADMINISTRATIVE",
  stoppedAt: null,
  ...over,
})

/** Every month of FY 2026-27 up to and including `month`/`year`. */
function runYear(asset: DepreciableAsset, months: Array<[number, number]>): PriorCharge[] {
  const prior: PriorCharge[] = []
  for (const [year, month] of months) {
    const [charge] = computeCharges([asset], prior, { year, month }, FY_START)
    if (charge) prior.push({ assetId: asset.id, year, month, amount: charge.amount })
  }
  return prior
}

const FY_2026_27: Array<[number, number]> = [
  [2026, 7], [2026, 8], [2026, 9], [2026, 10], [2026, 11], [2026, 12],
  [2027, 1], [2027, 2], [2027, 3], [2027, 4], [2027, 5], [2027, 6],
]

describe("computeCharges", () => {
  it("charges exactly cost × rate over a full first year", () => {
    const prior = runYear(laptop(), FY_2026_27)
    const total = prior.reduce((t, p) => t.plus(p.amount), dec(0))
    expect(total.toFixed(2)).toBe("24000.00") // 120,000 × 20%
  })

  it("charges year two on the written-down value, not on cost", () => {
    const asset = laptop()
    const prior = runYear(asset, FY_2026_27)
    const [july] = computeCharges([asset], prior, { year: 2027, month: 7 }, FY_START)
    // Opening WDV 96,000 × 20% ÷ 12
    expect(july.amount.toFixed(2)).toBe("1600.00")
    expect(july.openingBookValue.toFixed(2)).toBe("96000.00")
  })

  /** Spec Decision 6: charged from the month of acquisition. */
  it("charges a November purchase for eight months in its first year", () => {
    const asset = laptop({
      purchaseDate: new Date("2026-11-14T00:00:00.000Z"),
      capitalisedAt: new Date("2026-11-20T00:00:00.000Z"),
    })
    const prior = runYear(asset, FY_2026_27)
    expect(prior).toHaveLength(8) // Nov, Dec, Jan … Jun
    const total = prior.reduce((t, p) => t.plus(p.amount), dec(0))
    expect(total.toFixed(2)).toBe("16000.00") // 120,000 × 20% ÷ 12 × 8
  })

  it("charges a whole late catch-up in the first run that follows", () => {
    // Bought in November, capitalised in February: the February run charges
    // November through February, four months, at once.
    const asset = laptop({
      purchaseDate: new Date("2026-11-14T00:00:00.000Z"),
      capitalisedAt: new Date("2027-02-03T00:00:00.000Z"),
    })
    const [charge] = computeCharges([asset], [], { year: 2027, month: 2 }, FY_START)
    expect(charge.months).toBe(4)
    expect(charge.amount.toFixed(2)).toBe("8000.00")
  })

  it("never charges an asset below zero", () => {
    const asset = laptop({ purchaseCostBdt: dec(1000), rate: dec(90) })
    let prior: PriorCharge[] = []
    for (let y = 0; y < 30; y++) prior = runYear(asset, FY_2026_27.map(([yr, m]) => [yr + y, m]))
    const total = prior.reduce((t, p) => t.plus(p.amount), dec(0))
    expect(total.lessThanOrEqualTo(dec(1000))).toBe(true)
  })

  it("emits no row for a fully depreciated asset", () => {
    const asset = laptop({ purchaseCostBdt: dec(1200), rate: dec(100) })
    const prior: PriorCharge[] = [{ assetId: "a-1", year: 2026, month: 7, amount: dec(1200) }]
    expect(computeCharges([asset], prior, { year: 2026, month: 8 }, FY_START)).toEqual([])
  })

  /** The month of disposal is charged in full; a part-month convention is
   *  precision the filed accounts do not have. */
  it("charges the month an asset is disposed of and not the month after", () => {
    const asset = laptop({ stoppedAt: new Date("2026-09-20T00:00:00.000Z") })
    expect(computeCharges([asset], [], { year: 2026, month: 9 }, FY_START)).toHaveLength(1)
    const prior = runYear(asset, [[2026, 7], [2026, 8], [2026, 9]])
    expect(computeCharges([asset], prior, { year: 2026, month: 10 }, FY_START)).toEqual([])
  })

  it("skips an asset that has not been capitalised", () => {
    const asset = { ...laptop(), capitalisedAt: null } as unknown as DepreciableAsset
    expect(computeCharges([asset], [], { year: 2026, month: 7 }, FY_START)).toEqual([])
  })

  it("recomputes the opening value at the financial-year boundary mid-catch-up", () => {
    // Bought July 2026, capitalised August 2027: the catch-up spans a
    // year-end, so the first twelve months charge at 120,000 × 20% and the
    // next two at 96,000 × 20% ÷ 12.
    const asset = laptop({ capitalisedAt: new Date("2027-08-10T00:00:00.000Z") })
    const [charge] = computeCharges([asset], [], { year: 2027, month: 8 }, FY_START)
    expect(charge.months).toBe(14)
    expect(charge.amount.toFixed(2)).toBe("27200.00") // 24,000 + 1,600 × 2
  })

  it("carries the class account and cost nature through untouched", () => {
    const [charge] = computeCharges(
      [laptop({ classAccountCode: "1111", costNature: "DIRECT" })],
      [], { year: 2026, month: 7 }, FY_START
    )
    expect(charge.classAccountCode).toBe("1111")
    expect(charge.costNature).toBe("DIRECT")
  })
})
