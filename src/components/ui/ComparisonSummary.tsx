import { useMemo } from 'react'
import { TrendingUp, X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { salesInPeriod } from '../../lib/analysis'
import type { SaleRecord, Insight } from '../../types'

const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

interface Props {
  sales: SaleRecord[]
  insights: Insight[]
  compPeriod: { year: number; month: number }
}

export default function ComparisonSummary({ sales, insights, compPeriod }: Props) {
  const selectedPeriod = useAppStore(s => s.selectedPeriod)
  const toggleComparison = useAppStore(s => s.toggleComparison)

  const summary = useMemo(() => {
    const currentSales = salesInPeriod(sales, selectedPeriod.year, selectedPeriod.month)
    const compSales = salesInPeriod(sales, compPeriod.year, compPeriod.month)

    const currentUnits = currentSales.reduce((s, r) => s + r.unidades, 0)
    const compUnits = compSales.reduce((s, r) => s + r.unidades, 0)
    const unitsPct = compUnits > 0 ? ((currentUnits - compUnits) / compUnits) * 100 : null

    const currentRevenue = currentSales.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
    const compRevenue = compSales.reduce((s, r) => s + (r.venta_neta ?? 0), 0)
    const revPct = compRevenue > 0 ? ((currentRevenue - compRevenue) / compRevenue) * 100 : null

    // Compute comparison insights: new vs resolved vs persisting
    // This is a simplified heuristic based on insight IDs
    const currentInsightIds = new Set(insights.map(i => i.id))

    const bullets: string[] = []

    if (unitsPct !== null) {
      const dir = unitsPct >= 0 ? 'subieron' : 'bajaron'
      bullets.push(`Ventas ${dir} ${Math.abs(unitsPct).toFixed(1)}% vs ${MESES_CORTO[compPeriod.month]} ${compPeriod.year}`)
    }

    if (revPct !== null && revPct !== unitsPct) {
      const dir = revPct >= 0 ? 'subió' : 'bajó'
      bullets.push(`Facturación ${dir} ${Math.abs(revPct).toFixed(1)}%`)
    }

    const currentVendedores = new Set(currentSales.map(s => s.vendedor))
    const compVendedores = new Set(compSales.map(s => s.vendedor))
    const newVendedores = [...currentVendedores].filter(v => !compVendedores.has(v))
    const lostVendedores = [...compVendedores].filter(v => !currentVendedores.has(v))
    if (newVendedores.length > 0) bullets.push(`${newVendedores.length} vendedor${newVendedores.length > 1 ? 'es' : ''} nuevo${newVendedores.length > 1 ? 's' : ''} este período`)
    if (lostVendedores.length > 0) bullets.push(`${lostVendedores.length} vendedor${lostVendedores.length > 1 ? 'es' : ''} sin actividad vs período anterior`)

    const alertCount = insights.length
    bullets.push(`${alertCount} alerta${alertCount !== 1 ? 's' : ''} activa${alertCount !== 1 ? 's' : ''} en el período actual`)

    return bullets
  }, [sales, insights, selectedPeriod, compPeriod])

  const compLabel = `${MESES_CORTO[compPeriod.month]} ${compPeriod.year}`
  const currentLabel = `${MESES_CORTO[selectedPeriod.month]} ${selectedPeriod.year}`

  return (
    <div
      className="rounded-xl p-4 mb-4 flex gap-3"
      style={{
        background: 'var(--sf-green-bg)',
        border: '1px solid var(--sf-green-border)',
        borderLeft: '3px solid var(--sf-green)',
      }}
    >
      <TrendingUp className="w-4 h-4 shrink-0 mt-0.5" style={{ color: 'var(--sf-green)' }} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-xs font-semibold" style={{ color: 'var(--sf-t1)' }}>
            Comparativa: {currentLabel} vs {compLabel}
          </p>
          <button onClick={toggleComparison} className="p-0.5 rounded transition-colors" style={{ color: 'var(--sf-t5)' }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
        <ul className="space-y-0.5">
          {summary.map((bullet, i) => (
            <li key={i} className="text-xs" style={{ color: 'var(--sf-t3)' }}>
              • {bullet}
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
