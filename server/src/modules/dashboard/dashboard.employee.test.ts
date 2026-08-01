import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/env", () => ({
  env: { APP_TIMEZONE: "Asia/Dhaka", ATTENDANCE_GO_LIVE: "2026-01-01" },
}))

vi.mock("../../config/prisma", () => ({
  default: { expenseClaim: { findMany: vi.fn() } },
}))

vi.mock("../attendance/attendance.service", () => ({ getToday: vi.fn() }))
vi.mock("../attendance/attendance.summary", () => ({ getMonthlySummary: vi.fn() }))
vi.mock("../leave/leave.service", () => ({
  getMyBalances: vi.fn(),
  requireEmployeeForUser: vi.fn(),
}))
vi.mock("../payroll/payroll.service", () => ({ getMyPayslips: vi.fn() }))
vi.mock("../event/event.service", () => ({ listEvents: vi.fn() }))

import prisma from "../../config/prisma"
import { getToday } from "../attendance/attendance.service"
import { getMonthlySummary } from "../attendance/attendance.summary"
import type { AccessTokenPayload } from "../auth/auth.types"
import { AppError } from "../../middleware/errorHandler"
import { listEvents } from "../event/event.service"
import { getMyBalances, requireEmployeeForUser } from "../leave/leave.service"
import { getMyPayslips } from "../payroll/payroll.service"
import { Prisma } from "../../generated/prisma/client"
import { buildEmployeeDashboard } from "./dashboard.employee"

const NOW = new Date("2026-08-15T06:00:00.000Z")
const actor = { sub: "user-1", role: "EMPLOYEE", email: "e@d.com", mustChangePassword: false } as AccessTokenPayload

const dec = (n: string) => new Prisma.Decimal(n)

const cardBy = (payload: Awaited<ReturnType<typeof buildEmployeeDashboard>>, label: string) => {
  const card = payload.stats.find((s) => s.label === label)
  if (!card) throw new Error(`No card labelled "${label}"`)
  return card
}

