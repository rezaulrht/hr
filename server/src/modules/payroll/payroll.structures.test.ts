import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    exchangeRate: { create: vi.fn(), update: vi.fn() },
    salaryStructure: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    salaryComponent: { deleteMany: vi.fn() },
    auditLog: { create: vi.fn() },
  }
  return {
    default: {
      exchangeRate: { findMany: vi.fn(), findUnique: vi.fn() },
      salaryStructure: { findMany: vi.fn(), findUnique: vi.fn() },
      employee: { count: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import {
  createExchangeRate,
  createSalaryStructure,
  listExchangeRates,
  updateExchangeRate,
  deleteSalaryStructure,
  listSalaryStructures,
  updateSalaryStructure,
} from "./payroll.service"
import { exchangeRateBody, salaryStructureBody } from "./payroll.validators"
import { dec } from "./payroll.money"

const tx = (prisma as unknown as { __tx: any }).__tx

afterEach(() => {
  vi.clearAllMocks()
})

const bdtStructure = {
  name: "Standard (BDT)",
  currency: "BDT" as const,
  basic: 50000,
  isActive: true,
  components: [
    { code: "HOUSE_RENT", label: "House rent", kind: "EARNING" as const, calc: "PERCENT_OF_BASIC" as const, value: 50, sortOrder: 1, countsAsWages: true },
    { code: "PF", label: "Provident fund", kind: "DEDUCTION" as const, calc: "PERCENT_OF_BASIC" as const, value: 10, sortOrder: 1, countsAsWages: false },
  ],
}

describe("salaryStructureBody validation", () => {
  it("400s a duplicate component code", () => {
    expect(() =>
      salaryStructureBody.parse({
        ...bdtStructure,
        components: [bdtStructure.components[0], { ...bdtStructure.components[0] }],
      })
    ).toThrow(/[Uu]nique/)
  })

  it("400s a PERCENT_OF_BASIC value of 150", () => {
    expect(() =>
      salaryStructureBody.parse({
        ...bdtStructure,
        components: [{ ...bdtStructure.components[0], value: 150 }],
      })
    ).toThrow()
  })

  // The ordinary private-sector case: one negotiated monthly figure, no
  // allowance split. Previously rejected for having no EARNING component,
  // which forbade the simplest valid structure there is.
  it("accepts a structure with no components at all", () => {
    const parsed = salaryStructureBody.parse({ ...bdtStructure, components: [] })
    expect(parsed.components).toEqual([])
    expect(parsed.basic).toBe(50000)
  })

  it("defaults components to an empty array when the key is absent", () => {
    const { components: _omitted, ...withoutComponents } = bdtStructure
    expect(salaryStructureBody.parse(withoutComponents).components).toEqual([])
  })

  it("accepts a structure with only deductions — salary less tax is a real band", () => {
    expect(() =>
      salaryStructureBody.parse({ ...bdtStructure, components: [bdtStructure.components[1]] })
    ).not.toThrow()
  })

  it("accepts a well-formed structure", () => {
    expect(() => salaryStructureBody.parse(bdtStructure)).not.toThrow()
  })
})

describe("exchangeRateBody validation", () => {
  it("rejects base === quote", () => {
    expect(() =>
      exchangeRateBody.parse({ base: "USD", quote: "USD", rate: 122.5, effectiveFrom: "2026-01-01" })
    ).toThrow()
  })

  it("rejects a non-positive rate", () => {
    expect(() =>
      exchangeRateBody.parse({ base: "USD", quote: "BDT", rate: 0, effectiveFrom: "2026-01-01" })
    ).toThrow()
  })

  it("accepts a well-formed rate", () => {
    expect(() =>
      exchangeRateBody.parse({ base: "USD", quote: "BDT", rate: 122.5, effectiveFrom: "2026-01-01" })
    ).not.toThrow()
  })
})

describe("createExchangeRate", () => {
  it("writes an audit row in the same transaction", async () => {
    tx.exchangeRate.create.mockResolvedValue({
      id: "rate-1",
      base: "USD",
      quote: "BDT",
      rate: dec("122.5"),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    })
    await createExchangeRate("user-finance", {
      base: "USD",
      quote: "BDT",
      rate: 122.5,
      effectiveFrom: "2026-01-01",
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "EXCHANGE_RATE", action: "CREATE" }),
      })
    )
  })

  it("409s on a duplicate (base, quote, effectiveFrom)", async () => {
    tx.exchangeRate.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" })
    )
    await expect(
      createExchangeRate("user-finance", {
        base: "USD",
        quote: "BDT",
        rate: 122.5,
        effectiveFrom: "2026-01-01",
      })
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("updateExchangeRate", () => {
  it("404s for an unknown id", async () => {
    vi.mocked(prisma.exchangeRate.findUnique).mockResolvedValue(null)
    await expect(
      updateExchangeRate("nope", "user-finance", {
        base: "USD",
        quote: "BDT",
        rate: 122.5,
        effectiveFrom: "2026-01-01",
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it("writes before/after to the audit row", async () => {
    const existing = {
      id: "rate-1",
      base: "USD",
      quote: "BDT",
      rate: dec("120"),
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
    }
    vi.mocked(prisma.exchangeRate.findUnique).mockResolvedValue(existing as never)
    tx.exchangeRate.update.mockResolvedValue({ ...existing, rate: dec("122.5") })
    await updateExchangeRate("rate-1", "user-finance", {
      base: "USD",
      quote: "BDT",
      rate: 122.5,
      effectiveFrom: "2026-01-01",
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "UPDATE",
          before: expect.objectContaining({ rate: "120.000000" }),
          after: expect.objectContaining({ rate: "122.500000" }),
        }),
      })
    )
  })
})

describe("createSalaryStructure", () => {
  it("creates with its components and writes an audit row", async () => {
    tx.salaryStructure.create.mockResolvedValue({
      id: "struct-1",
      ...bdtStructure,
      basic: dec(50000),
      components: bdtStructure.components.map((c) => ({ ...c, value: dec(c.value) })),
    })
    await createSalaryStructure("user-finance", bdtStructure)
    expect(tx.salaryStructure.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          components: { create: expect.arrayContaining([expect.objectContaining({ code: "HOUSE_RENT" })]) },
        }),
      })
    )
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "SALARY_STRUCTURE", action: "CREATE" }),
      })
    )
  })

  it("409s on a duplicate name", async () => {
    tx.salaryStructure.create.mockRejectedValue(
      Object.assign(new Error("Unique constraint"), { code: "P2002" })
    )
    await expect(createSalaryStructure("user-finance", bdtStructure)).rejects.toMatchObject({
      statusCode: 409,
    })
  })
})

