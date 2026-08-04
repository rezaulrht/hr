import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "Workspace",
    items: [
      { label: "Dashboard", href: "/employee", icon: "RiDashboardLine" },
      { label: "Attendance", href: "/employee/attendance", icon: "RiTimeLine" },
      { label: "Leave", href: "/employee/leave", icon: "RiCalendarEventLine" },
      { label: "Payroll", href: "/employee/payroll", icon: "RiWallet3Line" },
      { label: "Expenses", href: "/employee/expenses", icon: "RiReceiptLine" },
      { label: "Directory", href: "/employee/directory", icon: "RiContactsBook2Line" },
    ],
  },
  {
    label: "Account",
    items: [
      { label: "Announcements", href: "/employee/announcements", icon: "RiMegaphoneLine" },
      { label: "My Profile", href: "/employee/profile", icon: "RiUser3Line" },
    ],
  },
]
