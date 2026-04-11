import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../../lib/useDemoPath'
import type { DiagnosticBlock as Block, DiagnosticSeverity } from '../../lib/diagnostic-engine'

const SEVERITY_BORDER: Record<DiagnosticSeverity, string> = {
  critical: 'var(--sf-red)',
  warning: 'var(--sf-amber)',
  info: 'var(--sf-t3)',
  positive: 'var(--sf-green)',
}

const SEVERITY_DOT: Record<DiagnosticSeverity, string> = {
  critical: '#ef4444',
  warning: '#f59e0b',
  info: '#94a3b8',
  positive: '#10b981',
}

const fmtMoney = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n).toLocaleString('es')}`
}

export default function DiagnosticBlockView({
  block,
  defaultExpanded = false,
}: {
  block: Block
  defaultExpanded?: boolean
  key?: string | number
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const navigate = useNavigate()
  const dp = useDemoPath()
  const borderColor = SEVERITY_BORDER[block.severity]
  const dotColor = SEVERITY_DOT[block.severity]

  const toggleExpand = () => setExpanded(prev => !prev)

  const handleLinkClick = (e: any, link: Block['links'][number]) => {
    e.stopPropagation()
    if (link.type === 'vendedor') {
      navigate(dp(`/vendedores?vendedor=${encodeURIComponent(link.target)}`))
    } else if (link.type === 'cliente') {
      navigate(dp('/clientes'), { state: { openCliente: link.target, source: 'diagnostic' } })
    } else if (link.type === 'producto' || link.type === 'categoria') {
      const q = link.target ? `?categoria=${encodeURIComponent(link.target)}` : ''
      navigate(dp(`/rotacion${q}`))
    }
  }

  const handleProfundizar = (e: any) => {
    e.stopPropagation()
    const sectionsText = block.sections
      .map(s => `${s.label}\n${s.items.map(it => `${s.type === 'action' ? '→' : '-'} ${it}`).join('\n')}`)
      .join('\n\n')
    const fullContext = [
      `Profundizar sobre: ${block.headline}`,
      ``,
      `Resumen: ${block.summaryShort}`,
      block.impactoTotal !== null && block.impactoTotal > 0
        ? `Impacto: ${fmtMoney(block.impactoTotal)} (${block.impactoLabel ?? ''})`
        : '',
      ``,
      sectionsText,
      ``,
      `¿Qué patrón de fondo hay detrás? ¿Qué acciones priorizarías esta semana?`,
    ].filter(Boolean).join('\n')
    navigate(dp('/chat'), {
      state: {
        prefill: fullContext,
        displayPrefill: `Profundizar: ${block.headline}`,
        source: 'Diagnóstico',
      },
    })
  }

  return (
    <div
      onClick={toggleExpand}
      className="rounded-lg p-5 cursor-pointer transition-colors"
      style={{
        background: 'var(--sf-card)',
        border: '1px solid var(--sf-border)',
        borderLeft: `4px solid ${borderColor}`,
      }}
    >
      {/* Headline row */}
      <div className="flex items-center gap-2">
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: dotColor,
            flexShrink: 0,
          }}
        />
        <h3
          className="text-base font-semibold uppercase tracking-wide flex-1"
          style={{ color: 'var(--sf-t1)', margin: 0 }}
        >
          {block.headline}
        </h3>
        <span
          className="text-xs"
          style={{ color: 'var(--sf-t4)', flexShrink: 0, fontFamily: 'ui-monospace, monospace' }}
        >
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* Summary short + impact (always visible) */}
      <div className="mt-1.5 flex items-start gap-3">
        <p className="text-sm leading-relaxed flex-1" style={{ color: 'var(--sf-t2)', margin: 0 }}>
          {block.summaryShort}
        </p>
        {block.impactoTotal !== null && block.impactoTotal > 0 && (
          <span
            className="text-sm font-bold whitespace-nowrap"
            style={{
              color: borderColor,
              fontFamily: "'DM Mono', monospace",
              flexShrink: 0,
            }}
          >
            {fmtMoney(block.impactoTotal)} <span className="text-[10px] font-normal" style={{ color: 'var(--sf-t4)' }}>{block.impactoLabel}</span>
          </span>
        )}
      </div>

      {/* Expanded content */}
      {expanded && (
        <>
          {/* Sections */}
          {block.sections.length > 0 && (
            <div className="mt-4 pt-3" style={{ borderTop: '1px solid var(--sf-border)' }}>
              {block.sections.map((section, idx) => {
                const isAction = section.type === 'action'
                return (
                  <div key={idx} className={idx > 0 ? 'mt-4' : ''}>
                    <p
                      className="text-xs font-semibold uppercase tracking-wide"
                      style={{ color: 'var(--sf-t3)', margin: '0 0 6px' }}
                    >
                      {section.label}
                    </p>
                    <ul className="space-y-1.5" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {section.items.map((item, i) => (
                        <li
                          key={i}
                          className="text-sm leading-relaxed flex gap-2"
                          style={{ color: 'var(--sf-t2)', paddingLeft: 4 }}
                        >
                          <span
                            style={{
                              color: isAction ? 'var(--sf-green)' : 'var(--sf-t4)',
                              flexShrink: 0,
                              fontWeight: isAction ? 600 : 400,
                              minWidth: 12,
                            }}
                          >
                            {isAction ? '→' : '·'}
                          </span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )
              })}
            </div>
          )}

          {/* Footer: links + profundizar */}
          {(block.links.length > 0 || true) && (
            <div
              className="mt-4 pt-3 flex flex-wrap items-center gap-x-4 gap-y-2"
              style={{ borderTop: '1px solid var(--sf-border)' }}
            >
              {block.links.map((link, i) => (
                <button
                  key={i}
                  onClick={e => handleLinkClick(e, link)}
                  className="text-sm font-medium cursor-pointer hover:underline"
                  style={{
                    color: 'var(--sf-green)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                  }}
                >
                  {link.label}
                </button>
              ))}
              <button
                onClick={handleProfundizar}
                className="ml-auto px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                style={{
                  border: '1px solid var(--sf-green-border)',
                  background: 'var(--sf-green-bg)',
                  color: 'var(--sf-green)',
                }}
              >
                ✦ Profundizar
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
