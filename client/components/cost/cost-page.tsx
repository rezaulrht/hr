"use client"

import { PageHeader } from "@/components/dashboard/page-header"

/**
 * One component, three roles (Finance, HR, Admin) — the same pattern assets,
 * payroll and settlements already use. Task 7 replaces this stub with the
 * month view, the category summary, bill dialogs and the import wizard.
 */
export function CostPage() {
  return (
    <>
      <PageHeader
        kicker="Workspace"
        title="Operating costs"
        sub="Rent, electricity, water, internet and cleaning — one bill per category per month"
      />
    </>
  )
}
