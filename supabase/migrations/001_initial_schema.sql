-- ORGANIZATIONS
create table if not exists organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Mi Tienda',
  country text default 'El Salvador',
  currency text default 'USD',
  threshold_critical int default 5,
  threshold_high int default 10,
  threshold_overstock int default 45,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- UPLOAD SESSIONS
create table if not exists upload_sessions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  label text not null,
  cutoff_date date not null,
  sku_count int default 0,
  status text default 'processing'
    check (status in ('processing', 'ready', 'error')),
  is_demo boolean default false,
  source_type text default 'customer_upload'
    check (source_type in ('customer_upload', 'demo_seed')),
  error_message text,
  created_at timestamptz default now()
);

-- INVENTORY POSITIONS
create table if not exists inventory_positions (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  session_id uuid references upload_sessions(id) on delete cascade,
  sku text not null,
  stock numeric not null default 0,
  category text,
  supplier text,
  unit_cost numeric default 0,
  created_at timestamptz default now()
);

-- SALES HISTORY
create table if not exists sales_history (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  session_id uuid references upload_sessions(id) on delete cascade,
  sku text not null,
  sale_date date not null,
  units numeric not null default 0,
  created_at timestamptz default now()
);

-- FORECAST SNAPSHOTS
create table if not exists forecast_snapshots (
  id uuid primary key default gen_random_uuid(),
  org_id uuid references organizations(id) on delete cascade,
  session_id uuid references upload_sessions(id) on delete cascade,
  status text default 'processing'
    check (status in ('processing', 'ready', 'error')),
  horizon_months int default 12,
  created_at timestamptz default now()
);

-- FORECAST RESULTS (por SKU por mes)
create table if not exists forecast_results (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references forecast_snapshots(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  sku text not null,
  forecast_month date not null,
  forecast_units numeric not null default 0,
  created_at timestamptz default now()
);

-- INVENTORY PROJECTIONS (análisis por SKU)
create table if not exists inventory_projections (
  id uuid primary key default gen_random_uuid(),
  snapshot_id uuid references forecast_snapshots(id) on delete cascade,
  org_id uuid references organizations(id) on delete cascade,
  sku text not null,
  avg_daily_sales numeric default 0,
  coverage_days int default 0,
  forecast_30d int default 0,
  suggested_order_qty int default 0,
  projected_stockout_date date,
  risk_level text default 'ok'
    check (risk_level in ('critical', 'high', 'overstock', 'ok')),
  trend_pct numeric default 0,
  created_at timestamptz default now()
);

-- INDEXES
create index if not exists idx_inventory_positions_session
  on inventory_positions(session_id);
create index if not exists idx_sales_history_session
  on sales_history(session_id);
create index if not exists idx_sales_history_sku
  on sales_history(sku);
create index if not exists idx_forecast_results_snapshot
  on forecast_results(snapshot_id);
create index if not exists idx_inventory_projections_snapshot
  on inventory_projections(snapshot_id);

-- UPDATED_AT trigger
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger organizations_updated_at
  before update on organizations
  for each row execute function update_updated_at();

-- RLS (Row Level Security)
-- Por ahora deshabilitado para MVP sin auth
-- Se habilitará cuando se agregue autenticación
alter table organizations disable row level security;
alter table upload_sessions disable row level security;
alter table inventory_positions disable row level security;
alter table sales_history disable row level security;
alter table forecast_snapshots disable row level security;
alter table forecast_results disable row level security;
alter table inventory_projections disable row level security;
