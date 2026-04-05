import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Lock, ArrowRight, X } from 'lucide-react'
import type { FeatureKey } from '../../lib/subscription'
import { getRequiredPlan, getPlanLabel } from '../../lib/subscription'

const FEATURE_LABELS: Record<FeatureKey, string> = {
  trend_indicators:     'Indicadores de tendencia',
  period_comparison:    'Comparativa de períodos',
  chat_ia_unlimited:    'Chat IA ilimitado',
  pdf_branding:         'PDF con branding',
  collaborative_notes:  'Notas colaborativas',
  history_18_months:    'Historial de 18 meses',
  multi_user:           'Múltiples usuarios',
  roles_permissions:    'Roles y permisos',
  supervisor_dashboard: 'Dashboard de supervisores',
}

interface UpgradePromptProps {
  feature: FeatureKey
  inline?: boolean
  onClose?: () => void
}

export default function UpgradePrompt({ feature, inline, onClose }: UpgradePromptProps) {
  const [visible, setVisible] = useState(true)
  const requiredPlan = getRequiredPlan(feature)
  const planLabel = getPlanLabel(requiredPlan)
  const featureLabel = FEATURE_LABELS[feature]

  const handleClose = () => {
    setVisible(false)
    onClose?.()
  }

  if (!visible) return null

  // Inline variant — small card within the page
  if (inline) {
    return (
      <div
        className="rounded-xl p-4 flex items-start gap-3"
        style={{
          background: 'var(--sf-inset)',
          border: '1px solid var(--sf-border)',
        }}
      >
        <div
          className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: 'rgba(0,214,143,0.1)' }}
        >
          <Lock className="w-4 h-4 text-[#00D68F]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium" style={{ color: 'var(--sf-t1)' }}>
            {featureLabel} — Plan {planLabel}
          </p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--sf-t4)' }}>
            Mejora tu plan para desbloquear esta función.
          </p>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-1 text-xs font-semibold mt-2 transition-opacity hover:opacity-80"
            style={{ color: '#00D68F' }}
          >
            Ver planes <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </div>
    )
  }

  // Modal variant — overlay
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
      onClick={handleClose}
    >
      <div
        className="relative w-full max-w-sm rounded-2xl p-6 shadow-2xl"
        style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {onClose && (
          <button
            onClick={handleClose}
            className="absolute top-3 right-3 p-1 rounded-lg transition-colors"
            style={{ color: 'var(--sf-t5)' }}
          >
            <X className="w-4 h-4" />
          </button>
        )}

        <div className="flex justify-center mb-4">
          <div
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(0,214,143,0.1)', border: '1px solid rgba(0,214,143,0.2)' }}
          >
            <Lock className="w-5 h-5 text-[#00D68F]" />
          </div>
        </div>

        <div className="text-center space-y-2 mb-6">
          <h3 className="text-lg font-bold" style={{ color: 'var(--sf-t1)' }}>
            Función del plan {planLabel}
          </h3>
          <p className="text-sm" style={{ color: 'var(--sf-t3)' }}>
            <strong>{featureLabel}</strong> está disponible en el plan {planLabel}.
            Mejora tu plan para desbloquear esta función.
          </p>
        </div>

        <div className="space-y-2">
          <Link
            to="/pricing"
            className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#00D68F' }}
            onClick={handleClose}
          >
            Ver planes
          </Link>
          <button
            onClick={handleClose}
            className="block w-full text-center px-4 py-2 rounded-xl text-sm font-medium transition-colors"
            style={{ color: 'var(--sf-t4)' }}
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  )
}
