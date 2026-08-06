import { Tag } from "@/components/dashboard/tag"
import type { Stat } from "@/components/dashboard/types"

export function StatCard({ stat }: { stat: Stat }) {
  return (
    // A stat card renders full-bleed on a phone, ~215px in a four-up desktop
    // grid and ~385px at 2xl. Sizing it off the viewport gets at least one of
    // those wrong, so it sizes off its own box instead.
    <div className="@container flex flex-col gap-2.5 rounded-md border border-[#E4E9EF] bg-white p-4 shadow-[0_8px_24px_-12px_rgba(0,0,0,0.22)] @[260px]:p-5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">{stat.label}</span>
        <Tag label={stat.tag} tone={stat.tone} />
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <div>
          <div
            className={`font-heading text-xl font-bold tracking-tight whitespace-nowrap @[260px]:text-2xl ${
              // Muted, so a card that could not load is visibly not a number
              // sitting next to three that are.
              stat.failed ? "text-[#A6AEBB]" : ""
            }`}
          >
            {stat.value}
          </div>
          <div className="mt-0.5 text-xs text-[#7A8698]">{stat.sub}</div>
        </div>
        {/* The slot keeps its width whether or not there is a series, so a
            grid of four cards does not reflow when one has a sparkline and
            three do not. */}
        <div className="flex h-7.5 w-13 shrink-0 items-end justify-end gap-0.5">
          {stat.bars?.map((h, i) => (
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
