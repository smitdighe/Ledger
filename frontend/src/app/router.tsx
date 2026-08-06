/* eslint-disable react-refresh/only-export-components -- route config module, not a component file */
import { lazy } from 'react'
import { createBrowserRouter } from 'react-router-dom'
import { AppShell } from '../components/layout/AppShell'

// lazy pages → route-transition loading fallback (Suspense in AppShell)
const DashboardPage = lazy(() => import('../pages/DashboardPage'))
const TraceExplorerPage = lazy(() => import('../pages/TraceExplorerPage'))
const TraceDetailPanel = lazy(() => import('../pages/TraceDetailPanel'))
const SelectTracePanel = lazy(() => import('../pages/SelectTracePanel'))
const IncidentsPage = lazy(() => import('../pages/IncidentsPage'))
const IncidentDetailPage = lazy(() => import('../pages/IncidentDetailPage'))
const RouterConfigPage = lazy(() => import('../pages/RouterConfigPage'))
const EvalGoldenSetPage = lazy(() => import('../pages/EvalGoldenSetPage'))
const NotFoundPage = lazy(() => import('../pages/NotFoundPage'))

export const router = createBrowserRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <DashboardPage /> },
      {
        path: 'traces',
        element: <TraceExplorerPage />,
        children: [
          { index: true, element: <SelectTracePanel /> },
          { path: ':traceId', element: <TraceDetailPanel /> },
        ],
      },
      { path: 'incidents', element: <IncidentsPage /> },
      { path: 'incidents/:incidentId', element: <IncidentDetailPage /> },
      { path: 'router-config', element: <RouterConfigPage /> },
      { path: 'evals', element: <EvalGoldenSetPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
])
