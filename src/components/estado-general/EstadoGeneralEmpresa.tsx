// [PR-FIX.7] Bloque "Estado general de la empresa" — 4 párrafos convergentes.
// Reemplaza el antiguo "Resumen del mes" (bullets). Independiente de las
// alertas de "Diagnóstico del Mes" — este bloque es estado global en prosa.

import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../store/appStore'
import { computeEstadoGeneral } from '../../lib/estadoGeneralHelpers'

export default function EstadoGeneralEmpresa() {
  const sales             = useAppStore(s => s.sales)
  const vendorAnalysis    = useAppStore(s => s.vendorAnalysis)
  const categoriaAnalysis = useAppStore(s => s.categoriaAnalysis)
  const canalAnalysis     = useAppStore(s => s.canalAnalysis)
  const selectedPeriod    = useAppStore(s => s.selectedPeriod)

  const data = useMemo(
    () => computeEstadoGeneral(
      sales,
      selectedPeriod.year,
      selectedPeriod.month,
      vendorAnalysis,
      categoriaAnalysis,
      canalAnalysis,
    ),
    [sales, selectedPeriod.year, selectedPeriod.month, vendorAnalysis, categoriaAnalysis, canalAnalysis],
  )

  // [PR-FIX.7.1 — B.1/T1/H19] guard de emisión única: antes emitía 9× por
  // re-render en StrictMode. useRef + useEffect con dep `data` asegura 1 por carga.
  const emitted = useRef(false)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    if (emitted.current) return
    emitted.current = true
    console.debug('[PR-FIX.7] estado_general_audit', {
      parrafos_rendered: [
        data.parrafoNegocio          ? 'negocio' : null,
        data.parrafoTerritorialCanal ? 'territorialCanal' : null,
        data.parrafoClientesProd     ? 'clientesProductos' : null,
        data.parrafoCategorias       ? 'categorias' : null,
      ].filter(Boolean).length,
      parrafos_skipped: [
        !data.parrafoNegocio          ? 'negocio' : null,
        !data.parrafoTerritorialCanal ? 'territorialCanal' : null,
        !data.parrafoClientesProd     ? 'clientesProductos' : null,
        !data.parrafoCategorias       ? 'categorias' : null,
      ].filter((x): x is string => !!x),
      senales_convergentes:        data.senalesConvergentes,
      subtitulo:                    data.subtitulo,
      accion_prioritaria_sujeto:    data.accionPrioritaria?.sujeto ?? null,
      accion_prioritaria_ventana:   data.accionPrioritaria?.ventana ?? null,
      dimensions_used:              data.dimensionsUsed,
    })
  }, [data])

  const parrafos = [
    data.parrafoNegocio,
    data.parrafoTerritorialCanal,
    data.parrafoClientesProd,
    data.parrafoCategorias,
  ].filter((p): p is NonNullable<typeof p> => p !== null)

  if (parrafos.length === 0) return null

  return (
    <section
      className="intel-fade rounded-xl p-5"
      style={{ animationDelay: '100ms', background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span style={{ fontSize: 14, color: 'var(--sf-green)' }}>✦</span>
            <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--sf-t5)' }}>
              Estado general de la empresa
            </p>
          </div>
          <p className="text-[13px] font-medium mt-1" style={{ color: 'var(--sf-t2)' }}>
            {data.subtitulo}
          </p>
        </div>
        {data.senalesConvergentes > 0 && (
          <span
            className="text-[10px] font-semibold px-2 py-1 rounded whitespace-nowrap shrink-0"
            style={{
              color:      'var(--sf-t3)',
              background: 'var(--sf-overlay-light)',
              border:     '1px solid var(--sf-border-subtle)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {data.senalesConvergentes} señal{data.senalesConvergentes === 1 ? '' : 'es'} convergente{data.senalesConvergentes === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {/* Párrafos */}
      <div className="space-y-2">
        {parrafos.map((p, i) => (
          <p
            key={i}
            className="text-[13px] leading-relaxed rounded-lg px-3 py-2"
            style={{
              color:      'var(--sf-t2)',
              background: 'var(--sf-overlay-light)',
              border:     '1px solid var(--sf-border-subtle)',
            }}
          >
            {p.texto}
          </p>
        ))}
      </div>

      {/* Cierre con acción prioritaria */}
      {data.accionPrioritaria && (
        <div className="mt-4 pt-3 flex items-center gap-2 flex-wrap" style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
          <span className="text-[13px]" style={{ color: 'var(--sf-green)' }}>→</span>
          <p className="text-[13px] flex-1 min-w-0" style={{ color: 'var(--sf-t2)' }}>
            {data.accionPrioritaria.texto}
          </p>
          <span
            className="text-[10px] font-semibold px-2 py-0.5 rounded whitespace-nowrap"
            style={{
              color:      'var(--sf-green)',
              background: 'rgba(34,197,94,0.08)',
              border:     '1px solid rgba(34,197,94,0.2)',
              fontFamily: 'ui-monospace, monospace',
            }}
          >
            {data.accionPrioritaria.ventana}
          </span>
        </div>
      )}
    </section>
  )
}
