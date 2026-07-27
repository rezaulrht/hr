import { ChartCard } from "@/components/dashboard/chart-card"
import { DataTable } from "@/components/dashboard/data-table"
import { HeroBanner } from "@/components/dashboard/hero-banner"
import { StatsGrid } from "@/components/dashboard/stat-card"
import { activityTable, chart, dashboard, stats } from "@/components/finance/data"

export default function FinanceDashboardPage() {
  return (
    <>
      <HeroBanner kicker={dashboard.kicker} heading={dashboard.heading} sub={dashboard.sub} cta={dashboard.cta} />

      <StatsGrid stats={stats} />

      <div className="mt-6 flex flex-wrap items-stretch gap-4">
        <ChartCard title={chart.title} sub={chart.sub} bars={chart.bars} />
        <div className="min-w-0 flex-[10_1_460px]">
          <DataTable
            title={activityTable.title}
            cols={activityTable.cols}
            headers={activityTable.headers}
            rows={activityTable.rows}
            action="View all"
          />
        </div>
      </div>
    </>
  )
}
