import { DataTable } from "@/components/dashboard/data-table"
import { MiniStat, PageHeader } from "@/components/dashboard/page-header"
import type { SubpageData } from "@/components/dashboard/types"

export function SubpagePage({ data }: { data: SubpageData }) {
  return (
    <>
      <PageHeader kicker={data.kicker} title={data.title} sub={data.sub} cta={data.cta} />
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(215px,1fr))] gap-4">
        {data.stats.map((stat) => (
          <MiniStat key={stat.label} label={stat.label} value={stat.value} sub={stat.sub} />
        ))}
      </div>
      <DataTable title={data.tableTitle} cols={data.cols} headers={data.headers} rows={data.rows} />
    </>
  )
}
