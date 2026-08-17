"use client"

import { cn } from "@/lib/utils"

/**
 * A single value of a one-of-many facet — department in the directory, status
 * on the users page. A row of chips beats a select for a facet with a handful
 * of values: the options and the current one are both readable without a
 * press, and the counts turn the filter into a summary of the data.
 *
 * `aria-pressed` rather than a radio group: these are toggles over a list, not
 * a form field, and nothing here is submitted.
 */
export function FilterChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string
  count?: number
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12.5px] font-semibold whitespace-nowrap",
        "transition-[transform,background-color,border-color,color] duration-150 ease-out-quint",
        "focus-visible:ring-2 focus-visible:ring-[#17191C]/25 focus-visible:outline-none",
        "active:scale-97 motion-reduce:transition-none",
        active
          ? "border-[#17191C] bg-[#17191C] text-white"
          : "border-[#E4E9EF] bg-white text-[#3F4A59] hover:border-[#CFD6E0] hover:bg-[#F7F9FC]"
      )}
    >
      {label}
      {count === undefined ? null : (
        <span className={cn("text-[11px] font-bold", active ? "text-white/60" : "text-[#98A2B1]")}>
          {count}
        </span>
      )}
    </button>
  )
}
