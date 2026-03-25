import { TrendingDown, Minus } from 'lucide-react'
import type { Insight } from '../../types'
import { cn } from '../../lib/utils'

interface Props {
  insight: Insight
}

const PRIORITY_CONFIG = {
  CRITICA: {
    bar:     'bg-red-500',
    wrapper: 'border hover:brightness-[1.03] dark:bg-[#100808] dark:border-[#2A1212] dark:hover:bg-[#160A0A] bg-[var(--sf-red-bg)] border-[var(--sf-red-border)]',
    badge:   'bg-red-500/20 text-red-400 border-red-500/35',
    Icon:    TrendingDown,
  },
  ALTA: {
    bar:     'bg-orange-500',
    wrapper: 'border hover:brightness-[1.03] dark:bg-[#100A06] dark:border-[#2A1A08] dark:hover:bg-[#160D05] bg-[var(--sf-amber-bg)] border-[var(--sf-amber-border)]',
    badge:   'bg-orange-500/20 text-orange-400 border-orange-500/35',
    Icon:    TrendingDown,
  },
  MEDIA: {
    bar:     'bg-[#4B8EFF]',
    wrapper: 'border hover:brightness-[1.03] dark:bg-[#071626] dark:border-[#152840] dark:hover:bg-[#0B1E30] bg-[var(--sf-card)] border-[var(--sf-border-subtle)]',
    badge:   'bg-[#4B8EFF]/20 text-[#4B8EFF] border-[#4B8EFF]/30',
    Icon:    Minus,
  },
  BAJA: {
    bar:     'bg-[#2A4A6A]',
    wrapper: 'border hover:brightness-[1.03] dark:bg-[#071626] dark:border-[#0F2030] dark:hover:bg-[#081828] bg-[var(--sf-card)] border-[var(--sf-border-subtle)]',
    badge:   'bg-[var(--sf-overlay-medium)] text-[var(--sf-t5)] border-[var(--sf-border-subtle)]',
    Icon:    Minus,
  },
} as const

export default function InsightCard({ insight }: Props) {
  const cfg = PRIORITY_CONFIG[insight.prioridad]
  const { Icon } = cfg

  return (
    <div className={cn(
      'flex items-stretch border rounded-xl overflow-hidden transition-all duration-200',
      cfg.wrapper,
    )}>
      {/* Left severity bar */}
      <div className={cn('w-[3px] shrink-0', cfg.bar)} />

      <div className="flex-1 p-4 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-semibold leading-tight" style={{ color: 'var(--sf-t2)' }}>{insight.titulo}</p>
          <span className={cn(
            'inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase border shrink-0',
            cfg.badge,
          )}>
            <Icon className="w-2.5 h-2.5" />
            {insight.prioridad}
          </span>
        </div>
        <p className="text-xs leading-relaxed" style={{ color: 'var(--sf-t4)' }}>{insight.descripcion}</p>
        {insight.accion_sugerida && (
          <p className="text-[11px] leading-snug" style={{ color: 'var(--sf-t6)' }}>→ {insight.accion_sugerida}</p>
        )}
      </div>
    </div>
  )
}
