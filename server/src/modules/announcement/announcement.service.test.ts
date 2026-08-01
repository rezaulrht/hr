import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findUnique: vi.fn() },
    announcement: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  },
}))

import prisma from "../../config/prisma"
import type { AccessTokenPayload } from "../auth/auth.types"
import {
  createAnnouncement,
  deleteAnnouncement,
  getAnnouncement,
  listAnnouncements,
  updateAnnouncement,
  visibleTo,
} from "./announcement.service"

const NOW = new Date("2026-08-01T09:00:00.000Z")

const actor = (role: string, sub = "user-1"): AccessTokenPayload =>
  ({ sub, role, email: "a@demo.com", mustChangePassword: false }) as AccessTokenPayload

const row = (overrides: Record<string, unknown> = {}) => ({
  id: "ann-1",
  title: "Office closed",
  body: "Sunday",
  audience: "ALL",
  departmentId: null,
  department: null,
  targetRole: null,
  publishedBy: "user-1",
  publishedAt: new Date("2026-07-30T09:00:00.000Z"),
  createdAt: NOW,
  updatedAt: NOW,
  ...overrides,
})

/**
 * Whether the filter would match a stored row. Mirrors the clauses the
 * service builds rather than the database, which is enough to pin the
 * *policy* — the shape of the query is asserted separately.
 */
