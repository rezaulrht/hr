/**
 * Bulk payslip email — a job, not a request.
 *
 * `POST /runs/:id/email` queues this and returns immediately. Rendering 500
 * PDFs inside an HTTP request is a multi-minute call any proxy will time
 * out; worse, a failure halfway leaves no record of who did receive theirs.
 *
 * So it runs sequentially through the shared browser, setting `emailedAt` per
 * payslip on success and `emailError` per payslip on failure. A partial send
 * is then reportable and re-runnable rather than all-or-nothing.
 */

import prisma from "../config/prisma"
import { sendPayslipEmail } from "../modules/payroll/payroll.mailer"
import { getOrRenderPayslipPdf } from "../modules/payroll/payroll.pdf"
import { toMoneyString } from "../modules/payroll/payroll.money"

/** Runs currently sending, so a second request cannot start a duplicate. */
const inFlight = new Set<string>()

export function isEmailRunInFlight(runId: string): boolean {
  return inFlight.has(runId)
}

export interface EmailRunResult {
  total: number
  sent: number
  failed: number
}

export async function emailPayslipsForRun(runId: string): Promise<EmailRunResult> {
  if (inFlight.has(runId)) return { total: 0, sent: 0, failed: 0 }
  inFlight.add(runId)

  try {
    const payslips = await prisma.payslip.findMany({
      where: { payrollRunId: runId },
      include: {
        employee: { select: { fullName: true, user: { select: { email: true } } } },
        payrollRun: { select: { month: true, year: true } },
      },
    })

    let sent = 0
    let failed = 0

    for (const payslip of payslips) {
      const to = payslip.employee.user?.email
      try {
        if (!to) throw new Error("Employee has no email address")
        // Re-emailing is allowed and does not re-render a cached PDF.
        const pdf = await getOrRenderPayslipPdf(payslip.id)
        await sendPayslipEmail({
          to,
          fullName: payslip.employee.fullName,
          payslipNo: payslip.payslipNo,
          month: payslip.payrollRun.month,
          year: payslip.payrollRun.year,
          currency: payslip.currency,
          netPayable: toMoneyString(payslip.netPayable),
          pdf,
        })
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: { emailedAt: new Date(), emailError: null },
        })
        sent += 1
      } catch (err) {
        failed += 1
        await prisma.payslip.update({
          where: { id: payslip.id },
          data: { emailError: err instanceof Error ? err.message : String(err) },
        })
      }
    }

    return { total: payslips.length, sent, failed }
  } finally {
    inFlight.delete(runId)
  }
}

export interface EmailStatus {
  total: number
  sent: number
  failed: number
  inProgress: boolean
}

export async function getEmailStatus(runId: string): Promise<EmailStatus> {
  const [total, sent, failed] = await Promise.all([
    prisma.payslip.count({ where: { payrollRunId: runId } }),
    prisma.payslip.count({ where: { payrollRunId: runId, emailedAt: { not: null } } }),
    prisma.payslip.count({ where: { payrollRunId: runId, emailError: { not: null } } }),
  ])
  return { total, sent, failed, inProgress: inFlight.has(runId) }
}
