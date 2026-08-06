import { motion } from 'framer-motion'
import { Badge } from '../../components/Badge'
import { CountUpNumber } from '../../components/CountUpNumber'
import { PollIndicator } from '../../components/PollIndicator'
import { QueryError } from '../../components/QueryError'
import { Skeleton } from '../../components/Skeleton'
import { useReducedMotion } from '../../hooks/useReducedMotion'
import { useHealthLiveness, useHealthTiers } from '../../hooks/useHealth'
import { computeHealthScore } from '../../lib/computeHealthScore'
import { pollState, type PollState } from '../../lib/pollStatus'
import { STATUS_HEX, SURFACE_HEX } from '../../lib/constants'
import type { StatusToken } from '../../lib/buildSwarmGraph'

function polar(cx: number, cy: number, r: number, deg: number) {
  const a = ((deg - 90) * Math.PI) / 180
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}
function arc(cx: number, cy: number, r: number, a0: number, a1: number) {
  const p0 = polar(cx, cy, r, a0)
  const p1 = polar(cx, cy, r, a1)
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const sweep = a1 > a0 ? 1 : 0
  return `M ${p0.x} ${p0.y} A ${r} ${r} 0 ${large} ${sweep} ${p1.x} ${p1.y}`
}

// score 0..100 → needle/arc angle -90 (left) .. +90 (right)
const angleFor = (score: number) => -90 + (score / 100) * 180

interface Props {
  variant?: 'full' | 'compact'
}

export function HealthGauge({ variant = 'full' }: Props) {
  const reducedMotion = useReducedMotion()
  const liveness = useHealthLiveness()
  const tiers = useHealthTiers()

  const livenessOk = liveness.isSuccess && liveness.data?.status === 'ok'

  const feed = pollState({
    isError: liveness.isError || tiers.isError,
    data: tiers.data,
    failureCount: Math.max(liveness.failureCount, tiers.failureCount),
  })

  // liveness definitively down (and no tier data to fall back on) → backend down
  if (liveness.isError && !tiers.data) {
    return (
      <GaugeBody
        variant={variant}
        score={0}
        band="critical"
        caption="backend down"
        reducedMotion={reducedMotion}
        feed="disconnected"
      />
    )
  }
  // no data yet at all → loading (full variant shaped like the gauge arc)
  if (!tiers.data && (liveness.isPending || tiers.isPending)) {
    return variant === 'compact' ? (
      <Skeleton className="h-9 w-24" />
    ) : (
      <div className="flex flex-col items-center gap-3" aria-hidden="true">
        <Skeleton className="h-[100px] w-[200px] rounded-t-full" />
        <Skeleton className="h-8 w-16" />
        <Skeleton className="h-4 w-32" />
      </div>
    )
  }
  // sustained failure with nothing cached → hard error
  if (feed === 'disconnected' && !tiers.data) {
    return (
      <QueryError
        error={tiers.error ?? liveness.error}
        onRetry={() => tiers.refetch()}
      />
    )
  }

  // otherwise render from last-known-good tier data (may be `stale`)
  const hs = computeHealthScore(
    tiers.data,
    livenessOk || Boolean(liveness.data),
  )
  return (
    <GaugeBody
      variant={variant}
      score={hs.score}
      band={hs.band}
      caption={`${hs.tiersUp}/${hs.tiersTotal} tiers up`}
      reducedMotion={reducedMotion}
      feed={feed}
    />
  )
}

interface BodyProps {
  variant: 'full' | 'compact'
  score: number
  band: StatusToken
  caption: string
  reducedMotion: boolean
  feed: PollState
}

function GaugeBody({
  variant,
  score,
  band,
  caption,
  reducedMotion,
  feed,
}: BodyProps) {
  const color = STATUS_HEX[band]

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-2">
        <span className="font-mono text-lg font-semibold" style={{ color }}>
          <CountUpNumber value={score} />
        </span>
        <Badge variant={band}>{band}</Badge>
        {feed !== 'live' && <PollIndicator state={feed} />}
      </div>
    )
  }

  const endAngle = angleFor(score)
  return (
    <div className="flex flex-col items-center">
      <svg viewBox="0 0 200 130" className="w-full max-w-[280px]">
        {/* track */}
        <path
          d={arc(100, 100, 80, -90, 90)}
          fill="none"
          stroke={SURFACE_HEX.border}
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* value */}
        <path
          d={arc(100, 100, 80, -90, endAngle)}
          fill="none"
          stroke={color}
          strokeWidth={12}
          strokeLinecap="round"
        />
        {/* needle */}
        <motion.g
          style={{ transformOrigin: '100px 100px' }}
          initial={reducedMotion ? false : { rotate: -90 }}
          animate={{ rotate: endAngle }}
          transition={{ duration: reducedMotion ? 0 : 0.9, ease: 'easeOut' }}
        >
          <line
            x1={100}
            y1={100}
            x2={100}
            y2={34}
            stroke={color}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
          <circle cx={100} cy={100} r={5} fill={color} />
        </motion.g>
      </svg>

      <div className="-mt-4 text-center">
        <div className="font-mono text-3xl font-semibold" style={{ color }}>
          <CountUpNumber value={score} />
        </div>
        <div className="mt-1 flex items-center justify-center gap-2">
          <Badge variant={band}>{band}</Badge>
          <span className="text-xs text-foreground-muted">{caption}</span>
          {feed !== 'live' && <PollIndicator state={feed} />}
        </div>
        <p className="mt-2 text-[11px] text-foreground-muted">
          frontend-computed score (no backend aggregate)
        </p>
      </div>
    </div>
  )
}
