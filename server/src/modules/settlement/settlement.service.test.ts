import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    settlement: { create: vi.fn(), update: vi.fn(), delete: vi.fn() },
    expenseClaim: { updateMany: vi.fn() },
    idCounter: { upsert: vi.fn() },
    payrollAudit: { create: vi.fn() },
    employee: { update: vi.fn() },
  }
  return {
    default: {
      settlement: { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn() },
      employee: { findUnique: vi.fn() },
      expenseClaim: { findMany: vi.fn() },
      exchangeRate: { findMany: vi.fn() },
      payrollRun: { findUnique: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

vi.mock("../attendance/attendance.summary", () => ({
  getMonthlySummary: vi.fn(),
}))

import prisma from "../../config/prisma"
import { getMonthlySummary } from "../attendance/attendance.summary"
import type { MonthlyAttendanceSummary } from "../attendance/attendance.types"
import { dec } from "../payroll/payroll.money"
import { parseDateOnly } from "../../utils/dates"
import {
  approveSettlement,
  calculateSettlement,
  overrideSettlement,
  paySettlement,
} from "./settlement.service"

const tx = (prisma as unknown as { __tx: any }).__tx

const components = [
  { code: "HOUSE_RENT", label: "House rent", kind: "EARNING", calc: "PERCENT_OF_BASIC", value: dec(50), sortOrder: 1, countsAsWages: true },
  { code: "MEDICAL", label: "Medical", kind: "EARNING", calc: "FIXED", value: dec(3000), sortOrder: 2, countsAsWages: true },
  { code: "PF", label: "Provident fund", kind: "DEDUCTION", calc: "PERCENT_OF_BASIC", value: dec(10), sortOrder: 1, countsAsWages: false },
]

function employeeRow(over: Record<string, unknown> = {}) {
  return {
    id: "emp-1",
    fullName: "Ayesha Rahman",
    employeeCode: "BS-EMP-001",
    joiningDate: parseDateOnly("2020-01-06"),
    lastWorkingDay: parseDateOnly("2026-07-15"),
    exitReason: "RESIGNATION",
    employmentStatus: "RESIGNED",
    salaryStructure: {
      id: "struct-bdt",
      name: "Standard (BDT)",
      currency: "BDT",
      basic: dec(50000),
      isActive: true,
      components,
    },
    ...over,
  }
}

function summaryFor(over: Partial<MonthlyAttendanceSummary> = {}): MonthlyAttendanceSummary {
  return {
    employee: { id: "emp-1", fullName: "Ayesha Rahman", employeeCode: "BS-EMP-001", designation: "Engineer" },
    month: 7, year: 2026, workingDays: 12, present: 12, absent: 0, onLeave: 0,
    onPaidLeave: 0, onUnpaidLeave: 0, notCheckedIn: 0, late: 0, earlyOut: 0,
    holidays: 1, weeklyOffs: 2, workedOnOffDays: 0, workedHours: 108,
    expectedHours: 108, shortfallHours: 0, missingCheckOut: 0,
    pendingApproval: 0, approved: 12, regularised: 0, rejected: 0,
    ...over,
  }
}

let counter = 0

beforeEach(() => {
  counter = 0
  vi.mocked(prisma.employee.findUnique).mockResolvedValue(employeeRow() as never)
  vi.mocked(prisma.settlement.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([])
  vi.mocked(getMonthlySummary).mockResolvedValue([summaryFor()])
  tx.idCounter.upsert.mockImplementation(async () => ({ id: "STL", value: ++counter }))
  tx.settlement.create.mockImplementation(async ({ data }: any) => ({ id: "stl-1", ...data }))
  tx.settlement.update.mockImplementation(async ({ data }: any) => ({ id: "stl-1", ...data }))
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("calculateSettlement", () => {
  it("404s an unknown employee", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null)
    await expect(calculateSettlement("nope", "fin-1")).rejects.toMatchObject({ statusCode: 404 })
  })

  it("409s when the employee has no exit details", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(
      employeeRow({ lastWorkingDay: null, exitReason: null }) as never
    )
    await expect(calculateSettlement("emp-1", "fin-1")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s when the exit month still has unapproved attendance", async () => {
    // A leaver's final days are exactly the ones most likely to be pending.
    vi.mocked(getMonthlySummary).mockResolvedValue([summaryFor({ pendingApproval: 2 })])
    await expect(calculateSettlement("emp-1", "fin-1")).rejects.toMatchObject({ statusCode: 409 })
    expect(tx.settlement.create).not.toHaveBeenCalled()
  })

  it("409s when a settlement is already approved", async () => {
    vi.mocked(prisma.settlement.findFirst).mockResolvedValue({ id: "stl-0", status: "APPROVED" } as never)
    await expect(calculateSettlement("emp-1", "fin-1")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("computes pendingSalary over only the days up to the exit date", async () => {
    await calculateSettlement("emp-1", "fin-1")
    const data = tx.settlement.create.mock.calls[0][0].data
    const breakdown = data.breakdown as { pendingSalary: { daysEmployed: number; payableDays: string } }
    expect(breakdown.pendingSalary.daysEmployed).toBe(15)
    expect(breakdown.pendingSalary.payableDays).toBe("15.00")
  })

  it("computes gratuity on the countsAsWages base and shows its working", async () => {
    // Basic 50,000 + house rent 25,000 + medical 3,000 = 78,000. Joined
    // 2020-01-06, left 2026-07-15 → 6 completed years → 30 days each.
    await calculateSettlement("emp-1", "fin-1")
    const data = tx.settlement.create.mock.calls[0][0].data
    expect(data.gratuity.toFixed(2)).toBe("468000.00")
    const breakdown = data.breakdown as { gratuity: { reason: string } }
    expect(breakdown.gratuity.reason).toContain("30 days × 6 completed year(s)")
  })

  it("pays no gratuity on a dismissal for misconduct", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(
      employeeRow({ exitReason: "DISMISSAL" }) as never
    )
    await calculateSettlement("emp-1", "fin-1")
    expect(tx.settlement.create.mock.calls[0][0].data.gratuity.toFixed(2)).toBe("0.00")
  })

  it("writes leaveEncashment as zero this phase", async () => {
    await calculateSettlement("emp-1", "fin-1")
    expect(tx.settlement.create.mock.calls[0][0].data.leaveEncashment.toFixed(2)).toBe("0.00")
  })

  it("sweeps an outstanding claim onto the settlement rather than orphaning it", async () => {
    vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([
      { id: "claim-1", amount: dec("1200.00"), currency: "BDT", fxRateToBdt: dec(1), category: "Travel" },
    ] as never)
    await calculateSettlement("emp-1", "fin-1")
    expect(tx.settlement.create.mock.calls[0][0].data.expenseReimbursement.toFixed(2)).toBe("1200.00")
    expect(tx.expenseClaim.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["claim-1"] } },
      data: { settlementId: "stl-1" },
    })
  })

  it("is an idempotent rebuild — an existing draft is deleted and its claims released", async () => {
    vi.mocked(prisma.settlement.findFirst).mockResolvedValue({ id: "stl-old", status: "DRAFT" } as never)
    await calculateSettlement("emp-1", "fin-1")
    expect(tx.expenseClaim.updateMany).toHaveBeenCalledWith({
      where: { settlementId: "stl-old" },
      data: { settlementId: null },
    })
    expect(tx.settlement.delete).toHaveBeenCalledWith({ where: { id: "stl-old" } })
  })

  it("satisfies the finalAmount identity", async () => {
    await calculateSettlement("emp-1", "fin-1")
    const d = tx.settlement.create.mock.calls[0][0].data
    const expected = d.pendingSalary
      .plus(d.gratuity)
      .plus(d.noticePay)
      .plus(d.expenseReimbursement)
      .plus(d.leaveEncashment)
      .minus(d.outstandingDeductions)
    expect(d.finalAmount.equals(expected)).toBe(true)
  })
})

describe("approveSettlement", () => {
  it("403s when the approver calculated it", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({
      id: "stl-1",
      status: "DRAFT",
      calculatedBy: "fin-1",
    } as never)
    await expect(approveSettlement("stl-1", "fin-1")).rejects.toMatchObject({ statusCode: 403 })
  })

  it("succeeds for a different approver", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({
      id: "stl-1",
      status: "DRAFT",
      calculatedBy: "fin-1",
    } as never)
    await expect(approveSettlement("stl-1", "admin-1")).resolves.toMatchObject({ status: "APPROVED" })
  })

  it("409s a settlement already approved", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({
      id: "stl-1",
      status: "APPROVED",
      calculatedBy: "fin-1",
    } as never)
    await expect(approveSettlement("stl-1", "admin-1")).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("paySettlement", () => {
  it("409s a settlement that is not approved", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({ id: "stl-1", status: "DRAFT" } as never)
    await expect(paySettlement("stl-1", "fin-1")).rejects.toMatchObject({ statusCode: 409 })
  })

  it("marks swept claims REIMBURSED", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({ id: "stl-1", status: "APPROVED" } as never)
    await paySettlement("stl-1", "fin-1")
    expect(tx.expenseClaim.updateMany).toHaveBeenCalledWith({
      where: { settlementId: "stl-1", status: "APPROVED" },
      data: { status: "REIMBURSED" },
    })
  })

  it("is terminal — 409s a settlement already paid", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({ id: "stl-1", status: "PAID" } as never)
    await expect(paySettlement("stl-1", "fin-1")).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("overrideSettlement", () => {
  const draft = {
    id: "stl-1",
    status: "DRAFT",
    pendingSalary: dec("38709.68"),
    gratuity: dec("468000.00"),
    noticePay: dec(0),
    expenseReimbursement: dec(0),
    leaveEncashment: dec(0),
    outstandingDeductions: dec(0),
    finalAmount: dec("506709.68"),
    fxRateToBdt: dec(1),
  }

  it("409s once the settlement is approved", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue({ ...draft, status: "APPROVED" } as never)
    await expect(
      overrideSettlement("stl-1", "fin-1", { gratuity: 0, reason: "Disputed under §23" })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("recomputes finalAmount from the overridden head", async () => {
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue(draft as never)
    await overrideSettlement("stl-1", "fin-1", { gratuity: 0, reason: "Forfeited under §23" })
    const data = tx.settlement.update.mock.calls[0][0].data
    expect(data.gratuity.toFixed(2)).toBe("0.00")
    expect(data.finalAmount.toFixed(2)).toBe("38709.68")
  })

  it("audits the override with before, after and the reason", async () => {
    // A system that silently arbitrated a §23 dispute would be worse than
    // one that shows its working and lets a human overrule it.
    vi.mocked(prisma.settlement.findUnique).mockResolvedValue(draft as never)
    await overrideSettlement("stl-1", "fin-1", { gratuity: 0, reason: "Forfeited under §23" })
    expect(tx.payrollAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entity: "SETTLEMENT",
          action: "UPDATE",
          note: "Forfeited under §23",
          before: expect.objectContaining({ gratuity: "468000.00" }),
          after: expect.objectContaining({ gratuity: "0.00" }),
        }),
      })
    )
  })
})
