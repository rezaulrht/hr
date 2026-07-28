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
import {
  applyForLeave,
  computeEntitlement,
  getBalancesForEmployee,
  getTeamStatus,
  isUnpaidType,
  listLeaveRequests,
} from "./leave.service"

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

describe("listLeaveRequests scoping", () => {
  beforeEach(() => {
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
    vi.mocked(prisma.user.findMany).mockResolvedValue([])
  })

  it("scopes an EMPLOYEE to their own requests", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as any)
    await listLeaveRequests({ sub: "user-1", role: "EMPLOYEE" } as any)
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { employeeId: "emp-1" } })
    )
  })

  it("scopes a REPORTING_MANAGER to themselves plus their direct reports", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "mgr-1" } as any)
    await listLeaveRequests({ sub: "user-2", role: "REPORTING_MANAGER" } as any)
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [{ employeeId: "mgr-1" }, { employee: { reportingManagerId: "mgr-1" } }] },
      })
    )
  })

  it("does not scope HR_ADMIN at all", async () => {
    await listLeaveRequests({ sub: "user-3", role: "HR_ADMIN" } as any)
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {} })
    )
  })
})

describe("getTeamStatus", () => {
  const today = new Date()
  const iso = (d: Date) => d.toISOString().slice(0, 10)

  function report(over: Record<string, unknown> = {}) {
    return {
      id: "r1",
      fullName: "Report One",
      employeeCode: "BS-EMP-00001",
      designation: "Analyst",
      employmentStatus: "ACTIVE",
      leaveRequests: [],
      ...over,
    }
  }

  beforeEach(() => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "mgr-1" } as any)
  })

  it("reports a resigned or terminated employee as LEFT, even if on approved leave", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      report({
        employmentStatus: "RESIGNED",
        leaveRequests: [
          {
            status: "APPROVED",
            startDate: parseDateOnly(iso(today)),
            endDate: parseDateOnly(iso(today)),
            leaveType: { name: "Annual" },
          },
        ],
      }),
    ] as any)
    const result = await getTeamStatus("user-2")
    expect(result[0].status).toBe("LEFT")
  })

  it("reports ON_LEAVE when an approved request covers today", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([
      report({
        leaveRequests: [
          {
            status: "APPROVED",
            startDate: parseDateOnly(iso(today)),
            endDate: parseDateOnly(iso(today)),
            leaveType: { name: "Annual" },
          },
        ],
      }),
    ] as any)
    const result = await getTeamStatus("user-2")
    expect(result[0].status).toBe("ON_LEAVE")
    expect(result[0].currentLeave?.leaveTypeName).toBe("Annual")
  })

  it("reports ACTIVE with no current leave when nothing covers today", async () => {
    vi.mocked(prisma.employee.findMany).mockResolvedValue([report()] as any)
    const result = await getTeamStatus("user-2")
    expect(result[0].status).toBe("ACTIVE")
    expect(result[0].currentLeave).toBeNull()
  })

  it("only counts approved leave covering today, so pending and future leave never set a status", async () => {
    // This is enforced in the query, not in the mapping — a PENDING request or
    // a future-dated approval is never returned, so it can never read as
    // ON_LEAVE. Applying for leave says nothing about where someone is today.
    vi.mocked(prisma.employee.findMany).mockResolvedValue([report()] as any)
    await getTeamStatus("user-2")

    const args = vi.mocked(prisma.employee.findMany).mock.calls[0][0] as any
    expect(args.select.leaveRequests.where).toEqual({
      status: "APPROVED",
      startDate: { lte: expect.any(Date) },
      endDate: { gte: expect.any(Date) },
    })
  })
})

