import React, { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useDemoPath } from '../lib/useDemoPath'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { Users, ChevronUp, ChevronDown } from 'lucide-react'
import { toast } from 'sonner'
import type { ClienteDormido } from '../types'
// callAI removed — analysis is now computed locally
import AnalysisDrawer from '../components/ui/AnalysisDrawer'
import ClientePanel from '../components/cliente/ClientePanel'
import { SFSelect } from '../components/ui/SFSelect'
import { SFSearch } from '../components/ui/SFSearch'
import {
  DIAS_DORMIDO_MIN,
  DIAS_DORMIDO_MAX,
  // R103: estas son constantes de configuración UI.
  // Importación directa de insightStandard es conforme a R103.
} from '../lib/insightStandard'
import {
  getParetoClientes,
  getClientesEnRiesgoTemprano,
  getValorEnRiesgoTotal,
  type ParetoClienteEntry,
  type RiesgoTempranoEntry,
} from '../lib/domain-aggregations'


const MESES_CORTOS = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

function formatDays(d: number): string {
  if (d >= 30) return `${Math.floor(d / 30)}m ${d % 30}d`
  return `${d}d`
}

// R102: alias al tipo canónico de domain-aggregations (Z.1.b)
type ParetoCliente = ParetoClienteEntry

type SortKey = 'prioridad' | 'dias_sin_actividad' | 'valor_yoy_usd' | 'transacciones_yoy' | 'vendedor' | 'cliente'
type SortDir = 'asc' | 'desc'

const RECOVERY_CONFIG = {
  alta:        { label: 'Alta',        cls: 'bg-[#00B894]/10 text-[#00B894]' },
  recuperable: { label: 'Recuperable', cls: 'bg-blue-500/10 text-blue-400' },
  dificil:     { label: 'Difícil',     cls: 'bg-yellow-500/10 text-yellow-400' },
  perdido:     { label: 'Perdido',     cls: 'bg-red-500/10 text-red-400' },
}

