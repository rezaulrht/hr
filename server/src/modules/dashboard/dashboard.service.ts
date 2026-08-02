/**
 * The one read layer behind `GET /api/dashboard`.
 *
 * This module owns **no table**. It shapes a response from `req.user.role` by
 * importing *service functions* from the feature modules — `getMonthlySummary`,
 * `getDailySummary`, `getTeamStatus`, `getMyBalances`, `preflight`,
 * `listEvents` — rather than re-querying Prisma. A second implementation of
 * the attendance day grid living in here is the failure mode that rule exists
 * to prevent: it would drift, and the copy that drifts is the one nobody
 * tests.
 *
 * The role comes from the JWT and nowhere else. Never a query parameter,
 * never a path segment.
 */

import type { AccessTokenPayload } from "../auth/auth.types"
import { buildAdminDashboard } from "./dashboard.admin"
import { buildEmployeeDashboard } from "./dashboard.employee"
import { buildFinanceDashboard } from "./dashboard.finance"
import { buildHrDashboard } from "./dashboard.hr"
import { buildManagerDashboard } from "./dashboard.manager"
import type { DashboardPayload } from "./dashboard.types"

export function getDashboard(actor: AccessTokenPayload): Promise<DashboardPayload> {
  switch (actor.role) {
    case "SUPER_ADMIN":
      return buildAdminDashboard(actor)
    case "HR_ADMIN":
      return buildHrDashboard(actor)
    case "FINANCE_OFFICER":
      return buildFinanceDashboard(actor)
    case "REPORTING_MANAGER":
      return buildManagerDashboard(actor)
    case "EMPLOYEE":
      return buildEmployeeDashboard(actor)
  }
}
