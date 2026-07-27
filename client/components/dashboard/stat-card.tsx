import { Tag } from "@/components/dashboard/tag"
import type { Stat } from "@/components/dashboard/types"

export function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-md border border-[#E4E9EF] bg-white p-5 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.22)]">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">{stat.label}</span>
        <Tag label={stat.tag} tone={stat.tone} />
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <div>
          <div className="font-heading text-2xl font-bold tracking-tight whitespace-nowrap">{stat.value}</div>
          <div className="mt-0.5 text-xs text-[#7A8698]">{stat.sub}</div>
        </div>
        <div className="flex h-7.5 shrink-0 items-end gap-0.5">
          {stat.bars.map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-sm"
              style={{ height: `${h}%`, background: i === stat.hotBar ? "#33373D" : "#D4D9DE" }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div className="relative z-10 -mt-13 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  )
}
