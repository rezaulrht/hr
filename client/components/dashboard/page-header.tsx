import { Button } from "@/components/ui/button"

export function PageHeader({
  kicker,
  title,
  sub,
  cta,
}: {
  kicker: string
  title: string
  sub: string
  /** Omitted on pages whose actions live further down (payroll, expenses,
      settlements) — an empty string renders no button rather than a blank one. */
  cta?: string
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-5 pb-4 sm:items-end sm:pt-7 sm:pb-5.5">
      <div>
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">{kicker}</div>
        <h1 className="font-heading mb-1 text-[20px] font-bold tracking-tight sm:text-[23px]">{title}</h1>
        <div className="text-[13px] text-[#7A8698]">{sub}</div>
      </div>
      {cta ? (
        <Button className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]">
          {cta}
        </Button>
      ) : null}
    </div>
  )
}

export function MiniStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-4">
      <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">{label}</div>
      <div className="font-heading mt-1.5 text-[22px] font-bold tracking-tight">{value}</div>
      <div className="mt-0.5 text-xs text-[#7A8698]">{sub}</div>
    </div>
  )
}
