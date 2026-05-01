-- ============================================================
-- 010_snapshot_real_state.sql
-- Snapshot of the LIVE Supabase schema (project: musjxpjqpgyilrbsvcqm)
-- Generated: 2026-05-01 from src/types/database.ts (supabase gen types)
--
-- DO NOT APPLY — this is documentation only.
-- The live DB has 45 tables; migrations 001–009 cover only ~5 tables.
-- Use this file to understand what exists in production.
-- ============================================================

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.accounts (
  created_at timestamptz,
  currency_code text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  initial_balance numeric,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  type text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.action_items (
  description text,
  expires_at timestamptz,
  generated_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  impact_amount numeric,
  organization_id uuid NOT NULL,
  priority numeric,
  ref_id text,
  ref_type text,
  status text NOT NULL,
  title text NOT NULL,
  type text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_conversations (
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  kind text,
  organization_id uuid NOT NULL,
  user_id uuid NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_messages (
  content text NOT NULL,
  conversation_id text NOT NULL,
  cost_usd numeric,
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  role text NOT NULL,
  tokens_in numeric,
  tokens_out numeric
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_usage_monthly (
  calls numeric,
  cost_usd numeric,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  month text NOT NULL,
  organization_id uuid NOT NULL,
  tokens_in numeric,
  tokens_out numeric
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alerts (
  created_at timestamptz,
  event_date text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  is_read text,
  message text,
  organization_id uuid NOT NULL,
  severity text,
  title text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ap_bills (
  amount numeric NOT NULL,
  bill_no text,
  created_at timestamptz,
  critical_flag text,
  currency_code text,
  due_date text NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  import_id text,
  is_demo text,
  issue_date text,
  organization_id uuid NOT NULL,
  status text,
  vendor_id uuid,
  vendor_name text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ar_invoices (
  amount numeric NOT NULL,
  collection_probability numeric,
  created_at timestamptz,
  currency_code text,
  customer_id uuid,
  customer_name text NOT NULL,
  due_date text NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  import_id text,
  invoice_no text,
  is_demo text,
  issue_date text,
  organization_id uuid NOT NULL,
  status text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_log (
  changes_json text,
  created_at timestamptz,
  entity_id text,
  entity_type text,
  event_type text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  ip_address text,
  organization_id uuid,
  user_id uuid
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.bank_movements (
  account_name text,
  amount numeric NOT NULL,
  created_at timestamptz,
  description text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  import_id text,
  organization_id uuid NOT NULL,
  posted_on text NOT NULL,
  reference text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_assumptions (
  collection_curve_json text,
  customer_overrides_json text NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  payment_policy_json text NOT NULL,
  risk_thresholds_json text NOT NULL,
  updated_at timestamptz,
  updated_by text,
  vendor_overrides_json text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_positions (
  account_name text NOT NULL,
  balance numeric NOT NULL,
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  is_demo text,
  notes text,
  organization_id uuid NOT NULL,
  recorded_on text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cash_profile (
  ap_flex_days numeric NOT NULL,
  ar_payment_behavior text NOT NULL,
  created_at timestamptz,
  customer_dependency text NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  risk_worry_threshold text NOT NULL,
  updated_at timestamptz
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
  color text,
  created_at timestamptz,
  icon text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  is_default text,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  type text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
  contact_email text,
  created_at timestamptz,
  credit_days numeric,
  credit_limit numeric,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  payment_terms_days numeric
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_sources (
  config_json text,
  created_at timestamptz,
  created_by text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  status text,
  type text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.imports (
  committed_at timestamptz,
  created_at timestamptz,
  created_by text,
  errors_json text,
  file_name text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  row_count numeric,
  source_type text NOT NULL,
  status text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_forecast_base (
  confidence_interval_pct numeric,
  forecast_units numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  mape numeric,
  model_name text,
  organization_id uuid NOT NULL,
  period_date text NOT NULL,
  sku_id text NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_forecast_final (
  forecast_units_final numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  period_date text NOT NULL,
  sku_id text NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_forecast_overrides (
  created_at timestamptz,
  created_by text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  note text,
  organization_id uuid NOT NULL,
  override_type text NOT NULL,
  override_value numeric NOT NULL,
  period_date text NOT NULL,
  scope_type text NOT NULL,
  scope_value text NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_forecast_versions (
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  model_config text NOT NULL,
  model_counts text,
  organization_id uuid NOT NULL,
  override_count numeric NOT NULL,
  settings_snapshot text,
  skus_errored numeric NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_health_history (
  capital_at_risk numeric NOT NULL,
  capital_at_risk_ratio numeric NOT NULL,
  coverage_adequacy numeric NOT NULL,
  created_at timestamptz,
  forecast_reliability numeric NOT NULL,
  green_count numeric NOT NULL,
  health_score numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  red_count numeric NOT NULL,
  red_ratio numeric NOT NULL,
  snapshot_date text NOT NULL,
  snapshot_id text NOT NULL,
  total_capital numeric NOT NULL,
  yellow_count numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_metrics_category (
  capital_onhand numeric NOT NULL,
  category text NOT NULL,
  coverage_days_avg numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  recommended_buy numeric NOT NULL,
  red_count numeric NOT NULL,
  risk_share numeric NOT NULL,
  sku_count numeric NOT NULL,
  skus_at_risk numeric NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_metrics_sku (
  buffer_units numeric NOT NULL,
  capital_onhand numeric NOT NULL,
  coverage_days numeric NOT NULL,
  demand_30d numeric,
  demand_90d numeric NOT NULL,
  demand_daily_30d numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  mape numeric,
  organization_id uuid NOT NULL,
  recommended_buy_units numeric NOT NULL,
  risk_level text NOT NULL,
  sku_id text NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_metrics_supplier (
  capital_onhand numeric NOT NULL,
  coverage_days_avg numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  recommended_buy numeric NOT NULL,
  red_count numeric NOT NULL,
  risk_share numeric NOT NULL,
  sku_count numeric NOT NULL,
  skus_at_risk numeric NOT NULL,
  snapshot_id text NOT NULL,
  supplier text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_onhand (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  onhand_units numeric NOT NULL,
  organization_id uuid NOT NULL,
  sku_id text NOT NULL,
  snapshot_id text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_sales_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  organization_id uuid NOT NULL,
  period_date text NOT NULL,
  sku_id text NOT NULL,
  snapshot_id text NOT NULL,
  units_sold numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_settings (
  critical_threshold_days numeric NOT NULL,
  default_forecast_horizon numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  min_periods_for_hw numeric NOT NULL,
  min_periods_for_wma numeric NOT NULL,
  organization_id uuid NOT NULL,
  risk_threshold_buffer_pct numeric NOT NULL,
  seasonality_flag text NOT NULL,
  target_coverage_days numeric NOT NULL,
  updated_at timestamptz,
  weight_capital_at_risk numeric NOT NULL,
  weight_coverage_adequacy numeric NOT NULL,
  weight_forecast_reliability numeric NOT NULL,
  weight_red_ratio numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_sku_master (
  active_flag text NOT NULL,
  category text NOT NULL,
  cost_unit numeric NOT NULL,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  lead_time_days numeric NOT NULL,
  moq numeric NOT NULL,
  organization_id uuid NOT NULL,
  price_unit numeric NOT NULL,
  sku_id text NOT NULL,
  sku_name text NOT NULL,
  supplier text NOT NULL,
  updated_at timestamptz
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.inventory_snapshots (
  created_at timestamptz,
  created_by text,
  error_msg text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  label text NOT NULL,
  metadata text,
  organization_id uuid NOT NULL,
  sku_count numeric,
  snapshot_date text NOT NULL,
  status text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_invitations (
  accepted_at timestamptz,
  created_at timestamptz,
  email text,
  expires_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  invited_by text NOT NULL,
  org_id uuid NOT NULL,
  role text NOT NULL,
  token text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organization_members (
  allowed_pages text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  joined_at timestamptz,
  org_id uuid NOT NULL,
  role text NOT NULL,
  user_id uuid NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
  allow_open_join text NOT NULL,
  country text,
  created_at timestamptz,
  currency text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  owner_id text,
  threshold_critical numeric,
  threshold_high numeric,
  threshold_overstock numeric,
  updated_at timestamptz
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_monthly (
  amount numeric NOT NULL,
  category_id text,
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  is_demo text NOT NULL,
  item_name text NOT NULL,
  kind text NOT NULL,
  month text NOT NULL,
  notes text,
  organization_id uuid NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_node_values (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  month text NOT NULL,
  node_id text NOT NULL,
  value numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_nodes (
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  node_type text NOT NULL,
  organization_id uuid NOT NULL,
  parent_id text,
  position numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_scenario_values (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  month text NOT NULL,
  node_id text NOT NULL,
  scenario_id text NOT NULL,
  value numeric NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.plan_scenarios (
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  organization_id uuid NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  avatar_url text,
  created_at timestamptz,
  email text,
  full_name text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promises_to_pay (
  ar_invoice_id text NOT NULL,
  created_at timestamptz,
  created_by text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  notes text,
  organization_id uuid NOT NULL,
  promised_amount numeric,
  promised_date text NOT NULL,
  status text NOT NULL
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.recurring_outflows (
  active text,
  amount numeric NOT NULL,
  cadence text NOT NULL,
  created_at timestamptz,
  day_of_period numeric,
  ends_on text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  is_demo text,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  starts_on text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.subscriptions (
  ai_quota numeric,
  current_period_end text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  member_quota numeric,
  organization_id uuid NOT NULL,
  plan text NOT NULL,
  status text,
  stripe_customer_id uuid,
  stripe_subscription_id text,
  tx_quota numeric,
  updated_at timestamptz
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transaction_imports (
  error text,
  file_name text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  imported_at timestamptz,
  imported_by text,
  organization_id uuid NOT NULL,
  row_count numeric,
  status text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  account_id text,
  amount numeric NOT NULL,
  category_id text,
  created_at timestamptz,
  created_by text,
  description text,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  occurred_on text NOT NULL,
  organization_id uuid NOT NULL,
  source text,
  tags text,
  type text NOT NULL,
  vendor text
);

-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.vendors (
  contact_email text,
  created_at timestamptz,
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY NOT NULL,
  name text NOT NULL,
  organization_id uuid NOT NULL,
  payment_terms_days numeric
);

-- ============================================================
-- Tables in live DB but NOT in migration files 001-009:
--   accounts, action_items, ai_conversations, ai_messages,
--   ai_usage_monthly, alerts, ap_bills, ar_invoices, audit_log,
--   bank_movements, cash_assumptions, cash_positions, cash_profile,
--   data_sources, imports (partial), inventory_* (all 10 tables),
--   organization_invitations, organization_members, organizations,
--   plan_* (all), profiles, promises_to_pay, recurring_outflows,
--   subscriptions, transaction_imports, transactions, vendors
--
-- Tables in migrations but NOT confirmed in live DB:
--   alert_status (007 — NEVER APPLIED — see T3)
--   categories, customers, inventory_snapshots, imports (partially in 004/005/006)
-- ============================================================