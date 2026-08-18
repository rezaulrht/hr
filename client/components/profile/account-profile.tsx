"use client"

import { useState } from "react"
import Link from "next/link"
import { useMutation, useQuery } from "@tanstack/react-query"
import {
  RiCheckLine,
  RiComputerLine,
  RiInformationLine,
  RiKey2Line,
  RiLogoutBoxRLine,
  RiShieldKeyholeLine,
  RiSubtractLine,
  type RemixiconComponentType,
} from "@remixicon/react"

import { logoutEverywhere } from "@/lib/api/auth"
import { listMyActions } from "@/lib/api/events"
import { useSession } from "@/lib/auth/session-context"
import type { EventItem, MyProfileResponse, Role } from "@/lib/api/types"
import { ConfirmDialog, PanelTable, TONE } from "@/components/dashboard/record-kit"
import { Tag } from "@/components/dashboard/tag"
import type { TableCell, Tone } from "@/components/dashboard/types"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

/**
 * The profile for an account with no employee record — Super Admin, HR Admin
 * and Finance Officer.
 *
 * This replaced `AccountOnlyCard`, a single card holding an email, a role and
 * one sentence, whose comment argued that "for these roles there genuinely is
 * nothing more". That was true only because the endpoint built its account
 * block straight off the JWT and never read the row. There is plenty more:
 * when the account was opened, what is signed in to it, what the role may do,
 * and what this person has actually been doing with it.
 *
 * Still deliberately absent: anything resembling the dashboard's approval
 * queue. What is waiting on you is a landing-page question, and answering it
 * twice is how the two copies start disagreeing.
 */

const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "Super Admin",
  HR_ADMIN: "HR Admin",
  FINANCE_OFFICER: "Finance Officer",
  REPORTING_MANAGER: "Reporting Manager",
  EMPLOYEE: "Employee",
}

/**
 * What each role may actually do, kept coarse on purpose.
 *
 * Every line below is traceable to a `requireRole` call — the Super Admin's
 * three approvals are `payroll.routes:79`, `settlement.routes:37` and
 * `asset.routes:133`, and the account line is the whole of `user.routes`.
 * They are written at the level of "this module is yours" rather than
 * endpoint by endpoint, because a fine-grained list is one that drifts from
 * the guards within a month and then quietly lies.
 */
const CAN: Record<Role, string[]> = {
  SUPER_ADMIN: [
    "Approve or reject payroll runs and final settlements",
    "Approve or reject asset requests — nobody else can",
    "Open accounts, change roles, and revoke access",
    "Read every module in the system",
  ],
  HR_ADMIN: [
    "Create and maintain employee records",
    "Decide leave requests and attendance corrections",
    "Own the asset register, and hand assets over",
    "Publish announcements",
  ],
  FINANCE_OFFICER: [
    "Open payroll runs, process them, and submit for approval",
    "Approve and reimburse expense claims",
    "Post to the ledger and produce statements",
    "Record operating costs and run depreciation",
  ],
  REPORTING_MANAGER: [
    "Decide leave and attendance for direct reports",
    "See the team's attendance and leave balances",
  ],
  EMPLOYEE: ["File leave, expenses and asset requests", "See your own payslips and attendance"],
}

/**
 * The one thing these accounts cannot do, said plainly.
 *
 * Without an Employee row there is no leave balance, no payslip and no
 * attendance record, and every one of those pages is reachable in the nav.
 * Reaching one and finding it empty reads as a broken page.
 */
const CANNOT = "File leave, expenses or timesheets — those need an employee record"

function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" })
}

