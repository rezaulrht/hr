"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { ApiError } from "@/lib/api/client"
import {
  createSalaryStructure,
  deleteSalaryStructure,
  listSalaryStructures,
  updateSalaryStructure,
} from "@/lib/api/payroll"
import { useSession } from "@/lib/auth/session-context"
import type {
  ComponentCalc,
  ComponentKind,
  Currency,
  SalaryStructure,
  SalaryStructureInput,
} from "@/lib/api/types"
import { formatMoney } from "@/lib/money"
import { PageHeader } from "@/components/dashboard/page-header"
import { Tag } from "@/components/dashboard/tag"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { FINANCE_ROLES } from "@/components/payroll/payroll-shared"

/** A component row while it is being edited — strings, so a field can be empty. */
interface DraftComponent {
  code: string
  label: string
  kind: ComponentKind
  calc: ComponentCalc
  value: string
}

interface Draft {
  id: string | null
  name: string
  currency: Currency
  basic: string
  isActive: boolean
  components: DraftComponent[]
}

const BLANK_COMPONENT: DraftComponent = {
  code: "",
  label: "",
  kind: "EARNING",
  calc: "FIXED",
  value: "",
}

/**
 * A new structure starts flat: a name and a monthly salary, nothing else.
 *
 * That is how private-sector pay in Bangladesh is normally agreed — one
 * negotiated figure. Allowances and deductions exist for the workplaces that
 * split pay, but they are opt-in and start closed, so the common case is two
 * fields rather than a table.
 */
const BLANK_DRAFT: Draft = {
  id: null,
  name: "",
  currency: "BDT",
  basic: "",
  isActive: true,
  components: [],
}

function toDraft(structure: SalaryStructure): Draft {
  return {
    id: structure.id,
    name: structure.name,
    currency: structure.currency,
    basic: structure.basic,
    isActive: structure.isActive,
    components: structure.components.map((c) => ({
      code: c.code,
      label: c.label,
      kind: c.kind,
      calc: c.calc,
      value: c.value,
    })),
  }
}

function toInput(draft: Draft): SalaryStructureInput {
  return {
    name: draft.name.trim(),
    currency: draft.currency,
    basic: Number(draft.basic),
    isActive: draft.isActive,
    components: draft.components.map((c, i) => ({
      code: c.code.trim().toUpperCase(),
      label: c.label.trim(),
      kind: c.kind,
      calc: c.calc,
      value: Number(c.value),
      sortOrder: i,
    })),
  }
}

/**
 * The gross a structure produces at a full month, shown live while editing.
 *
 * Mirrors `computePayslip`'s earnings side only — it is a preview to catch a
 * percentage typed as 50 instead of 5, not a second implementation of payroll.
 * The server's figure is the one that gets paid.
 */
function previewGross(draft: Draft): { gross: number; deductions: number } {
  const basic = Number(draft.basic) || 0
  let gross = basic
  let deductions = 0
  for (const c of draft.components) {
    const raw = Number(c.value) || 0
    const amount = c.calc === "PERCENT_OF_BASIC" ? (basic * raw) / 100 : raw
    if (c.kind === "EARNING") gross += amount
    else deductions += amount
  }
  return { gross, deductions }
}

