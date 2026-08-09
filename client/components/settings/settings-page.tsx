"use client"

import type { ComponentType } from "react"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import type { Role } from "@/lib/api/types"
import { useSession } from "@/lib/auth/session-context"
import { AssetCategoriesPanel } from "./asset-categories-panel"
import { CostCategoriesPanel } from "./cost-categories-panel"
import { DepartmentsPanel } from "./departments-panel"
import { LeaveTypesPanel } from "./leave-types-panel"
import { ShiftsPanel } from "./shifts-panel"

interface SettingsTab {
  value: string
  label: string
  /** Mirrors the requireRole gate on the routes this panel calls. */
  roles: Role[]
  Panel: ComponentType<{ accessToken: string }>
}

/**
 * The single place the role matrix lives.
 *
 * This is UX only. Every gate is enforced server-side by `requireRole`, so a
 * role that reaches a hidden tab gets a 403 from the API rather than a write.
 * Keeping it in one table means there is one place for it to be wrong, instead
 * of one per route file.
 */
const TABS: SettingsTab[] = [
  {
    value: "departments",
    label: "Departments",
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    Panel: DepartmentsPanel,
  },
  {
    value: "shifts",
    label: "Shifts",
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    Panel: ShiftsPanel,
  },
  {
    value: "leave-types",
    label: "Leave types",
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    Panel: LeaveTypesPanel,
  },
  {
    value: "asset-categories",
    label: "Asset categories",
    roles: ["SUPER_ADMIN", "HR_ADMIN"],
    Panel: AssetCategoriesPanel,
  },
  // Finance, not HR — cost categories are the one reference table HR does not
  // own, matching the WRITE_ROLES gate on /api/costs/categories.
  {
    value: "cost-categories",
    label: "Cost categories",
    roles: ["SUPER_ADMIN", "FINANCE_OFFICER"],
    Panel: CostCategoriesPanel,
  },
]

export function SettingsPage() {
  const { user, accessToken } = useSession()

  if (!user || !accessToken) return null

  const visible = TABS.filter((tab) => tab.roles.includes(user.role))

  if (visible.length === 0) {
    // Unreachable from the nav today. Two lines so that adding a role without
    // updating the registry produces a sentence rather than an empty tab strip.
    return (
      <div className="rounded-md border border-[#E4E9EF] bg-white px-5 py-8 text-center text-[13px] text-[#6B7683]">
        There is nothing here for your role.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-[12px] font-bold uppercase tracking-wide text-[#6B7683]">
          Administration
        </div>
        <h1 className="text-[22px] font-bold">Settings</h1>
        <p className="text-[13px] text-[#6B7683]">
          Reference data the rest of the system is built from.
        </p>
      </div>

      <Tabs defaultValue={visible[0].value}>
        <TabsList>
          {visible.map((tab) => (
            <TabsTrigger key={tab.value} value={tab.value}>
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {visible.map(({ value, Panel }) => (
          <TabsContent key={value} value={value} className="pt-3">
            <Panel accessToken={accessToken} />
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
