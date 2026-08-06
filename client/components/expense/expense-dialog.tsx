"use client"

import { useState } from "react"

import type { Currency, ExpenseClaimInput } from "@/lib/api/types"
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

const CATEGORIES = ["Travel", "Accommodation", "Meals", "Equipment", "Training", "Other"]

const today = () => new Date().toISOString().slice(0, 10)

export function ExpenseDialog({
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  error: string | null
  onSubmit: (input: ExpenseClaimInput) => void
}) {
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<Currency>("BDT")
  const [category, setCategory] = useState(CATEGORIES[0])
  const [expenseDate, setExpenseDate] = useState(today())
  const [description, setDescription] = useState("")
  const [receiptUrl, setReceiptUrl] = useState("")

  const canSubmit = Number(amount) > 0 && !!expenseDate

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Claim an expense</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-amount" className="mb-1.5 text-xs font-bold">
                Amount
              </Label>
              <Input
                id="exp-amount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="exp-currency" className="mb-1.5 text-xs font-bold">
                Currency
              </Label>
              {/* The main real USD case: someone travels and pays in dollars
                  while drawing a BDT salary. */}
              <select
                id="exp-currency"
                className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Currency)}
              >
                <option value="BDT">BDT</option>
                <option value="USD">USD</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-category" className="mb-1.5 text-xs font-bold">
                Category
              </Label>
              <select
                id="exp-category"
                className="h-9 w-full rounded-md border border-[#E4E9EF] px-3 text-[13px]"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="exp-date" className="mb-1.5 text-xs font-bold">
                Spend date
              </Label>
              <Input
                id="exp-date"
                type="date"
                max={today()}
                value={expenseDate}
                onChange={(e) => setExpenseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="text-[11.5px] text-[#7A8698]">
            The exchange rate is frozen from the spend date, not from when the claim is approved.
          </div>

          <div>
            <Label htmlFor="exp-description" className="mb-1.5 text-xs font-bold">
              Description
            </Label>
            <Textarea
              id="exp-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div>
            <Label htmlFor="exp-receipt" className="mb-1.5 text-xs font-bold">
              Receipt URL
            </Label>
            <Input
              id="exp-receipt"
              value={receiptUrl}
              onChange={(e) => setReceiptUrl(e.target.value)}
              placeholder="https://…"
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
                amount: Number(amount),
                currency,
                category,
                expenseDate,
                description: description.trim() || undefined,
                receiptUrl: receiptUrl.trim() || undefined,
              })
            }
          >
            Submit claim
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
