"use client"

import { useState } from "react"

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
import { Textarea } from "@/components/ui/textarea"
import type {
  AnnouncementAudience,
  AnnouncementItem,
  CreateAnnouncementInput,
  Department,
  Role,
} from "@/lib/api/types"

const ROLES: Role[] = [
  "SUPER_ADMIN",
  "HR_ADMIN",
  "FINANCE_OFFICER",
  "REPORTING_MANAGER",
  "EMPLOYEE",
]

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admins",
  HR_ADMIN: "HR Admins",
  FINANCE_OFFICER: "Finance Officers",
  REPORTING_MANAGER: "Reporting Managers",
  EMPLOYEE: "Employees",
}

/** `2026-08-05T04:00:00.000Z` → `2026-08-05T10:00`, for a datetime-local input. */
function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function ComposeAnnouncementDialog({
  open,
  onOpenChange,
  existing,
  departments,
  managerScoped,
  pending,
  error,
  onSubmit,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  existing?: AnnouncementItem
  departments: Department[]
  /**
   * The composer is a Reporting Manager, who may only announce to their own
   * department. No picker is shown and **no `departmentId` is sent** — the
   * server reads it from their employee record, which is the one place it
   * cannot be escalated from. Offering a picker the server overrides would
   * teach the user something false.
   */
  managerScoped?: boolean
  pending: boolean
  error: string | null
  onSubmit: (input: CreateAnnouncementInput) => void
}) {
  const [title, setTitle] = useState(existing?.title ?? "")
  const [body, setBody] = useState(existing?.body ?? "")
  // A manager may only announce to their own department, so that is the only
  // audience they are ever offered.
  const [audience, setAudience] = useState<AnnouncementAudience>(
    existing?.audience ?? (managerScoped ? "DEPARTMENT" : "ALL")
  )
  const [departmentId, setDepartmentId] = useState(existing?.departmentId ?? "")
  const [targetRole, setTargetRole] = useState<Role | "">(existing?.targetRole ?? "")
  const [publishAt, setPublishAt] = useState(
    existing?.publishedAt ? toLocalInput(existing.publishedAt) : ""
  )
  const [draft, setDraft] = useState(existing ? existing.publishedAt === null : false)

  // Mirrors the server's `superRefine`, so the form cannot construct a body
  // the API will reject.
  const targetOk =
    audience === "ALL" ||
    (audience === "DEPARTMENT" && (managerScoped || departmentId !== "")) ||
    (audience === "ROLE" && targetRole !== "")
  const canSubmit = title.trim() !== "" && body.trim() !== "" && targetOk && !pending

  function submit() {
    onSubmit({
      title: title.trim(),
      body: body.trim(),
      audience,
      // Omitted entirely for a manager — the server supplies it.
      ...(audience === "DEPARTMENT" && !managerScoped ? { departmentId } : {}),
      ...(audience === "ROLE" ? { targetRole: targetRole as Role } : {}),
      // Three distinct states, and they must stay distinct: explicit null
      // keeps it a draft, a datetime schedules it, and omitting the field
      // entirely publishes now.
      ...(draft
        ? { publishedAt: null }
        : publishAt
          ? { publishedAt: new Date(publishAt).toISOString() }
          : {}),
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit announcement" : "New announcement"}</DialogTitle>
          <DialogDescription>
            Everyone in the audience sees this on their announcements page. There are no read
            receipts — nobody can tell you who has actually read it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3.5">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input
              id="ann-title"
              value={title}
              maxLength={200}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Office closed on Sunday"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-body">Body</Label>
            <Textarea
              id="ann-body"
              value={body}
              rows={5}
              onChange={(e) => setBody(e.target.value)}
              placeholder="What people need to know, and by when."
            />
          </div>

          {managerScoped ? (
            <div className="rounded-md bg-[#F4F6F9] px-3.5 py-2.5 text-[12.5px] text-[#55657A]">
              This goes to <span className="font-semibold">your own department</span>. Managers can
              only announce to their own team.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-audience">Audience</Label>
              <select
                id="ann-audience"
                value={audience}
                onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
                className="h-9 rounded-md border border-[#E4E9EF] bg-white px-3 text-[13px]"
              >
                <option value="ALL">Everyone</option>
                <option value="DEPARTMENT">A department</option>
                <option value="ROLE">A role</option>
              </select>
            </div>
          )}

          {!managerScoped && audience === "DEPARTMENT" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-department">Department</Label>
              <select
                id="ann-department"
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="h-9 rounded-md border border-[#E4E9EF] bg-white px-3 text-[13px]"
              >
                <option value="">Choose a department…</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {audience === "ROLE" ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="ann-role">Role</Label>
              <select
                id="ann-role"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value as Role)}
                className="h-9 rounded-md border border-[#E4E9EF] bg-white px-3 text-[13px]"
              >
                <option value="">Choose a role…</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ann-when">Publish</Label>
            <Input
              id="ann-when"
              type="datetime-local"
              value={publishAt}
              disabled={draft}
              onChange={(e) => setPublishAt(e.target.value)}
            />
            <label className="flex items-center gap-2 text-[12.5px] text-[#55657A]">
              <input
                type="checkbox"
                checked={draft}
                onChange={(e) => setDraft(e.target.checked)}
              />
              Save as a draft — nobody sees it until you publish
            </label>
            {!draft && !publishAt ? (
              <span className="text-[12px] text-[#7A8698]">Leave empty to publish immediately.</span>
            ) : null}
          </div>

          {error ? <div className="text-[12.5px] font-semibold text-[#B03A3A]">{error}</div> : null}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {pending ? "Saving…" : existing ? "Save changes" : draft ? "Save draft" : "Publish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
