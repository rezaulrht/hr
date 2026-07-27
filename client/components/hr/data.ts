// Static presentation data for the HR Admin role, transcribed from the
// approved design (PeopleCore HR & Payroll — Employee Dashboard.dc.html,
// roles['HR Admin']). Shared subpages live in components/dashboard/shared-pages.ts.

import type { ChartBar, SubpageData, Stat, TableCell } from "@/components/dashboard/types"

export const hr = {
  name: "Priya Nair",
  initials: "PN",
  email: "priya.n@peoplecore.io",
  roleLabel: "HR Admin",
}

export const dashboard = {
  kicker: "People operations",
  heading: "Good morning, Priya",
  sub: "8 leave requests waiting on you",
  cta: "Review requests",
}

export const stats: Stat[] = [
  {
    label: "Headcount",
    value: "1,248",
    sub: "1,190 active · 58 on leave",
    tag: "Stable",
    tone: "neutral",
    bars: [85, 86, 88, 90, 92],
    hotBar: 4,
  },
  {
    label: "Leave requests",
    value: "8 open",
    sub: "Oldest waiting 3 days",
    tag: "Pending",
    tone: "yellow",
    bars: [30, 50, 40, 70, 60],
    hotBar: 4,
  },
  {
    label: "Onboarding",
    value: "14",
    sub: "6 starting Monday",
    tag: "On track",
    tone: "green",
    bars: [20, 35, 50, 70, 90],
    hotBar: 4,
  },
  {
    label: "Attrition (Q3)",
    value: "2.1%",
    sub: "Down from 2.8% in Q2",
    tag: "Improving",
    tone: "green",
    bars: [70, 60, 55, 45, 38],
    hotBar: 4,
  },
]

export const chart = {
  title: "Headcount by department",
  sub: "Active employees",
  bars: [
    { label: "Eng", display: "482", height: 100 },
    { label: "Sales", display: "296", height: 61 },
    { label: "Ops", display: "214", height: 44 },
    { label: "CX", display: "158", height: 33 },
    { label: "G&A", display: "98", height: 20 },
  ] satisfies ChartBar[],
}

export const activityTable = {
  title: "Leave requests to review",
  cols: "1.4fr 1.4fr 1fr 0.9fr",
  headers: ["Employee", "Dates", "Type", "Status"],
  rows: [
    [{ text: "Aisha Rahman", sub: "Product · EMP-0412", weight: 600 }, { text: "Aug 10 – Aug 14", sub: "5 days" }, { text: "Annual" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Tomás Silva", sub: "Engineering · EMP-0287", weight: 600 }, { text: "Aug 3", sub: "1 day" }, { text: "Sick" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Grace Osei", sub: "Sales · EMP-0533", weight: 600 }, { text: "Aug 17 – Aug 28", sub: "10 days" }, { text: "Annual" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Liam Carter", sub: "Ops · EMP-0198", weight: 600 }, { text: "Jul 30 – Jul 31", sub: "2 days" }, { text: "Personal" }, { tag: "Approved", tone: "green" }],
    [{ text: "Mei Chen", sub: "CX · EMP-0621", weight: 600 }, { text: "Jul 28", sub: "1 day" }, { text: "Sick" }, { tag: "Rejected", tone: "red" }],
  ] satisfies TableCell[][],
}

export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "HRA-0103", sub: "People operations · HR Admin" },
    { label: "Tenure", value: "4.1 yrs", sub: "Joined Jun 2022" },
    { label: "Manager", value: "Noah Bennett", sub: "Super Admin" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF · signed", weight: 600 }, { text: "Contract" }, { text: "Jun 2022" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "•••• 3390", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Jun 2022" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
