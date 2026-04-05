import { useState, useEffect, useCallback } from 'react'
import { useAuthStore } from '../store/authStore'
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
  const [plan, setPlan] = useState<PlanType>('trial')
  const [trialEndsAt, setTrialEndsAt] = useState<Date | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) {
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
          .from('user_subscriptions')
          .select('plan, trial_ends_at')
          .eq('user_id', userId!)
          .maybeSingle()

        if (cancelled) return

        if (error || !data) {
          // No subscription row — treat as trial (table might not exist yet)
          setPlan('trial')
          setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
        } else {
          const dbPlan = data.plan as PlanType
          const trialEnd = data.trial_ends_at ? new Date(data.trial_ends_at) : null

          if (dbPlan === 'trial' && trialEnd && trialEnd < new Date()) {
            // Trial expired → degrade to esencial
            setPlan('esencial')
          } else {
            setPlan(dbPlan)
          }
          setTrialEndsAt(trialEnd)
        }
      } catch {
        // Supabase table doesn't exist yet — default to trial
        setPlan('trial')
        setTrialEndsAt(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000))
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    fetchSubscription()
    return () => { cancelled = true }
  }, [userId])

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
