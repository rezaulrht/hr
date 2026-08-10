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
  createDepartment,
  deleteDepartment,
  listDepartments,
  updateDepartment,
} from "@/lib/api/departments"
import type { Department } from "@/lib/api/types"
import { ConfirmDeleteDialog, PanelFrame, toMessage } from "./settings-shared"

export function DepartmentsPanel({ accessToken }: { accessToken: string }) {
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<Department | "new" | null>(null)
  const [deleting, setDeleting] = useState<Department | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: departments = [], isLoading } = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartments(accessToken),
  })

  const done = () => {
    setEditing(null)
    setDeleting(null)
    setError(null)
    queryClient.invalidateQueries({ queryKey: ["departments"] })
  }

  const saveMutation = useMutation({
    mutationFn: ({ id, name }: { id: string | null; name: string }) =>
      id === null
        ? createDepartment(accessToken, { name })
        : updateDepartment(accessToken, id, { name }),
    onSuccess: done,
    onError: (err) => setError(toMessage(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDepartment(accessToken, id),
    onSuccess: done,
    onError: (err) => {
      setDeleting(null)
      setError(toMessage(err))
    },
  })

  return (
    <PanelFrame
      title="Departments"
      sub="Every employee belongs to one. A department in use cannot be deleted."
      actionLabel="Add department"
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
        headers={["Department", ""]}
        rows={
          isLoading
            ? [[{ text: "Loading…" }, { text: "" }]]
            : departments.map((department) => [
                { text: department.name, weight: 600 },
                {
                  node: (
                    <div className="flex gap-3">
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[12px] font-bold underline"
                        onClick={() => {
                          setError(null)
                          setEditing(department)
                        }}
                      >
                        Rename
                      </Button>
                      <Button
                        variant="link"
                        className="h-auto p-0 text-[12px] font-bold text-[#B03A3A] underline"
                        onClick={() => {
                          setError(null)
                          setDeleting(department)
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

      {/* Mounted only while open, so the name field seeds from a useState
          initialiser rather than an effect. Base UI's onOpenChange never fires
          for a prop-driven `open`, so seeding there would silently never run. */}
      {editing !== null ? (
        <DepartmentDialog
          department={editing === "new" ? null : editing}
          pending={saveMutation.isPending}
          error={error}
          onClose={() => setEditing(null)}
          onSave={(name) =>
            saveMutation.mutate({ id: editing === "new" ? null : editing.id, name })
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

function DepartmentDialog({
  department,
  pending,
  error,
  onClose,
  onSave,
}: {
  department: Department | null
  pending: boolean
  error: string | null
  onClose: () => void
  onSave: (name: string) => void
}) {
  const [name, setName] = useState(department?.name ?? "")

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{department ? "Rename department" : "Add a department"}</DialogTitle>
          <DialogDescription>
            Names are unique. Renaming one moves every employee, announcement and asset with it,
            because they reference it by id.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <Label htmlFor="department-name" className="mb-1.5 text-xs font-bold">
              Name
            </Label>
            <Input
              id="department-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {error ? <p className="text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}

          <DialogFooter>
            <Button
              disabled={pending || name.trim().length === 0}
              onClick={() => onSave(name.trim())}
              className="bg-[#17191C] text-white hover:bg-[#0E1012]"
            >
              {pending ? "Saving…" : department ? "Save" : "Add department"}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}
