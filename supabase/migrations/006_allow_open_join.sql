-- Columna para controlar si una org permite unirse con link abierto
alter table public.organizations
  add column if not exists allow_open_join boolean not null default true;

-- Actualizar política de join: solo permitir si la org tiene allow_open_join = true
drop policy if exists "Authenticated can join org as viewer" on public.organization_members;

create policy "Authenticated can join org as viewer"
on public.organization_members for insert
to authenticated
with check (
  user_id = auth.uid()
  and role = 'viewer'
  and org_id in (
    select id from public.organizations
    where allow_open_join = true
  )
);
