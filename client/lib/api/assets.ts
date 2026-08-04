import { apiFetch } from "./client"
import type {
  Asset,
  AssetAttachment,
  AssetAttachmentKind,
  AssetAssignment,
  AssetCategory,
  AssetImportCommitResult,
  AssetImportPreview,
  AssetRepair,
  AssetRequest,
  AssignAssetInput,
  ApproveAssetRequestInput,
  CreateAssetCategoryInput,
  CreateAssetInput,
  AssetLifecycleInput,
  FulfilAssetRequestInput,
  ReceiveAssetRepairInput,
  RejectAssetRequestInput,
  ReturnAssetInput,
  SendAssetRepairInput,
  SignedDocumentUrl,
  SubmitAssetRequestInput,
  UpdateAssetCategoryInput,
  UpdateAssetInput,
} from "./types"

export function listAssets(
  accessToken: string,
  query: { status?: string; categoryId?: string; departmentId?: string; q?: string } = {}
): Promise<Asset[]> {
  const params = new URLSearchParams()
  if (query.status) params.set("status", query.status)
  if (query.categoryId) params.set("categoryId", query.categoryId)
  if (query.departmentId) params.set("departmentId", query.departmentId)
  if (query.q) params.set("q", query.q)
  const qs = params.toString()
  return apiFetch<Asset[]>(`/api/assets${qs ? `?${qs}` : ""}`, { accessToken })
}

