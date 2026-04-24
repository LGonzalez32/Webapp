/**
 * DiagnosticBlock.tsx — v1.9.1
 * R68: collapsed = arrow · sujeto · delta (absoluto, R75) · chip [ventana · métrica]
 * R69: expanded = QUÉ PASÓ | POR QUÉ IMPORTA | QUÉ HACER (prose, no bullets)
 * R70: QUÉ HACER solo aparece si generarAcciones() devuelve ≥1 acción válida
 * R72+R80: cero lenguaje robótico en el render
 * R77: chip contraído siempre muestra delta (— si incalculable)
 * R79: cards sin QUÉ HACER cierran con sinAccionesLabel
 */
import React, { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../../lib/useDemoPath'
import type { EnrichedDiagnosticBlock } from '../../lib/diagnostic-actions'
import { fmtDeltaDisplay } from '../../lib/diagnostic-actions'
import type { DiagnosticSeverity } from '../../types/diagnostic-types'

const BORDER_COLOR: Record<DiagnosticSeverity, string> = {
  critical: 'var(--sf-red)',
  warning:  'var(--sf-amber)',
  info:     'var(--sf-t3)',
  positive: 'var(--sf-green)',
}

const SECTION_TITLE_STYLE: React.CSSProperties = {
  color: 'var(--sf-t4)',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.1em',
  textTransform: 'uppercase' as const,
  margin: '0 0 6px',
}

export default function DiagnosticBlockView({
  block,
  defaultExpanded = false,
}: {
  block: EnrichedDiagnosticBlock
  defaultExpanded?: boolean
  key?: string | number
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const navigate  = useNavigate()
  const dp        = useDemoPath()

  // Require at least one content section to be expandable
  const hasContent =
    block.quePaso?.length > 0 ||
    block.porQueImporta?.length > 0 ||
    block.acciones?.length > 0 ||
    block.sections.some(s => s.items.length > 0)

  if (!block || !hasContent) return null

  const borderColor = BORDER_COLOR[block.severity]

  // R75: use displayDelta.sign for arrow direction; fall back to deltaSigno for legacy
  const sign = block.displayDelta?.sign ?? block.deltaSigno

  const arrowGlyph = sign === 'positivo' ? '▲' : sign === 'negativo' ? '▼' : '■'

  const arrowColor = sign === 'positivo' ? 'var(--sf-green)'
    : sign === 'negativo' ? '#ef4444'
    : 'var(--sf-t4)'

  // R77: always show a delta string (— when genuinely incalculable)
  const deltaStr = fmtDeltaDisplay(block.displayDelta)

  const handleProfundizar = (e: React.MouseEvent) => {
    e.stopPropagation()
    const bodyParts = [
      block.quePaso,
      block.porQueImporta,
      block.acciones.length > 0
        ? 'Acciones sugeridas:\n' + block.acciones.map((a, i) => `${i + 1}. ${a.texto}`).join('\n')
        : '',
    ].filter(Boolean).join('\n\n')

    navigate(dp('/chat'), {
      state: {
        prefill: `Profundizar sobre: ${block.headline}\n\n${bodyParts}\n\n¿Qué patrón de fondo hay detrás? ¿Qué acciones priorizarías esta semana?`,
        displayPrefill: `Profundizar: ${block.sujeto}`,
        source: 'Diagnóstico',
      },
    })
  }

  return (
    <div
      onClick={() => setExpanded(v => !v)}
      className="rounded-lg px-4 py-3 cursor-pointer transition-colors"
      style={{
        background:  'var(--sf-card)',
        border:      '1px solid var(--sf-border)',
        borderLeft:  `4px solid ${borderColor}`,
      }}
    >
      {/* ── R68: Collapsed row ─────────────────────────────────────────── */}
      <div className="flex items-center gap-2 min-w-0">
        {/* Direction arrow */}
        <span
          aria-hidden="true"
          style={{
            color:      arrowColor,
            fontFamily: 'ui-monospace, monospace',
            fontSize:   11,
            flexShrink: 0,
            lineHeight: 1,
          }}
        >
          {arrowGlyph}
        </span>

        {/* Entity name (sujeto) */}
        <span
          className="text-sm font-semibold flex-1 truncate"
          style={{ color: 'var(--sf-t1)' }}
          title={block.sujeto}
        >
          {block.sujeto}
        </span>

        {/* Signed delta */}
        {deltaStr && (
          <span
            className="text-sm font-bold tabular-nums whitespace-nowrap shrink-0 ml-2"
            style={{
              color:      arrowColor,
              fontFamily: "'DM Mono', ui-monospace, monospace",
            }}
          >
            {deltaStr}
          </span>
        )}

        {/* Chip: [ventana · métrica] */}
        {block.chip && (
          <span
            className="text-[9px] font-medium px-1.5 py-0.5 rounded whitespace-nowrap shrink-0"
            style={{
              background:  'var(--sf-inset)',
              color:       'var(--sf-t4)',
              border:      '1px solid var(--sf-border-subtle)',
              fontFamily:  'ui-monospace, monospace',
              letterSpacing: '0.03em',
            }}
          >
            {block.chip}
          </span>
        )}

        {/* Expand caret */}
        <span
          className="text-xs shrink-0"
          style={{ color: 'var(--sf-t4)', fontFamily: 'ui-monospace, monospace' }}
        >
          {expanded ? '▴' : '▾'}
        </span>
      </div>

      {/* ── R69: Expanded — 3 prose sections ──────────────────────────── */}
      {expanded && (
        <div
          className="mt-3 pt-3 space-y-4"
          style={{ borderTop: '1px solid var(--sf-border)' }}
          onClick={e => e.stopPropagation()}
        >
          {/* QUÉ PASÓ */}
          {block.quePaso && (
            <div>
              <p style={SECTION_TITLE_STYLE}>Qué pasó</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t2)', margin: 0 }}>
                {block.quePaso}
              </p>
            </div>
          )}

          {/* POR QUÉ IMPORTA */}
          {block.porQueImporta && (
            <div>
              <p style={SECTION_TITLE_STYLE}>Por qué importa</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t2)', margin: 0 }}>
                {block.porQueImporta}
              </p>
            </div>
          )}

          {/* QUÉ HACER — R70: solo si hay acciones con fuente válida */}
          {block.acciones.length > 0 && (
            <div>
              <p style={SECTION_TITLE_STYLE}>Qué hacer</p>
              <ol
                className="space-y-1.5 text-sm leading-relaxed"
                style={{ paddingLeft: '1.25rem', margin: 0, color: 'var(--sf-t2)' }}
              >
                {block.acciones.map((a, i) => (
                  <li key={i}>{a.texto}</li>
                ))}
              </ol>
            </div>
          )}

          {/* R79: cierre estático cuando no hay acciones */}
          {block.acciones.length === 0 && block.sinAccionesLabel && (
            <p
              className="text-xs"
              style={{ color: 'var(--sf-t4)', margin: 0, fontStyle: 'italic' }}
            >
              {block.sinAccionesLabel}
            </p>
          )}

          {/* ✦ Profundizar */}
          <div className="flex justify-end pt-1">
            <button
              onClick={handleProfundizar}
              className="px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
              style={{
                border:     '1px solid var(--sf-green-border)',
                background: 'var(--sf-green-bg)',
                color:      'var(--sf-green)',
              }}
            >
              ✦ Profundizar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
