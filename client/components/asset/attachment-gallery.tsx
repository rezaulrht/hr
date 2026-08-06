"use client"

import { useState } from "react"

import { getAttachmentUrl } from "@/lib/api/assets"
import { ApiError } from "@/lib/api/client"
import type { AssetAttachment } from "@/lib/api/types"
import { Button } from "@/components/ui/button"

/**
 * One thumbnail. Fetches a signed URL on click and opens it — never
 * prefetched, never cached in state. A signed attachment URL lives five
 * minutes, the same rule the profile documents card follows: a page left
 * open must not hold a live link to every photo an asset has ever had.
 */
function AttachmentThumb({
  attachment,
  accessToken,
}: {
  attachment: AssetAttachment
  accessToken: string
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function open() {
    setBusy(true)
    setError(null)
    try {
      const { url } = await getAttachmentUrl(accessToken, attachment.id)
      window.open(url, "_blank", "noopener,noreferrer")
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not open that file.")
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        onClick={() => void open()}
        disabled={busy}
        className="rounded-md border border-dashed px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:border-foreground/30 hover:text-foreground disabled:opacity-50"
      >
        {busy ? "Opening…" : attachment.fileName}
      </Button>
      {error ? <p className="text-[11px] text-destructive">{error}</p> : null}
    </div>
  )
}

/**
 * A row of attachment thumbnails — asset photos, invoices, warranty files,
 * or a handover's condition-out / condition-in shots. Shared by the asset
 * detail sheet's timeline and its asset-level attachments section, so there
 * is exactly one place the five-minute-URL rule lives.
 */
export function AttachmentGallery({
  attachments,
  accessToken,
  emptyLabel,
}: {
  attachments: AssetAttachment[]
  accessToken: string
  emptyLabel?: string
}) {
  if (attachments.length === 0) {
    return emptyLabel ? <p className="text-xs text-muted-foreground">{emptyLabel}</p> : null
  }
  return (
    <div className="flex flex-wrap gap-2">
      {attachments.map((a) => (
        <AttachmentThumb key={a.id} attachment={a} accessToken={accessToken} />
      ))}
    </div>
  )
}
