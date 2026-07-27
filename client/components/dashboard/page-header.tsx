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
  cta: string
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 pt-7 pb-5.5">
      <div>
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">{kicker}</div>
        <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">{title}</h1>
        <div className="text-[13px] text-[#7A8698]">{sub}</div>
      </div>
      <Button className="h-auto rounded-md bg-[#17191C] px-4 py-2.5 text-[13px] font-bold text-white hover:bg-[#0E1012]">
        {cta}
      </Button>
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
