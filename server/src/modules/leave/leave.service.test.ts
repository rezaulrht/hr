import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    leaveType: { findMany: vi.fn(), findUnique: vi.fn() },
    leaveRequest: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    employee: { findUnique: vi.fn(), findMany: vi.fn() },
    user: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { parseDateOnly } from "./leave.dates"
import { computeEntitlement, getBalancesForEmployee, isUnpaidType } from "./leave.service"

beforeEach(() => {
  vi.clearAllMocks()
})

describe("computeEntitlement", () => {
  it("gives the full quota to someone who joined in an earlier year", () => {
    expect(computeEntitlement(18, parseDateOnly("2023-04-01"), 2026)).toBe(18)
  })

  it("gives nothing for a year before the employee joined", () => {
    expect(computeEntitlement(18, parseDateOnly("2027-01-01"), 2026)).toBe(0)
  })

  it("pro-rates the joining year by months remaining", () => {
    // Joined November (month index 10) -> 2 of 12 months -> round(18 * 2/12) = 3
    expect(computeEntitlement(18, parseDateOnly("2026-11-10"), 2026)).toBe(3)
    // Joined January -> full 12 months -> full quota
    expect(computeEntitlement(18, parseDateOnly("2026-01-05"), 2026)).toBe(18)
    // Joined July (index 6) -> 6 of 12 -> 9
    expect(computeEntitlement(18, parseDateOnly("2026-07-01"), 2026)).toBe(9)
  })

  it("never returns a negative entitlement", () => {
    expect(computeEntitlement(0, parseDateOnly("2026-11-10"), 2026)).toBe(0)
  })
})

describe("isUnpaidType", () => {
  it("is true only for a zero-quota unpaid type", () => {
    expect(isUnpaidType({ isPaid: false, annualQuota: 0 })).toBe(true)
    expect(isUnpaidType({ isPaid: true, annualQuota: 0 })).toBe(false)
    expect(isUnpaidType({ isPaid: false, annualQuota: 5 })).toBe(false)
  })
})

describe("getBalancesForEmployee", () => {
  const employee = {
    id: "emp-1",
    employmentType: "FULL_TIME",
    joiningDate: parseDateOnly("2020-01-01"),
  }

  it("subtracts approved and pending days from the pro-rated entitlement", async () => {
    vi.mocked(prisma.leaveType.findMany).mockResolvedValue([
      { id: "lt-1", name: "Annual", isPaid: true, annualQuota: 18, eligibleFor: ["FULL_TIME"] },
    ] as any)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
      {
        leaveTypeId: "lt-1",
        status: "APPROVED",
        startDate: parseDateOnly("2026-08-10"),
        endDate: parseDateOnly("2026-08-12"),
      },
      {
        leaveTypeId: "lt-1",
        status: "PENDING",
        startDate: parseDateOnly("2026-09-07"),
        endDate: parseDateOnly("2026-09-08"),
      },
    ] as any)

    const result = await getBalancesForEmployee(employee as any, 2026)

    expect(result).toEqual([
      {
        leaveTypeId: "lt-1",
        name: "Annual",
        isPaid: true,
        annualQuota: 18,
        entitlement: 18,
        used: 3,
        pending: 2,
        balance: 13,
      },
    ])
  })

  it("only returns types the employee's employment type is eligible for", async () => {
    vi.mocked(prisma.leaveType.findMany).mockResolvedValue([
      { id: "lt-1", name: "Annual", isPaid: true, annualQuota: 18, eligibleFor: ["FULL_TIME"] },
      { id: "lt-2", name: "Intern Only", isPaid: true, annualQuota: 4, eligibleFor: ["INTERN"] },
    ] as any)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])

    const result = await getBalancesForEmployee(employee as any, 2026)

    expect(result).toHaveLength(1)
    expect(result[0].leaveTypeId).toBe("lt-1")
  })

  it("ignores rejected and cancelled requests", async () => {
    vi.mocked(prisma.leaveType.findMany).mockResolvedValue([
      { id: "lt-1", name: "Annual", isPaid: true, annualQuota: 18, eligibleFor: ["FULL_TIME"] },
    ] as any)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([] as any)

    const result = await getBalancesForEmployee(employee as any, 2026)

    // The query itself must exclude them, so the service never sees them.
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: { in: ["PENDING", "APPROVED"] } }),
      })
    )
    expect(result[0].balance).toBe(18)
  })
})
