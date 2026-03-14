-- =====================================================
-- RESET COMPLETO — ejecutar ANTES de los migrations
-- Elimina todo en orden inverso de dependencias FK
-- =====================================================

-- 1. Storage: solo eliminar políticas (Supabase no permite DELETE directo en storage.objects)
--    El bucket se borra manualmente desde el Dashboard → Storage si es necesario.
drop policy if exists "Admins can upload org files" on storage.objects;
drop policy if exists "Members can read org files"  on storage.objects;
drop policy if exists "Admins can delete org files" on storage.objects;
drop policy if exists "Admins can update org files" on storage.objects;

-- 2. Tablas de invitaciones y membresías (dependen de organizations + auth.users)
drop table if exists public.organization_invitations cascade;
drop table if exists public.organization_members      cascade;

-- 3. Tablas de forecast de ventas (002 — dependen de organizations + upload_sessions)
drop table if exists public.sales_forecast_results cascade;
drop table if exists public.sales_forecasts        cascade;
drop table if exists public.sales_aggregated       cascade;

-- 4. Tablas de inventario/forecast de SKU (001 — dependen de organizations + upload_sessions)
drop table if exists public.inventory_projections cascade;
drop table if exists public.forecast_results      cascade;
drop table if exists public.forecast_snapshots    cascade;
drop table if exists public.sales_history         cascade;
drop table if exists public.inventory_positions   cascade;

-- 5. upload_sessions (depende de organizations)
drop table if exists public.upload_sessions cascade;

-- 6. organizations (tabla raíz)
drop table if exists public.organizations cascade;

-- 7. Función auxiliar
drop function if exists public.update_updated_at cascade;
