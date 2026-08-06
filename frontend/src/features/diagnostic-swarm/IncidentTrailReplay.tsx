import { Button } from '../../components/Button'
import type { TrailReplay } from './hooks/useTrailReplay'

interface Props {
  replay: TrailReplay
}

/** Play/pause/step scrubber — drives the same `revealed` source of truth. */
export function IncidentTrailReplay({ replay }: Props) {
  const {
    revealed,
    total,
    isPlaying,
    reducedMotion,
    play,
    pause,
    step,
    stepBack,
    reset,
    seek,
  } = replay

  const atEnd = revealed >= total
  const single = total <= 1

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        size="xs"
        onClick={reset}
        disabled={reducedMotion || single}
        aria-label="Restart replay"
      >
        ⏮
      </Button>
      <Button
        size="xs"
        onClick={stepBack}
        disabled={reducedMotion || single || revealed <= 1}
        aria-label="Step back"
      >
        ◀ step
      </Button>
      <Button
        size="xs"
        onClick={isPlaying ? pause : play}
        disabled={reducedMotion || single}
        aria-label={isPlaying ? 'Pause replay' : 'Play replay'}
      >
        {isPlaying ? '⏸ pause' : atEnd ? '↻ replay' : '▶ play'}
      </Button>
      <Button
        size="xs"
        onClick={step}
        disabled={reducedMotion || single || atEnd}
        aria-label="Step forward"
      >
        step ▶
      </Button>

      <input
        type="range"
        min={1}
        max={Math.max(total, 1)}
        value={revealed}
        onChange={(e) => seek(Number(e.target.value))}
        disabled={reducedMotion || single}
        className="h-1 min-w-[120px] flex-1 accent-status-neutral"
        aria-label="Trail replay position"
      />
      <span className="font-mono text-xs text-foreground-muted">
        {revealed}/{total}
      </span>

      {reducedMotion && (
        <span className="text-[11px] text-foreground-muted">
          (reduced motion: full trail shown)
        </span>
      )}
    </div>
  )
}
