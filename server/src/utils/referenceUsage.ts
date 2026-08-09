/**
 * Formats the "still in use" half of a delete refusal.
 *
 * Pure on purpose: the counting is the caller's, because the five reference
 * models have different relations and a generic Prisma-driven counter would
 * need runtime model dispatch to save five lines. This keeps the wording in
 * one place and leaves the queries typed.
 */

export interface UsageCount {
  /** Singular noun. Pluralised with a trailing "s", so keep it regular. */
  noun: string
  count: number
}

/**
 * "4 employees and 2 announcements", or null when nothing is in use.
 *
 * Zero counts are dropped rather than rejected, so a caller can pass every
 * relation unconditionally instead of assembling the list with conditionals
 * at each call site.
 */
export function describeUsage(counts: UsageCount[]): string | null {
  const parts = counts
    .filter((entry) => entry.count > 0)
    .map((entry) => `${entry.count} ${entry.noun}${entry.count === 1 ? "" : "s"}`)

  if (parts.length === 0) return null
  if (parts.length === 1) return parts[0]

  return `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}`
}
