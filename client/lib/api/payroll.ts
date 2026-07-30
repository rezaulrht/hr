import { apiFetch, apiFetchBlob } from "./client"
import type {
  AdjustmentInput,
  BankFileManifest,
  BankFileSummary,
  Currency,
  EmailStatus,
  ExchangeRate,
  ExchangeRateInput,
  PayrollAdjustment,
  PayrollRun,
  Payslip,
  PreflightReport,
  SalaryStructure,
  SalaryStructureInput,
} from "./types"

// ── exchange rates ────────────────────────────────────────────────────────

export function listExchangeRates(accessToken: string): Promise<ExchangeRate[]> {
  return apiFetch<ExchangeRate[]>("/api/payroll/exchange-rates", { accessToken })
}

export function createExchangeRate(
  accessToken: string,
  input: ExchangeRateInput
): Promise<ExchangeRate> {
  return apiFetch<ExchangeRate>("/api/payroll/exchange-rates", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateExchangeRate(
  accessToken: string,
  id: string,
  input: ExchangeRateInput
): Promise<ExchangeRate> {
  return apiFetch<ExchangeRate>(`/api/payroll/exchange-rates/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

// ── salary structures ─────────────────────────────────────────────────────

export function listSalaryStructures(accessToken: string): Promise<SalaryStructure[]> {
  return apiFetch<SalaryStructure[]>("/api/payroll/salary-structures", { accessToken })
}

export function createSalaryStructure(
  accessToken: string,
  input: SalaryStructureInput
): Promise<SalaryStructure> {
  return apiFetch<SalaryStructure>("/api/payroll/salary-structures", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateSalaryStructure(
  accessToken: string,
  id: string,
  input: SalaryStructureInput
): Promise<SalaryStructure> {
  return apiFetch<SalaryStructure>(`/api/payroll/salary-structures/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

// ── runs ──────────────────────────────────────────────────────────────────

export function listPayrollRuns(accessToken: string): Promise<PayrollRun[]> {
  return apiFetch<PayrollRun[]>("/api/payroll/runs", { accessToken })
}

export function getPayrollRun(accessToken: string, id: string): Promise<PayrollRun> {
  return apiFetch<PayrollRun>(`/api/payroll/runs/${id}`, { accessToken })
}

export function getPreflight(accessToken: string, id: string): Promise<PreflightReport> {
  return apiFetch<PreflightReport>(`/api/payroll/runs/${id}/preflight`, { accessToken })
}

export function createPayrollRun(
  accessToken: string,
  input: { month: number; year: number; notes?: string }
): Promise<PayrollRun> {
  return apiFetch<PayrollRun>("/api/payroll/runs", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

const runAction = (action: string) => (accessToken: string, id: string) =>
  apiFetch<PayrollRun>(`/api/payroll/runs/${id}/${action}`, { method: "POST", accessToken })

export const processPayrollRun = runAction("process")
export const submitPayrollRun = runAction("submit")
export const approvePayrollRun = runAction("approve")
export const disbursePayrollRun = runAction("disburse")

export function rejectPayrollRun(
  accessToken: string,
  id: string,
  note: string
): Promise<PayrollRun> {
  return apiFetch<PayrollRun>(`/api/payroll/runs/${id}/reject`, {
    method: "POST",
    accessToken,
    body: JSON.stringify({ note }),
  })
}

// ── payslips ──────────────────────────────────────────────────────────────

export function getMyPayslips(accessToken: string): Promise<Payslip[]> {
  return apiFetch<Payslip[]>("/api/payroll/payslips/me", { accessToken })
}

export function getEmployeePayslips(accessToken: string, employeeId: string): Promise<Payslip[]> {
  return apiFetch<Payslip[]>(`/api/payroll/payslips/employee/${employeeId}`, { accessToken })
}

export function getPayslip(accessToken: string, id: string): Promise<Payslip> {
  return apiFetch<Payslip>(`/api/payroll/payslips/${id}`, { accessToken })
}

/** The PDF is a blob, not JSON — see `apiFetchBlob`. */
export async function downloadPayslipPdf(accessToken: string, id: string): Promise<Blob> {
  const { blob } = await apiFetchBlob(`/api/payroll/payslips/${id}/pdf`, { accessToken })
  return blob
}

// ── adjustments ───────────────────────────────────────────────────────────

export function listAdjustments(
  accessToken: string,
  query: { month?: number; year?: number; employeeId?: string } = {}
): Promise<PayrollAdjustment[]> {
  const params = new URLSearchParams()
  if (query.month !== undefined) params.set("month", String(query.month))
  if (query.year !== undefined) params.set("year", String(query.year))
  if (query.employeeId) params.set("employeeId", query.employeeId)
  const qs = params.toString()
  return apiFetch<PayrollAdjustment[]>(`/api/payroll/adjustments${qs ? `?${qs}` : ""}`, {
    accessToken,
  })
}

export function createAdjustment(
  accessToken: string,
  input: AdjustmentInput
): Promise<PayrollAdjustment> {
  return apiFetch<PayrollAdjustment>("/api/payroll/adjustments", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function deleteAdjustment(accessToken: string, id: string): Promise<{ id: string }> {
  return apiFetch<{ id: string }>(`/api/payroll/adjustments/${id}`, {
    method: "DELETE",
    accessToken,
  })
}

// ── bank files ────────────────────────────────────────────────────────────

/**
 * Returns the CSV *and* its manifest. The manifest rides in a response
 * header so a download still carries the completeness evidence — a file that
 * silently omitted every USD employee would otherwise look like success.
 */
export async function downloadBankFile(
  accessToken: string,
  runId: string,
  currency: Currency
): Promise<{ blob: Blob; manifest: BankFileManifest | null }> {
  const { blob, headers } = await apiFetchBlob(
    `/api/payroll/runs/${runId}/bank-file?currency=${currency}`,
    { accessToken }
  )
  const raw = headers.get("X-Bankfile-Manifest")
  return { blob, manifest: raw ? (JSON.parse(raw) as BankFileManifest) : null }
}

export function getBankFileSummary(accessToken: string, runId: string): Promise<BankFileSummary> {
  return apiFetch<BankFileSummary>(`/api/payroll/runs/${runId}/bank-file/summary`, { accessToken })
}

// ── email ─────────────────────────────────────────────────────────────────

export function emailPayslips(
  accessToken: string,
  runId: string
): Promise<{ queued: boolean; runId: string }> {
  return apiFetch<{ queued: boolean; runId: string }>(`/api/payroll/runs/${runId}/email`, {
    method: "POST",
    accessToken,
  })
}

export function getEmailStatus(accessToken: string, runId: string): Promise<EmailStatus> {
  return apiFetch<EmailStatus>(`/api/payroll/runs/${runId}/email-status`, { accessToken })
}
