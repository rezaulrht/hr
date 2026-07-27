import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: "RiDashboardLine" },
      { label: "Employees", href: "/admin/employees", icon: "RiTeamLine" },
      { label: "Attendance", href: "/admin/attendance", icon: "RiTimeLine" },
      { label: "Leave", href: "/admin/leave", icon: "RiCalendarEventLine" },
    ],
  },
  {
    label: "Payroll & finance",
    items: [
      { label: "Payroll", href: "/admin/payroll", icon: "RiWallet3Line" },
      { label: "Expenses", href: "/admin/expenses", icon: "RiReceiptLine" },
      { label: "Settlements", href: "/admin/settlements", icon: "RiReceiptLine" },
    ],
  },
  {
    label: "Administration",
    items: [
      { label: "Users", href: "/admin/users", icon: "RiTeamLine" },
      { label: "Reports", href: "/admin/reports", icon: "RiBarChartLine" },
      { label: "Announcements", href: "/admin/announcements", icon: "RiMegaphoneLine" },
      { label: "Settings", href: "/admin/settings", icon: "RiSettingsLine" },
      { label: "My Profile", href: "/admin/profile", icon: "RiUser3Line" },
    ],
  },
]
