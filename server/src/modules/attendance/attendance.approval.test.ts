import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    attendance: { update: vi.fn() },
    attendanceAudit: { create: vi.fn() },
  }
  return {
    default: {
      employee: { findUnique: vi.fn() },
      attendance: { findUnique: vi.fn(), findMany: vi.fn() },
      holiday: { findMany: vi.fn() },
      leaveRequest: { findFirst: vi.fn(), findMany: vi.fn() },
      shift: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import type { Attendance, Shift } from "../../generated/prisma/client"
import { parseDateOnly } from "../../utils/dates"
import {
  assertCanDecide,
  approveAttendance,
  bulkDecide,
  exceptionsFor,
  listApprovals,
  rejectAttendance,
  settleApproval,
  type EvaluatedDay,
} from "./attendance.approval"

const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> })
  .__tx

const NOW = new Date("2026-08-15T06:00:00.000Z")

const GENERAL: Shift = {
  id: "shift-general",
  name: "General",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
  graceMinutes: 15,
  weeklyOffDays: [5],
  effectiveFrom: null,
  effectiveTo: null,
}

/** A completely unremarkable day: on time, closed, full hours, nothing odd. */
const ordinary = (over: Partial<EvaluatedDay> = {}): EvaluatedDay => ({
  isLate: false,
  isEarlyOut: false,
  checkOut: new Date("2026-08-03T12:05:00.000Z"),
  workedHours: 9,
  expectedHours: 9,
  onApprovedLeave: false,
  isOffDay: false,
  regularisedAt: null,
  source: "WEB",
  ...over,
})

function row(over: Partial<Attendance> = {}): Attendance {
  return {
    id: "att-1",
    employeeId: "emp-1",
    date: parseDateOnly("2026-08-03"),
    checkIn: new Date("2026-08-03T03:05:00.000Z"),
    checkOut: new Date("2026-08-03T12:05:00.000Z"),
    workedHours: 9,
    isLate: false,
    isEarlyOut: false,
    source: "WEB",
    approval: "PENDING",
    approvedBy: null,
    approvedAt: null,
    approvalNote: null,
    regularisedAt: null,
    regularisedNote: null,
    correctedBy: null,
    correctedAt: null,
    correctionNote: null,
    ...over,
  }
}

const actor = (role: string, sub = "user-mgr") =>
  ({ sub, role, email: "a@demo.com", mustChangePassword: false }) as never

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL])
  vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
  vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null)
  vi.mocked(prisma.leaveRequest.findMany).mockResolvedValue([])
  tx.attendanceAudit.create.mockResolvedValue({})
  tx.attendance.update.mockResolvedValue(row())
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("exceptionsFor", () => {
  it("finds nothing wrong with an ordinary day", () => {
    // The whole point: this is the ~95% that must never reach a human, or
    // the queue gets cleared unread on the 1st under payroll pressure.
    expect(exceptionsFor(ordinary())).toEqual([])
  })

  it.each<[string, Partial<EvaluatedDay>, string]>([
    ["a late arrival", { isLate: true }, "LATE"],
    ["an early departure", { isEarlyOut: true }, "EARLY_OUT"],
    ["a missing check-out", { checkOut: null }, "MISSING_CHECKOUT"],
    ["short hours", { workedHours: 4 }, "SHORTFALL"],
    ["a clash with approved leave", { onApprovedLeave: true }, "LEAVE_CONFLICT"],
    ["work on a holiday or weekly off", { isOffDay: true }, "WORKED_OFF_DAY"],
    ["an employee-supplied time", { regularisedAt: new Date() }, "REGULARISED"],
    ["an HR-entered record", { source: "MANUAL" as const }, "MANUAL_ENTRY"],
  ])("routes %s to a human", (_label, patch, code) => {
    const exceptions = exceptionsFor(ordinary(patch))
    expect(exceptions).toContain(code)
    expect(exceptions.length).toBeGreaterThan(0)
  })

  it("does not double-report a missing check-out as a shortfall", () => {
    // Hours are unknown, not short. Reporting both would imply we measured
    // something we never measured.
    expect(exceptionsFor(ordinary({ checkOut: null, workedHours: null }))).toEqual([
      "MISSING_CHECKOUT",
    ])
  })
})

describe("settleApproval", () => {
  it("auto-approves an unremarkable day with no human attached", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    const result = await settleApproval("att-1", "emp-1", parseDateOnly("2026-08-03"), GENERAL)

    expect(result).toBe("AUTO_APPROVED")
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval: "AUTO_APPROVED", approvedBy: null }),
      })
    )
  })

  it("writes an audit row for the machine decision", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await settleApproval("att-1", "emp-1", parseDateOnly("2026-08-03"), GENERAL)
    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "AUTO_APPROVE", changedBy: null }),
      })
    )
  })

  it("leaves a late day pending", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row({ isLate: true }))
    expect(await settleApproval("att-1", "emp-1", parseDateOnly("2026-08-03"), GENERAL)).toBe(
      "PENDING"
    )
    expect(tx.attendance.update).not.toHaveBeenCalled()
  })

  it("leaves a day worked on the weekly off pending", async () => {
    // 2026-08-07 is a Friday.
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(
      row({ date: parseDateOnly("2026-08-07") })
    )
    expect(await settleApproval("att-1", "emp-1", parseDateOnly("2026-08-07"), GENERAL)).toBe(
      "PENDING"
    )
  })

  it("never auto-approves a regularised record", async () => {
    // The employee supplied a time nobody witnessed, however ordinary the
    // numbers look.
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(
      row({ regularisedAt: new Date("2026-08-04T04:00:00Z") })
    )
    expect(await settleApproval("att-1", "emp-1", parseDateOnly("2026-08-03"), GENERAL)).toBe(
      "PENDING"
    )
  })
})

