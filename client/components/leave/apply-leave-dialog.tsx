"use client"

import { useMemo, useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { applyForLeave } from "@/lib/api/leave"
import { ApiError } from "@/lib/api/client"
import type { LeaveBalanceItem, LeaveType } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { countWorkingDays, isWeeklyOff, parseDateString, toDateString } from "@/lib/utils"

/** Mirrors MAX_BACKDATE_DAYS on the server. */
const MAX_BACKDATE_DAYS = 30

function startOfToday(): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function ApplyLeaveDialog({
  open,
  onOpenChange,
  leaveTypes,
  balances,
  accessToken,
  onApplied,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  leaveTypes: LeaveType[]
  balances: LeaveBalanceItem[]
  accessToken: string
  onApplied: () => void
}) {
  const [leaveTypeId, setLeaveTypeId] = useState("")
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [reason, setReason] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const selectedType = leaveTypes.find((t) => t.id === leaveTypeId) ?? null
  const selectedBalance = balances.find((b) => b.leaveTypeId === leaveTypeId) ?? null

  // Unpaid, zero-quota types have no balance to run down, so no warning applies.
  const isUnpaidType = !!selectedType && !selectedType.isPaid && selectedType.annualQuota === 0

  const earliestSelectable = useMemo(() => {
    const today = startOfToday()
    if (selectedType?.allowsBackdating) return addDays(today, -MAX_BACKDATE_DAYS)
    return today
  }, [selectedType])

  /** Fridays are never selectable; past dates only for backdating-enabled types. */
  const isDateDisabled = (date: Date) =>
    isWeeklyOff(date) || date.getTime() < earliestSelectable.getTime()

  const workingDays = useMemo(() => {
    if (!startDate || !endDate) return null
    const start = parseDateString(startDate)
    const end = parseDateString(endDate)
    if (end.getTime() < start.getTime()) return null
    return countWorkingDays(start, end)
  }, [startDate, endDate])

  const exceedsBalance =
    workingDays !== null && !isUnpaidType && !!selectedBalance && workingDays > selectedBalance.balance

  const applyMutation = useMutation({
    mutationFn: () =>
      applyForLeave(accessToken, {
        leaveTypeId,
        startDate,
        endDate,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }),
    onSuccess: () => {
      resetForm()
      onOpenChange(false)
      onApplied()
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  function resetForm() {
    setLeaveTypeId("")
    setStartDate("")
    setEndDate("")
    setReason("")
    setFormError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm()
    onOpenChange(next)
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    // Only the checks the client can answer on its own. Balance, eligibility,
    // overlap and backdating stay server-authoritative.
    if (!leaveTypeId || !startDate || !endDate) {
      setFormError("Pick a leave type and both dates.")
      return
    }
    if (parseDateString(endDate).getTime() < parseDateString(startDate).getTime()) {
      setFormError("The end date cannot be before the start date")
      return
    }
    applyMutation.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Request leave</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label className="mb-1.5 text-xs font-bold">Leave type</Label>
            <Select
              value={leaveTypeId}
              onValueChange={(v) => {
                setLeaveTypeId(v ?? "")
                // Backdating rules differ per type, so a date valid for the old
                // type may not be valid for the new one.
                setStartDate("")
                setEndDate("")
              }}
            >
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string | null) =>
                    leaveTypes.find((t) => t.id === v)?.name ?? "Select a leave type"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {leaveTypes.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedBalance && !isUnpaidType ? (
              <p className="mt-1.5 text-xs text-[#7A8698]">
                {selectedBalance.balance} of {selectedBalance.entitlement} days remaining
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="mb-1.5 text-xs font-bold">Start date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!selectedType}
                      className="w-full justify-start font-normal"
                    />
                  }
                >
                  {startDate || "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={startDate ? parseDateString(startDate) : undefined}
                    disabled={isDateDisabled}
                    onSelect={(d) => {
                      if (!d) return
                      const next = toDateString(d)
                      setStartDate(next)
                      if (endDate && parseDateString(endDate).getTime() < d.getTime()) {
                        setEndDate(next)
                      }
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="mb-1.5 text-xs font-bold">End date</Label>
              <Popover>
                <PopoverTrigger
                  render={
                    <Button
                      type="button"
                      variant="outline"
                      disabled={!selectedType}
                      className="w-full justify-start font-normal"
                    />
                  }
                >
                  {endDate || "Pick a date"}
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={endDate ? parseDateString(endDate) : undefined}
                    disabled={isDateDisabled}
                    onSelect={(d) => d && setEndDate(toDateString(d))}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>

          {workingDays !== null ? (
            <div className="space-y-1">
              <p className="text-[13px] font-semibold">
                {workingDays} working day{workingDays === 1 ? "" : "s"} (Fridays excluded)
              </p>
              {exceedsBalance ? (
                <p className="text-[12.5px] font-semibold text-[#9A6B10]">
                  That is more than your remaining {selectedBalance?.balance} day
                  {selectedBalance?.balance === 1 ? "" : "s"}. Consider Leave Without Pay instead.
                </p>
              ) : null}
            </div>
          ) : null}

          <div>
            <Label htmlFor="reason" className="mb-1.5 text-xs font-bold">
              Reason <span className="font-normal text-[#7A8698]">(optional)</span>
            </Label>
            <Textarea
              id="reason"
              value={reason}
              maxLength={500}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          {formError ? (
            <p className="text-[13px] font-semibold text-[#B03A3A]">{formError}</p>
          ) : null}

          <DialogFooter>
            <Button
              type="submit"
              disabled={applyMutation.isPending}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {applyMutation.isPending ? "Submitting…" : "Submit request"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
