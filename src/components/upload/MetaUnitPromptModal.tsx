import { useState } from 'react'

interface Props {
  detectedHeader: string
  onConfirm: (unit: 'unidades' | 'venta_neta') => void
  onCancel: () => void
}

/**
 * [1.6.2] Modal bloqueante: aparece cuando el header de metas es ambiguo
 * (ej. "Meta", "Cuota") — no podemos decidir USD vs uds por el nombre.
 * Forza elección consciente del usuario antes de marcar el step loaded.
 *
 * Bloqueante: no se cierra con click fuera ni Esc. Solo Cancelar/Confirmar.
 */
export default function MetaUnitPromptModal({ detectedHeader, onConfirm, onCancel }: Props) {
  const [choice, setChoice] = useState<'unidades' | 'venta_neta' | null>(null)

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="meta-unit-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div className="absolute inset-0 bg-black/60" aria-hidden="true" />
      <div
        className="relative max-w-md w-full mx-4 rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
      >
        <h2 id="meta-unit-prompt-title" className="text-lg font-bold mb-2" style={{ color: 'var(--sf-t1)' }}>
          Confirmá la unidad de tu meta
        </h2>
        <p className="text-sm mb-5 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Detectamos la columna <span className="font-bold" style={{ color: 'var(--sf-t1)' }}>"{detectedHeader}"</span> en tu archivo. Confirmá en qué unidad están los valores para interpretarlos correctamente:
        </p>

        <div className="flex flex-col gap-3 mb-6">
          <label
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
            style={{
              background: choice === 'unidades' ? 'rgba(0,184,148,0.1)' : 'var(--sf-inset)',
              border: `1px solid ${choice === 'unidades' ? '#00B894' : 'var(--sf-border)'}`,
            }}
          >
            <input
              type="radio"
              name="meta-unit"
              value="unidades"
              checked={choice === 'unidades'}
              onChange={() => setChoice('unidades')}
              className="cursor-pointer"
            />
            <span className="text-sm" style={{ color: 'var(--sf-t1)' }}>
              Unidades vendidas (ej: 150 productos)
            </span>
          </label>

          <label
            className="flex items-center gap-3 p-3 rounded-xl cursor-pointer hover:opacity-90 transition-opacity"
            style={{
              background: choice === 'venta_neta' ? 'rgba(0,184,148,0.1)' : 'var(--sf-inset)',
              border: `1px solid ${choice === 'venta_neta' ? '#00B894' : 'var(--sf-border)'}`,
            }}
          >
            <input
              type="radio"
              name="meta-unit"
              value="venta_neta"
              checked={choice === 'venta_neta'}
              onChange={() => setChoice('venta_neta')}
              className="cursor-pointer"
            />
            <span className="text-sm" style={{ color: 'var(--sf-t1)' }}>
              USD — dólares (ej: $15,000)
            </span>
          </label>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--sf-t3)' }}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => choice && onConfirm(choice)}
            disabled={choice === null}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: '#00B894', color: '#000' }}
          >
            Confirmar
          </button>
        </div>
      </div>
    </div>
  )
}
