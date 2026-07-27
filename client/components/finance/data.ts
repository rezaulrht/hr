// Static presentation data for the Finance Officer role, transcribed from
// the approved design (PeopleCore HR & Payroll — Employee Dashboard.dc.html,
// roles['Finance Officer']). Shared subpages live in
// components/dashboard/shared-pages.ts.

import type { ChartBar, SubpageData, Stat, TableCell } from "@/components/dashboard/types"

export const finance = {
  name: "Marcus Webb",
  initials: "MW",
  email: "marcus.w@peoplecore.io",
  roleLabel: "Finance Officer",
}

export const dashboard = {
  kicker: "Payroll & finance",
  heading: "Good morning, Marcus",
  sub: "July payroll run is in preview",
  cta: "Open payroll run",
}

export const stats: Stat[] = [
  {
    label: "July payroll",
    value: "$1.92M",
    sub: "1,248 employees · runs Aug 1",
    tag: "In preview",
    tone: "yellow",
    bars: [70, 72, 75, 80, 85],
    hotBar: 4,
  },
  {
    label: "Disbursed YTD",
    value: "$12.6M",
    sub: "Across 7 completed runs",
    tag: "Reconciled",
    tone: "green",
    bars: [40, 50, 62, 74, 88],
    hotBar: 4,
  },
  {
    label: "Reimbursements",
    value: "31 open",
    sub: "$8,214 awaiting payout",
    tag: "Pending",
    tone: "yellow",
    bars: [45, 60, 30, 55, 65],
    hotBar: 4,
  },
  {
    label: "Tax filings",
    value: "Q2 done",
    sub: "Q3 estimate due Sep 15",
    tag: "Filed",
    tone: "green",
    bars: [80, 80, 85, 90, 95],
    hotBar: 4,
  },
]

export const chart = {
  title: "Disbursements, last 6 months",
  sub: "Net payouts incl. reimbursements, USD",
  bars: [
    { label: "Feb", display: "1.68", height: 88 },
    { label: "Mar", display: "1.71", height: 90 },
    { label: "Apr", display: "1.75", height: 92 },
    { label: "May", display: "1.79", height: 94 },
    { label: "Jun", display: "1.83", height: 96 },
    { label: "Jul", display: "1.90M", height: 100 },
  ] satisfies ChartBar[],
}

export const activityTable = {
  title: "Expense claims to approve",
  cols: "1.4fr 1.5fr 0.8fr 0.9fr",
  headers: ["Employee", "Claim", "Amount", "Status"],
  rows: [
    [{ text: "Aisha Rahman", sub: "Product", weight: 600 }, { text: "Client dinner", sub: "Jul 24 · receipt attached" }, { text: "$148.90", weight: 600 }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Grace Osei", sub: "Sales", weight: 600 }, { text: "Flight — NYC conference", sub: "Jul 21 · policy OK" }, { text: "$412.00", weight: 600 }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Tomás Silva", sub: "Engineering", weight: 600 }, { text: "Cloud tooling licence", sub: "Jul 20 · needs manager sign-off" }, { text: "$89.00", weight: 600 }, { tag: "On hold", tone: "yellow" }],
    [{ text: "Liam Carter", sub: "Ops", weight: 600 }, { text: "Warehouse safety gear", sub: "Jul 18" }, { text: "$236.50", weight: 600 }, { tag: "Approved", tone: "green" }],
    [{ text: "Mei Chen", sub: "CX", weight: 600 }, { text: "Duplicate mileage claim", sub: "Jul 15 · flagged by audit" }, { text: "$62.40", weight: 600 }, { tag: "Rejected", tone: "red" }],
  ] satisfies TableCell[][],
}

export const profile: SubpageData = {
  kicker: "Administration",
  title: "My Profile",
  sub: "Personal details, documents, and access",
  cta: "Edit profile",
  stats: [
    { label: "Employee ID", value: "FIN-0207", sub: "Payroll & finance · Finance Officer" },
    { label: "Tenure", value: "2.8 yrs", sub: "Joined Nov 2023" },
    { label: "Manager", value: "Noah Bennett", sub: "Super Admin" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF · signed", weight: 600 }, { text: "Contract" }, { text: "Nov 2023" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "•••• 5518", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Nov 2023" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
