import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    leaveType: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    leaveRequest: { count: vi.fn() },
    leaveBalance: { count: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import {
  assertStatutoryUpdateAllowed,
  createLeaveType,
  deleteLeaveType,
  updateLeaveType,
} from "./leave.admin"

// Mirrors the seeded CASUAL row (§115): 10 days, no carry-forward, no cap.
const CASUAL = {
  name: "Casual",
  statutory: true,
  isPaid: true,
  annualQuota: 10,
  carryForwardPct: 0,
  maxConsecutive: null,
  maxAccrual: null,
  minServiceMonths: 0,
  accrualBasis: "PRO_RATED" as const,
  countsHolidays: false,
  allowsBackdating: false,
  allowsHalfDay: true,
  eligibleFor: ["FULL_TIME", "PART_TIME", "CONTRACT"] as const,
}

const EARNED = {
  ...CASUAL,
  name: "Earned",
  accrualBasis: "EARNED" as const,
  minServiceMonths: 12,
  maxAccrual: 60,
}

const PERSONAL = { ...CASUAL, name: "Personal", statutory: false }

describe("assertStatutoryUpdateAllowed — non-statutory rows", () => {
  it("allows anything on a company-policy type", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(PERSONAL as any, {
        annualQuota: 0,
        accrualBasis: "NONE",
        isPaid: false,
      })
    ).not.toThrow()
  })
})

describe("monotonic fields — raising is allowed", () => {
  it("allows raising annualQuota", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 12 })).not.toThrow()
  })

  it("allows raising carryForwardPct", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { carryForwardPct: 50 })).not.toThrow()
  })

  it("allows an unchanged value", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 10 })).not.toThrow()
  })

  it("allows widening eligibleFor", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(CASUAL as any, {
        eligibleFor: ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"],
      })
    ).not.toThrow()
  })

  it("treats null maxAccrual as uncapped, so it is always allowed", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: null })).not.toThrow()
  })

  it("allows raising a capped maxAccrual", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: 90 })).not.toThrow()
  })

  it("treats null maxConsecutive as uncapped", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { maxConsecutive: null })).not.toThrow()
  })
})

describe("monotonic fields — lowering is refused", () => {
  it("refuses lowering annualQuota, naming the field and the floor", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { annualQuota: 8 })).toThrow(
      /annualQuota cannot go below 10/
    )
  })

  it("refuses lowering carryForwardPct", () => {
    // EARNED carries 100% forward under §117, so 50 is a real reduction.
    const carrying = { ...EARNED, carryForwardPct: 100 }
    expect(() => assertStatutoryUpdateAllowed(carrying as any, { carryForwardPct: 50 })).toThrow(
      /carryForwardPct cannot go below 100/
    )
  })

  it("refuses lowering maxAccrual", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { maxAccrual: 30 })).toThrow(
      /maxAccrual cannot go below 60/
    )
  })

  it("refuses capping an uncapped maxConsecutive", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { maxConsecutive: 5 })).toThrow(
      /maxConsecutive/
    )
  })

  it("refuses narrowing eligibleFor", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { eligibleFor: ["FULL_TIME"] })).toThrow(
      /eligibleFor/
    )
  })

  it("refuses making a statutory type unpaid", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { isPaid: false })).toThrow(/isPaid/)
  })
})

// The one that inverts. Less waiting is more generous, so the comparison
// runs the other way — a reader skimming the table will assume this is a bug.
describe("minServiceMonths inverts", () => {
  it("allows LOWERING minServiceMonths", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { minServiceMonths: 6 })).not.toThrow()
  })

  it("refuses RAISING minServiceMonths", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { minServiceMonths: 24 })).toThrow(
      /minServiceMonths cannot go above 12/
    )
  })
})

