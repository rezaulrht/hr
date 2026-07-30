"use client"

import { useState } from "react"

import type { AdjustmentInput, ComponentKind, Currency } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

const COMMON_CODES = [
  { code: "FESTIVAL_BONUS", label: "Festival bonus", kind: "EARNING" as ComponentKind },
  { code: "ARREARS", label: "Arrears", kind: "EARNING" as ComponentKind },
  { code: "FESTIVAL_HOLIDAY_WAGES", label: "Festival holiday wages", kind: "EARNING" as ComponentKind },
  { code: "ADVANCE_RECOVERY", label: "Advance recovery", kind: "DEDUCTION" as ComponentKind },
]

export function AdjustmentDialog({
  open,
  onOpenChange,
  employees,
  month,
  year,
  pending,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  employees: Array<{ id: string; fullName: string; employeeCode: string }>
  month: number
  year: number
  pending: boolean
  error: string | null
  onSubmit: (input: AdjustmentInput) => void
}) {
  const [employeeId, setEmployeeId] = useState("")
  const [preset, setPreset] = useState(COMMON_CODES[0].code)
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<Currency>("BDT")
  const [reason, setReason] = useState("")

  const chosen = COMMON_CODES.find((c) => c.code === preset) ?? COMMON_CODES[0]
  const canSubmit = employeeId && Number(amount) > 0 && reason.trim().length > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an adjustment</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="adj-employee" className="mb-1.5 text-xs font-bold">
              Employee
            </Label>
            <select
              id="adj-employee"
              className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
            >
              <option value="">Select an employee</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.fullName} ({e.employeeCode})
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label htmlFor="adj-kind" className="mb-1.5 text-xs font-bold">
              Type
            </Label>
            <select
              id="adj-kind"
              className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
              value={preset}
              onChange={(e) => setPreset(e.target.value)}
            >
              {COMMON_CODES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.label} ({c.kind === "EARNING" ? "adds" : "deducts"})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="adj-amount" className="mb-1.5 text-xs font-bold">
                Amount
              </Label>
              <Input
                id="adj-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="adj-currency" className="mb-1.5 text-xs font-bold">
                Currency
              </Label>
              {/* HR thinks in BDT; the server converts into the employee's
                  payment currency before it enters the payslip sum. */}
              <select
                id="adj-currency"
                className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                <option value="BDT">BDT</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div>
            <Label htmlFor="adj-reason" className="mb-1.5 text-xs font-bold">
              Reason (required)
            </Label>
            <Textarea
              id="adj-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="An unexplained line on someone's pay is a dispute waiting."
            />
          </div>

          {error ? <div className="text-[12.5px] text-[#B03A3A]">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={!canSubmit || pending}
            onClick={() =>
              onSubmit({
                employeeId,
                month,
                year,
                kind: chosen.kind,
                code: chosen.code,
                label: chosen.label,
                currency,
                amount: Number(amount),
                reason: reason.trim(),
              })
            }
          >
            Add adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
