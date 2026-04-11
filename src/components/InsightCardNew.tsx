import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { Insight, InsightPrioridad } from '../types'

interface InsightCardNewProps {
  insight: Insight
  defaultOpen?: boolean
  // React 19 strict types: este proyecto declara `key` explícitamente para que JSX
  // permita pasar `key={...}` desde el padre (mismo patrón que DiagnosticBlock).
  key?: string | number
}

interface PrioridadStyle {
  border: string
  dot: string
  badge: string
  ghost: string
  label: string
}

const STYLE_BY_PRIO: Record<InsightPrioridad, PrioridadStyle> = {
  CRITICA: {
    border: 'border-l-red-500',
    dot: 'bg-red-500',
    badge: 'bg-red-500/15 text-red-400',
    ghost: 'text-red-400',
    label: 'CRÍTICA',
  },
  ALTA: {
    border: 'border-l-orange-400',
    dot: 'bg-orange-400',
    badge: 'bg-orange-400/15 text-orange-300',
    ghost: 'text-orange-300',
    label: 'ALTA',
  },
  MEDIA: {
    border: 'border-l-blue-400',
    dot: 'bg-blue-400',
    badge: 'bg-blue-400/15 text-blue-300',
    ghost: 'text-blue-300',
    label: 'MEDIA',
  },
  BAJA: {
    border: 'border-l-gray-500',
    dot: 'bg-gray-500',
    badge: 'bg-gray-500/15 text-gray-400',
    ghost: 'text-gray-400',
    label: 'BAJA',
  },
}

const STYLE_POSITIVO: PrioridadStyle = {
  border: 'border-l-emerald-400',
  dot: 'bg-emerald-400',
  badge: 'bg-emerald-400/15 text-emerald-300',
  ghost: 'text-emerald-300',
  label: 'POSITIVO',
}

const URGENCIA_BADGE: Record<string, { cls: string; label: string }> = {
  inmediato:    { cls: 'bg-red-500/15 text-red-400',     label: 'Inmediato' },
  esta_semana:  { cls: 'bg-orange-400/15 text-orange-300', label: 'Esta semana' },
  este_mes:     { cls: 'bg-blue-400/15 text-blue-300',   label: 'Este mes' },
  proximo_mes:  { cls: 'bg-gray-500/15 text-gray-400',   label: 'Próximo mes' },
}

function metaPillColor(cumplimiento: number): string {
  if (cumplimiento < 80) return 'bg-red-500/15 text-red-400'
  if (cumplimiento < 95) return 'bg-amber-400/15 text-amber-300'
  return 'bg-emerald-400/15 text-emerald-300'
}

