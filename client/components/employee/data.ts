// Static presentation data for the Employee role, transcribed from the
// approved design (PeopleCore HR & Payroll â€” Employee Dashboard).

import type { SubpageData } from "@/components/dashboard/types"

export const employee = {
  name: "Aisha Rahman",
  initials: "AR",
  email: "aisha.r@peoplecore.io",
  employeeId: "EMP-0412",
  department: "Product",
  title: "Senior PM",
  manager: "Daniel Kim",
  tenure: "3.4 yrs",
  joined: "Mar 2023",
}





export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "EMP-0412", sub: "Product Â· Senior PM" },
    { label: "Tenure", value: "3.4 yrs", sub: "Joined Mar 2023" },
    { label: "Manager", value: "Daniel Kim", sub: "Reporting Manager" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF Â· signed", weight: 600 }, { text: "Contract" }, { text: "Mar 2023" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "â€¢â€¢â€¢â€¢ 4821", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Mar 2023" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
