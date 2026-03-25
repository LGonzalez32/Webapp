import { useState, useMemo, useEffect } from 'react'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { useNavigate, useLocation } from 'react-router-dom'
import { cn } from '../lib/utils'
import type { VendorAnalysis } from '../types'
import VendedorPanel from '../components/vendedor/VendedorPanel'
import { ChevronDown, ChevronRight, Search } from 'lucide-react'

// ── Constants ─────────────────────────────────────────────────────────────────

const RIESGO_ORDER: Record<string, number> = { critico: 0, riesgo: 1, ok: 2, superando: 3 }

const RIESGO_CONFIG = {
  critico:   { label: 'CRÍTICO', badgeBg: '#FF4D4D15', badgeColor: '#FF4D4D', dot: '#FF4D4D' },
  riesgo:    { label: 'RIESGO',  badgeBg: '#FFB80015', badgeColor: '#FFB800', dot: '#FFB800' },
  ok:        { label: 'OK',      badgeBg: '#00D68F15', badgeColor: '#00D68F', dot: '#00D68F' },
  superando: { label: '↑ META',  badgeBg: '#60A5FA15', badgeColor: '#60A5FA', dot: '#60A5FA' },
}

// Sort vendedores: by riesgo first, then by biggest gap within same state
const sortVendedores = (arr: VendorAnalysis[]) =>
  [...arr].sort((a, b) => {
    const diff = (RIESGO_ORDER[a.riesgo] ?? 99) - (RIESGO_ORDER[b.riesgo] ?? 99)
    if (diff !== 0) return diff
    const gapA = (a.promedio_3m ?? 0) - a.ventas_periodo
    const gapB = (b.promedio_3m ?? 0) - b.ventas_periodo
    return gapB - gapA
  })

// ── Component ─────────────────────────────────────────────────────────────────

