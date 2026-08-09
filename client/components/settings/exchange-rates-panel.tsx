"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { DataTable } from "@/components/dashboard/data-table"
import { Button } from "@/components/ui/button"
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
import { createExchangeRate, listExchangeRates, updateExchangeRate } from "@/lib/api/payroll"
import type { ExchangeRate, ExchangeRateInput } from "@/lib/api/payroll-types"
import { PanelFrame, toMessage } from "./settings-shared"

export function ExchangeRatesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<ExchangeRate | "new" | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: rates = [], isLoading } = useQuery({
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

  return (
    <PanelFrame
      title="Exchange rates"
      sub="Payroll treats a missing rate as a hard failure and never falls back to 1.0."
      actionLabel="Add rate"
      onAction={() => {
        setError(null)
        setEditing("new")
      }}
      error={error}
    >
      <DataTable
        title=""
        action=""
        cols="1fr 1fr 1fr 0.7fr"
        headers={["Pair", "Rate", "Effective from", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }, { text: "" }, { text: "" }]]
            : rates.map((rate) => [
                { text: `${rate.base} → ${rate.quote}`, weight: 600 },
                { text: rate.rate, sub: `1 ${rate.base} = ${rate.rate} ${rate.quote}` },
                { text: rate.effectiveFrom.slice(0, 10) },
                {
                  node: (
                    <Button
                      variant="link"
                      className="h-auto p-0 text-[12px] font-bold underline"
                      onClick={() => {
                        setError(null)
                        setEditing(rate)
                      }}
                    >
                      Edit
                    </Button>
                  ),
                },
              ])
        }
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
            Stored in one direction only — 1 USD in BDT. The inverse is derived rather than stored,
            so a round trip cannot lose money. Editing a rate cannot corrupt history: every payslip
            freezes the rate it used.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="rate-value" className="mb-1.5 text-xs font-bold">
              1 USD in BDT
            </Label>
            <Input
              id="rate-value"
              type="number"
              step="0.000001"
              min={0}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="122.5"
            />
          </div>
          <div>
            <Label htmlFor="rate-from" className="mb-1.5 text-xs font-bold">
              Effective from
            </Label>
            <Input
              id="rate-from"
              type="date"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              disabled={rate !== null}
            />
            {rate ? (
              <p className="mt-1 text-[11.5px] text-[#6B7683]">
                Fixed — a rate is identified by its pair and effective date. A different date is a
                new rate.
              </p>
            ) : null}
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || value.trim() === "" || effectiveFrom === ""}
              onClick={() =>
                onSave({
                  base: "USD",
                  quote: "BDT",
                  rate: Number(value),
                  effectiveFrom,
                })
              }
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {pending ? "Saving…" : rate ? "Save" : "Add rate"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
