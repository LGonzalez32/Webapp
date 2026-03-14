-- =====================================================
-- FORECAST DE VENTAS POR VENDEDOR/MÉTRICA/AÑO
-- Versión corregida con lectura directa de Supabase
-- =====================================================

-- Primero, agregar columnas faltantes a sales_history si no existen
-- (asumiendo que el schema original puede no tenerlas)

-- Tabla principal de forecast de ventas
create table if not exists sales_forecasts (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations(id) on delete cascade,
    
    -- Identificación del forecast
    snapshot_id uuid references upload_sessions(id) on delete cascade,
    forecast_year int not null,
    vendedor text not null,
    metric_type text not null check (metric_type in ('units', 'revenue')),
    
    -- Estado del forecast
    status text default 'pending' check (status in ('pending', 'processing', 'ready', 'error')),
    model_used text,
    error_message text,
    
    -- Metadatos
    created_at timestamptz default now(),
    generated_at timestamptz,
    updated_at timestamptz default now(),
    
    unique(org_id, snapshot_id, forecast_year, vendedor, metric_type)
);

-- Tabla de resultados mensuales del forecast
create table if not exists sales_forecast_results (
    id uuid primary key default gen_random_uuid(),
    forecast_id uuid references sales_forecasts(id) on delete cascade,
    org_id uuid references organizations(id) on delete cascade,
    
    -- Identificación
    forecast_year int not null,
    forecast_month int not null check (forecast_month >= 1 and forecast_month <= 12),
    vendedor text not null,
    metric_type text not null check (metric_type in ('units', 'revenue')),
    
    -- Valores
    forecast_value numeric not null default 0,
    lower_bound numeric,
    upper_bound numeric,
    is_actual boolean default false,
    
    created_at timestamptz default now(),
    
    unique(forecast_id, forecast_month, vendedor, metric_type)
);

-- Tabla de sesiones de datos de ventas agregadas (para forecast)
-- Esta tabla almacena los datos de ventas normalizados para forecast
create table if not exists sales_aggregated (
    id uuid primary key default gen_random_uuid(),
    org_id uuid references organizations(id) on delete cascade,
    session_id uuid references upload_sessions(id) on delete cascade,
    
    -- Dimensiones
    year int not null,
    month int not null check (month >= 1 and month <= 12),
    vendedor text not null,
    
    -- Métricas
    units numeric default 0,
    revenue numeric default 0,
    
    created_at timestamptz default now(),
    
    unique(org_id, session_id, year, month, vendedor)
);

-- =====================================================
-- ÍNDICES PARA CONSULTAS RÁPIDAS
-- =====================================================

-- Índices para sales_forecasts
create index if not exists idx_sales_forecasts_org on sales_forecasts(org_id);
create index if not exists idx_sales_forecasts_vendedor on sales_forecasts(vendedor);
create index if not exists idx_sales_forecasts_year on sales_forecasts(forecast_year);
create index if not exists idx_sales_forecasts_metric on sales_forecasts(metric_type);
create index if not exists idx_sales_forecasts_status on sales_forecasts(status);
create index if not exists idx_sales_forecasts_composite on sales_forecasts(org_id, forecast_year, vendedor, metric_type);

-- Índices para sales_forecast_results
create index if not exists idx_sales_forecast_results_forecast on sales_forecast_results(forecast_id);
create index if not exists idx_sales_forecast_results_year_month on sales_forecast_results(forecast_year, forecast_month);
create index if not exists idx_sales_forecast_results_vendedor on sales_forecast_results(vendedor);
create index if not exists idx_sales_forecast_results_metric on sales_forecast_results(metric_type);
create index if not exists idx_sales_forecast_results_composite on sales_forecast_results(org_id, forecast_year, forecast_month, vendedor, metric_type);

-- Índices para sales_aggregated
create index if not exists idx_sales_aggregated_org on sales_aggregated(org_id);
create index if not exists idx_sales_aggregated_session on sales_aggregated(session_id);
create index if not exists idx_sales_aggregated_year_month on sales_aggregated(year, month);
create index if not exists idx_sales_aggregated_vendedor on sales_aggregated(vendedor);
create index if not exists idx_sales_aggregated_composite on sales_aggregated(org_id, session_id, year, month, vendedor);

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

alter table sales_forecasts disable row level security;
alter table sales_forecast_results disable row level security;
alter table sales_aggregated disable row level security;

-- =====================================================
-- COMENTARIOS PARA DOCUMENTACIÓN
-- =====================================================

comment on table sales_forecasts is 'Almacena metadata de forecasts de ventas por vendedor/métrica/año';
comment on table sales_forecast_results is 'Resultados mensuales del forecast de ventas (valores proyectados)';
comment on table sales_aggregated is 'Datos de ventas agregados por año/mes/vendedor para forecasting';
