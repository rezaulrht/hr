import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { assetScopeFor, canSeeCosts, stripCosts } from "./asset.access"

const viewer = (role: string, sub = "user-1") =>
  ({ sub, role, email: `${role}@demo.com`, mustChangePassword: false }) as never

const COST_ROLES = ["HR_ADMIN", "FINANCE_OFFICER", "SUPER_ADMIN"] as const
const STAFF_ROLES = ["EMPLOYEE", "REPORTING_MANAGER"] as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe("canSeeCosts", () => {
  it.each(COST_ROLES)("is true for %s", (role) => {
    expect(canSeeCosts(role as never)).toBe(true)
  })

  it.each(STAFF_ROLES)("is false for %s", (role) => {
    expect(canSeeCosts(role as never)).toBe(false)
  })
})

describe("assetScopeFor", () => {
  it.each(COST_ROLES)("returns an unrestricted scope for %s", async (role) => {
    await expect(assetScopeFor(viewer(role))).resolves.toEqual({})

    // The privileged roles short-circuit before any employee lookup.
    expect(prisma.employee.findUnique).not.toHaveBeenCalled()
  })

  it("fails CLOSED for a non-privileged account with no Employee row", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never)

    const scope = await assetScopeFor(viewer("EMPLOYEE"))

    // Asserting the exact shape, not merely "an object": `{}` is a valid
    // Prisma where-clause that matches the ENTIRE register. An inverted
    // condition here is a data-exposure bug, and a looser assertion would
    // pass straight through it.
    expect(scope).toEqual({ id: { in: [] } })
    expect(scope).not.toEqual({})
  })

  it("scopes an EMPLOYEE to their own open custody only", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)

    const scope = await assetScopeFor(viewer("EMPLOYEE"))

    expect(scope).toEqual({
      assignments: { some: { employeeId: { in: ["emp-1"] }, returnedAt: null } },
    })
    // An employee has no reports, so no second query should happen.
    expect(prisma.employee.findMany).not.toHaveBeenCalled()
  })

  it("scopes a REPORTING_MANAGER to themselves plus their direct reports", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      { id: "emp-a" },
      { id: "emp-b" },
    ] as never)

    const scope = await assetScopeFor(viewer("REPORTING_MANAGER"))

    expect(scope).toEqual({
      assignments: {
        some: { employeeId: { in: ["emp-mgr", "emp-a", "emp-b"] }, returnedAt: null },
      },
    })
    expect(prisma.employee.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { reportingManagerId: "emp-mgr" } })
    )
  })

  it("restricts the manager's view to OPEN custody, not everything the team ever held", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.employee.findMany).mockResolvedValue([] as never)

    const scope = await assetScopeFor(viewer("REPORTING_MANAGER"))

    expect(scope).toMatchObject({
      assignments: { some: { returnedAt: null } },
    })
  })
})

describe("stripCosts", () => {
  const asset = {
    id: "ast-1",
    assetTag: "BS-AST-00042",
    purchaseCost: "125000.00",
    vendor: "Ryans Computers",
  }

  it.each(STAFF_ROLES)("REMOVES purchaseCost and vendor for %s", (role) => {
    const result = stripCosts({ ...asset }, role as never)

    // Omission, not nulling: the two are different guarantees, and the
    // client distinguishes them with `"purchaseCost" in asset`.
    expect(result).not.toHaveProperty("purchaseCost")
    expect(result).not.toHaveProperty("vendor")
    expect(result.assetTag).toBe("BS-AST-00042")
  })

  it.each(COST_ROLES)("leaves both fields intact for %s", (role) => {
    const result = stripCosts({ ...asset }, role as never)

    expect(result.purchaseCost).toBe("125000.00")
    expect(result.vendor).toBe("Ryans Computers")
  })

  it("does not mutate the object it was given", () => {
    const original = { ...asset }

    stripCosts(original, "EMPLOYEE" as never)

    expect(original.purchaseCost).toBe("125000.00")
  })
})
