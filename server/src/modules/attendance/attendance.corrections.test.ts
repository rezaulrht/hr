import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => {
  const tx = {
    attendance: { update: vi.fn(), create: vi.fn() },
    attendanceAudit: { create: vi.fn() },
    // The event log, written in the same transaction as the change. Distinct
    // from `attendanceAudit`: one row per user action rather than per record.
    event: { create: vi.fn() },
    employee: { findUnique: vi.fn() },
  }
  return {
    default: {
      employee: { findUnique: vi.fn() },
      attendance: { findUnique: vi.fn() },
      attendanceAudit: { findMany: vi.fn() },
      shift: { findMany: vi.fn() },
      $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
      __tx: tx,
    },
  }
})

import prisma from "../../config/prisma"
import type { Attendance, Shift } from "../../generated/prisma/client"
import { parseDateOnly } from "../../utils/dates"
import { officeInstantOf, officeTimeOf } from "./attendance.time"
import {
  correctAttendance,
  createManualAttendance,
  getAuditTrail,
  regulariseAttendance,
} from "./attendance.corrections"

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

const EMPLOYEE = { id: "emp-1", userId: "user-1", fullName: "Ayesha Rahman", shiftId: null }

function row(over: Partial<Attendance> = {}): Attendance {
  return {
    id: "att-1",
    employeeId: "emp-1",
    date: parseDateOnly("2026-08-12"),
    checkIn: new Date("2026-08-12T03:05:00.000Z"),
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

const actor = (role: string, sub = "user-hr") =>
  ({ sub, role, email: "a@demo.com", mustChangePassword: false }) as never

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.mocked(prisma.employee.findUnique).mockResolvedValue(EMPLOYEE as never)
  vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL])
  tx.attendanceAudit.create.mockResolvedValue({})
  tx.attendance.update.mockResolvedValue(row())
  tx.attendance.create.mockResolvedValue(row())
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("officeInstantOf", () => {
  it("round-trips against officeTimeOf", () => {
    // A human types a wall-clock time; the server stores an instant. These
    // two must be exact inverses or a corrected record drifts by the office
    // offset every time it is edited.
    const date = parseDateOnly("2026-08-12")
    for (const time of ["00:00", "09:00", "13:30", "18:00", "23:59"]) {
      expect(officeTimeOf(officeInstantOf(date, time))).toBe(time)
    }
  })

  it("places 09:00 Dhaka at 03:00Z", () => {
    expect(officeInstantOf(parseDateOnly("2026-08-12"), "09:00").toISOString()).toBe(
      "2026-08-12T03:00:00.000Z"
    )
  })
})

describe("regulariseAttendance", () => {
  it("fills in a forgotten check-out and recomputes hours", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "Forgot to tap out" })

    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ workedHours: 9, approval: "PENDING" }),
      })
    )
  })

  it("forces the record back to PENDING so it cannot slip through", async () => {
    // A rejected record the employee then corrects has to go back into the
    // queue: the approver refused the old times, not the new ones. (An
    // already-APPROVED record is refused outright a few tests below.)
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(
      row({ approval: "REJECTED", checkOut: new Date("2026-08-12T12:05:00.000Z") })
    )
    await regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "Wrong time" })

    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval: "PENDING",
          approvedBy: null,
          regularisedNote: "Wrong time",
        }),
      })
    )
  })

  it("403s on somebody else's record", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row({ employeeId: "emp-other" }))
    await expect(
      regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "x" })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("409s once the record has been approved", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row({ approval: "APPROVED" }))
    await expect(
      regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "x" })
    ).rejects.toMatchObject({ statusCode: 409 })
  })

  it("409s beyond the amendment window", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(
      row({ date: parseDateOnly("2026-07-20") })
    )
    await expect(
      regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "x" })
    ).rejects.toThrow(/last 14 days/)
  })

  it("400s when the times run backwards", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await expect(
      regulariseAttendance("user-1", "att-1", { checkOut: "08:00", note: "x" })
    ).rejects.toMatchObject({ statusCode: 400 })
  })

  it("writes an audit row carrying the prior values", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "Forgot" })

    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "REGULARISE",
          changedBy: "user-1",
          before: { checkIn: "2026-08-12T03:05:00.000Z", checkOut: null, workedHours: null },
          note: "Forgot",
        }),
      })
    )
  })

  it("judges the amended time against the shift in force on that date", async () => {
    // Not today's shift. A Ramadan window that has since ended must not
    // re-judge a day outside it, and vice versa.
    const ramadan: Shift = {
      ...GENERAL,
      id: "shift-ramadan",
      name: "Ramadan",
      endTime: "15:30",
      effectiveFrom: parseDateOnly("2026-08-10"),
      effectiveTo: parseDateOnly("2026-08-13"),
    }
    vi.mocked(prisma.shift.findMany).mockResolvedValue([GENERAL, ramadan])
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())

    await regulariseAttendance("user-1", "att-1", { checkOut: "15:30", note: "Ramadan hours" })
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isEarlyOut: false }) })
    )
  })
})

