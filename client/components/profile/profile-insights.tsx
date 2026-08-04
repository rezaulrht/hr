"use client"

import { useQuery } from "@tanstack/react-query"

import { getEmployeeInsights } from "@/lib/api/employees"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import { ChartCard } from "@/components/dashboard/chart-card"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Fetched in its own query so a slow aggregation never delays the field cards.
 *
 * Like the rest of the page, this contains no role checks — a group the tier
 * cannot see is a key that is absent from the payload.
 */
export function ProfileInsights({ employeeId }: { employeeId: string }) {
  const { accessToken, status: sessionStatus } = useSession()

  const insightsQuery = useQuery({
    queryKey: ["employee-insights", employeeId],
    queryFn: () => getEmployeeInsights(accessToken!, employeeId),
    enabled: sessionStatus === "authenticated" && !!accessToken,
    // A 403 means this tier does not get charts. Retrying it three times is
    // three guaranteed failures and a slower page.
    retry: (failureCount, error) =>
      !(error instanceof ApiError && error.status === 403) && failureCount < 2,
  })

  if (insightsQuery.isPending) {
    return (
      <div className="flex flex-wrap gap-4">
        <Skeleton className="h-62 min-w-75 flex-1" />
        <Skeleton className="h-62 min-w-75 flex-1" />
        <Skeleton className="h-62 min-w-75 flex-1" />
      </div>
    )
  }

  // Not an error state: a tier without charts simply has none.
  if (insightsQuery.isError || !insightsQuery.data) return null

  const { personal, money, team } = insightsQuery.data
  const window = "Last 6 months"

  return (
    <div className="flex flex-wrap gap-4">
      {personal ? (
        <>
          <ChartCard title="Attendance rate" sub={window} bars={personal.attendanceRate} />
          <ChartCard title="Late arrivals" sub={window} bars={personal.lateArrivals} />
          <ChartCard title="Leave days taken" sub={window} bars={personal.leaveDaysTaken} />
        </>
      ) : null}
      {money ? (
        <>
          <ChartCard title="Net pay" sub={window} bars={money.netPay} />
          <ChartCard title="Expense claims" sub={window} bars={money.expenseClaims} />
        </>
      ) : null}
      {team ? (
        <>
          <ChartCard title="Team size" sub={window} bars={team.teamSize} />
          <ChartCard title="Leave decisions" sub={window} bars={team.leaveDecisions} />
        </>
      ) : null}
    </div>
  )
}
