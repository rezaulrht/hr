import { Tag } from "@/components/dashboard/tag"
import type { SubpageData, TableCell } from "@/components/dashboard/types"

/** The inner content of one cell, without any row or card chrome around it. */
function CellBody({ cell }: { cell: TableCell }) {
  if (cell.node) return <>{cell.node}</>
  if (cell.tag) return <Tag label={cell.tag} tone={cell.tone ?? "neutral"} />
  return (
    <div className="min-w-0">
      <div
        className="overflow-hidden text-[13px] text-ellipsis whitespace-nowrap"
        style={{ fontWeight: cell.weight ?? 400, color: "#1C2733" }}
      >
        {cell.text}
      </div>
      {cell.sub ? (
        <div className="mt-0.5 overflow-hidden text-[11.5px] text-ellipsis whitespace-nowrap text-[#A5AFBE]">
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
}: Pick<SubpageData, "cols" | "headers" | "rows"> & { title: string; action?: string }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-4 py-4 sm:px-5.5 sm:py-5">
      <div className="mb-2.5 flex items-center justify-between gap-3">
        <div className="text-[15px] font-bold">{title}</div>
        <span className="shrink-0 text-[12.5px] font-semibold">{action}</span>
      </div>

      {/* md and up: the original aligned grid, visually unchanged. It iterates
          `rows.flat()` because the grid is one flat list of tracks. */}
      <div className="hidden items-center gap-x-3.5 md:grid" style={{ gridTemplateColumns: cols }}>
        {headers.map((header) => (
          <div
            key={header}
            className="border-b border-[#E4E9EF] py-2.5 text-[11px] font-bold tracking-wide text-[#7A8698] uppercase"
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
                    <span className="shrink-0 pt-px text-[10.5px] font-bold tracking-wide text-[#7A8698] uppercase">
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
