"use client"

import { useState } from "react"

import type { Employee, SalaryStructure } from "@/lib/api/types"
import { formatMoney } from "@/lib/money"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"

/** Sentinel for "no structure" — a Select cannot hold a null value. */
const NONE = "__none__"

export function SalaryStructureDialog({
  employee,
  structures,
  pending,
  error,
  onOpenChange,
  onSubmit,
}: {
  employee: Employee | null
  structures: SalaryStructure[]
  pending: boolean
  error: string | null
  onOpenChange: (open: boolean) => void
  onSubmit: (salaryStructureId: string | null) => void
}) {
  const [selected, setSelected] = useState<string>(NONE)

  // Retired bands stay off the list: assigning to one would pay a rate
  // Finance has withdrawn. The server rejects it too (409).
  const assignable = structures.filter((s) => s.isActive)
  const chosen = assignable.find((s) => s.id === selected) ?? null

  return (
    <Dialog
      open={!!employee}
      onOpenChange={(open) => {
        if (!open) onOpenChange(false)
        else setSelected(employee?.salaryStructure?.id ?? NONE)
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Salary structure — {employee?.fullName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-[12.5px] text-[#7A8698]">
            Finance authors the structures; HR decides who sits on which. The change applies to the
            next payroll run — months already paid keep the figures they were paid on.
          </div>

          <div>
            <Label htmlFor="structure" className="mb-1.5 text-xs font-bold">
              Structure
            </Label>
            <select
              id="structure"
              className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value={NONE}>No structure</option>
              {assignable.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} · {s.currency}
                </option>
              ))}
            </select>
          </div>

          {/* The band's actual money, so the choice is not made on a name. */}
          {chosen ? (
            <div className="rounded-md border border-[#E4E9EF] bg-[#F8FAFC] px-4 py-3">
              <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">
                Basic
              </div>
              <div className="font-heading text-[17px] font-bold">
                {formatMoney(chosen.basic, chosen.currency)}
              </div>
              <div className="mt-1.5 space-y-0.5">
                {chosen.components.map((c) => (
                  <div key={c.id} className="flex justify-between text-[12px]">
                    <span className={c.kind === "DEDUCTION" ? "text-[#B03A3A]" : ""}>{c.label}</span>
                    <span>
                      {c.calc === "PERCENT_OF_BASIC"
                        ? `${c.value}% of basic`
                        : formatMoney(c.value, chosen.currency)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-md border border-[#F5E3C0] bg-[#FDF9F0] px-4 py-3 text-[12.5px] text-[#7A5B23]">
              With no structure this employee blocks every payroll run they fall into — preflight
              names them rather than paying them nothing.
            </div>
          )}

          {error ? <div className="text-[12.5px] text-[#B03A3A]">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button
            disabled={pending}
            onClick={() => onSubmit(selected === NONE ? null : selected)}
          >
            {pending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
