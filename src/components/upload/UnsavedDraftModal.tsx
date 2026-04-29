import { useEffect, useRef } from 'react'

interface Props {
  open: boolean
  onConfirmLeave: () => void
  onCancelLeave: () => void
}

export default function UnsavedDraftModal({ open, onConfirmLeave, onCancelLeave }: Props) {
  const stayRef = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    if (!open) return
    stayRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancelLeave()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onCancelLeave])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="unsaved-draft-title"
      className="fixed inset-0 z-50 flex items-center justify-center"
    >
      <div
        className="absolute inset-0 bg-black/60"
        onClick={onCancelLeave}
        aria-hidden="true"
      />
      <div
        className="relative max-w-md w-full mx-4 rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
      >
        <h2 id="unsaved-draft-title" className="text-lg font-bold mb-2" style={{ color: 'var(--sf-t1)' }}>
          Tenés un wizard a medias
        </h2>
        <p className="text-sm mb-6 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Si salís ahora, podrás reanudarlo después desde Cargar datos.
        </p>
        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onConfirmLeave}
            className="px-4 py-2 rounded-xl text-sm font-medium hover:opacity-80 transition-opacity"
            style={{ color: 'var(--sf-t3)' }}
          >
            Reanudar después
          </button>
          <button
            ref={stayRef}
            type="button"
            onClick={onCancelLeave}
            className="px-4 py-2 rounded-xl text-sm font-bold transition-colors"
            style={{ background: '#00B894', color: '#000' }}
          >
            Quedarme aquí
          </button>
        </div>
      </div>
    </div>
  )
}