describe("locked fields", () => {
  it("refuses changing accrualBasis", () => {
    expect(() => assertStatutoryUpdateAllowed(EARNED as any, { accrualBasis: "PRO_RATED" })).toThrow(
      /accrualBasis cannot be changed/
    )
  })

  it("refuses changing countsHolidays", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { countsHolidays: true })).toThrow(
      /countsHolidays cannot be changed/
    )
  })

  it("refuses changing allowsBackdating", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { allowsBackdating: true })).toThrow(
      /allowsBackdating/
    )
  })

  it("refuses changing allowsHalfDay", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { allowsHalfDay: false })).toThrow(
      /allowsHalfDay/
    )
  })

  it("allows re-sending a locked field unchanged", () => {
    expect(() =>
      assertStatutoryUpdateAllowed(CASUAL as any, { accrualBasis: "PRO_RATED" })
    ).not.toThrow()
  })

  it("always allows renaming", () => {
    expect(() => assertStatutoryUpdateAllowed(CASUAL as any, { name: "Casual Leave" })).not.toThrow()
  })
})

const ACTOR = { sub: "user-1", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as any

const NEW_TYPE = {
  code: "STUDY",
  name: "Study",
  isPaid: true,
  annualQuota: 5,
  carryForwardPct: 0,
  maxConsecutive: null,
  allowsBackdating: false,
  eligibleFor: ["FULL_TIME"],
  countsHolidays: false,
  accrualBasis: "PRO_RATED" as const,
  minServiceMonths: 0,
  maxAccrual: null,
  allowsHalfDay: true,
}

describe("leave-type service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(0)
    vi.mocked(prisma.leaveBalance.count).mockResolvedValue(0)
  })

  it("creates a type as non-statutory, whatever the caller wants", async () => {
    vi.mocked(prisma.leaveType.create).mockResolvedValue({ id: "lt1", ...NEW_TYPE } as any)

    await createLeaveType(NEW_TYPE as any, ACTOR)

    expect(prisma.leaveType.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ statutory: false }) })
    )
  })

  it("turns a duplicate code into a 409", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" })

    await expect(createLeaveType(NEW_TYPE as any, ACTOR)).rejects.toMatchObject({ statusCode: 409 })
  })

  it("applies the statutory rules on update", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({ id: "lt-casual", ...CASUAL } as any)

    await expect(updateLeaveType("lt-casual", { annualQuota: 8 }, ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("cannot go below 10"),
    })
    expect(prisma.leaveType.update).not.toHaveBeenCalled()
  })

  it("allows a generous update to a statutory type", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({ id: "lt-casual", ...CASUAL } as any)
    vi.mocked(prisma.leaveType.update).mockResolvedValue({
      id: "lt-casual",
      ...CASUAL,
      annualQuota: 14,
    } as any)

    const result = await updateLeaveType("lt-casual", { annualQuota: 14 }, ACTOR)

    expect(result.annualQuota).toBe(14)
  })

  it("refuses to delete a statutory type", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({ id: "lt-casual", ...CASUAL } as any)

    await expect(deleteLeaveType("lt-casual", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("statutory"),
    })
    expect(prisma.leaveType.delete).not.toHaveBeenCalled()
  })

  it("deletes an unused company-policy type", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      id: "lt-personal",
      code: "PERSONAL",
      ...PERSONAL,
    } as any)

    await deleteLeaveType("lt-personal", ACTOR)

    expect(prisma.leaveType.delete).toHaveBeenCalledWith({ where: { id: "lt-personal" } })
  })

  it("refuses to delete a type with requests or balances against it", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue({
      id: "lt-personal",
      code: "PERSONAL",
      ...PERSONAL,
    } as any)
    vi.mocked(prisma.leaveRequest.count).mockResolvedValue(6)
    vi.mocked(prisma.leaveBalance.count).mockResolvedValue(2)

    await expect(deleteLeaveType("lt-personal", ACTOR)).rejects.toMatchObject({
      message:
        "This leave type is still in use by 6 leave requests and 2 leave balances. Reassign them first.",
    })
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.leaveType.findUnique).mockResolvedValue(null)

    await expect(deleteLeaveType("nope", ACTOR)).rejects.toMatchObject({ statusCode: 404 })
  })
})
