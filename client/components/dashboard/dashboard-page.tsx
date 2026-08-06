"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { checkIn as checkInApi, checkOut as checkOutApi } from "@/lib/api/attendance"
import { ApiError } from "@/lib/api/client"
import { getDashboard } from "@/lib/api/dashboard"
import { useSession } from "@/lib/auth/session-context"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityFeed } from "@/components/dashboard/activity-feed"
import { ChartCard } from "@/components/dashboard/chart-card"
import { DataTable } from "@/components/dashboard/data-table"
import { HeroBanner } from "@/components/dashboard/hero-banner"
import { StatsGrid } from "@/components/dashboard/stat-card"
import { TimeClockCard } from "@/components/dashboard/time-clock-card"
import type { Stat } from "@/components/dashboard/types"
import type { DashboardStat, Role } from "@/lib/api/types"

/**
 * Role → route group, the 1:1 mapping the app router already uses.
 *
 * Spelled out rather than derived from the role string: `SUPER_ADMIN` maps to
 * `/admin` and `FINANCE_OFFICER` to `/finance`, so any transformation clever
 * enough to cover both would be one nobody could read.
 */
const ROUTE_GROUP: Record<Role, string> = {
  SUPER_ADMIN: "/admin",
  HR_ADMIN: "/hr",
  FINANCE_OFFICER: "/finance",
  REPORTING_MANAGER: "/manager",
  EMPLOYEE: "/employee",
}

/** The server's `trend` is the client's `bars`; the rest passes straight through. */
const toStat = (s: DashboardStat): Stat => ({
  label: s.label,
  value: s.value,
  sub: s.sub,
  tag: s.tag,
  tone: s.tone,
  bars: s.trend,
  hotBar: s.hotBar,
  href: s.href,
  failed: s.failed,
})

/** Matches the real grid's dimensions, so the page does not jump on load. */
function DashboardSkeleton() {
  return (
    <>
      <Skeleton className="h-45 rounded-b-md" />
      <div className="relative z-10 -mt-13 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-31 rounded-md" />
        ))}
      </div>
      <div className="mt-6 flex flex-wrap items-stretch gap-4">
        <Skeleton className="h-63 max-w-100 min-w-0 flex-1 rounded-md sm:min-w-70" />
        <Skeleton className="h-63 min-w-0 flex-[10_1_460px] rounded-md" />
      </div>
    </>
  )
}

/**
 * One component for all five landing pages.
 *
 * Sections render on **presence, not role**: `feed` and `timeClock` are
 * optional on the payload, so whichever roles get them are covered without a
 * role branch here — including whichever role gets one next.
 */
export function DashboardPage() {
  const { accessToken, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()
  const [punchError, setPunchError] = useState<string | null>(null)

  const isAuthed = sessionStatus === "authenticated" && !!accessToken

  const dashboardQuery = useQuery({
    queryKey: ["dashboard"],
    queryFn: () => getDashboard(accessToken!),
    enabled: isAuthed,
    refetchOnWindowFocus: true,
  })

  const punchMutation = useMutation({
    mutationFn: (kind: "in" | "out") =>
      kind === "in" ? checkInApi(accessToken!) : checkOutApi(accessToken!),
    onSuccess: () => {
      setPunchError(null)
      // The clock changes the attendance cards too, so both prefixes go.
      queryClient.invalidateQueries({ queryKey: ["dashboard"] })
      queryClient.invalidateQueries({ queryKey: ["attendance"] })
    },
    onError: (err) => {
      // Already checked in is the outcome the user wanted; refetch rather
      // than showing an error for a button that did its job.
      if (err instanceof ApiError && err.message.includes("already checked in")) {
        setPunchError(null)
        queryClient.invalidateQueries({ queryKey: ["dashboard"] })
        return
      }
      setPunchError(
        err instanceof ApiError
          ? err.message
          : "That did not go through — you are NOT checked in. Please try again."
      )
    },
  })

  if (sessionStatus === "loading" || dashboardQuery.isPending) {
    return <DashboardSkeleton />
  }

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <div className="mt-10 rounded-md border border-[#E4E9EF] bg-white p-8 text-center">
        <div className="text-[15px] font-bold">Your dashboard could not be loaded</div>
        <div className="mt-1 text-[13px] text-[#7A8698]">
          {dashboardQuery.error instanceof ApiError
            ? dashboardQuery.error.message
            : "Something went wrong on the way to the server."}
        </div>
        <Button
          className="mt-4 rounded-md bg-[#17191C] px-4 py-2 text-[13px] font-bold text-white"
          onClick={() => dashboardQuery.refetch()}
        >
          Try again
        </Button>
      </div>
    )
  }

  const payload = dashboardQuery.data
  const root = ROUTE_GROUP[payload.role]

  return (
    <>
      <HeroBanner
        kicker={payload.greeting.kicker}
        heading={payload.greeting.heading}
        sub={payload.greeting.sub}
        cta={payload.greeting.cta.label}
        ctaHref={payload.greeting.cta.href}
      />

      <StatsGrid stats={payload.stats.map(toStat)} />

      <div className="mt-6 flex flex-wrap items-stretch gap-4">
        {payload.timeClock ? (
          <TimeClockCard
            state={payload.timeClock}
            pending={punchMutation.isPending}
            error={punchError}
            onCheckIn={() => punchMutation.mutate("in")}
            onCheckOut={() => punchMutation.mutate("out")}
          />
        ) : null}

        {payload.chart ? (
          <ChartCard
            title={payload.chart.title}
            sub={payload.chart.sub}
            bars={payload.chart.bars}
          />
        ) : null}

        {payload.feed ? (
          <ActivityFeed items={payload.feed} viewAllHref={`${root}/reports`} />
        ) : null}

        {payload.table ? (
          <div className="min-w-0 flex-[10_1_460px]">
            <DataTable
              title={payload.table.title}
              cols={`repeat(${payload.table.headers.length}, minmax(0, 1fr))`}
              headers={payload.table.headers}
              rows={payload.table.rows}
              action="View all"
            />
          </div>
        ) : null}
      </div>
    </>
  )
}
