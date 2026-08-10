"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createExchangeRate, listExchangeRates, updateExchangeRate } from "@/lib/api/payroll"
import type { ExchangeRate, ExchangeRateInput } from "@/lib/api/payroll-types"
import {
  DialogActions,
  Field,
  FormError,
  PanelFrame,
  PanelTable,
  RowActions,
  toMessage,
} from "./settings-shared"

export function ExchangeRatesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ExchangeRate | "new" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    data: rates = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
    queryKey: ["exchange-rates"],
    queryFn: () => listExchangeRates(accessToken),
  })

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: ExchangeRateInput }) =>
      id === null
        ? createExchangeRate(accessToken, input)
        : updateExchangeRate(accessToken, id, input),
    onSuccess: () => {
      setEditing(null)
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["exchange-rates"] })
    },
    onError: (err) => setError(toMessage(err)),
  })

  const add = () => {
    setError(null)
    setEditing("new")
  }

  return (
    <PanelFrame
      title="Exchange rates"
      sub="Payroll treats a missing rate as a hard failure and never falls back to 1.0."
      actionLabel="Add rate"
      onAction={add}
      error={error}
      onDismissError={() => setError(null)}
    >
      <PanelTable
        cols="1fr 1fr 1fr 0.7fr"
        headers={["Pair", "Rate", "Effective from", ""]}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle="No rates recorded"
        emptyBody="A payroll run covering anyone paid in USD will fail until a rate exists for the period."
        emptyAction="Add rate"
        onEmptyAction={add}
        rows={rates.map((rate) => [
          { text: `${rate.base} to ${rate.quote}`, weight: 600 },
          { text: rate.rate, sub: `1 ${rate.base} = ${rate.rate} ${rate.quote}` },
          { text: rate.effectiveFrom.slice(0, 10) },
          {
            node: (
              <RowActions
                actions={[
                  {
                    kind: "edit",
                    label: "Edit",
                    onClick: () => {
                      setError(null)
                      setEditing(rate)
                    },
                  },
                ]}
              />
            ),
          },
        ])}
      />

      {editing !== null ? (
        <RateDialog
          rate={editing === "new" ? null : editing}
          pending={saveMutation.isPending}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            saveMutation.mutate({ id: editing === "new" ? null : editing.id, input })
          }
        />
      ) : null}
    </PanelFrame>
  )
}

function RateDialog({
  rate,
  pending,
  error,
  onClose,
  onSave,
}: {
  rate: ExchangeRate | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (input: ExchangeRateInput) => void
}) {
  const [value, setValue] = useState(rate?.rate ?? "")
  const [effectiveFrom, setEffectiveFrom] = useState(rate?.effectiveFrom.slice(0, 10) ?? "")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{rate ? "Correct a rate" : "Add an exchange rate"}</DialogTitle>
          <DialogDescription>
            Stored in one direction only: 1 USD in BDT. The inverse is derived rather than stored,
            so a round trip cannot lose money. Editing a rate cannot corrupt history, because every
            payslip freezes the rate it used.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Field label="1 USD in BDT" htmlFor="rate-value">
            <Input
              id="rate-value"
              type="number"
              step="0.000001"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="122.5"
            />
          </Field>

          <Field
            label="Effective from"
            htmlFor="rate-from"
            hint={
              rate
                ? "Fixed. A rate is identified by its pair and effective date, so a different date is a new rate."
                : undefined
            }
          >
            <Input
              id="rate-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={rate !== null}
            />
          </Field>

          {error ? <FormError>{error}</FormError> : null}

          <DialogFooter>
            <DialogActions
              pending={pending}
              disabled={value.trim() === "" || effectiveFrom === ""}
              submitLabel={rate ? "Save" : "Add rate"}
              onCancel={onClose}
              onSubmit={() =>
                onSave({
                  base: "USD",
                  quote: "BDT",
                  rate: Number(value),
                  effectiveFrom,
                })
              }
            />
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
