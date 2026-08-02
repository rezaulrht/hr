import { describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-08-01" },
}))

vi.mock("../../config/prisma", () => ({ default: {} }))

import { parseDateOnly } from "../../utils/dates"
import { recomputePunchFlags } from "./attendance.recompute"

const GENERAL = {
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

const DATE = parseDateOnly("2026-08-10")
/** 13:30 Dhaka: late against a 09:00 start, on time against a 13:30 one. */
const AT_MIDPOINT = new Date("2026-08-10T07:30:00.000Z")
/** 09:00 Dhaka. */
const AT_START = new Date("2026-08-10T03:00:00.000Z")

const halfDayLeave = {
  startDate: DATE,
  endDate: DATE,
  startSession: "FIRST_HALF",
  endSession: "FIRST_HALF",
}

function tx(over: { row?: Record<string, unknown>; leaves?: unknown[] } = {}) {
  return {
    attendance: {
      findMany: vi.fn().mockResolvedValue([
        {
          id: "att-1",
          employeeId: "emp-1",
          date: DATE,
          checkIn: AT_MIDPOINT,
          checkOut: null,
          isLate: true,
          isEarlyOut: false,
          ...over.row,
        },
      ]),
      update: vi.fn(),
    },
    shift: { findMany: vi.fn().mockResolvedValue([GENERAL]) },
    leaveRequest: { findMany: vi.fn().mockResolvedValue(over.leaves ?? []) },
    employee: { findUnique: vi.fn().mockResolvedValue({ id: "emp-1", shiftId: null }) },
    attendanceAudit: { create: vi.fn() },
  } as any
}

const run = (t: ReturnType<typeof tx>) => recomputePunchFlags(t, "emp-1", DATE, DATE)

describe("recomputePunchFlags", () => {
  it("clears a stale isLate once a first-half leave is approved", async () => {
    const t = tx({ leaves: [halfDayLeave] })
    await run(t)

    expect(t.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "att-1" },
        data: expect.objectContaining({ isLate: false }),
      })
    )
  })

  it("writes a LEAVE_RECOMPUTE audit row for the change", async () => {
    const t = tx({ leaves: [halfDayLeave] })
    await run(t)

    expect(t.attendanceAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: "LEAVE_RECOMPUTE",
          before: { isLate: true, isEarlyOut: false },
          after: { isLate: false, isEarlyOut: false },
        }),
      })
    )
  })

  it("restores isLate when the approval is gone, needing no inverse mode", async () => {
    // Revert calls the same helper. It re-derives from whatever leave is
    // approved *now*, so removing the approval re-judges against the full
    // shift with no separate code path.
    const t = tx({ row: { isLate: false }, leaves: [] })
    await run(t)

    expect(t.attendance.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isLate: true }) })
    )
  })

  it("does not narrow the window for a whole-day leave", async () => {
    const t = tx({
      leaves: [{ ...halfDayLeave, startSession: "FIRST_HALF", endSession: "SECOND_HALF" }],
    })
    await run(t)

    // 13:30 is still late against the untouched 09:00 shift, so nothing changes.
    expect(t.attendance.update).not.toHaveBeenCalled()
  })

  it("writes nothing when the flags are already correct", async () => {
    const t = tx({ row: { checkIn: AT_START, isLate: false }, leaves: [] })
    await run(t)

    expect(t.attendance.update).not.toHaveBeenCalled()
    expect(t.attendanceAudit.create).not.toHaveBeenCalled()
  })

  it("does nothing when there are no attendance rows in range", async () => {
    const t = tx()
    t.attendance.findMany.mockResolvedValue([])
    await run(t)

    expect(t.shift.findMany).not.toHaveBeenCalled()
    expect(t.attendance.update).not.toHaveBeenCalled()
  })

  it("keeps a stored flag when there is no punch instant to re-judge", async () => {
    // Overwriting with `false` would silently clear a flag an HR correction
    // had set on a manual record.
    const t = tx({ row: { checkIn: null, isLate: true }, leaves: [halfDayLeave] })
    await run(t)

    expect(t.attendance.update).not.toHaveBeenCalled()
  })
})
