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
import { MiniStat, PageHeader } from "@/components/dashboard/page-header"
import { ConfirmDialog, PanelTable, RowActions } from "@/components/dashboard/record-kit"
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
  // Delete used to fire on the click, from a link-styled control sitting
  // beside Edit. An announcement is not recoverable once gone, and the two
  // controls are one pixel apart.
  const [deleting, setDeleting] = useState<AnnouncementItem | null>(null)

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
            <RowActions
              actions={[
                {
                  kind: "edit",
                  label: "Edit",
                  onClick: () => {
                    setFormError(null)
                    setEditing(a)
                  },
                },
                { kind: "delete", label: "Delete", onClick: () => setDeleting(a) },
              ]}
            />
          ),
        }
      : { text: "" },
  ])

  const isLoading = status === "loading" || listQuery.isPending

  return (
    <>
      {/* The shared header, not a hand-rolled one. It also survives loading:
          replacing the whole page with two skeletons meant the title and the
          New announcement button vanished and then jumped back. */}
      <PageHeader
        kicker="Communication"
        title="Announcements"
        sub="Company and team notices. There are no read receipts, so a rendered row is not a person who read it."
        cta={canPublish ? "New announcement" : undefined}
        onCta={() => {
          setFormError(null)
          setComposing(true)
        }}
      />

      <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
        {/* Counted against no data these read "0", which is a claim rather
            than a smaller version of the truth. On a failed load they are
            dropped: the panel below says what happened, and three zeroes above
            it would argue with that. Same rule the employees directory keeps. */}
        {isLoading || listQuery.isError ? null : (
          <>
            <MiniStat label="This month" value={String(thisMonth)} sub="Published and live" />
            {/* Scheduled and drafts are only meaningful to somebody who can
                publish — an employee sees neither, because neither is visible
                to them in the first place. */}
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
          </>
        )}
      </div>

      {/* PanelTable carries loading, error, empty and data. This page was the
          last one still hand-rolling that three-way branch, with its own error
          panel duplicating the kit's and a bare "No announcements yet." that
          offered no way forward. */}
      <div className="pt-7">
        <PanelTable
          cols="2fr 1fr 0.8fr 0.9fr 0.8fr"
          headers={["Title", "Audience", "Status", "Published", ""]}
          rows={rows}
          isLoading={isLoading}
          isError={listQuery.isError}
          onRetry={() => listQuery.refetch()}
          emptyTitle="No announcements yet"
          emptyBody={
            canPublish
              ? "Post one and it reaches everyone, a department or a single role. Schedule it and it goes live on its own."
              : "Notices from HR and your manager appear here."
          }
          emptyAction={canPublish ? "New announcement" : "Refresh"}
          onEmptyAction={
            canPublish
              ? () => {
                  setFormError(null)
                  setComposing(true)
                }
              : () => listQuery.refetch()
          }
        />
      </div>

      <ConfirmDialog
        open={!!deleting}
        title="Delete this announcement?"
        body={
          deleting?.publishedAt && deleting.publishedAt <= now
            ? `"${deleting.title}" is already live. Deleting removes it for everyone who has not read it yet, and it cannot be restored.`
            : `"${deleting?.title ?? ""}" will be removed. This cannot be undone.`
        }
        confirmLabel="Delete"
        pending={deleteMutation.isPending}
        onCancel={() => setDeleting(null)}
        onConfirm={() => {
          const target = deleting
          setDeleting(null)
          if (target) deleteMutation.mutate(target.id)
        }}
      />

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
