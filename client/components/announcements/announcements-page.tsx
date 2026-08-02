"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  updateAnnouncement,
} from "@/lib/api/announcements"
import { ApiError } from "@/lib/api/client"
import { listDepartments } from "@/lib/api/departments"
import { useSession } from "@/lib/auth/session-context"
import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat } from "@/components/dashboard/page-header"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import type { TableCell } from "@/components/dashboard/types"
import type { AnnouncementItem, CreateAnnouncementInput } from "@/lib/api/types"
import { ComposeAnnouncementDialog } from "@/components/announcements/compose-announcement-dialog"

/** Roles the server lets publish. Mirrors `PUBLISHER_ROLES`. */
const PUBLISHER_ROLES = ["SUPER_ADMIN", "HR_ADMIN", "FINANCE_OFFICER", "REPORTING_MANAGER"]
const MODERATOR_ROLES = ["SUPER_ADMIN", "HR_ADMIN"]

const AUDIENCE_LABEL = (a: AnnouncementItem) =>
  a.audience === "ALL"
    ? "Everyone"
    : a.audience === "DEPARTMENT"
      ? (a.departmentName ?? "A department")
      : (a.targetRole?.replace(/_/g, " ").toLowerCase() ?? "A role")

const stamp = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })

export function AnnouncementsPage() {
  const { accessToken, user, status } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = status === "authenticated" && !!accessToken
  const role = user?.role
  const canPublish = !!role && PUBLISHER_ROLES.includes(role)
  const isModerator = !!role && MODERATOR_ROLES.includes(role)
  const isManager = role === "REPORTING_MANAGER"

  const [composing, setComposing] = useState(false)
  const [editing, setEditing] = useState<AnnouncementItem | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const listQuery = useQuery({
    queryKey: ["announcements"],
    queryFn: () => listAnnouncements(accessToken!, 50),
    enabled: isAuthed,
  })

  // Read once on mount, not on every render: "scheduled" versus "published"
  // is a comparison against the clock, and re-reading it mid-render would let
  // a row's label change because React happened to re-run. A row that crosses
  // its publish time while the page is open is picked up by the next refetch,
  // which is the same moment its content could have changed anyway.
  const [now] = useState(() => new Date().toISOString())

  const departmentsQuery = useQuery({
    queryKey: ["departments"],
    queryFn: () => listDepartments(accessToken!),
    enabled: isAuthed && canPublish,
  })

  function close() {
    setComposing(false)
    setEditing(null)
    setFormError(null)
    queryClient.invalidateQueries({ queryKey: ["announcements"] })
    // A published announcement emits an event, which the feed reads.
    queryClient.invalidateQueries({ queryKey: ["dashboard"] })
  }

  const onError = (err: unknown) =>
    setFormError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")

  const createMutation = useMutation({
    mutationFn: (input: CreateAnnouncementInput) => createAnnouncement(accessToken!, input),
    onSuccess: close,
    onError,
  })

  const updateMutation = useMutation({
    mutationFn: (vars: { id: string; input: CreateAnnouncementInput }) =>
      updateAnnouncement(accessToken!, vars.id, vars.input),
    onSuccess: close,
    onError,
  })

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAnnouncement(accessToken!, id),
    onSuccess: close,
    onError,
  })

  const items = listQuery.data ?? []

  const thisMonth = items.filter((a) => {
    if (!a.publishedAt || a.publishedAt > now) return false
    const at = new Date(a.publishedAt)
    const today = new Date()
    return at.getMonth() === today.getMonth() && at.getFullYear() === today.getFullYear()
  }).length
  const scheduled = items.filter((a) => a.publishedAt !== null && a.publishedAt > now).length
  const drafts = items.filter((a) => a.publishedAt === null).length

  const rows: TableCell[][] = items.map((a) => [
    { text: a.title, sub: a.body.slice(0, 70), weight: 600 },
    { text: AUDIENCE_LABEL(a) },
    {
      tag:
        a.publishedAt === null ? "Draft" : a.publishedAt > now ? "Scheduled" : "Published",
      tone: a.publishedAt === null ? "neutral" : a.publishedAt > now ? "yellow" : "green",
    },
    { text: a.publishedAt ? stamp(a.publishedAt) : "—" },
    canPublish && (isModerator || a.publishedBy === user?.id)
      ? {
          node: (
            <div className="flex gap-3">
              <button
                className="text-[12px] font-bold underline"
                onClick={() => {
                  setFormError(null)
                  setEditing(a)
                }}
              >
                Edit
              </button>
              <button
                className="text-[12px] font-bold text-[#B03A3A] underline"
                onClick={() => deleteMutation.mutate(a.id)}
              >
                Delete
              </button>
            </div>
          ),
        }
      : { text: "" },
  ])

  if (status === "loading" || listQuery.isPending) {
    return (
      <div className="space-y-3 pt-7">
        <Skeleton className="h-9 w-52" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
        <div>
          <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
            Communication
          </div>
          <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Announcements</h1>
          <div className="text-[13px] text-[#7A8698]">
            Company and team notices. There are no read receipts — a rendered row is not a person
            who read it.
          </div>
        </div>
        {canPublish ? (
          <Button
            onClick={() => {
              setFormError(null)
              setComposing(true)
            }}
            className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]"
          >
            New announcement
          </Button>
        ) : null}
      </div>

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        <MiniStat label="This month" value={String(thisMonth)} sub="Published and live" />
        {/* Scheduled and drafts are only meaningful to somebody who can
            publish — an employee sees neither, because neither is visible to
            them in the first place. */}
        {canPublish ? (
          <>
            <MiniStat
              label="Scheduled"
              value={String(scheduled)}
              sub="Goes live on its own, no action needed"
            />
            <MiniStat label="Drafts" value={String(drafts)} sub="Nobody can see these yet" />
          </>
        ) : null}
      </div>

      <div className="pt-7">
        {listQuery.isError ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
            Failed to load announcements.{" "}
            <button className="font-semibold underline" onClick={() => listQuery.refetch()}>
              Retry
            </button>
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-md border border-[#E4E9EF] bg-white p-8 text-center text-[13px] text-[#7A8698]">
            No announcements yet.
          </div>
        ) : (
          <DataTable
            title="Announcements"
            cols="2fr 1fr 0.8fr 0.9fr 0.8fr"
            headers={["Title", "Audience", "Status", "Published", ""]}
            rows={rows}
            action=""
          />
        )}
      </div>

      {composing || editing ? (
        <ComposeAnnouncementDialog
          key={editing?.id ?? "new"}
          open
          onOpenChange={(open) => {
            if (!open) {
              setComposing(false)
              setEditing(null)
            }
          }}
          existing={editing ?? undefined}
          departments={departmentsQuery.data ?? []}
          managerScoped={isManager}
          pending={createMutation.isPending || updateMutation.isPending}
          error={formError}
          onSubmit={(input) =>
            editing
              ? updateMutation.mutate({ id: editing.id, input })
              : createMutation.mutate(input)
          }
        />
      ) : null}
    </>
  )
}
