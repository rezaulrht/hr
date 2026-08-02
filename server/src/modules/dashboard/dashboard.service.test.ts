import { afterEach, describe, expect, it, vi } from "vitest"

vi.mock("./dashboard.admin", () => ({ buildAdminDashboard: vi.fn(async () => ({ role: "SUPER_ADMIN" })) }))
vi.mock("./dashboard.hr", () => ({ buildHrDashboard: vi.fn(async () => ({ role: "HR_ADMIN" })) }))
vi.mock("./dashboard.finance", () => ({
  buildFinanceDashboard: vi.fn(async () => ({ role: "FINANCE_OFFICER" })),
}))
vi.mock("./dashboard.manager", () => ({
  buildManagerDashboard: vi.fn(async () => ({ role: "REPORTING_MANAGER" })),
}))
vi.mock("./dashboard.employee", () => ({
  buildEmployeeDashboard: vi.fn(async () => ({ role: "EMPLOYEE" })),
}))

import type { AccessTokenPayload } from "../auth/auth.types"
import { Role } from "../../generated/prisma/client"
import { buildEmployeeDashboard } from "./dashboard.employee"
import { buildManagerDashboard } from "./dashboard.manager"
import { getDashboard } from "./dashboard.service"

const actor = (role: Role) =>
  ({ sub: "user-1", role, email: "a@d.com", mustChangePassword: false }) as AccessTokenPayload

afterEach(() => vi.clearAllMocks())

describe("role dispatch", () => {
  it.each(Object.values(Role))("routes %s to its own builder", async (role) => {
    await expect(getDashboard(actor(role))).resolves.toMatchObject({ role })
  })

  it("gives a manager the manager payload, not the employee one", async () => {
    // A REPORTING_MANAGER also has an `Employee` row. The dispatch is on the
    // JWT role and must never become profile-driven — that would hand every
    // manager the wrong dashboard the moment somebody "simplified" it.
    await getDashboard(actor(Role.REPORTING_MANAGER))

    expect(buildManagerDashboard).toHaveBeenCalledTimes(1)
    expect(buildEmployeeDashboard).not.toHaveBeenCalled()
  })

  it("passes the whole token through, so each builder scopes itself", async () => {
    const token = actor(Role.REPORTING_MANAGER)
    await getDashboard(token)
    expect(buildManagerDashboard).toHaveBeenCalledWith(token)
  })
})
