import { z } from "zod"

export const createDepartmentSchema = z.object({
  name: z.string().trim().min(1, "A name is required").max(100),
})

// A department has exactly one editable field, so update takes the same
// shape rather than `.partial()` — a body with no name is not a no-op edit,
// it is a mistake.
export const updateDepartmentSchema = createDepartmentSchema

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