describe("applyForLeave validation", () => {
  const employee = {
    id: "emp-1",
    employmentType: "FULL_TIME",
    joiningDate: parseDateOnly("2020-01-01"),
  }
  const annual = {
    id: "lt-1",
    name: "Annual",
    isPaid: true,
    annualQuota: 18,
    maxConsecutive: null,
    allowsBackdating: false,
    eligibleFor: ["FULL_TIME"],
  }

  function futureDate(offsetDays: number) {
    const d = new Date(Date.now() + offsetDays * 86_400_000)
    return d.toISOString().slice(0, 10)
  }

  beforeEach(() => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(employee as any)
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue(annual as any)
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
    vi.mocked(prisma.leaveType.findMany).mockResolvedValue([annual] as any)
  })

  it("rejects an end date before the start date", async () => {
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(10),
        endDate: futureDate(5),
      })
    ).rejects.toThrow(/end date/i)
  })

  it("rejects a range spanning two calendar years", async () => {
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: "2026-12-28",
        endDate: "2027-01-05",
      })
    ).rejects.toThrow(/same year|two|split/i)
  })

  it("rejects a backdated request for a type that disallows it", async () => {
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(-3),
        endDate: futureDate(-2),
      })
    ).rejects.toThrow(/past|backdat/i)
  })

  it("allows a backdated request for a type that permits it", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      ...annual,
      allowsBackdating: true,
    } as any)
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue({
      id: "req-1",
      employee: { id: "emp-1", fullName: "A", employeeCode: "BS-EMP-00001" },
      leaveType: { id: "lt-1", name: "Annual", isPaid: true },
      startDate: parseDateOnly(futureDate(-3)),
      endDate: parseDateOnly(futureDate(-2)),
      reason: null,
      status: "PENDING",
      createdAt: new Date(),
    } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(-3),
        endDate: futureDate(-2),
      })
    ).resolves.toBeDefined()
  })

  it("rejects a backdated request beyond the 30-day window", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      ...annual,
      allowsBackdating: true,
    } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(-45),
        endDate: futureDate(-44),
      })
    ).rejects.toThrow(/30 days/i)
  })

  it("rejects a range that is entirely Fridays", async () => {
    // 2026-08-14 is a Friday.
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: "2026-08-14",
        endDate: "2026-08-14",
      })
    ).rejects.toThrow(/working day/i)
  })

  it("rejects a request overlapping an existing pending or approved one", async () => {
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue({ id: "existing" } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(5),
        endDate: futureDate(7),
      })
    ).rejects.toThrow(/overlap/i)
  })

  it("rejects a leave type the employment type is not eligible for", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      ...annual,
      eligibleFor: ["INTERN"],
    } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(5),
        endDate: futureDate(7),
      })
    ).rejects.toThrow(/eligible/i)
  })

  it("measures maxConsecutive against the calendar span, not charged days", async () => {
    // Thu 13th -> Wed 19th Aug 2026 = 7 calendar days, 6 charged (one Friday).
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      ...annual,
      maxConsecutive: 6,
    } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: "2026-08-13",
        endDate: "2026-08-19",
      })
    ).rejects.toThrow(/consecutive/i)
  })

  it("rejects when approved + pending + new would exceed the entitlement", async () => {
    vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([
      {
        leaveTypeId: "lt-1",
        status: "APPROVED",
        startDate: parseDateOnly("2026-03-02"),
        endDate: parseDateOnly("2026-03-20"),
      },
    ] as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(5),
        endDate: futureDate(9),
      })
    ).rejects.toThrow(/balance|remain|Leave Without Pay/i)
  })

  it("skips the balance check for an unpaid, zero-quota type", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      ...annual,
      name: "Leave Without Pay",
      isPaid: false,
      annualQuota: 0,
    } as any)
    vi.mocked(prisma.leaveRequest.create).mockResolvedValue({
      id: "req-1",
      employee: { id: "emp-1", fullName: "A", employeeCode: "BS-EMP-00001" },
      leaveType: { id: "lt-1", name: "Leave Without Pay", isPaid: false },
      startDate: parseDateOnly(futureDate(5)),
      endDate: parseDateOnly(futureDate(9)),
      reason: null,
      status: "PENDING",
      createdAt: new Date(),
    } as any)
    await expect(
      applyForLeave("user-1", {
        leaveTypeId: "lt-1",
        startDate: futureDate(5),
        endDate: futureDate(9),
      })
    ).resolves.toBeDefined()
  })
})
