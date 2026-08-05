import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    operatingCost: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      costCategory: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import { commitCostImport, previewCostImport } from "./cost.import"

const tx = (prisma as unknown as { __tx: any }).__tx
const finance = { sub: "user-fin", role: "FINANCE_OFFICER", email: "fin@demo.com", mustChangePassword: false } as never

const csv = (body: string) => Buffer.from(body, "utf8")
const HEADER = "categorycode,label,payee,periodmonth,periodyear,amount,paidat\n"

beforeEach(() => {
  vi.clearAllMocks()
  const categories = [{ id: "cat-1", code: "RENT" }, { id: "cat-2", code: "ELECTRICITY" }]
  vi.mocked(prisma.costCategory.findMany).mockResolvedValue(categories as never)
  tx.auditLog.create.mockResolvedValue({})
})

describe("previewCostImport", () => {
  it("flags an unknown category code", async () => {
    const result = await previewCostImport(
      csv(`${HEADER}NOPE,Rent,Landlord,1,2026,1000,\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "categoryCode" })
    )
  })

  it("flags a periodMonth of 13", async () => {
    const result = await previewCostImport(
      csv(`${HEADER}RENT,Rent,Landlord,13,2026,1000,\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "periodMonth" })
    )
  })

  it("flags a periodYear in the future", async () => {
    const farFuture = new Date().getUTCFullYear() + 5
    const result = await previewCostImport(
      csv(`${HEADER}RENT,Rent,Landlord,1,${farFuture},1000,\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "periodYear" })
    )
  })

  it("flags a negative amount", async () => {
    const result = await previewCostImport(
      csv(`${HEADER}RENT,Rent,Landlord,1,2026,-500,\n`),
      "r.csv"
    )

    expect(result.issues).toContainEqual(
      expect.objectContaining({ rowNumber: 2, column: "amount" })
    )
  })

  it("does not write anything", async () => {
    await previewCostImport(csv(`${HEADER}RENT,Rent,Landlord,1,2026,1000,\n`), "r.csv")

    expect(tx.operatingCost.create).not.toHaveBeenCalled()
  })
})

describe("commitCostImport", () => {
  it("lands a row carrying paidAt as PAID, and one without as PENDING", async () => {
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1" })

    await commitCostImport(
      csv(
        `${HEADER}RENT,Rent,Landlord,1,2026,1000,2026-01-05\nELECTRICITY,Power,DESCO,2,2026,500,\n`
      ),
      "r.csv",
      finance
    )

    expect(tx.operatingCost.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        data: expect.objectContaining({ status: "PAID", paidBy: "user-fin" }),
      })
    )
    expect(tx.operatingCost.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        data: expect.objectContaining({ status: "PENDING", paidAt: null, paidBy: null }),
      })
    )
  })

  it("writes nothing at all when one row is bad", async () => {
    await expect(
      commitCostImport(
        csv(`${HEADER}RENT,Rent,Landlord,1,2026,1000,\nRENT,Bad,Landlord,13,2026,1000,\n`),
        "r.csv",
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(tx.operatingCost.create).not.toHaveBeenCalled()
  })

  it("does not link imported bills to a commitment", async () => {
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1" })

    await commitCostImport(csv(`${HEADER}RENT,Rent,Landlord,1,2026,1000,\n`), "r.csv", finance)

    expect(tx.operatingCost.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ commitmentId: null }) })
    )
  })

  it("writes an IMPORT audit row per created bill", async () => {
    tx.operatingCost.create.mockResolvedValue({ id: "cost-1" })

    await commitCostImport(
      csv(`${HEADER}RENT,Rent,Landlord,1,2026,1000,\nELECTRICITY,Power,DESCO,2,2026,500,\n`),
      "r.csv",
      finance
    )

    expect(tx.auditLog.create).toHaveBeenCalledTimes(2)
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "IMPORT", entity: "COST" }) })
    )
  })
})
