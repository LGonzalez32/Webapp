import { Link } from 'react-router-dom'
import { Clock, AlertTriangle, XCircle } from 'lucide-react'
import { useSubscription } from '../../lib/useSubscription'

/**
 * Banner shown at top of the app when user is in trial or trial has expired.
 * - Active trial: informational green/neutral
 * - ≤3 days left: amber warning
 * - Expired: red alert
 */
export default function TrialBanner() {
  const { plan, isTrialActive, trialDaysLeft } = useSubscription()

  // Don't show for paid plans
  if (plan !== 'trial' && plan !== 'esencial') return null
  // If on esencial (post-trial), show expired banner
  // If on trial, show trial info

  const isExpired = !isTrialActive && plan === 'esencial'
  const isWarning = isTrialActive && trialDaysLeft <= 3
  const isNormal = isTrialActive && trialDaysLeft > 3

  if (!isExpired && !isTrialActive) return null

  const bgColor = isExpired
    ? 'rgba(239,68,68,0.08)'
    : isWarning
      ? 'rgba(245,158,11,0.08)'
      : 'rgba(0,214,143,0.06)'

  const borderColor = isExpired
    ? 'rgba(239,68,68,0.2)'
    : isWarning
      ? 'rgba(245,158,11,0.2)'
      : 'rgba(0,214,143,0.15)'

  const textColor = isExpired
    ? 'var(--sf-red, #ef4444)'
    : isWarning
      ? 'var(--sf-amber, #f59e0b)'
      : 'var(--sf-t3)'

  const Icon = isExpired ? XCircle : isWarning ? AlertTriangle : Clock

  return (
    <div
      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium"
      style={{ background: bgColor, borderBottom: `1px solid ${borderColor}`, color: textColor }}
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      {isExpired ? (
        <span>Tu prueba ha expirado. Elige un plan para desbloquear todas las funciones.</span>
      ) : isWarning ? (
        <span>Te quedan {trialDaysLeft} día{trialDaysLeft !== 1 ? 's' : ''} de prueba gratuita.</span>
      ) : (
        <span>Estás en tu prueba gratuita — Te quedan {trialDaysLeft} días.</span>
      )}
      <Link
        to="/pricing"
        className="ml-1 font-semibold underline underline-offset-2 transition-opacity hover:opacity-80"
        style={{ color: isExpired ? 'var(--sf-red, #ef4444)' : isWarning ? 'var(--sf-amber, #f59e0b)' : '#00D68F' }}
      >
        Elegir plan
      </Link>
    </div>
  )
}
