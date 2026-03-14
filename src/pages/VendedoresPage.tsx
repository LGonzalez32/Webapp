import { useState, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { useNavigate } from 'react-router-dom'
import { cn } from '../lib/utils'
import type { VendorAnalysis } from '../types'
import VendedorPanel from '../components/vendedor/VendedorPanel'

const RIESGO_CONFIG = {
  critico:   { label: 'Crítico',   class: 'bg-red-500/15 text-red-400 border-red-500/30' },
  riesgo:    { label: 'En riesgo', class: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  ok:        { label: 'OK',        class: 'bg-[#00B894]/15 text-[#00B894] border-[#00B894]/30' },
  superando: { label: 'Superando', class: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
}

const RIESGO_ORDER: Record<string, number> = { critico: 0, riesgo: 1, ok: 2, superando: 3 }

export default function VendedoresPage() {
  useAnalysis()
  const {
    vendorAnalysis, insights, dataAvailability, isProcessed,
    sales, selectedPeriod, clientesDormidos, configuracion,
  } = useAppStore()
  const navigate = useNavigate()

  const [selected, setSelected] = useState<VendorAnalysis | null>(null)

  // ── Filtros y sort ─────────────────────────────────────────────────────────
  const [searchVendedor, setSearchVendedor] = useState('')
  const [filterCanal, setFilterCanal]       = useState('all')
  const [filterProducto, setFilterProducto] = useState('all')
  const [filterCliente, setFilterCliente]   = useState('all')
  const [filterMes, setFilterMes]           = useState('all')
  const [sortCol, setSortCol]               = useState<string>('ventas')
  const [sortDir, setSortDir]               = useState<'asc' | 'desc'>('desc')
  const [metrica, setMetrica]               = useState<'unidades' | 'dolares'>('unidades')

  // ── Opciones únicas de filtro ─────────────────────────────────────────────
  const canales = useMemo(
    () => [...new Set(sales.map(s => s.canal).filter((c): c is string => !!c))].sort(),
    [sales],
  )
  const productos = useMemo(
    () => [...new Set(sales.map(s => s.producto).filter((p): p is string => !!p))].sort(),
    [sales],
  )
  const clientes = useMemo(
    () => [...new Set(sales.map(s => s.cliente).filter((c): c is string => !!c))].sort(),
    [sales],
  )
  const meses = useMemo(() => {
    const keys = sales.map(s => {
      const d = s.fecha
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    })
    return [...new Set(keys)].sort().reverse()
  }, [sales])

  // ── Datos filtrados y sorteados ───────────────────────────────────────────
  const filtered = useMemo(() => {
    let data = [...vendorAnalysis]

    if (searchVendedor) {
      const q = searchVendedor.toLowerCase()
      data = data.filter(v => v.vendedor.toLowerCase().includes(q))
    }

    if (filterCanal !== 'all' || filterProducto !== 'all' || filterCliente !== 'all' || filterMes !== 'all') {
      const vendedoresFiltrados = new Set(
        sales.filter(s => {
          if (filterCanal !== 'all' && s.canal !== filterCanal) return false
          if (filterProducto !== 'all' && s.producto !== filterProducto) return false
          if (filterCliente !== 'all' && s.cliente !== filterCliente) return false
          if (filterMes !== 'all') {
            const d = s.fecha
            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
            if (key !== filterMes) return false
          }
          return true
        }).map(s => s.vendedor),
      )
      data = data.filter(v => vendedoresFiltrados.has(v.vendedor))
    }

    data.sort((a, b) => {
      let valA = 0, valB = 0
      switch (sortCol) {
        case 'ventas':
          valA = a.unidades_periodo ?? 0
          valB = b.unidades_periodo ?? 0
          break
        case 'variacion':
          valA = ((a.periodos_base_promedio ?? 0) >= 2 ? a.variacion_vs_promedio_pct : null) ?? a.variacion_pct ?? 0
          valB = ((b.periodos_base_promedio ?? 0) >= 2 ? b.variacion_vs_promedio_pct : null) ?? b.variacion_pct ?? 0
          break
        case 'variacion_ytd':
          valA = a.variacion_ytd_pct ?? 0
          valB = b.variacion_ytd_pct ?? 0
          break
        case 'ticket':
          valA = a.ticket_promedio ?? 0
          valB = b.ticket_promedio ?? 0
          break
        case 'clientes':
          valA = a.clientes_activos ?? 0
          valB = b.clientes_activos ?? 0
          break
        default: // 'riesgo'
          valA = RIESGO_ORDER[a.riesgo] ?? 99
          valB = RIESGO_ORDER[b.riesgo] ?? 99
      }
      return sortDir === 'asc' ? valA - valB : valB - valA
    })

    return data
  }, [vendorAnalysis, sales, searchVendedor, filterCanal, filterProducto, filterCliente, filterMes, sortCol, sortDir])

  // ── Early returns (después de todos los hooks) ────────────────────────────
  if (sales.length === 0) { navigate('/'); return null }
  if (!isProcessed) return <div className="flex items-center justify-center h-64 text-zinc-500">Calculando...</div>

  // ── Helpers ───────────────────────────────────────────────────────────────
  const selectCls = 'bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-[#00B894] cursor-pointer'

  const handleSortCol = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortCol(col); setSortDir('desc') }
  }

  const SortTh = ({ col, label, right }: { col: string; label: string; right?: boolean }) => (
    <th
      onClick={() => handleSortCol(col)}
      className={cn(
        'px-4 py-3 cursor-pointer select-none whitespace-nowrap hover:text-zinc-400 transition-colors',
        right ? 'text-right' : '',
      )}
    >
      {label}{sortCol === col ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ' ↕'}
    </th>
  )

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
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
            onClose={() => setSelected(null)}
          />
        </>
      )}

      <div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Vendedores</h1>
        <p className="text-zinc-500 mt-1">Click en una fila para ver alertas y métricas detalladas.</p>
      </div>

      {/* ── Barra de filtros ─────────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-2 items-center">
        <input
          type="text"
          placeholder="🔍 Buscar vendedor..."
          value={searchVendedor}
          onChange={e => setSearchVendedor(e.target.value)}
          className="bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-xs text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] w-44"
        />
        {dataAvailability.has_canal && canales.length > 0 && (
          <select value={filterCanal} onChange={e => setFilterCanal(e.target.value)} className={selectCls}>
            <option value="all">Canal: todos</option>
            {canales.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {dataAvailability.has_producto && productos.length > 0 && (
          <select value={filterProducto} onChange={e => setFilterProducto(e.target.value)} className={selectCls}>
            <option value="all">Producto: todos</option>
            {productos.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        )}
        {dataAvailability.has_cliente && clientes.length > 0 && (
          <select value={filterCliente} onChange={e => setFilterCliente(e.target.value)} className={selectCls}>
            <option value="all">Cliente: todos</option>
            {clientes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        )}
        {meses.length > 0 && (
          <select value={filterMes} onChange={e => setFilterMes(e.target.value)} className={selectCls}>
            <option value="all">Mes: todos</option>
            {meses.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        )}
        {dataAvailability.has_venta_neta && (
          <div className="flex items-center bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden ml-auto">
            <button
              onClick={() => setMetrica('unidades')}
              className={cn('px-3 py-1.5 text-xs font-bold transition-colors', metrica === 'unidades' ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300')}
            >Unidades</button>
            <button
              onClick={() => setMetrica('dolares')}
              className={cn('px-3 py-1.5 text-xs font-bold transition-colors', metrica === 'dolares' ? 'bg-[#00B894] text-black' : 'text-zinc-500 hover:text-zinc-300')}
            >Dólares</button>
          </div>
        )}
      </div>

      {/* ── Tabla ────────────────────────────────────────────────────────── */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Vendedor</th>
                <SortTh col="ventas" label={metrica === 'dolares' ? 'Venta neta' : 'Unidades'} right />
                <SortTh col="variacion" label="Var %" right />
                <SortTh col="variacion_ytd" label="YTD %" right />
                {dataAvailability.has_metas && <th className="px-4 py-3">% Meta</th>}
                {dataAvailability.has_metas && <th className="px-4 py-3">Proyección</th>}
                {dataAvailability.has_metas && <th className="px-4 py-3">Ritmo nec.</th>}
                {dataAvailability.has_venta_neta && <SortTh col="ticket" label="Ticket" right />}
                {dataAvailability.has_cliente && <SortTh col="clientes" label="Clientes" right />}
                <SortTh col="riesgo" label="Estado" />
                <th className="px-4 py-3 text-right">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {filtered.map((v) => {
                const rConfig = RIESGO_CONFIG[v.riesgo]
                const vendorInsights = insights.filter((i) => i.vendedor === v.vendedor)
                const critCount = vendorInsights.filter((i) => i.prioridad === 'CRITICA').length

                // VAR%: preferir promedio 3m si tiene suficiente base
                const usaPromedio = (v.periodos_base_promedio ?? 0) >= 2 && v.variacion_vs_promedio_pct != null
                const varPct = usaPromedio ? v.variacion_vs_promedio_pct! : v.variacion_pct
                const varTooltip = usaPromedio ? 'vs promedio 3m' : 'vs mes anterior'

                // Ventas — en modo dólares, estimar con ticket si está disponible
                const ventasMostrar = metrica === 'dolares' && v.ticket_promedio
                  ? `${configuracion.moneda} ${Math.round(v.unidades_periodo * v.ticket_promedio).toLocaleString()}`
                  : v.unidades_periodo.toLocaleString()

                return (
                  <tr
                    key={v.vendedor}
                    onClick={() => setSelected(v)}
                    className="hover:bg-zinc-900/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5 font-bold text-zinc-200 group-hover:text-white">{v.vendedor}</td>
                    <td className="px-4 py-3.5 text-zinc-300 font-mono text-right">{ventasMostrar}</td>
                    <td className={cn('px-4 py-3.5 font-bold text-right', varPct == null ? 'text-zinc-600' : varPct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                      <span title={varTooltip}>
                        {varPct == null ? '—' : `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%`}
                        {usaPromedio && <span className="ml-1 text-[9px] text-zinc-600 font-normal">3m</span>}
                      </span>
                    </td>
                    <td className={cn('px-4 py-3.5 font-bold text-right', v.variacion_ytd_pct == null ? 'text-zinc-600' : v.variacion_ytd_pct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                      {v.variacion_ytd_pct == null ? '—' : `${v.variacion_ytd_pct >= 0 ? '+' : ''}${v.variacion_ytd_pct.toFixed(1)}%`}
                    </td>
                    {dataAvailability.has_metas && (
                      <td className={cn('px-4 py-3.5 font-bold', !v.cumplimiento_pct ? 'text-zinc-600' : v.cumplimiento_pct >= 100 ? 'text-[#00B894]' : v.cumplimiento_pct >= 90 ? 'text-amber-400' : 'text-red-400')}>
                        {v.cumplimiento_pct !== undefined ? `${v.cumplimiento_pct.toFixed(1)}%` : '—'}
                      </td>
                    )}
                    {dataAvailability.has_metas && (
                      <td className="px-4 py-3.5 text-zinc-400 font-mono">
                        {v.proyeccion_cierre !== undefined ? v.proyeccion_cierre.toLocaleString() : '—'}
                      </td>
                    )}
                    {dataAvailability.has_metas && (
                      <td className={cn('px-4 py-3.5 font-mono', v.ritmo_necesario && v.ritmo_diario && v.ritmo_necesario > v.ritmo_diario ? 'text-amber-400' : 'text-zinc-400')}>
                        {v.ritmo_necesario !== undefined ? `${v.ritmo_necesario.toFixed(1)}` : '—'}
                      </td>
                    )}
                    {dataAvailability.has_venta_neta && (
                      <td className="px-4 py-3.5 text-zinc-400 text-right">
                        {v.ticket_promedio !== undefined ? `$${v.ticket_promedio.toFixed(2)}` : '—'}
                      </td>
                    )}
                    {dataAvailability.has_cliente && (
                      <td className="px-4 py-3.5 text-zinc-400 text-right">{v.clientes_activos ?? '—'}</td>
                    )}
                    <td className="px-4 py-3.5">
                      <span className={cn('px-2 py-1 rounded-md text-[10px] font-bold uppercase border', rConfig.class)}>
                        {rConfig.label}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {vendorInsights.length > 0 ? (
                        <span className={cn(
                          'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold',
                          critCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-400',
                        )}>
                          {vendorInsights.length}
                        </span>
                      ) : (
                        <span className="text-zinc-700">—</span>
                      )}
                    </td>
                  </tr>
                )
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={12} className="px-5 py-10 text-center text-zinc-600">
                    Sin vendedores que coincidan con los filtros
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && filtered.length < vendorAnalysis.length && (
          <p className="text-center text-xs text-zinc-600 py-2 border-t border-zinc-800">
            Mostrando {filtered.length} de {vendorAnalysis.length} vendedores
          </p>
        )}
      </div>
    </div>
  )
}