describe("updateSalaryStructure", () => {
  const existing = {
    id: "struct-1",
    ...bdtStructure,
    basic: dec(50000),
    components: bdtStructure.components.map((c) => ({ ...c, value: dec(c.value) })),
  }

  it("404s for an unknown id", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(null)
    await expect(updateSalaryStructure("nope", "user-finance", bdtStructure)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("409s a currency change", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    await expect(
      updateSalaryStructure("struct-1", "user-finance", { ...bdtStructure, currency: "USD" })
    ).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.salaryComponent.deleteMany).not.toHaveBeenCalled()
  })

  it("409s deactivating a structure that employees still point at", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.employee.count).mockResolvedValue(3)
    await expect(
      updateSalaryStructure("struct-1", "user-finance", { ...bdtStructure, isActive: false })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("allows deactivating once nobody is assigned", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.employee.count).mockResolvedValue(0)
    tx.salaryStructure.update.mockResolvedValue({ ...existing, isActive: false })
    await expect(
      updateSalaryStructure("struct-1", "user-finance", { ...bdtStructure, isActive: false })
    ).resolves.toBeTruthy()
  })

  it("replaces components wholesale — deletes then recreates", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    tx.salaryStructure.update.mockResolvedValue(existing)
    await updateSalaryStructure("struct-1", "user-finance", bdtStructure)
    expect(tx.salaryComponent.deleteMany).toHaveBeenCalledWith({
      where: { salaryStructureId: "struct-1" },
    })
    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "UPDATE" }) })
    )
  })
})

describe("listExchangeRates", () => {
  it("orders newest first", async () => {
    await listExchangeRates()
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] })
    )
  })
})

describe("deleteSalaryStructure", () => {
  const existing = {
    id: "struct-1",
    ...bdtStructure,
    basic: dec(50000),
    components: bdtStructure.components.map((c) => ({ ...c, value: dec(c.value) })),
  }

  it("404s for an unknown id", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(null)
    await expect(deleteSalaryStructure("nope", "user-finance")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  // Prisma's default for an optional relation is SetNull, so deleting out
  // from under live assignments would quietly un-assign people and resurface
  // as preflight blocker 3 a month later.
  it("409s while employees are still assigned, and does not delete", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.employee.count).mockResolvedValue(3)

    await expect(deleteSalaryStructure("struct-1", "user-finance")).rejects.toMatchObject({
      statusCode: 409,
      details: { assigned: 3 },
    })
    expect(tx.salaryStructure.delete).not.toHaveBeenCalled()
  })

  it("deletes the structure and its components once nobody is on it", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.employee.count).mockResolvedValue(0)

    await expect(deleteSalaryStructure("struct-1", "user-finance")).resolves.toEqual({
      id: "struct-1",
    })
    expect(tx.salaryComponent.deleteMany).toHaveBeenCalledWith({
      where: { salaryStructureId: "struct-1" },
    })
    expect(tx.salaryStructure.delete).toHaveBeenCalledWith({ where: { id: "struct-1" } })
  })

  // An audit row naming only an id explains nothing a year later; the whole
  // band goes into `before` so a deleted structure stays reconstructable.
  it("audits the deletion with the full structure in `before`", async () => {
    vi.mocked(prisma.salaryStructure.findUnique).mockResolvedValue(existing as never)
    vi.mocked(prisma.employee.count).mockResolvedValue(0)

    await deleteSalaryStructure("struct-1", "user-finance")

    expect(tx.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "SALARY_STRUCTURE",
          action: "DELETE",
          changedBy: "user-finance",
          before: expect.objectContaining({ name: "Standard (BDT)" }),
        }),
      })
    )
  })
})

describe("listSalaryStructures", () => {
  it("reports how many employees are on each structure", async () => {
    // Without this the only way to learn a structure is in use is to press
    // Delete and read the refusal — a button whose purpose is to fail.
    vi.mocked(prisma.salaryStructure.findMany).mockResolvedValue([
      { id: "s-1", name: "Standard (BDT)", components: [], _count: { employees: 4 } },
      { id: "s-2", name: "Intern (BDT)", components: [], _count: { employees: 0 } },
    ] as never)

    const rows = await listSalaryStructures()

    expect(rows[0]).toMatchObject({ id: "s-1", employeeCount: 4 })
    expect(rows[1]).toMatchObject({ id: "s-2", employeeCount: 0 })
  })

  it("does not leak Prisma's _count into the response", async () => {
    // The shape a client reads should not say which ORM produced it.
    vi.mocked(prisma.salaryStructure.findMany).mockResolvedValue([
      { id: "s-1", components: [], _count: { employees: 4 } },
    ] as never)

    const rows = await listSalaryStructures()

    expect(rows[0]).not.toHaveProperty("_count")
  })
})
