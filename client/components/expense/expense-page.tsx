"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import {
  approveExpenseClaim,
  createExpenseClaim,
  getMyExpenseClaims,
  listExpenseClaims,
  rejectExpenseClaim,
} from "@/lib/api/expenses"
import { useSession } from "@/lib/auth/session-context"
import type { ExpenseClaim, ExpenseClaimInput } from "@/lib/api/types"
import { formatMoney } from "@/lib/money"
import { DataTable } from "@/components/dashboard/data-table"
import { PageHeader } from "@/components/dashboard/page-header"
import type { TableCell } from "@/components/dashboard/types"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { DecisionDialog } from "@/components/leave/decision-dialog"
import { ExpenseDialog } from "@/components/expense/expense-dialog"
import {
  EXPENSE_STATUS_LABEL,
  EXPENSE_STATUS_TONE,
  FINANCE_ROLES,
  PAYROLL_ADMIN_ROLES,
  STAFF_ROLES,
} from "@/components/payroll/payroll-shared"

function claimRow(claim: ExpenseClaim, extra: TableCell[]): TableCell[] {
  return [
    { text: claim.category, sub: claim.description ?? undefined, weight: 600 },
    { text: claim.expenseDate },
    { text: formatMoney(claim.amount, claim.currency) },
    { tag: EXPENSE_STATUS_LABEL[claim.status], tone: EXPENSE_STATUS_TONE[claim.status] },
    ...extra,
  ]
}

export function ExpensePage() {
  const { accessToken, user, status } = useSession()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const isAuthed = status === "authenticated" && !!accessToken
  const isStaff = !!user && STAFF_ROLES.includes(user.role)
  const isReviewer = !!user && FINANCE_ROLES.includes(user.role)
  const isAdmin = !!user && PAYROLL_ADMIN_ROLES.includes(user.role)

  const mineQuery = useQuery({
    queryKey: ["expenses", "me"],
    queryFn: () => getMyExpenseClaims(accessToken!),
    enabled: isAuthed && isStaff,
  })

  const allQuery = useQuery({
    queryKey: ["expenses", "all"],
    queryFn: () => listExpenseClaims(accessToken!),
    enabled: isAuthed && isAdmin,
  })

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["expenses"] })
  }

  function handleError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
  }

  const createMutation = useMutation({
    mutationFn: (input: ExpenseClaimInput) => createExpenseClaim(accessToken!, input),
    onSuccess: () => {
      setError(null)
      setOpen(false)
      invalidate()
    },
    onError: handleError,
  })

  const approveMutation = useMutation({
    mutationFn: (id: string) => approveExpenseClaim(accessToken!, id),
    onSuccess: () => {
      setError(null)
      invalidate()
    },
    // A missing rate for the spend date 409s here; the server's message says
    // which currency and date, which a generic fallback would hide.
    onError: handleError,
  })

  const rejectMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      rejectExpenseClaim(accessToken!, id, note),
    onSuccess: () => {
      setError(null)
      setRejecting(null)
      invalidate()
    },
    onError: handleError,
  })

  if (!isAuthed) return <Skeleton className="h-64 w-full" />

  const mine = mineQuery.data ?? []
  const all = allQuery.data ?? []

  const mineRows: TableCell[][] = mine.map((claim) =>
    claimRow(claim, [
      {
        // Which payslip paid it — that link is what makes REIMBURSED
        // checkable rather than a label somebody set.
        text: claim.payslip?.payslipNo ?? (claim.settlementId ? "On settlement" : "—"),
        sub: claim.reviewNote ?? undefined,
      },
    ])
  )

  const reviewRows: TableCell[][] = all.map((claim) =>
    claimRow(claim, [
      { text: claim.employee?.fullName ?? "—", sub: claim.employee?.employeeCode },
      isReviewer && claim.status === "PENDING"
        ? {
            node: (
              <div className="flex gap-2">
                <button
                  className="text-[12.5px] font-semibold underline disabled:opacity-50"
                  disabled={approveMutation.isPending}
                  onClick={() => approveMutation.mutate(claim.id)}
                >
                  Approve
                </button>
                <button
                  className="text-[12.5px] font-semibold underline"
                  onClick={() => setRejecting(claim.id)}
                >
                  Reject
                </button>
              </div>
            ),
          }
        : { text: claim.payslip?.payslipNo ?? "—" },
    ])
  )

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Expenses"
        sub="Claims, approvals and reimbursements"
        cta=""
      />

      {error ? (
        <div className="mb-4 rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-5 py-3.5 text-[12.5px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      <div className="space-y-6">
        {isStaff ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="text-[15px] font-bold">My claims</div>
              <Button onClick={() => setOpen(true)}>Claim an expense</Button>
            </div>

            {mineQuery.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : mine.length === 0 ? (
              <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
                You have no expense claims yet.
              </div>
            ) : (
              <DataTable
                title="My claims"
                cols="1.2fr 0.9fr 0.9fr 0.8fr 1fr"
                headers={["Category", "Spent on", "Amount", "Status", "Paid by"]}
                rows={mineRows}
                action={`${mine.length} claim${mine.length === 1 ? "" : "s"}`}
              />
            )}
          </div>
        ) : null}

        {isAdmin ? (
          <div className="space-y-4">
            <div className="text-[15px] font-bold">All claims</div>
            {allQuery.isPending ? (
              <Skeleton className="h-40 w-full" />
            ) : all.length === 0 ? (
              <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
                No expense claims have been submitted.
              </div>
            ) : (
              <DataTable
                title="Review queue"
                cols="1.2fr 0.9fr 0.9fr 0.8fr 1.1fr 1fr"
                headers={["Category", "Spent on", "Amount", "Status", "Employee", ""]}
                rows={reviewRows}
                action={`${all.length} claim${all.length === 1 ? "" : "s"}`}
              />
            )}
          </div>
        ) : null}
      </div>

      {open ? (
        <ExpenseDialog
          key="expense-new"
          open={open}
          onOpenChange={setOpen}
          pending={createMutation.isPending}
          error={error}
          onSubmit={(input) => createMutation.mutate(input)}
        />
      ) : null}

      {rejecting ? (
        <DecisionDialog
          key={`reject-${rejecting}`}
          open={!!rejecting}
          onOpenChange={(next) => !next && setRejecting(null)}
          title="Reject this claim"
          confirmLabel="Reject"
          pending={rejectMutation.isPending}
          error={error}
          onConfirm={(note) => rejectMutation.mutate({ id: rejecting, note })}
        />
      ) : null}
    </>
  )
}
