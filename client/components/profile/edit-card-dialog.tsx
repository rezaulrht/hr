"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { updateEmployee } from "@/lib/api/employees"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { EmployeeView, UpdateEmployeeInput } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

export interface EditField {
  key: string
  label: string
  /** "date" renders a YYYY-MM-DD input; the API expects that exact format. */
  kind?: "text" | "date"
}

/**
 * Per-card field lists.
 *
 * Per-card rather than one page-wide edit mode for two reasons: a single form
 * over twenty fields is a form people abandon, and a scoped PATCH body means
 * the audit before/after records a coherent change ("bank details updated")
 * rather than a diff of everything on the page.
 */
export const CARD_FIELDS: Record<string, EditField[]> = {
  Personal: [
    { key: "fullName", label: "Full name" },
    { key: "dateOfBirth", label: "Date of birth", kind: "date" },
    { key: "gender", label: "Gender" },
    { key: "nationalId", label: "National ID" },
    { key: "bloodGroup", label: "Blood group" },
    { key: "maritalStatus", label: "Marital status" },
  ],
  Contact: [
    { key: "phone", label: "Phone" },
    { key: "presentAddress", label: "Present address" },
    { key: "permanentAddress", label: "Permanent address" },
    { key: "emergencyContact", label: "Emergency contact" },
  ],
  Employment: [
    { key: "designation", label: "Designation" },
    { key: "officeLocation", label: "Office location" },
    { key: "deviceUserId", label: "Device enrolment ID" },
  ],
  Payroll: [
    { key: "bankName", label: "Bank" },
    { key: "bankAccountNumber", label: "Account number" },
    { key: "bankRoutingNumber", label: "Routing number" },
  ],
}

function currentValue(employee: EmployeeView, key: string): string {
  const groups: Record<string, unknown>[] = [
    employee.work as unknown as Record<string, unknown>,
    (employee.personal ?? {}) as unknown as Record<string, unknown>,
    (employee.contact ?? {}) as unknown as Record<string, unknown>,
    (employee.employment ?? {}) as unknown as Record<string, unknown>,
    (employee.payroll ?? {}) as unknown as Record<string, unknown>,
  ]
  for (const group of groups) {
    const value = group[key]
    if (typeof value === "string") return value
  }
  return ""
}

/**
 * Mounted only while the dialog is open, same as `EditMyDetailsDialog`'s
 * `EditForm`: unmounting is how React already expresses "start over", so a
 * fresh open re-seeds from the current employee via `useState`'s initializer
 * rather than an effect that re-seeds on `open` (the shape
 * `react-hooks/set-state-in-effect` exists to catch).
 */
function EditForm({
  employee,
  title,
  fields,
  onOpenChange,
  onSaved,
}: {
  employee: EmployeeView
  title: string
  fields: EditField[]
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const { accessToken } = useSession()

  // Offered if and only if the server said this caller may write it.
  const offered = fields.filter((f) => employee.editableFields.includes(f.key))

  const [values, setValues] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {}
    for (const field of offered) seed[field.key] = currentValue(employee, field.key)
    return seed
  })
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (input: UpdateEmployeeInput) => updateEmployee(accessToken!, employee.id, input),
    onSuccess: () => {
      onOpenChange(false)
      onSaved()
    },
    onError: (err) => {
      // Surface the server's message verbatim — it names every forbidden
      // field on a 403, or the real validation failure on a 400.
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    const input: Record<string, string | null> = {}
    for (const field of offered) {
      const next = (values[field.key] ?? "").trim()
      // An emptied field is an explicit clear, which the API expresses as
      // null. Sending "" would fail the server's min(1) validator.
      input[field.key] = next === "" ? null : next
    }
    mutation.mutate(input as UpdateEmployeeInput)
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>Edit {title.toLowerCase()}</DialogTitle>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="space-y-4">
        {offered.map((field) => (
          <div key={field.key}>
            <Label htmlFor={field.key} className="mb-1.5 text-xs font-bold">
              {field.label}
            </Label>
            <Input
              id={field.key}
              type={field.kind === "date" ? "date" : "text"}
              value={values[field.key] ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, [field.key]: e.target.value }))}
            />
          </div>
        ))}
        {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
        <DialogFooter>
          <Button
            type="submit"
            disabled={mutation.isPending}
            className="bg-[#17191C] text-white hover:bg-[#0E1012]"
          >
            {mutation.isPending ? "Saving…" : "Save changes"}
          </Button>
        </DialogFooter>
      </form>
    </>
  )
}

export function EditCardDialog({
  employee,
  title,
  fields,
  open,
  onOpenChange,
  onSaved,
}: {
  employee: EmployeeView
  title: string
  fields: EditField[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {/* Mounted only while open — see EditForm's comment. */}
        {open ? (
          <EditForm
            employee={employee}
            title={title}
            fields={fields}
            onOpenChange={onOpenChange}
            onSaved={onSaved}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
