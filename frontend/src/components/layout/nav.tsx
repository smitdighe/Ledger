import type { ComponentType, SVGProps } from 'react'
import {
  DashboardIcon,
  EvalIcon,
  IncidentIcon,
  RouterIcon,
  TraceIcon,
} from './icons'

export interface NavItem {
  to: string
  label: string
  icon: ComponentType<SVGProps<SVGSVGElement>>
  /** match nested routes (e.g. /traces/:id) as active too */
  matchPrefix?: boolean
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: DashboardIcon },
  {
    to: '/traces',
    label: 'Trace Explorer',
    icon: TraceIcon,
    matchPrefix: true,
  },
  {
    to: '/incidents',
    label: 'Incidents',
    icon: IncidentIcon,
    matchPrefix: true,
  },
  { to: '/router-config', label: 'Router Config', icon: RouterIcon },
  { to: '/evals', label: 'Evals / Golden Set', icon: EvalIcon },
]
