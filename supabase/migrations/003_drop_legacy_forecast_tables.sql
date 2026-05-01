-- Drop de tablas legacy del módulo forecast viejo + zombies sin RLS
-- Sprint 0.6 / S4.1 — auditoría de seguridad
-- Verificado cero referencias en runtime (solo migrations y docs)

BEGIN;

DROP TABLE IF EXISTS public.sales_aggregated CASCADE;
DROP TABLE IF EXISTS public.sales_history CASCADE;
DROP TABLE IF EXISTS public.upload_sessions CASCADE;
DROP TABLE IF EXISTS public.sales_forecasts CASCADE;
DROP TABLE IF EXISTS public.sales_forecast_results CASCADE;
DROP TABLE IF EXISTS public.forecast_results CASCADE;
DROP TABLE IF EXISTS public.forecast_snapshots CASCADE;
DROP TABLE IF EXISTS public.inventory_positions CASCADE;
DROP TABLE IF EXISTS public.inventory_projections CASCADE;
DROP TABLE IF EXISTS public.forecast_runs CASCADE;
DROP TABLE IF EXISTS public.forecast_weeks CASCADE;
DROP TABLE IF EXISTS public.forecasts CASCADE;
DROP TABLE IF EXISTS public.monthly_forecast_runs CASCADE;
DROP TABLE IF EXISTS public.monthly_summaries CASCADE;

COMMIT;
