import type { SVGProps } from 'react'

/** Minimal inline stroke icons (currentColor). Keeps the shell dependency-free. */
const base = {
  width: 18,
  height: 18,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
}

export function DashboardIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="7" height="9" />
      <rect x="14" y="3" width="7" height="5" />
      <rect x="14" y="12" width="7" height="9" />
      <rect x="3" y="16" width="7" height="5" />
    </svg>
  )
}

export function TraceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="17" y2="18" />
      <circle cx="18" cy="12" r="1.6" />
    </svg>
  )
}

export function IncidentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3 2 20h20L12 3Z" />
      <line x1="12" y1="10" x2="12" y2="14" />
      <line x1="12" y1="17" x2="12" y2="17" />
    </svg>
  )
}

export function RouterIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="13" width="18" height="7" rx="1.5" />
      <line x1="7" y1="16.5" x2="7" y2="16.5" />
      <line x1="11" y1="16.5" x2="11" y2="16.5" />
      <path d="M12 13V8m0 0 3 2m-3-2-3 2" />
    </svg>
  )
}

export function EvalIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  )
}

export function MenuIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="20" y2="17" />
    </svg>
  )
}

export function ChevronLeftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...props}>
      <polyline points="15 18 9 12 15 6" />
    </svg>
  )
}
