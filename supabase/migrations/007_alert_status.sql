-- =====================================================
-- ALERT STATUS: Estado de alertas de Inteligencia Comercial
-- Permite marcar alertas como atendidas o en seguimiento.
-- =====================================================

CREATE TABLE IF NOT EXISTS public.alert_status (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key   text NOT NULL,    -- clave estable: tipo__detector__vendedor__cliente__producto
  status      text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'following', 'resolved')),
  reopened_at timestamptz,      -- se establece cuando el sistema reabre una alerta resuelta
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE (org_id, alert_key)
);

-- Índice para consultas por org
CREATE INDEX IF NOT EXISTS idx_alert_status_org_id ON public.alert_status (org_id);

-- RLS
ALTER TABLE public.alert_status ENABLE ROW LEVEL SECURITY;

-- Policy: los miembros de la org pueden gestionar los estados de alertas de su org
-- Usamos get_my_org_ids() (SECURITY DEFINER) para evitar recursión en RLS
CREATE POLICY "members_manage_alert_status" ON public.alert_status
  FOR ALL
  USING (org_id IN (SELECT public.get_my_org_ids()))
  WITH CHECK (org_id IN (SELECT public.get_my_org_ids()));

-- Función trigger para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION public.set_alert_status_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER alert_status_updated_at
  BEFORE UPDATE ON public.alert_status
  FOR EACH ROW
  EXECUTE FUNCTION public.set_alert_status_updated_at();
