"use client"

import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"

import {
  acknowledgeAssignment,
  approveAssetRequest,
  getMyHoldings,
  listAssetRequests,
  listAssets,
  listCategories,
  listRepairs,
  listUnacknowledged,
  markAssetLost,
  rejectAssetRequest,
  retireAsset,
} from "@/lib/api/assets"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { Asset, AssetAssignment, AssetRepair, AssetRequest } from "@/lib/api/types"
import { formatMoney } from "@/lib/money"
import { PageHeader } from "@/components/dashboard/page-header"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { AssetDetail } from "@/components/asset/asset-detail"
import { AssignDialog } from "@/components/asset/assign-dialog"
import { ImportWizard } from "@/components/asset/import-wizard"
import { RepairDialog } from "@/components/asset/repair-dialog"
import { RequestDialog } from "@/components/asset/request-dialog"
import { ReturnDialog } from "@/components/asset/return-dialog"
import { DecisionDialog } from "@/components/leave/decision-dialog"
import {
  canDispose,
  canManageAssets,
  CONDITION_LABEL,
  formatAssetDate,
  isStaff,
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_TONE,
  STATUS_LABEL,
  STATUS_TONE,
} from "@/components/asset/asset-shared"

interface Filters {
  status?: string
  categoryId?: string
  q?: string
}

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ALL", label: "All statuses" },
  { value: "AVAILABLE", label: STATUS_LABEL.AVAILABLE },
  { value: "ASSIGNED", label: STATUS_LABEL.ASSIGNED },
  { value: "IN_REPAIR", label: STATUS_LABEL.IN_REPAIR },
  { value: "LOST", label: STATUS_LABEL.LOST },
  { value: "RETIRED", label: STATUS_LABEL.RETIRED },
]

