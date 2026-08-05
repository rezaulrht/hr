// Nav icons are referenced by name (not component reference) in nav-config
// data because that data flows from a Server Component layout into the
// client Sidebar as props — function/component values can't cross that RSC
// boundary, but this lookup (used only inside the client Sidebar) can.

import {
  RiBarChartLine,
  RiBillLine,
  RiCalendarEventLine,
  RiComputerLine,
  RiContactsBook2Line,
  RiDashboardLine,
  RiMegaphoneLine,
  RiReceiptLine,
  RiSettingsLine,
  RiTeamLine,
  RiTimeLine,
  RiUser3Line,
  RiWallet3Line,
  type RemixiconComponentType,
} from "@remixicon/react"

export const icons = {
  RiDashboardLine,
  RiTimeLine,
  RiCalendarEventLine,
  RiWallet3Line,
  RiReceiptLine,
  RiMegaphoneLine,
  RiUser3Line,
  RiTeamLine,
  RiBarChartLine,
  RiSettingsLine,
  RiContactsBook2Line,
  RiComputerLine,
  RiBillLine,
} satisfies Record<string, RemixiconComponentType>

export type IconName = keyof typeof icons
