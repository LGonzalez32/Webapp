-- S3 — Cerrar políticas placebo en organizations y organization_invitations
-- Sprint 0.6 / hardening de seguridad
-- Reemplaza dos políticas USING (true) que exponían datos cross-organization

BEGIN;

-- ─── organization_invitations ──────────────────────────────────
-- Drop política placebo. Frontend no consume esta tabla. La política
-- "Admin can manage invitations" (ALL para admins) queda como única
-- gate de read/write.
DROP POLICY IF EXISTS "Anyone can read invitation by token" ON public.organization_invitations;

-- ─── organizations ─────────────────────────────────────────────
-- Drop política placebo. Acceso post-login ya cubierto por
-- "Members can read their org" + "Owner can update org".
DROP POLICY IF EXISTS "Anyone can read org name by id" ON public.organizations;

-- Crear RPC pública para el único consumer pre-login: InvitationPage.
-- SECURITY DEFINER bypassa RLS pero retorna solo {id, name} y exige
-- el UUID exacto, sin enumeración posible.
CREATE OR REPLACE FUNCTION public.get_org_public_info(p_org_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, name FROM public.organizations WHERE id = p_org_id;
$$;

-- Permisos explícitos: anon y authenticated pueden invocar la RPC.
GRANT EXECUTE ON FUNCTION public.get_org_public_info(uuid) TO anon, authenticated;

-- Bloquear que la función sea llamada con NULL (devolvería todo).
-- Defensa preventiva: SQL ya filtra WHERE id = NULL → cero rows,
-- pero dejamos comentario para revisión futura.

COMMIT;
