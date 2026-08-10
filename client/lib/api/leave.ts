import { apiFetch } from "./client"
import type {
  ApplyLeaveInput,
  CreateLeaveTypeInput,
  HalfDayWindow,
  LeaveBalanceItem,
  LeaveRequestItem,
  LeaveType,
  TeamMemberStatus,
  UpdateLeaveTypeInput,
} from "./types"

export function listLeaveTypes(accessToken: string): Promise<LeaveType[]> {
  return apiFetch<LeaveType[]>("/api/leave/types", { accessToken })
}

export function listLeaveRequests(accessToken: string): Promise<LeaveRequestItem[]> {
  return apiFetch<LeaveRequestItem[]>("/api/leave/requests", { accessToken })
}

export function getTeamStatus(accessToken: string): Promise<TeamMemberStatus[]> {
  return apiFetch<TeamMemberStatus[]>("/api/leave/team-status", { accessToken })
}

/**
 * The shift window a half day is measured against, for one date. Null when
 * the employee has no resolvable shift — the picker disables halves then.
 */
export function getHalfDayWindow(
  accessToken: string,
  date: string
): Promise<HalfDayWindow | null> {
  return apiFetch<HalfDayWindow | null>(`/api/leave/half-day-window?date=${date}`, {
    accessToken,
  })
}

export function getMyLeaveBalances(accessToken: string): Promise<LeaveBalanceItem[]> {
  return apiFetch<LeaveBalanceItem[]>("/api/leave/balances/me", { accessToken })
}

/**
 * Somebody else's leave balances, for the employee detail page's MANAGER/FULL
 * tiers. 403s for every other tier (see `getBalancesFor` in
 * leave.service.ts) — the caller treats that the same as "no data", not an
 * error.
 */
export function getLeaveBalancesFor(
  accessToken: string,
  employeeId: string
): Promise<LeaveBalanceItem[]> {
  return apiFetch<LeaveBalanceItem[]>(`/api/leave/balances/${employeeId}`, { accessToken })
}

export function applyForLeave(
  accessToken: string,
  input: ApplyLeaveInput
): Promise<LeaveRequestItem> {
  return apiFetch<LeaveRequestItem>("/api/leave/requests", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function approveLeaveRequest(accessToken: string, id: string): Promise<LeaveRequestItem> {
  return apiFetch<LeaveRequestItem>(`/api/leave/requests/${id}/approve`, {
    method: "PATCH",
    accessToken,
  })
}

export function rejectLeaveRequest(
  accessToken: string,
  id: string,
  note: string
): Promise<LeaveRequestItem> {
  return apiFetch<LeaveRequestItem>(`/api/leave/requests/${id}/reject`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ note }),
  })
}

export function revertLeaveRequest(
  accessToken: string,
  id: string,
  note: string
): Promise<LeaveRequestItem> {
  return apiFetch<LeaveRequestItem>(`/api/leave/requests/${id}/revert`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify({ note }),
  })
}

export function cancelLeaveRequest(accessToken: string, id: string): Promise<LeaveRequestItem> {
  return apiFetch<LeaveRequestItem>(`/api/leave/requests/${id}/cancel`, {
    method: "PATCH",
    accessToken,
  })
}

export function createLeaveType(
  accessToken: string,
  input: CreateLeaveTypeInput
): Promise<LeaveType> {
  return apiFetch<LeaveType>("/api/leave/types", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateLeaveType(
  accessToken: string,
  id: string,
  input: UpdateLeaveTypeInput
): Promise<LeaveType> {
  return apiFetch<LeaveType>(`/api/leave/types/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function deleteLeaveType(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/leave/types/${id}`, { method: "DELETE", accessToken })
}
