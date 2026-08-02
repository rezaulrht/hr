// Static presentation data for the Finance Officer role, transcribed from
// the approved design (PeopleCore HR & Payroll â€” Employee Dashboard.dc.html,
// roles['Finance Officer']). Shared subpages live in
// components/dashboard/shared-pages.ts.

import type { SubpageData } from "@/components/dashboard/types"

export const finance = {
  name: "Marcus Webb",
  initials: "MW",
  email: "marcus.w@peoplecore.io",
  roleLabel: "Finance Officer",
}





export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "FIN-0207", sub: "Payroll & finance Â· Finance Officer" },
    { label: "Tenure", value: "2.8 yrs", sub: "Joined Nov 2023" },
    { label: "Manager", value: "Noah Bennett", sub: "Super Admin" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF Â· signed", weight: 600 }, { text: "Contract" }, { text: "Nov 2023" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "â€¢â€¢â€¢â€¢ 5518", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Nov 2023" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
