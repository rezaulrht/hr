"use client"
import { useQuery } from "@tanstack/react-query"
import { getAnnexureA } from "@/lib/api/statements"
import { useSession } from "@/lib/auth/session-context"
import { currentMonthRange, formatTotal } from "@/components/accounting/accounting-shared"
import { PageHeader } from "@/components/dashboard/page-header"
import { Skeleton } from "@/components/ui/skeleton"
export function AnnexurePage() { const { accessToken } = useSession(); const range = currentMonthRange(); const q = useQuery({ queryKey: ["statements","annexure",range], queryFn: () => getAnnexureA(accessToken!, range), enabled: Boolean(accessToken) }); return <div className="space-y-6"><PageHeader kicker="Statements" title="Annexure-A" sub="Property, Plant & Equipment cost, depreciation and written-down value." />{q.isPending ? <Skeleton className="h-96 w-full" /> : <div className="overflow-x-auto rounded-lg border"><table className="min-w-[1000px] w-full text-sm"><thead><tr className="border-b bg-muted/40">{["Particulars","Rate","Cost opening","Additions","Cost closing","Dep. opening","Charged","Dep. closing","WDV"].map((h) => <th key={h} className="px-3 py-2 text-right first:text-left">{h}</th>)}</tr></thead><tbody>{q.data!.rows.map((r) => <tr key={r.accountId} className="border-b"><td className="px-3 py-2">{r.particulars}</td>{[r.rate ?? "—",r.costOpening,r.costAddition,r.costClosing,r.depOpening,r.depCharged,r.depClosing,r.writtenDownValue].map((v,i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{i === 0 ? v : formatTotal(v)}</td>)}</tr>)}</tbody></table></div>}</div> }
