"use client"

import { useState } from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { RiCheckboxCircleLine, RiErrorWarningLine } from "@remixicon/react"

import { getTrialBalance } from "@/lib/api/accounting"
import { useSession } from "@/lib/auth/session-context"
import { PageHeader } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { currentMonthRange, formatAmount, formatTotal } from "@/components/accounting/accounting-shared"

/**
 * Six money columns is a lot of table, and it is the right amount: opening,
 * movement and closing are three different questions, and collapsing them
 * would make the report useless for the one thing it is for — finding where
 * a balance came from.
 */
export function TrialBalancePage() {
  const { accessToken } = useSession()
  const initial = currentMonthRange()

  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)

  const tb = useQuery({
    queryKey: ["accounting", "trial-balance", from, to],
    queryFn: () => getTrialBalance(accessToken!, from, to),
    enabled: Boolean(accessToken),
  })

  return (
    <div className="space-y-6">
      <PageHeader
        kicker="Accounting"
        title="Trial balance"
        sub="Opening balance, movement in the period, and closing balance for every account."
      />

      <div className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="tb-from">From</label>
          <Input id="tb-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
        </div>
        <div className="grid gap-1">
          <label className="text-xs text-muted-foreground" htmlFor="tb-to">To</label>
          <Input id="tb-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
        </div>
      </div>

      {tb.isPending ? (
        <div className="space-y-2 rounded-lg border p-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </div>
      ) : tb.isError ? (
        <div className="rounded-lg border p-10 text-center text-sm">
          <p className="text-muted-foreground">The trial balance could not be loaded.</p>
          <Button variant="outline" size="sm" className="mt-3" onClick={() => tb.refetch()}>
            Try again
          </Button>
        </div>
      ) : (
        <>
          {/*
            Stated plainly at the top, because an out-of-balance trial
            balance is the one fact that invalidates everything below it —
            and in slice 2, blocks the financial statements entirely.
          */}
          <div
            className={
              tb.data!.isBalanced
                ? "flex items-center gap-2 rounded-lg border bg-muted/40 p-3 text-sm"
                : "flex items-center gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
            }
          >
            {tb.data!.isBalanced ? (
              <>
                <RiCheckboxCircleLine className="size-4" />
                <span>
                  Balanced — debit and credit both total{" "}
                  <span className="font-medium tabular-nums">
                    {formatTotal(tb.data!.totals.closingDebit)}
                  </span>
                </span>
              </>
            ) : (
              <>
                <RiErrorWarningLine className="size-4 text-destructive" />
                <span>
                  <span className="font-medium">Not balanced.</span> Debit{" "}
                  <span className="tabular-nums">{formatTotal(tb.data!.totals.closingDebit)}</span>{" "}
                  against credit{" "}
                  <span className="tabular-nums">{formatTotal(tb.data!.totals.closingCredit)}</span>.
                  Financial statements cannot be produced until this agrees.
                </span>
              </>
            )}
          </div>

          <div className="overflow-x-auto rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20" rowSpan={2}>Code</TableHead>
                  <TableHead rowSpan={2}>Account</TableHead>
                  <TableHead className="text-center" colSpan={2}>Opening</TableHead>
                  <TableHead className="text-center" colSpan={2}>Movement</TableHead>
                  <TableHead className="text-center" colSpan={2}>Closing</TableHead>
                </TableRow>
                <TableRow>
                  <TableHead className="w-32 text-right">Debit</TableHead>
                  <TableHead className="w-32 text-right">Credit</TableHead>
                  <TableHead className="w-32 text-right">Debit</TableHead>
                  <TableHead className="w-32 text-right">Credit</TableHead>
                  <TableHead className="w-32 text-right">Debit</TableHead>
                  <TableHead className="w-32 text-right">Credit</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tb.data!.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-10 text-center text-sm text-muted-foreground">
                      Nothing has been posted in or before this period.
                    </TableCell>
                  </TableRow>
                ) : (
                  tb.data!.rows.map((r) => (
                    <TableRow key={r.accountId}>
                      <TableCell className="text-muted-foreground tabular-nums">{r.code}</TableCell>
                      <TableCell>
                        {/* Drill-down: trial balance → ledger → journal. */}
                        <Link
                          href={`../ledger?accountId=${r.accountId}&from=${from}&to=${to}`}
                          className="hover:underline"
                        >
                          {r.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.openingDebit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.openingCredit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.periodDebit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.periodCredit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.closingDebit)}</TableCell>
                      <TableCell className="text-right tabular-nums">{formatAmount(r.closingCredit)}</TableCell>
                    </TableRow>
                  ))
                )}

                <TableRow className="border-t-2 font-medium">
                  <TableCell colSpan={2} className="text-right">Total</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.openingDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.openingCredit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.periodDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.periodCredit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.closingDebit)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatTotal(tb.data!.totals.closingCredit)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </>
      )}
    </div>
  )
}
