import Link from "next/link"
import {
  RiArchiveLine,
  RiCalendarCheckLine,
  RiFileList3Line,
  RiInboxLine,
  RiMoneyDollarCircleLine,
  RiShieldUserLine,
  RiTeamLine,
  RiToolsLine,
  type RemixiconComponentType,
} from "@remixicon/react"

import { Tag } from "@/components/dashboard/tag"
import type { SubpageData, TableCell } from "@/components/dashboard/types"

/**
 * `AuditEntity` names to glyphs. Deliberately partial: an entity with no entry
 * renders no icon, so adding one server-side degrades to the old look instead
 * of to a question-mark box.
 */
const CELL_ICONS: Record<string, RemixiconComponentType> = {
  ASSET: RiArchiveLine,
  ASSET_ASSIGNMENT: RiArchiveLine,
  ASSET_REQUEST: RiInboxLine,
  ASSET_REPAIR: RiToolsLine,
  ASSET_RECOVERY: RiMoneyDollarCircleLine,
  PAYROLL_RUN: RiMoneyDollarCircleLine,
  PAYSLIP: RiFileList3Line,
  EMPLOYEE: RiTeamLine,
  USER: RiShieldUserLine,
  ATTENDANCE: RiCalendarCheckLine,
  LEAVE_REQUEST: RiCalendarCheckLine,
  EXPENSE_CLAIM: RiMoneyDollarCircleLine,
}

/** The inner content of one cell, without any row or card chrome around it. */
function CellBody({ cell }: { cell: TableCell }) {
  if (cell.node) return <>{cell.node}</>
  if (cell.tag) return <Tag label={cell.tag} tone={cell.tone ?? "neutral"} />
  const Icon = cell.icon ? CELL_ICONS[cell.icon] : undefined
  return (
    <div className="min-w-0">
      <div
        className="flex items-center gap-1.5 overflow-hidden text-[13px] text-ellipsis whitespace-nowrap"
        style={{ fontWeight: cell.weight ?? 400, color: "#1C2733" }}
      >
        {Icon ? <Icon className="size-4 shrink-0 text-[#8A94A2]" aria-hidden /> : null}
        <span className="truncate">{cell.text}</span>
      </div>
      {/* `#6B7789`, not the old `#A5AFBE`: that was 2.2:1 against white, which
          is unreadable rather than quiet. This is the same grey one shade down,
          at 4.5:1. */}
      {cell.sub ? (
        <div className="mt-0.5 overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap text-[#6B7789]">
          {cell.sub}
        </div>
      ) : null}
    </div>
  )
}

/** A cell carrying nothing at all — rendered, it would be an orphan label. */
const isEmpty = (cell: TableCell) => !cell.text && !cell.tag && !cell.node

export function DataTable({
  title,
  cols,
  headers,
  rows,
  action = "Export",
  actionHref,
}: Pick<SubpageData, "cols" | "headers" | "rows"> & {
  title: string
  action?: string
  /** Makes the action label navigate. Without it the label stays inert text,
      which is what every existing caller expects. */
  actionHref?: string
}) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-4 py-4 sm:px-5.5 sm:py-5">
      {/* Callers that own their own heading (the settings panels, four of the
          attendance sections) pass both of these empty. Rendering the row
          anyway left an empty 15px bar plus its margin above the table. */}
      {title || action ? (
        <div className="mb-2.5 flex items-center justify-between gap-3">
          <div className="text-[15px] font-bold">{title}</div>
          {actionHref ? (
            <Link
              href={actionHref}
              className="shrink-0 text-[12.5px] font-semibold hover:underline"
            >
              {action}
            </Link>
          ) : (
            <span className="shrink-0 text-[12.5px] font-semibold">{action}</span>
          )}
        </div>
      ) : null}

      {/* md and up: the original aligned grid, visually unchanged. It iterates
          `rows.flat()` because the grid is one flat list of tracks. */}
      <div className="hidden items-center gap-x-3.5 md:grid" style={{ gridTemplateColumns: cols }}>
        {headers.map((header) => (
          <div
            key={header}
            className="border-b border-[#E4E9EF] py-2.5 text-[11px] font-bold tracking-wide text-[#5F6B7C] uppercase"
          >
            {header}
          </div>
        ))}
        {rows.flat().map((cell, i) => (
          <div key={i} className="min-w-0 border-b border-[#EEF1F5] py-3">
            <CellBody cell={cell} />
          </div>
        ))}
      </div>

      {/* Below md: one card per row, so nobody swipes sideways to read a
          record. Iterates `rows` un-flattened — a card needs its row bounds.
          The first cell becomes the card title; the rest become label/value
          pairs, the label coming from the header at the same index. */}
      <div className="flex flex-col gap-2.5 md:hidden">
        {rows.map((row, r) => (
          <div key={r} className="rounded-md border border-[#EEF1F5] p-3">
            {row[0] && !isEmpty(row[0]) ? (
              <div className="mb-2 border-b border-[#EEF1F5] pb-2">
                <CellBody cell={row[0]} />
              </div>
            ) : null}
            <div className="flex flex-col gap-1.5">
              {row.slice(1).map((cell, c) => {
                if (isEmpty(cell)) return null
                return (
                  <div key={c} className="flex items-start justify-between gap-3">
                    {/* `c + 1`, not `c`: slice(1) dropped the title cell. */}
                    <span className="shrink-0 pt-px text-[10.5px] font-bold tracking-wide text-[#5F6B7C] uppercase">
                      {headers[c + 1]}
                    </span>
                    <div className="min-w-0 text-right">
                      <CellBody cell={cell} />
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
