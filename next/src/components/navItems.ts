import { LayoutGrid, ClipboardList, FolderKanban, Map as MapIcon, CreditCard } from 'lucide-react'

// `bottom` = shown in the mobile bottom tab bar. Subscription lives in the mobile
// top bar instead to keep the bottom bar to the four primary destinations.
// There is no Capture entry: points are captured with the mobile app, not the dashboard.
export const navItems = [
  { href: '/home', label: 'Overview', short: 'Home', icon: LayoutGrid, bottom: true },
  { href: '/surveys', label: 'Records', short: 'Records', icon: ClipboardList, bottom: true },
  { href: '/projects', label: 'Projects', short: 'Projects', icon: FolderKanban, bottom: true },
  { href: '/map', label: 'Map', short: 'Map', icon: MapIcon, bottom: true },
  { href: '/subscription', label: 'Subscription', short: 'Plan', icon: CreditCard, bottom: false },
]
