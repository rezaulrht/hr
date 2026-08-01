import type { AccessTokenPayload } from "../auth/auth.types"
import { timeOfDayGreeting } from "./dashboard.greeting"
import type { DashboardPayload } from "./dashboard.types"

export async function buildAdminDashboard(
  _actor: AccessTokenPayload
): Promise<DashboardPayload> {
  return {
    role: "SUPER_ADMIN",
    greeting: {
      kicker: timeOfDayGreeting(),
      // "What needs me, and is the org healthy" — this role's only job in the
      // payroll workflow is approving what Finance submitted.
      heading: "Organisation overview",
      sub: "Approvals waiting on you, and the numbers behind them.",
      cta: { label: "Review payroll", href: "/admin/payroll" },
    },
    stats: [],
    badges: {},
  }
}
