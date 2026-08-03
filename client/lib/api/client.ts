export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /**
     * Extra fields the server sent alongside `error`. The payroll preflight's
     * 409 carries a `blockers` array here, and the bank file's carries
     * `missingBankDetails` — discarding either would turn a checklist the
     * user can act on into a bare string.
     */
    public details?: Record<string, unknown>
  ) {
    super(message)
    this.name = "ApiError"
  }
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"

function toApiError(status: number, body: unknown): ApiError {
  const { error, ...details } = (body ?? {}) as Record<string, unknown>
  return new ApiError(
    status,
    typeof error === "string" ? error : "Request failed",
    Object.keys(details).length > 0 ? details : undefined
  )
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<T> {
  const { accessToken, headers, ...rest } = options

  // The browser sets Content-Type itself for a FormData body, including the
  // multipart boundary. Setting it explicitly here would produce a request
  // the server can't parse, since the boundary would be missing.
  const isFormData = typeof FormData !== "undefined" && rest.body instanceof FormData

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(isFormData ? {} : { "Content-Type": "application/json" }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })

  const body = await res.json().catch(() => ({}))

  if (!res.ok) {
    throw toApiError(res.status, body)
  }

  return body as T
}

/**
 * A binary response — the bank-file CSV. `apiFetch` cannot express this
 * because it always parses JSON, and a CSV parsed as JSON is a thrown error.
 */
export async function apiFetchBlob(
  path: string,
  options: RequestInit & { accessToken?: string } = {}
): Promise<{ blob: Blob; headers: Headers }> {
  const { accessToken, headers, ...rest } = options

  const res = await fetch(`${API_URL}${path}`, {
    ...rest,
    credentials: "include",
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  })

  if (!res.ok) {
    // An error response is still JSON, even on a route that normally returns
    // a file — so the blockers / missingBankDetails list survives.
    throw toApiError(res.status, await res.json().catch(() => ({})))
  }

  return { blob: await res.blob(), headers: res.headers }
}
