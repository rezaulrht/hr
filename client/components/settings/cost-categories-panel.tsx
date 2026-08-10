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
import {
  createCostCategory,
  deleteCostCategory,
  listCostCategories,
  updateCostCategory,
} from "@/lib/api/costs"
import type { CostCategory, CreateCostCategoryInput } from "@/lib/api/types"
import { ConfirmDeleteDialog, PanelFrame, toMessage } from "./settings-shared"

export function CostCategoriesPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<CostCategory | "new" | null>(null)
  const [deleting, setDeleting] = useState<CostCategory | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ["cost-categories"],
    queryFn: () => listCostCategories(accessToken),
  })

  const done = () => {
    setEditing(null)
    setDeleting(null)
    setError(null)
    queryClient.invalidateQueries({ queryKey: ["cost-categories"] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, input }: { id: string | null; input: CreateCostCategoryInput }) => {
      if (id === null) return createCostCategory(accessToken, input)
      const { code, ...rest } = input
      void code
      return updateCostCategory(accessToken, id, rest)
    },
    onSuccess: done,
    onError: (err) => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteCostCategory(accessToken, id),
    onSuccess: done,
    onError: (err) => {
      setDeleting(null)
      setError(toMessage(err))
    },
  })

  return (
    <PanelFrame
      title="Cost categories"
      sub="What operating costs are booked against. One with costs or commitments against it cannot be deleted."
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
        cols="2fr 0.8fr"
        headers={["Category", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }]]
            : categories.map((category) => [
                { text: category.name, sub: category.code, weight: 600 },
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
                        Rename
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
        <CostCategoryDialog
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

function CostCategoryDialog({
  category,
  pending,
  error,
  onClose,
  onSave,
}: {
  category: CostCategory | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (input: CreateCostCategoryInput) => void
}) {
  const [code, setCode] = useState(category?.code ?? "")
  const [name, setName] = useState(category?.name ?? "")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{category ? `Edit ${category.name}` : "Add a cost category"}</DialogTitle>
          <DialogDescription>
            A table rather than a fixed list, because Finance will add &ldquo;gas bill&rdquo; and no
            code branches on the name.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="cc-code" className="mb-1.5 text-xs font-bold">
                Code
              </Label>
              <Input
                id="cc-code"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                disabled={category !== null}
                placeholder="GAS"
              />
              {category ? (
                <p className="mt-1 text-[11.5px] text-[#6B7683]">Fixed. Rules key off the code.</p>
              ) : null}
            </div>
            <div>
              <Label htmlFor="cc-name" className="mb-1.5 text-xs font-bold">
                Name
              </Label>
              <Input id="cc-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || name.trim().length === 0 || code.trim().length === 0}
              onClick={() => onSave({ code: code.trim(), name: name.trim() })}
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
