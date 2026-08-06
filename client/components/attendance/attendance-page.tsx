"use client"

import { useCallback, useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { RiArrowLeftSLine, RiArrowRightSLine } from "@remixicon/react"

import {
  checkIn as checkInApi,
  checkOut as checkOutApi,
  getMonthlySummary,
  getMyAttendance,
  getToday,
  listHolidays,
  regulariseAttendance,
} from "@/lib/api/attendance"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { AttendanceDay } from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TableCell } from "@/components/dashboard/types"
import { AttendanceCalendar } from "@/components/attendance/attendance-calendar"
import { PunchCard } from "@/components/attendance/punch-card"
import { TimeAmendmentDialog } from "@/components/attendance/time-amendment-dialog"
import { ApprovalsSection } from "@/components/attendance/approvals-section"
import { LoadError, TableSkeleton } from "@/components/attendance/attendance-ui"
import { OrgSections } from "@/components/attendance/org-sections"
import {
  APPROVAL_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  currentMonth,
  formatClock,
  formatDayLabel,
  formatHours,
  formatMonthLabel,
} from "@/components/attendance/attendance-shared"

/** Roles with an Employee profile — the only ones who punch. */
const STAFF_ROLES = ["EMPLOYEE", "REPORTING_MANAGER"]
const APPROVER_ROLES = ["REPORTING_MANAGER", "HR_ADMIN", "SUPER_ADMIN"]
const ORG_ROLES = ["HR_ADMIN", "SUPER_ADMIN", "FINANCE_OFFICER"]
const HR_ROLES = ["HR_ADMIN", "SUPER_ADMIN"]

/** Days an employee may still fix themselves, mirroring MAX_REGULARISE_DAYS. */
const REGULARISE_WINDOW_DAYS = 14

