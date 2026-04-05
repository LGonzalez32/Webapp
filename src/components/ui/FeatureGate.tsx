import type { ReactNode } from 'react'
import { useSubscription } from '../../lib/useSubscription'
import type { FeatureKey } from '../../lib/subscription'
import UpgradePrompt from './UpgradePrompt'

interface FeatureGateProps {
  feature: FeatureKey
  children: ReactNode
  fallback?: ReactNode
}

/**
 * Renders children only if the user's plan allows the feature.
 * Otherwise renders fallback (defaults to UpgradePrompt).
 */
export default function FeatureGate({ feature, children, fallback }: FeatureGateProps) {
  const { canAccess } = useSubscription()

  if (canAccess(feature)) {
    return <>{children}</>
  }

  return <>{fallback ?? <UpgradePrompt feature={feature} />}</>
}
