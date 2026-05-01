// ExecutiveProblemCard — render de un ExecutiveProblem en el Panel Ejecutivo.
// Formato fijo: HEADLINE / ROOT CAUSE / IMPACTO / FOCUS BLOCK / SUPPORTING EVIDENCE.
// Redacción observacional: sin "revisar", "contactar", "evaluar", "analizar más",
// "considerar", "se sugiere", "podría". Solo números concretos y hechos del dato.

import type { Key } from 'react'
import type { ExecutiveProblem } from '../../lib/decision-engine'

interface Props {
  problem: ExecutiveProblem
  key?: Key
}

const SEV_STYLES: Record<string, { bar: string; badge: string; badgeTxt: string }> = {
  CRITICA: {
    bar:      'bg-red-500',
    badge:    'bg-red-500/15 border-red-500/30',
    badgeTxt: 'text-red-400',
  },
  ALTA: {
    bar:      'bg-amber-500',
    badge:    'bg-amber-500/15 border-amber-500/30',
    badgeTxt: 'text-amber-400',
  },
  MEDIA: {
    bar:      'bg-[#4B8EFF]',
    badge:    'bg-[#4B8EFF]/15 border-[#4B8EFF]/30',
    badgeTxt: 'text-[#4B8EFF]',
  },
  BAJA: {
    bar:      'bg-[var(--sf-border)]',
    badge:    'bg-[var(--sf-overlay-medium)] border-[var(--sf-border-subtle)]',
    badgeTxt: 'text-[var(--sf-text-muted)]',
  },
}

function fmtUSD(v: number): string {
  return v.toLocaleString('es-MX', { maximumFractionDigits: 0 })
}

