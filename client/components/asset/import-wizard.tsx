"use client"

import { useState } from "react"
import { useMutation } from "@tanstack/react-query"

import { commitAssetImport, previewAssetImport } from "@/lib/api/assets"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { AssetImportCommitResult, AssetImportIssue, AssetImportPreview } from "@/lib/api/types"
import { Button } from "@/components/ui/button"
import { DOCUMENT_MAX_BYTES, FileUpload } from "@/components/ui/file-upload"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

/** `parseSheet` (server/src/utils/import/import.parse.ts) reads only these
 *  two — a third format is a second parser to keep consistent with it. */
const IMPORT_ACCEPT = ["xlsx", "csv"]

type Step = "upload" | "preview" | "result"

/**
 * One row as the server's preview reports it — a subset of
 * `AssetImportRow` (server/src/modules/asset/asset.import.ts) kept local
 * rather than added to `lib/api/types.ts`. `AssetImportPreview.rows` is typed
 * `unknown[]` there on purpose: the shared import kernel already has two more
 * consumers planned (operating costs, historical expenses) whose rows look
 * nothing like this, so a single shared row type would be a lie for either.
 */
interface ImportRow {
  rowNumber: number
  assetTag?: string
  name?: string
  serialNumber?: string
  model?: string
  departmentName?: string
  assignedToEmployeeId?: string
  assignedAt?: string
}

function issuesForRow(rowNumber: number, issues: AssetImportIssue[]): AssetImportIssue[] {
  return issues.filter((issue) => issue.rowNumber === rowNumber)
}

/**
 * Every parsed row, its issues inline. Reused verbatim for a commit-time 400:
 * the server re-validates at commit and can find something the preview did
 * not (another admin's import landing in between), and `error.details.issues`
 * slots into the same `issues` prop rather than a bare string.
 */
function PreviewTable({ rows, issues }: { rows: ImportRow[]; issues: AssetImportIssue[] }) {
  const rowNumbers = Array.from(
    new Set<number>([...rows.map((r) => r.rowNumber), ...issues.map((i) => i.rowNumber)])
  ).sort((a, b) => a - b)

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Tag</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Serial</TableHead>
            <TableHead>Assigned</TableHead>
            <TableHead>Issues</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rowNumbers.map((rowNumber) => {
            const row = rows.find((r) => r.rowNumber === rowNumber)
            const rowIssues = issuesForRow(rowNumber, issues)
            return (
              <TableRow key={rowNumber}>
                <TableCell className="font-medium">{rowNumber}</TableCell>
                <TableCell>{row?.assetTag ?? "—"}</TableCell>
                <TableCell>{row?.name ?? "—"}</TableCell>
                <TableCell>{row?.serialNumber ?? "—"}</TableCell>
                <TableCell>{row?.assignedToEmployeeId ? "Yes" : "—"}</TableCell>
                <TableCell>
                  {rowIssues.length === 0 ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <ul className="space-y-0.5">
                      {rowIssues.map((issue, i) => (
                        <li key={i} className="text-xs font-semibold text-destructive">
                          {issue.column ? `${issue.column}: ` : ""}
                          {issue.message}
                        </li>
                      ))}
                    </ul>
                  )}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/**
 * Upload → preview → result. `preview` writes nothing — the server's
 * `runPreview` guarantees that — so everything before the commit click is
 * free to retry with a different file.
 *
 * The summary line above the table is the reason this screen exists at all:
 * a file importing 142 assets can silently also open 96 custody records, and
 * nobody should approve that without being told first.
 */
export function ImportWizard({ onImported }: { onImported: () => void }) {
  const { accessToken } = useSession()

  const [step, setStep] = useState<Step>("upload")
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<AssetImportPreview | null>(null)
  const [issues, setIssues] = useState<AssetImportIssue[]>([])
  const [commitError, setCommitError] = useState<string | null>(null)
  const [result, setResult] = useState<AssetImportCommitResult | null>(null)

  function reset() {
    setStep("upload")
    setFile(null)
    setPreview(null)
    setIssues([])
    setCommitError(null)
    setResult(null)
  }

  const previewMutation = useMutation({
    mutationFn: (f: File) => previewAssetImport(accessToken!, f),
    onSuccess: (data, f) => {
      setFile(f)
      setPreview(data)
      setIssues(data.issues)
      setCommitError(null)
      setStep("preview")
    },
  })

  const commitMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("No file selected")
      return commitAssetImport(accessToken!, file)
    },
    onSuccess: (data) => {
      setResult(data)
      setCommitError(null)
      setStep("result")
      onImported()
    },
    onError: (err) => {
      if (err instanceof ApiError && err.status === 400 && Array.isArray(err.details?.issues)) {
        // A row failed a check the preview could not see (typically a race —
        // someone else's import landed in between). Same table, fresher
        // issues, never a bare string.
        setIssues(err.details.issues as AssetImportIssue[])
        setCommitError(null)
      } else {
        setCommitError(
          err instanceof ApiError ? err.message : "Something went wrong. Please try again."
        )
      }
    },
  })

  const previewRows = (preview?.rows ?? []) as ImportRow[]

  return (
    <div className="space-y-4">
      {step === "upload" ? (
        <div className="rounded-md border border-dashed p-8 text-center">
          <p className="mb-3 text-sm text-muted-foreground">
            Upload an Excel (.xlsx) or CSV file of the asset register to import. Nothing is written
            until you review and commit it.
          </p>
          <div className="flex justify-center">
            <FileUpload
              accept={IMPORT_ACCEPT}
              maxBytes={DOCUMENT_MAX_BYTES}
              label="Choose file"
              onSelect={(f) => previewMutation.mutateAsync(f).then(() => undefined)}
            />
          </div>
        </div>
      ) : null}

      {step === "preview" && preview ? (
        <div className="space-y-4">
          <p className="text-[13px]">
            <span className="font-semibold">{preview.summary.assets ?? 0}</span> assets,{" "}
            <span className="font-semibold">{preview.summary.assignments ?? 0}</span> of them already
            assigned to someone,{" "}
            <span className="font-semibold">{preview.summary.departmentsToCreate ?? 0}</span> new
            department{(preview.summary.departmentsToCreate ?? 0) === 1 ? "" : "s"} will be created.
          </p>

          <PreviewTable rows={previewRows} issues={issues} />

          <p className="text-[12.5px] font-semibold text-muted-foreground">
            If any row fails, nothing at all is imported.
          </p>

          {commitError ? (
            <p className="text-[13px] font-semibold text-destructive">{commitError}</p>
          ) : null}

          <div className="flex gap-2">
            <Button type="button" variant="outline" onClick={reset} disabled={commitMutation.isPending}>
              Choose a different file
            </Button>
            <Button
              type="button"
              disabled={issues.length > 0 || commitMutation.isPending}
              onClick={() => commitMutation.mutate()}
            >
              {commitMutation.isPending ? "Importing…" : "Commit import"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "result" && result ? (
        <div className="space-y-4">
          <div className="rounded-md border border-emerald-200 bg-emerald-50 px-5 py-4 dark:border-emerald-900 dark:bg-emerald-950">
            <p className="text-[13px] font-semibold text-emerald-800 dark:text-emerald-200">
              Import complete.
            </p>
            <p className="mt-0.5 text-[12.5px] text-emerald-700 dark:text-emerald-300">
              {result.assetCount} asset{result.assetCount === 1 ? "" : "s"} created,{" "}
              {result.assignmentCount} with open custody carried over.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={reset}>
            Import another file
          </Button>
        </div>
      ) : null}
    </div>
  )
}
