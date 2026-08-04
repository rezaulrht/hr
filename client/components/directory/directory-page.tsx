"use client"

import { useMemo, useState } from "react"
import { useQuery } from "@tanstack/react-query"

import { listEmployees } from "@/lib/api/employees"
import { useSession } from "@/lib/auth/session-context"
import type { EmployeeView } from "@/lib/api/types"
import { ColleagueDialog } from "@/components/directory/colleague-dialog"
import { initialsFrom } from "@/components/profile/avatar-upload"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"

/**
 * Reads the widened list endpoint. For an EMPLOYEE caller the rows come back
 * as work-identity only, so the colleague card *is* the COLLEAGUE projection —
 * no second endpoint, and no chance of the two disagreeing.
 */
export function DirectoryPage() {
  const { accessToken, status: sessionStatus } = useSession()
  const [query, setQuery] = useState("")
  const [selected, setSelected] = useState<EmployeeView | null>(null)

  const employeesQuery = useQuery({
    queryKey: ["employees"],
    queryFn: () => listEmployees(accessToken!),
    enabled: sessionStatus === "authenticated" && !!accessToken,
  })

  // Client-side, consistent with the existing no-pagination decision for this
  // dataset size.
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const all = employeesQuery.data ?? []
    if (needle === "") return all
    return all.filter((e) =>
      [e.work.fullName, e.work.designation, e.work.department.name]
        .join(" ")
        .toLowerCase()
        .includes(needle)
    )
  }, [employeesQuery.data, query])

  return (
    <>
      <div className="pt-7 pb-5.5">
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-[#7A8698] uppercase">
          Workspace
        </div>
        <h1 className="font-heading mb-1 text-[23px] font-bold tracking-tight">Directory</h1>
        <div className="text-[13px] text-[#7A8698]">Find a colleague</div>
      </div>

      <Input
        placeholder="Search by name, designation or department"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-5 max-w-100"
      />

      {sessionStatus === "loading" || employeesQuery.isPending ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      ) : employeesQuery.isError ? (
        <div className="rounded-md border border-[#E4E9EF] bg-white p-5.5 text-[13px] text-[#B03A3A]">
          Failed to load the directory.{" "}
          <button className="font-semibold underline" onClick={() => employeesQuery.refetch()}>
            Retry
          </button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-[13px] text-[#A5AFBE]">No colleagues match “{query}”.</p>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-4">
          {filtered.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => setSelected(e)}
              className="flex items-center gap-3 rounded-md border border-[#E4E9EF] bg-white px-4 py-3.5 text-left hover:border-[#C6CCD3]"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[#EFF2F6]">
                {e.work.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={e.work.avatarUrl} alt="" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-[13px] font-bold text-[#55657A]">
                    {initialsFrom(e.work.fullName)}
                  </span>
                )}
              </div>
              <div className="min-w-0">
                <div className="truncate text-[13.5px] font-semibold">{e.work.fullName}</div>
                <div className="truncate text-[12px] text-[#7A8698]">{e.work.designation}</div>
                <div className="truncate text-[11.5px] text-[#A5AFBE]">
                  {e.work.department.name}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <ColleagueDialog employee={selected} onOpenChange={(open) => !open && setSelected(null)} />
    </>
  )
}
