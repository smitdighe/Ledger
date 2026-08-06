import { MenuIcon } from './icons'
import { HealthGauge } from '../../features/health-score'

interface TopbarProps {
  onOpenMobileNav: () => void
}

export function Topbar({ onOpenMobileNav }: TopbarProps) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-surface-border bg-surface px-4">
      {/* mobile nav toggle */}
      <button
        type="button"
        onClick={onOpenMobileNav}
        aria-label="Open navigation"
        className="rounded p-1.5 text-foreground-muted hover:bg-surface-border/40 hover:text-foreground md:hidden"
      >
        <MenuIcon />
      </button>

      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">Ledger</span>
        <span className="hidden text-xs text-foreground-muted sm:inline">
          LLM Ops Observability
        </span>
      </div>

      <div className="flex-1" />

      {/* health-score gauge slot — compact gauge */}
      <div
        className="flex h-9 items-center gap-2 rounded-card border border-surface-border px-2 sm:px-3"
        role="group"
        aria-label="Health score"
      >
        <span className="hidden font-mono text-xs text-foreground-muted sm:inline">
          health
        </span>
        <HealthGauge variant="compact" />
      </div>
    </header>
  )
}
