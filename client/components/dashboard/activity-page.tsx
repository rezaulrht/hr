"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { listEvents } from "@/lib/api/events"
import { useSession } from "@/lib/auth/session-context"
import type { EventItem, EventSeverity } from "@/lib/api/types"
import { PageHeader } from "@/components/dashboard/page-header"
import { PanelTable } from "@/components/dashboard/record-kit"
import { Tag } from "@/components/dashboard/tag"
import type { TableCell, Tone } from "@/components/dashboard/types"
import { Button } from "@/components/ui/button"

/**
 * Everything that has happened, as far as the reader is entitled to see it.
 *
 * This route used to render a `SubpageData` mock: five invented reports owned
 * by four people who do not work here, under a stat reading "Data freshness:
 * Live · Synced 4 min ago" describing a sync that does not exist. Two real
 * "View all" links on the dashboard pointed straight into it, so genuine
 * activity led to fabricated activity.
 *
 * `GET /api/events` is real, scoped server-side, and already feeds the
 * notification bell. Scheduled reporting is not built — `server/src/modules/
 * reporting/` holds a .gitkeep and nothing else — so this page does not
 * pretend otherwise.
 */

const SEVERITY_TONE: Record<EventSeverity, Tone> = {
  INFO: "neutral",
  SUCCESS: "green",
  WARNING: "yellow",
  ERROR: "red",
}

/** "Aug 17, 10:57 AM" — the same voice the dashboard feed speaks. */
function when(iso: string): string {
  const d = new Date(iso)
  return `${d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  })}, ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`
}

function toRows(items: EventItem[]): TableCell[][] {
  return items.map((e) => [
    { text: e.title, sub: e.meta ?? undefined, weight: 500 },
    // The entity is a machine name; spaced and lower-cased it reads as English
    // without a lookup table that would drift from the server's enum.
    { text: e.entity.replace(/_/g, " ").toLowerCase(), icon: e.entity },
    {
      node: <Tag label={e.severity.toLowerCase()} tone={SEVERITY_TONE[e.severity]} />,
    },
    { text: when(e.createdAt) },
  ])
}

const PAGE_SIZE = 25

export function ActivityPage() {
  const { accessToken } = useSession()
  // How many pages deep the reader has asked to go. Walking the cursor chain
  // from the top on each change keeps this one query with one cache entry,
  // which matters because every mutation elsewhere invalidates by prefix.
  const [pageCount, setPageCount] = useState(1)

  const pages = useQuery({
    queryKey: ["events", pageCount],
    queryFn: async () => {
      const collected: EventItem[] = []
      let cursor: string | undefined
      let nextCursor: string | null = null
      for (let i = 0; i < pageCount; i++) {
        const page = await listEvents(accessToken!, { limit: PAGE_SIZE, cursor })
        collected.push(...page.items)
        nextCursor = page.nextCursor
        if (!page.nextCursor) break
        cursor = page.nextCursor
      }
      return { items: collected, nextCursor }
    },
    enabled: !!accessToken,
  })

  const items = pages.data?.items ?? []

  return (
    <>
      <PageHeader
        kicker="Overview"
        title="Activity"
        sub="Every action recorded across the system, newest first."
      />

      <PanelTable
        cols="2fr 1fr 0.8fr 1fr"
        headers={["What happened", "Area", "Severity", "When"]}
        rows={toRows(items)}
        isLoading={pages.isPending}
        isError={pages.isError}
        onRetry={() => pages.refetch()}
        emptyTitle="Nothing has happened yet"
        emptyBody="Actions across the system are recorded here as people use it — approvals, payroll runs, handovers and the rest."
        emptyAction="Refresh"
        onEmptyAction={() => pages.refetch()}
      />

      {pages.data?.nextCursor ? (
        <div className="mt-3 flex justify-center">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setPageCount((n) => n + 1)}
          >
            Load older activity
          </Button>
        </div>
      ) : null}

      {/* Said plainly rather than left as an absence somebody reads as a bug.
          The mock this page replaced claimed four scheduled reports and a
          nightly sync, none of which exist. */}
      <p className="mt-4 text-[12.5px] text-[#5F6B7C]">
        Scheduled and exported reports are not built yet. Payslips and financial
        statements render their own PDFs from their modules.
      </p>
    </>
  )
}
