/**
 * Named operational blockers, not a completeness percentage.
 *
 * Only fields whose absence stops something appear here. An empty blood group
 * stops nothing and does not appear. The `blocks` string names the *operation*
 * rather than the field, because "salaryStructureId is empty" is scrolled past
 * and "payroll will refuse to process this person" is fixed the same day.
 */

import type { DocumentType } from "../../generated/prisma/client"
import type { Blocker } from "./employee.types"

interface BlockerSubject {
  salaryStructureId: string | null
  bankAccountNumber: string | null
  bankRoutingNumber: string | null
  nationalId: string | null
  emergencyContact: string | null
}

export function computeBlockers(
  employee: BlockerSubject,
  documentTypes: DocumentType[]
): Blocker[] {
  const blockers: Blocker[] = []
  const has = (type: DocumentType) => documentTypes.includes(type)

  if (employee.salaryStructureId === null) {
    blockers.push({
      field: "salaryStructureId",
      blocks: "Payroll runs cannot process this employee",
    })
  }
  if (employee.bankAccountNumber === null) {
    blockers.push({
      field: "bankAccountNumber",
      blocks: "The BEFTN bank file will skip this employee",
    })
  }
  // Separate from the account number: the schema comment on
  // `bankRoutingNumber` says the export refuses to emit for anyone missing it,
  // and a person can have one without the other.
  if (employee.bankRoutingNumber === null) {
    blockers.push({
      field: "bankRoutingNumber",
      blocks: "The BEFTN bank file will skip this employee",
    })
  }
  if (!has("CONTRACT")) {
    blockers.push({ field: "CONTRACT", blocks: "No signed contract is on file" })
  }
  // Either the typed number or a scan satisfies this — the requirement is that
  // the identity is on record, not which form it takes.
  if (employee.nationalId === null && !has("NID")) {
    blockers.push({ field: "nationalId", blocks: "No national ID on record" })
  }
  if (employee.emergencyContact === null) {
    blockers.push({ field: "emergencyContact", blocks: "No emergency contact on record" })
  }
  return blockers
}
