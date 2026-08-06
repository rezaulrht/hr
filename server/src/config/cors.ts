/**
 * The CORS allowlist, kept separate from `CLIENT_ORIGIN`.
 *
 * `CLIENT_ORIGIN` is also the base for outbound links — password-reset emails
 * and the attendance digest. Overloading it with a comma-separated list to
 * admit a second origin would produce links like
 * `https://a.com,https://b.com/reset-password?token=…`, which is why the
 * allowlist gets its own variable rather than sharing that one.
 */
export function parseOrigins(corsOrigins: string | undefined, clientOrigin: string): string[] {
  const parsed = (corsOrigins ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean)

  // An empty result would be read by cors() as "allow nothing", turning a
  // stray comma in a config var into a total outage. Fall back instead.
  return parsed.length > 0 ? parsed : [clientOrigin]
}