export function AttendancePage() {
  const { accessToken, user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = sessionStatus === "authenticated" && !!accessToken
  const role = user?.role
  const isStaff = !!role && STAFF_ROLES.includes(role)
  const isApprover = !!role && APPROVER_ROLES.includes(role)
  const isOrg = !!role && ORG_ROLES.includes(role)
  const isHr = !!role && HR_ROLES.includes(role)

  const [{ month, year }, setPeriod] = useState(currentMonth)
  const [view, setView] = useState<"list" | "calendar">("list")
  const [punchError, setPunchError] = useState<string | null>(null)
  const [amending, setAmending] = useState<AttendanceDay | null>(null)
  const [amendError, setAmendError] = useState<string | null>(null)

  const todayQuery = useQuery({
    queryKey: ["attendance", "today"],
    queryFn: () => getToday(accessToken!),
    enabled: isAuthed && isStaff,
    refetchOnWindowFocus: true,
  })

  const from = `${year}-${String(month).padStart(2, "0")}-01`
  const to = `${year}-${String(month).padStart(2, "0")}-${new Date(year, month, 0).getDate()}`

  const daysQuery = useQuery({
    queryKey: ["attendance", "me", year, month],
    queryFn: () => getMyAttendance(accessToken!, from, to),
    enabled: isAuthed && isStaff,
  })

  const summaryQuery = useQuery({
    queryKey: ["attendance", "monthly", year, month],
    queryFn: () => getMonthlySummary(accessToken!, month, year),
    enabled: isAuthed,
  })

  const holidaysQuery = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => listHolidays(accessToken!, year),
    enabled: isAuthed,
  })

  const invalidateAll = useCallback(() => {
    // A holiday or a decision changes every derived day, so the whole
    // prefix goes rather than one key.
    queryClient.invalidateQueries({ queryKey: ["attendance"] })
  }, [queryClient])

  const punchMutation = useMutation({
    mutationFn: (kind: "in" | "out") =>
      kind === "in" ? checkInApi(accessToken!) : checkOutApi(accessToken!),
    onSuccess: () => {
      setPunchError(null)
      invalidateAll()
    },
    onError: (err) => {
      // A duplicate check-in means you are already checked in, which is the
      // outcome the user wanted — treat it as success and refetch rather
      // than showing an error for a button that did its job.
      if (err instanceof ApiError && err.message.includes("already checked in")) {
        setPunchError(null)
        invalidateAll()
        return
      }
      setPunchError(
        err instanceof ApiError
          ? err.message
          : "Check-in failed — you are NOT checked in. Please try again."
      )
    },
  })

  const regulariseMutation = useMutation({
    mutationFn: (vars: { id: string; body: { checkIn?: string; checkOut?: string; note: string } }) =>
      regulariseAttendance(accessToken!, vars.id, vars.body),
    onSuccess: () => {
      setAmending(null)
      setAmendError(null)
      invalidateAll()
    },
    onError: (err) => {
      setAmendError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  const days = useMemo(() => daysQuery.data ?? [], [daysQuery.data])
  const ownSummary = summaryQuery.data?.[0]

  const shiftMonth = (delta: number) => {
    const next = new Date(year, month - 1 + delta, 1)
    setPeriod({ month: next.getMonth() + 1, year: next.getFullYear() })
  }

  /** Only a missing check-out on a tracked day, inside the amendment window. */
  const canAmend = useCallback((day: AttendanceDay) => {
    if (!day.attendanceId || !day.checkIn || day.checkOut) return false
    if (day.approval === "APPROVED") return false
    const age = (Date.now() - new Date(`${day.date}T00:00:00`).getTime()) / 86_400_000
    return age <= REGULARISE_WINDOW_DAYS
  }, [])

  const rows: TableCell[][] = days
    .filter((day) => day.status !== "NOT_TRACKED")
    .map((day) => [
      { text: formatDayLabel(day.date), weight: 600 },
      { text: formatClock(day.checkIn) },
      { text: formatClock(day.checkOut) },
      { text: formatHours(day.workedHours) },
      {
        tag: STATUS_LABEL[day.status],
        tone: STATUS_TONE[day.status],
        sub: day.isLate ? "Late" : day.isEarlyOut ? "Left early" : (day.detail ?? undefined),
      },
      {
        text: day.approval ? APPROVAL_LABEL[day.approval] : "—",
        sub: day.corrected ? "Edited by HR" : day.regularised ? "You amended this" : undefined,
      },
      canAmend(day)
        ? {
            node: (
              <Button
                variant="link" className="h-auto p-0 text-[12px] font-bold text-[#17191C] underline"
                onClick={() => {
                  setAmendError(null)
                  setAmending(day)
                }}
              >
                Fix this day
              </Button>
            ),
          }
        : { text: "" },
    ])

  if (sessionStatus === "loading") {
    return (
      <div className="space-y-3 pt-7">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
            Workspace
          </div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Attendance</h1>
          <div className="text-[13px] text-[#7A8698]">
            Daily check-ins, hours, and exceptions
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="ghost"
            aria-label="Previous month"
            onClick={() => shiftMonth(-1)}
            className="size-8 p-0"
          >
            <RiArrowLeftSLine className="size-4" />
          </Button>
          <span className="min-w-[130px] text-center text-[13px] font-bold">
            {formatMonthLabel(month, year)}
          </span>
          <Button
            variant="ghost"
            aria-label="Next month"
            onClick={() => shiftMonth(1)}
            className="size-8 p-0"
          >
            <RiArrowRightSLine className="size-4" />
          </Button>
        </div>
      </div>

      {isStaff ? (
        <>
          <PunchCard
            today={todayQuery.data}
            isLoading={todayQuery.isPending}
            isPunching={punchMutation.isPending}
            error={punchError}
            onCheckIn={() => punchMutation.mutate("in")}
            onCheckOut={() => punchMutation.mutate("out")}
            onDayRollover={() => todayQuery.refetch()}
          />

          <div className="mt-4 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            <MiniStat
              label="This month"
              value={
                ownSummary && ownSummary.workingDays > 0
                  ? `${Math.round((ownSummary.present / ownSummary.workingDays) * 100)}%`
                  : "—"
              }
              sub={
                ownSummary
                  ? `${ownSummary.present} of ${ownSummary.workingDays} working days`
                  : "No data yet"
              }
            />
            <MiniStat
              label="Late check-ins"
              value={ownSummary ? String(ownSummary.late) : "—"}
              sub={`Grace ${todayQuery.data?.shift.graceMinutes ?? 15} minutes`}
            />
            <MiniStat
              label="Avg hours / day"
              value={
                ownSummary && ownSummary.present > 0
                  ? formatHours(ownSummary.workedHours / ownSummary.present)
                  : "—"
              }
              sub={
                todayQuery.data
                  ? `Expected ${formatHours(todayQuery.data.shift.expectedHours)}`
                  : "—"
              }
            />
            {/* Only rendered when there is something to act on. A silent
                exception is what surprises somebody on payday. */}
            {ownSummary && (ownSummary.missingCheckOut > 0 || ownSummary.pendingApproval > 0) ? (
              <MiniStat
                label="Needs attention"
                value={String(ownSummary.missingCheckOut + ownSummary.pendingApproval)}
                sub={`${ownSummary.missingCheckOut} missing check-out · ${ownSummary.pendingApproval} awaiting review`}
              />
            ) : null}
          </div>

          <div className="flex items-center justify-between pt-7 pb-3.5">
            <h2 className="font-heading text-[16px] font-bold tracking-tight">
              Attendance log — {formatMonthLabel(month, year)}
            </h2>
            <div className="flex rounded-md border border-[#E4E9EF] bg-white p-0.5">
              {(["list", "calendar"] as const).map((mode) => (
                <Button
                  key={mode}
                  onClick={() => setView(mode)}
                  className={
                    view === mode
                      ? "rounded bg-[#17191C] px-3 py-1 text-[12px] font-bold text-white capitalize"
                      : "rounded px-3 py-1 text-[12px] font-semibold text-[#7A8698] capitalize"
                  }
                >
                  {mode}
                </Button>
              ))}
            </div>
          </div>

          {daysQuery.isPending ? (
            <TableSkeleton />
          ) : daysQuery.isError ? (
            <LoadError label="your attendance" onRetry={() => daysQuery.refetch()} />
          ) : view === "list" ? (
            <DataTable
              title=""
              cols="1.1fr 0.8fr 0.8fr 0.7fr 1fr 1.1fr 0.7fr"
              headers={["Date", "Check in", "Check out", "Hours", "Status", "Approval", ""]}
              rows={rows}
            />
          ) : (
            <AttendanceCalendar
              days={days}
              holidays={holidaysQuery.data ?? []}
              month={month}
              year={year}
            />
          )}
        </>
      ) : null}

      {isApprover ? <ApprovalsSection accessToken={accessToken!} isHr={isHr} /> : null}

      {isOrg ? (
        <OrgSections
          accessToken={accessToken!}
          role={role!}
          month={month}
          year={year}
          holidays={holidaysQuery.data ?? []}
          summaries={summaryQuery.data ?? []}
          summaryPending={summaryQuery.isPending}
          onChanged={invalidateAll}
        />
      ) : null}

      {amending ? (
        <TimeAmendmentDialog
          key={amending.attendanceId ?? amending.date}
          open
          onOpenChange={(open) => {
            if (!open) setAmending(null)
          }}
          title={`Fix ${formatDayLabel(amending.date)}`}
          description="This goes to your manager for review. It cannot approve itself, because you are supplying a time nobody else recorded."
          confirmLabel="Send to my manager"
          pending={regulariseMutation.isPending}
          error={amendError}
          onConfirm={(body) =>
            regulariseMutation.mutate({ id: amending.attendanceId!, body })
          }
        />
      ) : null}
    </>
  )
}
