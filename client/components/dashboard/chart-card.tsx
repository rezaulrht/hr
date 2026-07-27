import type { ChartBar } from "@/components/dashboard/types"

export function ChartCard({ title, sub, bars }: { title: string; sub: string; bars: ChartBar[] }) {
  return (
    <div className="flex min-w-75 max-w-100 flex-1 flex-col rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="text-[15px] font-bold">{title}</div>
      <div className="mt-0.5 mb-4.5 text-xs text-[#7A8698]">{sub}</div>
      <div className="mt-auto flex h-37.5 items-end gap-3.5">
        {bars.map((bar, i) => (
          <div key={bar.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1.5">
            <div className="text-[10.5px] font-bold text-[#55657A]">{bar.display}</div>
            <div
              className="w-full max-w-8.5 rounded-t-sm rounded-b-[2px]"
              style={{ height: `${bar.height}%`, background: i === bars.length - 1 ? "#17191C" : "#C6CCD3" }}
            />
            <div className="text-[11px] font-semibold text-[#A5AFBE]">{bar.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
