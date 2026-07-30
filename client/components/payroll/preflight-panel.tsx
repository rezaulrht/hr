"use client"

import type { PreflightReport } from "@/lib/api/types"
import { BLOCKER_FIX } from "@/components/payroll/payroll-shared"

/**
 * The five blockers as a checklist with names, each saying where it gets
 * fixed. This is the feature, not a warning strip: a gate that says "cannot
 * process" gets worked around, one that names who is blocking gets cleared.
 */
export function PreflightPanel({ report }: { report: PreflightReport }) {
  if (report.ok) {
    return (
      <div className="rounded-md border border-[#CDE7D4] bg-[#F3FAF5] px-5 py-4">
        <div className="text-[13px] font-semibold text-[#2F6B42]">Ready to process</div>
        <div className="mt-0.5 text-[12.5px] text-[#4A7A58]">
          Every precondition is clear for this month.
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="text-[15px] font-bold">
        {report.blockers.length} thing{report.blockers.length === 1 ? "" : "s"} to clear before
        processing
      </div>
      <div className="mt-0.5 text-[12.5px] text-[#7A8698]">
        Processing stays disabled until each of these is resolved.
      </div>

      <ul className="mt-4 space-y-3.5">
        {report.blockers.map((blocker) => {
          const meta = BLOCKER_FIX[blocker.code]
          return (
            <li key={blocker.code} className="rounded-md border border-[#F0D9D9] bg-[#FDF6F6] p-4">
              <div className="text-[13px] font-semibold text-[#B03A3A]">{meta.title}</div>
              <div className="mt-1 text-[12.5px] text-[#1C2733]">{blocker.message}</div>
              <div className="mt-1.5 text-[12px] text-[#7A8698]">{meta.fix}</div>

              {blocker.employees.length > 0 ? (
                <ul className="mt-2.5 space-y-1">
                  {blocker.employees.map((employee) => (
                    <li
                      key={employee.employeeId}
                      className="flex flex-wrap items-baseline gap-x-2 text-[12.5px]"
                    >
                      <span className="font-semibold">{employee.fullName}</span>
                      <span className="text-[#A5AFBE]">{employee.employeeCode}</span>
                      <span className="text-[#7A8698]">— {employee.detail}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
