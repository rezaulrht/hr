"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { DataTable } from "@/components/dashboard/data-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createShift, deleteShift, listShifts, updateShift } from "@/lib/api/shifts"
import type { Shift, ShiftImpact, ShiftInput } from "@/lib/api/types"
import { ConfirmDeleteDialog, PanelFrame, toMessage } from "./settings-shared"

/**
 * The attendance grid resolves the fallback shift by this literal name for
 * every employee whose shiftId is null, and throws when it is absent. The
 * server refuses to delete or rename it; this constant is why the UI does not
 * offer to.
 */
const DEFAULT_SHIFT_NAME = "General"

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

const describeOffDays = (days: number[]): string =>
  days.length === 0 ? "None" : days.map((d) => DAY_LABELS[d]).join(", ")

export function ShiftsPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Shift | "new" | null>(null)
  const [deleting, setDeleting] = useState<Shift | null>(null)
  const [impact, setImpact] = useState<ShiftImpact | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: shifts = [], isLoading } = useQuery({
    queryKey: ["shifts"],
    queryFn: () => listShifts(accessToken),
  })

  const refresh = () => {
    setEditing(null)
    setDeleting(null)
    setError(null)
    queryClient.invalidateQueries({ queryKey: ["shifts"] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ShiftInput }) =>
      id === null
        ? createShift(accessToken, input).then(() => undefined)
        : updateShift(accessToken, id, input).then((result) => result.impact),
    onSuccess: (result) => {
      setImpact(result ?? null)
      refresh()
    },
    onError: (err) => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteShift(accessToken, id),
    onSuccess: refresh,
    onError: (err) => {
      setDeleting(null)
      setError(toMessage(err))
    },
  })

  return (
    <PanelFrame
      title="Shifts"
      sub="Working hours and weekly off days. Employees without an explicit shift fall back to General."
      actionLabel="Add shift"
      onAction={() => {
        setError(null)
        setEditing("new")
      }}
      error={error}
    >
      {/* Changing the weekly off days re-derives every past attendance day for
          everyone on this shift, in a different module from this screen. The
          write has already happened; this states what it did. */}
      {impact ? (
        <div className="rounded-md border border-[#F5E0BE] bg-[#FDF8EE] px-4 py-3 text-[12.5px] text-[#9A6B10]">
          The weekly off days changed, so attendance re-derives for{" "}
          <strong>{impact.affectedEmployees}</strong> employee
          {impact.affectedEmployees === 1 ? "" : "s"}
          {impact.earliestAffectedDate
            ? ` back to ${impact.earliestAffectedDate}`
            : " — no attendance has been recorded for them yet"}
          .
          <Button
            variant="link"
            className="ml-2 h-auto p-0 font-bold underline"
            onClick={() => setImpact(null)}
          >
            Dismiss
          </Button>
        </div>
      ) : null}

      <DataTable
        title=""
        action=""
        cols="1.2fr 0.9fr 0.7fr 1fr 0.8fr"
        headers={["Shift", "Hours", "Grace", "Weekly off", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }]]
            : shifts.map((shift) => {
                const isDefault = shift.name === DEFAULT_SHIFT_NAME
                return [
                  {
                    text: shift.name,
                    sub: isDefault ? "Company default" : undefined,
                    weight: 600,
                  },
                  {
                    text: `${shift.startTime}–${shift.endTime}`,
                    sub: `${shift.breakMinutes} min break`,
                  },
                  { text: `${shift.graceMinutes} min` },
                  { text: describeOffDays(shift.weeklyOffDays) },
                  {
                    node: (
                      <div className="flex gap-3">
                        <Button
                          variant="link"
                          className="h-auto p-0 text-[12px] font-bold underline"
                          onClick={() => {
                            setError(null)
                            setEditing(shift)
                          }}
                        >
                          Edit
                        </Button>
                        {isDefault ? (
                          <span
                            className="text-[12px] font-semibold text-[#9AA4B0]"
                            title="Attendance resolves this shift by name for everyone without an explicit shift."
                          >
                            Required
                          </span>
                        ) : (
                          <Button
                            variant="link"
                            className="h-auto p-0 text-[12px] font-bold text-[#B03A3A] underline"
                            onClick={() => {
                              setError(null)
                              setDeleting(shift)
                            }}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    ),
                  },
                ]
              })
        }
      />

      {editing !== null ? (
        <ShiftDialog
          shift={editing === "new" ? null : editing}
          pending={saveMutation.isPending}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            saveMutation.mutate({ id: editing === "new" ? null : editing.id, input })
          }
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        what={deleting ? `the ${deleting.name} shift` : ""}
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </PanelFrame>
  )
}