describe("who may decide — the approver rule", () => {
  const record = (reportingManagerId: string | null, employeeId = "emp-1") => ({
    employeeId,
    employee: { reportingManagerId },
  })

  it("lets the employee's reporting manager decide", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    await expect(
      assertCanDecide(actor("REPORTING_MANAGER"), record("emp-mgr"))
    ).resolves.toBeUndefined()
  })

  it("refuses a manager who is not this employee's manager", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-other" } as never)
    await expect(
      assertCanDecide(actor("REPORTING_MANAGER"), record("emp-mgr"))
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("falls to HR when the employee has no reporting manager", async () => {
    // This is the answer to 'who approves the reporting manager?' — a
    // manager at the top of a line has no manager above them, so HR decides.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-hr-none" } as never)
    await expect(assertCanDecide(actor("HR_ADMIN"), record(null))).resolves.toBeUndefined()
    await expect(
      assertCanDecide(actor("REPORTING_MANAGER"), record(null))
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(["HR_ADMIN", "SUPER_ADMIN"])("lets %s override any record", async (role) => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null)
    await expect(assertCanDecide(actor(role), record("emp-mgr"))).resolves.toBeUndefined()
  })

  it("refuses self-approval even for HR", async () => {
    // A self-referential reportingManagerId is one data-entry slip away.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    await expect(assertCanDecide(actor("HR_ADMIN"), record(null, "emp-1"))).rejects.toMatchObject({
      statusCode: 403,
    })
  })
})

describe("approve and reject", () => {
  beforeEach(() => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
  })

  it("404s for an unknown record", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(null)
    await expect(approveAttendance(actor("HR_ADMIN"), "nope")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("409s on a record that was already decided", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row({ approval: "APPROVED" }),
      employee: { reportingManagerId: "emp-mgr" },
    } as never)
    await expect(
      approveAttendance(actor("REPORTING_MANAGER"), "att-1")
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s on a day that has not finished", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row({ date: parseDateOnly("2026-08-15"), checkOut: null }),
      employee: { reportingManagerId: "emp-mgr" },
    } as never)
    await expect(
      approveAttendance(actor("REPORTING_MANAGER"), "att-1")
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("records the deciding user and an audit row", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row(),
      employee: { reportingManagerId: "emp-mgr" },
    } as never)

    await rejectAttendance(actor("REPORTING_MANAGER"), "att-1", "Not authorised")
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ approval: "REJECTED", approvedBy: "user-mgr" }),
      })
    )
    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "REJECT", note: "Not authorised" }),
      })
    )
  })
})

describe("bulkDecide", () => {
  it("returns a per-id result so one bad id does not void the batch", async () => {
    // A queue of 40 must not fail wholesale on a record somebody else
    // already handled — that is how bulk approval gets abandoned.
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.attendance.findUnique)
      .mockResolvedValueOnce({ ...row(), employee: { reportingManagerId: "emp-mgr" } } as never)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ ...row(), employee: { reportingManagerId: "emp-mgr" } } as never)

    const results = await bulkDecide(actor("REPORTING_MANAGER"), ["a", "b", "c"], "APPROVE")
    expect(results).toEqual([
      { id: "a", ok: true },
      { id: "b", ok: false, error: "Attendance record not found" },
      { id: "c", ok: true },
    ])
  })
})

describe("listApprovals", () => {
  it("scopes a manager to their own direct reports", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-mgr" } as never)
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([])

    await listApprovals(actor("REPORTING_MANAGER"))
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { approval: "PENDING", employee: { reportingManagerId: "emp-mgr" } },
      })
    )
  })

  it("refuses a role that cannot review at all", async () => {
    await expect(listApprovals(actor("FINANCE_OFFICER"))).rejects.toMatchObject({ statusCode: 403 })
  })

  it("orders oldest first and reports ageing", async () => {
    // Oldest first because those are the ones ageing toward a payroll run.
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      {
        ...row({ date: parseDateOnly("2026-08-03"), isLate: true }),
        employee: {
          id: "emp-1",
          fullName: "Ayesha Rahman",
          employeeCode: "BS-EMP-DEMO",
          designation: "Software Engineer",
          reportingManagerId: "emp-mgr",
          shiftId: null,
          joiningDate: parseDateOnly("2024-01-06"),
          employmentStatus: "ACTIVE",
        },
      },
    ] as never)

    const items = await listApprovals(actor("HR_ADMIN"))
    expect(prisma.attendance.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { date: "asc" } })
    )
    expect(items[0].agingDays).toBe(12)
    expect(items[0].stalled).toBe(true)
    // The queue names *why* each row is here; undifferentiated rows get
    // bulk-approved unread.
    expect(items[0].exceptions).toContain("LATE")
  })

  it("filters by minimum ageing for HR's stalled-queue view", async () => {
    vi.mocked(prisma.attendance.findMany).mockResolvedValue([
      {
        ...row({ date: parseDateOnly("2026-08-14") }),
        employee: {
          id: "emp-1",
          fullName: "Ayesha Rahman",
          employeeCode: "BS-EMP-DEMO",
          designation: "Software Engineer",
          reportingManagerId: "emp-mgr",
          shiftId: null,
          joiningDate: parseDateOnly("2024-01-06"),
          employmentStatus: "ACTIVE",
        },
      },
    ] as never)

    expect(await listApprovals(actor("HR_ADMIN"), "PENDING", 3)).toHaveLength(0)
    expect(await listApprovals(actor("HR_ADMIN"), "PENDING", 1)).toHaveLength(1)
  })
})
