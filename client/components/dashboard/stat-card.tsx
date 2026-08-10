import Link from "next/link"

import { HERO_OVERLAP_PX } from "@/components/dashboard/hero-banner"
import { Tag } from "@/components/dashboard/tag"
import type { Stat } from "@/components/dashboard/types"
import { cn } from "@/lib/utils"

/**
 * A stat card renders full-bleed on a phone, ~215px in a four-up desktop grid
 * and ~385px at 2xl. Sizing it off the viewport gets at least one of those
 * wrong, so it sizes off its own box with container queries instead.
 *
 * The shadow is tinted toward the page's slate rather than pure black: a
 * neutral-black shadow on a cool grey canvas reads as dirt.
 */
const SURFACE =
  "@container flex flex-col gap-2.5 rounded-md border border-[#E4E9EF] bg-white p-4 shadow-[0_8px_24px_-12px_rgba(28,39,51,0.20)] @[260px]:p-5"

function CardBody({ stat }: { stat: Stat }) {
  return (
    <>
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11.5px] font-bold tracking-wide text-[#5F6B7C] uppercase">
          {stat.label}
        </span>
        <Tag label={stat.tag} tone={stat.tone} />
      </div>
      <div className="flex items-end justify-between gap-2.5">
        <div className="min-w-0">
          <div
            className={cn(
              "font-heading text-xl font-bold tracking-tight whitespace-nowrap @[260px]:text-2xl",
              // Muted, so a card that could not load is visibly not a number
              // sitting next to three that are.
              stat.failed && "text-[#98A2B0]"
            )}
          >
            {stat.value}
          </div>
          <div className="mt-0.5 truncate text-xs text-[#5F6B7C]">{stat.sub}</div>
        </div>
        {/* The slot keeps its width whether or not there is a series, so a grid
            of four cards does not reflow when one has a sparkline and three
            do not. */}
        <div className="flex h-7.5 w-13 shrink-0 items-end justify-end gap-0.5">
          {stat.bars?.map((h, i) => (
            <div
              key={i}
              className="w-1.5 rounded-sm"
              style={{ height: `${h}%`, background: i === stat.hotBar ? "#33373D" : "#C9D0D9" }}
            />
          ))}
        </div>
      </div>
    </>
  )
}

export function StatCard({ stat }: { stat: Stat }) {
  // `href` arrives on every stat the server considers navigable and was being
  // dropped on the floor here, so the cards looked like links to their own
  // module and did nothing. A card without one stays a plain div rather than
  // becoming a button that goes nowhere.
  if (!stat.href) {
    return (
      <div className={SURFACE}>
        <CardBody stat={stat} />
      </div>
    )
  }

  return (
    <Link
      href={stat.href}
      className={cn(
        SURFACE,
        "transition-[box-shadow,transform,border-color] hover:border-[#CFD7E0] hover:shadow-[0_12px_28px_-12px_rgba(28,39,51,0.28)]",
        "active:translate-y-px focus-visible:ring-2 focus-visible:ring-[#17191C]/25 focus-visible:outline-none",
        "motion-reduce:transition-none"
      )}
    >
      <CardBody stat={stat} />
    </Link>
  )
}

export function StatsGrid({ stats }: { stats: Stat[] }) {
  return (
    <div
      className="relative z-10 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4"
      style={{ marginTop: -HERO_OVERLAP_PX }}
    >
      {stats.map((stat) => (
        <StatCard key={stat.label} stat={stat} />
      ))}
    </div>
  )
}
