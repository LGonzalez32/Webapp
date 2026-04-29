import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../../lib/useDemoPath'
import { salesInPeriod, salesInRange, prevPeriod } from '../../lib/analysis'
import { formatPeriodLabel } from '../../lib/periods'
import { useAppStore } from '../../store/appStore'
import type { SaleRecord, ClienteDormido, DataAvailability, Insight } from '../../types'

// ─── Constantes ──────────────────────────────────────────────────────────────

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']
const mono = { fontFamily: "'DM Mono', monospace" }

type ClienteStatus = 'activo' | 'dormido' | 'en_declive'

interface Props {
  clienteName: string
  sales: SaleRecord[]
  selectedPeriod: { year: number; monthStart: number; monthEnd: number }
  clientesDormidos: ClienteDormido[]
  dataAvailability: DataAvailability
  insights: Insight[]
  onClose: () => void
}

// ─── Componente principal ────────────────────────────────────────────────────

export default function ClientePanel({
  clienteName,
  sales,
  selectedPeriod,
  clientesDormidos,
  dataAvailability,
  insights,
  onClose,
}: Props) {
  const navigate = useNavigate()
  const dp = useDemoPath()
  const configuracion = useAppStore(s => s.configuracion)
  const moneda = configuracion.moneda
  const hasVenta = dataAvailability.has_venta_neta

  const dormido = clientesDormidos.find(d => d.cliente === clienteName) ?? null

  // ── Métricas del cliente ─────────────────────────────────────────────────
  const metrics = useMemo(() => {
    const { year, monthStart, monthEnd } = selectedPeriod
    const month = monthEnd // alias temporal Ticket 2.4.1a — fix YoY en 2.4.1b
    const prev = prevPeriod(year, month)
    const clientSales = sales.filter(s => s.cliente === clienteName)
    if (clientSales.length === 0) return null

    // Ventas período actual (rango [monthStart..monthEnd]) vs período previo
    // (semántica sequential legacy preservada en este commit; YoY fix en 2.4.1b)
    const periodSales = salesInRange(clientSales, year, monthStart, monthEnd)
    const prevSales = salesInPeriod(clientSales, prev.year, prev.month)
    const ventasPeriodo = periodSales.reduce((a, s) => a + s.unidades, 0)
    const ventasPrev = prevSales.reduce((a, s) => a + s.unidades, 0)
    const ventaNetaPeriodo = periodSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const ventaNetaPrev = prevSales.reduce((a, s) => a + (s.venta_neta ?? 0), 0)

    // YTD actual vs anterior — anclado a monthEnd (último mes del rango)
    const ytdCur = clientSales.filter(r => r.fecha.getFullYear() === year && r.fecha.getMonth() <= monthEnd)
    const ytdPrev = clientSales.filter(r => r.fecha.getFullYear() === year - 1 && r.fecha.getMonth() <= monthEnd)
    const ytdUnidades = ytdCur.reduce((a, s) => a + s.unidades, 0)
    const ytdUnidadesPrev = ytdPrev.reduce((a, s) => a + s.unidades, 0)
    const ytdNeto = ytdCur.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const ytdNetoPrev = ytdPrev.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
    const ytdVarPct = ytdUnidadesPrev > 0 ? ((ytdUnidades - ytdUnidadesPrev) / ytdUnidadesPrev) * 100 : null

    // Ticket promedio
    const ticketPromedio = hasVenta && periodSales.length > 0
      ? ventaNetaPeriodo / periodSales.length
      : null

    // Canal principal
    const canalCount: Record<string, number> = {}
    periodSales.filter(s => s.canal).forEach(s => {
      canalCount[s.canal!] = (canalCount[s.canal!] ?? 0) + 1
    })
    const canalPrincipal = Object.entries(canalCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? null

    // Vendedor asignado (más frecuente)
    const vendedorCount: Record<string, number> = {}
    clientSales.forEach(s => { vendedorCount[s.vendedor] = (vendedorCount[s.vendedor] ?? 0) + 1 })
    const vendedorPrincipal = Object.entries(vendedorCount).sort(([, a], [, b]) => b - a)[0]?.[0] ?? '—'

    // Frecuencia de compra (promedio de días entre compras últimos 6 meses)
    const sortedDates = [...new Set(clientSales.map(s => s.fecha.getTime()))].sort()
    let frecuenciaDias: number | null = null
    if (sortedDates.length >= 2) {
      const gaps: number[] = []
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((sortedDates[i] - sortedDates[i - 1]) / 86400000)
      }
      frecuenciaDias = Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)
    }

    // Días inactivo
    const fechaRef = new Date(Math.max(...sales.map(r => r.fecha.getTime())))
    const ultimaCompra = new Date(Math.max(...clientSales.map(s => s.fecha.getTime())))
    const diasInactivo = Math.round((fechaRef.getTime() - ultimaCompra.getTime()) / 86400000)

    // Valor histórico total
    const valorHistorico = clientSales.reduce((a, s) => a + (s.venta_neta ?? s.unidades), 0)
    const comprasTotal = clientSales.reduce((a, s) => a + s.unidades, 0)

    return {
      vendedorPrincipal,
      ventasPeriodo, ventasPrev, ventaNetaPeriodo, ventaNetaPrev,
      ytdUnidades, ytdUnidadesPrev, ytdNeto, ytdNetoPrev, ytdVarPct,
      ticketPromedio, canalPrincipal,
      frecuenciaDias, diasInactivo,
      valorHistorico, comprasTotal,
      ultimaCompra,
    }
  }, [clienteName, sales, selectedPeriod, hasVenta])

  // ── Status del cliente ───────────────────────────────────────────────────
  const status: ClienteStatus = useMemo(() => {
    if (dormido) return 'dormido'
    if (metrics && metrics.ytdVarPct !== null && metrics.ytdVarPct < -20) return 'en_declive'
    return 'activo'
  }, [dormido, metrics])

  const STATUS_CONFIG: Record<ClienteStatus, { label: string; color: string; bg: string }> = {
    activo:     { label: 'ACTIVO',     color: 'var(--sf-green)', bg: '#00D68F15' },
    dormido:    { label: 'DORMIDO',    color: '#FF4D4D',         bg: '#FF4D4D15' },
    en_declive: { label: 'EN DECLIVE', color: '#FFB800',         bg: '#FFB80015' },
  }

  // ── Tendencia 6 meses ────────────────────────────────────────────────────
  const trendData = useMemo(() => {
    const clientSales = sales.filter(s => s.cliente === clienteName)
    if (clientSales.length === 0) return []
    // Tendencia 6 meses: el ancla del bucket más reciente es monthEnd (B1).
    const { year, monthEnd } = selectedPeriod
    const buckets: { key: string; label: string; current: number; prev: number }[] = []
    for (let i = 5; i >= 0; i--) {
      let m = monthEnd - i
      let y = year
      while (m < 0) { m += 12; y-- }
      const label = MESES[m]
      const key = `${y}-${String(m).padStart(2, '0')}`
      const current = clientSales
        .filter(s => s.fecha.getFullYear() === y && s.fecha.getMonth() === m)
        .reduce((a, s) => a + s.unidades, 0)
      const prev2 = clientSales
        .filter(s => s.fecha.getFullYear() === y - 1 && s.fecha.getMonth() === m)
        .reduce((a, s) => a + s.unidades, 0)
      if (current > 0 || prev2 > 0) buckets.push({ key, label, current, prev: prev2 })
    }
    return buckets
  }, [clienteName, sales, selectedPeriod])

  // ── Top 5 productos ──────────────────────────────────────────────────────
  const topProductos = useMemo(() => {
    const { year, monthStart, monthEnd } = selectedPeriod
    const periodSales = salesInRange(
      sales.filter(s => s.cliente === clienteName && s.producto),
      year, monthStart, monthEnd,
    )
    const agg: Record<string, { unidades: number; venta: number }> = {}
    periodSales.forEach(s => {
      const k = s.producto!
      const e = agg[k] ?? { unidades: 0, venta: 0 }
      agg[k] = { unidades: e.unidades + s.unidades, venta: e.venta + (s.venta_neta ?? 0) }
    })
    return Object.entries(agg)
      .sort(([, a], [, b]) => (hasVenta ? b.venta - a.venta : b.unidades - a.unidades))
      .slice(0, 5)
      .map(([producto, v]) => ({ producto, ...v }))
  }, [clienteName, sales, selectedPeriod, hasVenta])

  // ── Alertas del cliente ──────────────────────────────────────────────────
  const clienteInsights = insights.filter(i => i.cliente === clienteName)

  const mesLabel = formatPeriodLabel(selectedPeriod.year, selectedPeriod.monthStart, selectedPeriod.monthEnd)
  const sCfg = STATUS_CONFIG[status]

  if (!metrics) {
    return (
      <>
        <style>{`@keyframes sf-panel-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
        <div
          className="fixed inset-y-0 right-0 z-50 flex flex-col items-center justify-center shadow-2xl"
          style={{ width: '100%', maxWidth: 440, background: 'var(--sf-page)', borderLeft: '1px solid var(--sf-border)', animation: 'sf-panel-in 300ms cubic-bezier(0.4,0,0.2,1) both' }}
        >
          <p className="text-sm" style={{ color: 'var(--sf-t4)' }}>Sin datos para {clienteName}</p>
          <button onClick={onClose} className="mt-4 text-xs underline" style={{ color: 'var(--sf-t5)', cursor: 'pointer' }}>Cerrar</button>
        </div>
      </>
    )
  }

  const varPeriodo = metrics.ventasPrev > 0
    ? ((metrics.ventasPeriodo - metrics.ventasPrev) / metrics.ventasPrev) * 100
    : null
  const varColor = varPeriodo !== null ? (varPeriodo >= 0 ? 'var(--sf-green)' : 'var(--sf-red)') : 'var(--sf-t5)'

  return (
    <>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400;500&display=swap');
        @keyframes sf-panel-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}
      </style>

      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden shadow-2xl"
        style={{
          width: '100%',
          maxWidth: 440,
          background: 'var(--sf-page)',
          borderLeft: '1px solid var(--sf-border)',
          animation: 'sf-panel-in 300ms cubic-bezier(0.4,0,0.2,1) both',
        }}
      >
        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="relative shrink-0" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--sf-border)' }}>
          <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>
            VENDEDOR: {metrics.vendedorPrincipal}
          </p>
          <h2
            className="font-semibold truncate pr-8"
            style={{ fontSize: 20, color: 'var(--sf-t1)', lineHeight: 1.3 }}
          >
            {clienteName}
          </h2>
          <span
            className="inline-flex mt-2 text-[11px] font-bold rounded"
            style={{ padding: '3px 8px', background: sCfg.bg, color: sCfg.color }}
          >
            {sCfg.label}
          </span>
          {dormido && (
            <span
              className="inline-flex mt-2 ml-2 text-[11px] font-medium rounded"
              style={{ padding: '3px 8px', background: 'var(--sf-inset)', color: 'var(--sf-t4)' }}
            >
              {dormido.recovery_score}/100 recuper.
            </span>
          )}
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

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">

          {/* ── KPIs Principales ────────────────────────────────────────── */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>
                  COMPRAS {mesLabel}
                </p>
                <p style={{ ...mono, fontSize: 32, color: 'var(--sf-t1)', lineHeight: 1 }}>
                  {metrics.ventasPeriodo.toLocaleString()}
                </p>
                {varPeriodo !== null && (
                  <p className="text-xs mt-1" style={{ color: varColor }}>
                    {varPeriodo >= 0 ? '+' : ''}{varPeriodo.toFixed(1)}% vs {selectedPeriod.year - 1}
                  </p>
                )}
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>
                  YTD {selectedPeriod.year}
                </p>
                <p style={{ ...mono, fontSize: 32, color: 'var(--sf-t1)', lineHeight: 1 }}>
                  {metrics.ytdUnidades.toLocaleString()}
                </p>
                {metrics.ytdVarPct !== null && (
                  <p className="text-xs mt-1" style={{ color: metrics.ytdVarPct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)' }}>
                    {metrics.ytdVarPct >= 0 ? '+' : ''}{metrics.ytdVarPct.toFixed(1)}% vs {selectedPeriod.year - 1}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* ── KPIs Secundarios ────────────────────────────────────────── */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <div className="grid grid-cols-2 gap-2">
              {hasVenta && metrics.ticketPromedio !== null && metrics.ticketPromedio > 0 && (
                <KpiCard label="TICKET PROMEDIO" value={`${moneda}${metrics.ticketPromedio.toFixed(0)}`} />
              )}
              {metrics.canalPrincipal && (
                <KpiCard label="CANAL" value={metrics.canalPrincipal} />
              )}
              {metrics.frecuenciaDias !== null && (
                <KpiCard label="FRECUENCIA" value={`${metrics.frecuenciaDias}`} unit="días" />
              )}
              <KpiCard
                label="INACTIVO"
                value={`${metrics.diasInactivo}`}
                unit="días"
                danger={metrics.diasInactivo > (configuracion.dias_dormido_threshold ?? 60)}
              />
              {hasVenta && (
                <KpiCard label="VALOR HISTÓRICO" value={`${moneda}${fmtK(metrics.valorHistorico)}`} />
              )}
              <KpiCard label="COMPRAS TOTAL" value={metrics.comprasTotal.toLocaleString()} unit="uds" />
              {metrics.ytdUnidadesPrev > 0 && (
                <KpiCard label={`YTD ${selectedPeriod.year - 1}`} value={metrics.ytdUnidadesPrev.toLocaleString()} unit="uds" muted />
              )}
              {hasVenta && metrics.ytdNeto > 0 && (
                <KpiCard label={`NETO YTD ${selectedPeriod.year}`} value={`${moneda}${fmtK(metrics.ytdNeto)}`} />
              )}
            </div>
          </div>

          {/* ── Dormido info ────────────────────────────────────────────── */}
          {dormido && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                RECUPERABILIDAD
              </p>
              <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: 12 }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[13px] font-medium" style={{ color: 'var(--sf-t1)' }}>
                    Score: {dormido.recovery_score}/100
                  </span>
                  <span
                    className="text-[10px] font-bold rounded px-2 py-0.5"
                    style={{
                      background: dormido.recovery_score > 60 ? '#00D68F15' : dormido.recovery_score > 40 ? '#FFB80015' : '#FF4D4D15',
                      color: dormido.recovery_score > 60 ? 'var(--sf-green)' : dormido.recovery_score > 40 ? '#FFB800' : '#FF4D4D',
                    }}
                  >
                    {dormido.recovery_label.toUpperCase()}
                  </span>
                </div>
                <div style={{ height: 4, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden', marginBottom: 8 }}>
                  <div style={{
                    height: '100%',
                    width: `${dormido.recovery_score}%`,
                    background: dormido.recovery_score > 60 ? 'var(--sf-green)' : dormido.recovery_score > 40 ? '#FFB800' : '#FF4D4D',
                    borderRadius: 999,
                  }} />
                </div>
                <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
                  {dormido.recovery_explicacion}
                </p>
              </div>
            </div>
          )}

          {/* ── Tendencia 6 meses ───────────────────────────────────────── */}
          {trendData.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                Tendencia mensual
              </p>
              <div className="flex items-end gap-2" style={{ height: 128 }}>
                {trendData.map(d => {
                  const maxVal = Math.max(...trendData.flatMap(x => [x.current, x.prev]), 1)
                  const hCurr = Math.max((d.current / maxVal) * 100, 2)
                  const hPrev = d.prev > 0 ? Math.max((d.prev / maxVal) * 100, 2) : 0
                  const barColor = d.prev > 0 && d.current < d.prev ? 'var(--sf-red)' : 'var(--sf-green)'
                  return (
                    <div key={d.key} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                      <div className="flex items-end gap-0.5 w-full justify-center" style={{ height: 96 }}>
                        {hPrev > 0 && (
                          <div className="rounded-t" style={{ width: '35%', maxWidth: 14, height: `${hPrev}%`, background: 'var(--sf-t6)', opacity: 0.3 }} />
                        )}
                        <div className="rounded-t" style={{ width: hPrev > 0 ? '45%' : '60%', maxWidth: 18, height: `${hCurr}%`, background: barColor }} />
                      </div>
                      <span className="text-[10px] font-medium" style={{ color: 'var(--sf-t3)' }}>{fmtK(d.current)}</span>
                      <span className="text-[10px]" style={{ color: 'var(--sf-t5)' }}>{d.label}</span>
                    </div>
                  )
                })}
              </div>
              {trendData.some(d => d.prev > 0) && (
                <div className="flex items-center gap-3 mt-2 justify-center">
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--sf-t5)' }}>
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--sf-green)' }} /> actual
                  </span>
                  <span className="flex items-center gap-1 text-[10px]" style={{ color: 'var(--sf-t5)' }}>
                    <span className="inline-block w-2 h-2 rounded-sm" style={{ background: 'var(--sf-t6)', opacity: 0.3 }} /> año anterior
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ── Top 5 Productos ─────────────────────────────────────────── */}
          {topProductos.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                TOP PRODUCTOS ({mesLabel})
              </p>
              <div className="space-y-2">
                {topProductos.map((p, i) => {
                  const maxUds = topProductos[0].unidades
                  const pct = maxUds > 0 ? (p.unidades / maxUds) * 100 : 0
                  return (
                    <div key={p.producto} style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: '10px 12px' }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-medium truncate" style={{ color: 'var(--sf-t1)', maxWidth: '60%' }}>
                          <span className="text-[10px] mr-1.5" style={{ color: 'var(--sf-t5)' }}>#{i + 1}</span>
                          {p.producto}
                        </span>
                        <span style={{ ...mono, fontSize: 12, color: 'var(--sf-t2)' }}>
                          {p.unidades.toLocaleString()} uds
                          {hasVenta && p.venta > 0 && (
                            <span className="ml-1.5 text-[11px]" style={{ color: 'var(--sf-t4)' }}>
                              ({moneda}{fmtK(p.venta)})
                            </span>
                          )}
                        </span>
                      </div>
                      <div style={{ height: 3, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: 'var(--sf-green)', borderRadius: 999, opacity: 0.6 }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Alertas ─────────────────────────────────────────────────── */}
          {clienteInsights.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                ALERTAS ({clienteInsights.length})
              </p>
              <div className="space-y-2">
                {clienteInsights.map(ins => {
                  const borderColor = ins.prioridad === 'CRITICA' ? '#FF4D4D' : ins.prioridad === 'ALTA' ? '#FFB800' : '#60A5FA'
                  return (
                    <div
                      key={ins.id}
                      style={{ background: 'var(--sf-inset)', borderRadius: 8, borderLeft: `3px solid ${borderColor}`, padding: '10px 12px' }}
                    >
                      <p className="text-[13px] font-medium" style={{ color: 'var(--sf-t1)' }}>{ins.titulo}</p>
                      <p className="text-[12px] leading-relaxed mt-1" style={{ color: 'var(--sf-t3)' }}>{ins.descripcion}</p>
                      {ins.accion_sugerida && (
                        <p className="text-[12px] font-medium mt-2" style={{ color: 'var(--sf-green)' }}>
                          {'\u2192'} {ins.accion_sugerida}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div style={{ height: 80 }} />
        </div>

        {/* ── Footer: Analizar con IA ────────────────────────────────────── */}
        <div className="shrink-0" style={{ padding: '16px 24px', borderTop: '1px solid var(--sf-border)', background: 'var(--sf-page)' }}>
          <button
            className="w-full text-[13px] font-medium transition-all"
            style={{
              background: '#00D68F15',
              border: '1px solid #00D68F40',
              color: 'var(--sf-green)',
              borderRadius: 8,
              padding: '12px',
              cursor: 'pointer',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = '#00D68F25'; e.currentTarget.style.borderColor = '#00D68F' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#00D68F15'; e.currentTarget.style.borderColor = '#00D68F40' }}
            onClick={() => {
              const prompt = [
                `Analizar cliente: ${clienteName}`,
                `Vendedor: ${metrics.vendedorPrincipal}`,
                `Compras ${mesLabel}: ${metrics.ventasPeriodo} uds`,
                hasVenta ? `Venta neta: ${moneda}${metrics.ventaNetaPeriodo.toLocaleString()}` : '',
                `YTD ${selectedPeriod.year}: ${metrics.ytdUnidades.toLocaleString()} uds`,
                metrics.ytdVarPct !== null ? `Var YTD: ${metrics.ytdVarPct.toFixed(1)}%` : '',
                dormido ? `Estado: DORMIDO (${dormido.dias_sin_actividad} días, recovery ${dormido.recovery_score}/100)` : `Estado: ${status}`,
                '',
                'Analiza este cliente en profundidad: tendencia, productos principales, riesgos y oportunidades.',
              ].filter(Boolean).join('\n')
              const displayMessage = `Analizar cliente: ${clienteName}`
              navigate(dp('/chat'), { state: { prefill: prompt, displayPrefill: displayMessage, source: 'Clientes' } })
            }}
          >
            Analizar {clienteName} con IA {'\u2192'}
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, '')}k`
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 })
}

function KpiCard({ label, value, unit, muted, danger }: {
  label: string; value: string; unit?: string; muted?: boolean; danger?: boolean
}) {
  const valueColor = danger ? 'var(--sf-red)' : muted ? 'var(--sf-t5)' : 'var(--sf-t1)'
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
