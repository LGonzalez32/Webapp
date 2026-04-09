import { useState, useCallback, useRef, useMemo } from 'react'
import { X } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import type { PulsoPanelData } from '../../lib/pulso-engine'

interface Props {
  data: PulsoPanelData
  moneda: string
  onClose: () => void
  onChat: (question: string) => void
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString()
}

export default function PulsoPanel({ data, moneda, onClose, onChat }: Props) {
  const [panelWidth, setPanelWidth] = useState(() => Math.max(400, window.innerWidth * 0.42))
  const [isDragging, setIsDragging] = useState(false)
  const dragging = useRef(false)

  const handleResizeStart = useCallback((e: { preventDefault: () => void }) => {
    e.preventDefault()
    dragging.current = true
    setIsDragging(true)
    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      const w = window.innerWidth - ev.clientX
      setPanelWidth(Math.max(400, Math.min(w, window.innerWidth * 0.85)))
    }
    const onUp = () => {
      dragging.current = false
      setIsDragging(false)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [])

  return (
    <>
      <style>{`@keyframes sf-panel-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
      <div
        className="fixed inset-y-0 right-0 z-50 flex flex-col overflow-hidden shadow-2xl"
        style={{ width: panelWidth, background: 'var(--sf-page)', borderLeft: '1px solid var(--sf-border)', animation: 'sf-panel-in 300ms cubic-bezier(0.4,0,0.2,1) both' }}
      >
        {/* Drag handle izquierdo */}
        <div
          onMouseDown={handleResizeStart}
          onMouseEnter={e => { if (!dragging.current) (e.currentTarget.firstElementChild as HTMLElement).style.background = 'var(--sf-border)' }}
          onMouseLeave={e => { if (!dragging.current) (e.currentTarget.firstElementChild as HTMLElement).style.background = 'transparent' }}
          style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 6, cursor: 'col-resize', zIndex: 10 }}
        >
          <div style={{ position: 'absolute', top: 0, left: 2, bottom: 0, width: 2, background: isDragging ? 'var(--sf-t3)' : 'transparent', transition: 'background 150ms' }} />
        </div>
        {/* Header */}
        <div className="shrink-0 relative" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--sf-border)' }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors" style={{ color: 'var(--sf-t4)', background: 'var(--sf-inset)' }}>
            <X className="w-4 h-4" />
          </button>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t6)' }}>PULSO</p>

          {data.panelType === 'categorias_colapso' && data.categorias && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>{data.categorias.length} categoría{data.categorias.length > 1 ? 's' : ''} se desplomaron</h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--sf-t4)' }}>Más de 50% de caída</p>
            </>
          )}
          {data.panelType === 'inventario_riesgo' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>{data.producto}</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: 'var(--sf-red-bg)', color: 'var(--sf-red)', border: '1px solid var(--sf-red-border)' }}>RIESGO DE QUIEBRE</span>
            </>
          )}
          {data.panelType === 'meta_peligro' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>Meta del mes en riesgo</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: (data.proyPct ?? 0) < 50 ? 'var(--sf-red-bg)' : 'var(--sf-amber-bg)', color: (data.proyPct ?? 0) < 50 ? 'var(--sf-red)' : 'var(--sf-amber)' }}>{(data.proyPct ?? 0) < 50 ? 'CRÍTICO' : '⚠ ATENCIÓN'}</span>
            </>
          )}
          {data.panelType === 'cliente_dormido' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>{data.cliente}</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: 'var(--sf-amber-bg)', color: 'var(--sf-amber)' }}>{data.recoveryLabel === 'alta' ? 'BUENA RECUPERACIÓN' : data.recoveryLabel === 'recuperable' ? 'RECUPERABLE' : data.recoveryLabel === 'dificil' ? 'DIFÍCIL' : data.recoveryLabel === 'perdido' ? 'PERDIDO' : 'DORMIDO'}</span>
            </>
          )}
          {data.panelType === 'zona_supervisor' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>Zona de {data.supervisor}</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: (data.metaZonaPct ?? 0) < 50 ? 'var(--sf-red-bg)' : 'var(--sf-amber-bg)', color: (data.metaZonaPct ?? 0) < 50 ? 'var(--sf-red)' : 'var(--sf-amber)' }}>⚠ NECESITA ATENCIÓN</span>
            </>
          )}
          {data.panelType === 'producto_declive' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>{data.producto}</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: 'var(--sf-red-bg)', color: 'var(--sf-red)', border: '1px solid var(--sf-red-border)' }}>EN DECLIVE</span>
            </>
          )}
          {data.panelType === 'oportunidad_cruce' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>Reactiva {data.cliente} con {data.producto}</h2>
              <span className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1" style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)' }}>💡 OPORTUNIDAD</span>
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
          {data.panelType === 'categorias_colapso' && data.categorias && <CategoriasContent categorias={data.categorias} moneda={moneda} />}
          {data.panelType === 'inventario_riesgo' && <InventarioContent data={data} />}
          {data.panelType === 'meta_peligro' && <MetaContent data={data} />}
          {data.panelType === 'cliente_dormido' && <ClienteDormidoContent data={data} />}
          {data.panelType === 'producto_declive' && <ProductoDecliveContent data={data} />}
          {data.panelType === 'zona_supervisor' && <ZonaSupervisorContent data={data} />}
          {data.panelType === 'oportunidad_cruce' && <OportunidadContent data={data} />}
        </div>

        {/* CTA */}
        <div className="shrink-0" style={{ padding: '16px 24px', borderTop: '1px solid var(--sf-border)' }}>
          <button onClick={() => onChat(data.chatQuestion)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90" style={{ background: 'var(--sf-green)', color: '#fff' }}>
            ✦ Profundizar con IA →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function CategoriasContent({ categorias, moneda }: { categorias: Array<{ nombre: string; caida: number; perdidaUSD: number }>; moneda: string }) {
  const total = categorias.reduce((s, c) => s + c.perdidaUSD, 0)
  const hasUSD = total > 0
  return (
    <div className="space-y-4">
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
        <div className="grid text-[10px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: hasUSD ? '1fr 80px 90px' : '1fr 80px', padding: '8px 12px', background: 'var(--sf-inset)', color: 'var(--sf-t5)' }}>
          <span>Categoría</span><span className="text-right">Caída</span>{hasUSD && <span className="text-right">Pérdida</span>}
        </div>
        {categorias.map((c, i) => (
          <div key={c.nombre} className="grid text-xs" style={{ gridTemplateColumns: hasUSD ? '1fr 80px 90px' : '1fr 80px', padding: '10px 12px', background: i % 2 === 0 ? 'transparent' : 'var(--sf-overlay-subtle)', borderTop: '1px solid var(--sf-border)' }}>
            <span className="font-medium" style={{ color: 'var(--sf-t1)' }}>{c.nombre}</span>
            <span className="text-right font-semibold" style={{ color: 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>-{c.caida.toFixed(1)}%</span>
            {hasUSD && <span className="text-right" style={{ color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{moneda} {fmtK(c.perdidaUSD)}</span>}
          </div>
        ))}
      </div>
      {hasUSD && <div className="flex justify-end"><span className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>Total en riesgo: {moneda} {fmtK(total)}</span></div>}
    </div>
  )
}

function InventarioContent({ data }: { data: PulsoPanelData }) {
  const { sales, clientesDormidos, categoriaAnalysis, categoriasInventario } = useAppStore()
  const stock = data.stock ?? 0
  const dias = data.diasInventario ?? 0
  const promedio = data.promedioMensual ?? 0

  const quiebreDate = new Date(); quiebreDate.setDate(quiebreDate.getDate() + dias)
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const barPct = Math.min(dias / 30 * 100, 100)

  const cross = useMemo(() => {
    if (!data.producto) return { catCtx: null, dormidosQueCompraban: [], otrosEnRiesgo: [], señales: [] }
    const invItem = categoriasInventario.find(i => i.producto === data.producto)
    const catName = invItem?.categoria ?? ''
    const catCtx = categoriaAnalysis.find(c => c.categoria === catName) ?? null

    // Dormant clients who bought this product
    const clientesDelProd = [...new Set(sales.filter(s => s.producto === data.producto && s.cliente).map(s => s.cliente!))]
    const dormidosQueCompraban = clientesDormidos.filter(d => clientesDelProd.includes(d.cliente)).slice(0, 3)

    // Other products in same category at risk
    const otrosEnRiesgo = categoriasInventario
      .filter(i => i.categoria === catName && i.producto !== data.producto && (i.clasificacion === 'riesgo_quiebre' || i.dias_inventario < 15))
      .slice(0, 3)

    const señales: string[] = []
    if (catCtx && (catCtx.tendencia === 'colapso' || catCtx.tendencia === 'caida')) {
      señales.push(`Categoría ${catName} en ${catCtx.tendencia}: ${Math.abs(Math.round(catCtx.variacion_pct))}% caída`)
    }
    if (dormidosQueCompraban.length > 0) {
      señales.push(`${dormidosQueCompraban.length} cliente${dormidosQueCompraban.length > 1 ? 's' : ''} dormido${dormidosQueCompraban.length > 1 ? 's' : ''} que compraba${dormidosQueCompraban.length > 1 ? 'n' : ''} este producto: ${dormidosQueCompraban.map(d => d.cliente).join(', ')}`)
    }
    if (otrosEnRiesgo.length > 0) {
      señales.push(`${otrosEnRiesgo.length} producto${otrosEnRiesgo.length > 1 ? 's' : ''} más de ${catName} en riesgo: ${otrosEnRiesgo.map(p => p.producto).join(', ')}`)
    }
    if (promedio > 0) {
      señales.push(`Si se agota, se pierden ~${promedio.toLocaleString()} uds/mes de venta`)
    }

    return { catCtx, dormidosQueCompraban, otrosEnRiesgo, señales }
  }, [data, sales, clientesDormidos, categoriaAnalysis, categoriasInventario, promedio])

  const invItem = categoriasInventario.find(i => i.producto === data.producto)
  const catName = invItem?.categoria ?? ''

  return (
    <div className="space-y-4">
      {/* Narrative context */}
      <div style={{ background: 'color-mix(in srgb, var(--sf-amber) 8%, transparent)', borderLeft: '3px solid var(--sf-amber)', padding: '12px 16px', borderRadius: '0 8px 8px 0' }}>
        <p style={{ color: 'var(--sf-t2)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
          <strong>{data.producto}</strong> tiene {stock.toLocaleString()} uds — al ritmo actual ({promedio.toLocaleString()} uds/mes) se agota el {quiebreDate.getDate()} de {meses[quiebreDate.getMonth()]}.
          {cross.catCtx ? ` Categoría ${catName}: ${cross.catCtx.tendencia}.` : ''}
        </p>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Stock actual</div>
          <div className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{stock.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds</span></div>
        </div>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Ritmo de venta</div>
          <div className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{promedio.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds/mes</span></div>
        </div>
      </div>

      {/* Inventory bar */}
      <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sf-t5)' }}>Días de inventario</p>
          <p className="text-lg font-bold" style={{ color: dias <= 7 ? 'var(--sf-red)' : dias <= 14 ? 'var(--sf-amber)' : 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{dias} días</p>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--sf-border)' }}>
          <div className="h-full rounded-full" style={{ width: `${barPct}%`, background: dias <= 7 ? 'var(--sf-red)' : dias <= 14 ? 'var(--sf-amber)' : 'var(--sf-green)' }} />
        </div>
      </div>

      {/* Cross-table signals */}
      {cross.señales.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold uppercase mb-2" style={{ color: 'var(--sf-t3)' }}>¿Por qué importa?</h3>
          {cross.señales.map((s, i) => (
            <div key={i} className="text-[12px] rounded-md mb-1.5 p-2.5" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Affected vendors */}
      {data.vendedoresAfectados && data.vendedoresAfectados.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>¿A quién afecta?</p>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
            {data.vendedoresAfectados.map((va, i) => (
              <div key={va.vendedor} className="flex items-center justify-between text-xs" style={{ padding: '6px 12px', borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{va.vendedor}</span>
                <span style={{ color: 'var(--sf-t4)', fontFamily: "'DM Mono', monospace" }}>{va.uds.toLocaleString()} uds</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function MetaContent({ data }: { data: PulsoPanelData }) {
  const { clientesDormidos, sales, categoriasInventario, vendorAnalysis } = useAppStore()
  const pct = data.proyPct ?? 0
  const brecha = Math.max(0, (data.meta ?? 0) - (data.proyeccion ?? 0))

  const cross = useMemo(() => {
    const señales: string[] = []
    // Dormant clients impact
    if (clientesDormidos.length > 0 && brecha > 0) {
      const dormValMensual = clientesDormidos.reduce((a, d) => {
        const meses = new Set(sales.filter(s => s.cliente === d.cliente).map(s => { const dt = new Date(s.fecha); return `${dt.getFullYear()}-${dt.getMonth()}` })).size
        return a + (meses > 0 ? Math.round(d.valor_historico / meses) : 0)
      }, 0)
      if (dormValMensual > 0) {
        const pctBrch = Math.min(100, Math.round((dormValMensual / brecha) * 100))
        señales.push(`${clientesDormidos.length} clientes dormidos representan ~${dormValMensual.toLocaleString()} uds/mes (${pctBrch}% de la brecha)`)
      }
    }
    // Slow-move inventory opportunity
    const lentos = categoriasInventario.filter(i => ['lento_movimiento', 'sin_movimiento'].includes(i.clasificacion))
    const ganchos = lentos.filter(i => vendorAnalysis.some(v => v.productos_lentos_con_historial?.some(p => p.producto === i.producto)))
    if (ganchos.length > 0) señales.push(`${ganchos.length} producto${ganchos.length > 1 ? 's' : ''} con stock parado que vendedores conocen: ${ganchos.slice(0, 2).map(g => g.producto).join(', ')}`)
    return señales
  }, [clientesDormidos, sales, categoriasInventario, vendorAnalysis, brecha])

  return (
    <div className="space-y-4">
      {/* Narrative context */}
      <div style={{ background: 'color-mix(in srgb, var(--sf-amber) 8%, transparent)', borderLeft: '3px solid var(--sf-amber)', padding: '12px 16px', borderRadius: '0 8px 8px 0' }}>
        <p style={{ color: 'var(--sf-t2)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
          El equipo proyecta <strong>{pct}%</strong> de la meta con {data.diasTranscurridos ?? '?'} de {data.diasTotales ?? '?'} días transcurridos.
          {brecha > 0 ? ` Faltan ${fmtK(brecha)} uds en ${data.diasRestantes} días.` : ''}
        </p>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Proyección</div>
          <div className="text-xl font-bold" style={{ color: pct < 70 ? 'var(--sf-red)' : 'var(--sf-amber)', fontFamily: "'DM Mono', monospace" }}>{pct}%</div>
        </div>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Brecha</div>
          <div className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{fmtK(brecha)} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds</span></div>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--sf-border)' }}>
        <div className="h-full rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: pct < 50 ? 'var(--sf-red)' : pct < 70 ? 'var(--sf-amber)' : 'var(--sf-green)' }} />
      </div>

      {/* Cross-table signals */}
      {cross.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold uppercase mb-2" style={{ color: 'var(--sf-t3)' }}>Oportunidades para cerrar la brecha</h3>
          {cross.map((s, i) => (
            <div key={i} className="text-[12px] rounded-md mb-1.5 p-2.5" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Vendor tables */}
      {data.vendedoresBajoMeta && data.vendedoresBajoMeta.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>¿Quién está fallando?</p>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
            {data.vendedoresBajoMeta.map((v, i) => (
              <div key={v.vendedor} className="flex items-center justify-between text-xs" style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{v.vendedor}</span>
                <span className="font-semibold" style={{ color: 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>{v.proyPct}% · -{fmtK(v.brecha)} uds</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {data.vendedoresSobreMeta && data.vendedoresSobreMeta.length > 0 && (
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>¿Quién puede compensar?</p>
          <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
            {data.vendedoresSobreMeta.map((v, i) => (
              <div key={v.vendedor} className="flex items-center justify-between text-xs" style={{ padding: '8px 12px', borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{v.vendedor}</span>
                <span className="font-semibold" style={{ color: 'var(--sf-green)', fontFamily: "'DM Mono', monospace" }}>{v.proyPct}% · +{fmtK(v.excedente)} uds</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ClienteDormidoContent({ data }: { data: PulsoPanelData }) {
  const { sales, vendorAnalysis, categoriaAnalysis, categoriasInventario, configuracion } = useAppStore()
  const moneda = configuracion.moneda

  const insights = useMemo(() => {
    if (!data.cliente) return { topProductos: [], vendedor: null, brecha: 0, coberturaPct: 0, promedioMensual: 0, productosGancho: [], productosEnRiesgo: [], catEnColapso: [] }

    const clienteSales = sales.filter(s => s.cliente === data.cliente)
    const prodAgg: Record<string, number> = {}
    for (const s of clienteSales) {
      if (s.producto) prodAgg[s.producto] = (prodAgg[s.producto] ?? 0) + (s.venta_neta ?? s.unidades)
    }
    const topProductos = Object.entries(prodAgg).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([p]) => p)

    const vendedor = vendorAnalysis.find(v => v.vendedor === data.vendedorAsignado) ?? null
    const brecha = vendedor ? Math.round((vendedor.meta_uds ?? vendedor.meta ?? 0) - (vendedor.unidades_periodo ?? 0)) : 0
    // Promedio mensual del cliente (historial / meses activos) para cobertura realista
    const mesesActivos = new Set(clienteSales.map(s => `${new Date(s.fecha).getFullYear()}-${new Date(s.fecha).getMonth()}`)).size
    const promedioMensual = mesesActivos > 0 ? Math.round((data.valorHistorico ?? 0) / mesesActivos) : 0
    const metaVendedor = vendedor?.meta_uds ?? vendedor?.meta ?? 0
    const coberturaPct = metaVendedor > 0 && promedioMensual > 0 ? Math.round((promedioMensual / metaVendedor) * 100) : 0

    const productosGancho = (vendedor?.productos_lentos_con_historial ?? [])
      .filter(p => topProductos.includes(p.producto))
      .slice(0, 2)
    const productosEnRiesgo = categoriasInventario
      .filter(i => topProductos.includes(i.producto) && i.clasificacion === 'riesgo_quiebre')
      .slice(0, 2)
    const categoriasCliente = [...new Set(clienteSales.map(s => s.categoria).filter(Boolean))]
    const catEnColapso = categoriaAnalysis
      .filter(c => categoriasCliente.includes(c.categoria) && c.tendencia === 'colapso')
      .map(c => ({ cat: c.categoria, pct: Math.round(c.variacion_pct) }))
      .slice(0, 2)

    return { topProductos, vendedor, brecha, coberturaPct, promedioMensual, productosGancho, productosEnRiesgo, catEnColapso }
  }, [data, sales, vendorAnalysis, categoriaAnalysis, categoriasInventario])

  const actionLabel = data.recoveryLabel === 'alta' ? 'Buena recuperación — llámalo hoy'
    : data.recoveryLabel === 'recuperable' ? 'Recuperable — un contacto puede reactivarlo'
    : data.recoveryLabel === 'dificil' ? 'Difícil — intenta con una oferta concreta'
    : 'Perdido — baja prioridad'
  const actionColor = data.recoveryLabel === 'alta' || data.recoveryLabel === 'recuperable' ? 'var(--sf-green)' : data.recoveryLabel === 'dificil' ? 'var(--sf-amber)' : 'var(--sf-red)'

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Días inactivo</p>
          <p className="text-xl font-bold" style={{ color: 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>{data.diasInactivo}</p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Historial</p>
          <p className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{fmtK(data.valorHistorico ?? 0)} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds</span></p>
        </div>
      </div>

      {/* Vendedor + estado */}
      <div className="rounded-lg p-3" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-xs" style={{ color: 'var(--sf-t3)' }}>Vendedor asignado: <strong style={{ color: 'var(--sf-t1)' }}>{data.vendedorAsignado}</strong></p>
        <p className="text-xs mt-1 font-medium" style={{ color: actionColor }}>{actionLabel}</p>
        {insights.vendedor && insights.brecha > 0 && (
          <p className="text-[11px] mt-1" style={{ color: 'var(--sf-t4)' }}>
            A {data.vendedorAsignado} le faltan {insights.brecha.toLocaleString()} uds para meta — este cliente promediaba ~{insights.promedioMensual.toLocaleString()} uds/mes ({insights.coberturaPct}% de la brecha)
          </p>
        )}
      </div>

      {/* Top productos del cliente */}
      {insights.topProductos.length > 0 && (
        <div className="rounded-lg p-3" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--sf-t5)' }}>Productos que compraba</p>
          <div className="flex flex-wrap gap-1.5">
            {insights.topProductos.map(p => (
              <span key={p} className="text-[11px] px-2 py-0.5 rounded" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>{p}</span>
            ))}
          </div>
        </div>
      )}

      {/* Cross-insights */}
      {(insights.productosGancho.length > 0 || insights.productosEnRiesgo.length > 0 || insights.catEnColapso.length > 0) && (
        <div className="rounded-lg p-3 space-y-2" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sf-t5)' }}>Señales cruzadas</p>
          {insights.productosGancho.length > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--sf-t3)' }}>
              <span style={{ color: 'var(--sf-amber)' }}>Producto gancho:</span> {insights.productosGancho.map(p => p.producto).join(', ')} — inventario lento que este cliente compraba
            </p>
          )}
          {insights.productosEnRiesgo.length > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--sf-t3)' }}>
              <span style={{ color: 'var(--sf-red)' }}>Riesgo de quiebre:</span> {insights.productosEnRiesgo.map(p => p.producto).join(', ')} — stock bajo en productos que pedía
            </p>
          )}
          {insights.catEnColapso.length > 0 && (
            <p className="text-[11px]" style={{ color: 'var(--sf-t3)' }}>
              <span style={{ color: 'var(--sf-red)' }}>Categoría en colapso:</span> {insights.catEnColapso.map(c => `${c.cat} (${c.pct}%)`).join(', ')}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ZonaSupervisorContent({ data }: { data: PulsoPanelData }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--sf-t3)' }}>Meta de zona: <strong style={{ color: (data.metaZonaPct ?? 0) < 50 ? 'var(--sf-red)' : 'var(--sf-amber)', fontFamily: "'DM Mono', monospace" }}>{data.metaZonaPct}%</strong></p>
      </div>
      {data.vendedoresZona && data.vendedoresZona.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="grid text-[10px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 80px 70px', padding: '8px 12px', background: 'var(--sf-inset)', color: 'var(--sf-t5)' }}>
            <span>Vendedor</span><span className="text-center">Estado</span><span className="text-right">Meta%</span>
          </div>
          {data.vendedoresZona.map((v, i) => {
            const sColor = v.estado === 'critico' ? 'var(--sf-red)' : v.estado === 'riesgo' ? 'var(--sf-amber)' : v.estado === 'superando' ? 'var(--sf-green)' : 'var(--sf-t4)'
            return (
              <div key={v.vendedor} className="grid text-xs" style={{ gridTemplateColumns: '1fr 80px 70px', padding: '8px 12px', borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
                <span style={{ color: 'var(--sf-t1)' }}>{v.vendedor}</span>
                <span className="text-center text-[10px] font-semibold" style={{ color: sColor }}>{v.estado.toUpperCase()}</span>
                <span className="text-right" style={{ color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{v.metaPct != null ? `${Math.round(v.metaPct)}%` : '—'}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function OportunidadContent({ data }: { data: PulsoPanelData }) {
  return (
    <div className="space-y-5">
      <div className="rounded-lg p-4" style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}>
        <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t1)' }}>
          <strong>{data.cliente}</strong> compraba <strong>{data.producto}</strong>. Tienes <strong>{data.stock?.toLocaleString()} uds</strong> en stock con movimiento lento. Oportunidad de reactivación.
        </p>
      </div>
      <div className="rounded-lg p-3" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-xs" style={{ color: 'var(--sf-t3)' }}>Vendedor asignado: <strong style={{ color: 'var(--sf-t1)' }}>{data.vendedorAsignado}</strong></p>
      </div>
      <div className="rounded-lg p-3" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <p className="text-xs font-semibold" style={{ color: 'var(--sf-t1)' }}>Acción concreta:</p>
        <p className="text-xs mt-1" style={{ color: 'var(--sf-t3)' }}>Decirle a {data.vendedorAsignado} que llame a {data.cliente} y ofrezca {data.producto}. El producto ya está en bodega.</p>
      </div>
    </div>
  )
}

function ProductoDecliveContent({ data }: { data: PulsoPanelData }) {
  const { sales, vendorAnalysis, clientesDormidos, categoriaAnalysis, categoriasInventario } = useAppStore()

  const insights = useMemo(() => {
    if (!data.producto) return { vendedores: [], clientesPerdidos: [], catCtx: null, señales: [] }
    const sp = { year: new Date().getFullYear(), month: new Date().getMonth() }
    const prevMonth = sp.month === 0 ? { year: sp.year - 1, month: 11 } : { year: sp.year, month: sp.month - 1 }

    const ventasAct = sales.filter(s => s.producto === data.producto && new Date(s.fecha).getFullYear() === sp.year && new Date(s.fecha).getMonth() === sp.month)
    const ventasAnt = sales.filter(s => s.producto === data.producto && new Date(s.fecha).getFullYear() === prevMonth.year && new Date(s.fecha).getMonth() === prevMonth.month)

    // Vendedores
    const vendAct: Record<string, number> = {}, vendAnt: Record<string, number> = {}
    ventasAct.forEach(s => { vendAct[s.vendedor] = (vendAct[s.vendedor] ?? 0) + s.unidades })
    ventasAnt.forEach(s => { vendAnt[s.vendedor] = (vendAnt[s.vendedor] ?? 0) + s.unidades })
    const vendedores = Object.keys({ ...vendAct, ...vendAnt })
      .map(v => ({ vendedor: v, actual: vendAct[v] ?? 0, anterior: vendAnt[v] ?? 0, var_pct: (vendAnt[v] ?? 0) > 0 ? Math.round(((vendAct[v] ?? 0) - (vendAnt[v] ?? 0)) / (vendAnt[v] ?? 1) * 100) : 0, riesgo: vendorAnalysis.find(va => va.vendedor === v)?.riesgo ?? 'ok' }))
      .filter(v => v.anterior > 0 || v.actual > 0).sort((a, b) => a.var_pct - b.var_pct).slice(0, 5)

    // Clientes perdidos
    const cliAct: Record<string, number> = {}, cliAnt: Record<string, number> = {}
    ventasAct.forEach(s => { if (s.cliente) cliAct[s.cliente] = (cliAct[s.cliente] ?? 0) + s.unidades })
    ventasAnt.forEach(s => { if (s.cliente) cliAnt[s.cliente] = (cliAnt[s.cliente] ?? 0) + s.unidades })
    const clientesPerdidos = Object.entries(cliAnt).filter(([c]) => !cliAct[c])
      .map(([c, uds]) => ({ cliente: c, uds, esDormido: clientesDormidos.some(d => d.cliente === c) }))
      .sort((a, b) => b.uds - a.uds).slice(0, 3)

    const catCtx = categoriaAnalysis.find(c => c.categoria === data.categoria) ?? null

    // Build signals
    const señales: string[] = []
    const peores = vendedores.filter(v => v.var_pct < -30)
    if (peores.length > 0) señales.push(`${peores.length} vendedor${peores.length > 1 ? 'es' : ''} cayeron >30%: ${peores.slice(0, 2).map(v => `${v.vendedor} (${v.var_pct}%)`).join(', ')}`)
    if (clientesPerdidos.length > 0) {
      const dormidos = clientesPerdidos.filter(c => c.esDormido)
      señales.push(`${clientesPerdidos.length} cliente${clientesPerdidos.length > 1 ? 's' : ''} dejaron de comprarlo${dormidos.length ? ` (${dormidos.length} dormido${dormidos.length > 1 ? 's' : ''})` : ''}: ${clientesPerdidos.map(c => `${c.cliente} (${c.uds} uds)`).join(', ')}`)
    }
    if (catCtx && catCtx.tendencia === 'colapso') señales.push(`Categoría ${data.categoria} completa en colapso: ${Math.abs(Math.round(catCtx.variacion_pct))}% caída`)
    if (data.stock && data.stock > 0) señales.push(`${data.stock.toLocaleString()} uds en bodega (${data.diasInventario ?? '?'} días de stock)`)

    return { vendedores, clientesPerdidos, catCtx, señales }
  }, [data, sales, vendorAnalysis, clientesDormidos, categoriaAnalysis])

  return (
    <div className="space-y-4">
      {/* Narrative context */}
      <div style={{ background: 'color-mix(in srgb, var(--sf-red) 8%, transparent)', borderLeft: '3px solid var(--sf-red)', padding: '12px 16px', borderRadius: '0 8px 8px 0' }}>
        <p style={{ color: 'var(--sf-t2)', fontSize: '13px', lineHeight: 1.5, margin: 0 }}>
          <strong>{data.producto}</strong> era un producto top con promedio de {(data.promedioMensual ?? 0).toLocaleString()} uds/mes.
          Este mes lleva {(data.ventas_mes_actual ?? 0).toLocaleString()} uds (día {data.diasTranscurridos}/{data.diasTotales}).
          {insights.catCtx ? ` La categoría ${data.categoria} completa cayó ${Math.abs(Math.round(insights.catCtx.variacion_pct))}%.` : ''}
        </p>
      </div>

      {/* Metrics grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Caída</div>
          <div className="text-xl font-bold" style={{ color: 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>-{data.caida_pct ?? 0}%</div>
        </div>
        <div className="rounded-lg p-3" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="text-[10px] uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t4)' }}>Stock</div>
          <div className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>{(data.stock ?? 0).toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds</span></div>
        </div>
      </div>

      {/* Why? signals */}
      {insights.señales.length > 0 && (
        <div>
          <h3 className="text-[13px] font-semibold uppercase mb-2" style={{ color: 'var(--sf-t3)' }}>¿Por qué?</h3>
          {insights.señales.map((s, i) => (
            <div key={i} className="text-[12px] rounded-md mb-1.5 p-2.5" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>
              {s}
            </div>
          ))}
        </div>
      )}

      {/* Vendor table */}
      {insights.vendedores.length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
          <div className="grid text-[10px] font-semibold uppercase tracking-wider" style={{ gridTemplateColumns: '1fr 60px 60px 60px', padding: '8px 12px', background: 'var(--sf-inset)', color: 'var(--sf-t5)' }}>
            <span>Vendedor</span><span className="text-right">Actual</span><span className="text-right">Anterior</span><span className="text-right">Var%</span>
          </div>
          {insights.vendedores.map((v, i) => (
            <div key={v.vendedor} className="grid text-xs" style={{ gridTemplateColumns: '1fr 60px 60px 60px', padding: '6px 12px', borderTop: i ? '1px solid var(--sf-border)' : undefined }}>
              <span style={{ color: 'var(--sf-t1)' }}>{v.vendedor}</span>
              <span className="text-right" style={{ color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>{v.actual}</span>
              <span className="text-right" style={{ color: 'var(--sf-t4)', fontFamily: "'DM Mono', monospace" }}>{v.anterior}</span>
              <span className="text-right font-semibold" style={{ color: v.var_pct >= 0 ? 'var(--sf-green)' : 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>{v.var_pct > 0 ? '+' : ''}{v.var_pct}%</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
