"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { createAsset, listCategories } from "@/lib/api/assets"
import { listDepartments } from "@/lib/api/departments"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { Currency } from "@/lib/api/types"
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

/**
 * The one path to a register entry the import wizard does not cover — a
 * single asset HR just bought. Only category and name are required; every
 * acquisition field the server accepts (purchase date/cost/currency, vendor,
 * warranty, department, location, model, notes) is here but optional.
 *
 * The serial number is the one field whose requirement depends on the chosen
 * category (`AssetCategory.requiresSerial`) — asked for up front rather than
 * left for the 400 to explain, matching `asset.import.ts`'s row validator,
 * which enforces the identical rule on import.
 */
export function CreateAssetDialog({
  open,
  onOpenChange,
  onSuccess,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}) {
  const { accessToken } = useSession()
  const queryClient = useQueryClient()

  const [categoryId, setCategoryId] = useState("")
  const [name, setName] = useState("")
  const [serialNumber, setSerialNumber] = useState("")
  const [model, setModel] = useState("")
  const [purchaseDate, setPurchaseDate] = useState("")
  const [purchaseCost, setPurchaseCost] = useState("")
  const [currency, setCurrency] = useState<Currency>("BDT")
  const [vendor, setVendor] = useState("")
  const [warrantyExpiry, setWarrantyExpiry] = useState("")
  const [departmentId, setDepartmentId] = useState("")
  const [location, setLocation] = useState("")
  const [notes, setNotes] = useState("")
  const [formError, setFormError] = useState<string | null>(null)

  const categoriesQuery = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => listCategories(accessToken!),
    enabled: open,
  })

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartments(accessToken!),
    enabled: open,
  })

  const selectedCategory = categoriesQuery.data?.find((c) => c.id === categoryId)
  const serialRequired = !!selectedCategory?.requiresSerial

  function resetForm() {
    setCategoryId("")
    setName("")
    setSerialNumber("")
    setModel("")
    setPurchaseDate("")
    setPurchaseCost("")
    setCurrency("BDT")
    setVendor("")
    setWarrantyExpiry("")
    setDepartmentId("")
    setLocation("")
    setNotes("")
    setFormError(null)
  }

  function handleOpenChange(next: boolean) {
    if (!next) resetForm()
    onOpenChange(next)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      createAsset(accessToken!, {
        categoryId,
        name: name.trim(),
        serialNumber: serialNumber.trim() || undefined,
        model: model.trim() || undefined,
        notes: notes.trim() || undefined,
        purchaseDate: purchaseDate || undefined,
        purchaseCost: purchaseCost ? Number(purchaseCost) : undefined,
        currency,
        vendor: vendor.trim() || undefined,
        warrantyExpiry: warrantyExpiry || undefined,
        departmentId: departmentId || undefined,
        location: location.trim() || undefined,
      }),
    onSuccess: () => {
      resetForm()
      onOpenChange(false)
      // Enriched fields (category name, computed status) come from the next
      // `listAssets` read, never from this response.
      queryClient.invalidateQueries({ queryKey: ["assets"] })
      onSuccess()
    },
    onError: (err) => {
      setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
    },
  })

  const canSubmit =
    !!categoryId && name.trim().length > 0 && (!serialRequired || serialNumber.trim().length > 0)

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add an asset</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label className="mb-1.5 text-xs font-bold">Category</Label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? "")}>
                <SelectTrigger className="w-full">
                  <SelectValue>
                    {(v: string | null) =>
                      categoriesQuery.data?.find((c) => c.id === v)?.name ?? "Select a category"
                    }
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-name" className="mb-1.5 text-xs font-bold">
                Name
              </Label>
              <Input id="asset-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="asset-serial" className="mb-1.5 text-xs font-bold">
              Serial number{" "}
              <span className="font-normal text-muted-foreground">
                {serialRequired ? `(required for ${selectedCategory!.name})` : "(optional)"}
              </span>
            </Label>
            <Input
              id="asset-serial"
              value={serialNumber}
              onChange={(e) => setSerialNumber(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="asset-model" className="mb-1.5 text-xs font-bold">
                Model <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="asset-model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="asset-location" className="mb-1.5 text-xs font-bold">
                Location <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="asset-location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
          </div>

          <div>
            <Label className="mb-1.5 text-xs font-bold">
              Department <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Select value={departmentId} onValueChange={(v) => setDepartmentId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue>
                  {(v: string | null) =>
                    departmentsQuery.data?.find((d) => d.id === v)?.name ?? "No department"
                  }
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(departmentsQuery.data ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <Label htmlFor="asset-cost" className="mb-1.5 text-xs font-bold">
                Purchase cost <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="asset-cost"
                type="number"
                min="0"
                step="0.01"
                value={purchaseCost}
                onChange={(e) => setPurchaseCost(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="asset-currency" className="mb-1.5 text-xs font-bold">
                Currency
              </Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Currency)}>
                <SelectTrigger id="asset-currency" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BDT">BDT</SelectItem>
                  <SelectItem value="USD">USD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-purchase-date" className="mb-1.5 text-xs font-bold">
                Purchase date <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="asset-purchase-date"
                type="date"
                value={purchaseDate}
                onChange={(e) => setPurchaseDate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="asset-vendor" className="mb-1.5 text-xs font-bold">
                Vendor <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input id="asset-vendor" value={vendor} onChange={(e) => setVendor(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="asset-warranty" className="mb-1.5 text-xs font-bold">
                Warranty expiry <span className="font-normal text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="asset-warranty"
                type="date"
                value={warrantyExpiry}
                onChange={(e) => setWarrantyExpiry(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label htmlFor="asset-notes" className="mb-1.5 text-xs font-bold">
              Notes <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Textarea id="asset-notes" value={notes} maxLength={2000} onChange={(e) => setNotes(e.target.value)} />
          </div>

          {formError ? <p className="text-[13px] font-semibold text-destructive">{formError}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={createMutation.isPending}>
            Cancel
          </Button>
          <Button disabled={!canSubmit || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? "Adding…" : "Add asset"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
