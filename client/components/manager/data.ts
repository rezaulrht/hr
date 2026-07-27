// Static presentation data for the Reporting Manager role, transcribed from
// the approved design (PeopleCore HR & Payroll — Employee Dashboard.dc.html,
// roles['Reporting Manager']). Shared subpages live in
// components/dashboard/shared-pages.ts. `team` is manager-only, so it's kept
// here rather than in the shared file.

import type { ChartBar, SubpageData, Stat, TableCell } from "@/components/dashboard/types"

export const manager = {
  name: "Daniel Kim",
  initials: "DK",
  email: "daniel.k@peoplecore.io",
  roleLabel: "Reporting Manager",
}

export const dashboard = {
  kicker: "Team overview · Product",
  heading: "Good morning, Daniel",
  sub: "5 approvals waiting on you",
  cta: "Review approvals",
}

export const stats: Stat[] = [
  {
    label: "Team size",
    value: "16",
    sub: "14 in office · 2 remote today",
    tag: "Full strength",
    tone: "green",
    bars: [88, 88, 90, 92, 94],
    hotBar: 4,
  },
  {
    label: "Team attendance",
    value: "94.8%",
    sub: "This month · 2 late check-ins",
    tag: "On track",
    tone: "green",
    bars: [90, 92, 88, 95, 94],
    hotBar: 4,
  },
  {
    label: "Pending approvals",
    value: "5",
    sub: "3 leave · 2 expense claims",
    tag: "Action",
    tone: "yellow",
    bars: [25, 40, 30, 55, 50],
    hotBar: 4,
  },
  {
    label: "On leave this week",
    value: "3",
    sub: "Aisha, Rohit, Elena",
    tag: "Planned",
    tone: "neutral",
    bars: [20, 20, 35, 50, 45],
    hotBar: 4,
  },
]

export const chart = {
  title: "Team attendance this week",
  sub: "Present, of 16",
  bars: [
    { label: "Mon", display: "15", height: 94 },
    { label: "Tue", display: "16", height: 100 },
    { label: "Wed", display: "14", height: 88 },
    { label: "Thu", display: "15", height: 94 },
    { label: "Fri", display: "13", height: 81 },
  ] satisfies ChartBar[],
}

export const activityTable = {
  title: "Approvals waiting on you",
  cols: "1.4fr 1.6fr 0.9fr 0.9fr",
  headers: ["Team member", "Request", "Submitted", "Status"],
  rows: [
    [{ text: "Aisha Rahman", sub: "Senior PM", weight: 600 }, { text: "Annual leave", sub: "Aug 10 – Aug 14 · 5 days" }, { text: "2h ago" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Rohit Malhotra", sub: "Designer", weight: 600 }, { text: "Expense — user research incentives", sub: "$210.00" }, { text: "5h ago" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Elena Petrova", sub: "PM", weight: 600 }, { text: "Sick leave", sub: "Jul 28 · 1 day" }, { text: "Yesterday" }, { tag: "Pending", tone: "yellow" }],
    [{ text: "Jordan Lee", sub: "Analyst", weight: 600 }, { text: "Work-from-home request", sub: "Aug 4 – Aug 8" }, { text: "Yesterday" }, { tag: "Approved", tone: "green" }],
    [{ text: "Sam Okafor", sub: "PM Intern", weight: 600 }, { text: "Expense — team lunch", sub: "$96.20 · over per-head limit" }, { text: "Jul 22" }, { tag: "Rejected", tone: "red" }],
  ] satisfies TableCell[][],
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
    { label: "Employee ID", value: "MGR-0155", sub: "Product · Reporting Manager" },
    { label: "Tenure", value: "3.9 yrs", sub: "Joined Aug 2022" },
    { label: "Manager", value: "Noah Bennett", sub: "Super Admin" },
  ],
  tableTitle: "Documents & records",
  cols: "1.6fr 1.1fr 0.9fr 0.9fr",
  headers: ["Document", "Category", "Updated", "Status"],
  rows: [
    [{ text: "Employment contract", sub: "PDF · signed", weight: 600 }, { text: "Contract" }, { text: "Aug 2022" }, { tag: "Current", tone: "green" }],
    [{ text: "Tax withholding form", sub: "W-4", weight: 600 }, { text: "Tax" }, { text: "Jan 2026" }, { tag: "Current", tone: "green" }],
    [{ text: "Direct deposit details", sub: "•••• 2264", weight: 600 }, { text: "Banking" }, { text: "Jan 2026" }, { tag: "Verified", tone: "green" }],
    [{ text: "Emergency contact", weight: 600 }, { text: "Personal" }, { text: "Aug 2022" }, { tag: "Review due", tone: "yellow" }],
    [{ text: "Benefits enrollment", sub: "Health + dental", weight: 600 }, { text: "Benefits" }, { text: "Nov 2025" }, { tag: "Enrolled", tone: "green" }],
  ],
}
