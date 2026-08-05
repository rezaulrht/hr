"use client"

import { useState } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"

import { getCostSummary, listCostCategories, listCostCommitments, listCosts } from "@/lib/api/costs"
import { useSession } from "@/lib/auth/session-context"
import type { CostBill, CostCommitment } from "@/lib/api/types"
import { formatMoney } from "@/lib/money"
import { MiniStat, PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { CommitmentDialog } from "@/components/cost/commitment-dialog"
import { CostDialog, type CostPrefill } from "@/components/cost/cost-dialog"
import {
  canManageCosts,
  canReadCosts,
  currentPeriod,
  formatCostDate,
  inputValueToPeriod,
  monthName,
  periodToInputValue,
  startedOnOrBefore,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/components/cost/cost-shared"
import { ImportWizard } from "@/components/cost/import-wizard"
import { PayDialog } from "@/components/cost/pay-dialog"

type Period = { year: number; month: number }

function shiftPeriod({ year, month }: Period, delta: number): Period {
  const d = new Date(Date.UTC(year, month - 1 + delta, 1))
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 }
}

function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border p-4 text-sm text-destructive">
      Failed to load {label}.{" "}
      <button className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function MonthPicker({ period, onChange }: { period: Period; onChange: (next: Period) => void }) {
  return (
    <div className="flex items-end gap-2">
      <div>
        <Label htmlFor="cost-month" className="mb-1.5 text-xs font-bold">
          Month
        </Label>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(shiftPeriod(period, -1))}
            aria-label="Previous month"
          >
            ‹
          </Button>
          <Input
            id="cost-month"
            type="month"
            className="w-40"
            value={periodToInputValue(period.year, period.month)}
            onChange={(e) => {
              const next = inputValueToPeriod(e.target.value)
              if (next) onChange(next)
            }}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(shiftPeriod(period, 1))}
            aria-label="Next month"
          >
            ›
          </Button>
        </div>
      </div>
    </div>
  )
}

