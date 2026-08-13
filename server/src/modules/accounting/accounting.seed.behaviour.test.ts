import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: { account: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn() } },
}))

import prisma from "../../config/prisma"
import { seedChartOfAccounts } from "./accounting.seed"

const upsertFor = (code: string) =>
  (prisma.account.upsert as any).mock.calls.find((c: any) => c[0].where.code === code)[0]

beforeEach(() => {
  vi.clearAllMocks()
  ;(prisma.account.findUnique as any).mockResolvedValue(null)
  ;(prisma.account.upsert as any).mockImplementation(async (args: any) => ({
    id: `id-${args.where.code}`,
  }))
})

describe("seedChartOfAccounts on a fresh database", () => {
  it("classifies every account it creates", async () => {
    await seedChartOfAccounts()

    expect(upsertFor("1220").update.cashFlowKind).toBe("OPERATING_WC")
    expect(upsertFor("1242").update.cashFlowKind).toBe("CASH")
    expect(upsertFor("5215").update.cashFlowKind).toBe("NON_CASH_ADDBACK")
    expect(upsertFor("1111").update.depreciationRate?.toString()).toBe("10")
    expect(upsertFor("1110").update.noteRef).toBe("4.00")
  })

  it("links each PP&E cost account to its accumulated-depreciation account", async () => {
    await seedChartOfAccounts()

    const links = (prisma.account.update as any).mock.calls.map((c: any) => [
      c[0].where.id,
      c[0].data.contraAccountId,
    ])
    expect(links).toEqual([
      ["id-1111", "id-1121"],
      ["id-1112", "id-1122"],
      ["id-1113", "id-1123"],
      ["id-1114", "id-1124"],
    ])
  })
})

describe("seedChartOfAccounts on a database somebody has edited", () => {
  /**
   * The seed used to set noteRef, cashFlowKind and depreciationRate on every
   * run, beneath a comment promising it overwrote nothing.
   *
   * That matters because `assertEveryAccountClassified`'s error tells people
   * to set a cash-flow section in the chart of accounts — and for a seeded
   * code, the next deploy would have silently undone them.
   */
  it("leaves a deliberately moved cash-flow section alone", async () => {
    ;(prisma.account.findUnique as any).mockImplementation(async ({ where }: any) =>
      where.code === "1220"
        ? { noteRef: "7.00", cashFlowKind: "FINANCING", depreciationRate: null, contraAccountId: null }
        : null
    )

    await seedChartOfAccounts()

    expect(upsertFor("1220").update).not.toHaveProperty("cashFlowKind")
    expect(upsertFor("1220").update).not.toHaveProperty("noteRef")
  })

  it("still repairs a classification somebody cleared", async () => {
    ;(prisma.account.findUnique as any).mockImplementation(async ({ where }: any) =>
      where.code === "1220"
        ? { noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: null }
        : null
    )

    await seedChartOfAccounts()

    expect(upsertFor("1220").update.cashFlowKind).toBe("OPERATING_WC")
    expect(upsertFor("1220").update.noteRef).toBe("7.00")
  })

  it("leaves a re-pointed contra link alone", async () => {
    ;(prisma.account.findUnique as any).mockImplementation(async ({ where }: any) =>
      where.code === "1111"
        ? { noteRef: null, cashFlowKind: "NONE", depreciationRate: null, contraAccountId: "somewhere-else" }
        : null
    )

    await seedChartOfAccounts()

    const linked = (prisma.account.update as any).mock.calls.map((c: any) => c[0].where.id)
    expect(linked).not.toContain("id-1111")
    expect(linked).toContain("id-1112")
  })
})
