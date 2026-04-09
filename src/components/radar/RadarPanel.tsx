import { X } from 'lucide-react'
import type { RadarPanelData } from '../../lib/radar-engine'

interface Props {
  data: RadarPanelData
  moneda: string
  onClose: () => void
  onChat: (question: string) => void
}

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return Math.round(n).toLocaleString()
}

export default function RadarPanel({ data, moneda, onClose, onChat }: Props) {
  return (
    <>
      <style>{`@keyframes sf-panel-in { from { transform: translateX(100%); } to { transform: translateX(0); } }`}</style>
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
        {/* Header */}
        <div className="shrink-0 relative" style={{ padding: '24px 24px 16px', borderBottom: '1px solid var(--sf-border)' }}>
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
            style={{ color: 'var(--sf-t4)', background: 'var(--sf-inset)' }}
          >
            <X className="w-4 h-4" />
          </button>
          <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: 'var(--sf-t6)' }}>RADAR</p>

          {data.panelType === 'categorias_colapso' && data.categorias && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>
                {data.categorias.length} categoría{data.categorias.length > 1 ? 's' : ''} se desplomaron
              </h2>
              <p className="text-xs mt-0.5" style={{ color: 'var(--sf-t4)' }}>Más de 50% de caída</p>
            </>
          )}

          {data.panelType === 'inventario_riesgo' && (
            <>
              <h2 className="text-lg font-bold pr-10" style={{ color: 'var(--sf-t1)' }}>
                {data.producto}
              </h2>
              <span
                className="inline-block text-[10px] font-bold px-2 py-0.5 rounded mt-1"
                style={{ background: 'var(--sf-red-bg)', color: 'var(--sf-red)', border: '1px solid var(--sf-red-border)' }}
              >
                RIESGO DE QUIEBRE
              </span>
            </>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto" style={{ padding: '20px 24px' }}>
          {data.panelType === 'categorias_colapso' && data.categorias && (
            <CategoriasContent categorias={data.categorias} moneda={moneda} />
          )}
          {data.panelType === 'inventario_riesgo' && (
            <InventarioContent
              stock={data.stock ?? 0}
              dias={data.diasInventario ?? 0}
              promedio={data.promedioMensual ?? 0}
            />
          )}
        </div>

        {/* Footer: IA button */}
        <div className="shrink-0" style={{ padding: '16px 24px', borderTop: '1px solid var(--sf-border)' }}>
          <button
            onClick={() => onChat(data.chatQuestion)}
            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
            style={{ background: 'var(--sf-green)', color: '#fff' }}
          >
            ✦ Profundizar con IA →
          </button>
        </div>
      </div>
    </>
  )
}

// ─── Categorias Content ─────────────────────────────────────────────────────

function CategoriasContent({ categorias, moneda }: { categorias: Array<{ nombre: string; caida: number; perdidaUSD: number }>; moneda: string }) {
  const total = categorias.reduce((s, c) => s + c.perdidaUSD, 0)
  const hasUSD = total > 0

  return (
    <div className="space-y-4">
      {/* Table */}
      <div className="rounded-lg overflow-hidden" style={{ border: '1px solid var(--sf-border)' }}>
        {/* Header */}
        <div
          className="grid text-[10px] font-semibold uppercase tracking-wider"
          style={{
            gridTemplateColumns: hasUSD ? '1fr 80px 90px' : '1fr 80px',
            padding: '8px 12px',
            background: 'var(--sf-inset)',
            color: 'var(--sf-t5)',
          }}
        >
          <span>Categoría</span>
          <span className="text-right">Caída</span>
          {hasUSD && <span className="text-right">Pérdida</span>}
        </div>
        {/* Rows */}
        {categorias.map((c, i) => (
          <div
            key={c.nombre}
            className="grid text-xs"
            style={{
              gridTemplateColumns: hasUSD ? '1fr 80px 90px' : '1fr 80px',
              padding: '10px 12px',
              background: i % 2 === 0 ? 'transparent' : 'var(--sf-overlay-subtle)',
              borderTop: '1px solid var(--sf-border)',
            }}
          >
            <span className="font-medium" style={{ color: 'var(--sf-t1)' }}>{c.nombre}</span>
            <span className="text-right font-semibold" style={{ color: 'var(--sf-red)', fontFamily: "'DM Mono', monospace" }}>
              -{c.caida.toFixed(1)}%
            </span>
            {hasUSD && (
              <span className="text-right" style={{ color: 'var(--sf-t3)', fontFamily: "'DM Mono', monospace" }}>
                {moneda} {fmtK(c.perdidaUSD)}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Total */}
      {hasUSD && (
        <div className="flex justify-end">
          <span className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>
            Total en riesgo: {moneda} {fmtK(total)}
          </span>
        </div>
      )}
    </div>
  )
}

// ─── Inventario Content ─────────────────────────────────────────────────────

function InventarioContent({ stock, dias, promedio }: { stock: number; dias: number; promedio: number }) {
  // Estimated stockout date
  const quiebreDate = new Date()
  quiebreDate.setDate(quiebreDate.getDate() + dias)
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const quiebreLabel = `${quiebreDate.getDate()} de ${meses[quiebreDate.getMonth()]}`
  const barPct = Math.min(dias / 30 * 100, 100)

  return (
    <div className="space-y-5">
      {/* Two KPI boxes */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Stock actual</p>
          <p className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>
            {stock.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds</span>
          </p>
        </div>
        <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--sf-t5)' }}>Ritmo de venta</p>
          <p className="text-xl font-bold" style={{ color: 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>
            {promedio.toLocaleString()} <span className="text-xs font-normal" style={{ color: 'var(--sf-t4)' }}>uds/mes</span>
          </p>
        </div>
      </div>

      {/* Days of inventory bar */}
      <div className="rounded-lg p-4" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sf-t5)' }}>Días de inventario</p>
          <p className="text-lg font-bold" style={{ color: dias <= 7 ? 'var(--sf-red)' : dias <= 14 ? 'var(--sf-amber)' : 'var(--sf-t1)', fontFamily: "'DM Mono', monospace" }}>
            {dias} días
          </p>
        </div>
        <div className="h-3 rounded-full overflow-hidden" style={{ background: 'var(--sf-border)' }}>
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${barPct}%`,
              background: dias <= 7 ? 'var(--sf-red)' : dias <= 14 ? 'var(--sf-amber)' : 'var(--sf-green)',
            }}
          />
        </div>
      </div>

      {/* Urgency message */}
      <p className="text-sm italic" style={{ color: 'var(--sf-t4)' }}>
        Si no se repone, se agota el {quiebreLabel}.
      </p>
    </div>
  )
}