export default function VendedoresPage() {
  useAnalysis()
  const {
    vendorAnalysis, insights, dataAvailability, isProcessed,
    sales, selectedPeriod, clientesDormidos, configuracion,
    supervisorAnalysis,
  } = useAppStore()
  const navigate = useNavigate()
  const { search: locationSearch } = useLocation()

  const [selected, setSelected]         = useState<VendorAnalysis | null>(null)
  const [search, setSearch]             = useState('')
  const [filterCanal, setFilterCanal]   = useState('all')
  const [metrica, setMetrica]           = useState<'unidades' | 'dolares'>('unidades')
  const [expandedSups, setExpandedSups] = useState<Set<string>>(new Set())
  const [sortCol, setSortCol]           = useState<string>('impacto')
  const [sortDir, setSortDir]           = useState<'desc' | 'asc'>('desc')

  // CAMBIO 6 — initialize filterEstado from URL ?filter= param
  const [filterEstado, setFilterEstado] = useState(() => {
    const param = new URLSearchParams(locationSearch).get('filter')
    return param ?? 'all'
  })

  // Expand all supervisor zones on first data load
  useEffect(() => {
    if (supervisorAnalysis.length > 0) {
      setExpandedSups(new Set(supervisorAnalysis.map(s => s.supervisor)))
    }
  }, [supervisorAnalysis])

  const canales = useMemo(
    () => [...new Set(sales.map(s => s.canal).filter((c): c is string => !!c))].sort(),
    [sales],
  )

  // Header counts (from full unfiltered list)
  const counts = useMemo(() => ({
    critico:   vendorAnalysis.filter(v => v.riesgo === 'critico').length,
    riesgo:    vendorAnalysis.filter(v => v.riesgo === 'riesgo').length,
    ok:        vendorAnalysis.filter(v => v.riesgo === 'ok').length,
    superando: vendorAnalysis.filter(v => v.riesgo === 'superando').length,
  }), [vendorAnalysis])

  // Filter only — sort applied separately in `sorted`
  const filtered = useMemo(() => {
    let data = [...vendorAnalysis]
    if (search) {
      const q = search.toLowerCase()
      data = data.filter(v => v.vendedor.toLowerCase().includes(q))
    }
    if (filterEstado !== 'all') {
      data = data.filter(v => v.riesgo === filterEstado)
    }
    if (filterCanal !== 'all') {
      const byCanal = new Set(sales.filter(s => s.canal === filterCanal).map(s => s.vendedor))
      data = data.filter(v => byCanal.has(v.vendedor))
    }
    return data
  }, [vendorAnalysis, sales, search, filterEstado, filterCanal])

  // Team total for PESO % denominator (always unfiltered)
  const teamTotal = useMemo(() => {
    const usaDolares = metrica === 'dolares' && dataAvailability.has_venta_neta
    return vendorAnalysis.reduce((sum, v) =>
      sum + (usaDolares ? (v.ytd_actual_neto ?? 0) : (v.ytd_actual ?? 0)), 0)
  }, [vendorAnalysis, metrica, dataAvailability.has_venta_neta])

  // Filtered totals for the totals row
  const filteredTotals = useMemo(() => {
    const usaDolares = metrica === 'dolares' && dataAvailability.has_venta_neta
    const total2026 = filtered.reduce((sum, v) =>
      sum + (usaDolares ? (v.ytd_actual_neto ?? 0) : (v.ytd_actual ?? 0)), 0)
    const total2025 = filtered.reduce((sum, v) =>
      sum + (usaDolares ? (v.ytd_anterior_neto ?? 0) : (v.ytd_anterior ?? 0)), 0)
    const varAbs = total2026 - total2025
    const varPct = total2025 > 0 ? ((total2026 - total2025) / total2025) * 100 : null
    return { total2026, total2025, varAbs, varPct }
  }, [filtered, metrica, dataAvailability.has_venta_neta])

  // Sorted list — applies after filtering
  const sorted = useMemo(() => {
    const arr = [...filtered]
    arr.sort((a, b) => {
      let valA: number | string = 0
      let valB: number | string = 0
      switch (sortCol) {
        case 'vendedor':
          valA = a.vendedor; valB = b.vendedor; break
        case 'peso':
          valA = teamTotal > 0 ? (a.ytd_actual ?? 0) / teamTotal : 0
          valB = teamTotal > 0 ? (b.ytd_actual ?? 0) / teamTotal : 0
          break
        case 'ytd':
          valA = metrica === 'dolares' ? (a.ytd_actual_neto ?? 0) : (a.ytd_actual ?? 0)
          valB = metrica === 'dolares' ? (b.ytd_actual_neto ?? 0) : (b.ytd_actual ?? 0)
          break
        case 'ytd_ant':
          valA = metrica === 'dolares' ? (a.ytd_anterior_neto ?? 0) : (a.ytd_anterior ?? 0)
          valB = metrica === 'dolares' ? (b.ytd_anterior_neto ?? 0) : (b.ytd_anterior ?? 0)
          break
        case 'var':
          valA = (a.ytd_actual ?? 0) - (a.ytd_anterior ?? 0)
          valB = (b.ytd_actual ?? 0) - (b.ytd_anterior ?? 0)
          break
        case 'var_pct':
          valA = a.variacion_ytd_pct ?? 0; valB = b.variacion_ytd_pct ?? 0; break
        case 'meta':
          valA = a.cumplimiento_pct ?? 0; valB = b.cumplimiento_pct ?? 0; break
        case 'alertas':
          valA = insights.filter(i => i.vendedor === a.vendedor).length
          valB = insights.filter(i => i.vendedor === b.vendedor).length
          break
        case 'estado':
          valA = RIESGO_ORDER[a.riesgo] ?? 2; valB = RIESGO_ORDER[b.riesgo] ?? 2; break
        case 'impacto':
        default: {
          const diff = (RIESGO_ORDER[a.riesgo] ?? 99) - (RIESGO_ORDER[b.riesgo] ?? 99)
          if (diff !== 0) return diff
          return ((b.promedio_3m ?? 0) - b.ventas_periodo) -
                 ((a.promedio_3m ?? 0) - a.ventas_periodo)
        }
      }
      if (typeof valA === 'string') {
        return sortDir === 'asc'
          ? valA.localeCompare(valB as string)
          : (valB as string).localeCompare(valA)
      }
      return sortDir === 'asc'
        ? (valA as number) - (valB as number)
        : (valB as number) - (valA as number)
    })
    return arr
  }, [filtered, sortCol, sortDir, metrica, insights, teamTotal])

  // Supervisor groups
  const hasSuper = dataAvailability.has_supervisor && supervisorAnalysis.length > 0

  const supGroups = useMemo(() => {
    if (!hasSuper) return null
    const filteredNames = new Set(sorted.map(v => v.vendedor))
    return supervisorAnalysis
      .map(sup => ({
        ...sup,
        rows: sup.vendedores
          .map(name => sorted.find(v => v.vendedor === name))
          .filter((v): v is VendorAnalysis => !!v && filteredNames.has(v.vendedor)),
      }))
      .filter(g => g.rows.length > 0)
  }, [supervisorAnalysis, sorted, hasSuper])

  // ── Redirect cuando no hay datos ──────────────────────────────────────────
  useEffect(() => {
    if (sales.length === 0) navigate('/')
  }, [sales.length]) // eslint-disable-line

  // ── Early returns ──────────────────────────────────────────────────────────
  if (sales.length === 0) return null
  if (!isProcessed) return (
    <div className="flex items-center justify-center h-64 text-zinc-500">Calculando...</div>
  )

  // ── Helpers ────────────────────────────────────────────────────────────────
  const toggleSup = (sup: string) =>
    setExpandedSups(prev => {
      const next = new Set(prev)
      if (next.has(sup)) next.delete(sup); else next.add(sup)
      return next
    })

  const toggleFilterEstado = (estado: string) =>
    setFilterEstado(prev => prev === estado ? 'all' : estado)

  const fmtMoney = (val: number): string => {
    const m = configuracion.moneda
    if (val >= 1_000_000) return `${m}${(val / 1_000_000).toFixed(1)}M`
    if (val >= 1_000)     return `${m}${(val / 1_000).toFixed(1)}K`
    return `${m}${Math.round(val)}`
  }

  const fmtNum = (n: number | undefined | null) => {
    if (n == null || n === 0) return '—'
    return metrica === 'dolares' ? fmtMoney(n) : Math.round(n).toLocaleString()
  }

  const fmtPct = (pct: number | null | undefined) => {
    if (pct == null) return '—'
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`
  }

  // ── Grid template — single source of truth for column widths ─────────────
  const colYtd = metrica === 'dolares' ? '120px' : '90px'
  const colVar = metrica === 'dolares' ? '100px' : '80px'
  const gridCols = [
    'minmax(160px, 1fr)', // VENDEDOR
    colYtd,               // YTD ACT.
    colYtd,               // YTD ANT.
    colVar,               // VAR
    '100px',              // VAR %
    '70px',               // PESO %
    ...(dataAvailability.has_metas ? ['70px'] : []), // META %
    '80px',               // ALERTAS
    '100px',              // ESTADO
    '32px',               // →
  ].join(' ')

  const colCls = 'text-[11px] font-medium uppercase tracking-[0.06em]'

  const handleSort = (col: string) => {
    if (sortCol === col) {
      setSortDir(d => d === 'desc' ? 'asc' : 'desc')
    } else {
      setSortCol(col)
      setSortDir('desc')
    }
  }

  const SortIndicator = ({ col }: { col: string }) => {
    const isActive = sortCol === col
    return (
      <span style={{
        marginLeft: 3,
        fontSize: 10,
        color: isActive ? 'var(--sf-green)' : 'var(--sf-t5)',
        opacity: isActive ? 1 : 0.6,
        lineHeight: 1,
      }}>
        {isActive ? (sortDir === 'desc' ? '↓' : '↑') : (col === 'vendedor' ? '↑↓' : '↕')}
      </span>
    )
  }

  const hdrBtn = (col: string, label: string | number, justify: 'start' | 'end' | 'center' = 'end') => {
    const isActive = sortCol === col
    return (
      <button
        onClick={() => handleSort(col)}
        className={cn(colCls, `flex items-center justify-${justify}`)}
        style={{
          color: isActive ? 'var(--sf-t1)' : 'var(--sf-t5)',
          cursor: 'pointer',
          userSelect: 'none',
          background: 'none',
          border: 'none',
          padding: 0,
          transition: 'color 150ms',
          width: '100%',
        }}
        onMouseEnter={e => { if (!isActive) e.currentTarget.style.color = 'var(--sf-t1)' }}
        onMouseLeave={e => { if (!isActive) e.currentTarget.style.color = 'var(--sf-t5)' }}
      >
        {label}
        <SortIndicator col={col} />
      </button>
    )
  }

  const TableHeader = () => (
    <div
      className="border-b border-t border-[var(--sf-border)] sticky top-0 z-10"
      style={{
        display: 'grid',
        gridTemplateColumns: gridCols,
        background: 'var(--sf-inset)',
        paddingTop: 10,
        paddingBottom: 10,
      }}
    >
      <div style={{ paddingLeft: 16 }}>
        {hdrBtn('vendedor', 'Vendedor', 'start')}
      </div>
      <div>{hdrBtn('ytd', selectedPeriod?.year ?? new Date().getFullYear())}</div>
      <div>{hdrBtn('ytd_ant', (selectedPeriod?.year ?? new Date().getFullYear()) - 1)}</div>
      <div>{hdrBtn('var', 'Var')}</div>
      <div>{hdrBtn('var_pct', 'Var %')}</div>
      <div>{hdrBtn('peso', 'Peso %')}</div>
      {dataAvailability.has_metas && (
        <div>{hdrBtn('meta', 'Meta %')}</div>
      )}
      <div style={{ borderLeft: '1px solid var(--sf-border)', paddingLeft: '16px' }}>
        {hdrBtn('alertas', 'Alertas', 'center')}
      </div>
      <div>{hdrBtn('estado', 'Estado', 'center')}</div>
      <div />
    </div>
  )

  // ── Row renderer ──────────────────────────────────────────────────────────
  const renderRow = (v: VendorAnalysis, indent = false, index = 0) => {
    const rc          = RIESGO_CONFIG[v.riesgo]
    const vis         = insights.filter(i => i.vendedor === v.vendedor)
    const hasMeta     = dataAvailability.has_metas && v.cumplimiento_pct !== undefined
    const usaDolares  = metrica === 'dolares' && dataAvailability.has_venta_neta
    const unitsActual   = v.ytd_actual ?? 0
    const unitsAnterior = v.ytd_anterior ?? 0
    // En dólares: usar ytd_*_neto del motor (suma directa de venta_neta); null si no hay datos
    const ytdActual   = usaDolares
      ? (v.ytd_actual_neto != null ? v.ytd_actual_neto : (unitsActual > 0 ? null : 0))
      : unitsActual
    const ytdAnterior = usaDolares
      ? (v.ytd_anterior_neto != null ? v.ytd_anterior_neto : (unitsAnterior > 0 ? null : 0))
      : unitsAnterior
    const varAbs      = (ytdActual && ytdAnterior) ? ytdActual - ytdAnterior : null
    const varPct      = v.variacion_ytd_pct
    const delay       = Math.min(index * 70, 600)

    const pesoVal = teamTotal > 0 && (ytdActual ?? 0) > 0
      ? ((ytdActual as number) / teamTotal) * 100
      : 0
    const pesoClr = pesoVal > 10 ? 'var(--sf-t1)' : pesoVal > 5 ? 'var(--sf-t3)' : 'var(--sf-t5)'

    const metaPct = hasMeta ? v.cumplimiento_pct! : null
    const metaClr = metaPct == null ? 'var(--sf-t5)'
      : metaPct < 70   ? 'var(--sf-red)'
      : metaPct < 90   ? 'var(--sf-amber)'
      : metaPct >= 100 ? 'var(--sf-green)'
      : 'var(--sf-t1)'

    const mono = { fontFamily: "'DM Mono', monospace" } as const

    return (
      <div
        key={v.vendedor}
        onClick={() => setSelected(v)}
        className={cn(
          'group cursor-pointer transition-colors duration-150',
          'border-b border-[var(--sf-border)]/10 hover:!bg-[var(--sf-inset)]',
          index % 2 === 1 ? 'bg-[var(--sf-page)]' : 'bg-transparent',
        )}
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          height: 48,
          animation: 'rowFadeIn 300ms ease both',
          animationDelay: `${delay}ms`,
        }}
      >
        {/* VENDEDOR — dot + name */}
        <div
          className="flex items-center overflow-hidden"
          style={{ paddingLeft: indent ? 40 : 16, paddingRight: 8, gap: 8 }}
        >
          <span
            className="rounded-full flex-shrink-0"
            style={{ width: 8, height: 8, background: rc.dot }}
          />
          <span
            className="truncate"
            style={{ fontSize: 13, fontWeight: 500, color: 'var(--sf-t1)' }}
          >
            {v.vendedor}
          </span>
        </div>

        {/* YTD ACT. */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: 'var(--sf-t1)' }}>
          {fmtNum(ytdActual)}
        </div>

        {/* YTD ANT. */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: 'var(--sf-t5)' }}>
          {fmtNum(ytdAnterior)}
        </div>

        {/* VAR abs */}
        <div
          className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: varAbs == null ? 'var(--sf-t5)' : varAbs >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}
        >
          {varAbs == null ? '—' : `${varAbs >= 0 ? '+' : ''}${metrica === 'dolares' ? fmtMoney(Math.abs(varAbs)) : Math.round(Math.abs(varAbs)).toLocaleString()}`}
        </div>

        {/* VAR % */}
        <div
          className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, fontWeight: 600, color: varPct == null ? 'var(--sf-t5)' : varPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}
        >
          {fmtPct(varPct)}
        </div>

        {/* PESO % */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 12, color: pesoClr }}>
          {pesoVal > 0 ? `${pesoVal.toFixed(1)}%` : '—'}
        </div>

        {/* META % (conditional — must match grid column) */}
        {dataAvailability.has_metas && (
          <div className="flex items-center justify-end tabular-nums"
            style={{ ...mono, fontSize: 12, color: metaClr }}>
            {metaPct != null ? `${Math.round(metaPct)}%` : '—'}
          </div>
        )}

        {/* ALERTAS */}
        <div className="flex items-center justify-center" style={{ borderLeft: '1px solid var(--sf-border)', paddingLeft: '16px' }}>
          {vis.length > 0 ? (
            <span
              className="flex items-center justify-center tabular-nums"
              style={{
                width: 20, height: 20, borderRadius: '50%',
                background: '#FF4D4D20', color: 'var(--sf-red)',
                fontSize: 11, fontWeight: 600,
              }}
            >
              {vis.length}
            </span>
          ) : (
            <span style={{ color: 'var(--sf-t5)', fontSize: 14 }}>—</span>
          )}
        </div>

        {/* ESTADO */}
        <div className="flex items-center justify-center">
          <span style={{
            background: rc.badgeBg, color: rc.badgeColor,
            padding: '3px 8px', borderRadius: 4,
            fontSize: 11, fontWeight: 500,
          }}>
            {rc.label}
          </span>
        </div>

        {/* → */}
        <div className="flex items-center justify-end" style={{ paddingRight: 12 }}>
          <ChevronRight className="w-4 h-4 transition-all duration-150 text-[var(--sf-t5)] group-hover:text-[var(--sf-green)] group-hover:translate-x-0.5" />
        </div>
      </div>
    )
  }

  // ── Totals row ────────────────────────────────────────────────────────────
  const TotalsRow = () => {
    const { total2026, total2025, varAbs, varPct } = filteredTotals
    const mono = { fontFamily: "'DM Mono', monospace" } as const
    return (
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: gridCols,
          background: 'var(--sf-inset)',
          borderBottom: '2px solid var(--sf-border)',
          borderTop: '1px solid var(--sf-border)',
          height: 44,
          fontWeight: 600,
        }}
      >
        {/* VENDEDOR label */}
        <div className="flex items-center" style={{ paddingLeft: 16, gap: 8 }}>
          <span style={{ fontSize: 11, letterSpacing: '0.06em', color: 'var(--sf-t5)', fontWeight: 600 }}>
            EQUIPO TOTAL
          </span>
        </div>

        {/* YTD ACT total */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: 'var(--sf-t1)' }}>
          {fmtNum(total2026)}
        </div>

        {/* YTD ANT total */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: 'var(--sf-t5)' }}>
          {fmtNum(total2025)}
        </div>

        {/* VAR abs */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, color: varAbs >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
          {`${varAbs >= 0 ? '+' : ''}${metrica === 'dolares' ? fmtMoney(Math.abs(varAbs)) : Math.round(Math.abs(varAbs)).toLocaleString()}`}
        </div>

        {/* VAR % */}
        <div className="flex items-center justify-end tabular-nums"
          style={{ ...mono, fontSize: 13, fontWeight: 600, color: varPct == null ? 'var(--sf-t5)' : varPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
          {fmtPct(varPct)}
        </div>

        {/* PESO % — empty in totals row */}
        <div className="flex items-center justify-end"
          style={{ ...mono, fontSize: 12, color: 'var(--sf-t5)' }}>
          —
        </div>

        {/* META % (conditional) */}
        {dataAvailability.has_metas && (
          <div className="flex items-center justify-end"
            style={{ ...mono, fontSize: 12, color: 'var(--sf-t5)' }}>
            —
          </div>
        )}

        {/* ALERTAS */}
        <div className="flex items-center justify-center"
          style={{ borderLeft: '1px solid var(--sf-border)', paddingLeft: '16px', color: 'var(--sf-t5)', fontSize: 14 }}>
          —
        </div>

        {/* ESTADO */}
        <div />

        {/* → */}
        <div />
      </div>
    )
  }

  // ── JSX ───────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-4 pb-20 animate-in fade-in duration-500">
      <style>{`
        @keyframes rowFadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>

      {/* Modal overlay */}
      {selected && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelected(null)} />
          <VendedorPanel
            vendedor={selected}
            insights={insights}
            sales={sales}
            selectedPeriod={selectedPeriod}
            allVendorAnalysis={vendorAnalysis}
            clientesDormidos={clientesDormidos}
            dataAvailability={dataAvailability}
            onClose={() => setSelected(null)}
          />
        </>
      )}

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-[var(--sf-t1)] tracking-tight">Vendedores</h1>

        <div className="flex items-center gap-2 flex-wrap">
          {(
            [
              ['critico',   counts.critico,   'críticos',  '#FF4D4D'],
              ['riesgo',    counts.riesgo,    'riesgo',    '#FFB800'],
              ['ok',        counts.ok,        'ok',        '#00D68F'],
              ['superando', counts.superando, 'superando', '#60A5FA'],
            ] as const
          ).map(([estado, count, label, color]) => {
            if (!count) return null
            const isActive = filterEstado === estado
            return (
              <button
                key={estado}
                onClick={() => toggleFilterEstado(estado)}
                style={{
                  background: isActive ? `${color}25` : `${color}15`,
                  color,
                  border: `1px solid ${isActive ? `${color}50` : `${color}30`}`,
                  padding: '6px 14px',
                  borderRadius: 20,
                  fontSize: 12,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                }}
              >
                <span style={{ fontWeight: 600 }}>{count}</span>
                <span style={{ fontWeight: 400 }}>{label}</span>
              </button>
            )
          })}
        </div>
      </div>

      {/* ── Filtros ───────────────────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {/* search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 pointer-events-none" style={{ color: 'var(--sf-t5)' }} />
          <input
            type="text"
            placeholder="Buscar vendedor..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="focus:outline-none"
            style={{
              background: 'var(--sf-inset)',
              border: '1px solid var(--sf-border)',
              borderRadius: 8,
              color: 'var(--sf-t1)',
              fontSize: 13,
              height: 36,
              paddingLeft: 32,
              paddingRight: 12,
              width: 180,
              transition: 'border-color 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D68F40')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--sf-border)')}
          />
        </div>

        {/* estado select — synced with pills */}
        <select
          value={filterEstado}
          onChange={e => setFilterEstado(e.target.value)}
          className="focus:outline-none cursor-pointer"
          style={{
            background: 'var(--sf-inset)',
            border: '1px solid var(--sf-border)',
            borderRadius: 8,
            color: 'var(--sf-t1)',
            fontSize: 13,
            height: 36,
            paddingLeft: 12,
            paddingRight: 28,
            transition: 'border-color 150ms ease',
          }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D68F40')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--sf-border)')}
        >
          <option value="all">Estado: todos</option>
          <option value="critico">Crítico</option>
          <option value="riesgo">En riesgo</option>
          <option value="ok">OK</option>
          <option value="superando">Superando</option>
        </select>

        {/* canal select */}
        {dataAvailability.has_canal && canales.length > 0 && (
          <select
            value={filterCanal}
            onChange={e => setFilterCanal(e.target.value)}
            className="focus:outline-none cursor-pointer"
            style={{
              background: 'var(--sf-inset)',
              border: '1px solid var(--sf-border)',
              borderRadius: 8,
              color: 'var(--sf-t1)',
              fontSize: 13,
              height: 36,
              paddingLeft: 12,
              paddingRight: 28,
              transition: 'border-color 150ms ease',
            }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = '#00D68F40')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--sf-border)')}
          >
            <option value="all">Canal: todos</option>
            {canales.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}

        {/* metric toggle */}
        {dataAvailability.has_venta_neta && (
          <div
            className="flex items-center overflow-hidden ml-auto"
            style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8 }}
          >
            <button
              onClick={() => setMetrica('unidades')}
              className="cursor-pointer transition-colors"
              style={{
                padding: '0 14px',
                height: 36,
                fontSize: 12,
                fontWeight: 600,
                background: metrica === 'unidades' ? '#00D68F' : 'transparent',
                color: metrica === 'unidades' ? 'var(--sf-page)' : 'var(--sf-t5)',
              }}
            >Unidades</button>
            <button
              onClick={() => setMetrica('dolares')}
              className="cursor-pointer transition-colors"
              style={{
                padding: '0 14px',
                height: 36,
                fontSize: 12,
                fontWeight: 600,
                background: metrica === 'dolares' ? '#00D68F' : 'transparent',
                color: metrica === 'dolares' ? 'var(--sf-page)' : 'var(--sf-t5)',
              }}
            >Dólares</button>
          </div>
        )}
      </div>

      {/* ── Lista ─────────────────────────────────────────────────────────────── */}
      <div
        className="overflow-hidden overflow-x-auto"
        style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 16 }}
      >
        {hasSuper && supGroups ? (
          /* Hierarchical: supervisor → vendedores */
          <div>
            <TableHeader />
            <TotalsRow />
            {supGroups.map(group => {
              const isOpen      = expandedSups.has(group.supervisor)
              const critCount   = group.rows.filter(v => v.riesgo === 'critico').length
              const riesgoCount = group.rows.filter(v => v.riesgo === 'riesgo').length

              return (
                <div key={group.supervisor} style={{ borderBottom: '1px solid var(--sf-border)' }}>
                  {/* Supervisor header row */}
                  <button
                    onClick={() => toggleSup(group.supervisor)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 cursor-pointer text-left transition-colors hover:bg-[var(--sf-inset)]"
                  >
                    {isOpen
                      ? <ChevronDown  className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--sf-t5)' }} />
                      : <ChevronRight className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--sf-t5)' }} />
                    }
                    <span className="text-sm flex-1 truncate" style={{ fontWeight: 600, color: 'var(--sf-t1)' }}>
                      {group.supervisor}
                    </span>
                    <div className="flex items-center gap-3 text-xs flex-shrink-0">
                      {critCount > 0 && (
                        <span className="flex items-center gap-1" style={{ color: 'var(--sf-red)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FF4D4D' }} />
                          {critCount} crítico{critCount > 1 ? 's' : ''}
                        </span>
                      )}
                      {riesgoCount > 0 && (
                        <span className="flex items-center gap-1" style={{ color: 'var(--sf-amber)' }}>
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#FFB800' }} />
                          {riesgoCount} riesgo
                        </span>
                      )}
                      {group.cumplimiento_pct !== null && (
                        <span style={{
                          fontWeight: 600,
                          color: group.cumplimiento_pct >= 100 ? 'var(--sf-green)'
                            : group.cumplimiento_pct >= 85  ? 'var(--sf-amber)'
                            : 'var(--sf-red)',
                        }}>
                          meta {Math.round(group.cumplimiento_pct)}%
                        </span>
                      )}
                    </div>
                  </button>

                  {/* Vendedor rows */}
                  {isOpen && (
                    <div style={{ background: 'var(--sf-overlay-subtle)', borderTop: '1px solid var(--sf-border-subtle)' }}>
                      {group.rows.map((v, i) => renderRow(v, true, i))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          /* Flat list */
          <div>
            <TableHeader />
            <TotalsRow />
            {sorted.map((v, i) => renderRow(v, false, i))}
            {sorted.length === 0 && (
              <p style={{ fontSize: 14, color: 'var(--sf-t5)', textAlign: 'center', marginTop: 60, marginBottom: 60 }}>
                No hay vendedores que coincidan con el filtro
              </p>
            )}
          </div>
        )}

        {filtered.length > 0 && filtered.length < vendorAnalysis.length && (
          <p
            className="text-center py-2"
            style={{ fontSize: 12, color: 'var(--sf-t5)', borderTop: '1px solid var(--sf-border)' }}
          >
            Mostrando {filtered.length} de {vendorAnalysis.length} vendedores
          </p>
        )}
      </div>
    </div>
  )
}
