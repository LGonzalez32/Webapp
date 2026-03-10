import type { Insight } from '../../types'
import { cn } from '../../lib/utils'

interface Props {
  insight: Insight
}

const PRIORITY_CONFIG = {
  CRITICA: {
    border: 'border-red-500/40',
    bg: 'bg-red-500/5',
    badge: 'bg-red-500/15 text-red-400',
  },
  ALTA: {
    border: 'border-orange-500/40',
    bg: 'bg-orange-500/5',
    badge: 'bg-orange-500/15 text-orange-400',
  },
  MEDIA: {
    border: 'border-yellow-500/40',
    bg: 'bg-yellow-500/5',
    badge: 'bg-yellow-500/15 text-yellow-400',
  },
  BAJA: {
    border: 'border-zinc-700/60',
    bg: 'bg-zinc-800/30',
    badge: 'bg-zinc-700/50 text-zinc-500',
  },
} as const

export default function InsightCard({ insight }: Props) {
  const cfg = PRIORITY_CONFIG[insight.prioridad]

  return (
    <div className={cn('rounded-xl border p-4 space-y-2', cfg.bg, cfg.border)}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0 leading-none mt-0.5">{insight.emoji}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <p className="text-sm font-bold text-zinc-100 leading-tight">{insight.titulo}</p>
            <span className={cn('px-1.5 py-0.5 rounded text-[9px] font-black uppercase shrink-0', cfg.badge)}>
              {insight.prioridad}
            </span>
          </div>
          <p className="text-xs text-zinc-400 leading-snug">{insight.descripcion}</p>
        </div>
      </div>
      {insight.accion_sugerida && (
        <p className="text-[11px] text-zinc-600 italic pl-8 leading-snug">
          → {insight.accion_sugerida}
        </p>
      )}
    </div>
  )
}
