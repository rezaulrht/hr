import { Tag } from "@/components/dashboard/tag"
import { HeroBanner } from "@/components/dashboard/hero-banner"
import { StatsGrid } from "@/components/dashboard/stat-card"
import { tones } from "@/components/dashboard/types"
import { activity, dashboard, stats, timeClock } from "@/components/employee/data"
import { Button } from "@/components/ui/button"

export default function EmployeeDashboardPage() {
  return (
    <>
      <HeroBanner kicker={dashboard.kicker} heading={dashboard.heading} sub={dashboard.sub} cta={dashboard.cta} />

      <StatsGrid stats={stats} />

      <div className="mt-6 flex flex-wrap items-stretch gap-4">
        <div className="flex min-w-70 max-w-90 flex-1 flex-col gap-3.5 rounded-md bg-linear-to-br from-[#17191C] to-[#0E1012] p-5.5 text-white">
          <div className="flex items-center justify-between">
            <div className="text-[13px] font-semibold text-white/75">Time clock</div>
            <span
              className="rounded px-2.5 py-0.5 text-[11px] font-bold"
              style={{ background: timeClock.checkedIn ? "#2FA75C" : "rgba(255,255,255,0.18)" }}
            >
              {timeClock.checkedIn ? "Checked in" : "Checked out"}
            </span>
          </div>
          <div>
            <div className="font-heading text-[32px] font-bold tracking-tight tabular-nums">
              {timeClock.displayTime}
            </div>
            <div className="mt-0.5 text-[12.5px] text-white/65">
              {timeClock.checkedIn ? "Checked in at 9:02 AM" : "You have not checked in yet"}
            </div>
          </div>
          <Button className="h-auto rounded-md bg-white px-3 py-3 text-sm font-bold text-[#17191C] hover:brightness-[1.06]">
            {timeClock.checkedIn ? "Check out" : "Check in"}
          </Button>
          <div className="flex justify-between border-t border-white/15 pt-3 text-xs text-white/65">
            <span>{timeClock.shift}</span>
            <span>{timeClock.hoursToday} today</span>
          </div>
        </div>

        <div className="min-w-0 flex-[10_1_460px] rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
          <div className="mb-3.5 flex items-center justify-between">
            <div className="text-[15px] font-bold">Recent activity</div>
            <span className="text-[12.5px] font-semibold">View all</span>
          </div>
          <div className="flex flex-col">
            {activity.map((item, i) => (
              <div
                key={item.title}
                className="flex items-center gap-3.5 py-2.5"
                style={{ borderTop: i === 0 ? "none" : "1px solid #EEF1F5" }}
              >
                <div
                  className="grid size-8.5 shrink-0 place-items-center rounded text-[13px] font-extrabold"
                  style={{ background: tones[item.tone].bg, color: tones[item.tone].color }}
                >
                  {item.initial}
                </div>
                <div className="min-w-0 flex-1 leading-snug">
                  <div className="text-[13.5px] font-semibold">{item.title}</div>
                  <div className="text-xs text-[#7A8698]">{item.meta}</div>
                </div>
                {item.status ? <Tag label={item.status} tone={item.statusTone ?? "neutral"} /> : null}
                <span className="w-14 shrink-0 text-right text-[11.5px] text-[#A5AFBE]">{item.time}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  )
}