/** "4 minutes ago", "yesterday" — a stamp nobody has to subtract from today. */
function since(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`
  const days = Math.round(hours / 24)
  if (days === 1) return "yesterday"
  if (days < 30) return `${days} days ago`
  return new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" })
}

function initialsFromEmail(email: string): string {
  return (email.split("@")[0] ?? "?").slice(0, 2).toUpperCase()
}

const SEVERITY_TONE: Record<EventItem["severity"], Tone> = {
  INFO: "neutral",
  SUCCESS: "green",
  WARNING: "yellow",
  ERROR: "red",
}

export function AccountProfile({ account }: { account: MyProfileResponse["account"] }) {
  const { accessToken, clearSession } = useSession()
  const [confirmSignOut, setConfirmSignOut] = useState(false)

  const actions = useQuery({
    queryKey: ["my-actions"],
    queryFn: () => listMyActions(accessToken!, { limit: 12 }),
    enabled: !!accessToken,
  })

  const signOutAll = useMutation({
    mutationFn: () => logoutEverywhere(accessToken!),
    // Local teardown after the server call, exactly as the header's sign-out
    // does. `clearSession` posts to /logout on its way through, which is a
    // no-op now the tokens are gone and is caught either way.
    onSettled: () => clearSession(),
  })

  const rows: TableCell[][] = (actions.data?.items ?? []).map((e) => [
    { text: e.title, sub: e.meta ?? undefined, weight: 500 },
    { text: e.entity.replace(/_/g, " ").toLowerCase(), icon: e.entity },
    { node: <Tag label={e.severity.toLowerCase()} tone={SEVERITY_TONE[e.severity]} /> },
    { text: since(e.createdAt) },
  ])

  return (
    <>
      <header className="mb-4 flex flex-wrap items-center gap-4 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
        <div className="flex size-14 shrink-0 items-center justify-center rounded-md bg-[#EFF2F6] text-[17px] font-bold text-[#55657A]">
          {initialsFromEmail(account.email)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-[21px] font-bold tracking-tight break-words">
            {account.email}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[13px] text-[#5F6B7C]">
            <Tag label={ROLE_LABEL[account.role]} tone="neutral" />
            <span>Account opened {monthYear(account.createdAt)}</span>
          </div>
        </div>
      </header>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Security" icon={RiShieldKeyholeLine}>
          <Facts
            rows={[
              {
                label: "Password",
                value: account.mustChangePassword ? "Must be changed" : "Set",
                tone: account.mustChangePassword ? "yellow" : undefined,
              },
              {
                label: "Signed in",
                value:
                  account.sessions.count === 0
                    ? "Nowhere else"
                    : `${account.sessions.count} ${account.sessions.count === 1 ? "device" : "devices"}`,
              },
              // Never "signed in since": refresh tokens rotate, so the only
              // honest reading of a token's age is time since last use.
              ...(account.sessions.lastActiveAt
                ? [{ label: "Last active", value: since(account.sessions.lastActiveAt) }]
                : []),
            ]}
          />
          <div className="mt-4 flex flex-wrap gap-2 border-t border-[#EFF2F6] pt-4">
            <Button
              type="button"
              variant="outline"
              nativeButton={false}
              render={<Link href="/change-password" />}
            >
              <RiKey2Line className="size-4" aria-hidden />
              Change password
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={account.sessions.count === 0 || signOutAll.isPending}
              onClick={() => setConfirmSignOut(true)}
              className="text-[#8A5E0C] hover:bg-[#FDF8EE] hover:text-[#6E4A09]"
            >
              <RiLogoutBoxRLine className="size-4" aria-hidden />
              Sign out everywhere
            </Button>
          </div>
        </Panel>

        <Panel title={`What ${ROLE_LABEL[account.role]} can do`} icon={RiComputerLine}>
          <ul className="space-y-2">
            {CAN[account.role].map((line) => (
              <li key={line} className="flex items-start gap-2 text-[13px] leading-relaxed">
                <RiCheckLine className="mt-0.5 size-4 shrink-0 text-[#1E7A3C]" aria-hidden />
                <span>{line}</span>
              </li>
            ))}
            <li
              className={cn(
                "flex items-start gap-2 border-t border-[#EFF2F6] pt-2 text-[13px] leading-relaxed",
                TONE.muted
              )}
            >
              <RiSubtractLine className="mt-0.5 size-4 shrink-0 text-[#A5AFBE]" aria-hidden />
              <span>{CANNOT}</span>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="font-heading text-[16px] font-bold tracking-tight">What you&apos;ve done</h2>
        <span className={cn("text-[12.5px]", TONE.muted)}>Your own actions, newest first</span>
      </div>

      <PanelTable
        cols="2fr 1fr 0.7fr 0.8fr"
        headers={["Action", "Area", "Result", "When"]}
        rows={rows}
        isLoading={actions.isPending}
        isError={actions.isError}
        onRetry={() => actions.refetch()}
        emptyTitle="You haven't done anything yet"
        emptyBody="Approvals, account changes and everything else you do is recorded here as you go."
        emptyAction="Refresh"
        emptyActionIcon={<RiInformationLine className="size-4" aria-hidden />}
        onEmptyAction={() => actions.refetch()}
      />

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out everywhere?"
        body={
          <>
            Every device signed in to this account is signed out, <strong>including this one</strong>
            . Nothing else changes — your account, role and password stay exactly as they are.
          </>
        }
        confirmLabel="Sign out everywhere"
        pending={signOutAll.isPending}
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => signOutAll.mutate()}
      />
    </>
  )
}

function Panel({
  title,
  icon: Icon,
  children,
}: {
  title: string
  icon: RemixiconComponentType
  children: React.ReactNode
}) {
  return (
    <section className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4.5">
      <h2 className="mb-3.5 flex items-center gap-2 text-[13.5px] font-bold">
        <Icon className="size-4 text-[#8A94A2]" aria-hidden />
        {title}
      </h2>
      {children}
    </section>
  )
}

/** Label left, value right — the same reading order every profile card uses. */
function Facts({
  rows,
}: {
  rows: { label: string; value: string; tone?: Tone }[]
}) {
  return (
    <dl className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label} className="flex items-baseline justify-between gap-4">
          <dt className={cn("text-[12.5px]", TONE.muted)}>{row.label}</dt>
          <dd className="text-right text-[13px] font-semibold">
            {row.tone ? <Tag label={row.value} tone={row.tone} /> : row.value}
          </dd>
        </div>
      ))}
    </dl>
  )
}
