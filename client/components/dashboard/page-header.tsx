import type { ReactNode } from "react"

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
   * attendance month stepper, and whatever the period pickers turn out to be
   * elsewhere. Rendered in the same slot as `cta`, which is why the two are
   * not both shown.
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
      {aside ? (
        <div className="shrink-0">{aside}</div>
      ) : cta ? (
        <Button
          onClick={onCta}
          className="h-auto shrink-0 rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:bg-[#0E1012] active:translate-y-px motion-reduce:transition-none"
        >
          {cta}
        </Button>
      ) : null}
    </div>
  )
}

export function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4">
      <div className="text-[11.5px] font-bold tracking-wide text-[#5F6B7C] uppercase">{label}</div>
      <div className="font-heading mt-1.5 text-[22px] font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-[#5F6B7C]">{sub}</div>
    </div>
  )
}
