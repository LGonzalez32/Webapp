-- Actualizar constraint de rol
alter table public.organization_members
  drop constraint if exists organization_members_role_check;

alter table public.organization_members
  add constraint organization_members_role_check
  check (role in ('owner', 'editor', 'viewer'));

alter table public.organization_invitations
  drop constraint if exists organization_invitations_role_check;

alter table public.organization_invitations
  add constraint organization_invitations_role_check
  check (role in ('editor', 'viewer'));

-- RLS: solo owner puede insertar/eliminar/actualizar miembros
drop policy if exists "Admin can insert members" on public.organization_members;
drop policy if exists "Admin can delete members" on public.organization_members;

create policy "Owner can insert members"
on public.organization_members for insert
to authenticated
with check (
  org_id in (
    select org_id from public.get_my_org_ids()
    -- solo si el usuario actual tiene rol owner en esa org
  )
);

-- Nota: las RLS deben usar las funciones SECURITY DEFINER get_my_org_ids / get_my_admin_org_ids
-- Para owner, necesitamos una función específica

create or replace function public.get_my_owner_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid() and role = 'owner'
$$;

-- Recrear políticas de inserción/eliminación/update para miembros
drop policy if exists "Owner can insert members" on public.organization_members;

create policy "Owner can insert members"
on public.organization_members for insert
to authenticated
with check (
  org_id in (select public.get_my_owner_org_ids())
);

create policy "Owner can delete members"
on public.organization_members for delete
to authenticated
using (
  org_id in (select public.get_my_owner_org_ids())
);

create policy "Owner can update member roles"
on public.organization_members for update
to authenticated
using (
  org_id in (select public.get_my_owner_org_ids())
);

-- RLS invitaciones: solo owner puede gestionar
drop policy if exists "Admin can manage invitations" on public.organization_invitations;

create policy "Owner can manage invitations"
on public.organization_invitations for all
to authenticated
using (
  org_id in (select public.get_my_owner_org_ids())
);

-- Storage: editors y owners pueden subir/modificar/eliminar
drop policy if exists "Admins can upload org files" on storage.objects;
drop policy if exists "Admins can delete org files" on storage.objects;
drop policy if exists "Admins can update org files" on storage.objects;

create or replace function public.get_my_editor_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id
  from public.organization_members
  where user_id = auth.uid() and role in ('owner', 'editor')
$$;

create policy "Editors can upload org files"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_editor_org_ids() org_id
  )
);

create policy "Editors can update org files"
on storage.objects for update
to authenticated
using (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_editor_org_ids() org_id
  )
);

create policy "Editors can delete org files"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'org-data'
  and (storage.foldername(name))[1] in (
    select org_id::text from public.get_my_editor_org_ids() org_id
  )
);
