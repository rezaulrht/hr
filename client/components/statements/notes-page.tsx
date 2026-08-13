"use client"
import { useQuery } from "@tanstack/react-query"
import { getNotes } from "@/lib/api/statements"
import { useSession } from "@/lib/auth/session-context"
import { currentMonthRange, formatSigned } from "@/components/accounting/accounting-shared"
import { PageHeader } from "@/components/dashboard/page-header"
import { Skeleton } from "@/components/ui/skeleton"
export function NotesPage() { const { accessToken } = useSession(); const range = currentMonthRange(); const q = useQuery({ queryKey: ["statements","notes",range], queryFn: () => getNotes(accessToken!, range), enabled: Boolean(accessToken) }); return <div className="space-y-6"><PageHeader kicker="Statements" title="Notes to the financial statements" sub="Generated account breakdowns with maintained narrative policy notes." />{q.isPending ? <Skeleton className="h-96 w-full" /> : <div className="space-y-4">{q.data!.notes.map((n) => <section key={n.ref} className="rounded-lg border p-4"><h2 className="font-semibold">{n.ref} {n.title}</h2>{n.body && <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p>}{n.rows.length > 0 && <div className="mt-3 space-y-1 text-sm">{n.rows.map((r) => <div key={r.accountId} className="grid grid-cols-[1fr_140px_140px] gap-3"><span>{r.code} {r.name}</span><span className="text-right tabular-nums">{formatSigned(r.current)}</span><span className="text-right tabular-nums text-muted-foreground">{formatSigned(r.comparative)}</span></div>)}</div>}</section>)}</div>}</div> }
