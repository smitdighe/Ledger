import { NavLink } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Badge } from '../Badge'
import { NAV_ITEMS } from './nav'
import { ChevronLeftIcon } from './icons'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  /** called after a nav click (used to close the mobile drawer) */
  onNavigate?: () => void
}

export function Sidebar({
  collapsed,
  onToggleCollapse,
  onNavigate,
}: SidebarProps) {
  return (
    <div className="flex h-full flex-col bg-surface-raised">
      {/* brand */}
      <div className="flex h-14 items-center gap-2 border-b border-surface-border px-4">
        <span className="text-status-healthy" aria-hidden="true">
          ◆
        </span>
        {!collapsed && (
          <span className="font-semibold tracking-tight text-foreground">
            Ledger
          </span>
        )}
      </div>

      {/* nav */}
      <nav className="flex-1 space-y-1 overflow-y-auto p-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon, matchPrefix }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/' || !matchPrefix}
            onClick={onNavigate}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded px-3 py-2 text-sm transition-colors',
                collapsed && 'justify-center px-0',
                isActive
                  ? 'bg-status-neutral-muted font-medium text-foreground'
                  : 'text-foreground-muted hover:bg-surface-border/40 hover:text-foreground',
              )
            }
          >
            <Icon className="shrink-0" />
            {!collapsed && <span className="truncate">{label}</span>}
          </NavLink>
        ))}
      </nav>

      {/* footer: placeholder overall-health indicator (static, no real data) */}
      <div className="border-t border-surface-border p-3">
        {collapsed ? (
          <div
            className="mx-auto h-2.5 w-2.5 rounded-full bg-status-neutral"
            title="Overall health: unknown"
            aria-label="Overall health: unknown"
          />
        ) : (
          <div className="flex items-center justify-between">
            <span className="text-xs text-foreground-muted">Overall</span>
            <Badge variant="neutral">unknown</Badge>
          </div>
        )}
      </div>

      {/* desktop collapse toggle */}
      <button
        type="button"
        onClick={onToggleCollapse}
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        aria-expanded={!collapsed}
        className="hidden items-center justify-center gap-2 border-t border-surface-border py-2 text-xs text-foreground-muted hover:text-foreground md:flex"
      >
        <ChevronLeftIcon
          className={cn('transition-transform', collapsed && 'rotate-180')}
          width={16}
          height={16}
        />
        {!collapsed && <span>Collapse</span>}
      </button>
    </div>
  )
}
