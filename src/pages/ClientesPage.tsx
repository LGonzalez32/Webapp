import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { AlertTriangle, Clock, Users, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

function formatDays(d: number): string {
  if (d >= 30) return `${Math.floor(d / 30)}m ${d % 30}d`
  return `${d}d`
}

type SortKey = 'prioridad' | 'dias_sin_actividad' | 'valor_historico' | 'compras_historicas' | 'vendedor' | 'cliente'
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
  const {
    clientesDormidos,
    concentracionRiesgo,
    dataAvailability,
    configuracion,
  } = useAppStore()

  const [sortKey, setSortKey] = useState<SortKey>('prioridad')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [tab, setTab] = useState<'dormidos' | 'concentracion'>('dormidos')
  const [filterVendedor, setFilterVendedor] = useState<string>('all')

  const vendedores = useMemo(
    () => [...new Set(clientesDormidos.map(c => c.vendedor))].sort(),
    [clientesDormidos],
  )

  if (!dataAvailability.has_cliente) {
    navigate('/dashboard')
    return null
  }

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

  const filtered = filterVendedor === 'all'
    ? clientesDormidos
    : clientesDormidos.filter(c => c.vendedor === filterVendedor)

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
    if (sortKey === 'prioridad') return mul * (a.recovery_score - b.recovery_score)
    if (sortKey === 'dias_sin_actividad') return mul * (a.dias_sin_actividad - b.dias_sin_actividad)
    if (sortKey === 'valor_historico') return mul * (a.valor_historico - b.valor_historico)
    if (sortKey === 'compras_historicas') return mul * (a.compras_historicas - b.compras_historicas)
    if (sortKey === 'vendedor') return mul * a.vendedor.localeCompare(b.vendedor)
    return mul * a.cliente.localeCompare(b.cliente)
  })

  const totalValorEnRiesgo = clientesDormidos.reduce((a, c) => a + c.valor_historico, 0)
  const moneda = configuracion.moneda

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Análisis de Clientes</h1>
        <p className="text-zinc-500 mt-1">Clientes dormidos y concentración de riesgo</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Clientes Dormidos</p>
          <p className="text-3xl font-black text-red-400">{clientesDormidos.length}</p>
          <p className="text-[10px] text-zinc-600 mt-1">
            +{configuracion.dias_dormido_threshold}d sin comprar
          </p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Valor en Riesgo</p>
          <p className="text-2xl font-black text-zinc-50">
            {moneda} {totalValorEnRiesgo >= 1000
              ? `${(totalValorEnRiesgo / 1000).toFixed(1)}k`
              : totalValorEnRiesgo.toLocaleString(undefined, { maximumFractionDigits: 0 })}
          </p>
          <p className="text-[10px] text-zinc-600 mt-1">Facturación histórica</p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Concentración</p>
          <p className="text-3xl font-black text-orange-400">{concentracionRiesgo.length}</p>
          <p className="text-[10px] text-zinc-600 mt-1">
            Clientes &gt;{configuracion.pct_concentracion_threshold}% del total
          </p>
        </div>
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">Mayor Concentración</p>
          {concentracionRiesgo.length > 0 ? (
            <>
              <p className="text-2xl font-black text-orange-400">
                {concentracionRiesgo[0].pct_del_total.toFixed(1)}%
              </p>
              <p className="text-[10px] text-zinc-500 mt-1 truncate">
                {concentracionRiesgo[0].cliente}
              </p>
            </>
          ) : (
            <p className="text-2xl font-black text-zinc-600">—</p>
          )}
        </div>
      </div>

      {/* Tabs + filtro vendedor */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1">
          <button
            onClick={() => setTab('dormidos')}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-bold transition-all',
              tab === 'dormidos'
                ? 'bg-[#00B894] text-black'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <span className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Clientes Dormidos ({clientesDormidos.length})
            </span>
          </button>
          <button
            onClick={() => setTab('concentracion')}
            className={cn(
              'px-4 py-2 rounded-lg text-xs font-bold transition-all',
              tab === 'concentracion'
                ? 'bg-orange-500 text-black'
                : 'text-zinc-500 hover:text-zinc-300'
            )}
          >
            <span className="flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5" />
              Concentración ({concentracionRiesgo.length})
            </span>
          </button>
        </div>
        {tab === 'dormidos' && vendedores.length > 1 && (
          <select
            value={filterVendedor}
            onChange={e => setFilterVendedor(e.target.value)}
            className="px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-xs text-zinc-200 focus:outline-none focus:border-[#00B894]/50"
          >
            <option value="all">Todos los vendedores</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Clientes dormidos table */}
      {tab === 'dormidos' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">
                {filterVendedor === 'all' ? 'Sin clientes dormidos' : `Sin clientes dormidos para ${filterVendedor}`}
              </p>
              <p className="text-xs mt-1">Todos los clientes han comprado recientemente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {([
                      ['cliente', 'Cliente'],
                      ['vendedor', 'Vendedor'],
                      ['dias_sin_actividad', 'Inactivo'],
                      ['compras_historicas', 'Compras'],
                      ['valor_historico', 'Valor hist.'],
                      ['prioridad', 'Recuperación'],
                    ] as [SortKey, string][]).map(([k, label]) => (
                      <th
                        key={k}
                        onClick={() => handleSort(k)}
                        className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600 cursor-pointer hover:text-zinc-400 select-none"
                      >
                        <span className="flex items-center gap-1">
                          {label}
                          <SortIcon k={k} />
                        </span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const rc = RECOVERY_CONFIG[c.recovery_label]
                    return (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                        <td className="px-5 py-3">
                          <p className="font-bold text-zinc-200">{c.cliente}</p>
                          <p className="text-zinc-600 text-[10px] mt-0.5 max-w-[220px] truncate" title={c.recovery_explicacion}>
                            {c.recovery_explicacion}
                          </p>
                        </td>
                        <td className="px-5 py-3 text-zinc-400">{c.vendedor}</td>
                        <td className={cn(
                          'px-5 py-3 font-bold tabular-nums',
                          c.dias_sin_actividad >= 90 ? 'text-red-400' :
                            c.dias_sin_actividad >= 60 ? 'text-yellow-400' : 'text-zinc-400'
                        )}>
                          {formatDays(c.dias_sin_actividad)}
                        </td>
                        <td className="px-5 py-3 text-zinc-400 tabular-nums">{c.compras_historicas}</td>
                        <td className="px-5 py-3 text-zinc-300 font-medium tabular-nums">
                          {moneda} {c.valor_historico >= 1000
                            ? `${(c.valor_historico / 1000).toFixed(1)}k`
                            : c.valor_historico.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-5 py-3">
                          <div className="flex flex-col gap-1.5">
                            <span className={cn('px-2 py-0.5 rounded text-[10px] font-bold w-fit', rc.cls)}>
                              {rc.label}
                            </span>
                            <div className="w-20 h-1 bg-zinc-800 rounded-full overflow-hidden">
                              <div
                                className={cn('h-full rounded-full', c.recovery_score >= 70 ? 'bg-[#00B894]' : c.recovery_score >= 40 ? 'bg-blue-400' : c.recovery_score >= 20 ? 'bg-yellow-400' : 'bg-red-400')}
                                style={{ width: `${c.recovery_score}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-zinc-600 tabular-nums">{c.recovery_score}/100</span>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length !== clientesDormidos.length && (
                <p className="px-5 py-2 text-[10px] text-zinc-600 border-t border-zinc-800">
                  Mostrando {filtered.length} de {clientesDormidos.length} clientes dormidos
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Concentración table */}
      {tab === 'concentracion' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          {concentracionRiesgo.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <TrendingDown className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">Sin concentración crítica</p>
              <p className="text-xs mt-1">Ningún cliente supera el umbral configurado</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Cliente</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">% del Total</th>
                    <th className="text-right px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Ventas</th>
                    <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">Vendedores</th>
                  </tr>
                </thead>
                <tbody>
                  {concentracionRiesgo.map((c, i) => (
                    <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                      <td className="px-5 py-4">
                        <p className="font-bold text-zinc-200">{c.cliente}</p>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-3">
                          <div className="w-24 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-orange-500 rounded-full"
                              style={{ width: `${Math.min(c.pct_del_total, 100)}%` }}
                            />
                          </div>
                          <span className="font-black text-orange-400 min-w-[40px] text-right">
                            {c.pct_del_total.toFixed(1)}%
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right text-zinc-300 font-medium">
                        {moneda} {c.ventas_absolutas >= 1000
                          ? `${(c.ventas_absolutas / 1000).toFixed(1)}k`
                          : c.ventas_absolutas.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex flex-wrap gap-1">
                          {c.vendedores_involucrados.map((v) => (
                            <span key={v} className="px-2 py-0.5 bg-zinc-800 rounded text-zinc-400 font-medium text-[10px]">
                              {v}
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
