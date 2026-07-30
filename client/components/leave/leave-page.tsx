"use client"

import { useMemo, useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  approveLeaveRequest,
  cancelLeaveRequest,
  getMyLeaveBalances,
  getTeamStatus,
  listLeaveRequests,
  listLeaveTypes,
  rejectLeaveRequest,
  revertLeaveRequest,
} from "@/lib/api/leave"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { LeaveRequestItem } from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TableCell } from "@/components/dashboard/types"
import { ApplyLeaveDialog } from "@/components/leave/apply-leave-dialog"
import { DecisionDialog } from "@/components/leave/decision-dialog"
import {
  coversToday,
  decidedByLabel,
  formatRange,
  isFutureDated,
  STATUS_LABEL,
  STATUS_TONE,
  TEAM_STATUS_LABEL,
  TEAM_STATUS_TONE,
} from "@/components/leave/leave-shared"

/** Roles that hold leave of their own — the only ones with an Employee profile. */
const STAFF_ROLES = ["EMPLOYEE", "REPORTING_MANAGER"]

/** Roles that see every request. Only the first two may act on one. */
const DECIDER_ROLES = ["HR_ADMIN", "SUPER_ADMIN"]
const REVIEWER_ROLES = [...DECIDER_ROLES, "FINANCE_OFFICER"]

type DecisionKind = "reject" | "revert"

function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-md border border-[#E4E9EF] bg-white p-5.5">
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
    </div>
  )
}

function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
      Failed to load {label}.{" "}
      <button className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

