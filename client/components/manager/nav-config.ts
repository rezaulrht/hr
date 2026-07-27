import type { NavGroup } from "@/components/dashboard/types"

export const navGroups: NavGroup[] = [
  {
    label: "My team",
    items: [
      { label: "Dashboard", href: "/manager", icon: "RiDashboardLine" },
      { label: "Team", href: "/manager/team", icon: "RiTeamLine" },
      { label: "Attendance", href: "/manager/attendance", icon: "RiTimeLine" },
      { label: "Leave", href: "/manager/leave", icon: "RiCalendarEventLine" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { label: "Reports", href: "/manager/reports", icon: "RiBarChartLine", badge: 2 },
      { label: "Announcements", href: "/manager/announcements", icon: "RiMegaphoneLine" },
    ],
  },
  {
    label: "Account",
    items: [{ label: "My Profile", href: "/manager/profile", icon: "RiUser3Line" }],
  },
]
