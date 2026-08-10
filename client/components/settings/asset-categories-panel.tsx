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
import { createCategory, deleteCategory, listCategories, updateCategory } from "@/lib/api/assets"
import type { AssetCategory, CreateAssetCategoryInput } from "@/lib/api/types"
import {
  CheckboxField,
  ConfirmDeleteDialog,
  DialogActions,
  Field,
  FormError,
  PanelFrame,
  PanelTable,
  RowActions,
  toMessage,
} from "@/components/dashboard/record-kit"

export function AssetCategoriesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<AssetCategory | "new" | null>(null)
  const [deleting, setDeleting] = useState<AssetCategory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const {
    data: categories = [],
    isLoading,
    isError,
    refetch,
  } = useQuery({
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

  const add = () => {
    setError(null)
    setEditing("new")
  }

  return (
    <PanelFrame
      title="Asset categories"
      sub="What the register can hold. A category with assets or open requests against it cannot be deleted."
      actionLabel="Add category"
      onAction={add}
      error={error}
      onDismissError={() => setError(null)}
    >
      <PanelTable
        cols="1.2fr 0.8fr 0.8fr 0.9fr 0.8fr"
        headers={["Category", "Serial", "Consumable", "Useful life", ""]}
        isLoading={isLoading}
        isError={isError}
        onRetry={() => refetch()}
        emptyTitle="No asset categories yet"
        emptyBody="The register files every laptop, phone and desk under a category, so nothing can be added to it until one exists."
        emptyAction="Add category"
        onEmptyAction={add}
        rows={categories.map((category) => [
          { text: category.name, sub: category.code, weight: 600 },
          { text: category.requiresSerial ? "Required" : "Not tracked" },
          { text: category.isConsumable ? "Yes" : "No" },
          {
            text:
              category.usefulLifeMonths === null
                ? "Not tracked"
                : `${category.usefulLifeMonths} months`,
          },
          {
            node: (
              <RowActions
                actions={[
                  {
                    kind: "edit",
                    label: "Edit",
                    onClick: () => {
                      setError(null)
                      setEditing(category)
                    },
                  },
                  {
                    kind: "delete",
                    label: "Delete",
                    onClick: () => {
                      setError(null)
                      setDeleting(category)
                    },
                  },
                ]}
              />
            ),
          },
        ])}
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field
              label="Code"
              htmlFor="ac-code"
              hint={category ? "Fixed. Rules key off the code." : undefined}
            >
              <Input
                id="ac-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={category !== null}
                placeholder="DOCK"
              />
            </Field>
            <Field label="Name" htmlFor="ac-name">
              <Input id="ac-name" value={name} onChange={(e) => setName(e.target.value)} />
            </Field>
          </div>

          <Field
            label="Useful life (months)"
            htmlFor="ac-life"
            hint="Leave blank if this category is not depreciated."
          >
            <Input
              id="ac-life"
              type="number"
              min={1}
              value={usefulLifeMonths}
              onChange={(e) => setUsefulLifeMonths(e.target.value)}
              placeholder="Not tracked"
            />
          </Field>

          <div className="space-y-1">
            <CheckboxField
              label="Serial number required"
              checked={requiresSerial}
              onChange={setRequiresSerial}
            />
            <CheckboxField
              label="Consumable (issued and not expected back)"
              checked={isConsumable}
              onChange={setIsConsumable}
            />
          </div>

          {error ? <FormError>{error}</FormError> : null}

          <DialogFooter>
            <DialogActions
              pending={pending}
              disabled={name.trim().length === 0 || code.trim().length === 0}
              submitLabel={category ? "Save" : "Add category"}
              onCancel={onClose}
              onSubmit={() =>
                onSave({
                  code: code.trim(),
                  name: name.trim(),
                  requiresSerial,
                  isConsumable,
                  usefulLifeMonths:
                    usefulLifeMonths.trim() === "" ? null : Number(usefulLifeMonths),
                })
              }
            />
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
