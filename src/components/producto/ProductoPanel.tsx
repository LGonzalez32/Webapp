import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { salesInPeriod } from '../../lib/analysis'
import type { CategoriaInventario, SaleRecord, Insight } from '../../types'

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const mono = { fontFamily: "'DM Mono', monospace" }

const CLASI_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  riesgo_quiebre:   { label: 'Riesgo quiebre',   color: '#E24B4A', bg: '#E24B4A15' },
  baja_cobertura:   { label: 'Baja cobertura',    color: '#EF9F27', bg: '#EF9F2715' },
  normal:           { label: 'Normal',            color: '#1D9E75', bg: '#1D9E7515' },
  lento_movimiento: { label: 'Lento movimiento',  color: '#718096', bg: '#71809615' },
  sin_movimiento:   { label: 'Sin movimiento',    color: '#64748b', bg: '#64748b15' },
}

interface Props {
  producto: CategoriaInventario
  sales: SaleRecord[]
  selectedPeriod: { year: number; month: number }
  insights: Insight[]
  onClose: () => void
}

export default function ProductoPanel({ producto, sales, selectedPeriod, insights, onClose }: Props) {
  const navigate = useNavigate()
  const configuracion = useAppStore(s => s.configuracion)

  const clasi = CLASI_CONFIG[producto.clasificacion] ?? CLASI_CONFIG.normal

  // Trend 6 meses
  const trendData = useMemo(() => {
    const prodSales = sales.filter(s => s.producto === producto.producto)
    if (prodSales.length === 0) return []
    const { year, month } = selectedPeriod
    const buckets: { key: string; label: string; value: number }[] = []
    for (let i = 5; i >= 0; i--) {
      let m = month - i
      let y = year
      while (m < 0) { m += 12; y-- }
      const value = prodSales
        .filter(s => s.fecha.getFullYear() === y && s.fecha.getMonth() === m)
        .reduce((a, s) => a + s.unidades, 0)
      buckets.push({ key: `${y}-${m}`, label: MESES[m], value })
    }
    return buckets
  }, [producto.producto, sales, selectedPeriod])

  const avgTrend = trendData.length > 0
    ? trendData.reduce((a, d) => a + d.value, 0) / trendData.filter(d => d.value > 0).length || 0
    : 0

  // Top 3 vendedores
  const topVendedores = useMemo(() => {
    const periodSales = salesInPeriod(
      sales.filter(s => s.producto === producto.producto),
      selectedPeriod.year, selectedPeriod.month,
    )
    const agg: Record<string, number> = {}
    periodSales.forEach(s => { agg[s.vendedor] = (agg[s.vendedor] ?? 0) + s.unidades })
    const total = Object.values(agg).reduce((a, b) => a + b, 0)
    return Object.entries(agg)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([vendedor, uds]) => ({ vendedor, uds, pct: total > 0 ? (uds / total) * 100 : 0 }))
  }, [producto.producto, sales, selectedPeriod])

  // Top 3 clientes
  const topClientes = useMemo(() => {
    const periodSales = salesInPeriod(
      sales.filter(s => s.producto === producto.producto && s.cliente),
      selectedPeriod.year, selectedPeriod.month,
    )
    const agg: Record<string, number> = {}
    periodSales.forEach(s => { agg[s.cliente!] = (agg[s.cliente!] ?? 0) + s.unidades })
    const total = Object.values(agg).reduce((a, b) => a + b, 0)
    return Object.entries(agg)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3)
      .map(([cliente, uds]) => ({ cliente, uds, pct: total > 0 ? (uds / total) * 100 : 0 }))
  }, [producto.producto, sales, selectedPeriod])

  // Related alerts
  const relatedInsights = insights.filter(i =>
    i.producto === producto.producto ||
    i.descripcion.includes(producto.producto)
  )

  // Coverage bar
  const coverageDays = producto.pm3 > 0 ? producto.unidades_actuales / (producto.pm3 / 30) : 0
  const coverageColor = producto.clasificacion === 'riesgo_quiebre' ? '#E24B4A'
    : producto.clasificacion === 'baja_cobertura' ? '#EF9F27'
    : '#1D9E75'
  const coveragePct = Math.min((coverageDays / 90) * 100, 100) // 90 days = full bar

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes sf-panel-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}
      </style>

      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden shadow-2xl"
        style={{
          width: '100%', maxWidth: 440,
          background: 'var(--sf-page)',
          borderLeft: '1px solid var(--sf-border)',
          animation: 'sf-panel-in 300ms cubic-bezier(0.4,0,0.2,1) both',
        }}
      >
        {/* Header */}
        <div className="relative shrink-0" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--sf-border)' }}>
          {producto.categoria && (
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>
              {producto.categoria}
            </p>
          )}
          <h2 className="font-semibold truncate pr-8" style={{ fontSize: 20, color: 'var(--sf-t1)', lineHeight: 1.3 }}>
            {producto.producto}
          </h2>
          <span
            className="inline-flex mt-2 text-[11px] font-bold rounded"
            style={{ padding: '3px 8px', background: clasi.bg, color: clasi.color }}
          >
            {clasi.label}
          </span>
          <button
            onClick={onClose}
            className="absolute flex items-center justify-center transition-colors"
            style={{ top: 20, right: 20, color: 'var(--sf-t5)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t5)' }}
          >
            x
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* KPIs */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <div className="grid grid-cols-2 gap-4">
              <KpiCard label="STOCK ACTUAL" value={producto.unidades_actuales.toLocaleString()} unit="uds" />
              <KpiCard
                label="DÍAS INVENTARIO"
                value={producto.dias_inventario >= 9999 ? '∞' : String(producto.dias_inventario)}
                unit={producto.dias_inventario < 9999 ? 'días' : undefined}
                danger={producto.clasificacion === 'riesgo_quiebre'}
              />
              <KpiCard label="PM3" value={producto.pm3.toFixed(0)} unit="uds/mes" />
              <KpiCard
                label="ÚLT. MOVIMIENTO"
                value={producto.ultimo_movimiento
                  ? new Date(producto.ultimo_movimiento).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })
                  : '—'}
              />
            </div>
          </div>

          {/* Coverage bar */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
              COBERTURA
            </p>
            <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: 12 }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[13px] font-medium" style={{ color: 'var(--sf-t1)' }}>
                  Stock para {coverageDays < 1 ? '<1' : Math.round(coverageDays)} días
                </span>
                <span className="text-[11px] font-medium" style={{ color: coverageColor }}>
                  {producto.unidades_actuales} / {producto.pm3.toFixed(0)} PM3
                </span>
              </div>
              <div style={{ height: 6, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden' }}>
                <div style={{
                  height: '100%', width: `${coveragePct}%`,
                  background: coverageColor, borderRadius: 999,
                  transition: 'width 300ms ease',
                }} />
              </div>
            </div>
          </div>

          {/* Trend chart */}
          {trendData.some(d => d.value > 0) && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                TENDENCIA MENSUAL
              </p>
              <div className="flex items-end gap-2" style={{ height: 128 }}>
                {trendData.map(d => {
                  const maxVal = Math.max(...trendData.map(x => x.value), 1)
                  const h = Math.max((d.value / maxVal) * 100, 2)
                  const barColor = d.value >= avgTrend ? 'var(--sf-green)' : 'var(--sf-red)'
                  return (
                    <div key={d.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div className="flex items-end w-full justify-center" style={{ height: 96 }}>
                        <div className="rounded-t" style={{ width: '60%', maxWidth: 18, height: `${h}%`, background: d.value > 0 ? barColor : 'var(--sf-t6)' }} />
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--sf-t3)' }}>{fmtK(d.value)}</span>
                      <span className="text-[10px]" style={{ color: 'var(--sf-t5)' }}>{d.label}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Top vendedores */}
          {topVendedores.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                TOP VENDEDORES
              </p>
              <div className="space-y-2">
                {topVendedores.map((v, i) => (
                  <div key={v.vendedor} style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium truncate" style={{ color: 'var(--sf-t1)' }}>
                        <span className="text-[10px] mr-1.5" style={{ color: 'var(--sf-t5)' }}>#{i + 1}</span>
                        {v.vendedor}
                      </span>
                      <span style={{ ...mono, fontSize: 12, color: 'var(--sf-t2)' }}>
                        {v.uds.toLocaleString()} uds
                        <span className="ml-1 text-[10px]" style={{ color: 'var(--sf-t4)' }}>({v.pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 3, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${v.pct}%`, background: 'var(--sf-green)', borderRadius: 999, opacity: 0.6 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top clientes */}
          {topClientes.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                TOP CLIENTES
              </p>
              <div className="space-y-2">
                {topClientes.map((c, i) => (
                  <div key={c.cliente} style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: '10px 12px' }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[12px] font-medium truncate" style={{ color: 'var(--sf-t1)' }}>
                        <span className="text-[10px] mr-1.5" style={{ color: 'var(--sf-t5)' }}>#{i + 1}</span>
                        {c.cliente}
                      </span>
                      <span style={{ ...mono, fontSize: 12, color: 'var(--sf-t2)' }}>
                        {c.uds.toLocaleString()} uds
                        <span className="ml-1 text-[10px]" style={{ color: 'var(--sf-t4)' }}>({c.pct.toFixed(0)}%)</span>
                      </span>
                    </div>
                    <div style={{ height: 3, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${c.pct}%`, background: '#60A5FA', borderRadius: 999, opacity: 0.6 }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Related alerts */}
          {relatedInsights.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                ALERTAS ({relatedInsights.length})
              </p>
              <div className="space-y-2">
                {relatedInsights.map(ins => {
                  const borderColor = ins.prioridad === 'CRITICA' ? '#FF4D4D' : ins.prioridad === 'ALTA' ? '#FFB800' : '#60A5FA'
                  return (
                    <div key={ins.id} style={{ background: 'var(--sf-inset)', borderRadius: 8, borderLeft: `3px solid ${borderColor}`, padding: '10px 12px' }}>
                      <p className="text-[13px] font-medium" style={{ color: 'var(--sf-t1)' }}>{ins.titulo}</p>
                      <p className="text-[12px] leading-relaxed mt-1" style={{ color: 'var(--sf-t3)' }}>{ins.descripcion}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ height: 80 }} />
        </div>

        {/* Footer */}
        <div className="shrink-0" style={{ padding: '16px 24px', borderTop: '1px solid var(--sf-border)', background: 'var(--sf-page)' }}>
          <button
            className="w-full text-[13px] font-medium transition-all"
            style={{ background: '#00D68F15', border: '1px solid #00D68F40', color: 'var(--sf-green)', borderRadius: 8, padding: '12px', cursor: 'pointer' }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00D68F25'; e.currentTarget.style.borderColor = '#00D68F' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#00D68F15'; e.currentTarget.style.borderColor = '#00D68F40' }}
            onClick={() => {
              const prompt = [
                `Analizar producto: ${producto.producto}`,
                producto.categoria ? `Categoría: ${producto.categoria}` : '',
                `Stock: ${producto.unidades_actuales} uds`,
                `PM3: ${producto.pm3.toFixed(0)} uds/mes`,
                `Días inventario: ${producto.dias_inventario >= 9999 ? 'sin movimiento' : producto.dias_inventario}`,
                `Estado: ${clasi.label}`,
                '',
                'Analiza este producto: tendencia de ventas, quiénes lo venden, riesgo de quiebre o sobrestock, y qué acción tomar.',
              ].filter(Boolean).join('\n')
              navigate('/chat', { state: { prefill: prompt, displayPrefill: `Analizar: ${producto.producto}`, source: 'Rotación' } })
            }}
          >
            Analizar {producto.producto} con IA {'\u2192'}
          </button>
        </div>
      </div>
    </>
  )
}

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return String(n)
}

function KpiCard({ label, value, unit, danger }: { label: string; value: string; unit?: string; danger?: boolean }) {
  const valueColor = danger ? 'var(--sf-red)' : 'var(--sf-t1)'
  return (
    <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: 12 }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>{label}</p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: valueColor, lineHeight: 1 }}>
        {value}
        {unit && <span className="text-[11px] ml-1" style={{ color: 'var(--sf-t5)' }}>{unit}</span>}
      </p>
    </div>
  )
}
