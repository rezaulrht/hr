"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  correctAttendance,
  createHoliday,
  deleteHoliday,
  getAuditTrail,
  getDailySummary,
} from "@/lib/api/attendance"
import { ApiError } from "@/lib/api/client"
import type {
  HolidayItem,
  HolidayType,
  ImpactBlock,
  MonthlyAttendanceSummary,
} from "@/lib/api/types"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import type { TableCell } from "@/components/dashboard/types"
import { TimeAmendmentDialog } from "@/components/attendance/time-amendment-dialog"
import {
  LoadError,
  SectionHeading,
  TableSkeleton,
} from "@/components/attendance/attendance-ui"
import {
  HOLIDAY_TYPE_LABEL,
  STATUS_LABEL,
  STATUS_TONE,
  formatClock,
  formatDayLabel,
  formatHours,
  formatMonthLabel,
} from "@/components/attendance/attendance-shared"

export function OrgSections({
  accessToken,
  role,
  month,
  year,
  holidays,
  summaries,
  summaryPending,
  onChanged,
}: {
  accessToken: string
  role: string
  month: number
  year: number
  holidays: HolidayItem[]
  summaries: MonthlyAttendanceSummary[]
  summaryPending: boolean
  onChanged: () => void
}) {
  const isFinance = role === "FINANCE_OFFICER"
  const isHr = role === "HR_ADMIN" || role === "SUPER_ADMIN"

  const pendingTotal = summaries.reduce((sum, s) => sum + s.pendingApproval, 0)

  return (
    <>
      {/* Finance sees the payroll input and nothing else — no punch card, no
          queue, no corrections. A non-zero pending count is the condition
          that will stop a payroll run, so it reads as a block, not a note. */}
      {isFinance && pendingTotal > 0 ? (
        <div className="mt-6 rounded-md border border-[#F0D2D2] bg-[#FDF6F6] px-4 py-3 text-[13px] font-semibold text-[#B03A3A]">
          {pendingTotal} attendance record{pendingTotal === 1 ? "" : "s"} across the org are still
          awaiting review. Payroll cannot run for {formatMonthLabel(month, year)} until they are
          decided.
        </div>
      ) : null}

      {!isFinance ? <DailyBoard accessToken={accessToken} /> : null}

      <MonthlyTable
        accessToken={accessToken}
        month={month}
        year={year}
        summaries={summaries}
        pending={summaryPending}
        isHr={isHr}
        onChanged={onChanged}
      />

      {isHr ? (
        <HolidayPanel
          accessToken={accessToken}
          year={year}
          holidays={holidays}
          onChanged={onChanged}
        />
      ) : null}
    </>
  )
}

function DailyBoard({ accessToken }: { accessToken: string }) {
  const dailyQuery = useQuery({
    queryKey: ["attendance", "daily", "today"],
    queryFn: () => getDailySummary(accessToken),
    // "Who is in right now" is the question this board exists to answer.
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  })

  const summary = dailyQuery.data
  const rows: TableCell[][] =
    summary?.rows.map((row) => [
      { text: row.employee.fullName, sub: row.employee.designation, weight: 600 },
      { tag: STATUS_LABEL[row.status], tone: STATUS_TONE[row.status], sub: row.detail ?? undefined },
      { text: formatClock(row.checkIn) },
      { text: formatClock(row.checkOut) },
      { text: formatHours(row.workedHours) },
    ]) ?? []

  return (
    <>
      <SectionHeading title="Today" sub="Live board, refreshed every minute." />

      {summary ? (
        <div className="mb-3.5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <MiniStat label="Present" value={String(summary.totals.present)} sub={`${summary.totals.late} late`} />
          <MiniStat label="Absent" value={String(summary.totals.absent)} sub="No record today" />
          <MiniStat label="On leave" value={String(summary.totals.onLeave)} sub="Approved leave" />
          <MiniStat
            label="Not in yet"
            value={String(summary.totals.notCheckedIn)}
            sub="Working day, no check-in"
          />
        </div>
      ) : null}

      {summary && summary.conflicts.length > 0 ? (
        <div className="mb-3.5 rounded-md border border-[#F5E0BE] bg-[#FDF8EE] px-4 py-3 text-[12.5px] text-[#9A6B10]">
          <strong>
            {summary.conflicts.length} person
            {summary.conflicts.length === 1 ? "" : "s"} checked in while on approved leave:
          </strong>{" "}
          {summary.conflicts.map((c) => c.fullName).join(", ")}. The check-in was recorded rather
          than blocked — decide whether the leave should be cancelled.
        </div>
      ) : null}

      {dailyQuery.isPending ? (
        <TableSkeleton />
      ) : dailyQuery.isError ? (
        <LoadError label="today's board" onRetry={() => dailyQuery.refetch()} />
      ) : (
        <DataTable
          title=""
          cols="1.4fr 1fr 0.8fr 0.8fr 0.7fr"
          headers={["Employee", "Status", "Check in", "Check out", "Hours"]}
          rows={rows}
        />
      )}
    </>
  )
}

