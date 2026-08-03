import { z } from "zod"

/**
 * There is deliberately no `publicId` field. The server chooses it — see
 * `createUploadSignature`. A client-supplied id would let anyone with
 * signature access overwrite another employee's contract, because
 * `api_sign_request` signs whatever it is handed.
 */
export const uploadSignatureSchema = z.object({
  kind: z.enum(["AVATAR", "DOCUMENT"]),
  employeeId: z.string().min(1),
})
export type UploadSignatureBody = z.infer<typeof uploadSignatureSchema>