export function getAsset(accessToken: string, id: string): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}`, { accessToken })
}

export function createAsset(accessToken: string, input: CreateAssetInput): Promise<Asset> {
  return apiFetch<Asset>("/api/assets", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateAsset(
  accessToken: string,
  id: string,
  input: UpdateAssetInput
): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function retireAsset(
  accessToken: string,
  id: string,
  input: AssetLifecycleInput
): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}/retire`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function markAssetLost(
  accessToken: string,
  id: string,
  input: AssetLifecycleInput
): Promise<Asset> {
  return apiFetch<Asset>(`/api/assets/${id}/mark-lost`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function assignAsset(
  accessToken: string,
  id: string,
  input: AssignAssetInput
): Promise<AssetAssignment> {
  return apiFetch<AssetAssignment>(`/api/assets/${id}/assign`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function returnAsset(
  accessToken: string,
  id: string,
  input: ReturnAssetInput
): Promise<AssetAssignment> {
  return apiFetch<AssetAssignment>(`/api/assets/${id}/return`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function acknowledgeAssignment(
  accessToken: string,
  assignmentId: string
): Promise<AssetAssignment> {
  return apiFetch<AssetAssignment>(`/api/assets/assignments/${assignmentId}/acknowledge`, {
    method: "POST",
    accessToken,
  })
}

export function getMyHoldings(accessToken: string): Promise<AssetAssignment[]> {
  return apiFetch<AssetAssignment[]>("/api/assets/me", { accessToken })
}

export function listUnacknowledged(accessToken: string): Promise<AssetAssignment[]> {
  return apiFetch<AssetAssignment[]>("/api/assets/unacknowledged", { accessToken })
}

export function listCategories(accessToken: string): Promise<AssetCategory[]> {
  return apiFetch<AssetCategory[]>("/api/assets/categories", { accessToken })
}

export function createCategory(
  accessToken: string,
  input: CreateAssetCategoryInput
): Promise<AssetCategory> {
  return apiFetch<AssetCategory>("/api/assets/categories", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function updateCategory(
  accessToken: string,
  id: string,
  input: UpdateAssetCategoryInput
): Promise<AssetCategory> {
  return apiFetch<AssetCategory>(`/api/assets/categories/${id}`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function submitAssetRequest(
  accessToken: string,
  input: SubmitAssetRequestInput
): Promise<AssetRequest> {
  return apiFetch<AssetRequest>("/api/assets/requests", {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function listAssetRequests(accessToken: string): Promise<AssetRequest[]> {
  return apiFetch<AssetRequest[]>("/api/assets/requests", { accessToken })
}

export function approveAssetRequest(
  accessToken: string,
  id: string,
  input: ApproveAssetRequestInput = {}
): Promise<AssetRequest> {
  return apiFetch<AssetRequest>(`/api/assets/requests/${id}/approve`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function rejectAssetRequest(
  accessToken: string,
  id: string,
  input: RejectAssetRequestInput
): Promise<AssetRequest> {
  return apiFetch<AssetRequest>(`/api/assets/requests/${id}/reject`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function cancelAssetRequest(accessToken: string, id: string): Promise<AssetRequest> {
  return apiFetch<AssetRequest>(`/api/assets/requests/${id}/cancel`, {
    method: "PATCH",
    accessToken,
  })
}

export function fulfilAssetRequest(
  accessToken: string,
  id: string,
  input: FulfilAssetRequestInput
): Promise<AssetRequest> {
  return apiFetch<AssetRequest>(`/api/assets/requests/${id}/fulfil`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function sendForRepair(
  accessToken: string,
  id: string,
  input: SendAssetRepairInput
): Promise<AssetRepair> {
  return apiFetch<AssetRepair>(`/api/assets/${id}/repairs`, {
    method: "POST",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function receiveFromRepair(
  accessToken: string,
  repairId: string,
  input: ReceiveAssetRepairInput
): Promise<AssetRepair> {
  return apiFetch<AssetRepair>(`/api/assets/repairs/${repairId}/receive`, {
    method: "PATCH",
    accessToken,
    body: JSON.stringify(input),
  })
}

export function listRepairs(
  accessToken: string,
  query: { open?: boolean } = {}
): Promise<AssetRepair[]> {
  const params = new URLSearchParams()
  if (query.open !== undefined) params.set("open", String(query.open))
  const qs = params.toString()
  return apiFetch<AssetRepair[]>(`/api/assets/repairs${qs ? `?${qs}` : ""}`, { accessToken })
}

export function uploadAssetAttachment(
  accessToken: string,
  assetId: string,
  kind: AssetAttachmentKind,
  file: File
): Promise<AssetAttachment> {
  const body = new FormData()
  body.append("kind", kind)
  body.append("file", file)
  // No Content-Type header: apiFetch detects FormData and lets the browser
  // set the multipart boundary itself.
  return apiFetch<AssetAttachment>(`/api/assets/${assetId}/attachments`, {
    method: "POST",
    accessToken,
    body,
  })
}

export function uploadAssignmentAttachment(
  accessToken: string,
  assignmentId: string,
  kind: "CONDITION_OUT" | "CONDITION_IN",
  file: File
): Promise<AssetAttachment> {
  const body = new FormData()
  body.append("kind", kind)
  body.append("file", file)
  return apiFetch<AssetAttachment>(`/api/assets/assignments/${assignmentId}/attachments`, {
    method: "POST",
    accessToken,
    body,
  })
}

export function getAttachmentUrl(accessToken: string, id: string): Promise<SignedDocumentUrl> {
  return apiFetch<SignedDocumentUrl>(`/api/assets/attachments/${id}/url`, { accessToken })
}

export function deleteAttachment(accessToken: string, id: string): Promise<void> {
  return apiFetch<void>(`/api/assets/attachments/${id}`, {
    method: "DELETE",
    accessToken,
  })
}

export function previewAssetImport(
  accessToken: string,
  file: File
): Promise<AssetImportPreview> {
  const body = new FormData()
  body.append("file", file)
  // No Content-Type header: apiFetch detects FormData and lets the browser
  // set the multipart boundary itself.
  return apiFetch<AssetImportPreview>("/api/assets/import/preview", {
    method: "POST",
    accessToken,
    body,
  })
}

export function commitAssetImport(
  accessToken: string,
  file: File
): Promise<AssetImportCommitResult> {
  const body = new FormData()
  body.append("file", file)
  return apiFetch<AssetImportCommitResult>("/api/assets/import/commit", {
    method: "POST",
    accessToken,
    body,
  })
}
