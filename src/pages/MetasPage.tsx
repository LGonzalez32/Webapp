import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { salesInPeriod, periodKey } from '../lib/analysis'
import { Target, TrendingUp, TrendingDown } from 'lucide-react'
import { cn } from '../lib/utils'

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function CumplimientoBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-600 text-[10px]">—</span>
  const color =
    pct >= 100 ? 'text-[#00B894] bg-[#00B894]/10' :
      pct >= 80 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-black', color)}>
      {pct.toFixed(0)}%
    </span>
  )
}

export default function MetasPage() {
  useAnalysis()
  const navigate = useNavigate()
  const { sales, metas, dataAvailability, selectedPeriod, configuracion, vendorAnalysis } = useAppStore()

  if (!dataAvailability.has_metas) {
    navigate('/dashboard')
    return null
  }

  const currentYear = selectedPeriod.year
  const currentMonth = selectedPeriod.month
  const moneda = configuracion.moneda

  // All vendors from metas
  const vendors = useMemo(() => {
    const s = new Set(metas.map((m) => m.vendedor))
    return Array.from(s).sort()
  }, [metas])

  // Last 6 months (inclusive of current)
  const histMonths = useMemo(() => {
    const months: { year: number; month: number; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i
      let y = currentYear
      while (m < 0) { m += 12; y-- }
      months.push({ year: y, month: m, label: `${MESES_SHORT[m]} ${y !== currentYear ? y : ''}`.trim() })
    }
    return months
  }, [currentYear, currentMonth])

  // Build data matrix: vendor × month
  const matrix = useMemo(() => {
    return vendors.map((vendor) => {
      const va = vendorAnalysis.find((v) => v.vendedor === vendor)
      const monthData = histMonths.map(({ year, month }) => {
        const key = periodKey(year, month)
        const metaRow = metas.find((m) => m.vendedor === vendor && m.anio === year && m.mes === month + 1)
        const metaVal = metaRow?.meta ?? null
        const ventasSales = salesInPeriod(sales, year, month).filter((s) => s.vendedor === vendor)
        const realVal = ventasSales.reduce((a, s) => a + s.unidades, 0)
        const pct = metaVal && metaVal > 0 ? (realVal / metaVal) * 100 : null
        const isCurrent = year === currentYear && month === currentMonth
        return { key, metaVal, realVal, pct, isCurrent }
      })

      return { vendor, va, monthData }
    })
  }, [vendors, histMonths, metas, sales, vendorAnalysis, currentYear, currentMonth])

  // Team totals for current month
  const teamMeta = metas
    .filter((m) => m.anio === currentYear && m.mes === currentMonth + 1)
    .reduce((a, m) => a + m.meta, 0)

  const teamReal = salesInPeriod(sales, currentYear, currentMonth)
    .reduce((a, s) => a + s.unidades, 0)

  const teamPct = teamMeta > 0 ? (teamReal / teamMeta) * 100 : null

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Metas de Ventas</h1>
          <p className="text-zinc-500 mt-1">Progreso vs objetivo por vendedor</p>
        </div>
        <div className="flex items-center gap-1.5 text-sm text-zinc-400">
          <Target className="w-4 h-4 text-[#00B894]" />
          <span>{MESES_SHORT[currentMonth]} {currentYear}</span>
        </div>
      </div>

      {/* Team progress card */}
      <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-1">
              Progreso del Equipo — {MESES_SHORT[currentMonth]}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-3xl font-black text-zinc-50">
                {teamReal.toLocaleString()}
              </span>
              <span className="text-zinc-600 text-lg">/</span>
              <span className="text-xl font-bold text-zinc-500">
                {teamMeta.toLocaleString()}
              </span>
              {teamPct !== null && (
                <span className={cn(
                  'text-2xl font-black',
                  teamPct >= 100 ? 'text-[#00B894]' : teamPct >= 80 ? 'text-yellow-400' : 'text-red-400'
                )}>
                  {teamPct.toFixed(1)}%
                </span>
              )}
            </div>
          </div>
          {teamPct !== null && (
            <div className="flex items-center gap-2 text-sm">
              {teamPct >= 100
                ? <TrendingUp className="w-5 h-5 text-[#00B894]" />
                : <TrendingDown className="w-5 h-5 text-red-400" />}
              <span className={teamPct >= 100 ? 'text-[#00B894] font-bold' : 'text-red-400 font-bold'}>
                {teamPct >= 100 ? 'Meta alcanzada' : `Faltan ${(teamMeta - teamReal).toLocaleString()} uds`}
              </span>
            </div>
          )}
        </div>
        {/* Progress bar */}
        <div className="h-3 bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={cn(
              'h-full rounded-full transition-all duration-700',
              (teamPct ?? 0) >= 100 ? 'bg-[#00B894]' :
                (teamPct ?? 0) >= 80 ? 'bg-yellow-400' : 'bg-red-400'
            )}
            style={{ width: `${Math.min(teamPct ?? 0, 100)}%` }}
          />
        </div>
      </div>

      {/* Current month — individual progress */}
      <div className="space-y-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          Cumplimiento individual — {MESES_SHORT[currentMonth]}
        </p>
        {matrix.map(({ vendor, va, monthData }) => {
          const curr = monthData[monthData.length - 1]
          const pct = curr.pct
          const riesgo = va?.riesgo ?? 'ok'

          return (
            <div key={vendor} className="bg-zinc-900/40 border border-zinc-800 rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      'w-2 h-2 rounded-full shrink-0',
                      riesgo === 'critico' ? 'bg-red-500' :
                        riesgo === 'riesgo' ? 'bg-yellow-500' :
                          riesgo === 'superando' ? 'bg-[#00B894]' : 'bg-zinc-500'
                    )}
                  />
                  <span className="font-bold text-zinc-200 text-sm">{vendor}</span>
                </div>
                <div className="flex items-center gap-4 text-xs">
                  <span className="text-zinc-500">
                    {curr.realVal.toLocaleString()} / {curr.metaVal?.toLocaleString() ?? '—'} uds
                  </span>
                  <CumplimientoBadge pct={pct} />
                </div>
              </div>
              <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all duration-700',
                    (pct ?? 0) >= 100 ? 'bg-[#00B894]' :
                      (pct ?? 0) >= 80 ? 'bg-yellow-400' : 'bg-red-400'
                  )}
                  style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Historical table — last 6 months */}
      <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800">
          <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
            Histórico de cumplimiento — últimos 6 meses
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800">
                <th className="text-left px-5 py-3 text-[10px] font-bold uppercase tracking-widest text-zinc-600">
                  Vendedor
                </th>
                {histMonths.map(({ label, year, month }) => (
                  <th
                    key={`${year}-${month}`}
                    className={cn(
                      'text-center px-4 py-3 text-[10px] font-bold uppercase tracking-widest',
                      year === currentYear && month === currentMonth
                        ? 'text-[#00B894]'
                        : 'text-zinc-600'
                    )}
                  >
                    {label}
                    {year === currentYear && month === currentMonth && (
                      <span className="ml-1 text-[8px] opacity-60">●</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ vendor, monthData }) => (
                <tr key={vendor} className="border-b border-zinc-800/50 hover:bg-zinc-900/50 transition-colors">
                  <td className="px-5 py-3 font-bold text-zinc-300">{vendor}</td>
                  {monthData.map((m, i) => (
                    <td key={i} className={cn('px-4 py-3 text-center', m.isCurrent ? 'bg-[#00B894]/5' : '')}>
                      {m.metaVal === null ? (
                        <span className="text-zinc-700">—</span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <CumplimientoBadge pct={m.pct} />
                          <span className="text-[9px] text-zinc-700">
                            {m.realVal.toLocaleString()}
                          </span>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Team totals row */}
              <tr className="border-t border-zinc-700 bg-zinc-900/60">
                <td className="px-5 py-3 font-black text-zinc-400 text-[10px] uppercase tracking-wider">
                  Equipo
                </td>
                {histMonths.map(({ year, month }) => {
                  const key = periodKey(year, month)
                  const metaTot = metas.filter((m) => m.anio === year && m.mes === month + 1).reduce((a, m) => a + m.meta, 0)
                  const realTot = salesInPeriod(sales, year, month).reduce((a, s) => a + s.unidades, 0)
                  const pct = metaTot > 0 ? (realTot / metaTot) * 100 : null
                  const isCurr = year === currentYear && month === currentMonth
                  return (
                    <td key={key} className={cn('px-4 py-3 text-center', isCurr ? 'bg-[#00B894]/5' : '')}>
                      <CumplimientoBadge pct={pct} />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
