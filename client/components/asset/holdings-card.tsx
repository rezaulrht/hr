"use client"

import { useQuery } from "@tanstack/react-query"

import { listAssets } from "@/lib/api/assets"
import { useSession } from "@/lib/auth/session-context"
import { formatAssetDate } from "@/components/asset/asset-shared"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/**
 * "What they're holding" on the employee detail page. There is no
 * per-employee holdings endpoint, so this reuses `listAssets` — already
 * scoped server-side by `assetScopeFor` (a Reporting Manager only ever gets
 * back their own reports' open custody, matching `/manager/team/[id]`) — and
 * filters to this one employee's `heldBy` client-side.
 *
 * No cost fields, deliberately: this card renders on the manager route too,
 * and `Asset` omits `purchaseCost`/`vendor` for that role at the source, so
 * there is nothing here that could leak them even by accident.
 */
export function HoldingsCard({ employeeId }: { employeeId: string }) {
  const { accessToken, status: sessionStatus } = useSession()

  const assetsQuery = useQuery({
    queryKey: ["assets", "employee-holdings", employeeId],
    queryFn: () => listAssets(accessToken!, {}),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  if (assetsQuery.isPending) {
    return <Skeleton className="h-40 w-full" />
  }

  if (assetsQuery.isError) {
    return (
      <div className="rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5 text-[13px] text-[#B03A3A]">
        Could not load company assets.{" "}
        <button className="font-semibold underline" onClick={() => assetsQuery.refetch()}>
          Retry
        </button>
      </div>
    )
  }

  const holdings = (assetsQuery.data ?? []).filter((asset) => asset.heldBy?.employeeId === employeeId)

  return (
    <div className="flex flex-col rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="mb-4 text-[15px] font-bold">Company assets</div>
      {holdings.length === 0 ? (
        <p className="text-[13px] text-[#A5AFBE]">Not holding any company assets.</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tag</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Assigned</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {holdings.map((asset) => (
                <TableRow key={asset.id}>
                  <TableCell className="font-medium">{asset.assetTag}</TableCell>
                  <TableCell>{asset.name}</TableCell>
                  <TableCell>{asset.category.name}</TableCell>
                  <TableCell>{formatAssetDate(asset.heldBy!.assignedAt)}</TableCell>
                  <TableCell>
                    {asset.heldBy!.acknowledgedAt === null ? (
                      <span className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                        Unacknowledged
                      </span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
