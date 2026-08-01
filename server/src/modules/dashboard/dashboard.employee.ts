import type { AccessTokenPayload } from "../auth/auth.types"
import { timeOfDayGreeting } from "./dashboard.greeting"
import type { DashboardPayload } from "./dashboard.types"

export async function buildEmployeeDashboard(
  _actor: AccessTokenPayload
): Promise<DashboardPayload> {
  return {
    role: "EMPLOYEE",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "Your day",
      sub: "Your clock, your balances and what has happened to you lately.",
      cta: { label: "Apply for leave", href: "/employee/leave" },
    },
    stats: [],
    badges: {},
  }
}
