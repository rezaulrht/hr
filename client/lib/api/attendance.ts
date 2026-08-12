import { apiFetch } from "./client"
import type {
  ApprovalItem,
  AttendanceDay,
  AuditEntry,
  BulkDecisionResult,
  DailySummary,
  HolidayItem,
  HolidayType,
  HolidayWriteResult,
  MonthlyAttendanceSummary,
  PunchResult,
  TodayAttendance,
} from "./types"

// ── Punching ──────────────────────────────────
// Neither call sends a body. The server owns the time: a client-supplied
// timestamp is spoofable and wrong the moment you open the app abroad.

export function checkIn(accessToken: string): Promise<PunchResult> {
  return apiFetch<PunchResult>("/api/attendance/check-in", { method: "POST", accessToken })
}

export function checkOut(accessToken: string): Promise<PunchResult> {
  return apiFetch<PunchResult>("/api/attendance/check-out", { method: "POST", accessToken })
}

export function getToday(accessToken: string): Promise<TodayAttendance> {
  return apiFetch<TodayAttendance>("/api/attendance/today", { accessToken })
}

// ── Reading ───────────────────────────────────

function range(from?: string, to?: string): string {
  const params = new URLSearchParams()
  if (from) params.set("from", from)
  if (to) params.set("to", to)
  const query = params.toString()
  return query ? `?${query}` : ""
}

export function getMyAttendance(
  accessToken: string,
  from?: string,
  to?: string
): Promise<AttendanceDay[]> {
  return apiFetch<AttendanceDay[]>(`/api/attendance/me${range(from, to)}`, { accessToken })
}

export function getEmployeeAttendance(
  accessToken: string,
  employeeId: string,
  from?: string,
  to?: string
): Promise<AttendanceDay[]> {
  return apiFetch<AttendanceDay[]>(
    `/api/attendance/history/${employeeId}${range(from, to)}`,
    { accessToken }
  )
}

export function getDailySummary(accessToken: string, date?: string): Promise<DailySummary> {
  return apiFetch<DailySummary>(
    `/api/attendance/summary/daily${date ? `?date=${date}` : ""}`,
    { accessToken }
  )
}

export function getMonthlySummary(
  accessToken: string,
  month: number,
  year: number
): Promise<MonthlyAttendanceSummary[]> {
  return apiFetch<MonthlyAttendanceSummary[]>(
    `/api/attendance/summary/monthly?month=${month}&year=${year}`,
    { accessToken }
  )
}

// ── Approvals ─────────────────────────────────

export function getApprovals(
  accessToken: string,
  status: "PENDING" | "APPROVED" | "REJECTED" = "PENDING",
  minAgingDays?: number
): Promise<ApprovalItem[]> {
  const params = new URLSearchParams({ status })
  if (minAgingDays !== undefined) params.set("minAgingDays", String(minAgingDays))
  return apiFetch<ApprovalItem[]>(`/api/attendance/approvals?${params}`, { accessToken })
}

/**
 * Deciding one record at a time is `bulkDecideAttendance` with one id.
 *
 * The single-record wrappers over `PATCH /:id/approve` and `PATCH /:id/reject`
 * were never called: the approvals queue has always used the bulk route, which
 * enforces the same rule (`bulkDecisionSchema` refines a reason as required on
 * REJECT, exactly as `rejectSchema` does). The server routes remain.
 */
export function bulkDecideAttendance(
  accessToken: string,
  ids: string[],
  decision: "APPROVE" | "REJECT",
  note?: string
): Promise<BulkDecisionResult[]> {
  return apiFetch<BulkDecisionResult[]>("/api/attendance/approvals/bulk", {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ ids, decision, note }),
  })
}

// ── Amendments ────────────────────────────────

/** The employee fixing their own day. Always returns to PENDING. */
export function regulariseAttendance(
  accessToken: string,
  id: string,
  body: { checkIn?: string; checkOut?: string; note: string }
) {
  return apiFetch<{ id: string; approval: string }>(`/api/attendance/me/${id}/regularise`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(body),
  })
}

/** HR acting with authority. Settles the record as approved. */
export function correctAttendance(
  accessToken: string,
  id: string,
  body: { checkIn?: string; checkOut?: string; note: string }
) {
  return apiFetch<{ id: string; approval: string }>(`/api/attendance/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(body),
  })
}

export function createManualAttendance(
  accessToken: string,
  body: { employeeId: string; date: string; checkIn?: string; checkOut?: string; note: string }
) {
  return apiFetch<{ id: string }>("/api/attendance/manual", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  })
}

export function getAuditTrail(accessToken: string, id: string): Promise<AuditEntry[]> {
  return apiFetch<AuditEntry[]>(`/api/attendance/${id}/audit`, { accessToken })
}

// ── Holidays ──────────────────────────────────

export function listHolidays(accessToken: string, year: number): Promise<HolidayItem[]> {
  return apiFetch<HolidayItem[]>(`/api/attendance/holidays?year=${year}`, { accessToken })
}

export function createHoliday(
  accessToken: string,
  body: { name: string; date: string; type: HolidayType }
): Promise<HolidayWriteResult> {
  return apiFetch<HolidayWriteResult>("/api/attendance/holidays", {
    method: "POST",
    accessToken,
    body: JSON.stringify(body),
  })
}

export function updateHoliday(
  accessToken: string,
  id: string,
  body: { name?: string; date?: string; type?: HolidayType }
): Promise<HolidayWriteResult> {
  return apiFetch<HolidayWriteResult>(`/api/attendance/holidays/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(body),
  })
}

export function deleteHoliday(accessToken: string, id: string) {
  return apiFetch<{ impact?: HolidayWriteResult["impact"] }>(
    `/api/attendance/holidays/${id}`,
    { method: "DELETE", accessToken }
  )
}
