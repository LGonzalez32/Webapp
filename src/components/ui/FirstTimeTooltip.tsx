import { useState, useEffect } from 'react'

interface FirstTimeTooltipProps {
  storageKey: string
  text: string
  position?: 'top' | 'bottom'
  globalKey?: string
}

export default function FirstTimeTooltip({
  storageKey,
  text,
  position = 'bottom',
  globalKey = 'salesflow_dashboard_tooltips_seen',
}: FirstTimeTooltipProps) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const globalDismissed = localStorage.getItem(globalKey)
    const localDismissed = localStorage.getItem(storageKey)
    if (!globalDismissed && !localDismissed) {
      const timer = setTimeout(() => setVisible(true), 600)
      return () => clearTimeout(timer)
    }
  }, [storageKey, globalKey])

  if (!visible) return null

  const handleDismiss = () => {
    localStorage.setItem(storageKey, 'true')
    setVisible(false)
  }

  const isTop = position === 'top'

  return (
    <div
      className="absolute z-40 max-w-xs"
      style={{
        ...(isTop ? { bottom: '100%', marginBottom: 8 } : { top: '100%', marginTop: 8 }),
        left: 0,
        animation: 'sfTooltipIn 0.3s ease forwards',
      }}
    >
      <style>{`@keyframes sfTooltipIn{from{opacity:0;transform:translateY(${isTop ? '4px' : '-4px'})}to{opacity:1;transform:translateY(0)}}`}</style>
      <div
        className="relative rounded-lg px-3.5 py-2.5 shadow-lg"
        style={{ background: '#00D68F', color: '#fff' }}
      >
        <div className="flex items-start gap-2">
          <p className="text-xs leading-relaxed flex-1">{text}</p>
          <button
            onClick={handleDismiss}
            className="shrink-0 text-white/70 hover:text-white text-xs font-bold mt-0.5 transition-colors"
          >
            Entendido
          </button>
        </div>
        {/* Arrow */}
        <span
          className="absolute left-4"
          style={{
            ...(isTop
              ? { top: '100%', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderTop: '6px solid #00D68F' }
              : { bottom: '100%', borderLeft: '6px solid transparent', borderRight: '6px solid transparent', borderBottom: '6px solid #00D68F' }),
          }}
        />
      </div>
    </div>
  )
}
