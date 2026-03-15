import { useMemo, type FC } from 'react'
import { cn } from '../../lib/utils'
import { salesInPeriod, prevPeriod } from '../../lib/analysis'
import type { VendorAnalysis, Insight, SaleRecord, ClienteDormido } from '../../types'

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  vendedor: VendorAnalysis
  insights: Insight[]
  sales: SaleRecord[]
  selectedPeriod: { year: number; month: number }
  allVendorAnalysis: VendorAnalysis[]
  clientesDormidos: ClienteDormido[]
  onClose: () => void
}

const RIESGO_CONFIG = {
  critico:   { label: 'Crítico',   cls: 'bg-red-500/15 text-red-400 border-red-500/30' },
  riesgo:    { label: 'En riesgo', cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30' },
  ok:        { label: 'OK',        cls: 'bg-[#00B894]/15 text-[#00B894] border-[#00B894]/30' },
  superando: { label: 'Superando', cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30' },
}

// ─── Stat mini card ───────────────────────────────────────────────────────────

function Stat({ label, value, unit, colorVal }: {
  label: string; value: string; unit?: string; colorVal?: number | null
}) {
  const color = colorVal == null ? 'text-zinc-100'
    : colorVal >= 0 ? 'text-[#00B894]' : 'text-red-400'
  return (
    <div className="bg-zinc-900/60 border border-zinc-800 rounded-xl p-3">
      <p className="text-[9px] font-bold uppercase tracking-wider text-zinc-600">{label}</p>
      <p className={cn('text-lg font-black mt-0.5', color)}>
        {value}{unit && <span className="text-xs font-normal text-zinc-500 ml-1">{unit}</span>}
      </p>
    </div>
  )
}

// ─── Recomendación card ───────────────────────────────────────────────────────

const Rec: FC<{ icon: string; title: string; body: string }> = ({ icon, title, body }) => {
  return (
    <div className="bg-zinc-900 border border-zinc-700/40 rounded-xl p-4 space-y-1">
      <div className="flex items-center gap-2">
        <span className="text-base">{icon}</span>
        <span className="text-sm font-bold text-zinc-200">{title}</span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed">{body}</p>
    </div>
  )
}

// ─── Lógica de recomendaciones ────────────────────────────────────────────────

function useRecomendaciones(
  v: VendorAnalysis,
  sales: SaleRecord[],
  selectedPeriod: { year: number; month: number },
  allVendors: VendorAnalysis[]
) {
  return useMemo(() => {
    const { year, month } = selectedPeriod
    const prev = prevPeriod(year, month)

    const vendorSales = sales.filter((s) => s.vendedor === v.vendedor)
    const periodVS = salesInPeriod(vendorSales, year, month)
    const prevVS   = salesInPeriod(vendorSales, prev.year, prev.month)

    // ── CRÍTICO ────────────────────────────────────────────────────────────
    if (v.riesgo === 'critico') {
      const recs: { icon: string; title: string; body: string }[] = []

      // 1. "Llama hoy" — cliente de mayor valor que no compró este mes
      if (vendorSales.some((s) => s.cliente)) {
        const activoEsteMes = new Set(periodVS.map((s) => s.cliente).filter(Boolean))
        const historico: Record<string, { valor: number; ultima: Date }> = {}
        vendorSales.forEach((s) => {
          if (!s.cliente) return
          if (!historico[s.cliente]) historico[s.cliente] = { valor: 0, ultima: new Date(0) }
          historico[s.cliente].valor += s.venta_neta ?? s.unidades
          const d = new Date(s.fecha)
          if (d > historico[s.cliente].ultima) historico[s.cliente].ultima = d
        })
        const ausentes = Object.entries(historico)
          .filter(([c]) => !activoEsteMes.has(c))
          .sort(([, a], [, b]) => b.valor - a.valor)
        if (ausentes.length > 0) {
          const [cliente, { valor, ultima }] = ausentes[0]
          const dias = Math.floor((Date.now() - ultima.getTime()) / 86400000)
          recs.push({
            icon: '📞',
            title: 'Llama hoy',
            body: `${cliente} — ${dias} días sin comprar — historial $${valor.toLocaleString(undefined, { maximumFractionDigits: 0 })}`,
          })
        }
      }

      // 2. "Empuja este producto" — mayor historial, más tiempo sin vender
      if (vendorSales.some((s) => s.producto)) {
        const activoProductos = new Set(periodVS.map((s) => s.producto).filter(Boolean))
        const prodHist: Record<string, { volumen: number; ultima: Date }> = {}
        vendorSales.forEach((s) => {
          if (!s.producto) return
          if (!prodHist[s.producto]) prodHist[s.producto] = { volumen: 0, ultima: new Date(0) }
          prodHist[s.producto].volumen += s.unidades
          const d = new Date(s.fecha)
          if (d > prodHist[s.producto].ultima) prodHist[s.producto].ultima = d
        })
        const candidatos = Object.entries(prodHist)
          .filter(([p]) => !activoProductos.has(p))
          .sort(([, a], [, b]) => b.volumen - a.volumen)
        if (candidatos.length > 0) {
          const [producto, { volumen, ultima }] = candidatos[0]
          const dias = Math.floor((Date.now() - ultima.getTime()) / 86400000)
          recs.push({
            icon: '📦',
            title: 'Empuja este producto',
            body: `${producto} — ${dias} días sin vender — fue tu top con ${volumen.toLocaleString()} uds históricas`,
          })
        }
      }

      // 3. Ritmo necesario
      if (v.ritmo_necesario !== undefined && v.meta) {
        const faltante = v.meta - v.ventas_periodo
        recs.push({
          icon: '🏃',
          title: 'Ritmo necesario',
          body: `Necesitas ${v.ritmo_necesario.toFixed(1)} uds/día hábil para cerrar meta de ${v.meta.toLocaleString()} uds. Te faltan ${Math.max(0, faltante).toLocaleString()} uds.`,
        })
      } else if (v.ventas_mes_anterior > 0) {
        const faltante = v.ventas_mes_anterior - v.ventas_periodo
        recs.push({
          icon: '🏃',
          title: 'Ritmo necesario',
          body: `Para igualar el mes anterior (${v.ventas_mes_anterior.toLocaleString()} uds) necesitas ${Math.max(0, faltante).toLocaleString()} uds adicionales.`,
        })
      }

      return recs
    }

    // ── EN RIESGO ──────────────────────────────────────────────────────────
    if (v.riesgo === 'riesgo') {
      const recs: { icon: string; title: string; body: string }[] = []

      // 1. Clientes sin comprar esta semana
      if (vendorSales.some((s) => s.cliente)) {
        const hace7 = new Date(Date.now() - 7 * 86400000)
        const compraronSemana = new Set(
          vendorSales.filter((s) => new Date(s.fecha) >= hace7 && s.cliente).map((s) => s.cliente)
        )
        const activosMes = new Set(periodVS.map((s) => s.cliente).filter(Boolean))
        const sinSemana = Array.from(activosMes).filter((c) => !compraronSemana.has(c))
        if (sinSemana.length > 0) {
          const clienteData = sinSemana.slice(0, 3).map((c) => {
            const cs = vendorSales.filter((s) => s.cliente === c)
            const ultima = cs.reduce((max, s) => {
              const d = new Date(s.fecha); return d > max ? d : max
            }, new Date(0))
            const promCompra = cs.reduce((a, s) => a + (s.venta_neta ?? s.unidades), 0) / cs.length
            return `${c} (últ. ${ultima.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })}, ~$${promCompra.toFixed(0)}/compra)`
          })
          recs.push({
            icon: '👥',
            title: 'Sin comprar esta semana',
            body: clienteData.join(' · '),
          })
        }
      }

      // 2. Producto abandonado (vendía regularmente, >2 semanas sin vender)
      if (vendorSales.some((s) => s.producto)) {
        const hace14 = new Date(Date.now() - 14 * 86400000)
        const recientes = new Set(vendorSales.filter((s) => new Date(s.fecha) >= hace14 && s.producto).map((s) => s.producto))
        const prevProductos: Record<string, number> = {}
        prevVS.forEach((s) => {
          if (s.producto) prevProductos[s.producto] = (prevProductos[s.producto] ?? 0) + s.unidades
        })
        const abandonados = Object.entries(prevProductos)
          .filter(([p]) => !recientes.has(p))
          .sort(([, a], [, b]) => b - a)
        if (abandonados.length > 0) {
          const [producto, uds] = abandonados[0]
          recs.push({
            icon: '🕰️',
            title: 'Producto abandonado',
            body: `${producto} — vendías ${uds.toLocaleString()} uds el mes pasado y llevas más de 2 semanas sin venderlo.`,
          })
        }
      }

      // 3. Proyección actual
      if (v.proyeccion_cierre !== undefined) {
        const base = v.meta ?? v.ventas_mes_anterior
        const diff = v.proyeccion_cierre - base
        recs.push({
          icon: '📈',
          title: 'Proyección actual',
          body: `Al ritmo actual cerrarás con ${v.proyeccion_cierre.toLocaleString()} uds — ${diff < 0 ? `${Math.abs(diff).toLocaleString()} uds por debajo` : `${diff.toLocaleString()} uds sobre`} ${v.meta ? 'la meta' : 'el mes anterior'}.`,
        })
      }

      return recs
    }

    // ── OK / SUPERANDO ─────────────────────────────────────────────────────
    const recs: { icon: string; title: string; body: string }[] = []

    // 1. Oportunidad de expansión — productos que otros venden y este no
    if (sales.some((s) => s.producto)) {
      const misProd = new Set(periodVS.map((s) => s.producto).filter(Boolean))
      const prodEquipo: Record<string, number> = {}
      salesInPeriod(sales, year, month)
        .filter((s) => s.vendedor !== v.vendedor && s.producto)
        .forEach((s) => {
          prodEquipo[s.producto!] = (prodEquipo[s.producto!] ?? 0) + s.unidades
        })
      const oportunidades = Object.entries(prodEquipo)
        .filter(([p]) => !misProd.has(p))
        .sort(([, a], [, b]) => b - a)
        .slice(0, 2)
      if (oportunidades.length > 0) {
        const lista = oportunidades.map(([p, u]) => `${p} (${u.toLocaleString()} uds equipo)`).join(' · ')
        recs.push({
          icon: '🚀',
          title: 'Oportunidad de expansión',
          body: `Productos que el equipo vende y tú no has trabajado este mes: ${lista}.`,
        })
      }
    }

    // 2. Cliente con potencial — compras cayeron >20% vs mes anterior
    if (vendorSales.some((s) => s.cliente)) {
      const activos = new Set(periodVS.map((s) => s.cliente).filter(Boolean))
      let mejorOport: { cliente: string; caida: number } | null = null
      activos.forEach((c) => {
        const curr = periodVS.filter((s) => s.cliente === c).reduce((a, s) => a + s.unidades, 0)
        const prev2 = prevVS.filter((s) => s.cliente === c).reduce((a, s) => a + s.unidades, 0)
        if (prev2 > 0) {
          const caida = ((prev2 - curr) / prev2) * 100
          if (caida > 20 && (!mejorOport || caida > mejorOport.caida)) {
            mejorOport = { cliente: c!, caida }
          }
        }
      })
      if (mejorOport) {
        recs.push({
          icon: '🎯',
          title: 'Cliente con potencial',
          body: `${mejorOport.cliente} bajó ${mejorOport.caida.toFixed(0)}% vs el mes anterior. Reactívalo antes de que se duerma.`,
        })
      }
    }

    // 3. Si superando: reconocimiento
    if (v.riesgo === 'superando' && v.meta && v.proyeccion_cierre) {
      const surplus = v.proyeccion_cierre - v.meta
      recs.push({
        icon: '🏆',
        title: '¡Superando la meta!',
        body: `Proyectas cerrar con ${surplus.toLocaleString()} uds sobre la meta (${v.proyeccion_cierre.toLocaleString()} vs ${v.meta.toLocaleString()}). Sigue el ritmo de ${(v.ritmo_diario ?? 0).toFixed(1)} uds/día.`,
      })
    }

    return recs
  }, [v, sales, selectedPeriod, allVendors])
}

// ─── Componente principal ─────────────────────────────────────────────────────

const RECOVERY_CONFIG = {
  alta:        { cls: 'bg-[#00B894]/15 text-[#00B894] border-[#00B894]/30',        label: 'Alta' },
  recuperable: { cls: 'bg-blue-500/15 text-blue-400 border-blue-500/30',            label: 'Recuperable' },
  dificil:     { cls: 'bg-amber-500/15 text-amber-400 border-amber-500/30',          label: 'Difícil' },
  perdido:     { cls: 'bg-zinc-700/50 text-zinc-400 border-zinc-600/30',             label: 'Perdido' },
}

export default function VendedorPanel({ vendedor: v, insights, sales, selectedPeriod, allVendorAnalysis, clientesDormidos, onClose }: Props) {
  const rConfig = RIESGO_CONFIG[v.riesgo]
  const recomendaciones = useRecomendaciones(v, sales, selectedPeriod, allVendorAnalysis)
  const vendorInsights = insights.filter((i) => i.vendedor === v.vendedor)

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md bg-zinc-950 border-l border-zinc-800 z-50 overflow-y-auto shadow-2xl animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-zinc-100">{v.vendedor}</h2>
          <span className={cn('mt-1 inline-flex px-2 py-0.5 rounded text-[10px] font-bold uppercase border', rConfig.cls)}>
            {rConfig.label}
          </span>
        </div>
        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-zinc-500 hover:text-zinc-200 hover:bg-zinc-800 transition-colors text-xl leading-none">
          ×
        </button>
      </div>

      <div className="p-6 space-y-6">
        {/* KPIs */}
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Ventas período" value={v.ventas_periodo.toLocaleString()} unit="uds" />
          <Stat
            label="Variación YTD"
            value={v.variacion_ytd_pct == null ? 'N/A' : `${v.variacion_ytd_pct >= 0 ? '+' : ''}${v.variacion_ytd_pct.toFixed(1)}%`}
            colorVal={v.variacion_ytd_pct}
          />
          {v.meta !== undefined && <Stat label="Meta" value={v.meta.toLocaleString()} unit="uds" />}
          {v.cumplimiento_pct !== undefined && (
            <Stat label="Cumplimiento" value={`${v.cumplimiento_pct.toFixed(1)}%`} colorVal={v.cumplimiento_pct - 100} />
          )}
          {v.proyeccion_cierre !== undefined && (
            <Stat label="Proyección cierre" value={v.proyeccion_cierre.toLocaleString()} unit="uds" />
          )}
          {v.ritmo_diario !== undefined && (
            <Stat label="Ritmo actual" value={v.ritmo_diario.toFixed(1)} unit="uds/día" />
          )}
          {v.ritmo_necesario !== undefined && (
            <Stat label="Ritmo necesario" value={v.ritmo_necesario.toFixed(1)} unit="uds/día"
              colorVal={v.ritmo_diario ? v.ritmo_diario - v.ritmo_necesario : null} />
          )}
          {v.ticket_promedio !== undefined && (
            <Stat label="Ticket promedio" value={`$${v.ticket_promedio.toFixed(2)}`} />
          )}
          {v.clientes_activos !== undefined && (
            <Stat label="Clientes activos" value={String(v.clientes_activos)} />
          )}
          {v.semanas_bajo_promedio > 0 && (
            <Stat label="Semanas racha" value={String(v.semanas_bajo_promedio)} unit="sem" colorVal={-v.semanas_bajo_promedio} />
          )}
          {v.promedio_3m !== undefined && v.promedio_3m > 0 && (
            <Stat label="Promedio 3m" value={v.promedio_3m.toLocaleString()} unit="uds" />
          )}
          {v.variacion_vs_promedio_pct !== undefined && v.variacion_vs_promedio_pct !== null && (
            <Stat
              label="Var. vs prom."
              value={`${v.variacion_vs_promedio_pct >= 0 ? '+' : ''}${v.variacion_vs_promedio_pct.toFixed(1)}%`}
              colorVal={v.variacion_vs_promedio_pct}
              unit={`(${v.periodos_base_promedio ?? 3}m base)`}
            />
          )}
        </div>

        {/* Clientes dormidos del vendedor */}
        {(v.riesgo === 'critico' || v.riesgo === 'riesgo') && (() => {
          const dormidos = clientesDormidos
            .filter((d) => d.vendedor === v.vendedor)
            .slice(0, 3)
          if (dormidos.length === 0) return null
          const impactoTotal = dormidos.reduce((a, d) => a + d.valor_historico, 0)
          return (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Clientes dormidos ({dormidos.length})</p>
                {impactoTotal > 0 && (
                  <p className="text-[10px] text-zinc-600">hist. total: {impactoTotal.toLocaleString()} uds</p>
                )}
              </div>
              {dormidos.map((d) => {
                const rc = RECOVERY_CONFIG[d.recovery_label]
                const barColor = d.recovery_score >= 60 ? '#10b981' : d.recovery_score >= 40 ? '#f59e0b' : '#ef4444'
                return (
                  <div key={d.cliente} className="bg-zinc-900 border border-zinc-700/40 rounded-xl p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-bold text-zinc-200 truncate">{d.cliente}</span>
                      <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', rc.cls)}>
                        {rc.label} {d.recovery_score}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-500 leading-relaxed">{d.recovery_explicacion}</p>
                    <div className="flex items-center justify-between text-[10px] text-zinc-600">
                      <span>{d.dias_sin_actividad} días sin comprar · {d.compras_historicas} compras</span>
                      {d.valor_historico > 0 && (
                        <span className="text-zinc-500">{d.valor_historico.toLocaleString()} uds hist.</span>
                      )}
                    </div>
                    {/* Mini barra de recovery score */}
                    <div className="h-1 bg-zinc-800 rounded-full overflow-hidden">
                      <div className="h-full rounded-full transition-all" style={{ width: `${d.recovery_score}%`, background: barColor }} />
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Recomendaciones */}
        {recomendaciones.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">Recomendaciones</p>
            {recomendaciones.map((r, i) => (
              <Rec key={i} icon={r.icon} title={r.title} body={r.body} />
            ))}
          </div>
        )}

        {/* Alertas */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600">
            Alertas detectadas {vendorInsights.length > 0 ? `(${vendorInsights.length})` : ''}
          </p>
          {vendorInsights.length > 0
            ? vendorInsights.map((ins) => (
              <div key={ins.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-1">
                <div className="flex items-center gap-2">
                  <span className="text-base">{ins.emoji}</span>
                  <span className="text-sm font-bold text-zinc-200">{ins.titulo}</span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">{ins.descripcion}</p>
                {ins.accion_sugerida && (
                  <p className="text-xs text-[#00B894] font-medium mt-1">→ {ins.accion_sugerida}</p>
                )}
              </div>
            ))
            : (
              <div className="bg-[#00B894]/5 border border-[#00B894]/20 rounded-xl p-4 text-center">
                <p className="text-sm font-bold text-zinc-300">Sin alertas</p>
                <p className="text-xs text-zinc-500 mt-1">Operando sin problemas detectados.</p>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}
