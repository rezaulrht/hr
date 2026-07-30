import { Skeleton } from "@/components/ui/skeleton"

/**
 * Small presentational pieces shared by the page and its sections. They live
 * here rather than in attendance-page.tsx so a section importing them does
 * not create a cycle back to the page that renders it.
 */

export function TableSkeleton() {
  return (
    <div className="space-y-2 rounded-md border border-[#E4E9EF] bg-white p-5.5">
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
      <Skeleton className="h-6 w-full" />
    </div>
  )
}

export function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
      Failed to load {label}.{" "}
      <button className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

export function SectionHeading({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="pt-7 pb-3.5">
      <h2 className="font-heading text-[16px] font-bold tracking-tight">{title}</h2>
      {sub ? <div className="mt-0.5 max-w-xl text-[12.5px] text-[#7A8698]">{sub}</div> : null}
    </div>
  )
}
