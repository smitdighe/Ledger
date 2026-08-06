import type { Config } from 'tailwindcss'

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Semantic status tokens only — base + muted variant each.
        // `muted` is intended for backgrounds/borders, `base` for text/icons.
        status: {
          healthy: '#22c55e',
          'healthy-muted': 'rgba(34, 197, 94, 0.15)',
          degraded: '#eab308',
          'degraded-muted': 'rgba(234, 179, 8, 0.15)',
          down: '#ef4444',
          'down-muted': 'rgba(239, 68, 68, 0.15)',
          critical: '#b91c1c',
          'critical-muted': 'rgba(185, 28, 28, 0.18)',
          neutral: '#94a3b8',
          'neutral-muted': 'rgba(148, 163, 184, 0.15)',
        },
        // Surface/foreground for the dense ops dashboard shell.
        surface: {
          DEFAULT: '#0b0e14',
          raised: '#12161f',
          border: '#1e2530',
        },
        foreground: {
          DEFAULT: '#e6e9ef',
          muted: '#94a3b8',
        },
      },
      fontFamily: {
        mono: [
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'Courier New',
          'monospace',
        ],
      },
      // Denser spacing + tighter radii for an ops dashboard.
      spacing: {
        '4.5': '1.125rem',
        '18': '4.5rem',
      },
      borderRadius: {
        card: '0.625rem',
        pill: '9999px',
      },
    },
  },
  plugins: [],
} satisfies Config
