/**
 * The storage seam.
 *
 * One file, so the backing store is replaceable without touching the payslip
 * renderer. Cloudinary, reached through the same `media.service` helpers the
 * document vault uses — deliberately not local disk, which does not survive a
 * dyno restart and is not shared across replicas.
 *
 * Uploads inherit `type: "authenticated"` from `uploadBuffer`, which matters
 * more here than for a headshot: a payslip is salary data, and a default
 * Cloudinary upload is a permanently public CDN URL. `storageKey`'s hash makes
 * an id hard to guess, but unguessable is not access-controlled.
 */

import { createHash } from "node:crypto"

import { isMediaConfigured } from "../media/media.provider"
import { signedDocumentUrl, uploadBuffer } from "../media/media.service"

/** Everything this module stores lives under one Cloudinary folder. */
const FOLDER = "hr/payslips/"

/**
 * A stored document's key. Deliberately not a raw filename from user input —
 * a payslipNo is system-generated, but hashing keeps traversal impossible
 * even if that ever changes.
 */
export function storageKey(kind: "payslip" | "settlement", documentNo: string): string {
  const safe = createHash("sha256").update(documentNo).digest("hex").slice(0, 16)
  return `${kind}-${safe}.pdf`
}

/**
 * Cloudinary carries the format separately from the public id, so the `.pdf`
 * suffix `storageKey` produces is stripped rather than baked in — leaving it
 * would deliver assets addressed as `…​.pdf.pdf`.
 */
export function publicIdFor(key: string): string {
  return `${FOLDER}${key.replace(/\.pdf$/, "")}`
}

/**
 * Caches the rendered bytes, best-effort.
 *
 * Returns `null` when nothing was stored. The caller already holds the bytes
 * and is about to return them, so a storage failure must not become a failed
 * download — that would turn an unconfigured Cloudinary (local dev, CI) into a
 * broken payslip endpoint rather than a slower one.
 */
export async function putPdf(key: string, bytes: Uint8Array): Promise<string | null> {
  if (!isMediaConfigured()) return null
  try {
    const asset = await uploadBuffer(Buffer.from(bytes), publicIdFor(key))
    return asset.publicId
  } catch (err) {
    console.error("Failed to cache payslip PDF", key, err)
    return null
  }
}

export async function getPdf(key: string): Promise<Buffer | null> {
  try {
    const { url } = signedDocumentUrl(publicIdFor(key), "pdf")
    // 5s, well under Heroku's 30s router limit: this is a cache read on the
    // download request path, and a cache read slower than a re-render is
    // worse than no cache at all. The abort lands in the catch below and
    // degrades to a re-render, same as any other unreachable-store outcome.
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) })
    if (!res.ok) {
      console.warn("Payslip cache miss", key, res.status)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (err) {
    // Absent, unreachable or unconfigured are the same answer to the caller:
    // re-render it. A miss costs a Puppeteer render, never a failure. Still
    // logged, though — a permanent miss (e.g. Cloudinary PDF delivery
    // disabled) must be visible somewhere, not just slower.
    console.warn("Payslip cache read failed", key, err)
    return null
  }
}
