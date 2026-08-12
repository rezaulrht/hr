import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    account: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    journalLine: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      account: { findMany: vi.fn(), findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import {
  createAccount,
  deleteAccount,
  listAccounts,
  requirePostableAccounts,
  updateAccount,
} from "./accounting.coa.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const finance = {
  sub: "user-finance",
  role: "FINANCE_OFFICER",
  email: "finance@demo.com",
  mustChangePassword: false,
} as never

beforeEach(() => {
  vi.clearAllMocks()
  tx.auditLog.create.mockResolvedValue({})
  tx.account.findFirst.mockResolvedValue(null)
  tx.journalLine.count.mockResolvedValue(0)
  tx.account.count.mockResolvedValue(0)
})

describe("createAccount", () => {
  it("creates a leaf under a group parent", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "grp-1", isGroup: true, type: "EXPENSE" })
    tx.account.create.mockResolvedValue({ id: "acc-1", code: "5201" })

    await createAccount(
      { code: "5201", name: "Salary and Allowances", type: "EXPENSE", parentId: "grp-1", isGroup: false, cashKind: "NONE" },
      finance
    )

    expect(tx.account.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ code: "5201", parentId: "grp-1" }) })
    )
  })

  it("400s when the code's first digit contradicts the type", async () => {
    await expect(
      createAccount(
        { code: "1300", name: "Rent", type: "EXPENSE", isGroup: false, cashKind: "NONE" },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })

    expect(tx.account.create).not.toHaveBeenCalled()
  })

  it("409s on a duplicate code, naming the account already using it", async () => {
    tx.account.findFirst.mockResolvedValue({ id: "acc-x", code: "5201", name: "Salary" })

    await expect(
      createAccount(
        { code: "5201", name: "Wages", type: "EXPENSE", isGroup: false, cashKind: "NONE" },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 409, message: expect.stringContaining("Salary") })
  })

  it("400s when the parent is a leaf — a posted leaf cannot silently become a header", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "acc-p", isGroup: false, type: "EXPENSE" })

    await expect(
      createAccount(
        { code: "5202", name: "Bonus", type: "EXPENSE", parentId: "acc-p", isGroup: false, cashKind: "NONE" },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("400s when the parent's type differs — a child cannot cross statements", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "grp-1", isGroup: true, type: "ASSET" })

    await expect(
      createAccount(
        { code: "5201", name: "Salary", type: "EXPENSE", parentId: "grp-1", isGroup: false, cashKind: "NONE" },
        finance
      )
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("writes an ACCOUNT CREATE audit row inside the transaction", async () => {
    tx.account.create.mockResolvedValue({ id: "acc-1", code: "5201" })

    await createAccount(
      { code: "5201", name: "Salary", type: "EXPENSE", isGroup: false, cashKind: "NONE" },
      finance
    )

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "ACCOUNT", action: "CREATE", changedBy: "user-finance" }),
      })
    )
  })
})

describe("updateAccount", () => {
  it("records only the changed fields in the audit before/after", async () => {
    tx.account.findUnique.mockResolvedValue({
      id: "acc-1",
      code: "5201",
      name: "Salary",
      type: "EXPENSE",
      parentId: "grp-1",
      isGroup: false,
      cashKind: "NONE",
      isActive: true,
      description: null,
    })
    tx.account.update.mockResolvedValue({ id: "acc-1", name: "Salary and Allowances" })

    await updateAccount("acc-1", { name: "Salary and Allowances" }, finance)

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "ACCOUNT",
          action: "UPDATE",
          before: { name: "Salary" },
          after: { name: "Salary and Allowances" },
        }),
      })
    )
  })

  it("404s an unknown account", async () => {
    tx.account.findUnique.mockResolvedValue(null)

    await expect(updateAccount("nope", { name: "X" }, finance)).rejects.toMatchObject({
      statusCode: 404,
    })
  })
})

describe("deleteAccount", () => {
  it("deletes an account nothing references", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "acc-1", code: "5201", name: "Salary" })

    await deleteAccount("acc-1", finance)

    expect(tx.account.delete).toHaveBeenCalledWith({ where: { id: "acc-1" } })
  })

  it("409s when any journal line references it — draft lines count too", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "acc-1", code: "5201", name: "Salary" })
    tx.journalLine.count.mockResolvedValue(3)

    await expect(deleteAccount("acc-1", finance)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("Deactivate"),
    })

    expect(tx.account.delete).not.toHaveBeenCalled()
  })

  it("409s when it has children", async () => {
    tx.account.findUnique.mockResolvedValue({ id: "grp-1", code: "5200", name: "Admin" })
    tx.account.count.mockResolvedValue(2)

    await expect(deleteAccount("grp-1", finance)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s on a system-role account whatever else is true", async () => {
    tx.account.findUnique.mockResolvedValue({
      id: "acc-re",
      code: "3300",
      name: "Retained Earnings",
      systemRole: "RETAINED_EARNINGS",
    })

    await expect(deleteAccount("acc-re", finance)).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("requirePostableAccounts", () => {
  it("returns a lookup keyed by id when every account is an active leaf", async () => {
    tx.account.findMany.mockResolvedValue([
      { id: "a", code: "5201", isGroup: false, isActive: true },
      { id: "b", code: "2132", isGroup: false, isActive: true },
    ])

    const map = await requirePostableAccounts(tx as never, ["a", "b"])

    expect(map.get("a")?.code).toBe("5201")
    expect(map.size).toBe(2)
  })

  it("400s naming the account when one is a group", async () => {
    tx.account.findMany.mockResolvedValue([
      { id: "a", code: "5200", name: "Administrative & Selling", isGroup: true, isActive: true },
      { id: "b", code: "2132", name: "Salary Payable", isGroup: false, isActive: true },
    ])

    await expect(requirePostableAccounts(tx as never, ["a", "b"])).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("5200"),
    })
  })

  it("400s naming the account when one is inactive", async () => {
    tx.account.findMany.mockResolvedValue([
      { id: "a", code: "5201", name: "Salary", isGroup: false, isActive: false },
    ])

    await expect(requirePostableAccounts(tx as never, ["a"])).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining("5201"),
    })
  })

  it("400s when an id does not resolve at all", async () => {
    tx.account.findMany.mockResolvedValue([])

    await expect(requirePostableAccounts(tx as never, ["ghost"])).rejects.toMatchObject({
      statusCode: 400,
    })
  })
})

describe("listAccounts", () => {
  it("nests children under parents and sorts each level by code", async () => {
    // Rows arrive code-ordered from the query; the mock must match.
    ;(prisma.account.findMany as any).mockResolvedValue([
      { id: "g1", code: "5200", name: "Admin", type: "EXPENSE", parentId: null, isGroup: true, cashKind: "NONE", isActive: true, systemRole: "ADMIN_SELLING", description: null },
      { id: "c1", code: "5201", name: "Salary", type: "EXPENSE", parentId: "g1", isGroup: false, cashKind: "NONE", isActive: true, systemRole: null, description: null },
      { id: "c2", code: "5206", name: "Office Rent", type: "EXPENSE", parentId: "g1", isGroup: false, cashKind: "NONE", isActive: true, systemRole: null, description: null },
    ])

    const tree = await listAccounts()

    expect(tree).toHaveLength(1)
    expect(tree[0].children.map((c) => c.code)).toEqual(["5201", "5206"])
  })
})