export function LeavePage() {
  const { accessToken, user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const [applyOpen, setApplyOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  const isAuthed = sessionStatus === "authenticated" && !!accessToken
  const isStaff = !!user && STAFF_ROLES.includes(user.role)
  const isReviewer = !!user && REVIEWER_ROLES.includes(user.role)
  const canDecide = !!user && DECIDER_ROLES.includes(user.role)

  const [decision, setDecision] = useState<{ kind: DecisionKind; id: string } | null>(null)
  const [decisionError, setDecisionError] = useState<string | null>(null)

  const requestsQuery = useQuery({
    queryKey: ["leave-requests"],
    queryFn: () => listLeaveRequests(accessToken!),
    enabled: isAuthed,
  })

  const typesQuery = useQuery({
    queryKey: ["leave-types"],
    queryFn: () => listLeaveTypes(accessToken!),
    enabled: isAuthed && isStaff,
  })

  const balancesQuery = useQuery({
    queryKey: ["leave-balances", "me"],
    queryFn: () => getMyLeaveBalances(accessToken!),
    enabled: isAuthed && isStaff,
  })

  const isManager = user?.role === "REPORTING_MANAGER"

  const teamStatusQuery = useQuery({
    queryKey: ["leave-team-status"],
    queryFn: () => getTeamStatus(accessToken!),
    enabled: isAuthed && isManager,
  })

  function invalidateMine() {
    queryClient.invalidateQueries({ queryKey: ["leave-requests"] })
    queryClient.invalidateQueries({ queryKey: ["leave-balances", "me"] })
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => cancelLeaveRequest(accessToken!, id),
    onSuccess: () => {
      setActionError(null)
      invalidateMine()
    },
    onError: (err) => {
      setActionError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  function invalidateReviewed() {
    queryClient.invalidateQueries({ queryKey: ["leave-requests"] })
    queryClient.invalidateQueries({ queryKey: ["leave-team-status"] })
  }

  /**
   * Surface the server's own message. The approval-time re-checks return 409s
   * HR will hit legitimately ("balance is no longer sufficient"), and a generic
   * fallback would hide why the decision was refused.
   */
  function decisionErrorMessage(err: unknown): string {
    return err instanceof ApiError ? err.message : "Something went wrong. Please try again."
  }

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveLeaveRequest(accessToken!, id),
    onSuccess: () => {
      setActionError(null)
      invalidateReviewed()
    },
    onError: (err) => setActionError(decisionErrorMessage(err)),
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectLeaveRequest(accessToken!, id, note),
    onSuccess: () => {
      setDecision(null)
      setDecisionError(null)
      invalidateReviewed()
    },
    onError: (err) => setDecisionError(decisionErrorMessage(err)),
  })

  const revertMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      revertLeaveRequest(accessToken!, id, note),
    onSuccess: () => {
      setDecision(null)
      setDecisionError(null)
      invalidateReviewed()
    },
    onError: (err) => setDecisionError(decisionErrorMessage(err)),
  })

  const requests = useMemo(() => requestsQuery.data ?? [], [requestsQuery.data])
  const balances = useMemo(() => balancesQuery.data ?? [], [balancesQuery.data])

  // Every request the endpoint returned for a staff member that is their own.
  // For an employee that is all of them; for a manager it separates their own
  // leave from their reports'.
  const ownEmployeeCode = user?.employeeCode
  const ownEmployeeId = useMemo(() => {
    if (!isStaff || !ownEmployeeCode) return null
    return requests.find((r) => r.employee.employeeCode === ownEmployeeCode)?.employee.id ?? null
  }, [isStaff, ownEmployeeCode, requests])

  const myRequests = useMemo(() => {
    if (!isStaff) return []
    if (!ownEmployeeId) return requests
    return requests.filter((r) => r.employee.id === ownEmployeeId)
  }, [isStaff, ownEmployeeId, requests])

  // The endpoint already scopes a manager to themselves plus their reports, so
  // with no own-request to identify, showing every returned row is still safe.
  const teamRequests = useMemo(() => {
    if (!isManager) return []
    if (!ownEmployeeId) return requests
    return requests.filter((r) => r.employee.id !== ownEmployeeId)
  }, [isManager, ownEmployeeId, requests])

  const stats = useMemo(() => {
    const pending = myRequests.filter((r) => r.status === "PENDING").length
    const takenYtd = myRequests
      .filter((r) => r.status === "APPROVED")
      .reduce((total, r) => total + r.days, 0)

    const balanceTiles = balances.map((b) => {
      // Earned leave has no quota to quote — it is bought with days actually
      // worked, so the tile shows the working rather than a bare number the
      // employee has no way to check.
      if (b.accrual) {
        if (!b.accrual.eligible) {
          return {
            label: b.name,
            value: "—",
            sub: `Accrues after ${b.accrual.minServiceMonths} months of service`,
          }
        }
        const worked = `from ${b.accrual.daysWorked} days worked since ${b.accrual.windowStart}`
        return {
          label: b.name,
          value: `${b.balance}`,
          sub:
            b.accrual.untrackedDays > 0
              ? `of ${b.entitlement}, ${worked} (${b.accrual.untrackedDays} days predate attendance)`
              : `of ${b.entitlement}, ${worked}`,
        }
      }

      return {
        label: b.name,
        value: b.annualQuota === 0 ? "—" : `${b.balance}`,
        sub:
          b.annualQuota === 0
            ? "Unpaid — no annual quota"
            : b.entitlement < b.annualQuota
              ? `of ${b.entitlement} (pro-rated from your joining date)`
              : `of ${b.entitlement} days`,
      }
    })

    return [
      ...balanceTiles,
      { label: "Pending", value: String(pending), sub: "Awaiting a decision" },
      { label: "Days taken", value: String(takenYtd), sub: "Approved so far this year" },
    ]
  }, [myRequests, balances])

  function canCancel(r: LeaveRequestItem): boolean {
    return r.status === "PENDING" || (r.status === "APPROVED" && isFutureDated(r.startDate))
  }

  const reviewerStats = useMemo(() => {
    if (!isReviewer) return []
    const now = new Date()
    const pending = requests.filter((r) => r.status === "PENDING").length
    const approvedThisMonth = requests.filter((r) => {
      if (r.status !== "APPROVED" || !r.decidedAt) return false
      const decided = new Date(r.decidedAt)
      return decided.getFullYear() === now.getFullYear() && decided.getMonth() === now.getMonth()
    }).length
    const onLeaveToday = requests.filter(
      (r) => r.status === "APPROVED" && coversToday(r.startDate, r.endDate)
    ).length

    return [
      { label: "Pending", value: String(pending), sub: "Awaiting a decision" },
      { label: "Approved this month", value: String(approvedThisMonth), sub: "Decided this month" },
      { label: "On leave today", value: String(onLeaveToday), sub: "Approved leave covering today" },
    ]
  }, [isReviewer, requests])

  const reviewerRows: TableCell[][] = (isReviewer ? requests : []).map((r) => [
    { text: r.employee.fullName, sub: r.employee.employeeCode, weight: 600 },
    { text: r.leaveType.name, sub: r.leaveType.isPaid ? "Paid" : "Unpaid" },
    { text: formatRange(r.startDate, r.endDate) },
    { text: String(r.days) },
    {
      tag: STATUS_LABEL[r.status],
      tone: STATUS_TONE[r.status],
      ...(r.status === "REJECTED" && r.decisionNote ? { sub: r.decisionNote } : {}),
    },
    { text: decidedByLabel(r.decidedBy) },
    ...(canDecide
      ? [
          {
            node:
              r.status === "PENDING" ? (
                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    className="h-auto bg-[#17191C] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#0E1012]"
                    disabled={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(r.id)}
                  >
                    Approve
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto px-2.5 py-1 text-[12px] font-semibold"
                    onClick={() => {
                      setDecisionError(null)
                      setDecision({ kind: "reject", id: r.id })
                    }}
                  >
                    Reject
                  </Button>
                </div>
              ) : r.status === "APPROVED" && isFutureDated(r.startDate) ? (
                <Button
                  type="button"
                  variant="outline"
                  className="h-auto px-2.5 py-1 text-[12px] font-semibold"
                  onClick={() => {
                    setDecisionError(null)
                    setDecision({ kind: "revert", id: r.id })
                  }}
                >
                  Revert
                </Button>
              ) : (
                <span className="text-[13px] text-[#A5AFBE]">—</span>
              ),
          } satisfies TableCell,
        ]
      : []),
  ])

  const teamStatusRows: TableCell[][] = (teamStatusQuery.data ?? []).map((m) => [
    { text: m.fullName, sub: m.employeeCode, weight: 600 },
    { text: m.designation },
    { tag: TEAM_STATUS_LABEL[m.status], tone: TEAM_STATUS_TONE[m.status] },
    {
      text: m.currentLeave ? m.currentLeave.leaveTypeName : "—",
      ...(m.currentLeave
        ? { sub: formatRange(m.currentLeave.startDate, m.currentLeave.endDate) }
        : {}),
    },
  ])

  const teamRequestRows: TableCell[][] = teamRequests.map((r) => [
    { text: r.employee.fullName, sub: r.employee.employeeCode, weight: 600 },
    { text: r.leaveType.name },
    { text: formatRange(r.startDate, r.endDate) },
    { text: String(r.days) },
    { tag: STATUS_LABEL[r.status], tone: STATUS_TONE[r.status] },
  ])

  const myRows: TableCell[][] = myRequests.map((r) => [
    { text: r.leaveType.name, sub: r.leaveType.isPaid ? "Paid" : "Unpaid", weight: 600 },
    { text: formatRange(r.startDate, r.endDate) },
    { text: String(r.days) },
    {
      tag: STATUS_LABEL[r.status],
      tone: STATUS_TONE[r.status],
      ...(r.status === "REJECTED" && r.decisionNote ? { sub: r.decisionNote } : {}),
    },
    { text: decidedByLabel(r.decidedBy) },
    {
      node: canCancel(r) ? (
        <Button
          type="button"
          variant="outline"
          className="h-auto px-2.5 py-1 text-[12px] font-semibold"
          disabled={cancelMutation.isPending}
          onClick={() => cancelMutation.mutate(r.id)}
        >
          Cancel
        </Button>
      ) : (
        <span className="text-[13px] text-[#A5AFBE]">—</span>
      ),
    },
  ])

  if (sessionStatus === "loading") {
    return (
      <div className="pt-7">
        <TableSkeleton />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
            Time off
          </div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Leave</h1>
          <div className="text-[13px] text-[#7A8698]">
            {isStaff
              ? "Your balances, requests, and time off history"
              : "Leave requests across the organisation"}
          </div>
        </div>
        {isStaff ? (
          <Button
            className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
            onClick={() => setApplyOpen(true)}
          >
            Request leave
          </Button>
        ) : null}
      </div>

      {actionError ? (
        <div className="mb-4 rounded-md border border-[#E4E9EF] bg-white p-4 text-[13px] font-semibold text-[#B03A3A]">
          {actionError}
        </div>
      ) : null}

      {isReviewer ? (
        <>
          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
            {reviewerStats.map((stat) => (
              <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
            ))}
          </div>
          {requestsQuery.isPending ? (
            <TableSkeleton />
          ) : requestsQuery.isError ? (
            <LoadError label="leave requests" onRetry={() => requestsQuery.refetch()} />
          ) : (
            <DataTable
              title="All leave requests"
              action=""
              cols={
                canDecide
                  ? "1.3fr 0.9fr 1fr 0.4fr 1fr 0.8fr 1.1fr"
                  : "1.3fr 0.9fr 1fr 0.4fr 1fr 0.8fr"
              }
              headers={[
                "Employee",
                "Type",
                "Dates",
                "Days",
                "Status",
                "Approver",
                ...(canDecide ? [""] : []),
              ]}
              rows={reviewerRows}
            />
          )}
        </>
      ) : null}

      {isManager ? (
        <div className="mb-5 space-y-5">
          {teamStatusQuery.isPending ? (
            <TableSkeleton />
          ) : teamStatusQuery.isError ? (
            <LoadError label="your team" onRetry={() => teamStatusQuery.refetch()} />
          ) : (
            <DataTable
              title="My team"
              action=""
              cols="1.4fr 1fr 0.9fr 1.2fr"
              headers={["Employee", "Designation", "Status", "Currently on"]}
              rows={teamStatusRows}
            />
          )}
          {requestsQuery.isPending ? null : (
            <DataTable
              title="Team requests"
              action=""
              cols="1.4fr 1fr 1fr 0.5fr 0.9fr"
              headers={["Employee", "Type", "Dates", "Days", "Status"]}
              rows={teamRequestRows}
            />
          )}
        </div>
      ) : null}

      {isStaff ? (
        <>
          <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
            {balancesQuery.isPending
              ? null
              : stats.map((stat) => (
                  <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
                ))}
          </div>

          {requestsQuery.isPending ? (
            <TableSkeleton />
          ) : requestsQuery.isError ? (
            <LoadError label="leave requests" onRetry={() => requestsQuery.refetch()} />
          ) : (
            <DataTable
              title="My requests"
              action=""
              cols="1fr 1fr 0.5fr 1fr 0.9fr 0.7fr"
              headers={["Type", "Dates", "Days", "Status", "Approver", ""]}
              rows={myRows}
            />
          )}
        </>
      ) : null}

      {canDecide ? (
        <DecisionDialog
          key={decision ? `${decision.kind}-${decision.id}` : "none"}
          open={!!decision}
          onOpenChange={(next) => !next && setDecision(null)}
          title={decision?.kind === "revert" ? "Revert this approval" : "Reject this request"}
          confirmLabel={decision?.kind === "revert" ? "Revert approval" : "Reject request"}
          pending={rejectMutation.isPending || revertMutation.isPending}
          error={decisionError}
          onConfirm={(note) => {
            if (!decision) return
            if (decision.kind === "revert") {
              revertMutation.mutate({ id: decision.id, note })
            } else {
              rejectMutation.mutate({ id: decision.id, note })
            }
          }}
        />
      ) : null}

      {isStaff && accessToken ? (
        <ApplyLeaveDialog
          open={applyOpen}
          onOpenChange={setApplyOpen}
          leaveTypes={typesQuery.data ?? []}
          balances={balances}
          accessToken={accessToken}
          onApplied={invalidateMine}
        />
      ) : null}
    </>
  )
}
