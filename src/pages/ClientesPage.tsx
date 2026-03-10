import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { AlertTriangle, Clock, Users, TrendingDown, ChevronUp, ChevronDown } from 'lucide-react'
import { cn } from '../lib/utils'

function formatDays(d: number): string {
  if (d >= 30) return `${Math.floor(d / 30)}m ${d % 30}d`
  return `${d}d`
}

type SortKey = 'dias_sin_actividad' | 'valor_historico' | 'compras_historicas' | 'vendedor' | 'cliente'
type SortDir = 'asc' | 'desc'

export default function ClientesPage() {
  useAnalysis()
  const navigate = useNavigate()
  const {
    clientesDormidos,
    concentracionRiesgo,
    dataAvailability,
    configuracion,
    isProcessed,
  } = useAppStore()

  const [sortKey, setSortKey] = useState<SortKey>('dias_sin_actividad')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [tab, setTab] = useState<'dormidos' | 'concentracion'>('dormidos')

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

  const sorted = [...clientesDormidos].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
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

      {/* Tabs */}
      <div className="flex gap-1 bg-zinc-900/50 border border-zinc-800 rounded-xl p-1 w-fit">
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

      {/* Clientes dormidos table */}
      {tab === 'dormidos' && (
        <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-zinc-600">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">Sin clientes dormidos</p>
              <p className="text-xs mt-1">Todos tus clientes han comprado recientemente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-zinc-800">
                    {([
                      ['cliente', 'Cliente'],
                      ['vendedor', 'Vendedor'],
                      ['dias_sin_actividad', 'Días inactivo'],
                      ['compras_historicas', 'Compras hist.'],
                      ['valor_historico', 'Valor hist.'],
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
                    <th className="px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                      Riesgo
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const riskLevel =
                      c.dias_sin_actividad >= 90 ? 'alto' :
                        c.dias_sin_actividad >= 60 ? 'medio' : 'bajo'
                    return (
                      <tr key={i} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                        <td className="px-5 py-3 font-bold text-zinc-200">{c.cliente}</td>
                        <td className="px-5 py-3 text-zinc-400">{c.vendedor}</td>
                        <td className={cn(
                          'px-5 py-3 font-bold',
                          riskLevel === 'alto' ? 'text-red-400' :
                            riskLevel === 'medio' ? 'text-yellow-400' : 'text-zinc-400'
                        )}>
                          {formatDays(c.dias_sin_actividad)}
                        </td>
                        <td className="px-5 py-3 text-zinc-400">{c.compras_historicas}</td>
                        <td className="px-5 py-3 text-zinc-300 font-medium">
                          {moneda} {c.valor_historico >= 1000
                            ? `${(c.valor_historico / 1000).toFixed(1)}k`
                            : c.valor_historico.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td className="px-5 py-3">
                          <span className={cn(
                            'px-2 py-1 rounded text-[10px] font-bold uppercase',
                            riskLevel === 'alto'
                              ? 'bg-red-500/10 text-red-400'
                              : riskLevel === 'medio'
                                ? 'bg-yellow-500/10 text-yellow-400'
                                : 'bg-zinc-700/50 text-zinc-500'
                          )}>
                            {riskLevel === 'alto' ? 'Crítico' : riskLevel === 'medio' ? 'Medio' : 'Bajo'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
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
