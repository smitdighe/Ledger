import { Suspense, useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { cn } from '../../lib/cn'
import { Skeleton } from '../Skeleton'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

/** Loading fallback for lazy route transitions. */
function RouteFallback() {
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-4 w-80" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
        <Skeleton className="h-40" />
      </div>
    </div>
  )
}

export function AppShell() {
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)

  // Escape closes the mobile drawer
  useEffect(() => {
    if (!mobileOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMobileOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mobileOpen])

  return (
    <div className="flex h-screen overflow-hidden bg-surface text-foreground">
      {/* desktop sidebar — persistent, collapsible to icon rail */}
      <aside
        className={cn(
          'hidden shrink-0 border-r border-surface-border md:block',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <Sidebar
          collapsed={collapsed}
          onToggleCollapse={() => setCollapsed((c) => !c)}
        />
      </aside>

      {/* mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-black/50"
            onClick={() => setMobileOpen(false)}
          />
          <div className="absolute inset-y-0 left-0 w-60 border-r border-surface-border shadow-xl">
            <Sidebar
              collapsed={false}
              onToggleCollapse={() => setCollapsed((c) => !c)}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      {/* main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMobileNav={() => setMobileOpen(true)} />
        <main className="flex-1 overflow-y-auto">
          <Suspense fallback={<RouteFallback />}>
            <Outlet />
          </Suspense>
        </main>
      </div>
    </div>
  )
}
