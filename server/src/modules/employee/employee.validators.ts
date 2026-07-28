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
