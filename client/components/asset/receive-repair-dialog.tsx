"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { receiveFromRepair } from "@/lib/api/assets"
import { useSession } from "@/lib/auth/session-context"
import type { AssetCondition, AssetRepair, Currency } from "@/lib/api/types"
import { CONDITION_LABEL, formatAssetDate } from "@/components/asset/asset-shared"
import { DialogActions, Field, FormError, toMessage } from "@/components/dashboard/record-kit"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

const CONDITIONS: AssetCondition[] = ["NEW", "GOOD", "FAIR", "DAMAGED"]
const CURRENCIES: Currency[] = ["BDT", "USD"]

/**
 * Booking an asset back in from the vendor.
 *
 * `PATCH /api/assets/repairs/:id/receive` and its client function both
 * existed with no caller, which made the repair flow one-way: an asset could
 * be sent out and then stayed IN_REPAIR forever, unavailable to assign and
 * permanently listed under open repairs.
 *
 * Every field is optional on the server. Cost is the one worth pressing for,
 * since a repair nobody prices is a cost that never reaches the asset's
 * total, so it is asked for first and left explicitly skippable rather than
 * being quietly defaulted to zero.
 */
export function ReceiveRepairDialog({
  repair,
  onOpenChange,
  onSuccess,
}: {
  repair: AssetRepair | null
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  return (
    <Dialog open={!!repair} onOpenChange={(next) => !next && onOpenChange(false)}>
      <DialogContent>
        {repair ? (
          <ReceiveForm repair={repair} onOpenChange={onOpenChange} onSuccess={onSuccess} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ReceiveForm({
  repair,
  onOpenChange,
  onSuccess,
}: {
  repair: AssetRepair
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { accessToken } = useSession()
  const [cost, setCost] = useState("")
  const [currency, setCurrency] = useState<Currency>("BDT")
  const [outcome, setOutcome] = useState("")
  const [conditionAfter, setConditionAfter] = useState<AssetCondition>("GOOD")
  const [error, setError] = useState<string | null>(null)

  const receiveMutation = useMutation({
    mutationFn: () =>
      receiveFromRepair(accessToken!, repair.id, {
        // Omitted rather than sent as 0. A repair with no recorded cost and a
        // repair that genuinely cost nothing are different facts, and the
        // server treats an absent key as the first.
        ...(cost.trim() !== "" ? { cost: Number(cost), currency } : {}),
        ...(outcome.trim() !== "" ? { outcome: outcome.trim() } : {}),
        conditionAfter,
      }),
    onSuccess: () => {
      onOpenChange(false)
      onSuccess()
    },
    onError: (err) => setError(toMessage(err)),
  })

  const costInvalid = cost.trim() !== "" && (Number.isNaN(Number(cost)) || Number(cost) < 0)

  return (
    <>
      <DialogHeader>
        <DialogTitle>Book this asset back in</DialogTitle>
        <DialogDescription>
          {repair.asset ? `${repair.asset.assetTag} · ${repair.asset.name}` : repair.assetId}, sent{" "}
          {formatAssetDate(repair.sentAt)}
          {repair.vendor ? ` to ${repair.vendor}` : ""}. Receiving it returns the asset to the
          register as available.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Repair cost"
            htmlFor="repair-cost"
            hint={repair.isWarranty ? "Under warranty, so this is usually nothing." : "Leave blank if not known yet."}
          >
            <Input
              id="repair-cost"
              inputMode="decimal"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              placeholder="0.00"
            />
          </Field>

          <Field label="Currency">
            <Select
              value={currency}
              onValueChange={(v) => setCurrency((v as Currency) ?? "BDT")}
            >
              <SelectTrigger className="w-full" disabled={cost.trim() === ""}>
                <SelectValue>{() => currency}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <Field label="Condition it came back in" hint="What the asset is worth handing to somebody else.">
          <Select
            value={conditionAfter}
            onValueChange={(v) => setConditionAfter((v as AssetCondition) ?? "GOOD")}
          >
            <SelectTrigger className="w-full">
              <SelectValue>{() => CONDITION_LABEL[conditionAfter]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((c) => (
                <SelectItem key={c} value={c}>
                  {CONDITION_LABEL[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field
          label="What was done"
          htmlFor="repair-outcome"
          hint="Optional. The next person to read this record will not have spoken to the vendor."
        >
          <Input
            id="repair-outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            placeholder="Screen replaced under warranty"
          />
        </Field>

        {costInvalid ? <FormError>The repair cost must be a number, and not negative.</FormError> : null}
        {error ? <FormError>{error}</FormError> : null}
      </div>

      <DialogFooter>
        <DialogActions
          pending={receiveMutation.isPending}
          submitLabel="Book back in"
          disabled={costInvalid}
          onCancel={() => onOpenChange(false)}
          onSubmit={() => receiveMutation.mutate()}
        />
      </DialogFooter>
    </>
  )
}
