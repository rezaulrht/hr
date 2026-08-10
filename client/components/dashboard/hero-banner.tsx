import Link from "next/link"

import { Button } from "@/components/ui/button"

/**
 * How far the stat grid lifts into the hero.
 *
 * The hero's bottom padding reserves this space, the grid pulls up by it, and
 * the loading skeleton repeats it. Those were three separate magic numbers
 * that had to agree by hand, so changing the hero's padding silently broke the
 * overlap. They now read one value.
 */
export const HERO_OVERLAP_PX = 52

/** Breathing room between the hero's own copy and the cards that overlap it. */
const HERO_CLEARANCE_PX = 26

export function HeroBanner({
  kicker,
  heading,
  sub,
  cta,
  ctaHref,
  today,
}: {
  kicker: string
  heading: string
  sub: string
  cta: string
  /** When given, the CTA navigates. Without it the button is decorative. */
  ctaHref?: string
  /** Formatted by the caller, which owns the one clock read on this page. */
  today: string
}) {
  return (
    <div
      className="relative overflow-hidden rounded-b-md px-4.5 pt-6 text-white sm:px-7.5 sm:pt-7.5"
      style={{
        paddingBottom: HERO_OVERLAP_PX + HERO_CLEARANCE_PX,
        background: "linear-gradient(120deg, #17191C 0%, #33373D 55%, #17191C 100%)",
      }}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <div className="mb-2 text-[11.5px] font-bold tracking-[1.2px] text-[#C2C9D2] uppercase">
            {kicker}
          </div>
          <h1 className="font-heading mb-1.5 text-[22px] font-bold tracking-tight sm:text-[27px]">
            {heading}
          </h1>
          {/* Two facts, two lines. They were joined with a middle dot, which
              made the date look like part of the sentence after it. */}
          <div className="text-[13.5px] text-white/75">{sub}</div>
          <div className="mt-0.5 text-[12.5px] text-white/55">{today}</div>
        </div>

        {/* `Button` here has no `asChild`, so the link wraps it rather than
            replacing it. */}
        {ctaHref ? (
          <Link href={ctaHref} className="shrink-0">
            <Button className="h-auto rounded-md bg-white px-4 py-2.5 text-[13px] font-bold text-[#17191C] hover:bg-[#ECEEF1]">
              {cta}
            </Button>
          </Link>
        ) : (
          <Button className="h-auto shrink-0 rounded-md bg-white px-4 py-2.5 text-[13px] font-bold text-[#17191C] hover:bg-[#ECEEF1]">
            {cta}
          </Button>
        )}
      </div>
    </div>
  )
}
