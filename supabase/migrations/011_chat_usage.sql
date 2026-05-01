-- Sprint I2 — Chat usage tracking + atomic quota consumption
--
-- Pattern: una fila por (user_id, date). RPC atómica try_consume_chat_quota
-- hace check + increment en una sola transacción para evitar race conditions
-- entre dos requests concurrentes del mismo user.
--
-- Limits NO viven en DB — los pasa el backend desde env vars (PLAN_*_DAILY,
-- PLAN_*_MONTHLY). Esto permite ajustar pricing sin migration.

create table if not exists public.chat_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  date    date not null default current_date,
  count   integer not null default 0,
  primary key (user_id, date)
);

create index if not exists chat_usage_user_date_idx
  on public.chat_usage(user_id, date desc);

alter table public.chat_usage enable row level security;

-- Solo el propio user puede leer su uso (transparencia + UI futura "X/Y consultas hoy")
drop policy if exists "users_select_own_usage" on public.chat_usage;
create policy "users_select_own_usage" on public.chat_usage
  for select using (user_id = auth.uid());

-- Sin policies INSERT/UPDATE/DELETE → solo service-role (backend) puede mutar.

-- ─── RPC atómica: check + consume en 1 transacción ────────────────────────
--
-- Args:
--   p_user_id        uuid del user
--   p_daily_limit    int o null (null = unlimited)
--   p_monthly_limit  int o null (null = unlimited)
--
-- Returns: json
--   { ok: bool, exceeded: 'daily'|'monthly'|null, daily_count: int, monthly_count: int }
--
-- Si ok=true: counter ya está incrementado (el caller no necesita 2do call).
-- Si ok=false: counter NO se tocó.
--
-- Atomicity: SELECT ... FOR UPDATE bloquea la fila hasta el INSERT/UPDATE,
-- así dos requests concurrentes del mismo user se serializan correctamente.

create or replace function public.try_consume_chat_quota(
  p_user_id       uuid,
  p_daily_limit   integer,
  p_monthly_limit integer
) returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today        date := current_date;
  v_month_start  date := date_trunc('month', current_date)::date;
  v_daily        integer;
  v_monthly      integer;
begin
  -- Lock the user's row for today (or absence of it) for the duration of tx
  select coalesce(count, 0) into v_daily
  from public.chat_usage
  where user_id = p_user_id and date = v_today
  for update;

  if v_daily is null then v_daily := 0; end if;

  -- Sum of current month (no lock needed, range query)
  select coalesce(sum(count), 0)::int into v_monthly
  from public.chat_usage
  where user_id = p_user_id and date >= v_month_start;

  -- Daily check
  if p_daily_limit is not null and v_daily >= p_daily_limit then
    return json_build_object(
      'ok', false, 'exceeded', 'daily',
      'daily_count', v_daily, 'monthly_count', v_monthly
    );
  end if;

  -- Monthly check
  if p_monthly_limit is not null and v_monthly >= p_monthly_limit then
    return json_build_object(
      'ok', false, 'exceeded', 'monthly',
      'daily_count', v_daily, 'monthly_count', v_monthly
    );
  end if;

  -- Consume: upsert and increment
  insert into public.chat_usage(user_id, date, count)
  values (p_user_id, v_today, 1)
  on conflict (user_id, date)
  do update set count = chat_usage.count + 1
  returning count into v_daily;

  v_monthly := v_monthly + 1;

  return json_build_object(
    'ok', true, 'exceeded', null,
    'daily_count', v_daily, 'monthly_count', v_monthly
  );
end;
$$;

-- Solo backend (service-role) la invoca. Aun así, granteamos a authenticated
-- por si futura UI quiere mostrar quota actual sin un endpoint extra.
revoke all on function public.try_consume_chat_quota(uuid, integer, integer) from public;
grant execute on function public.try_consume_chat_quota(uuid, integer, integer)
  to service_role;

-- ─── RPC read-only: para mostrar uso actual sin consumir ──────────────────

create or replace function public.get_chat_usage(p_user_id uuid)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_today       date := current_date;
  v_month_start date := date_trunc('month', current_date)::date;
  v_daily       integer;
  v_monthly     integer;
begin
  select coalesce(count, 0) into v_daily
  from public.chat_usage
  where user_id = p_user_id and date = v_today;

  if v_daily is null then v_daily := 0; end if;

  select coalesce(sum(count), 0)::int into v_monthly
  from public.chat_usage
  where user_id = p_user_id and date >= v_month_start;

  return json_build_object('daily_count', v_daily, 'monthly_count', v_monthly);
end;
$$;

revoke all on function public.get_chat_usage(uuid) from public;
grant execute on function public.get_chat_usage(uuid)
  to authenticated, service_role;
