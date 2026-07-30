"use client"

import type { Payslip, PayslipLine } from "@/lib/api/types"
import { formatMoney, formatMonth, formatRate } from "@/lib/money"

function LineRows({ lines, currency }: { lines: PayslipLine[]; currency: Payslip["currency"] }) {
  if (lines.length === 0) {
    return <div className="py-2 text-[12.5px] text-[#A5AFBE]">None</div>
  }
  return (
    <>
      {lines.map((line) => (
        <div
          key={line.code}
          className="flex items-baseline justify-between border-b border-[#EEF1F5] py-2"
        >
          <div>
            <div className="text-[13px]">{line.label}</div>
            <div className="text-[11.5px] text-[#A5AFBE]">
              {line.calc === "PERCENT_OF_BASIC"
                ? `${line.value}% of basic`
                : line.calc === "ADJUSTMENT"
                  ? "Adjustment"
                  : "Fixed"}
            </div>
          </div>
          <div className="text-[13px]">{formatMoney(line.amount, currency)}</div>
        </div>
      ))}
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">{title}</div>
      <div className="mt-1">{children}</div>
    </div>
  )
}

export function PayslipDetail({ payslip, onClose }: { payslip: Payslip; onClose: () => void }) {
  const { breakdown, currency } = payslip
  const earningAdjustments = breakdown.adjustments.filter((a) => a.kind === "EARNING")
  const deductionAdjustments = breakdown.adjustments.filter((a) => a.kind === "DEDUCTION")

  return (
    <div className="space-y-5 rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-heading text-[18px] font-bold tracking-tight">
            {payslip.payrollRun
              ? formatMonth(payslip.payrollRun.month, payslip.payrollRun.year)
              : "Payslip"}
          </div>
          <div className="text-[12.5px] text-[#7A8698]">{payslip.payslipNo}</div>
        </div>
        <button className="text-[12.5px] font-semibold underline" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ["Calendar days", String(breakdown.attendance.calendarDays)],
          ["Payable days", String(breakdown.attendance.payableDays)],
          ["Loss of pay", String(breakdown.attendance.lopDays)],
          ["Paid leave", String(breakdown.attendance.onPaidLeave)],
        ].map(([label, value]) => (
          <div key={label}>
            <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">
              {label}
            </div>
            <div className="mt-0.5 text-[15px] font-semibold">{value}</div>
          </div>
        ))}
      </div>

      <Section title="Earnings">
        <LineRows lines={[...breakdown.earnings, ...earningAdjustments]} currency={currency} />
        <div className="flex justify-between pt-2 text-[13px] font-semibold">
          <span>Gross pay</span>
          <span>{formatMoney(payslip.grossPay, currency)}</span>
        </div>
      </Section>

      <Section title="Deductions">
        <LineRows lines={[...breakdown.deductions, ...deductionAdjustments]} currency={currency} />
        <div className="flex justify-between pt-2 text-[13px] font-semibold">
          <span>Total deductions</span>
          <span>−{formatMoney(payslip.totalDeductions, currency)}</span>
        </div>
      </Section>

      {/* Its own section, never folded into earnings: a reimbursement returns
          money already spent, and showing it as an earning misrepresents it
          as wages. */}
      {breakdown.reimbursements.length > 0 ? (
        <Section title="Reimbursements">
          {breakdown.reimbursements.map((claim) => (
            <div
              key={claim.claimId}
              className="flex items-baseline justify-between border-b border-[#EEF1F5] py-2"
            >
              <div>
                <div className="text-[13px]">{claim.category}</div>
                <div className="text-[11.5px] text-[#A5AFBE]">
                  Spent {claim.expenseDate}
                  {claim.spentCurrency === currency
                    ? ""
                    : ` · ${formatMoney(claim.spentAmount, claim.spentCurrency)} at ${formatRate(claim.fxRateToBdt)}`}
                </div>
              </div>
              <div className="text-[13px]">{formatMoney(claim.amount, currency)}</div>
            </div>
          ))}
        </Section>
      ) : null}

      <div className="flex items-center justify-between rounded-md bg-[#F5F7FA] px-4 py-3.5">
        <div>
          <div className="text-[11.5px] font-bold tracking-wide text-[#7A8698] uppercase">
            Net payable
          </div>
          <div className="text-[12px] text-[#7A8698]">
            Net pay {formatMoney(payslip.netPay, currency)} plus reimbursements{" "}
            {formatMoney(payslip.reimbursements, currency)}
          </div>
        </div>
        <div className="font-heading text-[20px] font-bold">
          {formatMoney(payslip.netPayable, currency)}
        </div>
      </div>

      {/* For a non-BDT payslip, the frozen rate and the BDT equivalent —
          because that is the figure that actually reached the bank. */}
      {currency !== "BDT" ? (
        <div className="rounded-md border border-[#E4E9EF] px-4 py-3 text-[12.5px] text-[#7A8698]">
          Converted at the rate frozen for this payroll month: 1 {currency} ={" "}
          {formatRate(payslip.fxRateToBdt)} BDT. Net payable{" "}
          <strong className="text-[#1C2733]">{formatMoney(payslip.netPayableBdt, "BDT")}</strong>,
          which is what the bank file pays.
        </div>
      ) : null}
    </div>
  )
}