const TODAY = {
  serverTime: "2026-08-15T06:00:00.000Z",
  date: "2026-08-15",
  status: "PRESENT",
  checkIn: "2026-08-15T03:05:00.000Z",
  checkOut: null,
  workedHours: null,
  isLate: false,
  isEarlyOut: false,
  approval: "PENDING",
  shift: {
    id: "s1",
    name: "General",
    startTime: "09:00",
    endTime: "18:00",
    breakMinutes: 60,
    graceMinutes: 15,
    weeklyOffDays: [5],
    expectedHours: 9,
  },
  canCheckIn: false,
  canCheckOut: true,
  detail: null,
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)

  vi.mocked(requireEmployeeForUser).mockResolvedValue({
    id: "emp-1",
    fullName: "Ayesha Rahman",
  } as never)
  vi.mocked(getMyBalances).mockResolvedValue([])
  vi.mocked(getMonthlySummary).mockResolvedValue([])
  vi.mocked(getMyPayslips).mockResolvedValue([] as never)
  vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([] as never)
  vi.mocked(getToday).mockResolvedValue(TODAY as never)
  vi.mocked(listEvents).mockResolvedValue({ items: [], nextCursor: null })
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("leave balance", () => {
  it("lists the balance per type", async () => {
    vi.mocked(getMyBalances).mockResolvedValue([
      { name: "Casual", balance: 6 },
      { name: "Sick", balance: 8 },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Leave balance")
    expect(card.value).toBe("14 days")
    expect(card.sub).toBe("Casual 6 · Sick 8")
  })

  it("renders a negative earned-leave balance as negative", async () => {
    // BD Labour Act behaviour. Clamping would hide a real deficit, and the
    // employee would plan a holiday they cannot take.
    vi.mocked(getMyBalances).mockResolvedValue([
      { name: "Earned", balance: -3 },
      { name: "Casual", balance: 1 },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Leave balance")
    expect(card.value.startsWith("-")).toBe(true)
    expect(card.value).toBe("-2 days")
    expect(card.sub).toContain("Earned -3")
    expect(card.tone).toBe("red")
  })
})

describe("attendance", () => {
  it("reads the employee's own summary only", async () => {
    vi.mocked(getMonthlySummary).mockResolvedValue([
      { present: 9, workingDays: 10, late: 2 },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Attendance")
    expect(getMonthlySummary).toHaveBeenCalledWith(actor)
    expect(card.value).toBe("90%")
    expect(card.sub).toBe("9 of 10 working days · 2 late")
  })

  it("says nothing is recorded rather than dividing by zero", async () => {
    const card = cardBy(await buildEmployeeDashboard(actor), "Attendance")
    expect(card.value).toBe("—")
    expect(card.sub).toBe("Nothing recorded this month")
  })
})

describe("latest payslip", () => {
  it("renders a BDT payslip in BDT with no equivalent line", async () => {
    vi.mocked(getMyPayslips).mockResolvedValue([
      {
        currency: "BDT",
        netPayable: dec("48000"),
        netPayableBdt: dec("48000"),
        payrollRun: { month: 7, year: 2026, status: "DISBURSED" },
      },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Latest payslip")
    expect(card.value).toBe("৳48,000")
    expect(card.sub).toBe("July 2026")
    expect(card.tone).toBe("green")
  })

  it("renders a USD payslip in USD with the BDT equivalent underneath", async () => {
    // Somebody paid in USD reading a BDT-only card cannot reconcile it
    // against their own bank statement.
    vi.mocked(getMyPayslips).mockResolvedValue([
      {
        currency: "USD",
        netPayable: dec("2000"),
        netPayableBdt: dec("245000"),
        payrollRun: { month: 7, year: 2026, status: "APPROVED" },
      },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Latest payslip")
    expect(card.value).toBe("$2,000")
    expect(card.sub).toBe("July 2026 · ৳2.45L equivalent")
    expect(card.tag).toBe("Approved")
  })

  it("says None yet when nothing has been published", async () => {
    const card = cardBy(await buildEmployeeDashboard(actor), "Latest payslip")
    expect(card.value).toBe("None yet")
  })
})

describe("expense claims", () => {
  it("splits awaiting review from approved but unpaid", async () => {
    vi.mocked(prisma.expenseClaim.findMany).mockResolvedValue([
      { amount: dec("1200"), currency: "BDT", status: "PENDING" },
      { amount: dec("800"), currency: "BDT", status: "APPROVED" },
    ] as never)

    const card = cardBy(await buildEmployeeDashboard(actor), "Expense claims")
    expect(card.value).toBe("2")
    expect(card.sub).toBe("1 awaiting review · 1 approved, not yet paid")
  })

  it("scopes to the caller's own claims", async () => {
    await buildEmployeeDashboard(actor)
    expect(prisma.expenseClaim.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { employeeId: "emp-1", status: { in: ["PENDING", "APPROVED"] } },
      })
    )
  })
})

describe("the time clock", () => {
  it("carries server time, never a browser clock", async () => {
    const payload = await buildEmployeeDashboard(actor)
    expect(payload.timeClock?.serverNow).toBe("2026-08-15T06:00:00.000Z")
  })

  it("names the assigned shift rather than a hardcoded string", async () => {
    const payload = await buildEmployeeDashboard(actor)
    expect(payload.timeClock?.shift).toBe("General · 09:00–18:00")
  })

  it("reads as checked in only while a check-in has no check-out", async () => {
    const payload = await buildEmployeeDashboard(actor)
    expect(payload.timeClock?.checkedIn).toBe(true)

    vi.mocked(getToday).mockResolvedValue({
      ...TODAY,
      checkOut: "2026-08-15T12:05:00.000Z",
      workedHours: 9,
    } as never)
    const after = await buildEmployeeDashboard(actor)
    expect(after.timeClock?.checkedIn).toBe(false)
    expect(after.timeClock?.hoursToday).toBe(9)
  })

  it("surfaces why today is not a working day in the greeting", async () => {
    vi.mocked(getToday).mockResolvedValue({ ...TODAY, detail: "Eid-ul-Azha" } as never)
    const payload = await buildEmployeeDashboard(actor)
    expect(payload.greeting.sub).toBe("Eid-ul-Azha")
  })
})

describe("the feed", () => {
  it("reads the event log and maps it, querying no feature table", async () => {
    vi.mocked(listEvents).mockResolvedValue({
      items: [
        {
          id: "evt-1",
          type: "payslip.published",
          severity: "SUCCESS",
          entity: "PAYSLIP",
          entityId: "slip-1",
          title: "Your July 2026 payslip is ready",
          meta: null,
          href: "/payroll",
          createdAt: "2026-08-01T10:00:00.000Z",
        },
      ],
      nextCursor: null,
    })

    const payload = await buildEmployeeDashboard(actor)
    expect(listEvents).toHaveBeenCalledWith(actor, { limit: 5 })
    expect(payload.feed).toEqual([
      {
        initial: "P",
        tone: "green",
        title: "Your July 2026 payslip is ready",
        meta: "",
        time: "2026-08-01T10:00:00.000Z",
      },
    ])
  })

  it("returns an empty feed rather than a spinner that never resolves", async () => {
    const payload = await buildEmployeeDashboard(actor)
    expect(payload.feed).toEqual([])
  })
})

describe("dispatch and failure", () => {
  it("fails cleanly for an account with no employee row", async () => {
    // The module's existing 403, not a null dereference four cards deep.
    vi.mocked(requireEmployeeForUser).mockRejectedValue(
      new AppError(403, "This account has no employee profile, so it cannot hold leave")
    )

    await expect(buildEmployeeDashboard(actor)).rejects.toMatchObject({ statusCode: 403 })
  })

  it("survives one card failing", async () => {
    vi.mocked(getMyPayslips).mockRejectedValue(new Error("payroll down"))
    vi.spyOn(console, "error").mockImplementation(() => {})

    const payload = await buildEmployeeDashboard(actor)
    expect(payload.stats).toHaveLength(4)
    expect(cardBy(payload, "Latest payslip").failed).toBe(true)
    expect(cardBy(payload, "Leave balance").failed).toBeUndefined()
  })
})
