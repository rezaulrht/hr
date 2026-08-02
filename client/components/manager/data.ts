// Static presentation data for the Reporting Manager role, transcribed from
// the approved design (PeopleCore HR & Payroll â€” Employee Dashboard.dc.html,
// roles['Reporting Manager']). Shared subpages live in
// components/dashboard/shared-pages.ts. `team` is manager-only, so it's kept
// here rather than in the shared file.

import type { SubpageData } from "@/components/dashboard/types"

export const manager = {
  name: "Daniel Kim",
  initials: "DK",
  email: "daniel.k@peoplecore.io",
  roleLabel: "Reporting Manager",
}





export const team: SubpageData = {
  kicker: "Management",
  title: "Team",
  sub: "Your direct reports at a glance",
  cta: "Message team",
  stats: [
    { label: "Team size", value: "16", sub: "Product team" },
    { label: "Present today", value: "14", sub: "2 remote" },
    { label: "On leave this week", value: "3", sub: "Aisha, Rohit, Elena" },
  ],
  tableTitle: "Team members",
  cols: "1.4fr 1.2fr 0.9fr 1fr",
  headers: ["Member", "Role", "Attendance", "Today"],
  rows: [
    [{ text: "Aisha Rahman", sub: "EMP-0412", weight: 600 }, { text: "Senior PM" }, { text: "96.4%" }, { tag: "In office", tone: "green" }],
    [{ text: "Rohit Malhotra", sub: "EMP-0455", weight: 600 }, { text: "Designer" }, { text: "94.1%" }, { tag: "Remote", tone: "neutral" }],
    [{ text: "Elena Petrova", sub: "EMP-0389", weight: 600 }, { text: "PM" }, { text: "92.8%" }, { tag: "On leave", tone: "yellow" }],
    [{ text: "Jordan Lee", sub: "EMP-0501", weight: 600 }, { text: "Analyst" }, { text: "97.2%" }, { tag: "In office", tone: "green" }],
    [{ text: "Sam Okafor", sub: "EMP-0640", weight: 600 }, { text: "PM Intern" }, { text: "98.0%" }, { tag: "In office", tone: "green" }],
  ],
}

export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "MGR-0155", sub: "Product Â· Reporting Manager" },
    { label: "Tenure", value: "3.9 yrs", sub: "Joined Aug 2022" },
    { label: "Manager", value: "Noah Bennett", sub: "Super Admin" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF Â· signed", weight: 600 }, { text: "Contract" }, { text: "Aug 2022" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "â€¢â€¢â€¢â€¢ 2264", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Aug 2022" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
