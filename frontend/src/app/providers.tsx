import { useState, type ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

/**
 * App-wide providers. Minimal for now: React Query only. No polling intervals
 * yet (Phase 6). Dark mode is applied globally via the `dark` class on <html>.
 */
export function Providers({ children }: { children: ReactNode }) {
  // one client per app instance
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // 'always' so a failed/refused/CORS-blocked request surfaces as a
            // real error state instead of being paused (default 'online' would
            // leave the query pending and mask backend-down as "empty").
            networkMode: 'always',
          },
          mutations: {
            networkMode: 'always',
          },
        },
      }),
  )

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}
