// Static presentation data for the Super Admin role, transcribed from the
// approved design (PeopleCore HR & Payroll â€” Employee Dashboard.dc.html,
// roles['Super Admin']). Shared subpages (Employees, Settlements, etc.) live
// in components/dashboard/shared-pages.ts.

import type { SubpageData } from "@/components/dashboard/types"

export const admin = {
  name: "Noah Bennett",
  initials: "NB",
  email: "noah.b@peoplecore.io",
  roleLabel: "Super Admin",
}





export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "ADM-0001", sub: "Administration Â· Super Admin" },
    { label: "Tenure", value: "5.2 yrs", sub: "Joined Jan 2021" },
    { label: "Manager", value: "Board of Directors", sub: "Executive oversight" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF Â· signed", weight: 600 }, { text: "Contract" }, { text: "Jan 2021" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "â€¢â€¢â€¢â€¢ 7742", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Jan 2021" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
