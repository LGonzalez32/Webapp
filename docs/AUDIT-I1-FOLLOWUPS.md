# AUDIT I1 — RLS Follow-ups del Sprint H4

**Fecha:** 2026-05-01
**Tipo:** Read-only audit. Cero migrations aplicadas.
**Fuente:** `pg_policies` (schemas `public` + `storage`) y `storage.buckets`.

---

## Resumen ejecutivo

Las 3 dudas abiertas del audit H4 quedan **resueltas y sin blockers**:

| Pregunta | Resultado | Estado |
|---|---|---|
| (a) `profiles` ¿tiene policy específica? | Sí: `profiles_select_own` y `profiles_update_own`, ambas `(id = auth.uid())` | ✅ OK |
| (b) `subscriptions` ¿solo SELECT es intencional? | Sí: solo `subs_select_member`. INSERT/UPDATE/DELETE solo via service-role (backend). Patrón válido para billing externo. | ✅ OK |
| (c) Storage `org-data` ¿tiene policies? | Sí: 4 policies, path-aware (`(storage.foldername(name))[1]` debe estar en orgs del usuario) | ✅ OK |

**Conclusión:** las 3 capas de defensa críticas (multi-tenant DB, billing aislado, dataset isolation en storage) están correctamente configuradas. No hay fugas cross-org en lecturas ni escrituras desde el frontend con anon key.

---

## (a) `profiles` — policies confirmadas

```
policyname            | cmd    | qual
----------------------+--------+-----------------
profiles_select_own   | SELECT | (id = auth.uid())
profiles_update_own   | UPDATE | (id = auth.uid())
```

**Análisis:**
- Un usuario autenticado solo puede leer/actualizar su propia fila.
- INSERT/DELETE no tienen policy pública → la creación se hace via trigger en `auth.users` (patrón Supabase estándar) y la eliminación via cascade. Correcto.
- ✅ Sin riesgo de leak de PII de otros usuarios.

---

## (b) `subscriptions` — flow billing confirmado

```
policyname           | cmd    | roles           | qual                          | with_check
---------------------+--------+-----------------+-------------------------------+------------
subs_select_member   | SELECT | {authenticated} | is_org_member(organization_id)| null
```

**Análisis:**
- Frontend con anon key puede LEER el plan de su org (para mostrar "Plan: Esencial / Profesional / Empresa"). Correcto y necesario.
- Sin INSERT/UPDATE/DELETE policies → modificaciones REQUIEREN service-role key. Esto significa:
  - **Cualquier upgrade/downgrade debe ir via backend** con la service-role key.
  - El flow de `useSubscription.ts` solo hace `select(...)` (validado en Sprint A T4) — consistente.
- ✅ Sin riesgo de un usuario auto-asignándose plan Empresa sin pago.

**Implicación operativa:** si en el futuro se hace self-service de planes en el frontend, hay que agregar un endpoint backend que reciba el cambio de plan y lo aplique con service-role (pasando por validación de Stripe/payment). No agregar policies INSERT/UPDATE en el frontend.

---

## (c) Storage `org-data` — 4 policies path-aware

**Bucket:** `org-data`, public=false, sin file_size_limit, sin mime restrictions.

```
cmd    | policyname
-------+--------------------------------
SELECT | Members can read org files
INSERT | Admins can upload org files
UPDATE | Admins can update org files
DELETE | Admins can delete org files
```

**Lógica de aislamiento (extracto):**

```sql
-- SELECT (Members can read)
(bucket_id = 'org-data') AND
((storage.foldername(name))[1] IN (SELECT org_id FROM get_my_org_ids()))

-- INSERT/UPDATE/DELETE (Admins only)
(bucket_id = 'org-data') AND
((storage.foldername(name))[1] IN (
   SELECT org_id FROM get_my_admin_org_ids()
   UNION
   SELECT id::text FROM organizations WHERE owner_id = auth.uid()
))
```

**Análisis:**
- El path de los archivos debe ser `{orgId}/{ventas|metas|inventario}.{xlsx|csv}` (validado contra `orgService.ts:194 uploadOrgFile`).
- `(storage.foldername(name))[1]` extrae el primer segmento del path → `orgId`.
- Se compara contra las orgs del usuario (vía `get_my_org_ids()` para read, `get_my_admin_org_ids()` + ownership para write).
- ✅ Imposible que el user A lea/escriba archivos de la org B (siempre y cuando `get_my_org_ids` esté correctamente implementada — esa función no se auditó pero su uso aquí es estándar de Supabase).

**Caveat menor:** sin `file_size_limit` ni `allowed_mime_types`. Un usuario con permiso de upload puede subir archivos arbitrariamente grandes/raros. Mitigación: el frontend valida `MAX_FILE_BYTES = 50MB` en `UploadPage.tsx:304` y solo acepta `.csv/.xlsx/.xls`. **No es defensa profunda.** Recomendación opcional: limitar bucket a 50MB y mime `text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` desde el dashboard de Supabase.

---

## Recomendaciones (no aplicar acá)

1. **Validar `get_my_org_ids()` y `get_my_admin_org_ids()`** — auditar el SQL de esas funciones para confirmar que filtran correctamente por `auth.uid()`. (No estaba en scope de I1.)
2. **Bucket `org-data`:** agregar `file_size_limit = 52428800` (50MB) y `allowed_mime_types` desde el dashboard.
3. **Mantener este audit en cada release** que toque RLS o storage.

---

## Comandos para reproducir

```sql
-- profiles
select tablename, policyname, cmd, qual from pg_policies
where schemaname = 'public' and tablename = 'profiles' order by policyname;

-- subscriptions
select tablename, policyname, cmd, roles, qual, with_check from pg_policies
where schemaname = 'public' and tablename = 'subscriptions' order by policyname;

-- storage objects
select policyname, cmd, qual, with_check from pg_policies
where schemaname = 'storage' and tablename = 'objects' order by policyname;

-- buckets metadata
select id, name, public, file_size_limit, allowed_mime_types from storage.buckets;
```