function ShiftDialog({
  shift,
  pending,
  error,
  onClose,
  onSave,
}: {
  shift: Shift | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (input: ShiftInput) => void
}) {
  const [name, setName] = useState(shift?.name ?? "")
  const [startTime, setStartTime] = useState(shift?.startTime ?? "09:00")
  const [endTime, setEndTime] = useState(shift?.endTime ?? "18:00")
  const [breakMinutes, setBreakMinutes] = useState(String(shift?.breakMinutes ?? 60))
  const [graceMinutes, setGraceMinutes] = useState(String(shift?.graceMinutes ?? 15))
  const [offDays, setOffDays] = useState<number[]>(shift?.weeklyOffDays ?? [5])

  const isDefault = shift?.name === DEFAULT_SHIFT_NAME

  const toggleDay = (day: number) =>
    setOffDays((current) =>
      current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort()
    )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{shift ? `Edit ${shift.name}` : "Add a shift"}</DialogTitle>
          <DialogDescription>
            Break minutes sit inside the span, so 09:00–18:00 with a 60-minute break is a nine-hour
            day and nothing subtracts the break again downstream.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="shift-name" className="mb-1.5 text-xs font-bold">
              Name
            </Label>
            <Input
              id="shift-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isDefault}
            />
            {isDefault ? (
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                Attendance looks this shift up by name for every employee without an explicit one,
                so it cannot be renamed. Its hours below are yours to change.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="shift-start" className="mb-1.5 text-xs font-bold">
                Start
              </Label>
              <Input
                id="shift-start"
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shift-end" className="mb-1.5 text-xs font-bold">
                End
              </Label>
              <Input
                id="shift-end"
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shift-break" className="mb-1.5 text-xs font-bold">
                Break (minutes)
              </Label>
              <Input
                id="shift-break"
                type="number"
                min={0}
                max={480}
                value={breakMinutes}
                onChange={(e) => setBreakMinutes(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="shift-grace" className="mb-1.5 text-xs font-bold">
                Late allowance (minutes)
              </Label>
              <Input
                id="shift-grace"
                type="number"
                min={0}
                max={240}
                value={graceMinutes}
                onChange={(e) => setGraceMinutes(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 text-xs font-bold">Weekly off days</Label>
            <div className="flex flex-wrap gap-3">
              {DAY_LABELS.map((label, day) => (
                <label key={label} className="flex items-center gap-1.5 text-[12.5px]">
                  <Checkbox checked={offDays.includes(day)} onCheckedChange={() => toggleDay(day)} />
                  {label}
                </label>
              ))}
            </div>
            {shift && offDays.join() !== shift.weeklyOffDays.join() ? (
              <p className="mt-1.5 text-[11.5px] font-semibold text-[#9A6B10]">
                Changing these re-derives every past attendance day for everyone on this shift.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || name.trim().length === 0}
              onClick={() =>
                onSave({
                  name: name.trim(),
                  startTime,
                  endTime,
                  breakMinutes: Number(breakMinutes),
                  graceMinutes: Number(graceMinutes),
                  weeklyOffDays: offDays,
                })
              }
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {pending ? "Saving…" : shift ? "Save" : "Add shift"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