function MonthlyTable({
  accessToken,
  month,
  year,
  summaries,
  pending,
  isHr,
  onChanged,
}: {
  accessToken: string
  month: number
  year: number
  summaries: MonthlyAttendanceSummary[]
  pending: boolean
  isHr: boolean
  onChanged: () => void
}) {
  const rows: TableCell[][] = summaries.map((s) => [
    { text: s.employee.fullName, sub: s.employee.employeeCode, weight: 600 },
    { text: `${s.present} / ${s.workingDays}` },
    { text: String(s.absent) },
    { text: String(s.onLeave) },
    { text: String(s.late) },
    { text: formatHours(s.workedHours), sub: `of ${formatHours(s.expectedHours)}` },
    s.shortfallHours > 0 ? { text: formatHours(s.shortfallHours), tone: "yellow" } : { text: "—" },
    s.pendingApproval > 0
      ? { tag: `${s.pendingApproval} pending`, tone: "yellow" }
      : { text: s.autoApproved > 0 ? `${s.autoApproved} auto` : "—" },
  ])

  return (
    <>
      <SectionHeading
        title={`Monthly summary — ${formatMonthLabel(month, year)}`}
        sub={
          isHr
            ? "The figures payroll will consume. Shortfall is time owed against the shift, not absence."
            : "The figures payroll will consume."
        }
      />
      {pending ? (
        <TableSkeleton />
      ) : summaries.length === 0 ? (
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
          No attendance recorded for this month.
        </div>
      ) : (
        <DataTable
          title=""
          cols="1.4fr 0.8fr 0.6fr 0.7fr 0.6fr 1fr 0.8fr 0.9fr"
          headers={[
            "Employee",
            "Present",
            "Absent",
            "Leave",
            "Late",
            "Hours",
            "Shortfall",
            "Approval",
          ]}
          rows={rows}
        />
      )}
      {isHr ? <CorrectionTools accessToken={accessToken} onChanged={onChanged} /> : null}
    </>
  )
}

/**
 * HR's per-record tools, driven by an id rather than a row click: the
 * monthly table is per-employee-per-month, while a correction and its audit
 * trail are per-day, so the two do not line up on one grid.
 */