function BillsTable({
  bills,
  canManage,
  onView,
  onPay,
}: {
  bills: CostBill[]
  canManage: boolean
  onView: (id: string) => void
  onPay: (id: string) => void
}) {
  if (bills.length === 0) {
    return <p className="text-sm text-muted-foreground">No bills recorded for this month yet.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Bill</TableHead>
            <TableHead>Payee</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Due</TableHead>
            <TableHead>Status</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {bills.map((bill) => (
            <TableRow key={bill.id}>
              <TableCell>{bill.category.name}</TableCell>
              <TableCell className="font-medium">{bill.label}</TableCell>
              <TableCell>{bill.payee}</TableCell>
              <TableCell>{formatMoney(bill.amount, bill.currency)}</TableCell>
              <TableCell>{formatCostDate(bill.dueDate)}</TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <Badge className={STATUS_TONE[bill.status]}>{STATUS_LABEL[bill.status]}</Badge>
                  {/* Driven entirely by the server's `isOverdue` — never
                      recomputed here, since there is no stored overdue status
                      to recompute from in the first place. */}
                  {bill.isOverdue ? (
                    <span className="text-xs font-semibold text-destructive">Overdue</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => onView(bill.id)}>
                    {canManage ? "Edit" : "View"}
                  </Button>
                  {canManage && bill.status === "PENDING" ? (
                    <Button type="button" size="sm" onClick={() => onPay(bill.id)}>
                      Mark paid
                    </Button>
                  ) : null}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function CommitmentsTable({
  commitments,
  canManage,
  onEdit,
}: {
  commitments: CostCommitment[]
  canManage: boolean
  onEdit: (c: CostCommitment) => void
}) {
  if (commitments.length === 0) {
    return <p className="text-sm text-muted-foreground">No recurring commitments yet.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Payee</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Due day</TableHead>
            <TableHead>Started</TableHead>
            <TableHead>Status</TableHead>
            {canManage ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {commitments.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.category?.name ?? "—"}</TableCell>
              <TableCell className="font-medium">{c.label}</TableCell>
              <TableCell>{c.payee}</TableCell>
              <TableCell>{c.amount ? formatMoney(c.amount, c.currency) : "Varies"}</TableCell>
              <TableCell>{c.dueDay ?? "—"}</TableCell>
              <TableCell>{formatCostDate(c.startedOn)}</TableCell>
              <TableCell>
                {c.endedOn ? (
                  <Badge className="bg-neutral-100 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">
                    Ended {formatCostDate(c.endedOn)}
                  </Badge>
                ) : (
                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200">
                    Active
                  </Badge>
                )}
              </TableCell>
              {canManage ? (
                <TableCell>
                  <Button type="button" size="sm" variant="outline" onClick={() => onEdit(c)}>
                    Edit
                  </Button>
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * One component, three roles (Finance, Super Admin write; HR reads).
 * Managers and employees have no nav entry to this route and no server
 * route to call — this component never runs a query for them.
 *
 * The month is the screen: everything below the picker — the category
 * totals, the bill table, the missing-bill prompts — is scoped to whichever
 * `period` is selected.
 */
export function CostPage() {
  const { accessToken, user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = sessionStatus === "authenticated" && !!accessToken
  const role = user?.role
  const canManage = !!role && canManageCosts(role)
  const readable = !!role && canReadCosts(role)

  const [period, setPeriod] = useState<Period>(currentPeriod())
  const [costDialog, setCostDialog] = useState<{ costId: string | null; prefill?: CostPrefill } | null>(
    null
  )
  const [payTarget, setPayTarget] = useState<string | null>(null)
  const [commitmentTarget, setCommitmentTarget] = useState<CostCommitment | "new" | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ["costs", "categories"],
    queryFn: () => listCostCategories(accessToken!),
    enabled: isAuthed && readable,
  })

  const summaryQuery = useQuery({
    queryKey: ["cost-summary", period.year, period.month],
    queryFn: () => getCostSummary(accessToken!, period.year, period.month),
    enabled: isAuthed && readable,
  })

  const billsQuery = useQuery({
    queryKey: ["costs", "bills", period.year, period.month],
    queryFn: () => listCosts(accessToken!, { year: period.year, month: period.month }),
    enabled: isAuthed && readable,
  })

  // Unfiltered: this list feeds both the "missing bill" prompts (active
  // commitments only) and the Commitments tab (which shows ended ones too).
  const commitmentsQuery = useQuery({
    queryKey: ["costs", "commitments"],
    queryFn: () => listCostCommitments(accessToken!),
    enabled: isAuthed && readable,
  })

  function invalidateAll() {
    queryClient.invalidateQueries({ queryKey: ["costs"] })
    queryClient.invalidateQueries({ queryKey: ["cost-summary", period.year, period.month] })
  }

  const categories = categoriesQuery.data ?? []
  const bills = billsQuery.data ?? []
  const commitments = commitmentsQuery.data ?? []

  // An active commitment with no bill recorded for this exact period. This is
  // the only reason CostCommitment exists — without it the table cannot tell
  // "nothing owed this month" from "nobody entered it".
  const billedCommitmentIds = new Set(bills.filter((b) => b.commitmentId).map((b) => b.commitmentId))
  const missingCommitments = commitments.filter(
    (c) =>
      c.endedOn === null &&
      startedOnOrBefore(c.startedOn, period.year, period.month) &&
      !billedCommitmentIds.has(c.id)
  )

  function openCreate() {
    setCostDialog({ costId: null })
  }

  function openCreateFromCommitment(commitment: CostCommitment) {
    const dueDate =
      commitment.dueDay != null
        ? `${period.year}-${String(period.month).padStart(2, "0")}-${String(commitment.dueDay).padStart(2, "0")}`
        : undefined
    setCostDialog({
      costId: null,
      prefill: {
        categoryId: commitment.categoryId,
        label: commitment.label,
        payee: commitment.payee,
        commitmentId: commitment.id,
        amount: commitment.amount,
        currency: commitment.currency,
        dueDate,
      },
    })
  }

  if (sessionStatus === "loading") {
    return (
      <div className="pt-7">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Operating costs"
        sub="Rent, electricity, water, internet and cleaning — one bill per category per month"
      />

      {readable ? (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <MonthPicker period={period} onChange={setPeriod} />
            {canManage ? (
              <Button type="button" onClick={openCreate}>
                Record a bill
              </Button>
            ) : null}
          </div>

          {summaryQuery.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : summaryQuery.isError ? (
            <LoadError label="the monthly summary" onRetry={() => summaryQuery.refetch()} />
          ) : summaryQuery.data ? (
            <div className="space-y-3">
              {/* One row of stats per currency. Almost always just BDT — but a
                  USD bill gets its own line rather than being folded into the
                  BDT figure, because the sum of two currencies is not money. */}
              {summaryQuery.data.totals.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No costs recorded for {monthName(period.month)}.
                </p>
              ) : (
                summaryQuery.data.totals.map((t) => (
                  <div key={t.currency} className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <MiniStat
                      label={`Total (${t.currency})`}
                      value={formatMoney(t.total, t.currency)}
                      sub={monthName(period.month)}
                    />
                    <MiniStat
                      label="Paid"
                      value={formatMoney(t.paid, t.currency)}
                      sub="settled this month"
                    />
                    <MiniStat
                      label="Outstanding"
                      value={formatMoney(t.outstanding, t.currency)}
                      sub="not yet paid"
                    />
                    <MiniStat
                      label="Overdue"
                      value={String(summaryQuery.data.overdueCount)}
                      sub={summaryQuery.data.overdueCount === 1 ? "bill" : "bills"}
                    />
                  </div>
                ))
              )}
              {summaryQuery.data.categories.length > 0 ? (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {summaryQuery.data.categories.map((c) => (
                    // Keyed on category AND currency: one category can now
                    // legitimately produce two rows, and categoryId alone
                    // would collide.
                    <MiniStat
                      key={`${c.categoryId}-${c.currency}`}
                      label={c.categoryName}
                      value={formatMoney(c.total, c.currency)}
                      sub={`${c.billCount} bill${c.billCount === 1 ? "" : "s"} · ${formatMoney(c.outstanding, c.currency)} due`}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {missingCommitments.length > 0 ? (
            <div className="space-y-2">
              {missingCommitments.map((c) => (
                <div
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-amber-300 bg-amber-50 px-4 py-2.5 text-[13px] dark:border-amber-900 dark:bg-amber-950"
                >
                  <span>
                    No {(c.category?.name ?? c.label).toLowerCase()} recorded for {monthName(period.month)}.
                  </span>
                  {canManage ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => openCreateFromCommitment(c)}>
                      Add bill
                    </Button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}

          <Tabs defaultValue="bills">
            <TabsList>
              <TabsTrigger value="bills">Bills</TabsTrigger>
              <TabsTrigger value="commitments">Commitments</TabsTrigger>
              {canManage ? <TabsTrigger value="import">Import</TabsTrigger> : null}
            </TabsList>

            <TabsContent value="bills" className="pt-3">
              {billsQuery.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : billsQuery.isError ? (
                <LoadError label="this month's bills" onRetry={() => billsQuery.refetch()} />
              ) : (
                <BillsTable
                  bills={bills}
                  canManage={canManage}
                  onView={(id) => setCostDialog({ costId: id })}
                  onPay={(id) => setPayTarget(id)}
                />
              )}
            </TabsContent>

            <TabsContent value="commitments" className="pt-3">
              <div className="space-y-3">
                {canManage ? (
                  <div className="flex justify-end">
                    <Button type="button" variant="outline" size="sm" onClick={() => setCommitmentTarget("new")}>
                      New commitment
                    </Button>
                  </div>
                ) : null}
                {commitmentsQuery.isPending ? (
                  <Skeleton className="h-32 w-full" />
                ) : commitmentsQuery.isError ? (
                  <LoadError label="commitments" onRetry={() => commitmentsQuery.refetch()} />
                ) : (
                  <CommitmentsTable
                    commitments={commitments}
                    canManage={canManage}
                    onEdit={(c) => setCommitmentTarget(c)}
                  />
                )}
              </div>
            </TabsContent>

            {canManage ? (
              <TabsContent value="import" className="pt-3">
                <ImportWizard categories={categories} onImported={invalidateAll} />
              </TabsContent>
            ) : null}
          </Tabs>
        </div>
      ) : null}

      <CostDialog
        key={costDialog ? `cost-${costDialog.costId ?? "new"}` : "cost-idle"}
        open={!!costDialog}
        onOpenChange={(next) => !next && setCostDialog(null)}
        costId={costDialog?.costId ?? null}
        period={period}
        categories={categories}
        prefill={costDialog?.prefill}
        canManage={canManage}
        onSuccess={invalidateAll}
        onPay={(id) => {
          setCostDialog(null)
          setPayTarget(id)
        }}
      />

      <PayDialog
        key={payTarget ? `pay-${payTarget}` : "pay-idle"}
        costId={payTarget}
        open={!!payTarget}
        onOpenChange={(next) => !next && setPayTarget(null)}
        period={period}
        onSuccess={() => setPayTarget(null)}
      />

      {canManage ? (
        <CommitmentDialog
          key={
            commitmentTarget === null
              ? "commitment-idle"
              : commitmentTarget === "new"
                ? "commitment-new"
                : `commitment-${commitmentTarget.id}`
          }
          commitment={commitmentTarget}
          open={!!commitmentTarget}
          onOpenChange={(next) => !next && setCommitmentTarget(null)}
          categories={categories}
          onSuccess={invalidateAll}
        />
      ) : null}
    </>
  )
}
