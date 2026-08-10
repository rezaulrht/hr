"use client"

import type { ReactNode } from "react"

import { SectionHeading } from "@/components/attendance/attendance-ui"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { ApiError } from "@/lib/api/client"

/**
 * The server's message, verbatim, or a generic sentence for a transport
 * failure.
 *
 * The reference-data endpoints write their refusals to be read by a person —
 * "This department is still in use by 4 employees, 2 announcements and 1
 * asset. Reassign them first." — and every count in them is information the
 * client does not have. Restating them here could only lose it.
 */
export function toMessage(err: unknown): string {
  return err instanceof ApiError ? err.message : "Something went wrong. Please try again."
}

export function PanelFrame({
  title,
  sub,
  actionLabel,
  onAction,
  error,
  children,
}: {
  title: string
  sub: string
  actionLabel: string
  onAction: () => void
  error: string | null
  children: ReactNode
}) {
  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SectionHeading title={title} sub={sub} />
        <Button
          onClick={onAction}
          className="h-auto rounded-md bg-[#17191C] px-4 py-2 text-[12.5px] font-bold text-white hover:bg-[#0E1012]"
        >
          {actionLabel}
        </Button>
      </div>

      {error ? (
        <div className="rounded-md border border-[#F0D2D2] bg-[#FDF6F6] px-3.5 py-2.5 text-[12.5px] font-semibold text-[#B03A3A]">
          {error}
        </div>
      ) : null}

      {children}
    </div>
  )
}

/**
 * Deleting reference data is irreversible — there is no soft delete and no
 * restore anywhere in the system. The server refuses a row that something
 * still references; it says nothing about a row nothing references yet, and
 * that is exactly the row a mis-aimed click destroys.
 */
export function ConfirmDeleteDialog({
  open,
  what,
  pending,
  onCancel,
  onConfirm,
}: {
  open: boolean
  what: string
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <AlertDialog open={open} onOpenChange={(next) => !next && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {what}?</AlertDialogTitle>
          <AlertDialogDescription>
            This cannot be undone. If anything still references it, the delete is refused and
            nothing changes.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={onConfirm}
            className="bg-[#B03A3A] text-white hover:bg-[#8F2F2F]"
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