export default function InsightCardNew({ insight, defaultOpen }: InsightCardNewProps) {
  const [open, setOpen] = useState(defaultOpen ?? false)
  const [accionOpen, setAccionOpen] = useState(false)
  const navigate = useNavigate()

  const style: PrioridadStyle = insight.esPositivo ? STYLE_POSITIVO : STYLE_BY_PRIO[insight.prioridad]

  const handleAnalizar = () => {
    const partes: string[] = [insight.titulo, insight.descripcion]
    if (insight.conclusion) partes.push(`Conclusión: ${insight.conclusion}`)
    if (insight.accion_sugerida) partes.push(insight.accion_sugerida)
    if (insight.contrastePortafolio) partes.push(insight.contrastePortafolio)
    const prefill = partes.join('. ')
    navigate('/chat', {
      state: {
        prefill,
        displayPrefill: `Analizar: ${insight.titulo}`,
        source: 'Diagnóstico',
      },
    })
  }

  const urg = insight.accion?.ejecutableEn
  const urgenciaInfo = urg && URGENCIA_BADGE[urg] ? URGENCIA_BADGE[urg] : null

  const isCritica = insight.prioridad === 'CRITICA' && !insight.esPositivo
  const ringCls = isCritica ? 'ring-1 ring-red-500/30' : ''

  return (
    <div
      className={`bg-[var(--sf-card)] rounded-lg border border-[var(--sf-border)] border-l-[3px] ${style.border} ${ringCls} transition-colors`}
    >
      {/* HEADER (siempre visible) */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left cursor-pointer"
      >
        <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${style.dot}`} />
        <span className="flex-1 text-[17px] font-semibold leading-snug text-[var(--sf-text)]">
          {insight.titulo}
        </span>
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${style.badge}`}>
          {style.label}
        </span>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`text-[var(--sf-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {/* EXPANDIDO */}
      {open && (
        <div className="px-4 pb-4 border-t border-[var(--sf-border)] mt-3 pt-4">
          {/* Bloque 1 — Análisis */}
          <p className="text-[15px] leading-relaxed font-normal text-[var(--sf-text)]">
            {insight.descripcion}
          </p>

          {insight.conclusion && (
            <div className="mt-3 pt-3 border-t border-[var(--sf-border)]">
              <p className="text-[13px] leading-relaxed text-gray-400">
                → {insight.conclusion}
              </p>
            </div>
          )}

          {/* Badges de contexto */}
          {(insight.metaContext || (insight.inventarioContext && insight.inventarioContext.alerta !== 'disponible')) && (
            <div className="mt-2 flex flex-wrap gap-2">
              {insight.metaContext && (
                <span className={`text-[12px] font-medium px-2 py-0.5 rounded-full ${metaPillColor(insight.metaContext.cumplimiento)}`}>
                  Meta: {insight.metaContext.cumplimiento}%
                </span>
              )}
              {insight.inventarioContext && insight.inventarioContext.alerta !== 'disponible' && (
                <span className="text-[12px] font-medium px-2 py-0.5 rounded-full bg-orange-400/15 text-orange-300">
                  ⚠ Stock: {Math.round(insight.inventarioContext.mesesCobertura * 10) / 10} meses
                </span>
              )}
            </div>
          )}

          {insight.contrastePortafolio && (
            <p className="text-[12px] italic text-gray-400 mt-2">
              {insight.contrastePortafolio}
            </p>
          )}

          {/* Bloque 2 — Acción */}
          {insight.accion && (
            <div className="mt-4 pt-4 border-t border-[var(--sf-border)]">
              {!accionOpen ? (
                <button
                  type="button"
                  onClick={() => setAccionOpen(true)}
                  className={`text-[13px] font-medium cursor-pointer ${style.ghost}`}
                >
                  Ver qué hacer →
                </button>
              ) : (
                <div>
                  {urgenciaInfo && (
                    <span className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${urgenciaInfo.cls}`}>
                      {urgenciaInfo.label}
                    </span>
                  )}
                  <p className="text-[15px] font-semibold leading-snug mt-2 text-[var(--sf-text)]">
                    {insight.accion.texto}
                  </p>
                  {insight.accion.respaldo && (
                    <>
                      <div className="mt-2 border-t border-[var(--sf-border)]" />
                      <p className="text-[12px] text-gray-400 mt-1">
                        {insight.accion.respaldo}
                      </p>
                    </>
                  )}
                  {insight.accion.entidades && insight.accion.entidades.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {insight.accion.entidades.map((e, i) => (
                        <span
                          key={`${e}-${i}`}
                          className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[var(--sf-bg)] border border-[var(--sf-border)] text-[var(--sf-text)]"
                        >
                          {e}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Botón Analizar con IA */}
          <div className="mt-4 pt-4 border-t border-[var(--sf-border)]">
            <button
              type="button"
              onClick={handleAnalizar}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg border border-[var(--sf-border)] hover:bg-[var(--sf-hover)] cursor-pointer flex items-center gap-1.5 transition-colors text-[var(--sf-text)]"
            >
              <span>✦</span>
              <span>Analizar con IA</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
