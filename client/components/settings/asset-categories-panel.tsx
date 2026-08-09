"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import { DataTable } from "@/components/dashboard/data-table"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
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
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/api/assets"
import type { AssetCategory, CreateAssetCategoryInput } from "@/lib/api/types"
import { ConfirmDeleteDialog, PanelFrame, toMessage } from "./settings-shared"

export function AssetCategoriesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AssetCategory | "new" | null>(null)
  const [deleting, setDeleting] = useState<AssetCategory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => listCategories(accessToken),
  })

  const done = () => {
    setEditing(null)
    setDeleting(null)
    setError(null)
    queryClient.invalidateQueries({ queryKey: ["asset-categories"] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CreateAssetCategoryInput }) => {
      if (id === null) return createCategory(accessToken, input)
      const { code, ...rest } = input
      void code
      return updateCategory(accessToken, id, rest)
    },
    onSuccess: done,
    onError: (err) => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCategory(accessToken, id),
    onSuccess: done,
    onError: (err) => {
      setDeleting(null)
      setError(toMessage(err))
    },
  })

  return (
    <PanelFrame
      title="Asset categories"
      sub="What the register can hold. A category with assets or open requests against it cannot be deleted."
      actionLabel="Add category"
      onAction={() => {
        setError(null)
        setEditing("new")
      }}
      error={error}
    >
      <DataTable
        title=""
        action=""
        cols="1.2fr 0.8fr 0.8fr 0.9fr 0.8fr"
        headers={["Category", "Serial", "Consumable", "Useful life", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }, { text: "" }, { text: "" }, { text: "" }]]
            : categories.map((category) => [
                { text: category.name, sub: category.code, weight: 600 },
                { text: category.requiresSerial ? "Required" : "Not tracked" },
                { text: category.isConsumable ? "Yes" : "No" },
                {
                  text:
                    category.usefulLifeMonths === null
                      ? "—"
                      : `${category.usefulLifeMonths} months`,
                },
                {
                  node: (
                    <div className="flex gap-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[12px] font-bold underline"
                        onClick={() => {
                          setError(null)
                          setEditing(category)
                        }}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[12px] font-bold text-[#B03A3A] underline"
                        onClick={() => {
                          setError(null)
                          setDeleting(category)
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                  ),
                },
              ])
        }
      />

      {editing !== null ? (
        <AssetCategoryDialog
          category={editing === "new" ? null : editing}
          pending={saveMutation.isPending}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(input) =>
            saveMutation.mutate({ id: editing === "new" ? null : editing.id, input })
          }
        />
      ) : null}

      <ConfirmDeleteDialog
        open={deleting !== null}
        what={deleting?.name ?? ""}
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
      />
    </PanelFrame>
  )
}

function AssetCategoryDialog({
  category,
  pending,
  error,
  onClose,
  onSave,
}: {
  category: AssetCategory | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (input: CreateAssetCategoryInput) => void
}) {
  const [code, setCode] = useState(category?.code ?? "")
  const [name, setName] = useState(category?.name ?? "")
  const [requiresSerial, setRequiresSerial] = useState(category?.requiresSerial ?? true)
  const [isConsumable, setIsConsumable] = useState(category?.isConsumable ?? false)
  const [usefulLifeMonths, setUsefulLifeMonths] = useState(
    category?.usefulLifeMonths === null || category?.usefulLifeMonths === undefined
      ? ""
      : String(category.usefulLifeMonths)
  )

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : "Add an asset category"}</DialogTitle>
          <DialogDescription>
            Turning &ldquo;serial required&rdquo; on is refused while any asset in the category has
            no serial number.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="ac-code" className="mb-1.5 text-xs font-bold">
                Code
              </Label>
              <Input
                id="ac-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={category !== null}
                placeholder="DOCK"
              />
              {category ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">Fixed. Rules key off the code.</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="ac-name" className="mb-1.5 text-xs font-bold">
                Name
              </Label>
              <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          <div>
            <Label htmlFor="ac-life" className="mb-1.5 text-xs font-bold">
              Useful life (months)
            </Label>
            <Input
              id="ac-life"
              type="number"
              min={1}
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              placeholder="Not tracked"
            />
          </div>

          <div className="space-y-2">
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={requiresSerial}
                onCheckedChange={(v) => setRequiresSerial(v === true)}
              />
              Serial number required
            </label>
            <label className="flex items-center gap-2 text-[12.5px]">
              <Checkbox
                checked={isConsumable}
                onCheckedChange={(v) => setIsConsumable(v === true)}
              />
              Consumable — issued and not expected back
            </label>
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || name.trim().length === 0 || code.trim().length === 0}
              onClick={() =>
                onSave({
                  code: code.trim(),
                  name: name.trim(),
                  requiresSerial,
                  isConsumable,
                  usefulLifeMonths:
                    usefulLifeMonths.trim() === "" ? null : Number(usefulLifeMonths),
                })
              }
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {pending ? "Saving…" : category ? "Save" : "Add category"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
