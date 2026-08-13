"use client"
import { useQuery } from "@tanstack/react-query"
import { listPolicyNotes } from "@/lib/api/statements"
import { useSession } from "@/lib/auth/session-context"
import { PageHeader } from "@/components/dashboard/page-header"
import { Skeleton } from "@/components/ui/skeleton"
export function PolicyNotesPage() { const { accessToken } = useSession(); const q = useQuery({ queryKey: ["statements","policy-notes"], queryFn: () => listPolicyNotes(accessToken!), enabled: Boolean(accessToken) }); return <div className="space-y-6"><PageHeader kicker="Statements" title="Policy notes" sub="Narrative accounting policies maintained by Finance." />{q.isPending ? <Skeleton className="h-96 w-full" /> : <div className="space-y-4">{q.data!.map((n) => <article key={n.id} className="rounded-lg border p-4"><h2 className="font-semibold">{n.ref} {n.title}</h2><p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{n.body}</p></article>)}</div>}</div> }
