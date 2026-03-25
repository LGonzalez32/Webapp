import React, { useState, useMemo, useCallback, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import type { ClasificacionInventario, CategoriaInventario } from '../types'
import { ChevronDown, ChevronUp, Upload } from 'lucide-react'
import { callAI } from '../lib/chatService'

// ─── Orden y configuración de clasificaciones ────────────────────────────────

const ORDER: ClasificacionInventario[] = [
  'riesgo_quiebre',
  'baja_cobertura',
  'normal',
  'lento_movimiento',
  'sin_movimiento',
]

const CLASI_CONFIG: Record<
  ClasificacionInventario,
  { label: string; color: string; defaultOpen: boolean }
> = {
  riesgo_quiebre:   { label: 'Riesgo de quiebre',  color: '#E24B4A', defaultOpen: true  },
  baja_cobertura:   { label: 'Baja cobertura',      color: '#EF9F27', defaultOpen: true  },
  normal:           { label: 'Normal',              color: '#1D9E75', defaultOpen: false },
  lento_movimiento: { label: 'Lento movimiento',    color: '#4a5568', defaultOpen: false },
  sin_movimiento:   { label: 'Sin movimiento',      color: '#2d3748', defaultOpen: false },
}

// ─── Sección colapsable por categoría ────────────────────────────────────────

interface CategorySectionProps {
  clasificacion: ClasificacionInventario
  items: CategoriaInventario[]
  totalUnits: number
  hasCategoria: boolean
  // IA analysis props (only used for riesgo_quiebre + baja_cobertura)
  analysisMap?: Record<string, { loading: boolean; text: string | null }>
  expandedProducto?: string | null
  onAnalyze?: (item: CategoriaInventario) => void
  onToggleExpand?: (key: string) => void
  onProfundizar?: (item: CategoriaInventario, analysisText: string) => void
}

const CategorySection: FC<CategorySectionProps> = ({ clasificacion, items, totalUnits, hasCategoria, analysisMap, expandedProducto, onAnalyze, onToggleExpand, onProfundizar }) => {
  const cfg = CLASI_CONFIG[clasificacion]
  const [expanded, setExpanded] = useState(cfg.defaultOpen)

  if (items.length === 0) return null

  const showIA = (clasificacion === 'riesgo_quiebre' || clasificacion === 'baja_cobertura') && !!onAnalyze

  const sorted = [...items].sort((a, b) => a.dias_inventario - b.dias_inventario)
  const sectionUnits = items.reduce((s, i) => s + i.unidades_actuales, 0)
  const pct = totalUnits > 0 ? (sectionUnits / totalUnits) * 100 : 0

  const sectionColor =
    clasificacion === 'riesgo_quiebre' ? '#E24B4A' :
    clasificacion === 'baja_cobertura' ? '#EF9F27' :
    clasificacion === 'normal'         ? '#1D9E75' :
    'var(--sf-t5)'

  const thBase: React.CSSProperties = {
    padding: '8px 12px',
    fontSize: '10px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: 0.35,
    fontWeight: 400,
    borderBottom: '1px solid var(--sf-border)',
  }

  return (
    <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', marginBottom: '10px', overflow: 'hidden' }}>
      <button
        onClick={() => setExpanded(!expanded)}
        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', background: 'none', border: 'none', cursor: 'pointer' }}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'none')}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: sectionColor, flexShrink: 0 }} />
          <span style={{ fontSize: '11px', fontWeight: 500, letterSpacing: '0.06em', textTransform: 'uppercase', color: sectionColor, flexShrink: 0 }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: '12px', opacity: 0.4 }}>
            {items.length} producto{items.length !== 1 ? 's' : ''} · {sectionUnits.toLocaleString()} uds · {pct.toFixed(1)}%
          </span>
        </div>
        {expanded
          ? <ChevronUp style={{ width: '14px', height: '14px', opacity: 0.4, flexShrink: 0 }} />
          : <ChevronDown style={{ width: '14px', height: '14px', opacity: 0.4, flexShrink: 0 }} />
        }
      </button>

      {expanded && (
        <div style={{ overflowX: 'auto', borderTop: '1px solid var(--sf-border)' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...thBase, borderLeft: '2px solid #1D9E75' }}>Producto</th>
                {hasCategoria && <th style={thBase}>Categoría</th>}
                <th style={{ ...thBase, textAlign: 'right' }}>Uds. actuales</th>
                <th style={{ ...thBase, textAlign: 'right' }}>PM3</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Días inv.</th>
                <th style={{ ...thBase, textAlign: 'center' }}>Estado</th>
                <th style={{ ...thBase, textAlign: 'right' }}>Último mov.</th>
                {showIA && <th style={{ ...thBase, textAlign: 'center' }}>IA</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((item) => {
                const d = item.dias_inventario
                const diasColor = d <= 7 ? '#E24B4A' : d <= 20 ? '#EF9F27' : 'var(--sf-t4)'
                const diasWeight = d <= 20 ? 600 : 400
                const badgeStyle: React.CSSProperties =
                  clasificacion === 'riesgo_quiebre'   ? { background: 'rgba(226,75,74,0.15)',   color: '#E24B4A',               border: '1px solid rgba(226,75,74,0.25)'   } :
                  clasificacion === 'baja_cobertura'   ? { background: 'rgba(239,159,39,0.15)',  color: '#EF9F27',               border: '1px solid rgba(239,159,39,0.25)'  } :
                  clasificacion === 'normal'           ? { background: 'rgba(29,158,117,0.15)',  color: '#1D9E75',               border: '1px solid rgba(29,158,117,0.25)'  } :
                                                         { background: 'var(--sf-inset)', color: 'var(--sf-t5)', border: '1px solid var(--sf-border)'  }
                return (
                  <React.Fragment key={item.producto}>
                  <tr
                    style={{ borderBottom: '1px solid var(--sf-border)' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <td style={{ padding: '8px 12px', fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)' }}>{item.producto}</td>
                    {hasCategoria && <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--sf-t4)' }}>{item.categoria}</td>}
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--sf-t4)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.unidades_actuales.toLocaleString()}</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--sf-t4)', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{item.pm3.toFixed(0)}</td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: diasColor, fontWeight: diasWeight, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      {d >= 9999 ? '∞' : d}
                    </td>
                    <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                      <span style={{ ...badgeStyle, fontSize: '10px', padding: '2px 8px', borderRadius: '3px', fontWeight: 600 }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', fontSize: '12px', color: 'var(--sf-t4)', textAlign: 'right' }}>
                      {item.ultimo_movimiento
                        ? new Date(item.ultimo_movimiento).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
                        : '—'
                      }
                    </td>
                    {showIA && (() => {
                      const key = item.producto
                      const analysis = analysisMap?.[key]
                      return (
                        <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                          {analysis?.loading ? (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '11px', color: 'var(--sf-t4)' }}>
                              <svg className="animate-spin" style={{ width: '12px', height: '12px' }} viewBox="0 0 24 24">
                                <circle style={{ opacity: 0.25 }} cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                                <path style={{ opacity: 0.75 }} fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            </span>
                          ) : (
                            <button
                              onClick={(e) => { e.stopPropagation(); onAnalyze?.(item) }}
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: '4px',
                                padding: '4px 10px', borderRadius: '6px', fontSize: '11px', fontWeight: 600,
                                border: '1px solid rgba(16,185,129,0.2)', background: 'rgba(16,185,129,0.06)',
                                color: '#10b981', cursor: 'pointer', whiteSpace: 'nowrap' as const,
                                transition: 'background 0.15s',
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.12)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.06)')}
                            >
                              ✦ Analizar
                            </button>
                          )}
                        </td>
                      )
                    })()}
                  </tr>
                  {/* IA Analysis expanded panel */}
                  {showIA && expandedProducto === item.producto && analysisMap?.[item.producto]?.text && !analysisMap[item.producto].loading && (
                    <tr>
                      <td
                        colSpan={6 + (hasCategoria ? 1 : 0) + (showIA ? 1 : 0)}
                        style={{ padding: '16px 20px', background: 'var(--sf-inset)', borderBottom: '1px solid var(--sf-border)' }}
                      >
                        <div style={{ fontSize: '13px', lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                          {analysisMap[item.producto].text!.split('\n').filter(Boolean).map((line, i) => (
                            <p key={i} style={{
                              margin: '2px 0',
                              fontWeight: line.startsWith('📊') || line.startsWith('💡') ? 600 : line.startsWith('📦') || line.startsWith('📉') ? 600 : 400,
                              color: line.startsWith('📊') || line.startsWith('💡') ? 'var(--sf-t1)' : line.startsWith('📦') || line.startsWith('📉') ? 'var(--sf-t2)' : 'var(--sf-t3)',
                              marginTop: line.startsWith('📦') || line.startsWith('📉') ? '8px' : '2px',
                              paddingLeft: line.startsWith('-') ? '8px' : 0,
                            }}>
                              {line}
                            </p>
                          ))}
                        </div>
                        <button
                          onClick={() => onProfundizar?.(item, analysisMap[item.producto].text!)}
                          style={{
                            marginTop: '12px', display: 'inline-flex', alignItems: 'center', gap: '6px',
                            padding: '6px 14px', borderRadius: '8px', fontSize: '12px', fontWeight: 600,
                            border: '1px solid var(--sf-green-border)', background: 'var(--sf-green-bg)',
                            color: 'var(--sf-green)', cursor: 'pointer', transition: 'filter 0.15s',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.95)')}
                          onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                        >
                          + Profundizar
                        </button>
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RotacionPage() {
  useAnalysis()
  const navigate = useNavigate()
  const { categoriasInventario, dataAvailability, configuracion } = useAppStore()

  const [expandedProducto, setExpandedProducto] = useState<string | null>(null)
  const [analysisMap, setAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null }>>({})

  const handleAnalyzeProducto = useCallback(async (item: CategoriaInventario) => {
    const key = item.producto
    setExpandedProducto(key)
    setAnalysisMap(prev => ({ ...prev, [key]: { loading: true, text: null } }))

    const clasi = CLASI_CONFIG[item.clasificacion]?.label ?? item.clasificacion
    const userPrompt =
      `Producto: ${item.producto}\n` +
      `Categoría: ${item.categoria}\n` +
      `Unidades actuales: ${item.unidades_actuales.toLocaleString()}\n` +
      `Promedio mensual (PM3): ${item.pm3.toFixed(0)}\n` +
      `Días de inventario: ${item.dias_inventario >= 9999 ? 'Sin movimiento' : item.dias_inventario}\n` +
      `Estado: ${clasi}\n` +
      (item.ultimo_movimiento ? `Último movimiento: ${new Date(item.ultimo_movimiento).toLocaleDateString('es-MX')}` : '')

    const systemPrompt = `Eres un analista de inventario de una distribuidora en El Salvador.
Responde SIEMPRE en este formato exacto, sin introducción ni cierre:

📊 RESUMEN: [Una oración de máximo 15 palabras con el hallazgo principal]

📦 INVENTARIO:
- [Dato sobre stock actual, días de inventario, o tendencia — máximo 2 bullets]

📉 RIESGO:
- [Dato sobre el riesgo específico de este producto — máximo 2 bullets]

💡 HALLAZGO: [Un dato concreto no obvio — con números. NUNCA preguntas ni instrucciones operativas.]

Reglas:
- Máximo 120 palabras en total
- Cada bullet debe tener un número concreto
- Si una sección no aplica, omítela
- NUNCA des instrucciones operativas
- Responde en español`

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 300, temperature: 0.3 },
      )
      setAnalysisMap(prev => ({ ...prev, [key]: { loading: false, text: json.choices?.[0]?.message?.content ?? 'Sin respuesta' } }))
    } catch (err) {
      setAnalysisMap(prev => ({ ...prev, [key]: { loading: false, text: `Error: ${err instanceof Error ? err.message : 'Error al conectar.'}` } }))
    }
  }, [configuracion])

  const handleToggleExpand = useCallback((key: string) => {
    setExpandedProducto(prev => prev === key ? null : key)
  }, [])

  const handleProfundizar = useCallback((item: CategoriaInventario, analysisText: string) => {
    navigate('/chat?q=' + encodeURIComponent(
      `Profundizar sobre producto ${item.producto}: ${item.unidades_actuales} uds actuales, PM3 ${item.pm3.toFixed(0)}, ${item.dias_inventario} días inventario, estado ${CLASI_CONFIG[item.clasificacion]?.label}. ${analysisText}`
    ))
  }, [navigate])

  // Todos los hooks antes del return condicional
  const grouped = useMemo(() => {
    const g: Record<ClasificacionInventario, CategoriaInventario[]> = {
      riesgo_quiebre: [], baja_cobertura: [], normal: [], lento_movimiento: [], sin_movimiento: [],
    }
    categoriasInventario.forEach((item) => g[item.clasificacion].push(item))
    return g
  }, [categoriasInventario])

  const totalUnits = useMemo(
    () => categoriasInventario.reduce((s, i) => s + i.unidades_actuales, 0),
    [categoriasInventario],
  )


  if (!dataAvailability.has_inventario) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 animate-in fade-in duration-500">
        <div className="text-5xl">📦</div>
        <div className="text-center">
          <p className="text-[var(--sf-t1)] font-bold text-lg">Sin datos de inventario</p>
          <p className="text-[var(--sf-t5)] text-sm mt-1">
            Carga un archivo de inventario para ver la rotación de productos
          </p>
        </div>
        <button
          onClick={() => navigate('/cargar')}
          className="flex items-center gap-2 px-4 py-2 bg-[#00B894] text-black font-bold rounded-xl text-sm hover:bg-[#00a884] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Cargar datos
        </button>
      </div>
    )
  }

  const totalProducts = categoriasInventario.length
  const hasCategoria = dataAvailability.has_categoria

  return (
    <div style={{ paddingBottom: '80px' }} className="animate-in fade-in duration-500">

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Rotación de Inventario</h1>
          <p style={{ fontSize: '12px', opacity: 0.4, margin: '3px 0 0' }}>
            {totalProducts} productos · {totalUnits.toLocaleString()} unidades totales
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(226,75,74,0.15)', color: '#E24B4A', border: '1px solid rgba(226,75,74,0.25)' }}>
            {grouped.riesgo_quiebre.length} riesgo quiebre
          </span>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,159,39,0.15)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)' }}>
            {grouped.baja_cobertura.length} baja cobertura
          </span>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'var(--sf-inset)', color: 'var(--sf-t5)', border: '1px solid var(--sf-border)' }}>
            {grouped.sin_movimiento.length} sin movimiento
          </span>
        </div>
      </div>

      {/* Distribution card */}
      <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: '12px', padding: '16px 20px', marginBottom: '16px' }}>
        <p style={{ fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.35, margin: '0 0 12px' }}>
          Distribución del inventario total
        </p>

        <div style={{ display: 'flex', height: '52px', borderRadius: '4px', overflow: 'hidden' }}>
          {ORDER.map((k) => {
            const units = grouped[k].reduce((s, i) => s + i.unidades_actuales, 0)
            const pct = totalUnits > 0 ? (units / totalUnits) * 100 : 0
            if (pct === 0) return null
            return (
              <div
                key={k}
                style={{ flex: units, background: CLASI_CONFIG[k].color, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}
              >
                {pct > 8 && (
                  <span style={{ fontSize: '11px', fontWeight: 500, color: 'rgba(255,255,255,0.9)', whiteSpace: 'nowrap' }}>
                    {pct.toFixed(0)}%
                  </span>
                )}
              </div>
            )
          })}
        </div>

        {/* Legend */}
        <div style={{ borderTop: '1px solid var(--sf-border)', paddingTop: '12px', marginTop: '12px' }}>
          {ORDER.map((k) => {
            const cfg = CLASI_CONFIG[k]
            const units = grouped[k].reduce((s, i) => s + i.unidades_actuales, 0)
            const pct = totalUnits > 0 ? (units / totalUnits) * 100 : 0
            return (
              <div key={k} style={{ display: 'grid', gridTemplateColumns: '12px 1fr auto auto auto', alignItems: 'center', gap: '12px', marginBottom: '6px' }}>
                <span style={{ width: '12px', height: '12px', borderRadius: '2px', background: cfg.color, flexShrink: 0 }} />
                <span style={{ fontSize: '12px', opacity: 0.7 }}>{cfg.label}</span>
                <span style={{ fontSize: '12px', opacity: 0.4, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '60px' }}>{grouped[k].length} prod.</span>
                <span style={{ fontSize: '12px', opacity: 0.4, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '90px' }}>{units.toLocaleString()} uds</span>
                <span style={{ fontSize: '12px', opacity: 0.4, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '45px' }}>{pct.toFixed(1)}%</span>
              </div>
            )
          })}
          <div style={{ borderTop: '1px solid var(--sf-border)', paddingTop: '8px', marginTop: '2px', display: 'grid', gridTemplateColumns: '12px 1fr auto auto auto', alignItems: 'center', gap: '12px' }}>
            <span />
            <span style={{ fontSize: '12px', opacity: 0.7, fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: '12px', opacity: 0.4, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '60px' }}>{totalProducts} prod.</span>
            <span style={{ fontSize: '12px', opacity: 0.7, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '90px', fontWeight: 500 }}>{totalUnits.toLocaleString()} uds</span>
            <span style={{ fontSize: '12px', opacity: 0.4, fontVariantNumeric: 'tabular-nums', textAlign: 'right', width: '45px' }}>100%</span>
          </div>
        </div>
      </div>

      {/* Category sections */}
      <div>
        {ORDER.map((k) => (
          <CategorySection
            key={k}
            clasificacion={k}
            items={grouped[k]}
            totalUnits={totalUnits}
            hasCategoria={hasCategoria}
            analysisMap={analysisMap}
            expandedProducto={expandedProducto}
            onAnalyze={handleAnalyzeProducto}
            onToggleExpand={handleToggleExpand}
            onProfundizar={handleProfundizar}
          />
        ))}
      </div>

    </div>
  )
}