describe("correctAttendance", () => {
  it("settles the record rather than parking it in a queue", async () => {
    // HR outranks the manager in this chain, so leaving it PENDING would
    // send it to somebody who has already been overruled.
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row(),
      employee: { id: "emp-1", fullName: "Ayesha Rahman", shiftId: null },
    } as never)

    const result = await correctAttendance(actor("HR_ADMIN"), "att-1", {
      checkOut: "18:00",
      note: "Confirmed with the team lead",
    })

    expect(result.approval).toBe("APPROVED")
    expect(tx.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          approval: "APPROVED",
          correctedBy: "user-hr",
          correctionNote: "Confirmed with the team lead",
        }),
      })
    )
  })

  it("404s for an unknown record", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(null)
    await expect(
      correctAttendance(actor("HR_ADMIN"), "nope", { checkOut: "18:00", note: "x" })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it("leaves a second correction's audit row without erasing the first", async () => {
    // The whole reason AttendanceAudit exists: correctedBy/At/Note hold only
    // the latest edit, and the dispute is always about the value before.
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row({ checkOut: new Date("2026-08-12T12:00:00.000Z"), workedHours: 8.92 }),
      employee: { id: "emp-1", fullName: "Ayesha Rahman", shiftId: null },
    } as never)

    await correctAttendance(actor("HR_ADMIN"), "att-1", { checkOut: "18:30", note: "Second fix" })
    expect(tx.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "CORRECT",
          before: expect.objectContaining({ workedHours: 8.92 }),
        }),
      })
    )
  })
})

describe("createManualAttendance", () => {
  it("409s when the day already has a record", async () => {
    const p2002 = Object.assign(new Error("unique"), { code: "P2002" })
    tx.attendance.create.mockRejectedValue(p2002)

    await expect(
      createManualAttendance(actor("HR_ADMIN"), {
        employeeId: "emp-1",
        date: "2026-08-12",
        checkIn: "09:00",
        note: "Field visit",
      })
    ).rejects.toThrow(/edit it instead/)
  })

  it("marks the source MANUAL and settles it as HR's own decision", async () => {
    await createManualAttendance(actor("HR_ADMIN"), {
      employeeId: "emp-1",
      date: "2026-08-12",
      checkIn: "09:00",
      checkOut: "18:00",
      note: "Field visit",
    })

    expect(tx.attendance.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          source: "MANUAL",
          approval: "APPROVED",
          workedHours: 9,
        }),
      })
    )
  })

  it("404s for an unknown employee", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null)
    await expect(
      createManualAttendance(actor("HR_ADMIN"), {
        employeeId: "nope",
        date: "2026-08-12",
        checkIn: "09:00",
        note: "x",
      })
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe("correction events", () => {
  const emitted = () => tx.event.create.mock.calls[0][0].data

  it("emits attendance.regularised as WARNING when the employee amends their own day", async () => {
    // WARNING because the time came from the person it benefits — the
    // approver has to see that before signing it off.
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "Forgot to tap out" })

    expect(emitted()).toMatchObject({
      type: "attendance.regularised",
      severity: "WARNING",
      entity: "ATTENDANCE",
      entityId: "att-1",
      subjectEmployeeId: "emp-1",
      targetRoles: ["HR_ADMIN"],
      title: "Attendance amended, awaiting approval",
      meta: "Ayesha Rahman · Aug 12",
    })
  })

  it("emits attendance.corrected when HR edits somebody else's record", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({
      ...row(),
      employee: { id: "emp-1", fullName: "Ayesha Rahman", shiftId: null },
    } as never)

    await correctAttendance(actor("HR_ADMIN"), "att-1", { checkOut: "18:00", note: "Confirmed" })
    expect(emitted()).toMatchObject({
      type: "attendance.corrected",
      subjectEmployeeId: "emp-1",
      actorUserId: "user-hr",
      title: "Attendance corrected by HR",
    })
  })

  it("emits attendance.corrected when HR manufactures a record", async () => {
    // An employee who is never told HR created an attendance record for them
    // is exactly the employee who should be able to query it.
    await createManualAttendance(actor("HR_ADMIN"), {
      employeeId: "emp-1",
      date: "2026-08-12",
      checkIn: "09:00",
      checkOut: "18:00",
      note: "Field visit",
    })

    expect(emitted()).toMatchObject({
      type: "attendance.corrected",
      subjectEmployeeId: "emp-1",
      meta: "Ayesha Rahman · Aug 12",
    })
  })

  it("writes exactly one audit row and one event per correction", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    await regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "x" })

    expect(tx.attendanceAudit.create).toHaveBeenCalledTimes(1)
    expect(tx.event.create).toHaveBeenCalledTimes(1)
  })

  it("writes no event when the correction transaction rolls back", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue(row())
    tx.attendance.update.mockRejectedValueOnce(new Error("db down"))

    await expect(
      regulariseAttendance("user-1", "att-1", { checkOut: "18:05", note: "x" })
    ).rejects.toThrow("db down")
    expect(tx.event.create).not.toHaveBeenCalled()
  })
})

describe("getAuditTrail", () => {
  it("403s for anyone but HR â€” it names who changed what", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({ id: "att-1" } as never)
    await expect(getAuditTrail(actor("REPORTING_MANAGER"), "att-1")).rejects.toMatchObject({
      statusCode: 403,
    })
  })

  it("returns the entries oldest first", async () => {
    vi.mocked(prisma.attendance.findUnique).mockResolvedValue({ id: "att-1" } as never)
    vi.mocked(prisma.attendanceAudit.findMany).mockResolvedValue([
      {
        id: "aud-1",
        action: "CHECK_IN",
        changedBy: "user-1",
        changedAt: new Date("2026-08-12T03:05:00.000Z"),
        before: null,
        after: null,
        note: null,
      },
    ] as never)

    const trail = await getAuditTrail(actor("HR_ADMIN"), "att-1")
    expect(trail[0]).toMatchObject({ action: "CHECK_IN", changedAt: "2026-08-12T03:05:00.000Z" })
    expect(prisma.attendanceAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: { changedAt: "asc" } })
    )
  })
})
