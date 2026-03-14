-- =====================================================
-- MULTI-TENANT: Organizaciones, membresías, invitaciones, Storage
-- =====================================================

-- 1. Extender organizations con owner_id si no existe
alter table public.organizations
  add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- 2. Membresías
create table if not exists public.organization_members (
  id         uuid primary key default gen_random_uuid(),
  org_id     uuid not null references public.organizations(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  role       text not null check (role in ('admin', 'viewer')),
  joined_at  timestamptz default now(),
  unique(org_id, user_id)
);

-- 3. Invitaciones pendientes
create table if not exists public.organization_invitations (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  email        text not null,
  role         text not null default 'viewer' check (role in ('admin', 'viewer')),
  invited_by   uuid not null references auth.users(id),
  token        uuid not null default gen_random_uuid(),
  accepted_at  timestamptz,
  expires_at   timestamptz default (now() + interval '7 days'),
  created_at   timestamptz default now(),
  unique(org_id, email)
);

-- ── Funciones helper SECURITY DEFINER ─────────────────────────────────────────
-- Estas funciones leen organization_members SIN activar RLS,
-- evitando la recursión infinita en las policies.

create or replace function public.get_my_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid()
$$;

create or replace function public.get_my_admin_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid() and role = 'admin'
$$;

-- ── RLS: organizations ────────────────────────────────────────────────────────

alter table public.organizations enable row level security;

create policy "Members can read their org"
on public.organizations for select
to authenticated
using (
  id in (select public.get_my_org_ids())
  or owner_id = auth.uid()
);

create policy "Owner can update org"
on public.organizations for update
to authenticated
using (owner_id = auth.uid());

create policy "Authenticated can create org"
on public.organizations for insert
to authenticated
with check (owner_id = auth.uid());

-- ── RLS: organization_members ─────────────────────────────────────────────────

alter table public.organization_members enable row level security;

-- Usa la función SECURITY DEFINER — no se consulta a sí misma
create policy "Members can read membership"
on public.organization_members for select
to authenticated
using (
  org_id in (select public.get_my_org_ids())
);

create policy "Admin can insert members"
on public.organization_members for insert
to authenticated
with check (
  org_id in (select public.get_my_admin_org_ids())
  or org_id in (
    select id from public.organizations where owner_id = auth.uid()
  )
);

create policy "Admin can delete members"
on public.organization_members for delete
to authenticated
using (
  org_id in (
    select id from public.organizations where owner_id = auth.uid()
  )
);

-- ── RLS: organization_invitations ─────────────────────────────────────────────

alter table public.organization_invitations enable row level security;

create policy "Admin can manage invitations"
on public.organization_invitations for all
to authenticated
using (
  org_id in (
    select id from public.organizations where owner_id = auth.uid()
  )
  or org_id in (select public.get_my_admin_org_ids())
);

create policy "Anyone can read invitation by token"
on public.organization_invitations for select
to authenticated
using (true);

-- ── Storage bucket ────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('org-data', 'org-data', false)
on conflict (id) do nothing;

create policy "Admins can upload org files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_admin_org_ids() org_id
    union
    select id::text from public.organizations where owner_id = auth.uid()
  )
);

create policy "Members can read org files"
on storage.objects for select
to authenticated
using (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_org_ids() org_id
  )
);

create policy "Admins can delete org files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_admin_org_ids() org_id
    union
    select id::text from public.organizations where owner_id = auth.uid()
  )
);

create policy "Admins can update org files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_admin_org_ids() org_id
    union
    select id::text from public.organizations where owner_id = auth.uid()
  )
);
