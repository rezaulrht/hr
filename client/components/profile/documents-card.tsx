"use client"

import { useState } from "react"

import { getDocumentUrl } from "@/lib/api/employees"
import { ApiError } from "@/lib/api/client"
import { useSession } from "@/lib/auth/session-context"
import type { DocumentItem, DocumentType } from "@/lib/api/types"

const TYPE_LABEL: Record<DocumentType, string> = {
  CONTRACT: "Contract",
  NID: "National ID",
  CERTIFICATE: "Certificate",
  OFFER_LETTER: "Offer letter",
  RESIGNATION: "Resignation",
  OTHER: "Other",
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function DocumentsCard({
  employeeId,
  documents,
  footnote,
}: {
  employeeId: string
  documents: DocumentItem[]
  footnote?: string
}) {
  const { accessToken } = useSession()
  const [busyId, setBusyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * The URL is fetched on click, never on render.
   *
   * A signed document URL lives five minutes. Fetching them all when the page
   * paints would mean a page left open holds live links to every one of this
   * person's identity documents.
   */
  async function download(documentId: string) {
    setError(null)
    setBusyId(documentId)
    try {
      const { url } = await getDocumentUrl(accessToken!, employeeId, documentId)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that file.")
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className="flex flex-col rounded-md border border-[#E4E9EF] bg-white px-5.5 py-5">
      <div className="mb-4 text-[15px] font-bold">Documents</div>
      {documents.length === 0 ? (
        <p className="text-[13px] text-[#A5AFBE]">No documents on file.</p>
      ) : (
        <ul className="space-y-2.5">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold">{TYPE_LABEL[doc.type]}</div>
                <div className="truncate text-[12px] text-[#A5AFBE]">
                  {doc.fileName} · {formatBytes(doc.bytes)}
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-[12.5px] font-semibold underline disabled:opacity-50"
                disabled={busyId === doc.id}
                onClick={() => void download(doc.id)}
              >
                {busyId === doc.id ? "Opening…" : "Download"}
              </button>
            </li>
          ))}
        </ul>
      )}
      {error ? <p className="mt-3 text-[13px] font-semibold text-[#B03A3A]">{error}</p> : null}
      {footnote ? (
        <p className="mt-4 border-t border-[#EFF2F6] pt-3 text-[12px] text-[#A5AFBE]">{footnote}</p>
      ) : null}
    </div>
  )
}