function LoadError({ label, onRetry }: { label: string; onRetry: () => void }) {
  return (
    <div className="rounded-md border p-4 text-sm text-destructive">
      Failed to load {label}.{" "}
      <button className="font-semibold underline" onClick={onRetry}>
        Retry
      </button>
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-[15px] font-bold">{children}</div>
}

/** The register: every asset row, tag-first. Cost only renders when the
 *  server actually sent it — never from a role check re-derived here. */
function AssetTable({
  assets,
  onView,
  emptyLabel,
}: {
  assets: Asset[]
  onView: (id: string) => void
  emptyLabel: string
}) {
  if (assets.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyLabel}</p>
  }
  const showCost = assets.some((a) => "purchaseCost" in a)

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tag</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Location</TableHead>
            {showCost ? <TableHead>Cost</TableHead> : null}
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {assets.map((asset) => (
            <TableRow key={asset.id}>
              <TableCell className="font-medium">{asset.assetTag}</TableCell>
              <TableCell>{asset.name}</TableCell>
              <TableCell>{asset.category.name}</TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <Badge className={STATUS_TONE[asset.status]}>{STATUS_LABEL[asset.status]}</Badge>
                  {/* Rendered whenever there is a holder, IN_REPAIR included:
                      a named person can still be responsible while the asset
                      sits at the vendor, and collapsing that to one word
                      loses the answer the register exists to give. */}
                  {asset.heldBy ? (
                    <span className="text-xs text-muted-foreground">Held by {asset.heldBy.fullName}</span>
                  ) : null}
                </div>
              </TableCell>
              <TableCell>{asset.serialNumber ?? "—"}</TableCell>
              <TableCell>{asset.location ?? "—"}</TableCell>
              {showCost ? (
                <TableCell>
                  {"purchaseCost" in asset && asset.purchaseCost
                    ? formatMoney(asset.purchaseCost, asset.currency)
                    : "—"}
                </TableCell>
              ) : null}
              <TableCell>
                <Button type="button" size="sm" variant="outline" onClick={() => onView(asset.id)}>
                  View
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/** "What I'm holding" — the caller's own open and past custody. */
function HoldingsTable({
  assignments,
  onAcknowledge,
  acknowledgingId,
}: {
  assignments: AssetAssignment[]
  onAcknowledge?: (assignmentId: string) => void
  acknowledgingId: string | null
}) {
  const open = assignments.filter((a) => a.returnedAt === null)
  if (open.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing is currently assigned to you.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Condition out</TableHead>
            {onAcknowledge ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {open.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">
                {a.asset ? `${a.asset.assetTag} · ${a.asset.name}` : a.assetId}
              </TableCell>
              <TableCell>{a.asset?.category.name ?? "—"}</TableCell>
              <TableCell>{formatAssetDate(a.assignedAt)}</TableCell>
              <TableCell>{CONDITION_LABEL[a.conditionOut]}</TableCell>
              {onAcknowledge ? (
                <TableCell>
                  {a.acknowledgedAt === null ? (
                    <Button
                      type="button"
                      size="sm"
                      disabled={acknowledgingId === a.id}
                      onClick={() => onAcknowledge(a.id)}
                    >
                      {acknowledgingId === a.id ? "Acknowledging…" : "Acknowledge"}
                    </Button>
                  ) : (
                    <span className="text-xs text-muted-foreground">Acknowledged</span>
                  )}
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function UnacknowledgedTable({ assignments }: { assignments: AssetAssignment[] }) {
  if (assignments.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing outstanding.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Employee</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Condition out</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {assignments.map((a) => (
            <TableRow key={a.id}>
              <TableCell className="font-medium">
                {a.asset ? `${a.asset.assetTag} · ${a.asset.name}` : a.assetId}
              </TableCell>
              <TableCell>
                {a.employee ? `${a.employee.fullName} (${a.employee.employeeCode})` : a.employeeId}
              </TableCell>
              <TableCell>{formatAssetDate(a.assignedAt)}</TableCell>
              <TableCell>{CONDITION_LABEL[a.conditionOut]}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RepairsTable({ repairs }: { repairs: AssetRepair[] }) {
  if (repairs.length === 0) {
    return <p className="text-sm text-muted-foreground">No assets are currently in repair.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Asset</TableHead>
            <TableHead>Vendor</TableHead>
            <TableHead>Fault</TableHead>
            <TableHead>Sent</TableHead>
            <TableHead>Expected back</TableHead>
            <TableHead>Warranty</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {repairs.map((r) => (
            <TableRow key={r.id}>
              <TableCell className="font-medium">
                {r.asset ? `${r.asset.assetTag} · ${r.asset.name}` : r.assetId}
              </TableCell>
              <TableCell>{r.vendor ?? "—"}</TableCell>
              <TableCell className="max-w-55 truncate">{r.fault}</TableCell>
              <TableCell>{formatAssetDate(r.sentAt)}</TableCell>
              <TableCell>{formatAssetDate(r.expectedBack)}</TableCell>
              <TableCell>{r.isWarranty ? "Yes" : "No"}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

function RequestsTable({
  requests,
  ownEmployeeCode,
  canDecide,
  onApprove,
  onReject,
  approvingId,
}: {
  requests: AssetRequest[]
  ownEmployeeCode?: string
  canDecide: boolean
  onApprove: (id: string) => void
  onReject: (id: string) => void
  approvingId: string | null
}) {
  if (requests.length === 0) {
    return <p className="text-sm text-muted-foreground">No requests yet.</p>
  }
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Employee</TableHead>
            <TableHead>Category</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Status</TableHead>
            {canDecide ? <TableHead /> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {requests.map((r) => {
            // Nobody decides their own request — matching the server, so the
            // button never appears only to 403 when pressed.
            const isOwn = !!ownEmployeeCode && r.employee?.employeeCode === ownEmployeeCode
            return (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.employee ? `${r.employee.fullName} (${r.employee.employeeCode})` : r.employeeId}
                </TableCell>
                <TableCell>{r.category?.name ?? "—"}</TableCell>
                <TableCell className="max-w-55 truncate">{r.reason}</TableCell>
                <TableCell>
                  <Badge className={REQUEST_STATUS_TONE[r.status]}>{REQUEST_STATUS_LABEL[r.status]}</Badge>
                  {r.status === "REJECTED" && r.decisionNote ? (
                    <div className="mt-1 text-xs text-muted-foreground">{r.decisionNote}</div>
                  ) : null}
                </TableCell>
                {canDecide ? (
                  <TableCell>
                    {r.status === "PENDING" && !isOwn ? (
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          disabled={approvingId === r.id}
                          onClick={() => onApprove(r.id)}
                        >
                          Approve
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => onReject(r.id)}>
                          Reject
                        </Button>
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                ) : null}
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function RegisterFilters({
  filters,
  onChange,
  categories,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  categories: Array<{ id: string; name: string }>
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div>
        <Label className="mb-1.5 text-xs font-bold">Status</Label>
        <Select
          value={filters.status ?? "ALL"}
          onValueChange={(v) => onChange({ ...filters, status: v && v !== "ALL" ? v : undefined })}
        >
          <SelectTrigger className="w-40">
            <SelectValue>{(v: string | null) => STATUS_OPTIONS.find((o) => o.value === v)?.label ?? v}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label className="mb-1.5 text-xs font-bold">Category</Label>
        <Select
          value={filters.categoryId ?? "ALL"}
          onValueChange={(v) => onChange({ ...filters, categoryId: v && v !== "ALL" ? v : undefined })}
        >
          <SelectTrigger className="w-44">
            <SelectValue>
              {(v: string | null) =>
                v === "ALL" || !v ? "All categories" : (categories.find((c) => c.id === v)?.name ?? v)
              }
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All categories</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="min-w-50 flex-1">
        <Label className="mb-1.5 text-xs font-bold">Search</Label>
        <Input
          placeholder="Tag, name or serial"
          value={filters.q ?? ""}
          onChange={(e) => onChange({ ...filters, q: e.target.value || undefined })}
        />
      </div>
    </div>
  )
}

/**
 * One component, five roles. Branches on `useSession().user.role`, the
 * pattern leave, attendance and payroll already established — never five
 * separate page components.
 */
export function AssetPage() {
  const { accessToken, user, status: sessionStatus } = useSession()
  const queryClient = useQueryClient()

  const isAuthed = sessionStatus === "authenticated" && !!accessToken
  const role = user?.role
  const manage = !!role && canManageAssets(role)
  const dispose = !!role && canDispose(role)
  const staff = !!role && isStaff(role)
  const isManagerRole = role === "REPORTING_MANAGER"
  const ownEmployeeCode = user?.employeeCode

  const [filters, setFilters] = useState<Filters>({})
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [disposal, setDisposal] = useState<{ kind: "retire" | "lost"; assetId: string } | null>(null)
  const [rejecting, setRejecting] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assignTarget, setAssignTarget] = useState<string | null>(null)
  const [returnTarget, setReturnTarget] = useState<string | null>(null)
  const [repairTarget, setRepairTarget] = useState<string | null>(null)
  const [requestOpen, setRequestOpen] = useState(false)

  const categoriesQuery = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () => listCategories(accessToken!),
    enabled: isAuthed,
  })

  const registerQuery = useQuery({
    queryKey: ["assets", filters],
    queryFn: () => listAssets(accessToken!, filters),
    enabled: isAuthed && (manage || role === "FINANCE_OFFICER" || isManagerRole),
  })

  const holdingsQuery = useQuery({
    queryKey: ["assets", "me"],
    queryFn: () => getMyHoldings(accessToken!),
    enabled: isAuthed && staff,
  })

  const unacknowledgedQuery = useQuery({
    queryKey: ["assets", "unacknowledged"],
    queryFn: () => listUnacknowledged(accessToken!),
    enabled: isAuthed && manage,
  })

  const repairsQuery = useQuery({
    queryKey: ["assets", "repairs", "open"],
    queryFn: () => listRepairs(accessToken!, { open: true }),
    enabled: isAuthed && manage,
  })

  const requestsQuery = useQuery({
    queryKey: ["assets", "requests"],
    queryFn: () => listAssetRequests(accessToken!),
    enabled: isAuthed && (manage || staff),
  })

  // Status is derived, so one write can change what several lists say —
  // every mutation below invalidates the whole "assets" prefix, plus the
  // single-asset key when one is in view.
  function invalidateAssets() {
    queryClient.invalidateQueries({ queryKey: ["assets"] })
    if (selectedAssetId) queryClient.invalidateQueries({ queryKey: ["asset", selectedAssetId] })
  }

  function handleError(err: unknown) {
    setError(err instanceof ApiError ? err.message : "Something went wrong. Please try again.")
  }

  const acknowledgeMutation = useMutation({
    mutationFn: (assignmentId: string) => acknowledgeAssignment(accessToken!, assignmentId),
    onSuccess: () => {
      setError(null)
      invalidateAssets()
    },
    onError: handleError,
  })

  const retireMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => retireAsset(accessToken!, id, { note }),
    onSuccess: () => {
      setDisposal(null)
      invalidateAssets()
    },
    onError: handleError,
  })

  const markLostMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => markAssetLost(accessToken!, id, { note }),
    onSuccess: () => {
      setDisposal(null)
      invalidateAssets()
    },
    onError: handleError,
  })

  const approveRequestMutation = useMutation({
    mutationFn: (id: string) => approveAssetRequest(accessToken!, id),
    onSuccess: () => {
      setError(null)
      queryClient.invalidateQueries({ queryKey: ["assets", "requests"] })
    },
    onError: handleError,
  })

  const rejectRequestMutation = useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) => rejectAssetRequest(accessToken!, id, { note }),
    onSuccess: () => {
      setRejecting(null)
      queryClient.invalidateQueries({ queryKey: ["assets", "requests"] })
    },
    onError: handleError,
  })

  if (sessionStatus === "loading") {
    return (
      <div className="pt-7">
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  const categories = categoriesQuery.data ?? []
  const acknowledgingId = acknowledgeMutation.isPending ? (acknowledgeMutation.variables ?? null) : null
  const approvingId = approveRequestMutation.isPending ? (approveRequestMutation.variables ?? null) : null

  return (
    <>
      <PageHeader kicker="Workspace" title="Assets" sub="Company equipment, custody and repairs" />

      {error ? (
        <div className="mb-4 rounded-md border px-5 py-3.5 text-[12.5px] text-destructive">{error}</div>
      ) : null}

      {manage ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <RegisterFilters filters={filters} onChange={setFilters} categories={categories} />
            {/* No create-asset flow yet — that lands with the import wizard. */}
            <Button type="button" disabled title="Coming soon">
              Add asset
            </Button>
          </div>

          <Tabs defaultValue="register">
            <TabsList>
              <TabsTrigger value="register">Register</TabsTrigger>
              <TabsTrigger value="unacknowledged">
                Unacknowledged
                {unacknowledgedQuery.data?.length ? ` (${unacknowledgedQuery.data.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="repairs">
                Open repairs{repairsQuery.data?.length ? ` (${repairsQuery.data.length})` : ""}
              </TabsTrigger>
              <TabsTrigger value="requests">Requests</TabsTrigger>
              <TabsTrigger value="import">Import</TabsTrigger>
            </TabsList>

            <TabsContent value="register" className="pt-3">
              {registerQuery.isPending ? (
                <Skeleton className="h-40 w-full" />
              ) : registerQuery.isError ? (
                <LoadError label="the register" onRetry={() => registerQuery.refetch()} />
              ) : (
                <AssetTable
                  assets={registerQuery.data ?? []}
                  onView={setSelectedAssetId}
                  emptyLabel="No assets match these filters."
                />
              )}
            </TabsContent>

            <TabsContent value="unacknowledged" className="pt-3">
              {unacknowledgedQuery.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : unacknowledgedQuery.isError ? (
                <LoadError label="unacknowledged handovers" onRetry={() => unacknowledgedQuery.refetch()} />
              ) : (
                <UnacknowledgedTable assignments={unacknowledgedQuery.data ?? []} />
              )}
            </TabsContent>

            <TabsContent value="repairs" className="pt-3">
              {repairsQuery.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : repairsQuery.isError ? (
                <LoadError label="open repairs" onRetry={() => repairsQuery.refetch()} />
              ) : (
                <RepairsTable repairs={repairsQuery.data ?? []} />
              )}
            </TabsContent>

            <TabsContent value="requests" className="pt-3">
              {requestsQuery.isPending ? (
                <Skeleton className="h-32 w-full" />
              ) : requestsQuery.isError ? (
                <LoadError label="asset requests" onRetry={() => requestsQuery.refetch()} />
              ) : (
                <RequestsTable
                  requests={requestsQuery.data ?? []}
                  ownEmployeeCode={ownEmployeeCode}
                  canDecide
                  onApprove={(id) => approveRequestMutation.mutate(id)}
                  onReject={(id) => {
                    setError(null)
                    setRejecting(id)
                  }}
                  approvingId={approvingId}
                />
              )}
            </TabsContent>

            <TabsContent value="import" className="pt-3">
              <ImportWizard onImported={invalidateAssets} />
            </TabsContent>
          </Tabs>
        </div>
      ) : null}

      {!manage && role === "FINANCE_OFFICER" ? (
        <div className="space-y-4">
          <RegisterFilters filters={filters} onChange={setFilters} categories={categories} />
          {registerQuery.isPending ? (
            <Skeleton className="h-40 w-full" />
          ) : registerQuery.isError ? (
            <LoadError label="the register" onRetry={() => registerQuery.refetch()} />
          ) : (
            <AssetTable
              assets={registerQuery.data ?? []}
              onView={setSelectedAssetId}
              emptyLabel="No assets match these filters."
            />
          )}
        </div>
      ) : null}

      {isManagerRole ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[15px] font-bold">What I&apos;m holding</div>
              <Button type="button" size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
                Request an asset
              </Button>
            </div>
            {holdingsQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : holdingsQuery.isError ? (
              <LoadError label="your holdings" onRetry={() => holdingsQuery.refetch()} />
            ) : (
              <HoldingsTable
                assignments={holdingsQuery.data ?? []}
                onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                acknowledgingId={acknowledgingId}
              />
            )}
          </section>

          <section>
            <SectionTitle>My team&apos;s holdings</SectionTitle>
            {registerQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : registerQuery.isError ? (
              <LoadError label="your team's holdings" onRetry={() => registerQuery.refetch()} />
            ) : (
              <AssetTable
                assets={registerQuery.data ?? []}
                onView={setSelectedAssetId}
                emptyLabel="Nobody on your team is holding an asset right now."
              />
            )}
          </section>

          <section>
            <SectionTitle>Approvals</SectionTitle>
            {requestsQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : requestsQuery.isError ? (
              <LoadError label="requests" onRetry={() => requestsQuery.refetch()} />
            ) : (
              <RequestsTable
                requests={requestsQuery.data ?? []}
                ownEmployeeCode={ownEmployeeCode}
                canDecide
                onApprove={(id) => approveRequestMutation.mutate(id)}
                onReject={(id) => {
                  setError(null)
                  setRejecting(id)
                }}
                approvingId={approvingId}
              />
            )}
          </section>
        </div>
      ) : null}

      {role === "EMPLOYEE" ? (
        <div className="space-y-6">
          <section>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
              <div className="text-[15px] font-bold">What I&apos;m holding</div>
              <Button type="button" size="sm" variant="outline" onClick={() => setRequestOpen(true)}>
                Request an asset
              </Button>
            </div>
            {holdingsQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : holdingsQuery.isError ? (
              <LoadError label="your holdings" onRetry={() => holdingsQuery.refetch()} />
            ) : (
              <HoldingsTable
                assignments={holdingsQuery.data ?? []}
                onAcknowledge={(id) => acknowledgeMutation.mutate(id)}
                acknowledgingId={acknowledgingId}
              />
            )}
          </section>

          <section>
            <SectionTitle>My requests</SectionTitle>
            {requestsQuery.isPending ? (
              <Skeleton className="h-32 w-full" />
            ) : requestsQuery.isError ? (
              <LoadError label="your requests" onRetry={() => requestsQuery.refetch()} />
            ) : (
              <RequestsTable
                requests={requestsQuery.data ?? []}
                canDecide={false}
                onApprove={() => {}}
                onReject={() => {}}
                approvingId={null}
              />
            )}
          </section>
        </div>
      ) : null}

      <AssetDetail
        assetId={selectedAssetId}
        open={!!selectedAssetId}
        onOpenChange={(next) => !next && setSelectedAssetId(null)}
        // Assign/return/repair are HR / Super Admin only on the server —
        // Finance and managers view the same sheet with none of these.
        onAssign={manage ? (id) => setAssignTarget(id) : undefined}
        onReturn={manage ? (id) => setReturnTarget(id) : undefined}
        onSendRepair={manage ? (id) => setRepairTarget(id) : undefined}
        onRetire={dispose ? (id) => setDisposal({ kind: "retire", assetId: id }) : undefined}
        // Mark-lost is HR/Super Admin only on the server — Finance can retire
        // but not accuse an asset of being lost.
        onMarkLost={manage ? (id) => setDisposal({ kind: "lost", assetId: id }) : undefined}
        onAcknowledge={staff ? (assignmentId) => acknowledgeMutation.mutate(assignmentId) : undefined}
        acknowledgePending={acknowledgeMutation.isPending}
      />

      <AssignDialog
        assetId={assignTarget}
        open={!!assignTarget}
        onOpenChange={(next) => !next && setAssignTarget(null)}
        onSuccess={invalidateAssets}
      />

      <ReturnDialog
        assetId={returnTarget}
        open={!!returnTarget}
        onOpenChange={(next) => !next && setReturnTarget(null)}
        onSuccess={invalidateAssets}
      />

      <RepairDialog
        assetId={repairTarget}
        open={!!repairTarget}
        onOpenChange={(next) => !next && setRepairTarget(null)}
        onSuccess={invalidateAssets}
      />

      {staff ? (
        <RequestDialog
          open={requestOpen}
          onOpenChange={setRequestOpen}
          onSuccess={() => queryClient.invalidateQueries({ queryKey: ["assets", "requests"] })}
        />
      ) : null}

      {dispose ? (
        <DecisionDialog
          key={disposal ? `${disposal.kind}-${disposal.assetId}` : "none"}
          open={!!disposal}
          onOpenChange={(next) => !next && setDisposal(null)}
          title={disposal?.kind === "retire" ? "Retire this asset" : "Mark this asset lost"}
          confirmLabel={disposal?.kind === "retire" ? "Retire asset" : "Mark lost"}
          pending={retireMutation.isPending || markLostMutation.isPending}
          error={error}
          onConfirm={(note) => {
            if (!disposal) return
            if (disposal.kind === "retire") retireMutation.mutate({ id: disposal.assetId, note })
            else markLostMutation.mutate({ id: disposal.assetId, note })
          }}
        />
      ) : null}

      {manage || isManagerRole ? (
        <DecisionDialog
          key={rejecting ? `reject-${rejecting}` : "none"}
          open={!!rejecting}
          onOpenChange={(next) => !next && setRejecting(null)}
          title="Reject this request"
          confirmLabel="Reject request"
          pending={rejectRequestMutation.isPending}
          error={error}
          onConfirm={(note) => {
            if (rejecting) rejectRequestMutation.mutate({ id: rejecting, note })
          }}
        />
      ) : null}
    </>
  )
}
