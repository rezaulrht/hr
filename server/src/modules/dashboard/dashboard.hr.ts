import type { AccessTokenPayload } from "../auth/auth.types"
import { timeOfDayGreeting } from "./dashboard.greeting"
import type { DashboardPayload } from "./dashboard.types"

export async function buildHrDashboard(_actor: AccessTokenPayload): Promise<DashboardPayload> {
  return {
    role: "HR_ADMIN",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "People operations",
      sub: "Requests waiting on you, and how the headcount is moving.",
      cta: { label: "Review leave requests", href: "/hr/leave" },
    },
    stats: [],
    badges: {},
  }
}
