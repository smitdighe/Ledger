import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description?: string
  /** right-aligned actions (buttons, filters) */
  actions?: ReactNode
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-border pb-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          {title}
        </h1>
        {description && (
          <p className="mt-1 text-sm text-foreground-muted">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  )
}
