import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    attendance: { create: vi.fn(), update: vi.fn() },
    attendanceAudit: { create: vi.fn() },
  }
  return {
    default: {
      employee: { findUnique: vi.fn() },
      // findUnique is used by settleApproval, which check-out invokes once
      // the record is complete.
      attendance: { findFirst: vi.fn(), findUnique: vi.fn() },
      holiday: { findMany: vi.fn() },
      leaveRequest: { findFirst: vi.fn() },
      shift: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import type { Attendance, Shift } from "../../generated/prisma/client"
import { parseDateOnly } from "../../utils/dates"
import { checkIn, checkOut, computeIsEarlyOut, computeIsLate } from "./attendance.punch"

const tx = (prisma as unknown as { __tx: Record<string, Record<string, ReturnType<typeof vi.fn>>> })
  .__tx

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

const EMPLOYEE = {
  id: "emp-1",
  userId: "user-1",
  joiningDate: parseDateOnly("2024-01-06"),
  employmentStatus: "ACTIVE",
  shiftId: null,
}

/** Dhaka is UTC+6, so 09:00 local is 03:00Z. */
const dhaka = (date: string, time: string) => {
  const [h, m] = time.split(":").map(Number)
  const utcHour = h - 6
  const base = new Date(`${date}T00:00:00.000Z`)
  return new Date(base.getTime() + (utcHour * 60 + m) * 60_000)
}

function row(over: Partial<Attendance> = {}): Attendance {
  return {
    id: "att-1",
    employeeId: "emp-1",
    date: parseDateOnly("2026-08-03"),
    checkIn: dhaka("2026-08-03", "09:05"),
    checkOut: null,
    workedHours: null,
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

const p2002 = Object.assign(new Error("Unique constraint failed"), { code: "P2002" })

beforeEach(() => {
  vi.useFakeTimers()
  vi.mocked(prisma.employee.findUnique).mockResolvedValue(EMPLOYEE as never)
  vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL])
  vi.mocked(prisma.holiday.findMany).mockResolvedValue([])
  vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue(null)
  tx.attendanceAudit.create.mockResolvedValue({})
  // Read back by settleApproval after check-out writes. The approval
  // outcome itself is covered in attendance.approval.test.ts.
  vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row() as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("computeIsLate — 15 minutes' grace", () => {
  it.each([
    ["08:50", false],
    ["09:00", false],
    ["09:15", false],
    ["09:16", true],
    ["10:00", true],
  ])("treats a %s arrival as late=%s", (time, expected) => {
    expect(computeIsLate(dhaka("2026-08-03", time), GENERAL)).toBe(expected)
  })

  it("is on time at 09:15:47, because seconds truncate", () => {
    // A policy stated in whole minutes is enforced in whole minutes. The
    // alternative makes 09:15:01 a late entry, which is indefensible to the
    // person it happens to and invisible on a clock showing minutes.
    const withSeconds = new Date(dhaka("2026-08-03", "09:15").getTime() + 47_000)
    expect(computeIsLate(withSeconds, GENERAL)).toBe(false)
  })
})

describe("computeIsEarlyOut", () => {
  const date = parseDateOnly("2026-08-03")

  it.each([
    ["17:44", true],
    ["17:45", false],
    ["18:00", false],
  ])("treats a %s departure as early=%s", (time, expected) => {
    expect(computeIsEarlyOut(dhaka("2026-08-03", time), date, GENERAL)).toBe(expected)
  })

  it("does not flag someone who worked past midnight", () => {
    // 00:30 reads as "00:30", earlier than every threshold. Without the
    // same-day guard, working late would be recorded as leaving early.
    const afterMidnight = dhaka("2026-08-04", "00:30")
    expect(computeIsEarlyOut(afterMidnight, date, GENERAL)).toBe(false)
  })
})

describe("checkIn", () => {
  it("files the record under the office-local date", async () => {
    // 20:00Z on the 3rd is already 02:00 on the 4th in Dhaka.
    vi.setSystemTime(new Date("2026-08-03T20:00:00.000Z"))
    tx.attendance.create.mockResolvedValue(row({ date: parseDateOnly("2026-08-04") }))

    await checkIn("user-1")
    expect(tx.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ date: parseDateOnly("2026-08-04") }),
      })
    )
  })

  it("flags a late arrival", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "09:30"))
    tx.attendance.create.mockResolvedValue(row({ isLate: true }))

    await checkIn("user-1")
    expect(tx.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isLate: true }) })
    )
  })

  it("writes an audit row in the same transaction", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "09:05"))
    tx.attendance.create.mockResolvedValue(row())

    await checkIn("user-1")
    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: "CHECK_IN", changedBy: "user-1" }),
      })
    )
  })

  it("409s on a second check-in the same day", async () => {
    // The unique index makes this atomic rather than a read-then-write race.
    vi.setSystemTime(dhaka("2026-08-03", "09:05"))
    tx.attendance.create.mockRejectedValue(p2002)

    await expect(checkIn("user-1")).rejects.toMatchObject({
      statusCode: 409,
      message: "You have already checked in today",
    })
  })

  it("is not blocked on a holiday, and says so in the response", async () => {
    // Physical facts beat records: blocking would leave somebody who
    // genuinely came in unable to record real work.
    vi.setSystemTime(dhaka("2026-08-05", "09:05"))
    tx.attendance.create.mockResolvedValue(row({ date: parseDateOnly("2026-08-05") }))
    vi.mocked(prisma.holiday.findMany).mockResolvedValue([
      { id: "h1", name: "July Uprising Day", date: parseDateOnly("2026-08-05"), type: "GENERAL" },
    ])

    const result = await checkIn("user-1")
    expect(result.status).toBe("PRESENT")
    expect(result.isHoliday).toBe(true)
    expect(result.holidayName).toBe("July Uprising Day")
  })

  it("is not blocked while on approved leave, and flags the conflict", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "09:05"))
    tx.attendance.create.mockResolvedValue(row())
    vi.mocked(prisma.leaveRequest.findFirst).mockResolvedValue({
      leaveType: { name: "Annual" },
    } as never)

    const result = await checkIn("user-1")
    expect(result.onApprovedLeave).toBe(true)
    expect(result.leaveTypeName).toBe("Annual")
  })
})

