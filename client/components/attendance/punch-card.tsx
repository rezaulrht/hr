"use client"

import { useEffect } from "react"
import { RiLoader4Line, RiLoginBoxLine, RiLogoutBoxLine } from "@remixicon/react"

import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tag } from "@/components/dashboard/tag"
import type { TodayAttendance } from "@/lib/api/types"
import {
  APPROVAL_LABEL,
  APPROVAL_TONE,
  formatClock,
  formatElapsed,
  formatHours,
  formatShiftSpan,
  minutesLate,
} from "@/components/attendance/attendance-shared"
import { useOfficeDate, useServerClock } from "@/components/attendance/use-server-clock"

export function PunchCard({
  today,
  isLoading,
  isPunching,
  error,
  onCheckIn,
  onCheckOut,
  onDayRollover,
}: {
  today: TodayAttendance | undefined
  isLoading: boolean
  isPunching: boolean
  error: string | null
  onCheckIn: () => void
  onCheckOut: () => void
  onDayRollover: () => void
}) {
  const now = useServerClock(today?.serverTime)
  const clientDate = useOfficeDate(now)

  // A dashboard left open overnight would otherwise still be offering a
  // check-out for yesterday at 00:01.
  useEffect(() => {
    if (today && clientDate !== today.date) onDayRollover()
  }, [clientDate, today, onDayRollover])

  if (isLoading || !today) {
    return (
      <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="mt-3 h-10 w-full" />
      </div>
    )
  }

  const late = today.isLate ? minutesLate(today.checkIn, today.shift.startTime) : null
  const elapsed =
    today.checkIn && !today.checkOut ? now.getTime() - new Date(today.checkIn).getTime() : null

  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div className="font-heading mt-1 text-[28px] font-bold tracking-tight tabular-nums">
            {now.toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              second: "2-digit",
            })}
          </div>
          <div className="mt-0.5 text-xs text-[#7A8698]">
            {today.shift.name} · {formatShiftSpan(
              today.shift.startTime,
              today.shift.endTime,
              today.shift.breakMinutes
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          {today.canCheckIn ? (
            <Button
              onClick={onCheckIn}
              disabled={isPunching}
              className="h-auto rounded-md bg-[#17191C] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
            >
              {isPunching ? (
                <RiLoader4Line className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RiLoginBoxLine className="mr-1.5 size-4" aria-hidden="true" />
              )}
              Check in
            </Button>
          ) : today.canCheckOut ? (
            <Button
              onClick={onCheckOut}
              disabled={isPunching}
              className="h-auto rounded-md bg-[#17191C] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
            >
              {isPunching ? (
                <RiLoader4Line className="mr-1.5 size-4 animate-spin" aria-hidden="true" />
              ) : (
                <RiLogoutBoxLine className="mr-1.5 size-4" aria-hidden="true" />
              )}
              Check out
            </Button>
          ) : (
            <div className="rounded-md bg-[#F2F5F8] px-4 py-2.5 text-[13px] font-semibold text-[#3D4756]">
              Done for today
            </div>
          )}

          {/* The approval step is invisible to the person it affects unless
              it is said out loud. Checking out never clears it — a named
              manager or HR does, so the tag stays "awaiting review" until
              somebody actually decides. */}
          {today.approval && today.checkOut ? (
            <Tag tone={APPROVAL_TONE[today.approval]} label={APPROVAL_LABEL[today.approval]} />
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#EEF1F5] pt-4 sm:grid-cols-4">
        <Detail label="Checked in" value={formatClock(today.checkIn)} />
        <Detail label="Checked out" value={formatClock(today.checkOut)} />
        <Detail
          label={elapsed !== null ? "Elapsed" : "Hours"}
          value={elapsed !== null ? formatElapsed(elapsed) : formatHours(today.workedHours)}
        />
        <Detail
          label="Status"
          value={
            late !== null
              ? `Late by ${late} min`
              : today.isEarlyOut
                ? "Left early"
                : today.checkIn
                  ? "On time"
                  : "—"
          }
        />
      </div>

      {today.detail ? (
        <div className="mt-3 rounded-md bg-[#F2F5F8] px-3.5 py-2.5 text-[12.5px] text-[#3D4756]">
          {today.detail}
        </div>
      ) : null}

      {/* Never optimistic: on a flaky connection an optimistic UI tells
          somebody they are checked in when they are not, and they find out
          on payday. */}
      {error ? (
        <div className="mt-3 rounded-md border border-[#F0D2D2] bg-[#FDF6F6] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#B03A3A]">
          {error}
        </div>
      ) : null}
    </div>
  )
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-bold tracking-wide text-[#7A8698] uppercase">{label}</div>
      <div className="mt-0.5 text-[13.5px] font-semibold tabular-nums">{value}</div>
    </div>
  )
}
