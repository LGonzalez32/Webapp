import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { cn } from '../../lib/utils'
import { salesInPeriod, prevPeriod } from '../../lib/analysis'
import { useAppStore } from '../../store/appStore'
import type { VendorAnalysis, Insight, InsightTipo, SaleRecord, ClienteDormido, DataAvailability } from '../../types'

// ─── Constantes ───────────────────────────────────────────────────────────────

const MESES = ['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC']

const RIESGO_CONFIG = {
  critico:   { label: 'CRÍTICO',   color: '#FF4D4D', bg: '#FF4D4D15' },
  riesgo:    { label: 'EN RIESGO', color: '#FFB800', bg: '#FFB80015' },
  ok:        { label: 'OK',        color: 'var(--sf-green)', bg: '#00D68F15' },
  superando: { label: '↑ SUPERANDO', color: '#60A5FA', bg: '#60A5FA15' },
}

const PRIORIDAD_BORDER: Record<string, string> = {
  CRITICA: '#FF4D4D',
  ALTA:    '#FFB800',
  MEDIA:   '#60A5FA',
}

const TIPO_PILL: Partial<Record<InsightTipo, { label: string; color: string; bg: string }>> = {
  riesgo_vendedor: { label: 'VENDEDOR',  color: '#60A5FA', bg: '#60A5FA15' },
  riesgo_cliente:  { label: 'CLIENTE',   color: '#4ADE80', bg: '#4ADE8015' },
  riesgo_producto: { label: 'CATEGORÍA', color: '#FFB800', bg: '#FFB80015' },
  riesgo_meta:     { label: 'META',      color: '#FFB800', bg: '#FFB80015' },
  riesgo_equipo:   { label: 'EQUIPO',    color: '#60A5FA', bg: '#60A5FA15' },
  hallazgo:        { label: 'HALLAZGO',  color: '#22D3EE', bg: '#22D3EE15' },
}

const EMOJI_DOT: Record<string, string> = {
  '📞': '#FF4D4D',
  '🏃': '#FF4D4D',
  '📦': '#FFB800',
  '👥': '#FFB800',
  '🕰️': '#FFB800',
  '📈': '#FFB800',
  '🚀': '#00D68F',
  '🎯': '#00D68F',
  '🏆': '#00D68F',
}

