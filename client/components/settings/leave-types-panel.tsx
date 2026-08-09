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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  createLeaveType,
  deleteLeaveType,
  listLeaveTypes,
  updateLeaveType,
} from "@/lib/api/leave"
import type {
  CreateLeaveTypeInput,
  EmploymentType,
  LeaveAccrualBasis,
  LeaveType,
} from "@/lib/api/types"
import { ConfirmDeleteDialog, PanelFrame, toMessage } from "./settings-shared"

const ACCRUAL_BASES: LeaveAccrualBasis[] = ["PRO_RATED", "PER_EVENT", "EARNED", "NONE"]

const ACCRUAL_LABEL: Record<string, string> = {
  PRO_RATED: "Pro-rated across the joining year",
  PER_EVENT: "Full quota per occasion",
  EARNED: "Earned from days worked",
  NONE: "No entitlement",
}

const EMPLOYMENT_TYPES: EmploymentType[] = ["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]

const EMPLOYMENT_LABEL: Record<string, string> = {
  FULL_TIME: "Full-time",
  PART_TIME: "Part-time",
  CONTRACT: "Contract",
  INTERN: "Intern",
}

export function LeaveTypesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<LeaveType | "new" | null>(null)
  const [deleting, setDeleting] = useState<LeaveType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: leaveTypes = [], isLoading } = useQuery({
    queryKey: ["leave-types"],
    queryFn: () => listLeaveTypes(accessToken),
  })

  const done = () => {
    setEditing(null)
    setDeleting(null)
    setError(null)
    queryClient.invalidateQueries({ queryKey: ["leave-types"] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CreateLeaveTypeInput }) => {
      if (id === null) return createLeaveType(accessToken, input)
      // `code` is immutable, so it never goes in an update body.
      const { code, ...rest } = input
      void code
      return updateLeaveType(accessToken, id, rest)
    },
    onSuccess: done,
    onError: (err) => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteLeaveType(accessToken, id),
    onSuccess: done,
    onError: (err) => {
      setDeleting(null)
      setError(toMessage(err))
    },
  })

  return (
    <PanelFrame
      title="Leave types"
      sub="Statutory types come from the Bangladesh Labour Act. They can be made more generous, never less."
      actionLabel="Add leave type"
      onAction={() => {
        setError(null)
        setEditing("new")
      }}
      error={error}
    >
      <DataTable
        title=""
        action=""
        cols="1.3fr 0.7fr 0.9fr 1fr 0.8fr"
        headers={["Type", "Quota", "Accrual", "Eligible", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }]]
            : leaveTypes.map((type) => [
                {
                  text: type.name,
                  sub: type.statutory ? `${type.code} · statutory` : type.code,
                  weight: 600,
                },
                {
                  text: type.accrualBasis === "EARNED" ? "Earned" : `${type.annualQuota} days`,
                  sub: type.isPaid ? "Paid" : "Unpaid",
                },
                { text: ACCRUAL_LABEL[type.accrualBasis] ?? type.accrualBasis },
                {
                  text: type.eligibleFor.map((e) => EMPLOYMENT_LABEL[e] ?? e).join(", "),
                  sub:
                    type.minServiceMonths > 0
                      ? `After ${type.minServiceMonths} months' service`
                      : undefined,
                },
                {
                  node: (
                    <div className="flex gap-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[12px] font-bold underline"
                        onClick={() => {
                          setError(null)
                          setEditing(type)
                        }}
                      >
                        Edit
                      </Button>
                      {type.statutory ? (
                        <span
                          className="text-[12px] font-semibold text-[#9AA4B0]"
                          title="Granted by the Labour Act. It can be raised, but not removed."
                        >
                          Statutory
                        </span>
                      ) : (
                        <Button
                          variant="link"
                          className="h-auto p-0 text-[12px] font-bold text-[#B03A3A] underline"
                          onClick={() => {
                            setError(null)
                            setDeleting(type)
                          }}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  ),
                },
              ])
        }
      />

      {editing !== null ? (
        <LeaveTypeDialog
          leaveType={editing === "new" ? null : editing}
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
        what={deleting?.name ?? ""}
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </PanelFrame>
  )
}

function LeaveTypeDialog({
  leaveType,
  pending,
  error,
  onClose,
  onSave,
}: {
  leaveType: LeaveType | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (input: CreateLeaveTypeInput) => void
}) {
  const [code, setCode] = useState(leaveType?.code ?? "")
  const [name, setName] = useState(leaveType?.name ?? "")
  const [annualQuota, setAnnualQuota] = useState(String(leaveType?.annualQuota ?? 0))
  const [carryForwardPct, setCarryForwardPct] = useState(String(leaveType?.carryForwardPct ?? 0))
  const [maxConsecutive, setMaxConsecutive] = useState(
    leaveType?.maxConsecutive === null || leaveType?.maxConsecutive === undefined
      ? ""
      : String(leaveType.maxConsecutive)
  )
  const [maxAccrual, setMaxAccrual] = useState(
    leaveType?.maxAccrual === null || leaveType?.maxAccrual === undefined
      ? ""
      : String(leaveType.maxAccrual)
  )
  const [minServiceMonths, setMinServiceMonths] = useState(String(leaveType?.minServiceMonths ?? 0))
  const [isPaid, setIsPaid] = useState(leaveType?.isPaid ?? true)
  const [allowsBackdating, setAllowsBackdating] = useState(leaveType?.allowsBackdating ?? false)
  const [countsHolidays, setCountsHolidays] = useState(leaveType?.countsHolidays ?? false)
  const [allowsHalfDay, setAllowsHalfDay] = useState(leaveType?.allowsHalfDay ?? true)
  const [accrualBasis, setAccrualBasis] = useState<LeaveAccrualBasis>(
    leaveType?.accrualBasis ?? "PRO_RATED"
  )
  const [eligibleFor, setEligibleFor] = useState<EmploymentType[]>(
    leaveType?.eligibleFor ?? ["FULL_TIME"]
  )

  // Mirrors assertStatutoryUpdateAllowed on the server. An affordance, not the
  // enforcement — the server's 409 is the authority and is shown verbatim.
  const locked = leaveType?.statutory ?? false

  const toggleEligible = (type: EmploymentType) =>
    setEligibleFor((current) =>
      current.includes(type) ? current.filter((t) => t !== type) : [...current, type]
    )

  const nullableNumber = (value: string): number | null =>
    value.trim() === "" ? null : Number(value)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{leaveType ? `Edit ${leaveType.name}` : "Add a leave type"}</DialogTitle>
          <DialogDescription>
            {locked
              ? "This type is granted by the Labour Act. You can be more generous than the statute, but not less, and the rules that decide how it is computed are fixed."
              : "A company-policy type. Nothing here is fixed by statute."}
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[65vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lt-code" className="mb-1.5 text-xs font-bold">
                Code
              </Label>
              <Input
                id="lt-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={leaveType !== null}
                placeholder="STUDY"
              />
              {leaveType ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">
                  Fixed. Policy rules are looked up by code, never by name.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="lt-name" className="mb-1.5 text-xs font-bold">
                Name
              </Label>
              <Input id="lt-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="lt-quota" className="mb-1.5 text-xs font-bold">
                Annual quota (days)
              </Label>
              <Input
                id="lt-quota"
                type="number"
                min={0}
                max={365}
                value={annualQuota}
                onChange={(e) => setAnnualQuota(e.target.value)}
              />
              {locked && leaveType ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">
                  At least {leaveType.annualQuota} — statutory.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="lt-carry" className="mb-1.5 text-xs font-bold">
                Carry-forward (%)
              </Label>
              <Input
                id="lt-carry"
                type="number"
                min={0}
                max={100}
                value={carryForwardPct}
                onChange={(e) => setCarryForwardPct(e.target.value)}
              />
              {locked && leaveType ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">
                  At least {leaveType.carryForwardPct}% — statutory.
                </p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="lt-maxrun" className="mb-1.5 text-xs font-bold">
                Longest single absence (days)
              </Label>
              <Input
                id="lt-maxrun"
                type="number"
                min={1}
                max={365}
                value={maxConsecutive}
                onChange={(e) => setMaxConsecutive(e.target.value)}
                placeholder="No limit"
              />
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                {locked && leaveType?.maxConsecutive === null
                  ? "Currently unlimited — statutory, so it cannot be capped."
                  : "Leave blank for no limit."}
              </p>
            </div>
            <div>
              <Label htmlFor="lt-maxaccrual" className="mb-1.5 text-xs font-bold">
                Accrual ceiling (days)
              </Label>
              <Input
                id="lt-maxaccrual"
                type="number"
                min={1}
                max={365}
                value={maxAccrual}
                onChange={(e) => setMaxAccrual(e.target.value)}
                placeholder="No ceiling"
              />
              {locked && leaveType && leaveType.maxAccrual !== null ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">
                  At least {leaveType.maxAccrual} — statutory.
                </p>
              ) : null}
            </div>
          </div>

          <div>
            <Label htmlFor="lt-service" className="mb-1.5 text-xs font-bold">
              Minimum service (months)
            </Label>
            <Input
              id="lt-service"
              type="number"
              min={0}
              max={120}
              value={minServiceMonths}
              onChange={(e) => setMinServiceMonths(e.target.value)}
            />
            {/* This one inverts: a waiting period is more generous when it is
                shorter, so the statutory rule is a ceiling, not a floor. */}
            {locked && leaveType ? (
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                At most {leaveType.minServiceMonths} — statutory. A shorter wait is more generous,
                so this is the one limit that works the other way round.
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="lt-accrual" className="mb-1.5 text-xs font-bold">
              How entitlement is calculated
            </Label>
            <Select
              value={accrualBasis}
              onValueChange={(v) => setAccrualBasis(v as LeaveAccrualBasis)}
              disabled={locked}
            >
              <SelectTrigger id="lt-accrual" className="w-full">
                <SelectValue>
                  {(value: string | null) =>
                    value === null ? "Select…" : (ACCRUAL_LABEL[value] ?? value)
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {ACCRUAL_BASES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {ACCRUAL_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {locked ? (
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                Fixed. This decides which section of the Act applies, not how generous the company
                is, so there is no &ldquo;more generous&rdquo; direction to move it in.
              </p>
            ) : null}
          </div>

          <div>
            <Label className="mb-1.5 text-xs font-bold">Eligible employment types</Label>
            <div className="flex flex-wrap gap-3">
              {EMPLOYMENT_TYPES.map((type) => (
                <label key={type} className="flex items-center gap-1.5 text-[12.5px]">
                  <Checkbox
                    checked={eligibleFor.includes(type)}
                    onCheckedChange={() => toggleEligible(type)}
                  />
                  {EMPLOYMENT_LABEL[type]}
                </label>
              ))}
            </div>
            {locked ? (
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                You can cover more employment types than the Act requires, but not fewer.
              </p>
            ) : null}
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={isPaid}
                onCheckedChange={(v) => setIsPaid(v === true)}
                disabled={locked}
              />
              Paid leave
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={allowsBackdating}
                onCheckedChange={(v) => setAllowsBackdating(v === true)}
                disabled={locked}
              />
              Can be filed after the fact
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={countsHolidays}
                onCheckedChange={(v) => setCountsHolidays(v === true)}
                disabled={locked}
              />
              Holidays inside the range count as leave
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={allowsHalfDay}
                onCheckedChange={(v) => setAllowsHalfDay(v === true)}
                disabled={locked}
              />
              Can be taken as a half day
            </label>
            {locked ? (
              <p className="text-[11.5px] text-[#6B7683]">
                These four say how the statute is applied rather than how much is granted, so they
                are fixed for a statutory type.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
        </div>

        <DialogFooter>
          <Button
            disabled={
              pending ||
              name.trim().length === 0 ||
              code.trim().length === 0 ||
              eligibleFor.length === 0
            }
            onClick={() =>
              onSave({
                code: code.trim(),
                name: name.trim(),
                annualQuota: Number(annualQuota),
                carryForwardPct: Number(carryForwardPct),
                maxConsecutive: nullableNumber(maxConsecutive),
                maxAccrual: nullableNumber(maxAccrual),
                minServiceMonths: Number(minServiceMonths),
                isPaid,
                allowsBackdating,
                countsHolidays,
                allowsHalfDay,
                accrualBasis,
                eligibleFor,
              })
            }
            className="bg-[#17191C] text-white hover:bg-[#0E1012]"
          >
            {pending ? "Saving…" : leaveType ? "Save" : "Add leave type"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
