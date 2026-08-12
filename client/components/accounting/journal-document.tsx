"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { RiArrowGoBackLine, RiArrowLeftLine, RiCheckLine, RiCloseLine } from "@remixicon/react"
import { toast } from "sonner"

import { approveJournal, rejectJournal, reverseJournal } from "@/lib/api/accounting"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { Journal } from "@/lib/api/types"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Textarea } from "@/components/ui/textarea"
import { JournalAttachments } from "@/components/accounting/journal-attachments"
import {
  formatAmount,
  formatLedgerDate,
  formatTotal,
  fromPaisa,
  JOURNAL_STATUS_LABEL,
  JOURNAL_TYPE_LABEL,
  canApprove,
  sumPaisa,
} from "@/components/accounting/accounting-shared"

/**
 * A posted journal, rendered as a document rather than as a locked form.
 *
 * The distinction is the point: an entry that can never be edited again
 * should not look like an entry you might edit. The only actions here are
 * approve/reject (while awaiting approval) and reverse (once posted).
 */
export function JournalDocument({ journal }: { journal: Journal }) {
  const { accessToken, user } = useSession()
  const router = useRouter()
  const queryClient = useQueryClient()

  const [rejectOpen, setRejectOpen] = useState(false)
  const [rejectNote, setRejectNote] = useState("")
  const [reverseOpen, setReverseOpen] = useState(false)
  const [reverseReason, setReverseReason] = useState("")

  const refresh = () => queryClient.invalidateQueries({ queryKey: ["accounting"] })

  const approve = useMutation({
    mutationFn: () => approveJournal(accessToken!, journal.id),
    onSuccess: () => {
      refresh()
      toast.success(`${journal.journalNo} posted`)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not approve it"),
  })

  const reject = useMutation({
    mutationFn: () => rejectJournal(accessToken!, journal.id, rejectNote),
    onSuccess: () => {
      refresh()
      setRejectOpen(false)
      toast.success("Sent back to draft")
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not send it back"),
  })

  const reverse = useMutation({
    mutationFn: () => reverseJournal(accessToken!, journal.id, reverseReason),
    onSuccess: (created) => {
      refresh()
      setReverseOpen(false)
      toast.success(`${created.journalNo} drafted as the reversal`)
      router.push(`${created.id}`)
    },
    onError: (err) => toast.error(err instanceof ApiError ? err.message : "Could not reverse it"),
  })

  const debit = fromPaisa(sumPaisa(journal.lines.map((l) => l.debit)))
  const credit = fromPaisa(sumPaisa(journal.lines.map((l) => l.credit)))

  // Hidden, not disabled: a Finance Officer should never be offered a button
  // that will 403, and the server enforces this regardless.
  const showApproval = journal.status === "PENDING_APPROVAL" && canApprove(user?.role)
  const isOwnJournal = journal.createdBy === user?.id

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("../journals")}>
            <RiArrowLeftLine className="size-4" /> Register
          </Button>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">
            {journal.journalNo}
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Badge variant={journal.status === "POSTED" ? "default" : "secondary"}>
              {JOURNAL_STATUS_LABEL[journal.status]}
            </Badge>
            <span>{JOURNAL_TYPE_LABEL[journal.type]}</span>
            <span>·</span>
            <span>{formatLedgerDate(journal.date)}</span>
            {journal.reference && <span>· Ref {journal.reference}</span>}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {showApproval && (
            <>
              <Button variant="outline" onClick={() => setRejectOpen(true)}>
                <RiCloseLine className="size-4" /> Send back
              </Button>
              <Button onClick={() => approve.mutate()} disabled={approve.isPending || isOwnJournal}>
                <RiCheckLine className="size-4" />
                {approve.isPending ? "Posting…" : "Approve and post"}
              </Button>
            </>
          )}
          {journal.status === "POSTED" && (
            <Button variant="outline" onClick={() => setReverseOpen(true)}>
              <RiArrowGoBackLine className="size-4" /> Reverse
            </Button>
          )}
        </div>
      </div>

      {showApproval && isOwnJournal && (
        <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-3 text-sm">
          You created this journal, so someone else must approve it.
        </p>
      )}

      {journal.reversesId && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm">
          This reverses{" "}
          <Link href={`${journal.reversesId}`} className="font-medium underline">
            the original journal
          </Link>
          {journal.reversalReason && <> — {journal.reversalReason}</>}
        </p>
      )}

      <p className="text-base">{journal.narration}</p>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-20">Code</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Line note</TableHead>
              <TableHead className="w-36 text-right">Debit</TableHead>
              <TableHead className="w-36 text-right">Credit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {journal.lines.map((l) => (
              <TableRow key={l.id}>
                <TableCell className="text-muted-foreground tabular-nums">{l.account.code}</TableCell>
                <TableCell>{l.account.name}</TableCell>
                <TableCell className="text-muted-foreground">{l.narration ?? ""}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(l.debit)}</TableCell>
                <TableCell className="text-right tabular-nums">{formatAmount(l.credit)}</TableCell>
              </TableRow>
            ))}
            <TableRow className="border-t-2 font-medium">
              <TableCell colSpan={3} className="text-right">Total</TableCell>
              <TableCell className="text-right tabular-nums">{formatTotal(debit)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatTotal(credit)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      <dl className="grid gap-x-8 gap-y-2 rounded-lg border p-4 text-sm sm:grid-cols-2">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Created by</dt>
          <dd>{journal.createdBy}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Submitted</dt>
          <dd>{journal.submittedAt ? formatLedgerDate(journal.submittedAt) : "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Approved by</dt>
          <dd>{journal.approvedBy ?? "—"}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">Posted</dt>
          <dd>{journal.postedAt ? formatLedgerDate(journal.postedAt) : "—"}</dd>
        </div>
      </dl>

      <JournalAttachments journalId={journal.id} attachments={journal.attachments} />

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Send {journal.journalNo} back?</DialogTitle>
            <DialogDescription>
              It returns to draft with your note attached, so the author knows what to change.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={rejectNote}
            onChange={(e) => setRejectNote(e.target.value)}
            placeholder="Rent belongs in 5206, not 5207"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
            <Button onClick={() => reject.mutate()} disabled={!rejectNote.trim() || reject.isPending}>
              Send back
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={reverseOpen} onOpenChange={setReverseOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reverse {journal.journalNo}?</DialogTitle>
            <DialogDescription>
              A posted journal is never edited. This creates a new draft with every debit and
              credit swapped, dated in this journal&apos;s period if it is still open and in the
              next open period if it is not. It then follows the ordinary approval path.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            rows={3}
            value={reverseReason}
            onChange={(e) => setReverseReason(e.target.value)}
            placeholder="Posted to the wrong account"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setReverseOpen(false)}>Cancel</Button>
            <Button onClick={() => reverse.mutate()} disabled={!reverseReason.trim() || reverse.isPending}>
              Create the reversal
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
