import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { supabase } from './supabaseClient'
import type { PlanType, FeatureKey } from './subscription'
import { canAccessFeature, getChatUsage, getChatLimit } from './subscription'

interface SubscriptionState {
  plan: PlanType
  isTrialActive: boolean
  trialDaysLeft: number
  trialEndsAt: Date | null
  loading: boolean
  canAccess: (feature: FeatureKey) => boolean
  chatUsed: number
  chatLimit: number | null
}

/**
 * Hook that reads the user's subscription from Supabase.
 * During trial (14 days), user has full Profesional access.
 * After trial expires without a paid plan, degrades to Esencial.
 */
export function useSubscription(): SubscriptionState {
  const userId = useAuthStore((s) => s.user?.id ?? null)
  const orgId = useOrgStore((s) => s.org?.id ?? null)
  const [plan, setPlan] = useState<PlanType>('trial')
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId || !orgId) {
      setPlan('trial')
      setTrialEndsAt(null)
      setLoading(false)
      return
    }

    let cancelled = false
    async function fetchSubscription() {
      setLoading(true)
      try {
        const { data, error } = await supabase
          .from('subscriptions')
          .select('plan, current_period_end')
          .eq('organization_id', orgId!)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          // No subscription row — treat as trial
          setPlan('trial')
          setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
        } else {
          const dbPlan = data.plan as PlanType
          const trialEnd = data.current_period_end ? new Date(data.current_period_end) : null

          if (dbPlan === 'trial' && trialEnd && trialEnd < new Date()) {
            // Trial expired → degrade to esencial
            setPlan('esencial')
          } else {
            setPlan(dbPlan)
          }
          setTrialEndsAt(trialEnd)
        }
      } catch {
        // Default to trial on any error
        setPlan('trial')
        setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSubscription()
    return () => { cancelled = true }
  }, [userId, orgId])

  const now = new Date()
  const isTrialActive = plan === 'trial' && !!trialEndsAt && trialEndsAt > now
  const trialDaysLeft = isTrialActive && trialEndsAt
    ? Math.max(0, Math.ceil((trialEndsAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0

  // Effective plan: if trial is active, user gets Profesional features
  const effectivePlan: PlanType = isTrialActive ? 'profesional' : plan

  const canAccess = useCallback(
    (feature: FeatureKey) => canAccessFeature(effectivePlan, feature),
    [effectivePlan],
  )

  const usage = getChatUsage()
  const chatLimit = getChatLimit(effectivePlan)

  return {
    plan: effectivePlan,
    isTrialActive,
    trialDaysLeft,
    trialEndsAt,
    loading,
    canAccess,
    chatUsed: usage.count,
    chatLimit,
  }
}