function StructureCard({
  structure,
  canWrite,
  confirming,
  deleting,
  onEdit,
  onAskDelete,
  onCancelDelete,
  onConfirmDelete,
}: {
  structure: SalaryStructure
  canWrite: boolean
  confirming: boolean
  deleting: boolean
  onEdit: () => void
  onAskDelete: () => void
  onCancelDelete: () => void
  onConfirmDelete: () => void
}) {
  const earnings = structure.components.filter((c) => c.kind === "EARNING").length
  const deductions = structure.components.length - earnings

  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div className="text-[15px] font-bold">{structure.name}</div>
            {structure.isActive ? null : <Tag label="Inactive" tone="neutral" />}
          </div>
          <div className="mt-1 text-[12.5px] text-[#7A8698]">
            {structure.components.length === 0
              ? `${formatMoney(structure.basic, structure.currency)} per month`
              : `Basic ${formatMoney(structure.basic, structure.currency)} · ${earnings} earning${
                  earnings === 1 ? "" : "s"
                }, ${deductions} deduction${deductions === 1 ? "" : "s"}`}
          </div>
        </div>
        {canWrite ? (
          <div className="flex shrink-0 gap-3">
            <Button variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline" onClick={onEdit}>
              Edit
            </Button>
            <Button
              variant="link" className="h-auto p-0 text-[12.5px] font-semibold text-[#B03A3A] underline"
              onClick={onAskDelete}
            >
              Delete
            </Button>
          </div>
        ) : null}
      </div>

      {/* Confirmed in place rather than in a modal: the thing being deleted
          stays on screen, including the figure it pays. */}
      {confirming ? (
        <div className="mt-3 rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-4 py-3">
          <div className="text-[12.5px] text-[#7A2B2B]">
            Delete <strong>{structure.name}</strong>? Payslips already issued on it keep their own
            figures and are unaffected.
          </div>
          <div className="mt-2.5 flex gap-2">
            <Button
              className="bg-[#B03A3A] text-white hover:bg-[#8F2E2E]"
              disabled={deleting}
              onClick={onConfirmDelete}
            >
              {deleting ? "Deleting…" : "Delete"}
            </Button>
            <Button variant="outline" disabled={deleting} onClick={onCancelDelete}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}

      <div
        className={
          structure.components.length === 0
            ? "hidden"
            : "mt-3 space-y-0.5 border-t border-[#EEF1F5] pt-3"
        }
      >
        {structure.components.map((c) => (
          <div key={c.id} className="flex justify-between text-[12.5px]">
            <span className={c.kind === "DEDUCTION" ? "text-[#B03A3A]" : ""}>
              {c.label} <span className="text-[#A5AFBE]">({c.code})</span>
            </span>
            <span>
              {c.calc === "PERCENT_OF_BASIC"
                ? `${c.value}% of basic`
                : formatMoney(c.value, structure.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function SalaryStructuresPage() {
  const { accessToken, user, status } = useSession()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingId, setConfirmingId] = useState<string | null>(null)

  const isAuthed = status === "authenticated" && !!accessToken
  const canWrite = !!user && FINANCE_ROLES.includes(user.role)

  const structuresQuery = useQuery({
    queryKey: ["salary-structures"],
    queryFn: () => listSalaryStructures(accessToken!),
    enabled: isAuthed,
  })

  const saveMutation = useMutation({
    mutationFn: (d: Draft) =>
      d.id
        ? updateSalaryStructure(accessToken!, d.id, toInput(d))
        : createSalaryStructure(accessToken!, toInput(d)),
    onSuccess: () => {
      setDraft(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] })
      // The employee directory prints structure names, so it is now stale.
      queryClient.invalidateQueries({ queryKey: ["employees"] })
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again."),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteSalaryStructure(accessToken!, id),
    onSuccess: () => {
      setConfirmingId(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["salary-structures"] })
    },
    onError: (err) => {
      setConfirmingId(null)
      setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  if (!isAuthed) return <Skeleton className="h-64 w-full" />

  const structures = structuresQuery.data ?? []

  function patch(changes: Partial<Draft>) {
    setDraft((d) => (d ? { ...d, ...changes } : d))
  }

  function patchComponent(index: number, changes: Partial<DraftComponent>) {
    setDraft((d) =>
      d
        ? {
            ...d,
            components: d.components.map((c, i) => (i === index ? { ...c, ...changes } : c)),
          }
        : d
    )
  }

  const preview = draft ? previewGross(draft) : null

  return (
    <>
      <PageHeader
        kicker="Configuration"
        title="Salary structures"
        sub="The pay bands every payslip is computed from"
      />

      {error ? (
        <div className="mb-4 rounded-md border border-[#F0D9D9] bg-[#FDF6F6] px-5 py-3.5 text-[12.5px] text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      <div className="space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[13px] text-[#7A8698]">
            Finance authors these; HR assigns employees to them from the employee directory.
          </div>
          {canWrite && !draft ? (
            <Button onClick={() => setDraft({ ...BLANK_DRAFT, components: [{ ...BLANK_COMPONENT }] })}>
              New structure
            </Button>
          ) : null}
        </div>

        {draft ? (
          <div className="space-y-4 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
            <div className="font-heading text-[16px] font-bold">
              {draft.id ? "Edit structure" : "New structure"}
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <Label htmlFor="s-name" className="mb-1.5 text-xs font-bold">
                  Name
                </Label>
                <Input
                  id="s-name"
                  value={draft.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  placeholder="Standard (BDT)"
                />
              </div>
              <div>
                <Label htmlFor="s-currency" className="mb-1.5 text-xs font-bold">
                  Currency
                </Label>
                <Select
                  value={draft.currency}
                  // Immutable after creation: changing it silently
                  // re-denominates every figure already on the structure.
                  disabled={!!draft.id}
                  onValueChange={(v) => patch({ currency: v as Currency })}
                >
                  <SelectTrigger id="s-currency" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BDT">BDT</SelectItem>
                    <SelectItem value="USD">USD</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="s-basic" className="mb-1.5 text-xs font-bold">
                  {/* "Basic" only means something once pay is split. With no
                      components it is simply the salary. */}
                  {draft.components.length > 0 ? "Basic" : "Monthly salary"}
                </Label>
                <Input
                  id="s-basic"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.basic}
                  onChange={(e) => patch({ basic: e.target.value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="s-active"
                nativeButton
                render={<button type="button" />}
                checked={draft.isActive}
                onCheckedChange={(v) => patch({ isActive: v })}
              />
              <Label htmlFor="s-active" className="text-[12.5px] font-normal">
                Active — inactive structures cannot be assigned to anyone new
              </Label>
            </div>

            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-semibold">
                    Allowances and deductions{" "}
                    <span className="font-normal text-[#A5AFBE]">· optional</span>
                  </div>
                  {draft.components.length === 0 ? (
                    <div className="mt-0.5 text-[11.5px] text-[#7A8698]">
                      Leave this empty for a flat monthly salary — the usual case.
                    </div>
                  ) : null}
                </div>
                <Button
                  variant="link" className="h-auto p-0 text-[12.5px] font-semibold underline"
                  onClick={() =>
                    patch({ components: [...draft.components, { ...BLANK_COMPONENT }] })
                  }
                >
                  {draft.components.length === 0 ? "Split this salary" : "Add another"}
                </Button>
              </div>

              <div className="space-y-2">
                {draft.components.map((c, i) => (
                  <div key={i} className="grid gap-2 sm:grid-cols-[0.8fr_1.2fr_0.8fr_1fr_0.8fr_auto]">
                    <Input
                      value={c.code}
                      onChange={(e) => patchComponent(i, { code: e.target.value })}
                      placeholder="CODE"
                    />
                    <Input
                      value={c.label}
                      onChange={(e) => patchComponent(i, { label: e.target.value })}
                      placeholder="Label"
                    />
                    <Select
                      value={c.kind}
                      onValueChange={(v) => patchComponent(i, { kind: v as ComponentKind })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="EARNING">Earning</SelectItem>
                        <SelectItem value="DEDUCTION">Deduction</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select
                      value={c.calc}
                      onValueChange={(v) => patchComponent(i, { calc: v as ComponentCalc })}
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="FIXED">Fixed</SelectItem>
                        <SelectItem value="PERCENT_OF_BASIC">% of basic</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={c.value}
                      onChange={(e) => patchComponent(i, { value: e.target.value })}
                      placeholder={c.calc === "PERCENT_OF_BASIC" ? "%" : "Amount"}
                    />
                    {/* Removing the last one is allowed — that is how a split
                        salary goes back to being a flat one. */}
                    <Button
                      variant="link" className="h-auto p-0 text-[12.5px] font-semibold text-[#B03A3A]"
                      onClick={() =>
                        patch({ components: draft.components.filter((_, j) => j !== i) })
                      }
                    >
                      Remove
                    </Button>
                  </div>
                ))}
              </div>
            </div>

            {/* Catches a percentage typed as 50 instead of 5 before it
                reaches a payslip, where preflight would only call it a
                negative net pay. */}
            {preview && draft.components.length === 0 ? (
              <div className="rounded-md bg-[#F5F7FA] px-4 py-3 text-[12.5px]">
                <span className="text-[#7A8698]">Take-home at a full month: </span>
                <span className="font-semibold">
                  {formatMoney(preview.gross.toFixed(2), draft.currency)}
                </span>
              </div>
            ) : preview ? (
              <div className="flex flex-wrap gap-6 rounded-md bg-[#F5F7FA] px-4 py-3 text-[12.5px]">
                <div>
                  <span className="text-[#7A8698]">Gross at a full month: </span>
                  <span className="font-semibold">
                    {formatMoney(preview.gross.toFixed(2), draft.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-[#7A8698]">Deductions: </span>
                  <span className="font-semibold">
                    {formatMoney(preview.deductions.toFixed(2), draft.currency)}
                  </span>
                </div>
                <div>
                  <span className="text-[#7A8698]">Net: </span>
                  <span
                    className={`font-semibold ${
                      preview.gross - preview.deductions < 0 ? "text-[#B03A3A]" : ""
                    }`}
                  >
                    {formatMoney((preview.gross - preview.deductions).toFixed(2), draft.currency)}
                  </span>
                </div>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button
                disabled={saveMutation.isPending || !draft.name.trim() || !draft.basic}
                onClick={() => saveMutation.mutate(draft)}
              >
                {saveMutation.isPending ? "Saving…" : "Save structure"}
              </Button>
              <Button variant="outline" onClick={() => setDraft(null)} disabled={saveMutation.isPending}>
                Cancel
              </Button>
            </div>
          </div>
        ) : null}

        {structuresQuery.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : structuresQuery.isError ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
            Failed to load salary structures.{" "}
            <Button variant="link" className="h-auto p-0 font-semibold underline" onClick={() => structuresQuery.refetch()}>
              Retry
            </Button>
          </div>
        ) : structures.length === 0 ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#7A8698]">
            No salary structures yet. Payroll cannot run until at least one exists.
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {structures.map((s) => (
              <StructureCard
                key={s.id}
                structure={s}
                canWrite={canWrite}
                confirming={confirmingId === s.id}
                deleting={deleteMutation.isPending}
                onEdit={() => {
                  setError(null)
                  setConfirmingId(null)
                  setDraft(toDraft(s))
                }}
                onAskDelete={() => {
                  setError(null)
                  setConfirmingId(s.id)
                }}
                onCancelDelete={() => setConfirmingId(null)}
                onConfirmDelete={() => deleteMutation.mutate(s.id)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  )
}