const RECOVERY_CONFIG = {
  alta:        { cls: 'bg-[#00D68F]/10 text-[#00D68F] border-[#00D68F]/30',   label: 'Alta' },
  recuperable: { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/30',       label: 'Recuperable' },
  dificil:     { cls: 'bg-[#FFB800]/10 text-[#FFB800] border-[#FFB800]/30',   label: 'Difícil' },
  perdido:     { cls: 'bg-zinc-500/10 text-zinc-500 border-zinc-500/30',   label: 'Perdido' },
}

const mono = { fontFamily: "'DM Mono', monospace" }

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Props {
  vendedor: VendorAnalysis
  insights: Insight[]
  sales: SaleRecord[]
  selectedPeriod: { year: number; month: number }
  allVendorAnalysis: VendorAnalysis[]
  clientesDormidos: ClienteDormido[]
  dataAvailability?: DataAvailability
  onClose: () => void
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

export default function VendedorPanel({
  vendedor: v,
  insights,
  sales,
  selectedPeriod,
  allVendorAnalysis,
  clientesDormidos,
  dataAvailability,
  onClose,
}: Props) {
  const navigate = useNavigate()
  const setChatContextVendedor = useAppStore(s => s.setChatContextVendedor)
  const recomendaciones = useRecomendaciones(v, sales, selectedPeriod, allVendorAnalysis)
  const vendorInsights = insights.filter((i) => i.vendedor === v.vendedor)

  const [expandedAlert, setExpandedAlert] = useState<string | null>(vendorInsights[0]?.id ?? null)

  // Inferir disponibilidad desde los datos si no se pasa
  const da = dataAvailability ?? {
    has_supervisor: sales.some(s => s.supervisor),
    has_canal: v.canal_principal != null,
    has_metas: v.meta !== undefined,
    has_venta_neta: v.ticket_promedio !== undefined,
    has_cliente: v.clientes_activos !== undefined,
    has_producto: false,
    has_categoria: false,
    has_inventario: false,
  }

  // Supervisor principal del vendedor (desde historial de ventas)
  const supervisor = useMemo(() => {
    if (!da.has_supervisor) return null
    const count: Record<string, number> = {}
    sales.filter(s => s.vendedor === v.vendedor && s.supervisor).forEach(s => {
      count[s.supervisor!] = (count[s.supervisor!] ?? 0) + 1
    })
    const entries = Object.entries(count)
    if (entries.length === 0) return null
    return entries.sort(([, a], [, b]) => b - a)[0][0]
  }, [sales, v.vendedor, da.has_supervisor])

  const rCfg = RIESGO_CONFIG[v.riesgo]
  const mesLabel = MESES[selectedPeriod.month]

  // Color proyección basado en cumplimiento
  const proyColor = (() => {
    if (v.proyeccion_cierre === undefined) return 'var(--sf-t1)'
    if (v.meta) {
      const pct = (v.proyeccion_cierre / v.meta) * 100
      if (pct < 70) return 'var(--sf-red)'
      if (pct < 90) return 'var(--sf-amber)'
      return 'var(--sf-green)'
    }
    // Sin meta: comparar con mes anterior
    if (v.ventas_mes_anterior > 0) {
      return v.proyeccion_cierre >= v.ventas_mes_anterior ? 'var(--sf-green)' : 'var(--sf-red)'
    }
    return 'var(--sf-t1)'
  })()

  // Color variación ventas período
  const varColor = v.ventas_periodo >= v.ventas_mes_anterior ? 'var(--sf-green)' : 'var(--sf-red)'
  const varDiff = v.ventas_periodo - v.ventas_mes_anterior
  const varSign = varDiff >= 0 ? '+' : ''

  // Clientes dormidos del vendedor
  const dormidos = (v.riesgo === 'critico' || v.riesgo === 'riesgo')
    ? clientesDormidos.filter(d => d.vendedor === v.vendedor).slice(0, 3)
    : []

  return (
    <>
      {/* Inyectar DM Mono */}
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
        {/* ── Sección 1: Header ─────────────────────────────────────────────── */}
        <div className="relative shrink-0" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--sf-border)' }}>
          {/* Contexto zona/canal */}
          {(da.has_supervisor && supervisor) && (
            <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>
              ZONA {supervisor}
            </p>
          )}
          {(!da.has_supervisor || !supervisor) && da.has_canal && (() => {
            const canalLabel = v.canal_principal?.toLowerCase().startsWith('canal')
              ? v.canal_principal
              : v.canal_principal ? `CANAL ${v.canal_principal}` : null
            return canalLabel ? (
              <p className="text-[11px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>
                {canalLabel}
              </p>
            ) : null
          })()}

          {/* Nombre */}
          <h2
            className="font-semibold truncate pr-8"
            style={{ fontSize: 20, color: 'var(--sf-t1)', lineHeight: 1.3 }}
          >
            {v.vendedor}
          </h2>

          {/* Badge estado */}
          <span
            className="inline-flex mt-2 text-[11px] font-bold rounded"
            style={{ padding: '3px 8px', background: rCfg.bg, color: rCfg.color }}
          >
            {rCfg.label}
          </span>

          {/* Botón cerrar */}
          <button
            onClick={onClose}
            className="absolute flex items-center justify-center transition-colors"
            style={{ top: 20, right: 20, color: 'var(--sf-t5)', fontSize: 18, lineHeight: 1, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t1)' }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--sf-t5)' }}
          >
            ×
          </button>
        </div>

        {/* Contenido scrollable */}
        <div className="flex-1 overflow-y-auto">

          {/* ── Sección 2: KPIs Principales ─────────────────────────────────── */}
          <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <div className="grid grid-cols-2 gap-4">
              {/* Ventas período */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>
                  VENTAS {mesLabel}
                </p>
                <p style={{ ...mono, fontSize: 32, color: 'var(--sf-t1)', lineHeight: 1 }}>
                  {v.ventas_periodo.toLocaleString()}
                </p>
                {v.ventas_mes_anterior > 0 && (
                  <p className="text-xs mt-1" style={{ color: varColor }}>
                    {varSign}{varDiff.toLocaleString()} vs mismo mes año anterior
                  </p>
                )}
              </div>

              {/* Proyección cierre */}
              <div>
                <p className="text-[11px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>
                  PROYECCIÓN CIERRE
                </p>
                {v.proyeccion_cierre !== undefined ? (
                  <>
                    <p style={{ ...mono, fontSize: 32, color: proyColor, lineHeight: 1 }}>
                      {v.proyeccion_cierre.toLocaleString()}
                    </p>
                    {da.has_metas && v.cumplimiento_pct !== undefined && (
                      <p className="text-xs mt-1" style={{ color: proyColor }}>
                        {v.cumplimiento_pct.toFixed(0)}% de meta
                      </p>
                    )}
                  </>
                ) : (
                  <p style={{ ...mono, fontSize: 32, color: 'var(--sf-t5)', lineHeight: 1 }}>—</p>
                )}
              </div>
            </div>
          </div>

          {/* ── Sección 3: KPIs Secundarios ─────────────────────────────────── */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <div className="grid grid-cols-2 gap-2">
              {/* YTD actual */}
              {v.ytd_actual !== undefined && v.ytd_actual > 0 && (
                <KpiCard label={`YTD ${selectedPeriod.year}`} value={v.ytd_actual.toLocaleString()} />
              )}
              {/* YTD anterior */}
              {v.ytd_anterior !== undefined && v.ytd_anterior > 0 && (
                <KpiCard label={`YTD ${selectedPeriod.year - 1}`} value={v.ytd_anterior.toLocaleString()} muted />
              )}
              {/* Ritmo actual */}
              {v.ritmo_diario !== undefined && (
                <KpiCard label="RITMO ACTUAL" value={`${v.ritmo_diario.toFixed(1)}`} unit="uds/día" />
              )}
              {/* Ritmo necesario */}
              {v.ritmo_necesario !== undefined && (
                <KpiCard
                  label="RITMO NECESARIO"
                  value={`${v.ritmo_necesario.toFixed(1)}`}
                  unit="uds/día"
                  danger={v.ritmo_diario !== undefined && v.ritmo_diario < v.ritmo_necesario}
                />
              )}
              {/* Ticket promedio — solo si has_venta_neta */}
              {da.has_venta_neta && v.ticket_promedio !== undefined && (
                <KpiCard label="TICKET PROMEDIO" value={`$${v.ticket_promedio.toFixed(2)}`} />
              )}
              {/* Clientes activos — solo si has_cliente */}
              {da.has_cliente && v.clientes_activos !== undefined && (
                <KpiCard label="CLIENTES ACTIVOS" value={String(v.clientes_activos)} />
              )}
              {/* Promedio 3M */}
              {v.promedio_3m !== undefined && v.promedio_3m > 0 && (
                <KpiCard label="PROMEDIO 3M" value={v.promedio_3m.toLocaleString()} unit="uds" />
              )}
            </div>
          </div>

          {/* ── Clientes dormidos ────────────────────────────────────────────── */}
          {dormidos.length > 0 && (() => {
            const impactoTotal = dormidos.reduce((a, d) => a + d.valor_historico, 0)
            return (
              <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: 'var(--sf-t5)' }}>
                    CLIENTES DORMIDOS ({dormidos.length})
                  </p>
                  {impactoTotal > 0 && (
                    <p className="text-[10px]" style={{ color: 'var(--sf-t5)' }}>
                      hist. {impactoTotal.toLocaleString()} uds
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  {dormidos.map((d) => {
                    const rc = RECOVERY_CONFIG[d.recovery_label]
                    const barColor = d.recovery_score >= 60 ? 'var(--sf-green)' : d.recovery_score >= 40 ? 'var(--sf-amber)' : 'var(--sf-red)'
                    return (
                      <div
                        key={d.cliente}
                        className="space-y-2"
                        style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: '12px' }}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate" style={{ color: 'var(--sf-t1)' }}>{d.cliente}</span>
                          <span className={cn('shrink-0 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase border', rc.cls)}>
                            {rc.label} {d.recovery_score}
                          </span>
                        </div>
                        <p className="text-[11px] leading-relaxed" style={{ color: 'var(--sf-t3)' }}>{d.recovery_explicacion}</p>
                        <div className="flex items-center justify-between text-[10px]" style={{ color: 'var(--sf-t5)' }}>
                          <span>{d.dias_sin_actividad} días sin comprar · {d.compras_historicas} compras</span>
                          {d.valor_historico > 0 && <span>{d.valor_historico.toLocaleString()} uds hist.</span>}
                        </div>
                        <div style={{ height: 3, background: 'var(--sf-border)', borderRadius: 999, overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${d.recovery_score}%`, background: barColor, borderRadius: 999 }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* ── Sección 4: Recomendaciones ───────────────────────────────────── */}
          {recomendaciones.length > 0 && (
            <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
              <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
                ACCIONES SUGERIDAS
              </p>
              <div className="space-y-2">
                {recomendaciones.map((r, i) => {
                  const dotColor = EMOJI_DOT[r.icon] ?? '#FFB800'
                  return (
                    <div
                      key={i}
                      style={{
                        background: 'var(--sf-inset)',
                        borderRadius: 8,
                        padding: '12px 14px',
                        borderLeft: `3px solid ${dotColor}`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span
                          className="shrink-0 rounded-full"
                          style={{ width: 7, height: 7, background: dotColor }}
                        />
                        <span className="text-[13px] font-medium" style={{ color: 'var(--sf-t1)' }}>{r.title}</span>
                      </div>
                      <p className="text-[12px] leading-relaxed ml-[15px]" style={{ color: 'var(--sf-t3)' }}>{r.body}</p>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* ── Sección 5: Alertas detectadas ───────────────────────────────── */}
          <div style={{ padding: '16px 24px', borderBottom: '1px solid var(--sf-border)' }}>
            <p className="text-[11px] font-bold uppercase tracking-widest mb-3" style={{ color: 'var(--sf-t5)' }}>
              ALERTAS {vendorInsights.length > 0 ? `(${vendorInsights.length})` : ''}
            </p>

            {vendorInsights.length === 0 ? (
              <div
                className="text-center py-4"
                style={{ background: '#00D68F08', border: '1px solid #00D68F20', borderRadius: 8 }}
              >
                <p className="text-sm font-medium" style={{ color: 'var(--sf-t1)' }}>Sin alertas</p>
                <p className="text-xs mt-1" style={{ color: 'var(--sf-t5)' }}>Operando sin problemas detectados.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {vendorInsights.map((ins) => {
                  const isOpen = expandedAlert === ins.id
                  const borderColor = PRIORIDAD_BORDER[ins.prioridad] ?? 'var(--sf-t5)'
                  const pill = TIPO_PILL[ins.tipo]

                  return (
                    <div
                      key={ins.id}
                      style={{
                        background: 'var(--sf-inset)',
                        borderRadius: 8,
                        borderLeft: `3px solid ${borderColor}`,
                        overflow: 'hidden',
                        cursor: 'pointer',
                      }}
                      onClick={() => setExpandedAlert(isOpen ? null : ins.id)}
                    >
                      {/* Cabecera colapsada */}
                      <div className="flex items-center justify-between gap-2" style={{ padding: '10px 12px' }}>
                        <div className="flex items-center gap-2 min-w-0">
                          {pill && (
                            <span
                              className="shrink-0 text-[9px] font-bold rounded"
                              style={{ padding: '2px 6px', background: pill.bg, color: pill.color }}
                            >
                              {pill.label}
                            </span>
                          )}
                          <span className="text-[13px] font-medium truncate" style={{ color: 'var(--sf-t1)' }}>
                            {ins.titulo}
                          </span>
                        </div>
                        <span className="shrink-0 text-[11px]" style={{ color: 'var(--sf-t5)' }}>
                          {isOpen ? '▲' : '▼'}
                        </span>
                      </div>

                      {/* Expandido */}
                      {isOpen && (
                        <div style={{ padding: '0 12px 12px' }}>
                          <p className="text-[12px] leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
                            {ins.descripcion}
                          </p>
                          {ins.accion_sugerida && (
                            <p className="text-[12px] font-medium mt-2" style={{ color: 'var(--sf-green)' }}>
                              → {ins.accion_sugerida}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Espaciado inferior para que el footer no tape contenido */}
          <div style={{ height: 80 }} />
        </div>

        {/* ── Sección 6: Footer con botón IA ──────────────────────────────── */}
        <div
          className="shrink-0"
          style={{
            padding: '16px 24px',
            borderTop: '1px solid var(--sf-border)',
            background: 'var(--sf-page)',
          }}
        >
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
            onMouseEnter={e => {
              const el = e.currentTarget
              el.style.background = '#00D68F25'
              el.style.borderColor = '#00D68F'
            }}
            onMouseLeave={e => {
              const el = e.currentTarget
              el.style.background = '#00D68F15'
              el.style.borderColor = '#00D68F40'
            }}
            onClick={() => {
              setChatContextVendedor(v)
              navigate(`/chat?vendedor=${encodeURIComponent(v.vendedor)}`)
            }}
          >
            Analizar {v.vendedor} con IA →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── KpiCard ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, unit, muted, danger }: {
  label: string
  value: string
  unit?: string
  muted?: boolean
  danger?: boolean
}) {
  const valueColor = danger ? 'var(--sf-red)' : muted ? 'var(--sf-t5)' : 'var(--sf-t1)'
  return (
    <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 8, padding: 12 }}>
      <p className="text-[10px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t5)' }}>
        {label}
      </p>
      <p style={{ fontFamily: "'DM Mono', monospace", fontSize: 16, color: valueColor, lineHeight: 1 }}>
        {value}
        {unit && <span className="text-[11px] ml-1" style={{ color: 'var(--sf-t5)' }}>{unit}</span>}
      </p>
    </div>
  )
}
