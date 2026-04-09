import { useState, useEffect } from 'react'

const TOUR_KEY = 'sf_onboarding_tour_done'

const STEPS = [
  { target: '.sf-sidebar', text: 'Navega por las secciones de tu análisis', position: 'right' as const },
  { target: '[href$="/cargar"]', text: 'Sube tu archivo de ventas aquí para empezar', position: 'right' as const },
  { target: '[href$="/chat"]', text: 'Pregúntale a la IA qué hacer hoy', position: 'right' as const },
]

export function useShowTour(hasData: boolean) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (hasData) return
    try {
      if (!localStorage.getItem(TOUR_KEY)) setShow(true)
    } catch { /* */ }
  }, [hasData])
  return show
}

export default function OnboardingTour({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; width: number; height: number } | null>(null)

  useEffect(() => {
    const el = document.querySelector(STEPS[step].target)
    if (!el) { handleFinish(); return }
    const rect = el.getBoundingClientRect()
    setPos({ top: rect.top, left: rect.left, width: rect.width, height: rect.height })
  }, [step])

  const handleFinish = () => {
    try { localStorage.setItem(TOUR_KEY, 'true') } catch { /* */ }
    onClose()
  }

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1)
    else handleFinish()
  }

  if (!pos) return null

  const s = STEPS[step]
  const tooltipTop = pos.top + pos.height / 2 - 30
  const tooltipLeft = pos.left + pos.width + 16

  return (
    <div className="fixed inset-0 z-[9999]">
      {/* Overlay with spotlight cutout */}
      <div className="absolute inset-0 bg-black/50" onClick={handleFinish} />
      {/* Spotlight */}
      <div
        className="absolute rounded-lg"
        style={{
          top: pos.top - 4,
          left: pos.left - 4,
          width: pos.width + 8,
          height: pos.height + 8,
          boxShadow: '0 0 0 9999px rgba(0,0,0,0.5)',
          zIndex: 1,
        }}
      />
      {/* Tooltip */}
      <div
        className="absolute rounded-xl p-4 shadow-2xl"
        style={{
          top: Math.max(16, Math.min(tooltipTop, window.innerHeight - 120)),
          left: Math.min(tooltipLeft, window.innerWidth - 300),
          width: 260,
          background: '#ffffff',
          border: '1px solid #e2e6ef',
          zIndex: 2,
        }}
      >
        <p className="text-sm font-medium mb-3" style={{ color: '#1a1a2e' }}>{s.text}</p>
        <div className="flex items-center justify-between">
          <span className="text-xs" style={{ color: '#94a3b8' }}>{step + 1} de {STEPS.length}</span>
          <div className="flex gap-2">
            <button
              onClick={handleFinish}
              className="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style={{ color: '#64748b' }}
            >
              Omitir
            </button>
            <button
              onClick={handleNext}
              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white"
              style={{ background: '#10b981' }}
            >
              {step < STEPS.length - 1 ? 'Siguiente' : 'Entendido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
