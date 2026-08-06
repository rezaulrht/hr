import Link from "next/link"

import { Button } from "@/components/ui/button"

export function HeroBanner({
  kicker,
  heading,
  sub,
  cta,
  ctaHref,
}: {
  kicker: string
  heading: string
  sub: string
  cta: string
  /** When given, the CTA navigates. Without it the button is decorative. */
  ctaHref?: string
}) {
  const todayLong = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  })

  return (
    <div
      className="relative overflow-hidden rounded-b-md px-4.5 pt-6 pb-18 text-white sm:px-7.5 sm:pt-7.5 sm:pb-19.5"
      style={{ background: "linear-gradient(120deg, #17191C 0%, #33373D 55%, #17191C 100%)" }}
    >
      <div className="absolute top-[-80px] right-[-60px] size-65 rounded-full bg-white/6" />
      <div className="absolute top-10 right-15 size-30 rounded-full bg-white/5" />
      <div className="relative flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 text-xs font-bold tracking-[1.2px] text-[#B6BDC6] uppercase">{kicker}</div>
          <h1 className="font-heading mb-1.5 text-[22px] font-bold tracking-tight sm:text-[27px]">{heading}</h1>
          <div className="text-[13.5px] text-white/75">
            {todayLong} · {sub}
          </div>
        </div>
        {/* `Button` here has no `asChild`, so the link wraps it rather than
            replacing it. */}
        {ctaHref ? (
          <Link href={ctaHref}>
            <Button className="h-auto rounded-md bg-white px-4 py-2.5 text-[13px] font-bold text-[#17191C] hover:bg-[#ECEEF1]">
              {cta}
            </Button>
          </Link>
        ) : (
          <Button className="h-auto rounded-md bg-white px-4 py-2.5 text-[13px] font-bold text-[#17191C] hover:bg-[#ECEEF1]">
            {cta}
          </Button>
        )}
      </div>
    </div>
  )
}
