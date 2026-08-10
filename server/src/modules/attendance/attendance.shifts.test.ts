import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    $transaction: vi.fn(),
    shift: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    employee: { count: vi.fn(), findMany: vi.fn() },
    attendance: { findFirst: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import { createShift, deleteShift, updateShift } from "./attendance.shifts"
import { shiftSchema, shiftUpdateSchema } from "./attendance.validators"

const ACTOR = { sub: "user-1", role: "HR_ADMIN", email: "hr@demo.com", mustChangePassword: false } as any

const GENERAL = {
  id: "s-general",
  name: "General",
  startTime: "09:00",
  endTime: "18:00",
  breakMinutes: 60,
  graceMinutes: 15,
  weeklyOffDays: [5],
}

const NIGHT = { ...GENERAL, id: "s-night", name: "Night" }

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => fn(prisma))
  vi.mocked(prisma.employee.count).mockResolvedValue(0)
  vi.mocked(prisma.attendance.findFirst).mockResolvedValue(null)
})

describe("createShift", () => {
  it("creates and audits", async () => {
    vi.mocked(prisma.shift.create).mockResolvedValue(NIGHT as any)

    const shift = await createShift(
      {
        name: "Night",
        startTime: "22:00",
        endTime: "06:00",
        breakMinutes: 45,
        graceMinutes: 10,
        weeklyOffDays: [5],
      },
      ACTOR
    )

    expect(shift).toEqual(NIGHT)
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ entity: "SHIFT", action: "CREATE" }),
      })
    )
  })

  it("turns a duplicate name into a 409", async () => {
    vi.mocked(prisma.$transaction).mockRejectedValue({ code: "P2002" })

    await expect(
      createShift(
        {
          name: "General",
          startTime: "09:00",
          endTime: "18:00",
          breakMinutes: 60,
          graceMinutes: 15,
          weeklyOffDays: [5],
        },
        ACTOR
      )
    ).rejects.toMatchObject({ statusCode: 409 })
  })
})

describe("updateShift", () => {
  it("returns no impact when only the start time changes", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)
    vi.mocked(prisma.shift.update).mockResolvedValue({ ...NIGHT, startTime: "21:00" } as any)

    const result = await updateShift("s-night", { startTime: "21:00" }, ACTOR)

    // isLate is stored at punch time, so a time change cannot rewrite history.
    expect(result.impact).toBeUndefined()
  })

  it("returns an impact block when weeklyOffDays changes", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)
    vi.mocked(prisma.shift.update).mockResolvedValue({ ...NIGHT, weeklyOffDays: [0, 6] } as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(7)
    vi.mocked(prisma.attendance.findFirst).mockResolvedValue({
      date: new Date("2026-03-01T00:00:00.000Z"),
    } as any)

    const result = await updateShift("s-night", { weeklyOffDays: [0, 6] }, ACTOR)

    expect(result.impact).toEqual({ affectedEmployees: 7, earliestAffectedDate: "2026-03-01" })
  })

  it("reports a null date when the shift has no attendance yet", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)
    vi.mocked(prisma.shift.update).mockResolvedValue({ ...NIGHT, weeklyOffDays: [0] } as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(2)

    const result = await updateShift("s-night", { weeklyOffDays: [0] }, ACTOR)

    expect(result.impact).toEqual({ affectedEmployees: 2, earliestAffectedDate: null })
  })

  it("gives no impact when weeklyOffDays is sent unchanged", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)
    vi.mocked(prisma.shift.update).mockResolvedValue(NIGHT as any)

    const result = await updateShift("s-night", { weeklyOffDays: [5] }, ACTOR)

    expect(result.impact).toBeUndefined()
  })

  // The grid finds the fallback by the literal name, so a rename is a delete.
  it("refuses to rename the General shift", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(GENERAL as any)

    await expect(updateShift("s-general", { name: "Standard" }, ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("cannot be renamed"),
    })
  })

  it("allows editing the General shift's hours", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(GENERAL as any)
    vi.mocked(prisma.shift.update).mockResolvedValue({ ...GENERAL, startTime: "08:00" } as any)

    const result = await updateShift("s-general", { startTime: "08:00" }, ACTOR)

    expect(result.shift.startTime).toBe("08:00")
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(null)

    await expect(updateShift("nope", { startTime: "08:00" }, ACTOR)).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  // shiftUpdateSchema must not carry shiftSchema's defaults. Zod's
  // `.partial()` keeps `.default()`, so building the update schema from it
  // made a start-time PATCH also write weeklyOffDays [5] — resetting the
  // shift's rest days and re-deriving every past day for everyone on it.
  it("writes only the fields the caller sent", () => {
    const parsed = shiftUpdateSchema.parse({ startTime: "21:00" })

    expect(parsed).toEqual({ startTime: "21:00" })
    expect(parsed).not.toHaveProperty("weeklyOffDays")
    expect(parsed).not.toHaveProperty("breakMinutes")
    expect(parsed).not.toHaveProperty("graceMinutes")
  })

  it("still defaults those fields on create, where there is nothing to preserve", () => {
    const parsed = shiftSchema.parse({ name: "Night", startTime: "22:00", endTime: "06:00" })

    expect(parsed.breakMinutes).toBe(60)
    expect(parsed.graceMinutes).toBe(15)
    expect(parsed.weeklyOffDays).toEqual([5])
  })
})

describe("deleteShift", () => {
  it("deletes an unused shift", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)

    await deleteShift("s-night", ACTOR)

    expect(prisma.shift.delete).toHaveBeenCalledWith({ where: { id: "s-night" } })
  })

  // Employee.shiftId is nullable, so Prisma's default is SetNull: without the
  // guard the delete SUCCEEDS and silently drops everyone to the default.
  it("refuses with a count when employees are on it", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(NIGHT as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(3)

    await expect(deleteShift("s-night", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: "This shift is still in use by 3 employees. Reassign them first.",
    })
    expect(prisma.shift.delete).not.toHaveBeenCalled()
  })

  // The usage count is zero here — everyone on the default has shiftId null —
  // so only the name check stands between this and a company-wide 500.
  it("refuses to delete the General shift even with nobody assigned", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(GENERAL as any)
    vi.mocked(prisma.employee.count).mockResolvedValue(0)

    await expect(deleteShift("s-general", ACTOR)).rejects.toMatchObject({
      statusCode: 409,
      message: expect.stringContaining("company default"),
    })
    expect(prisma.shift.delete).not.toHaveBeenCalled()
  })

  it("404s an unknown id", async () => {
    vi.mocked(prisma.shift.findUnique).mockResolvedValue(null)

    await expect(deleteShift("nope", ACTOR)).rejects.toMatchObject({ statusCode: 404 })
  })
})
