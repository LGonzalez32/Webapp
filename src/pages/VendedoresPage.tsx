import { useState } from 'react'
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

export default function VendedoresPage() {
  useAnalysis()
  const { vendorAnalysis, insights, dataAvailability, isProcessed, sales, selectedPeriod } = useAppStore()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<VendorAnalysis | null>(null)

  if (sales.length === 0) { navigate('/'); return null }
  if (!isProcessed) return <div className="flex items-center justify-center h-64 text-zinc-500">Calculando...</div>

  const sorted = [...vendorAnalysis].sort((a, b) => {
    const order = { critico: 0, riesgo: 1, ok: 2, superando: 3 }
    return order[a.riesgo] - order[b.riesgo]
  })

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
            onClose={() => setSelected(null)}
          />
        </>
      )}

      <div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Vendedores</h1>
        <p className="text-zinc-500 mt-1">Click en una fila para ver alertas y métricas detalladas.</p>
      </div>

      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Vendedor</th>
                <th className="px-4 py-3">Ventas</th>
                <th className="px-4 py-3">Variación</th>
                {dataAvailability.has_metas && <th className="px-4 py-3">% Meta</th>}
                {dataAvailability.has_metas && <th className="px-4 py-3">Proyección</th>}
                {dataAvailability.has_metas && <th className="px-4 py-3">Ritmo nec.</th>}
                {dataAvailability.has_venta_neta && <th className="px-4 py-3">Ticket prom.</th>}
                {dataAvailability.has_cliente && <th className="px-4 py-3">Clientes</th>}
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3 text-right">Alertas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map((v) => {
                const rConfig = RIESGO_CONFIG[v.riesgo]
                const vendorInsights = insights.filter((i) => i.vendedor === v.vendedor)
                const critCount = vendorInsights.filter((i) => i.prioridad === 'CRITICA').length
                return (
                  <tr
                    key={v.vendedor}
                    onClick={() => setSelected(v)}
                    className="hover:bg-zinc-900/40 cursor-pointer transition-colors group"
                  >
                    <td className="px-5 py-3.5 font-bold text-zinc-200 group-hover:text-white">{v.vendedor}</td>
                    <td className="px-4 py-3.5 text-zinc-300 font-mono">{v.ventas_periodo.toLocaleString()}</td>
                    <td className={cn('px-4 py-3.5 font-bold', v.variacion_pct === null ? 'text-zinc-600' : v.variacion_pct >= 0 ? 'text-[#00B894]' : 'text-red-400')}>
                      {v.variacion_pct === null ? '—' : `${v.variacion_pct >= 0 ? '+' : ''}${v.variacion_pct.toFixed(1)}%`}
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
                      <td className="px-4 py-3.5 text-zinc-400">
                        {v.ticket_promedio !== undefined ? `$${v.ticket_promedio.toFixed(2)}` : '—'}
                      </td>
                    )}
                    {dataAvailability.has_cliente && (
                      <td className="px-4 py-3.5 text-zinc-400">{v.clientes_activos ?? '—'}</td>
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
                          critCount > 0 ? 'bg-red-500/20 text-red-400' : 'bg-zinc-800 text-zinc-400'
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