function CorrectionTools({
  accessToken,
  onChanged,
}: {
  accessToken: string
  onChanged: () => void
}) {
  const [recordId, setRecordId] = useState("")
  const [correcting, setCorrecting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditFor, setAuditFor] = useState<string | null>(null)

  const auditQuery = useQuery({
    queryKey: ["attendance", "audit", auditFor],
    queryFn: () => getAuditTrail(accessToken, auditFor!),
    enabled: !!auditFor,
  })

  const correctMutation = useMutation({
    mutationFn: (body: { checkIn?: string; checkOut?: string; note: string }) =>
      correctAttendance(accessToken, recordId, body),
    onSuccess: () => {
      setCorrecting(false)
      setError(null)
      onChanged()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."),
  })

  return (
    <div className="mt-3.5 rounded-md border border-[#E4E9EF] bg-white p-5.5">
      <div className="text-[13px] font-bold">Correct a record</div>
      <p className="mt-0.5 text-[12px] text-[#7A8698]">
        A correction settles the record immediately — HR outranks the manager in this chain.
        Every change is kept in the record&apos;s history.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-2.5">
        <div className="min-w-[260px] flex-1">
          <Label htmlFor="record-id" className="mb-1.5 text-xs font-bold">
            Attendance record id
          </Label>
          <Input
            id="record-id"
            value={recordId}
            onChange={(e) => setRecordId(e.target.value)}
            placeholder="Paste the id from the employee's log"
          />
        </div>
        <Button
          variant="outline"
          disabled={!recordId}
          onClick={() => {
            setError(null)
            setCorrecting(true)
          }}
          className="h-auto rounded-md px-4 py-2 text-[12.5px] font-bold"
        >
          Log correction
        </Button>
        <Button
          variant="ghost"
          disabled={!recordId}
          onClick={() => setAuditFor(recordId)}
          className="h-auto rounded-md px-4 py-2 text-[12.5px] font-bold"
        >
          View history
        </Button>
      </div>

      {error ? (
        <p className="mt-2.5 text-[12.5px] font-semibold text-[#B03A3A]">{error}</p>
      ) : null}

      {correcting ? (
        <TimeAmendmentDialog
          key={recordId}
          open
          onOpenChange={(open) => {
            if (!open) setCorrecting(false)
          }}
          title="Log a correction"
          description="This settles the record as approved and is written to its history with your name against it."
          confirmLabel="Save correction"
          pending={correctMutation.isPending}
          error={error}
          onConfirm={(body) => correctMutation.mutate(body)}
        />
      ) : null}

      {auditFor ? (
        <Dialog open onOpenChange={(open) => !open && setAuditFor(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Record history</DialogTitle>
              <DialogDescription>
                Every change, oldest first. This is what settles a dispute.
              </DialogDescription>
            </DialogHeader>
            {auditQuery.isPending ? (
              <TableSkeleton />
            ) : auditQuery.isError ? (
              <p className="text-[13px] text-[#B03A3A]">Could not load the history.</p>
            ) : (
              <ol className="space-y-2.5">
                {(auditQuery.data ?? []).map((entry) => (
                  <li key={entry.id} className="border-l-2 border-[#E4E9EF] pl-3">
                    <div className="text-[12.5px] font-bold">{entry.action}</div>
                    <div className="text-[11.5px] text-[#7A8698]">
                      {new Date(entry.changedAt).toLocaleString()}
                      {entry.changedBy ? "" : " · automatic"}
                    </div>
                    {entry.note ? (
                      <div className="mt-0.5 text-[12px] text-[#3D4756]">{entry.note}</div>
                    ) : null}
                  </li>
                ))}
              </ol>
            )}
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  )
}

const HOLIDAY_TYPES: HolidayType[] = ["GENERAL", "EXECUTIVE_ORDER", "OPTIONAL", "WORKING_DAY"]

function HolidayPanel({
  accessToken,
  year,
  holidays,
  onChanged,
}: {
  accessToken: string
  year: number
  holidays: HolidayItem[]
  onChanged: () => void
}) {
  const queryClient = useQueryClient()
  const [adding, setAdding] = useState(false)
  const [impact, setImpact] = useState<ImpactBlock | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ["holidays"] })
    // A holiday is an input to every derived day, so one edit changes every
    // employee's summary for that month.
    onChanged()
  }

  const createMutation = useMutation({
    mutationFn: (body: { name: string; date: string; type: HolidayType }) =>
      createHoliday(accessToken, body),
    onSuccess: (result) => {
      setAdding(false)
      setError(null)
      setImpact(result.impact ?? null)
      refresh()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteHoliday(accessToken, id),
    onSuccess: (result) => {
      setImpact(result.impact ?? null)
      refresh()
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."),
  })

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading
          title={`Holiday calendar — ${year}`}
          sub="Lunar dates move and the gazette gets amended, so this is yours to keep current."
        />
        <Button
          onClick={() => {
            setError(null)
            setAdding(true)
          }}
          className="h-auto rounded-md bg-[#17191C] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#0E1012]"
        >
          Add holiday
        </Button>
      </div>

      {/* The consequence of a backdated edit is invisible on this screen and
          lands in a different module, so it is stated rather than implied. */}
      {impact ? (
        <div className="mb-3.5 rounded-md border border-[#F5E0BE] bg-[#FDF8EE] px-4 py-3 text-[12.5px] text-[#9A6B10]">
          This affected <strong>{impact.affectedEmployees}</strong> employees across{" "}
          {impact.monthsTouched.join(", ")}. Their attendance totals have changed.
          <button className="ml-2 font-bold underline" onClick={() => setImpact(null)}>
            Dismiss
          </button>
        </div>
      ) : null}

      {error ? (
        <div className="mb-3.5 rounded-md border border-[#F0D2D2] bg-[#FDF6F6] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      <DataTable
        title=""
        cols="1.6fr 0.9fr 0.9fr 0.5fr"
        headers={["Holiday", "Date", "Type", ""]}
        rows={holidays.map((holiday) => [
          { text: holiday.name, weight: 600 },
          { text: formatDayLabel(holiday.date) },
          {
            text: HOLIDAY_TYPE_LABEL[holiday.type],
            sub: holiday.type === "WORKING_DAY" ? "Cancels the weekly off" : undefined,
          },
          {
            node: (
              <button
                className="text-[12px] font-bold text-[#B03A3A] underline disabled:opacity-40"
                disabled={deleteMutation.isPending}
                onClick={() => deleteMutation.mutate(holiday.id)}
              >
                Delete
              </button>
            ),
          },
        ])}
      />

      {adding ? (
        <AddHolidayDialog
          onClose={() => setAdding(false)}
          pending={createMutation.isPending}
          error={error}
          onConfirm={(body) => createMutation.mutate(body)}
        />
      ) : null}
    </>
  )
}

function AddHolidayDialog({
  onClose,
  pending,
  error,
  onConfirm,
}: {
  onClose: () => void
  pending: boolean
  error: string | null
  onConfirm: (body: { name: string; date: string; type: HolidayType }) => void
}) {
  const [name, setName] = useState("")
  const [date, setDate] = useState("")
  const [type, setType] = useState<HolidayType>("GENERAL")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a holiday</DialogTitle>
          <DialogDescription>
            Two different holidays may share a date. A working day cancels the weekly off instead
            of taking a day away.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="holiday-name" className="mb-1.5 text-xs font-bold">
              Name
            </Label>
            <Input id="holiday-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="holiday-date" className="mb-1.5 text-xs font-bold">
              Date
            </Label>
            <Input
              id="holiday-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="holiday-type" className="mb-1.5 text-xs font-bold">
              Type
            </Label>
            <select
              id="holiday-type"
              value={type}
              onChange={(e) => setType(e.target.value as HolidayType)}
              className="h-9 w-full rounded-md border border-[#E4E9EF] bg-white px-3 text-[13px]"
            >
              {HOLIDAY_TYPES.map((option) => (
                <option key={option} value={option}>
                  {HOLIDAY_TYPE_LABEL[option]}
                </option>
              ))}
            </select>
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || !name.trim() || !date}
              onClick={() => onConfirm({ name: name.trim(), date, type })}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {pending ? "Saving…" : "Add holiday"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
