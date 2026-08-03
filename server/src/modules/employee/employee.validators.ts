import { z } from "zod"

export const createStaffAccountSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  role: z.enum(["EMPLOYEE", "REPORTING_MANAGER"]),
  designation: z.string().min(1),
  departmentId: z.string().min(1),
  employmentType: z.enum(["FULL_TIME", "PART_TIME", "CONTRACT", "INTERN"]),
  joiningDate: z.string().min(1),
  reportingManagerId: z.string().optional(),
})
export type CreateStaffAccountBody = z.infer<typeof createStaffAccountSchema>

/**
 * `null` un-assigns. Kept explicit rather than inferring it from an absent
 * key, because "leave the structure alone" and "this person is now on no
 * structure" are different intentions and PATCH cannot distinguish them
 * otherwise.
 */
export const setSalaryStructureSchema = z.object({
  salaryStructureId: z.string().min(1).nullable(),
})
export type SetSalaryStructureBody = z.infer<typeof setSalaryStructureSchema>

/**
 * The document type arrives as a multipart TEXT field alongside the file, so
 * it is validated on its own rather than as part of a JSON body.
 */
export const documentTypeSchema = z.enum([
  "CONTRACT",
  "NID",
  "CERTIFICATE",
  "OFFER_LETTER",
  "RESIGNATION",
  "OTHER",
])
