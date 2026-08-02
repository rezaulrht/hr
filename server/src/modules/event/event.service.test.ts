import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("../../config/prisma", () => ({
  default: {
    employee: { findUnique: vi.fn() },
    event: { findMany: vi.fn() },
  },
}))

import prisma from "../../config/prisma"
import type { AccessTokenPayload } from "../auth/auth.types"
import { listEvents, visibleToFilter } from "./event.service"

const actor = (role: string): AccessTokenPayload =>
  ({ sub: "user-1", role, email: "a@demo.com", mustChangePassword: false }) as AccessTokenPayload

/** Whether a row would be matched by the filter's four-clause OR. */
function matches(
  filter: ReturnType<typeof visibleToFilter>,
  row: {
    companyWide?: boolean
    subjectEmployeeId?: string | null
    managerEmployeeId?: string | null
    targetRoles?: string[]
    audienceDepartmentId?: string | null
  }
): boolean {
  const clauses = (filter.OR ?? []) as Array<Record<string, unknown>>
  return clauses.some((clause) => {
    if ("companyWide" in clause) return row.companyWide === true
    if ("subjectEmployeeId" in clause) return row.subjectEmployeeId === clause.subjectEmployeeId
    if ("managerEmployeeId" in clause) return row.managerEmployeeId === clause.managerEmployeeId
    if ("targetRoles" in clause) {
      const has = (clause.targetRoles as { has: string }).has
      return (row.targetRoles ?? []).includes(has)
    }
    if ("audienceDepartmentId" in clause) {
      return row.audienceDepartmentId === clause.audienceDepartmentId
    }
    return false
  })
}

afterEach(() => vi.clearAllMocks())

describe("visibleToFilter", () => {
  it("shows an employee the events they are the subject of", () => {
    const filter = visibleToFilter(actor("EMPLOYEE"), { employeeId: "emp-1", departmentId: "dept-eng" })
    expect(matches(filter, { subjectEmployeeId: "emp-1" })).toBe(true)
    expect(matches(filter, { subjectEmployeeId: "emp-2" })).toBe(false)
  })

  it("shows a manager their reports' events but not a peer's", () => {
    const filter = visibleToFilter(actor("REPORTING_MANAGER"), { employeeId: "emp-9", departmentId: "dept-eng" })
    expect(matches(filter, { subjectEmployeeId: "emp-1", managerEmployeeId: "emp-9" })).toBe(true)
    // Neither subject nor manager: another team's business.
    expect(matches(filter, { subjectEmployeeId: "emp-2", managerEmployeeId: "emp-8" })).toBe(false)
  })

  it("shows HR only what was targeted at HR", () => {
    const filter = visibleToFilter(actor("HR_ADMIN"), { employeeId: "emp-hr", departmentId: "dept-eng" })
    expect(matches(filter, { targetRoles: ["HR_ADMIN"] })).toBe(true)
    expect(matches(filter, { targetRoles: ["FINANCE_OFFICER"] })).toBe(false)
  })

  it("does not show HR a leave rejection aimed at the subject and their manager", () => {
    // The explicit negative for "no blanket admin visibility": an employee's
    // rejection is between them and their manager, and an admin role is not
    // a licence to read it in a feed.
    const filter = visibleToFilter(actor("HR_ADMIN"), { employeeId: "emp-hr", departmentId: "dept-eng" })
    expect(
      matches(filter, {
        subjectEmployeeId: "emp-1",
        managerEmployeeId: "emp-9",
        targetRoles: [],
      })
    ).toBe(false)
  })

  it("does not show a SUPER_ADMIN everything either", () => {
    const filter = visibleToFilter(actor("SUPER_ADMIN"), { employeeId: null, departmentId: null })
    expect(matches(filter, { subjectEmployeeId: "emp-1", targetRoles: [] })).toBe(false)
    expect(matches(filter, { targetRoles: ["SUPER_ADMIN"] })).toBe(true)
  })

  it("shows everyone a company-wide event", () => {
    for (const role of ["EMPLOYEE", "REPORTING_MANAGER", "HR_ADMIN", "FINANCE_OFFICER", "SUPER_ADMIN"]) {
      expect(matches(visibleToFilter(actor(role), { employeeId: "emp-1", departmentId: "dept-eng" }), { companyWide: true })).toBe(true)
    }
  })

  it("drops the employee clauses entirely for an account with no employee row", () => {
    // Not compared against null: `subjectEmployeeId = null` would match every
    // event that has no subject, which is most of the company-wide ones.
    const filter = visibleToFilter(actor("SUPER_ADMIN"), { employeeId: null, departmentId: null })
    const clauses = JSON.stringify(filter)
    expect(clauses).not.toContain("subjectEmployeeId")
    expect(clauses).not.toContain("managerEmployeeId")
    expect(matches(filter, { targetRoles: ["SUPER_ADMIN"] })).toBe(true)
  })

  it("shows a department-scoped event only to that department", () => {
    // Stored as a rule, so a 200-person department is one row rather than
    // 200 — the same reason a company-wide event is one insert.
    const engineer = visibleToFilter(actor("EMPLOYEE"), {
      employeeId: "emp-1",
      departmentId: "dept-eng",
    })
    const financeStaff = visibleToFilter(actor("EMPLOYEE"), {
      employeeId: "emp-2",
      departmentId: "dept-fin",
    })

    expect(matches(engineer, { audienceDepartmentId: "dept-eng" })).toBe(true)
    expect(matches(financeStaff, { audienceDepartmentId: "dept-eng" })).toBe(false)
  })

  it("drops the department clause for an account with no department", () => {
    const filter = visibleToFilter(actor("FINANCE_OFFICER"), {
      employeeId: "emp-fin",
      departmentId: null,
    })
    expect(JSON.stringify(filter)).not.toContain("audienceDepartmentId")
  })
})