describe("checkOut", () => {
  it("409s when nothing is open", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "18:00"))
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue(null)
    await expect(checkOut("user-1")).rejects.toMatchObject({
      statusCode: 409,
      message: "You haven't checked in",
    })
  })

  it("records elapsed hours, break included", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "18:05"))
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue(row())
    tx.attendance.update.mockResolvedValue(row({ checkOut: dhaka("2026-08-03", "18:05") }))

    await checkOut("user-1")
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ workedHours: 9 }) })
    )
  })

  it("closes yesterday's open row when work runs past midnight", async () => {
    // Resolving the most recent *open* row rather than today's is what
    // makes this work.
    vi.setSystemTime(dhaka("2026-08-04", "00:30"))
    const openYesterday = row({
      date: parseDateOnly("2026-08-03"),
      checkIn: dhaka("2026-08-03", "16:00"),
    })
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue(openYesterday)
    tx.attendance.update.mockResolvedValue(openYesterday)

    await checkOut("user-1")
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({ workedHours: 8.5, isEarlyOut: false }),
      })
    )
  })

  it("409s on a check-in older than the max open shift", async () => {
    // A forgotten check-out, not a long day — closing it silently would put
    // an 18-hour shift into payroll unreviewed.
    vi.setSystemTime(dhaka("2026-08-04", "12:00"))
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue(
      row({ checkIn: dhaka("2026-08-03", "09:00") })
    )

    await expect(checkOut("user-1")).rejects.toMatchObject({ statusCode: 409 })
    await expect(checkOut("user-1")).rejects.toThrow(/ask HR to correct it/)
  })

  it("writes an audit row carrying the previous values", async () => {
    vi.setSystemTime(dhaka("2026-08-03", "18:05"))
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue(row())
    tx.attendance.update.mockResolvedValue(row({ checkOut: dhaka("2026-08-03", "18:05") }))

    await checkOut("user-1")
    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CHECK_OUT",
          before: { checkOut: null, workedHours: null },
        }),
      })
    )
  })
})
