import type { AccessTokenPayload } from "../auth/auth.types"
import { timeOfDayGreeting } from "./dashboard.greeting"
import type { DashboardPayload } from "./dashboard.types"

export async function buildManagerDashboard(
  _actor: AccessTokenPayload
): Promise<DashboardPayload> {
  return {
    role: "REPORTING_MANAGER",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "Your team",
      sub: "Who is in today, and what is waiting on your decision.",
      cta: { label: "Review approvals", href: "/manager/approvals" },
    },
    stats: [],
    badges: {},
  }
}
