/**
 * The storage seam.
 *
 * One file, so replacing local disk with S3 or Supabase Storage is a file
 * rather than a refactor. Local disk is a deliberate prototype choice with a
 * known ceiling: it does not survive a restart on an ephemeral filesystem,
 * and it does not work across replicas.
 */

import { createHash } from "node:crypto"
import { mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"

import { env } from "../../config/env"

/**
 * A stored document's key. Deliberately not a raw filename from user input —
 * a payslipNo is system-generated, but hashing keeps traversal impossible
 * even if that ever changes.
 */
export function storageKey(kind: "payslip" | "settlement", documentNo: string): string {
  const safe = createHash("sha256").update(documentNo).digest("hex").slice(0, 16)
  return `${kind}-${safe}.pdf`
}

function resolvePath(key: string): string {
  return path.join(env.PAYSLIP_STORAGE_DIR, key)
}

export async function putPdf(key: string, bytes: Uint8Array): Promise<string> {
  await mkdir(env.PAYSLIP_STORAGE_DIR, { recursive: true })
  const target = resolvePath(key)
  await writeFile(target, bytes)
  return target
}

export async function getPdf(key: string): Promise<Buffer | null> {
  try {
    return await readFile(resolvePath(key))
  } catch {
    // Absent or unreadable is the same answer to the caller: re-render it.
    return null
  }
}