describe("listEvents", () => {
  const row = (id: string) => ({
    id,
    type: "leave.approved",
    severity: "SUCCESS",
    entity: "LEAVE_REQUEST",
    entityId: `lr-${id}`,
    title: "Approved",
    meta: null,
    href: "/employee/leave",
    createdAt: new Date("2026-08-01T10:00:00.000Z"),
  })

  function stub(rows: ReturnType<typeof row>[]) {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue({ id: "emp-1" } as never)
    vi.mocked(prisma.event.findMany).mockResolvedValue(rows as never)
  }

  it("always applies the visibility filter", async () => {
    stub([])
    await listEvents(actor("EMPLOYEE"))

    const args = vi.mocked(prisma.event.findMany).mock.calls[0][0]
    expect(JSON.stringify(args?.where)).toContain("companyWide")
    expect(JSON.stringify(args?.where)).toContain("emp-1")
  })

  it("orders by createdAt then id, so cursor pages do not duplicate rows", async () => {
    // Two events emitted inside one transaction share a timestamp, which is
    // routine rather than rare â€” createdAt alone is not a stable order.
    stub([])
    await listEvents(actor("EMPLOYEE"))

    const args = vi.mocked(prisma.event.findMany).mock.calls[0][0]
    expect(args?.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }])
  })

  it("caps the limit server-side", async () => {
    stub([])
    await listEvents(actor("HR_ADMIN"), { limit: 5000 })
    expect(vi.mocked(prisma.event.findMany).mock.calls[0][0]?.take).toBe(51)
  })

  it("returns a cursor only when another page exists", async () => {
    stub([row("a"), row("b"), row("c")])
    const page = await listEvents(actor("EMPLOYEE"), { limit: 2 })

    expect(page.items.map((i) => i.id)).toEqual(["a", "b"])
    expect(page.nextCursor).toBe("b")
  })

  it("returns a null cursor on the last page", async () => {
    stub([row("a")])
    const page = await listEvents(actor("EMPLOYEE"), { limit: 2 })
    expect(page.nextCursor).toBeNull()
  })

  it("skips the cursor row itself", async () => {
    stub([])
    await listEvents(actor("EMPLOYEE"), { cursor: "evt-9" })

    const args = vi.mocked(prisma.event.findMany).mock.calls[0][0]
    expect(args?.cursor).toEqual({ id: "evt-9" })
    expect(args?.skip).toBe(1)
  })

  it("holds back a scheduled announcement until its publish time arrives", async () => {
    // Visibility falls out of a time comparison with no second write, which
    // is the whole point — a cron job would fail silently on the one morning
    // it mattered.
    stub([])
    await listEvents(actor("EMPLOYEE"), { now: new Date("2026-08-01T09:00:00.000Z") })

    const where = JSON.stringify(vi.mocked(prisma.event.findMany).mock.calls[0][0]?.where)
    expect(where).toContain("publishAt")
    expect(where).toContain("2026-08-01T09:00:00.000Z")
  })

  it("does not hide every other event type behind the publishAt filter", async () => {
    // Only announcement events carry `publishAt`. Without the type escape
    // clause, applying this filter would empty the feed.
    stub([])
    await listEvents(actor("EMPLOYEE"))

    const where = JSON.stringify(vi.mocked(prisma.event.findMany).mock.calls[0][0]?.where)
    expect(where).toContain('{"not":"announcement.published"}')
  })

  it("narrows to one entity when asked", async () => {
    stub([])
    await listEvents(actor("EMPLOYEE"), { entity: "LEAVE_REQUEST", entityId: "lr-1" })

    const where = JSON.stringify(vi.mocked(prisma.event.findMany).mock.calls[0][0]?.where)
    expect(where).toContain("LEAVE_REQUEST")
    expect(where).toContain("lr-1")
  })

  it("does not leak the audience columns or the payload to the client", async () => {
    // `payload` can carry the figure `title` was deliberately written to keep
    // off a screen in an open-plan office.
    stub([row("a")])
    const page = await listEvents(actor("EMPLOYEE"))

    expect(Object.keys(page.items[0]).sort()).toEqual(
      ["createdAt", "entity", "entityId", "href", "id", "meta", "severity", "title", "type"]
    )
  })

  it("does not crash for an account with no employee row", async () => {
    vi.mocked(prisma.employee.findUnique).mockResolvedValue(null as never)
    vi.mocked(prisma.event.findMany).mockResolvedValue([] as never)

    await expect(listEvents(actor("SUPER_ADMIN"))).resolves.toEqual({
      items: [],
      nextCursor: null,
    })
  })
})
