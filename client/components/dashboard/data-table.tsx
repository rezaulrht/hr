import { Tag } from "@/components/dashboard/tag"
import type { SubpageData, TableCell } from "@/components/dashboard/types"

function Cell({ cell }: { cell: TableCell }) {
  if (cell.tag) {
    return (
      <div className="border-b border-[#EEF1F5] py-3">
        <Tag label={cell.tag} tone={cell.tone ?? "neutral"} />
      </div>
    )
  }
  return (
    <div className="min-w-0 border-b border-[#EEF1F5] py-3">
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

export function DataTable({
  title,
  cols,
  headers,
  rows,
  action = "Export",
}: Pick<SubpageData, "cols" | "headers" | "rows"> & { title: string; action?: string }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="mb-2.5 flex items-center justify-between">
        <div className="text-[15px] font-bold">{title}</div>
        <span className="text-[12.5px] font-semibold">{action}</span>
      </div>
      <div className="grid items-center gap-x-3.5" style={{ gridTemplateColumns: cols }}>
        {headers.map((header) => (
          <div
            key={header}
            className="border-b border-[#E4E9EF] py-2.5 text-[11px] font-bold tracking-wide text-[#7A8698] uppercase"
          >
            {header}
          </div>
        ))}
        {rows.flat().map((cell, i) => (
          <Cell key={i} cell={cell} />
        ))}
      </div>
    </div>
  )
}