function matches(
  filter: ReturnType<typeof visibleTo>,
  stored: {
    audience: string
    departmentId?: string | null
    targetRole?: string | null
    publishedBy: string
    publishedAt: Date | null
  },
  now = NOW
): boolean {
  if (Object.keys(filter).length === 0) return true
  const clauses = (filter.OR ?? []) as Array<Record<string, unknown>>
  return clauses.some((clause) => {
    if ("publishedBy" in clause) return stored.publishedBy === clause.publishedBy
    const [live, addressed] = clause.AND as [Record<string, unknown>, Record<string, unknown>]
    void live
    const isLive = stored.publishedAt !== null && stored.publishedAt <= now
    if (!isLive) return false
    return (addressed.OR as Array<Record<string, unknown>>).some((a) => {
      if (a.audience !== stored.audience) return false
      if (a.audience === "ROLE") return a.targetRole === stored.targetRole
      if (a.audience === "DEPARTMENT") return a.departmentId === stored.departmentId
      return true
    })
  })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.mocked(prisma.employee.findUnique).mockResolvedValue({ departmentId: "dept-eng" } as never)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe("visibleTo", () => {
  const live = { publishedBy: "user-9", publishedAt: new Date("2026-07-30T09:00:00.000Z") }

  it("shows an ALL announcement to everyone", () => {
    for (const role of ["EMPLOYEE", "REPORTING_MANAGER", "FINANCE_OFFICER"]) {
      expect(matches(visibleTo(actor(role), "dept-eng"), { ...live, audience: "ALL" })).toBe(true)
    }
  })

  it("shows a DEPARTMENT announcement only to that department", () => {
    const filter = visibleTo(actor("EMPLOYEE"), "dept-eng")
    expect(
      matches(filter, { ...live, audience: "DEPARTMENT", departmentId: "dept-eng" })
    ).toBe(true)
    expect(
      matches(filter, { ...live, audience: "DEPARTMENT", departmentId: "dept-fin" })
    ).toBe(false)
  })

  it("shows a ROLE announcement only to holders of that role", () => {
    const filter = visibleTo(actor("FINANCE_OFFICER"), "dept-fin")
    expect(
      matches(filter, { ...live, audience: "ROLE", targetRole: "FINANCE_OFFICER" })
    ).toBe(true)
    expect(matches(filter, { ...live, audience: "ROLE", targetRole: "EMPLOYEE" })).toBe(false)
  })

  it.each(["SUPER_ADMIN", "HR_ADMIN"])("shows %s everything, drafts included", (role) => {
    const filter = visibleTo(actor(role), null)
    expect(filter).toEqual({})
    expect(
      matches(filter, {
        audience: "DEPARTMENT",
        departmentId: "dept-eng",
        publishedBy: "user-9",
        publishedAt: null,
      })
    ).toBe(true)
  })

  it("hides a draft from its audience but not from its publisher", () => {
    const draft = { audience: "ALL", publishedBy: "user-7", publishedAt: null }
    expect(matches(visibleTo(actor("EMPLOYEE"), "dept-eng"), draft)).toBe(false)
    expect(matches(visibleTo(actor("HR_ADMIN", "user-7"), null), draft)).toBe(true)
    expect(matches(visibleTo(actor("REPORTING_MANAGER", "user-7"), "dept-eng"), draft)).toBe(true)
  })

  it("hides a scheduled announcement until the clock passes it, with no write", () => {
    const scheduled = {
      audience: "ALL",
      publishedBy: "user-9",
      publishedAt: new Date("2026-08-02T09:00:00.000Z"),
    }
    const filter = visibleTo(actor("EMPLOYEE"), "dept-eng", NOW)
    expect(matches(filter, scheduled, NOW)).toBe(false)

    // Same row, same filter shape, one day later — nothing was written.
    const later = new Date("2026-08-03T09:00:00.000Z")
    expect(matches(visibleTo(actor("EMPLOYEE"), "dept-eng", later), scheduled, later)).toBe(true)
  })

  it("does not crash for an account with no employee row", () => {
    // A FINANCE_OFFICER login with no employee profile is a normal state.
    const filter = visibleTo(actor("FINANCE_OFFICER"), null)
    expect(JSON.stringify(filter)).not.toContain("DEPARTMENT")
    expect(
      matches(filter, {
        audience: "DEPARTMENT",
        departmentId: "dept-eng",
        publishedBy: "user-9",
        publishedAt: new Date("2026-07-30T09:00:00.000Z"),
      })
    ).toBe(false)
  })
})

describe("createAnnouncement", () => {
  beforeEach(() => {
    vi.mocked(prisma.announcement.create).mockResolvedValue(row() as never)
  })

  it("publishes now when publishedAt is omitted", async () => {
    await createAnnouncement(actor("HR_ADMIN"), {
      title: "T",
      body: "B",
      audience: "ALL",
    } as never)

    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publishedAt: NOW }) })
    )
  })

  it("keeps it a draft when publishedAt is explicitly null", async () => {
    // Collapsing "omitted" and "null" would make every save-for-later post
    // go live the moment it was written.
    await createAnnouncement(actor("HR_ADMIN"), {
      title: "T",
      body: "B",
      audience: "ALL",
      publishedAt: null,
    } as never)

    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ publishedAt: null }) })
    )
  })

  it("takes a manager's department from their employee record, not the body", async () => {
    // The one place a request field could escalate scope.
    await createAnnouncement(actor("REPORTING_MANAGER"), {
      title: "T",
      body: "B",
      audience: "DEPARTMENT",
      departmentId: "dept-eng",
    } as never)

    expect(prisma.employee.findUnique).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      select: { departmentId: true },
    })
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ departmentId: "dept-eng" }) })
    )
  })

  it("403s a manager posting to another department", async () => {
    await expect(
      createAnnouncement(actor("REPORTING_MANAGER"), {
        title: "T",
        body: "B",
        audience: "DEPARTMENT",
        departmentId: "dept-finance",
      } as never)
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.announcement.create).not.toHaveBeenCalled()
  })

  it("403s a manager announcing company-wide", async () => {
    await expect(
      createAnnouncement(actor("REPORTING_MANAGER"), {
        title: "T",
        body: "B",
        audience: "ALL",
      } as never)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("403s a manager with no department, who has no audience", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ departmentId: null } as never)
    await expect(
      createAnnouncement(actor("REPORTING_MANAGER"), {
        title: "T",
        body: "B",
        audience: "DEPARTMENT",
      } as never)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("403s an employee outright", async () => {
    await expect(
      createAnnouncement(actor("EMPLOYEE"), { title: "T", body: "B", audience: "ALL" } as never)
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it.each(["SUPER_ADMIN", "HR_ADMIN", "FINANCE_OFFICER"])(
    "lets %s target any audience",
    async (role) => {
      await createAnnouncement(actor(role), {
        title: "T",
        body: "B",
        audience: "ROLE",
        targetRole: "EMPLOYEE",
      } as never)
      expect(prisma.announcement.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ audience: "ROLE", targetRole: "EMPLOYEE" }),
        })
      )
    }
  )

  it("clears the unused target column so nothing half-trusts it", async () => {
    await createAnnouncement(actor("HR_ADMIN"), {
      title: "T",
      body: "B",
      audience: "ALL",
    } as never)
    expect(prisma.announcement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ departmentId: null, targetRole: null }),
      })
    )
  })
})