function fmtPct(v: number): string {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

// Tooltips Tarea 2.3 — definiciones desde decision-engine.ts
// material_magnitude: materiality.ratio >= MATERIALITY_FLOOR (0.02 = 2%)
// statistical_anomaly: rootScore >= _STAT_ANOMALY_SCORE (0.85)
// chain_depth: maxChainDepth >= 3
const RELEVANCE_TOOLTIP: Record<'material_magnitude' | 'statistical_anomaly' | 'chain_depth', string> = {
  material_magnitude:  'Hallazgo con impacto significativo: representa al menos 2% del período base.',
  statistical_anomaly: 'Comportamiento fuera del patrón histórico (puntaje estadístico ≥ 0.85).',
  chain_depth:         'Hallazgo conectado en cadena con otros niveles de causa (3 o más).',
}
const TOOLTIP_ENT_COUNT = 'Número de entidades (vendedores, productos o clientes) involucradas en este hallazgo.'
const TOOLTIP_PCT_PERIODO = 'Porcentaje que representa este impacto sobre la base del período comparado.'
const TOOLTIP_BASE_PERIODO = 'Total de ventas del año anterior en el mismo período. Es la base contra la que se mide el impacto.'

export default function ExecutiveProblemCard({ problem }: Props) {
  const sev = SEV_STYLES[problem.severity] ?? SEV_STYLES.MEDIA

  const hasImpact  = problem.totalImpactUSD != null || problem.totalImpactPct != null
  const hasFocus   = problem.focusBlock != null
  const hasEvidence = problem.supportingEvidence.length > 0

  return (
    <div className="flex items-stretch rounded-xl overflow-hidden border border-[var(--sf-border)] bg-[var(--sf-surface)]">
      {/* Barra lateral de severidad */}
      <div className={`w-[3px] shrink-0 ${sev.bar}`} />

      <div className="flex-1 p-4 space-y-3">
        {/* ── HEADLINE ── */}
        <div className="flex items-start gap-2 flex-wrap">
          <span className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1 ${sev.bar}`} />
          <span className="text-[14px] font-semibold leading-tight text-[var(--sf-text)] flex-1">
            {problem.headline}
          </span>
          <div className="flex items-center gap-1 flex-wrap shrink-0">
            {problem.entityCount > 1 && (
              <span
                className="text-[11px] text-[var(--sf-text-muted)]"
                style={{ cursor: 'help' }}
                title={TOOLTIP_ENT_COUNT}
              >
                · {problem.entityCount} ent.
              </span>
            )}
            {problem.relevanceReason.map(r => (
              <span key={r}
                className="text-[9px] px-1.5 py-0.5 rounded border bg-[var(--sf-overlay-medium)] border-[var(--sf-border-subtle)] text-[var(--sf-text-muted)] uppercase tracking-wide"
                style={{ cursor: 'help' }}
                title={RELEVANCE_TOOLTIP[r]}>
                {r === 'material_magnitude' ? 'Importante' : r === 'statistical_anomaly' ? 'anomalía' : 'causal'}
              </span>
            ))}
          </div>
        </div>

        {/* ── ROOT CAUSE ── */}
        {problem.primaryCause && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sf-text-muted)]">
              Por qué pasa
            </p>
            <p className="text-[13px] leading-snug text-[var(--sf-t2)]">
              {problem.primaryCause}
            </p>
            {problem.secondaryCauses.length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {problem.secondaryCauses.map((c, i) => (
                  <li key={i} className="text-[12px] text-[var(--sf-text-muted)] pl-2 border-l border-[var(--sf-border-subtle)]">
                    {c}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* ── IMPACTO ── */}
        {hasImpact && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sf-text-muted)]">
              Impacto
            </p>
            <div className="flex items-baseline gap-2 flex-wrap">
              {problem.totalImpactUSD != null && (
                <span className={`text-[15px] font-bold tabular-nums ${sev.badgeTxt}`}>
                  ${fmtUSD(Math.abs(problem.totalImpactUSD))}
                </span>
              )}
              {problem.totalImpactPct != null && (
                <span className="text-[12px] text-[var(--sf-text-muted)] tabular-nums">
                  {fmtPct(problem.totalImpactPct)}
                </span>
              )}
              {problem.materiality.ratio != null && (
                <span
                  className="text-[11px] tabular-nums text-[var(--sf-text-muted)]"
                  style={{ cursor: 'help' }}
                  title={TOOLTIP_PCT_PERIODO}
                >
                  · {(problem.materiality.ratio * 100).toFixed(1)}% del período
                  {problem.materiality.degraded && (
                    <span className="ml-1 text-[9px] px-1 rounded bg-amber-500/10 text-amber-400">~LY</span>
                  )}
                </span>
              )}
            </div>
            {problem.contextSnapshot.salesLYSamePeriod != null && problem.contextSnapshot.periodLabel && (
              <p
                className="text-[10px] text-[var(--sf-text-muted)]"
                style={{ cursor: 'help' }}
                title={TOOLTIP_BASE_PERIODO}
              >
                Base: ${fmtUSD(problem.contextSnapshot.salesLYSamePeriod)} ({problem.contextSnapshot.periodLabel})
              </p>
            )}
          </div>
        )}

        {/* ── FOCUS BLOCK ── */}
        {hasFocus && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sf-text-muted)]">
              Dónde se concentra
            </p>
            <p className="text-[12px] text-[var(--sf-t2)]">
              <span className="font-medium">{problem.focusBlock!.entityName}</span>
              {' '}
              <span className="text-[var(--sf-text-muted)]">({problem.focusBlock!.entityType})</span>
              {problem.focusBlock!.impactValue != null && (
                <span className="ml-1 tabular-nums text-[var(--sf-text-muted)]">
                  — ${fmtUSD(Math.abs(problem.focusBlock!.impactValue))}
                </span>
              )}
            </p>
          </div>
        )}

        {/* ── SUPPORTING EVIDENCE ── */}
        {hasEvidence && (
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--sf-text-muted)]">
              Evidencia
            </p>
            <ul className="space-y-1">
              {problem.supportingEvidence.map((e, i) => (
                <li key={i} className="text-[12px] text-[var(--sf-text-muted)] flex gap-1.5">
                  <span className="shrink-0 mt-0.5 text-[var(--sf-border)]">·</span>
                  <span>{e}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
