import { cn } from "@/lib/utils"

/**
 * Small presentational pieces shared by the page and its sections. They live
 * here rather than in attendance-page.tsx so a section importing them does
 * not create a cycle back to the page that renders it.
 *
 * `TableSkeleton` and `LoadError` used to live here too: three grey bars and
 * a one-line sentence, repeated at four call sites. Both are now PanelTable's
 * job (components/dashboard/record-kit.tsx), which draws a skeleton shaped
 * like the grid it replaces and gives a failed load somewhere to retry from.
 */

export function SectionHeading({
  title,
  sub,
  className,
}: {
  title: string
  sub?: string
  className?: string
}) {
  return (
    <div className={cn("pt-7 pb-3.5", className)}>
      <h2 className="font-heading text-[16px] font-bold tracking-tight">{title}</h2>
      {sub ? <div className="mt-0.5 max-w-xl text-[12.5px] text-[#5F6B7C]">{sub}</div> : null}
    </div>
  )
}
