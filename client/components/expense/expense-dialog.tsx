"use client"

import { useMemo, useState } from "react"

import type { Currency, ExpenseCategory, ExpenseClaimInput } from "@/lib/api/types"
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

const today = () => new Date().toISOString().slice(0, 10)

export function ExpenseDialog({
  open,
  onOpenChange,
  pending,
  error,
  onSubmit,
  categories,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pending: boolean
  error: string | null
  onSubmit: (input: ExpenseClaimInput) => void
  categories: ExpenseCategory[]
}) {
  const [amount, setAmount] = useState("")
  const [currency, setCurrency] = useState<Currency>("BDT")
  // Without `items`, Base UI's Select shows the category's uuid on the
  // closed trigger instead of its name.
  const categoryItems = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.id, c.name])),
    [categories]
  )

  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? "")
  const [expenseDate, setExpenseDate] = useState(today())
  const [description, setDescription] = useState("")
  const [receiptUrl, setReceiptUrl] = useState("")

  const canSubmit = Number(amount) > 0 && !!expenseDate && !!categoryId

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
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger id="exp-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">BDT</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="exp-category" className="mb-1.5 text-xs font-bold">
                Category
              </Label>
               <Select
                items={categoryItems}
                value={categoryId}
                onValueChange={(value) => value && setCategoryId(value)}
              >
                <SelectTrigger id="exp-category" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
                 categoryId,
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
