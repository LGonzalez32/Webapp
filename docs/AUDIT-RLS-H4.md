# AUDIT RLS — Sprint H4

**Fecha:** 2026-05-01
**Tipo:** Read-only audit. No se aplicaron migrations ni se alteraron policies.
**Fuente:** `pg_tables` y `pg_policies` en schema `public` (vía `supabase db query --linked`).

---

## Resumen ejecutivo

- **47 tablas** en schema `public`. **Todas** tienen `rowsecurity = true`.
- **No hay tablas sin RLS habilitado.** Cero blockers de exposición directa.
- Hay 60+ policies activas, todas `PERMISSIVE`. La mayoría usa el patrón `*_member` (org membership) o `*_admin` (org owner/admin).
- Las tablas SalesFlow-críticas para multi-tenancy (`organizations`, `organization_members`, `alert_status`, `subscriptions`) tienen policies específicas — ver tabla abajo.

**Caveat importante:** las tablas de datos comerciales de SalesFlow (`sales`, `metas`, `inventory`) **no viven en Postgres** — se almacenan como archivos en el bucket `org-data` de Supabase Storage. La seguridad de esas datasets depende de las **Storage policies** del bucket, no de las tablas auditadas acá. Auditarlas requiere otra query (no incluida en H4).

---

## Tablas SalesFlow-críticas (multi-tenancy)

| Tabla                      | RLS | SELECT                            | INSERT                                  | UPDATE                | DELETE                  | Estado |
|---------------------------|-----|-----------------------------------|-----------------------------------------|------------------------|-------------------------|--------|
| `organizations`           | ✅  | "Members can read their org"      | "Authenticated can create org"          | "Owner can update org" | —                       | ✅ OK |
| `organization_members`    | ✅  | "Members can read membership"     | "Admin can insert members" + "Authenticated can join org as viewer" | — | "Admin can delete members" | ✅ OK |
| `organization_invitations`| ✅  | "Admin can manage invitations" (ALL) | (incluido en ALL)                    | (incluido en ALL)      | (incluido en ALL)       | ✅ OK |
| `alert_status`            | ✅  | "members_manage_alert_status" (ALL) | (incluido en ALL)                   | (incluido en ALL)      | (incluido en ALL)       | ✅ OK |
| `subscriptions`           | ✅  | "subs_select_member"              | (sin policy)                            | (sin policy)           | (sin policy)            | ⚠️ ver nota |
| `profiles`                | ✅  | (no listado)                      | (no listado)                            | (no listado)           | (no listado)            | ⚠️ verificar |

**⚠️ `subscriptions`:** solo tiene SELECT policy. Si el frontend o un service-role no actualiza/inserta — está OK (manejo manual / billing externo). Si se planea self-service de planes, faltarían INSERT/UPDATE policies o el flow debe ir por backend con service-role key.

**⚠️ `profiles`:** no apareció policy específica en el output. Revisar si usa el default de auth schema. Si no tiene policy, puede ser que la tabla esté abierta a todo authenticated (riesgo si trae PII de otros usuarios).

---

## Tablas de otra aplicación (no SalesFlow)

La DB también aloja tablas de otra app que comparte la instancia (probablemente motor financiero/cashflow):
- `accounts`, `action_items`, `ai_*`, `ap_bills`, `ar_invoices`, `audit_log`, `bank_movements`, `cash_*`, `categories`, `customers`, `data_sources`, `imports`, `inventory_*` (15 tablas), `plan_*` (5 tablas), `promises_to_pay`, `recurring_outflows`, `transaction_imports`, `transactions`, `vendors`.

Todas con RLS y patrón `*_member` o `*_admin`. Fuera de scope para este audit pero no representan exposición — RLS habilitado.

---

## Recomendaciones (no aplicar en H4)

1. **Confirmar `profiles`:** correr `select * from pg_policies where tablename = 'profiles'` para validar que tiene policies. Si no, agregar al menos `select_own` (`id = auth.uid()`).
2. **Confirmar Storage bucket `org-data`:** los archivos de ventas/metas/inventario son el dato más sensible. Verificar policies con `select * from storage.policies` o vía Supabase dashboard.
3. **`subscriptions` — clarificar flow:** si va por backend con service-role, documentar. Si planea self-service en el frontend, agregar INSERT/UPDATE policies.
4. **Antes del primer cliente pagador (deuda CLAUDE.md):** correr este audit sobre el ambiente production y validar 1–3.

---

## Comandos para reproducir

```bash
SUPABASE_ACCESS_TOKEN=<token> npx supabase db query --linked -f /tmp/audit-rls.sql
```

Donde `audit-rls.sql`:

```sql
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by tablename;
select tablename, policyname, permissive, cmd from pg_policies where schemaname = 'public' order by tablename, policyname;
```