describe("editing and deleting", () => {
  beforeEach(() => {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue({
      id: "ann-1",
      publishedBy: "user-7",
      audience: "ALL",
      departmentId: null,
      targetRole: null,
    } as never)
    vi.mocked(prisma.announcement.update).mockResolvedValue(row() as never)
  })

  it("lets the publisher edit their own", async () => {
    await updateAnnouncement(actor("REPORTING_MANAGER", "user-7"), "ann-1", { title: "New" })
    expect(prisma.announcement.update).toHaveBeenCalled()
  })

  it.each(["SUPER_ADMIN", "HR_ADMIN"])("lets %s moderate anyone's", async (role) => {
    await updateAnnouncement(actor(role, "user-99"), "ann-1", { title: "New" })
    expect(prisma.announcement.update).toHaveBeenCalled()
  })

  it("403s a different publisher", async () => {
    await expect(
      updateAnnouncement(actor("FINANCE_OFFICER", "user-8"), "ann-1", { title: "New" })
    ).rejects.toMatchObject({ statusCode: 403 })
  })

  it("404s an announcement that does not exist", async () => {
    vi.mocked(prisma.announcement.findUnique).mockResolvedValue(null as never)
    await expect(
      updateAnnouncement(actor("HR_ADMIN"), "nope", { title: "New" })
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it("re-resolves the whole audience triple when any part of it is touched", async () => {
    // Otherwise `audience: ROLE` could sit next to a stale departmentId.
    await updateAnnouncement(actor("HR_ADMIN", "user-7"), "ann-1", {
      audience: "ROLE",
      targetRole: "EMPLOYEE",
    })
    expect(prisma.announcement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          audience: "ROLE",
          targetRole: "EMPLOYEE",
          department: { disconnect: true },
        }),
      })
    )
  })

  it("publishes a draft by setting publishedAt, with no other change", async () => {
    await updateAnnouncement(actor("HR_ADMIN", "user-7"), "ann-1", {
      publishedAt: "2026-08-05T04:00:00.000Z",
    })
    expect(prisma.announcement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { publishedAt: new Date("2026-08-05T04:00:00.000Z") },
      })
    )
  })

  it("403s a different publisher deleting", async () => {
    await expect(
      deleteAnnouncement(actor("FINANCE_OFFICER", "user-8"), "ann-1")
    ).rejects.toMatchObject({ statusCode: 403 })
    expect(prisma.announcement.delete).not.toHaveBeenCalled()
  })

  it("deletes for the publisher", async () => {
    await deleteAnnouncement(actor("REPORTING_MANAGER", "user-7"), "ann-1")
    expect(prisma.announcement.delete).toHaveBeenCalledWith({ where: { id: "ann-1" } })
  })
})

describe("reading", () => {
  it("caps the list limit server-side", async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as never)
    await listAnnouncements(actor("EMPLOYEE"), 5000)
    expect(vi.mocked(prisma.announcement.findMany).mock.calls[0][0]?.take).toBe(50)
  })

  it("sorts drafts to the top, since their author is still writing them", async () => {
    vi.mocked(prisma.announcement.findMany).mockResolvedValue([] as never)
    await listAnnouncements(actor("HR_ADMIN"))
    expect(vi.mocked(prisma.announcement.findMany).mock.calls[0][0]?.orderBy).toEqual([
      { publishedAt: "desc" },
      { createdAt: "desc" },
    ])
  })

  it("404s rather than 403s an announcement the caller may not see", async () => {
    // Telling someone it exists but is not for them is itself a disclosure.
    vi.mocked(prisma.announcement.findFirst).mockResolvedValue(null as never)
    await expect(getAnnouncement(actor("EMPLOYEE"), "ann-1")).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it("returns the department name alongside the id", async () => {
    vi.mocked(prisma.announcement.findFirst).mockResolvedValue(
      row({ audience: "DEPARTMENT", departmentId: "dept-eng", department: { name: "Engineering" } }) as never
    )
    const item = await getAnnouncement(actor("EMPLOYEE"), "ann-1")
    expect(item.departmentName).toBe("Engineering")
  })
})
