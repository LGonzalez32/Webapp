/**
 * Feature gating system for SalesFlow plans.
 *
 * SQL to run in Supabase (create table if not exists):
 * ───────────────────────────────────────────────────
 * CREATE TABLE IF NOT EXISTS user_subscriptions (
 *   id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
 *   user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
 *   plan text NOT NULL DEFAULT 'trial' CHECK (plan IN ('trial','esencial','profesional','empresa')),
 *   trial_ends_at timestamptz DEFAULT now() + interval '14 days',
 *   plan_started_at timestamptz DEFAULT now(),
 *   created_at timestamptz DEFAULT now()
 * );
 *
 * ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Users can read own subscription"
 *   ON user_subscriptions FOR SELECT USING (auth.uid() = user_id);
 * CREATE POLICY "Service role can manage subscriptions"
 *   ON user_subscriptions FOR ALL USING (true);
 *
 * -- Insert default trial for new users (trigger):
 * CREATE OR REPLACE FUNCTION create_default_subscription()
 * RETURNS trigger AS $$
 * BEGIN
 *   INSERT INTO user_subscriptions (user_id) VALUES (NEW.id);
 *   RETURN NEW;
 * END;
 * $$ LANGUAGE plpgsql SECURITY DEFINER;
 *
 * CREATE TRIGGER on_auth_user_created
 *   AFTER INSERT ON auth.users
 *   FOR EACH ROW EXECUTE FUNCTION create_default_subscription();
 * ───────────────────────────────────────────────────
 */

export type PlanType = 'trial' | 'esencial' | 'profesional' | 'empresa'

export type FeatureKey =
  | 'trend_indicators'
  | 'period_comparison'
  | 'chat_ia_unlimited'
  | 'pdf_branding'
  | 'collaborative_notes'
  | 'history_18_months'
  | 'multi_user'
  | 'roles_permissions'
  | 'supervisor_dashboard'

/** Which plan is required to access each feature */
const FEATURE_PLAN_MAP: Record<FeatureKey, PlanType> = {
  trend_indicators:     'profesional',
  period_comparison:    'profesional',
  chat_ia_unlimited:    'profesional',
  pdf_branding:         'profesional',
  collaborative_notes:  'profesional',
  history_18_months:    'profesional',
  multi_user:           'profesional',
  roles_permissions:    'empresa',
  supervisor_dashboard: 'empresa',
}

const PLAN_HIERARCHY: Record<PlanType, number> = {
  trial: 3,       // trial = full Profesional access
  esencial: 1,
  profesional: 2,
  empresa: 3,
}

export function canAccessFeature(plan: PlanType, feature: FeatureKey): boolean {
  const requiredPlan = FEATURE_PLAN_MAP[feature]
  return PLAN_HIERARCHY[plan] >= PLAN_HIERARCHY[requiredPlan]
}

export function getRequiredPlan(feature: FeatureKey): PlanType {
  return FEATURE_PLAN_MAP[feature]
}

export function getPlanLabel(plan: PlanType): string {
  const labels: Record<PlanType, string> = {
    trial: 'Prueba gratuita',
    esencial: 'Esencial',
    profesional: 'Profesional',
    empresa: 'Empresa',
  }
  return labels[plan]
}

export function getMaxUsers(plan: PlanType): number {
  if (plan === 'empresa') return Infinity
  if (plan === 'profesional' || plan === 'trial') return 5
  return 1
}

export function getChatLimit(plan: PlanType): number | null {
  if (plan === 'esencial') return 10
  return null // unlimited
}

// ── Chat usage counter (localStorage for now) ──────────────────────────────

const CHAT_USAGE_KEY = 'sf_chat_usage'

interface ChatUsage {
  month: string // "2026-04"
  count: number
}

function getCurrentMonth(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function getChatUsage(): ChatUsage {
  try {
    const raw = localStorage.getItem(CHAT_USAGE_KEY)
    if (!raw) return { month: getCurrentMonth(), count: 0 }
    const parsed: ChatUsage = JSON.parse(raw)
    if (parsed.month !== getCurrentMonth()) {
      return { month: getCurrentMonth(), count: 0 }
    }
    return parsed
  } catch {
    return { month: getCurrentMonth(), count: 0 }
  }
}

export function incrementChatUsage(): ChatUsage {
  const current = getChatUsage()
  const updated = { month: getCurrentMonth(), count: current.count + 1 }
  localStorage.setItem(CHAT_USAGE_KEY, JSON.stringify(updated))
  return updated
}