export default function ClientesPage() {
  useAnalysis()
  const navigate = useNavigate()
  const dp = useDemoPath()
  const location = useLocation()
  const locState = location.state as { highlight?: string; openCliente?: string } | null
  const highlightCliente = locState?.highlight ?? null
  const initialPanelCliente = locState?.openCliente ?? null

  const {
    clientesDormidos,
    sales,
    selectedPeriod,
    dataAvailability,
    configuracion,
    setConfiguracion,
    isProcessed,
    insights,
    categoriasInventario,
    vendorAnalysis,
    categoriaAnalysis,
    clienteSummaries,
  } = useAppStore()

  const [highlightActive, setHighlightActive] = useState<string | null>(highlightCliente)
  const highlightRef = useCallback((node: HTMLTableRowElement | null) => {
    if (node && highlightActive) {
      setTimeout(() => node.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
      setTimeout(() => setHighlightActive(null), 3000)
    }
  }, [highlightActive])

  const PAGE_SIZE = 50
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [sortKey, setSortKey] = useState<SortKey>('prioridad')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [tab, setTab] = useState<'dormidos' | 'pareto' | 'riesgo'>('dormidos')
  const [filterVendedor, setFilterVendedor] = useState<string>('all')
  const [searchCliente, setSearchCliente] = useState('')
  const metrica: 'unidades' | 'dolares' = (configuracion.metricaGlobal ?? 'usd') === 'usd' ? 'dolares' : 'unidades'
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null)
  const [analysisMap, setAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null; content?: React.ReactNode }>>({})

  const [expandedParetoId, setExpandedParetoId] = useState<string | null>(null)
  const [paretoAnalysisMap, setParetoAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null; content?: React.ReactNode }>>({})
  const [panelCliente, setPanelCliente] = useState<string | null>(null)

  // ── Umbral días-dormido: exploración temporal (fix-1.3) ──────────────────────
  // Fuente de verdad global = configuracion.dias_dormido_threshold (store).
  // Este input es exploración local; "Guardar como predeterminado" propaga al store.
  const [diasDormidoInput, setDiasDormidoInput] = useState<number>(
    configuracion.dias_dormido_threshold
  )
  // Sincronizar input cuando Configuración cambia externamente (ej. desde /configuracion)
  useEffect(() => {
    setDiasDormidoInput(configuracion.dias_dormido_threshold)
  }, [configuracion.dias_dormido_threshold])

  // true cuando el valor local difiere del global → muestra botón "Guardar"
  const diasDormidoCustom = diasDormidoInput !== configuracion.dias_dormido_threshold

  const clampDiasDormido = useCallback((valor: number) => {
    return Math.max(DIAS_DORMIDO_MIN, Math.min(DIAS_DORMIDO_MAX, Math.round(valor)))
  }, [])

  const saveAsDefault = useCallback(() => {
    const clamped = clampDiasDormido(diasDormidoInput)
    setConfiguracion({ dias_dormido_threshold: clamped })
    toast.success(`Umbral actualizado a ${clamped} días`)
    setDiasDormidoInput(clamped)
  }, [diasDormidoInput, clampDiasDormido, setConfiguracion])

  // Hash-based scroll/focus: navegación desde cintillo de Estado Comercial.
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (window.location.hash !== '#dias-dormido-input') return
    const id = window.setTimeout(() => {
      const el = document.getElementById('dias-dormido-input') as HTMLInputElement | null
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.focus()
        el.select?.()
      }
    }, 300)
    return () => window.clearTimeout(id)
  }, [])

  const handleAnalyzeTopCliente = useCallback((c: ParetoCliente) => {
    const id = `pareto-${c.nombre}`
    setExpandedParetoId(id)

    // Cross-table local analysis
    const { year, month } = selectedPeriod
    const clienteSales = sales.filter(s => s.cliente === c.nombre)
    const periodSales = clienteSales.filter(s => { const d = new Date(s.fecha); return d.getFullYear() === year && d.getMonth() <= month })

    // Categories breakdown
    const catMap: Record<string, number> = {}
    periodSales.forEach(s => { if (s.categoria) catMap[s.categoria] = (catMap[s.categoria] ?? 0) + s.unidades })
    const totalCli = Object.values(catMap).reduce((a, b) => a + b, 0)
    const cats = Object.entries(catMap).map(([cat, uds]) => {
      const ctx = categoriaAnalysis.find(ca => ca.categoria === cat)
      return { cat, uds, pct: totalCli > 0 ? Math.round((uds / totalCli) * 100) : 0, tendencia: ctx?.tendencia ?? 'desconocida', varPct: ctx ? Math.round(ctx.variacion_pct) : null }
    }).sort((a, b) => b.uds - a.uds)

    // Products at inventory risk
    const prods = [...new Set(periodSales.filter(s => s.producto).map(s => s.producto!))]
    const prodsRiesgo = prods.map(p => categoriasInventario.find(i => i.producto === p)).filter(i => i && (i.clasificacion === 'riesgo_quiebre' || i.clasificacion === 'baja_cobertura'))

    // Vendor info
    const vendInfo = vendorAnalysis.find(v => v.vendedor === c.vendedor)

    // Signals
    const señales: string[] = []
    const catsColapso = cats.filter(ct => ct.tendencia === 'colapso' || ct.tendencia === 'caida')
    if (catsColapso.length > 0) señales.push(`${catsColapso.length} de ${cats.length} categorías que compra están en ${catsColapso[0].tendencia}: ${catsColapso.map(ct => `${ct.cat} (${ct.varPct}%)`).join(', ')}`)
    if (prodsRiesgo.length > 0) señales.push(`${prodsRiesgo.map(p => p!.producto).join(', ')} tiene${prodsRiesgo.length > 1 ? 'n' : ''} inventario bajo — riesgo de desabasto`)
    if (c.peso > 15) señales.push(`Concentración: este cliente representa ${c.peso.toFixed(1)}% del total — alta dependencia`)
    if (vendInfo && (vendInfo.riesgo === 'critico' || vendInfo.riesgo === 'riesgo')) señales.push(`Vendedor ${c.vendedor} está en estado ${vendInfo.riesgo}`)

    const narrativeColor = (c.varPct ?? 0) >= 0 ? 'var(--sf-green)' : 'var(--sf-amber)'
    const content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '12px 14px', borderLeft: `3px solid ${narrativeColor}`, background: 'rgba(29,158,117,0.06)', borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--sf-t2)' }}>
          <strong>{c.nombre}</strong> {c.varPct != null && c.varPct >= 0 ? 'mantiene crecimiento' : 'muestra caída'} ({c.varPct != null ? `${c.varPct >= 0 ? '+' : ''}${c.varPct.toFixed(1)}%` : 'N/A'} YoY) y representa el {c.peso.toFixed(1)}% del volumen.
          {catsColapso.length > 0 ? ` Sin embargo, compra en categorías que están en declive general.` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            { label: 'Uds YTD', value: c.totalUnidades.toLocaleString() },
            { label: 'Var YoY', value: c.varPct != null ? `${c.varPct >= 0 ? '+' : ''}${c.varPct.toFixed(1)}%` : 'N/A' },
            { label: 'Peso', value: `${c.peso.toFixed(1)}%` },
            { label: 'Vendedor', value: c.vendedor.split(' ')[0] },
          ].map((m, i) => (
            <div key={i} style={{ padding: '8px 10px', background: 'var(--sf-bg)', borderRadius: 8, border: '1px solid var(--sf-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)' }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--sf-t1)', marginTop: 2 }}>{m.value}</div>
            </div>
          ))}
        </div>
        {cats.length > 0 && (<>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)', margin: 0 }}>Categorías que compra</p>
          <div style={{ borderRadius: 8, border: '1px solid var(--sf-border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 70px 50px 90px', padding: '6px 12px', background: 'var(--sf-inset)', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', color: 'var(--sf-t5)' }}>
              <span>Categoría</span><span style={{ textAlign: 'right' }}>Uds</span><span style={{ textAlign: 'right' }}>%</span><span style={{ textAlign: 'right' }}>Tendencia</span>
            </div>
            {cats.map((ct, i) => (
              <div key={ct.cat} style={{ display: 'grid', gridTemplateColumns: '1fr 70px 50px 90px', padding: '6px 12px', fontSize: 12, borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{ct.cat}</span>
                <span style={{ textAlign: 'right', color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{ct.uds.toLocaleString()}</span>
                <span style={{ textAlign: 'right', color: 'var(--sf-t4)' }}>{ct.pct}%</span>
                <span style={{ textAlign: 'right', fontSize: 11, fontWeight: 500, color: ct.tendencia === 'colapso' || ct.tendencia === 'caida' ? 'var(--sf-red)' : ct.tendencia === 'crecimiento' ? 'var(--sf-green)' : 'var(--sf-t4)' }}>
                  {ct.tendencia === 'colapso' ? `⚠️ ${ct.varPct}%` : ct.tendencia === 'caida' ? `↓ ${ct.varPct}%` : ct.tendencia === 'crecimiento' ? `↑ ${ct.varPct}%` : 'estable'}
                </span>
              </div>
            ))}
          </div>
        </>)}
        {señales.length > 0 && (<>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)', margin: 0 }}>Señales cruzadas</p>
          {señales.map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 6, fontSize: 12, color: 'var(--sf-t2)' }}>{s}</div>
          ))}
        </>)}
      </div>
    )

    setParetoAnalysisMap(prev => ({ ...prev, [id]: { loading: false, text: 'computed', content } }))
  }, [sales, selectedPeriod, categoriaAnalysis, categoriasInventario, vendorAnalysis])

  const handleAnalyzeCliente = useCallback((c: ClienteDormido) => {
    const id = c.cliente
    setExpandedClienteId(id)

    const clienteSales = sales.filter(s => s.cliente === c.cliente)
    const mesesSet = new Set(clienteSales.map(s => `${new Date(s.fecha).getFullYear()}-${new Date(s.fecha).getMonth()}`))
    const promedioMensual = mesesSet.size > 0 ? Math.round(c.valor_yoy_usd / mesesSet.size) : 0

    // Top products
    const prodMap: Record<string, number> = {}
    clienteSales.forEach(s => { if (s.producto) prodMap[s.producto] = (prodMap[s.producto] ?? 0) + s.unidades })
    const topProds = Object.entries(prodMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([p, uds]) => {
        const inv = categoriasInventario.find(i => i.producto === p)
        return { producto: p, uds_total: uds, hayStock: inv ? inv.unidades_actuales > 0 : false, stock: inv?.unidades_actuales ?? 0, clasificacion: inv?.clasificacion }
      })

    const vendInfo = vendorAnalysis.find(v => v.vendedor === c.vendedor)
    const otrosDormidos = clientesDormidos.filter(d => d.vendedor === c.vendedor && d.cliente !== c.cliente)
    const recLabel = c.recovery_label === 'alta' ? 'Alta probabilidad' : c.recovery_label === 'recuperable' ? 'Recuperable' : c.recovery_label === 'dificil' ? 'Difícil' : 'Perdido'

    // Category context
    const cats = [...new Set(clienteSales.map(s => s.categoria).filter(Boolean))]
    const catsEnDeclive = cats.map(cat => {
      const ctx = categoriaAnalysis.find(ca => ca.categoria === cat)
      return ctx && (ctx.tendencia === 'colapso' || ctx.tendencia === 'caida') ? { cat, varPct: Math.round(ctx.variacion_pct) } : null
    }).filter(Boolean) as { cat: string; varPct: number }[]

    const señales: string[] = []
    const conStock = topProds.filter(p => p.hayStock)
    if (conStock.length > 0) señales.push(`Tienes stock de ${conStock.map(p => `${p.producto} (${p.stock.toLocaleString()} uds)`).slice(0, 2).join(', ')} que este cliente compraba`)
    if (otrosDormidos.length > 0) señales.push(`${c.vendedor} tiene ${otrosDormidos.length} cliente${otrosDormidos.length > 1 ? 's' : ''} dormido${otrosDormidos.length > 1 ? 's' : ''} más — posible patrón de desatención`)
    if (catsEnDeclive.length > 0) señales.push(`${catsEnDeclive.map(ct => `${ct.cat} (${ct.varPct}%)`).join(', ')} en declive — la inactividad puede ser por tendencia del mercado`)
    if (vendInfo && (vendInfo.riesgo === 'critico' || vendInfo.riesgo === 'riesgo')) señales.push(`Vendedor ${c.vendedor} en estado ${vendInfo.riesgo}`)

    const content = (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ padding: '12px 14px', borderLeft: '3px solid var(--sf-amber)', background: 'rgba(245,158,11,0.06)', borderRadius: '0 8px 8px 0', fontSize: 13, lineHeight: 1.6, color: 'var(--sf-t2)' }}>
          <strong>{c.cliente}</strong> dejó de comprar hace {c.dias_sin_actividad} días.
          {c.frecuencia_esperada_dias ? ` Su frecuencia habitual era cada ${c.frecuencia_esperada_dias} días.` : ''}
          {' '}Estado: {recLabel}.
          {promedioMensual > 0 ? ` Compraba ~${promedioMensual.toLocaleString()} uds/mes.` : ''}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
          {[
            { label: 'Inactivo', value: `${c.dias_sin_actividad}d` },
            { label: `Valor ${MESES_CORTOS[selectedPeriod.month]} ${selectedPeriod.year - 1}`, value: c.valor_yoy_usd > 0 ? `${moneda}${c.valor_yoy_usd >= 1000 ? `${(c.valor_yoy_usd / 1000).toFixed(1)}k` : c.valor_yoy_usd}` : '—' },
            { label: 'Vendedor', value: c.vendedor.split(' ')[0] },
          ].map((m, i) => (
            <div key={i} style={{ padding: '8px 10px', background: 'var(--sf-bg)', borderRadius: 8, border: '1px solid var(--sf-border)' }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)' }}>{m.label}</div>
              <div style={{ fontSize: 16, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: 'var(--sf-t1)', marginTop: 2 }}>{m.value}</div>
            </div>
          ))}
        </div>
        {topProds.length > 0 && (<>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)', margin: 0 }}>Productos que compraba</p>
          <div style={{ borderRadius: 8, border: '1px solid var(--sf-border)', overflow: 'hidden' }}>
            {topProds.map((p, i) => (
              <div key={p.producto} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', fontSize: 12, borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{p.producto}</span>
                <span style={{ color: p.hayStock ? 'var(--sf-green)' : 'var(--sf-t4)', fontSize: 11, fontFamily: "'DM Mono', monospace" }}>
                  {p.hayStock ? `${p.stock.toLocaleString()} en stock` : 'sin stock'}
                </span>
              </div>
            ))}
          </div>
        </>)}
        {señales.length > 0 && (<>
          <p style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--sf-t4)', margin: 0 }}>Señales</p>
          {señales.map((s, i) => (
            <div key={i} style={{ padding: '8px 12px', background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 6, fontSize: 12, color: 'var(--sf-t2)' }}>{s}</div>
          ))}
        </>)}
      </div>
    )

    setAnalysisMap(prev => ({ ...prev, [id]: { loading: false, text: 'computed', content } }))
  }, [sales, categoriasInventario, vendorAnalysis, clientesDormidos, categoriaAnalysis])

  // R103: lookup UI — lista de vendedores para filtro de select, depende de estado UI
  const vendedores = useMemo(
    () => {
      const set = new Set<string>()
      for (const c of clientesDormidos) if (c.vendedor) set.add(c.vendedor)
      for (const c of clienteSummaries) if (c.vendedor) set.add(c.vendedor)
      return [...set].sort()
    },
    [clientesDormidos, clienteSummaries],
  )

  // R102/Z.1.b: migrado a domain-aggregations.getParetoClientes (R59: peso total universe)
  const paretoClientes = useMemo<ParetoCliente[]>(
    () => getParetoClientes(clienteSummaries, dataAvailability.has_venta_neta),
    [clienteSummaries, dataAvailability.has_venta_neta],
  )

  // R102/Z.1.b: migrado a domain-aggregations.getClientesEnRiesgoTemprano
  const riesgoTemprano = useMemo<RiesgoTempranoEntry[]>(
    () => getClientesEnRiesgoTemprano(clienteSummaries),
    [clienteSummaries],
  )

  useEffect(() => {
    if (initialPanelCliente) setPanelCliente(initialPanelCliente)
  }, [initialPanelCliente])

  // Reset pagination when tab/filter/sort changes
  useEffect(() => { setVisibleCount(PAGE_SIZE) }, [tab, filterVendedor, searchCliente, sortKey, sortDir])

  useEffect(() => {
    if (isProcessed && !dataAvailability.has_cliente) navigate(dp('/dashboard'))
  }, [isProcessed, dataAvailability.has_cliente, navigate])

  // ── Hooks derivados — DEBEN ejecutarse en CADA render (Rules of Hooks).
  // No puede haber hooks después del early return.
  const searchQ = searchCliente.toLowerCase()

  // R103: filtro UI — depende de estado local filterVendedor y searchQ
  const filtered = useMemo(() => {
    return clientesDormidos.filter(c => {
      if ((c.dias_sin_actividad ?? 0) < diasDormidoInput) return false
      if (filterVendedor !== 'all' && c.vendedor !== filterVendedor) return false
      if (searchQ && !c.cliente.toLowerCase().includes(searchQ)) return false
      return true
    })
  }, [clientesDormidos, diasDormidoInput, filterVendedor, searchQ])

  // R103: orden UI — sort por criterio seleccionado por usuario
  const sortedFull = useMemo(() => {
    return filtered.slice().sort((a, b) => {
      const mul = sortDir === 'desc' ? -1 : 1
      if (sortKey === 'prioridad') return mul * (a.recovery_score - b.recovery_score)
      if (sortKey === 'dias_sin_actividad') return mul * (a.dias_sin_actividad - b.dias_sin_actividad)
      if (sortKey === 'valor_yoy_usd') return mul * (a.valor_yoy_usd - b.valor_yoy_usd)
      if (sortKey === 'transacciones_yoy') return mul * (a.transacciones_yoy - b.transacciones_yoy)
      if (sortKey === 'vendedor') return mul * a.vendedor.localeCompare(b.vendedor)
      return mul * a.cliente.localeCompare(b.cliente)
    })
  }, [filtered, sortKey, sortDir])

  // R103: paginación UI — slice derivado de sortedFull y visibleCount (estado local)
  const sorted = useMemo(() => sortedFull.slice(0, visibleCount), [sortedFull, visibleCount])

  // R102/Z.1.b: migrado a domain-aggregations.getValorEnRiesgoTotal
  const totalValorEnRiesgo = useMemo(
    () => getValorEnRiesgoTotal(clientesDormidos),
    [clientesDormidos],
  )

  // R103: filtro UI — versión filtrada por vendedor/búsqueda para tab pareto
  const filteredPareto = useMemo(() => {
    return paretoClientes.filter(c => {
      if (filterVendedor !== 'all' && c.vendedor !== filterVendedor) return false
      if (searchQ && !c.nombre.toLowerCase().includes(searchQ)) return false
      return true
    })
  }, [paretoClientes, filterVendedor, searchQ])

  // R103: filtro UI — versión filtrada para tab riesgo temprano
  const filteredRiesgoFull = useMemo(() => {
    return riesgoTemprano.filter(c => {
      if (filterVendedor !== 'all' && c.vendedor !== filterVendedor) return false
      if (searchQ && !c.nombre.toLowerCase().includes(searchQ)) return false
      return true
    })
  }, [riesgoTemprano, filterVendedor, searchQ])

  // R103: paginación UI — slice de riesgoTemprano filtrado
  const filteredRiesgo = useMemo(
    () => filteredRiesgoFull.slice(0, visibleCount),
    [filteredRiesgoFull, visibleCount],
  )

  // ── Early return DESPUÉS de todos los hooks ─────────────────────────────
  if (!dataAvailability.has_cliente) return null

  const moneda = configuracion.moneda
  const usaDolares = metrica === 'dolares' && dataAvailability.has_venta_neta

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-20" />
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-[#00B894]" />
      : <ChevronUp className="w-3 h-3 text-[#00B894]" />
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header + inline badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--sf-t1)]">Clientes</h1>
          <p style={{ fontSize: '12px', color: 'var(--sf-t5)', margin: '3px 0 0' }}>Clientes inactivos, concentración de ventas y señales tempranas de riesgo</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span
            style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(226,75,74,0.15)', color: '#E24B4A', border: '1px solid rgba(226,75,74,0.25)', cursor: 'help' }}
            title={`Clientes sin comprar desde hace al menos ${configuracion.dias_dormido_threshold} días (umbral configurable).`}
          >
            {clientesDormidos.length} inactivos
          </span>
          <span
            style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,159,39,0.15)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)', cursor: 'help' }}
            title="Total de venta del año pasado en el mismo período aportada por clientes inactivos. Aproximación de lo que se pierde si no se recuperan."
          >
            {moneda}{totalValorEnRiesgo >= 1000 ? `${(totalValorEnRiesgo / 1000).toFixed(1)}k` : totalValorEnRiesgo.toLocaleString(undefined, { maximumFractionDigits: 0 })} en riesgo
          </span>
          <span
            style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,159,39,0.15)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)', cursor: 'help' }}
            title="Clientes activos cuya última compra excede su frecuencia habitual (más de 1.5× su frecuencia promedio): posibles dormidos próximos."
          >
            {riesgoTemprano.length} riesgo temprano
          </span>
          {paretoClientes.length > 0 && (() => {
            const topPeso = paretoClientes[0].peso
            const isAlta = topPeso > 15
            return (
              <span
                style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: isAlta ? 'rgba(226,75,74,0.15)' : 'rgba(239,159,39,0.15)', color: isAlta ? '#E24B4A' : '#EF9F27', border: `1px solid ${isAlta ? 'rgba(226,75,74,0.25)' : 'rgba(239,159,39,0.25)'}`, cursor: 'help' }}
                title="Porcentaje del total de ventas que aporta el cliente más grande (peso del top 1 sobre el universo de clientes)."
              >
                {topPeso.toFixed(1)}% concentración cliente principal
              </span>
            )
          })()}
        </div>
      </div>

      {/* Card: tabs + table */}
      <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <SFSearch
          placeholder="Buscar cliente..."
          value={searchCliente}
          onChange={e => setSearchCliente(e.target.value)}
          style={{ width: 180 }}
        />
        {vendedores.length > 1 && (
          <SFSelect
            value={filterVendedor}
            onChange={e => setFilterVendedor(e.target.value)}
          >
            <option value="all">Todos los vendedores</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </SFSelect>
        )}
      </div>

      {/* Umbral días-dormido — exploración temporal (fix-1.3) */}
      <div className="flex flex-wrap items-center gap-2 mb-3 text-[13px]" style={{ color: 'var(--sf-t4)' }}>
        <label
          htmlFor="dias-dormido-input"
          title="Cambio temporal solo para esta vista. Para cambiar permanente, usá Configuración."
          style={{ fontWeight: 500, color: 'var(--sf-t3)', cursor: 'help', borderBottom: '1px dotted var(--sf-border)' }}
        >
          Considerar dormido después de
        </label>
        <input
          id="dias-dormido-input"
          type="number"
          min={DIAS_DORMIDO_MIN}
          max={DIAS_DORMIDO_MAX}
          step={1}
          value={diasDormidoInput}
          onChange={e => {
            const n = parseInt(e.target.value, 10)
            if (!Number.isNaN(n)) setDiasDormidoInput(n)
          }}
          onBlur={e => {
            const n = parseInt(e.target.value, 10)
            setDiasDormidoInput(Number.isNaN(n)
              ? configuracion.dias_dormido_threshold
              : clampDiasDormido(n))
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur()
          }}
          style={{
            width: 68,
            padding: '4px 8px',
            borderRadius: 6,
            border: `1px solid ${diasDormidoCustom ? 'var(--sf-amber, #f59e0b)' : 'var(--sf-border)'}`,
            background: 'var(--sf-card)',
            color: 'var(--sf-t1)',
            fontSize: 13,
            textAlign: 'center',
          }}
        />
        <span>días sin comprar</span>
        <span style={{ color: 'var(--sf-t5)', marginLeft: 6 }}>
          · {clientesDormidos.filter(d => (d.dias_sin_actividad ?? 0) >= diasDormidoInput).length} clientes clasificados con este umbral
        </span>
        {diasDormidoCustom && (
          <>
            <button
              type="button"
              onClick={saveAsDefault}
              style={{
                marginLeft: 4,
                padding: '3px 10px',
                borderRadius: 6,
                border: '1px solid rgba(245,158,11,0.4)',
                background: 'rgba(245,158,11,0.08)',
                color: '#f59e0b',
                fontSize: 12,
                cursor: 'pointer',
                fontWeight: 500,
              }}
            >
              Guardar como predeterminado
            </button>
            <button
              type="button"
              onClick={() => setDiasDormidoInput(configuracion.dias_dormido_threshold)}
              style={{
                padding: '3px 8px',
                borderRadius: 6,
                border: '1px solid var(--sf-border)',
                background: 'transparent',
                color: 'var(--sf-t4)',
                fontSize: 12,
                cursor: 'pointer',
              }}
            >
              ↩ restablecer
            </button>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="tablist"
          aria-label="Vistas de clientes"
          onKeyDown={(e) => {
            const order = ['dormidos', 'pareto', 'riesgo'] as const
            const idx = order.indexOf(tab)
            let next: typeof order[number] | null = null
            if (e.key === 'ArrowRight') next = order[(idx + 1) % order.length]
            else if (e.key === 'ArrowLeft') next = order[(idx - 1 + order.length) % order.length]
            else if (e.key === 'Home') next = order[0]
            else if (e.key === 'End') next = order[order.length - 1]
            if (next) {
              e.preventDefault()
              setTab(next)
              ;(e.currentTarget.querySelector(`#tab-${next}`) as HTMLElement | null)?.focus()
            }
          }}
          style={{ display: 'inline-flex', background: 'var(--sf-inset)', borderRadius: '8px', padding: '3px', gap: '2px' }}
        >
          {([
            { key: 'dormidos', label: `Inactivos (${filtered.length})`, tip: `Clientes sin comprar desde hace al menos ${configuracion.dias_dormido_threshold} días (umbral configurable).` },
            { key: 'pareto',   label: 'Mejores clientes', tip: 'Listado de clientes ordenados por venta acumulada — Pareto / concentración del negocio.' },
            { key: 'riesgo',   label: 'Riesgo Temprano', tip: 'Clientes activos cuya última compra excede su frecuencia habitual (>1.5× su frecuencia promedio): posibles dormidos próximos.' },
          ] as const).map(({ key: t, label, tip }) => {
            const selected = tab === t
            return (
              <button
                key={t}
                id={`tab-${t}`}
                role="tab"
                type="button"
                aria-selected={selected}
                aria-controls={`panel-${t}`}
                tabIndex={selected ? 0 : -1}
                onClick={() => setTab(t)}
                title={tip}
                style={{
                  padding: '5px 14px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  background: selected ? 'rgba(29,158,117,0.15)' : 'transparent',
                  color: selected ? '#1D9E75' : 'var(--sf-t3)',
                  border: selected ? '1px solid rgba(29,158,117,0.25)' : '1px solid transparent',
                  cursor: 'pointer',
                  transition: 'all 150ms',
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Tab content — keyed div triggers fade-in on tab switch */}
      <div
        key={tab}
        id={`panel-${tab}`}
        role="tabpanel"
        aria-labelledby={`tab-${tab}`}
        tabIndex={0}
        className="animate-in fade-in duration-150"
      >

      {/* Clientes dormidos table */}
      {tab === 'dormidos' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {/* Headline with impact summary */}
          {sorted.length > 0 && (
            <div className="rounded-xl p-4 mb-3" style={{ background: 'var(--sf-red-bg)', border: '1px solid var(--sf-red-border)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--sf-t1)' }}>
                {sorted.length} cliente{sorted.length > 1 ? 's' : ''} dejaron de comprar
              </p>
              {totalValorEnRiesgo > 0 && usaDolares && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--sf-t3)' }}>
                  {moneda}{totalValorEnRiesgo >= 1000 ? `${(totalValorEnRiesgo / 1000).toFixed(1)}k` : totalValorEnRiesgo.toLocaleString()} venta YoY perdida ({MESES_CORTOS[selectedPeriod.month]} {selectedPeriod.year - 1})
                  {sorted.length > 0 ? ` · ~${moneda}${Math.round(totalValorEnRiesgo / sorted.length / 1000 * 10) / 10}k promedio por cliente` : ''}
                </p>
              )}
            </div>
          )}
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">
                {searchQ || filterVendedor !== 'all' ? 'Sin resultados para esta búsqueda' : 'Sin clientes inactivos'}
              </p>
              <p className="text-xs mt-1">Todos los clientes han comprado recientemente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['cliente', 'Cliente'],
                      ['vendedor', 'Vendedor'],
                      ['dias_sin_actividad', 'Inactivo'],
                      ['transacciones_yoy', 'Txns YoY'],
                      ['valor_yoy_usd', `Valor ${MESES_CORTOS[selectedPeriod.month]} ${selectedPeriod.year - 1}`],
                      ['prioridad', 'Recuperación'],
                    ] as [SortKey, string][]).map(([k, label], i) => (
                      <th
                        key={k}
                        onClick={() => handleSort(k)}
                        style={{
                          padding: '10px 16px',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--sf-t3)',
                          fontWeight: 500,
                          textAlign: i > 1 ? 'right' : 'left',
                          borderLeft: i === 0 ? '3px solid #1D9E75' : undefined,
                          cursor: 'pointer',
                          userSelect: 'none',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <span className="flex items-center gap-1" style={{ justifyContent: i > 1 ? 'flex-end' : 'flex-start' }}>
                          {label}
                          <SortIcon k={k as SortKey} />
                        </span>
                      </th>
                    ))}
                    <th style={{ padding: '8px 16px', width: '120px', minWidth: '120px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const score = c.recovery_score
                    const analysis = analysisMap[c.cliente]
                    const isExpanded = expandedClienteId === c.cliente
                    const isHL = highlightActive === c.cliente
                    return (
                      <React.Fragment key={i}>
                      <tr
                        ref={isHL ? highlightRef : undefined}
                        style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--sf-border)', transition: 'background 120ms', ...(isHL ? { outline: '2px solid #f59e0b', outlineOffset: -1, background: 'rgba(245,158,11,0.08)' } : {}) }}
                        onMouseEnter={e => { if (!isHL) e.currentTarget.style.background = 'var(--sf-hover)' }}
                        onMouseLeave={e => { if (!isHL) e.currentTarget.style.background = 'transparent' }}
                      >
                        <td style={{ padding: '10px 16px' }}>
                          <div
                            style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)', cursor: 'pointer' }}
                            onClick={() => setPanelCliente(c.cliente)}
                            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-green)' }}
                            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-t1)' }}
                          >
                            {c.cliente} <span style={{ fontSize: '11px', opacity: 0.5 }}>{'\u2192'}</span>
                          </div>
                          <div style={{ fontSize: '11px', color: 'var(--sf-t4)', marginTop: '1px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.recovery_explicacion}>
                            {c.recovery_explicacion}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            fontFamily: "'DM Mono', monospace",
                            textAlign: 'right',
                            color: c.dias_sin_actividad >= 90 ? '#E24B4A' : c.dias_sin_actividad >= 60 ? '#EF9F27' : 'var(--sf-t2)',
                          }}
                        >
                          {formatDays(c.dias_sin_actividad)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t3)', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>{c.transacciones_yoy || '—'}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace", textAlign: 'right' }}>
                          {c.valor_yoy_usd > 0
                            ? `${moneda}${c.valor_yoy_usd >= 1000 ? `${(c.valor_yoy_usd / 1000).toFixed(1)}k` : c.valor_yoy_usd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                            : '—'}
                        </td>
                        <td style={{ padding: '10px 12px', maxWidth: 180 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                            <span style={{
                              fontSize: '10px', padding: '2px 7px', borderRadius: '3px', fontWeight: 600, alignSelf: 'flex-start',
                              background: c.recovery_label === 'alta' ? 'rgba(29,158,117,0.15)' : c.recovery_label === 'recuperable' ? 'rgba(29,158,117,0.15)' : c.recovery_label === 'dificil' ? 'rgba(239,159,39,0.15)' : 'rgba(226,75,74,0.15)',
                              color: c.recovery_label === 'alta' ? '#1D9E75' : c.recovery_label === 'recuperable' ? '#1D9E75' : c.recovery_label === 'dificil' ? '#EF9F27' : '#E24B4A',
                            }}>
                              {c.recovery_label === 'alta' ? 'Alta' : c.recovery_label === 'recuperable' ? 'Recuperable' : c.recovery_label === 'dificil' ? 'Difícil' : 'Perdido'}
                            </span>
                            <span style={{ fontSize: '11px', color: 'var(--sf-t4)', lineHeight: 1.3 }}>
                              {c.recovery_label === 'alta' ? `Comprador frecuente, lleva ${c.dias_sin_actividad} días sin actividad`
                                : c.recovery_label === 'recuperable' ? `Buen historial, se fue hace ${c.dias_sin_actividad} días`
                                : c.recovery_label === 'dificil' ? (c.valor_yoy_usd > 5000 ? `Aportaba ${moneda}${(c.valor_yoy_usd / 1000).toFixed(0)}k, vale el intento` : 'Historial irregular, respuesta incierta')
                                : `Sin señales de retorno en ${c.dias_sin_actividad} días`}
                            </span>
                            <span style={{
                              fontSize: '11px', fontWeight: 500, lineHeight: 1.3,
                              color: c.recovery_label === 'alta' ? '#10b981' : c.recovery_label === 'recuperable' ? '#14b8a6' : c.recovery_label === 'dificil' ? '#f59e0b' : '#f87171',
                            }}>
                              {c.recovery_label === 'alta' ? '→ Llámalo hoy, suele responder'
                                : c.recovery_label === 'recuperable' ? '→ Un contacto puede reactivarlo'
                                : c.recovery_label === 'dificil' ? '→ Intenta con una oferta concreta'
                                : '→ Baja prioridad, enfoca energía en otros'}
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAnalyzeCliente(c)
                            }}
                            disabled={analysis?.loading}
                            title="Analizar con IA"
                            style={{
                              background: 'rgba(29,158,117,0.12)',
                              border: '1px solid rgba(29,158,117,0.35)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              cursor: analysis?.loading ? 'wait' : 'pointer',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#1D9E75',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                              transition: 'all 150ms',
                              marginLeft: 'auto',
                              opacity: analysis?.loading ? 0.6 : 1,
                            }}
                            onMouseEnter={e => {
                              if (!analysis?.loading) {
                                e.currentTarget.style.background = 'rgba(29,158,117,0.22)'
                                e.currentTarget.style.borderColor = 'rgba(29,158,117,0.6)'
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(29,158,117,0.12)'
                              e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)'
                            }}
                          >
                            {analysis?.loading ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Analizando…
                              </>
                            ) : analysis?.text ? (
                              <>
                                <span style={{ fontSize: '13px' }}>✦</span>
                                Regenerar
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '13px' }}>✦</span>
                                Analizar
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {/* Inline analysis panel */}
                      {isExpanded && (analysis?.loading || analysis?.text) && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--sf-border)' }}>
                            <div style={{ padding: '16px 24px', background: 'var(--sf-inset)', borderTop: '1px solid var(--sf-border)' }}>
                              {analysis.loading ? (
                                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--sf-t4)' }}>
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  Analizando cliente…
                                </div>
                              ) : analysis.text ? (
                                <>
                                  {analysis.content ? (
                                    <div>{analysis.content}</div>
                                  ) : (
                                    <div className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--sf-t3)' }}>
                                      {analysis.text}
                                    </div>
                                  )}
                                  <button
                                    onClick={() => {
                                      const displayMessage = `Profundizar: cliente ${c.cliente} (${c.dias_sin_actividad} días inactivo)`
                                      const fullContext = [
                                        `Profundizar sobre cliente dormido: ${c.cliente}`,
                                        `Vendedor: ${c.vendedor}`,
                                        `Días inactivo: ${c.dias_sin_actividad}`,
                                        `Valor YoY (${MESES_CORTOS[selectedPeriod.month]} ${selectedPeriod.year - 1}): ${moneda}${c.valor_yoy_usd.toLocaleString()}`,
                                        `Estado: ${c.recovery_label === 'alta' ? 'Alta probabilidad de recuperación' : c.recovery_label === 'recuperable' ? 'Recuperable' : c.recovery_label === 'dificil' ? 'Difícil de recuperar' : 'Perdido'}`,
                                        analysis.text ? `\nAnálisis previo:\n${analysis.text}` : '',
                                        ``,
                                        `Con base en este análisis, profundiza: ¿por qué se durmió este cliente, qué productos compraba, hay patrón con otros clientes dormidos del mismo vendedor?`
                                      ].filter(Boolean).join('\n')
                                      navigate(dp('/chat'), { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Clientes' } })
                                    }}
                                    style={{
                                      marginTop: '12px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 14px',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(29,158,117,0.35)',
                                      background: 'rgba(29,158,117,0.08)',
                                      color: '#1D9E75',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all 150ms',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                                  >
                                    + Profundizar
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              {sortedFull.length > visibleCount && (
                <div className="flex justify-center py-3 border-t border-[var(--sf-border)]">
                  <button
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(29,158,117,0.35)',
                      background: 'rgba(29,158,117,0.08)',
                      color: '#1D9E75',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cargar más ({Math.min(PAGE_SIZE, sortedFull.length - visibleCount)} de {sortedFull.length - visibleCount} restantes)
                  </button>
                </div>
              )}
              <p className="px-5 py-2 text-[10px] text-[var(--sf-t4)] border-t border-[var(--sf-border)]">
                Mostrando {sorted.length} de {sortedFull.length} clientes inactivos
                {filtered.length !== clientesDormidos.length ? ` (filtrados de ${clientesDormidos.length})` : ''}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pareto table */}
      {tab === 'pareto' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {/* Legend */}
          {paretoClientes.length > 0 && (
            <div className="flex items-center gap-4 flex-wrap px-4 py-2 mb-1" style={{ fontSize: 10, color: 'var(--sf-t5)' }}>
              <span
                className="flex items-center gap-1.5"
                style={{ cursor: 'help' }}
                title="Cliente posicionado dentro del primer 50% del volumen acumulado del negocio. Concentración baja en este tramo."
              >
                <span style={{ width: 8, height: 2, background: 'rgba(29,158,117,0.6)', display: 'inline-block', borderRadius: 1 }} />
                ≤50% bajo riesgo
              </span>
              <span
                className="flex items-center gap-1.5"
                style={{ cursor: 'help' }}
                title="Cliente posicionado entre el 50% y el 80% del volumen acumulado. Tramo intermedio de concentración."
              >
                <span style={{ width: 8, height: 2, background: 'rgba(239,159,39,0.6)', display: 'inline-block', borderRadius: 1 }} />
                50-80% concentración media
              </span>
              <span
                className="flex items-center gap-1.5"
                style={{ cursor: 'help' }}
                title="Cliente posicionado más allá del 80% del volumen acumulado: cola larga del Pareto."
              >
                <span style={{ width: 8, height: 2, background: 'rgba(226,75,74,0.6)', display: 'inline-block', borderRadius: 1 }} />
                &gt;80% alta concentración
              </span>
            </div>
          )}
          {filteredPareto.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">{searchQ || filterVendedor !== 'all' ? 'Sin resultados para esta búsqueda' : 'Sin datos de clientes'}</p>
              <p className="text-xs mt-1">{searchQ || filterVendedor !== 'all' ? 'Prueba con otros filtros' : 'Carga un archivo con columna de cliente para ver el pareto'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['Cliente', 'left', undefined],
                      ['Vendedor', 'left', undefined],
                      ['Unidades', 'right', undefined],
                      ['Venta Neta', 'right', undefined],
                      ['Variación', 'right', 'Variación de venta del cliente vs el mismo período del año anterior.'],
                      ['Peso acum.', 'right', 'Porcentaje acumulado de ventas que representan los clientes hasta esta fila (orden descendente por venta).'],
                    ] as [string, string, string | undefined][]).map(([h, align, tip], i) => (
                      <th key={h} title={tip} style={{
                        padding: '10px 12px',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--sf-t3)',
                        fontWeight: 500,
                        textAlign: align as 'left' | 'right',
                        borderLeft: i === 0 ? '3px solid #1D9E75' : undefined,
                        paddingLeft: i === 0 ? '16px' : undefined,
                        cursor: tip ? 'help' : undefined,
                      }}>{h}</th>
                    ))}
                    <th style={{ padding: '8px 16px', width: '120px', minWidth: '120px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows: React.ReactNode[] = []
                    let shown50 = false
                    let shown80 = false
                    filteredPareto.forEach((c, idx) => {
                      const prevPct = idx > 0 ? paretoClientes[idx - 1].cumulativePct : 0
                      if (!shown50 && c.cumulativePct >= 50 && prevPct < 50) {
                        shown50 = true
                        rows.push(
                          <tr key="div50">
                            <td colSpan={7} style={{ padding: '4px 12px', borderTop: '2px dashed rgba(29,158,117,0.35)' }}>
                              <div
                                className="flex items-center gap-2"
                                style={{ cursor: 'help' }}
                                title="Hasta esta fila, los clientes acumulan el 50% del volumen total del negocio. Marca el punto de Pareto."
                              >
                                <span style={{ fontSize: '10px', color: '#1D9E75', fontWeight: 600 }}>▲ 50% del volumen</span>
                                <span style={{ fontSize: '9px', color: 'var(--sf-t5)' }}>— {idx + 1} clientes concentran la mitad</span>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      if (!shown80 && c.cumulativePct >= 80 && prevPct < 80) {
                        shown80 = true
                        rows.push(
                          <tr key="div80">
                            <td colSpan={7} style={{ padding: '4px 12px', borderTop: '2px dashed rgba(239,159,39,0.35)' }}>
                              <div
                                className="flex items-center gap-2"
                                style={{ cursor: 'help' }}
                                title="Hasta esta fila, los clientes acumulan el 80% del volumen total. Aproximación de la regla 80/20."
                              >
                                <span style={{ fontSize: '10px', color: '#EF9F27', fontWeight: 600 }}>▲ 80% del volumen</span>
                                <span style={{ fontSize: '9px', color: 'var(--sf-t5)' }}>— {idx + 1} de {paretoClientes.length} clientes</span>
                              </div>
                            </td>
                          </tr>
                        )
                      }
                      const paretoKey = `pareto-${c.nombre}`
                      const paretoAnalysis = paretoAnalysisMap[paretoKey]
                      const isParetoExpanded = expandedParetoId === paretoKey
                      rows.push(
                        <React.Fragment key={idx}>
                        <tr
                          style={{ borderBottom: isParetoExpanded ? 'none' : '1px solid var(--sf-border)', transition: 'background 120ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '9px 16px' }}>
                            <div
                              style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)', cursor: 'pointer' }}
                              onClick={() => setPanelCliente(c.nombre)}
                              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-green)' }}
                              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-t1)' }}
                            >
                              {c.nombre} <span style={{ fontSize: '11px', opacity: 0.5 }}>{'\u2192'}</span>
                            </div>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t2)', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
                            {c.totalUnidades.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
                            {dataAvailability.has_venta_neta
                              ? `${moneda}${c.totalVenta >= 1000 ? `${(c.totalVenta / 1000).toFixed(1)}k` : c.totalVenta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace", fontWeight: 600,
                            color: c.varPct == null ? 'var(--sf-t4)' : c.varPct >= 0 ? '#1D9E75' : '#E24B4A' }}>
                            {c.varPct == null ? '—' : `${c.varPct >= 0 ? '+' : ''}${c.varPct.toFixed(1)}%`}
                          </td>
                          <td style={{ textAlign: 'right', padding: '9px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                              <span style={{
                                fontSize: '9px', fontWeight: 600, padding: '1px 5px', borderRadius: 3,
                                background: c.cumulativePct <= 50 ? 'rgba(29,158,117,0.12)' : c.cumulativePct <= 80 ? 'rgba(239,159,39,0.12)' : 'rgba(226,75,74,0.12)',
                                color: c.cumulativePct <= 50 ? '#1D9E75' : c.cumulativePct <= 80 ? '#EF9F27' : '#E24B4A',
                              }}>
                                {c.cumulativePct <= 50 ? 'Bajo' : c.cumulativePct <= 80 ? 'Medio' : 'Alto'}
                              </span>
                              <div style={{ width: '40px', height: '3px', background: 'var(--sf-inset)', borderRadius: '2px' }}>
                                <div style={{ width: `${Math.min(c.cumulativePct, 100)}%`, height: '100%', borderRadius: '2px',
                                  background: c.cumulativePct <= 50 ? '#1D9E75' : c.cumulativePct <= 80 ? '#EF9F27' : '#E24B4A' }} />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--sf-t3)', minWidth: '36px', textAlign: 'right' }}>{c.cumulativePct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleAnalyzeTopCliente(c)
                              }}
                              disabled={paretoAnalysis?.loading}
                              title="Analizar con IA"
                              style={{
                                background: 'rgba(29,158,117,0.12)',
                                border: '1px solid rgba(29,158,117,0.35)',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                cursor: paretoAnalysis?.loading ? 'wait' : 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#1D9E75',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                whiteSpace: 'nowrap',
                                transition: 'all 150ms',
                                marginLeft: 'auto',
                                opacity: paretoAnalysis?.loading ? 0.6 : 1,
                              }}
                              onMouseEnter={e => {
                                if (!paretoAnalysis?.loading) {
                                  e.currentTarget.style.background = 'rgba(29,158,117,0.22)'
                                  e.currentTarget.style.borderColor = 'rgba(29,158,117,0.6)'
                                }
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(29,158,117,0.12)'
                                e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)'
                              }}
                            >
                              {paretoAnalysis?.loading ? (
                                <>
                                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  Analizando…
                                </>
                              ) : paretoAnalysis?.text ? (
                                <>
                                  <span style={{ fontSize: '13px' }}>✦</span>
                                  Regenerar
                                </>
                              ) : (
                                <>
                                  <span style={{ fontSize: '13px' }}>✦</span>
                                  Analizar
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                        {/* Loading indicator */}
                        {isParetoExpanded && paretoAnalysis?.loading && (
                          <tr>
                            <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--sf-border)' }}>
                              <div className="flex items-center gap-2 text-sm" style={{ padding: '12px 24px', background: 'var(--sf-inset)', color: 'var(--sf-t4)' }}>
                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Analizando {c.nombre}…
                              </div>
                            </td>
                          </tr>
                        )}
                        </React.Fragment>
                      )
                    })
                    return rows
                  })()}
                </tbody>
              </table>
              {paretoClientes.length > 0 && (() => {
                const topCoverage = paretoClientes[paretoClientes.length - 1].cumulativePct
                return (
                  <p className="px-5 py-2 text-[10px] text-[var(--sf-t4)] border-t border-[var(--sf-border)]">
                    {paretoClientes.length} clientes — {topCoverage.toFixed(1)}% del volumen total del negocio (R59)
                  </p>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* Riesgo Temprano table */}
      {tab === 'riesgo' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {filteredRiesgo.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">{searchQ || filterVendedor !== 'all' ? 'Sin resultados para esta búsqueda' : 'Sin señales de riesgo temprano'}</p>
              <p className="text-xs mt-1">{searchQ || filterVendedor !== 'all' ? 'Prueba con otros filtros' : 'Todos los clientes activos compran dentro de su frecuencia normal'}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['Cliente', 'left'],
                      ['Vendedor', 'left'],
                      ['Últ. compra', 'right'],
                      ['Frec. normal', 'right'],
                      ['Atraso', 'right'],
                      ['Señal', 'center'],
                      ['Valor hist.', 'right'],
                    ] as [string, string][]).map(([h, align], i) => (
                      <th key={h} style={{
                        padding: '10px 12px',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--sf-t3)',
                        fontWeight: 500,
                        textAlign: align as 'left' | 'right' | 'center',
                        borderLeft: i === 0 ? '3px solid #EF9F27' : undefined,
                        paddingLeft: i === 0 ? '16px' : undefined,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRiesgo.map((c, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--sf-border)', transition: 'background 120ms' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '9px 16px' }}>
                        <div
                          style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)', cursor: 'pointer' }}
                          onClick={() => setPanelCliente(c.nombre)}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-green)' }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--sf-t1)' }}
                        >
                          {c.nombre} <span style={{ fontSize: '11px', opacity: 0.5 }}>{'\u2192'}</span>
                        </div>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t3)', fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
                        {c.lastPurchase.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>
                        cada {Math.round(c.avgDays)}d
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace",
                        color: c.signal === 'en riesgo' ? '#E24B4A' : '#EF9F27' }}>
                        +{c.atraso}d
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '3px', fontWeight: 600,
                          background: c.signal === 'en riesgo' ? 'rgba(226,75,74,0.15)' : 'rgba(239,159,39,0.15)',
                          color: c.signal === 'en riesgo' ? '#E24B4A' : '#EF9F27',
                          border: `1px solid ${c.signal === 'en riesgo' ? 'rgba(226,75,74,0.25)' : 'rgba(239,159,39,0.25)'}`,
                        }}>
                          {c.signal === 'en riesgo' ? 'En riesgo' : 'Desacelerando'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', fontFamily: "'DM Mono', monospace" }}>
                        {moneda}{c.valorHistorico >= 1000
                          ? `${(c.valorHistorico / 1000).toFixed(1)}k`
                          : c.valorHistorico.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRiesgoFull.length > visibleCount && (
                <div className="flex justify-center py-3 border-t border-[var(--sf-border)]">
                  <button
                    onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
                    style={{
                      padding: '6px 14px',
                      borderRadius: 8,
                      border: '1px solid rgba(29,158,117,0.35)',
                      background: 'rgba(29,158,117,0.08)',
                      color: '#1D9E75',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Cargar más ({Math.min(PAGE_SIZE, filteredRiesgoFull.length - visibleCount)} de {filteredRiesgoFull.length - visibleCount} restantes)
                  </button>
                </div>
              )}
              <p className="px-5 py-2 text-[10px] text-[var(--sf-t4)] border-t border-[var(--sf-border)]">
                Mostrando {filteredRiesgo.length} de {filteredRiesgoFull.length} clientes en riesgo
              </p>
            </div>
          )}
        </div>
      )}

      </div>{/* end tab fade wrapper */}

      {/* Drawer for Top Clientes analysis */}
      {(() => {
        const drawerClienteName = expandedParetoId?.replace('pareto-', '') ?? null
        const drawerCliente = drawerClienteName ? paretoClientes.find(c => c.nombre === drawerClienteName) : null
        const analysis = expandedParetoId ? paretoAnalysisMap[expandedParetoId] : null
        const isOpen = !!drawerCliente && !!analysis?.text && !analysis?.loading

        return (
          <AnalysisDrawer
            isOpen={isOpen}
            onClose={() => setExpandedParetoId(null)}
            title={drawerCliente?.nombre ?? ''}
            subtitle={drawerCliente?.varPct != null ? `${drawerCliente.varPct >= 0 ? '+' : ''}${drawerCliente.varPct.toFixed(1)}% YoY` : undefined}
            badges={drawerCliente ? [
              { label: `${drawerCliente.peso.toFixed(1)}% del total`, color: '#1D9E75', bg: 'rgba(29,158,117,0.12)' },
            ] : []}
            analysisText={analysis?.content ? null : (analysis?.text ?? null)}
            analysisContent={analysis?.content}
            onDeepen={drawerCliente && (analysis?.text || analysis?.content) ? () => {
              const displayMessage = `Profundizar: cliente ${drawerCliente.nombre} (${drawerCliente.peso.toFixed(1)}% del total)`
              const fullContext = [
                `Profundizar sobre cliente top: ${drawerCliente.nombre}`,
                `Vendedor: ${drawerCliente.vendedor}`,
                `Unidades YTD: ${drawerCliente.totalUnidades.toLocaleString()}`,
                dataAvailability.has_venta_neta ? `Venta neta YTD: ${moneda}${drawerCliente.totalVenta.toLocaleString()}` : '',
                `Variación YoY: ${drawerCliente.varPct != null ? `${drawerCliente.varPct.toFixed(1)}%` : 'N/A'}`,
                `Peso: ${drawerCliente.peso.toFixed(1)}% del total`,
                analysis.text ? `\nAnálisis previo:\n${analysis.text}` : '',
                '', `Con base en este análisis, profundiza: ¿este cliente está creciendo o decreciendo, qué productos compra, hay riesgo de concentración?`
              ].filter(Boolean).join('\n')
              navigate(dp('/chat'), { state: { prefill: fullContext, displayPrefill: displayMessage, source: 'Clientes' } })
            } : undefined}
            deepenLabel="+ Profundizar en Chat IA"
          />
        )
      })()}

      </div>{/* end card */}

      {/* ClientePanel slide-in */}
      {panelCliente && (
        <>
          <div
            className="fixed inset-0 bg-black/60 z-40"
            onClick={() => setPanelCliente(null)}
          />
          <ClientePanel
            clienteName={panelCliente}
            sales={sales}
            selectedPeriod={selectedPeriod}
            clientesDormidos={clientesDormidos}
            dataAvailability={dataAvailability}
            insights={insights}
            onClose={() => setPanelCliente(null)}
          />
        </>
      )}
    </div>
  )
}
