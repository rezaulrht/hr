import type { AccessTokenPayload } from "../auth/auth.types"
import { timeOfDayGreeting } from "./dashboard.greeting"
import type { DashboardPayload } from "./dashboard.types"

export async function buildFinanceDashboard(
  _actor: AccessTokenPayload
): Promise<DashboardPayload> {
  return {
    role: "FINANCE_OFFICER",
    greeting: {
      kicker: timeOfDayGreeting(),
      heading: "Payroll and reimbursements",
      sub: "Where this month's run stands, and what is blocking it.",
      cta: { label: "Open payroll", href: "/finance/payroll" },
    },
    stats: [],
    badges: {},
  }
}
