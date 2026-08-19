import type { ReactNode } from "react"
import type { RemixiconComponentType } from "@remixicon/react"

import { Button } from "@/components/ui/button"

export function PageHeader({
  kicker,
  title,
  sub,
  cta,
  onCta,
  aside,
}: {
  kicker: string
  title: string
  sub: string
  /** Omitted on pages whose actions live further down (payroll, expenses,
      settlements) — an empty string renders no button rather than a blank one. */
  cta?: string
  /**
   * What the button does. Until this existed the button was rendered with no
   * handler at all, so every page that passed `cta` got a primary action that
   * did nothing; the only caller doing so was the mock subpage, where nothing
   * was wired anyway. A `cta` without an `onCta` still renders inert, which is
   * what that caller expects.
   */
  onCta?: () => void
  /**
   * A control that belongs to the whole page rather than to one section: the
   * attendance and operating-cost month steppers.
   *
   * Rendered beside `cta` rather than instead of it. Operating costs needs
   * both, and having the aside silently swallow the button would have meant
   * either dropping the period control or leaving "Record a bill" adrift above
   * the tabs, which is where it was.
   */
  aside?: ReactNode
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-5 pb-4 sm:items-end sm:pt-7 sm:pb-5.5">
      <div>
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#5F6B7C] uppercase">{kicker}</div>
        <h1 className="font-heading mb-1 text-[20px] font-bold tracking-tight sm:text-[23px]">{title}</h1>
        <div className="text-[13px] text-[#5F6B7C]">{sub}</div>
      </div>
      {aside || cta ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {aside}
          {cta ? (
            <Button
              onClick={onCta}
              className="h-auto shrink-0 rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:bg-[#0E1012] active:translate-y-px motion-reduce:transition-none"
            >
              {cta}
            </Button>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function MiniStat({
  label,
  value,
  sub,
  icon: Icon,
}: {
  label: string
  value: string
  sub: string
  /**
   * Optional, and the tile is unchanged without one. Every existing caller
   * predates it, so a required glyph would have meant inventing one for
   * tiles whose subject has no obvious picture.
   */
  icon?: RemixiconComponentType
}) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4">
      <div className="flex items-center gap-1.5">
        {Icon ? <Icon className="size-3.5 shrink-0 text-[#8A94A2]" aria-hidden /> : null}
        <div className="text-[11.5px] font-bold tracking-wide text-[#5F6B7C] uppercase">{label}</div>
      </div>
      <div className="font-heading mt-1.5 text-[22px] font-bold tracking-tight tabular-nums">
        {value}
      </div>
      <div className="mt-0.5 text-xs text-[#5F6B7C]">{sub}</div>
    </div>
  )
}
