# AUDIT-SUPABASE.md — Estado de integración Supabase de SalesFlow

Fecha: 2026-04-30. Read-only. Cada claim con archivo:línea + snippet. Stack confirmado: Vite + React + TS + Zustand. Backend Python FastAPI separado.

---

## RESUMEN UPFRONT — hallazgo más importante

Contrario a lo asumido en el contexto entrante, **sí existe persistencia de sales/metas/inventory en Supabase Storage** (no en tablas SQL). El flujo está implementado end-to-end:

- Subida: `UploadPage.tsx:677` llama `uploadOrgFile(org.id, type, file)` para cada archivo.
- Lectura on-login: `useAutoLoad.ts:95` llama `loadOrgData(org.id)`, descarga via Storage, parsea en worker, hidrata Zustand.
- Limpieza: `UploadPage.tsx:766` llama `deleteOrgFiles(org.id)`.

Es **persistencia por archivo en bucket privado `org-data`**, no insert/select sobre tablas SQL. El detalle por sección.

---

## SECCIÓN 1 — Configuración cliente Supabase

### 1.1 — Inicialización del cliente
**Estado:** ✅ implementado, singleton.
**Evidencia:** `src/lib/supabaseClient.ts:1-7`
```ts
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
```
Se importa como `import { supabase } from '../lib/supabaseClient'` en 11 archivos `src/*` (Grep). Una sola instancia.
**Gap:** sin opciones (`auth.persistSession`, `autoRefreshToken`, etc.) — corre con defaults del SDK.

### 1.2 — Env vars (nombres únicamente)
**Estado:** ✅ definidas.
**Evidencia:**
- `src/vite-env.d.ts:3-7` declara `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_BACKEND_URL`.
- `.env.example:1-2`: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (valores son placeholders genéricos `https://your-project.supabase.co` / `your-anon-key-here`).
- `backend/.env.example:1-2`: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` (placeholders).

Públicas (frontend, expuestas al cliente): `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`, `VITE_APP_VERSION`, `VITE_FORECAST_API_URL`, `VITE_BACKEND_URL`.
Privadas (backend): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DEEPSEEK_API_KEY`, `APP_ENV`, `LOG_LEVEL`.

`.gitignore` cubre `.env`, `.env.local`, `.env.development`, `.env.*.local`, `backend/.env`. `git ls-files | grep -i env` devuelve solo `.env.example`, `backend/.env.example`, `src/vite-env.d.ts`. No hay `.env` real trackeado.

### 1.3 — Tipos TS generados (`Database`)
**Estado:** ❌ no implementado.
**Evidencia:** `Grep "Database"` en `src/` solo da hits irrelevantes (wizardCache/dataCache). Ningún archivo `database.types.ts` / `supabase.types.ts`. `createClient` se usa sin generic `<Database>` en `supabaseClient.ts:6`.
**Gap:** las queries no tienen autocomplete ni typecheck contra el schema real (45 tablas reales según contexto entrante vs 5 esperadas por migrations). Cualquier rename/drop rompería en runtime sin que `tsc --noEmit` lo detecte.

### 1.4 — `supabase/config.toml`
**Estado:** ❌ no existe.
**Evidencia:** `ls supabase/` devuelve solo `migrations/`. `find . -name config.toml` (excluyendo node_modules) → 0 resultados.
**Gap:** sin Supabase CLI local. Las migrations se aplican manualmente (Studio o CLI con linkeo manual). No hay `supabase start` / `supabase db reset` reproducible.

---

## SECCIÓN 2 — Migraciones (estado del schema)

### 2.1 — Lista de migrations
**Estado:** ✅ 11 archivos en `supabase/migrations/`.

| Archivo | Resumen |
|---|---|
| `000_reset.sql` | Drop completo de policies storage + tablas legacy + organizations. Reset total. |
| `001_initial_schema.sql` | Schema viejo de inventario/forecast: organizations, upload_sessions, inventory_positions, sales_history, forecast_snapshots, forecast_results, inventory_projections. RLS **deshabilitado** explícitamente. |
| `002_sales_forecast_schema.sql` | Tablas legacy de forecast por vendedor: sales_forecasts, sales_forecast_results, sales_aggregated. RLS **deshabilitado**. |
| `003_drop_legacy_forecast_tables.sql` | DROP de todas las tablas de 001 y 002 + extras zombie. |
| `003_organizations.sql` | (numeración duplicada con 003_drop) Multi-tenant: extiende organizations con owner_id, crea organization_members, organization_invitations. Funciones SECURITY DEFINER `get_my_org_ids`, `get_my_admin_org_ids`. RLS habilitado. Bucket Storage `org-data` + 4 policies. |
| `004_roles_update.sql` | (numeración duplicada con 004_tighten) Roles `owner|editor|viewer`. Función `get_my_owner_org_ids`, `get_my_editor_org_ids`. Recrea policies de members/invitations/storage. |
| `004_tighten_org_invitation_policies.sql` | Drop policies placebo `Anyone can read invitation by token` y `Anyone can read org name by id`. Crea RPC `get_org_public_info(p_org_id)` SECURITY DEFINER GRANT a anon+authenticated. |
| `005_invitation_email_nullable.sql` | `email` nullable + drop unique(org_id,email) en organization_invitations. |
| `006_allow_open_join.sql` | Columna `allow_open_join boolean default true` en organizations + policy de auto-join solo si está activo. |
| `007_alert_status.sql` | Tabla `alert_status` (org_id, user_id, alert_key, status). RLS via `get_my_org_ids()`. Trigger updated_at. |
| `008_allowed_pages_and_profile_email.sql` | Columna `allowed_pages jsonb` en organization_members + columna `email` en profiles. Hardcoded UPDATE de `lfgg2000@gmail.com` con su uuid. |

### 2.2 — Resumen por migración
Cubierto en 2.1.

### 2.3 — Tablas vivas según migrations + divergencia con schema real

Las migrations actualmente describen estas tablas vivas (post-003_drop_legacy):
- `organizations` (creada en 001, extendida en 003_orgs y 006)
- `organization_members` (003_orgs)
- `organization_invitations` (003_orgs, 005)
- `alert_status` (007)
- `profiles` (referenciada en 008 — **NO se crea en ninguna migration; presupone que existe**)

**Detalle `organizations`** — `001_initial_schema.sql:2-12` + extensiones:
```sql
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
```
Más `owner_id uuid references auth.users(id)` (003_orgs:6-7), `allow_open_join boolean default true` (006:2-3). RLS habilitado en 003_orgs:63. Policies: `Members can read their org` (select), `Owner can update org` (update), `Authenticated can create org` (insert).

**Detalle `organization_members`** — `003_organizations.sql:10-17` + 004_roles:
```sql
create table if not exists public.organization_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'viewer')),  -- 004 lo cambia a owner|editor|viewer
  joined_at timestamptz default now(),
  unique(org_id, user_id)
);
```
+ `allowed_pages jsonb` (008). RLS habilitado (003_orgs:85). Policies recreadas en 004_roles: `Members can read membership`, `Owner can insert/delete/update members`.

**Detalle `organization_invitations`** — `003_organizations.sql:20-31`:
```sql
create table if not exists public.organization_invitations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,  -- 005 lo hace nullable
  role text not null default 'viewer',
  invited_by uuid not null references auth.users(id),
  token uuid not null default gen_random_uuid(),
  accepted_at timestamptz,
  expires_at timestamptz default (now() + interval '7 days'),
  created_at timestamptz default now()
);
```
RLS habilitado. Policy: `Owner can manage invitations` (004_roles:72).

**Detalle `alert_status`** — `007_alert_status.sql:6-17`:
```sql
CREATE TABLE IF NOT EXISTS public.alert_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  alert_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','following','resolved')),
  reopened_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (org_id, alert_key)
);
```
Index en `org_id`. RLS habilitado, policy `members_manage_alert_status` via `get_my_org_ids()`.

**Detalle `profiles`** — 🤷 **NO SE PUEDE VERIFICAR el CREATE**. Migration 008 sólo hace `ALTER TABLE profiles ADD COLUMN`. La creación viene fuera de los archivos del repo (probablemente Studio o trigger Supabase Auth `handle_new_user` no migrado).

**Divergencia migrations vs schema real (45 tablas):** según contexto entrante, el proyecto Supabase real tiene 40 tablas extra (`accounts, categories, transactions, ai_conversations, ai_messages, customers, vendors, plan_*, inventory_* (12 tablas), cash_*, etc.`) que **NO existen en ninguna migration de este repo**. Implicaciones:
- Esas tablas son deuda no versionada. Cualquier schema reset (`000_reset.sql`) las dejaría intactas.
- Frontend no consulta ninguna de ellas (Grep `supabase.from(...)` en `src/` solo retorna: `profiles`, `organizations`, `organization_members`, `alert_status`, `user_subscriptions`).
- `user_subscriptions` la usa `useSubscription.ts:42` pero **NO está en ninguna migration**. El código maneja gracefully el caso de tabla inexistente (`useSubscription.ts:50,66`: "table doesn't exist yet — default to trial").

### 2.4 — Funciones SQL
- `update_updated_at()` — `001_initial_schema.sql:106-112`. Genérica.
- `get_my_org_ids()` — `003_organizations.sql:37-47`. SECURITY DEFINER.
- `get_my_admin_org_ids()` — `003_organizations.sql:49-59`. SECURITY DEFINER (legacy admin role; reemplazado por owner).
- `get_my_owner_org_ids()` — `004_roles_update.sql:33-43`. SECURITY DEFINER.
- `get_my_editor_org_ids()` — `004_roles_update.sql:84-94`. SECURITY DEFINER (roles `owner|editor`).
- `get_org_public_info(p_org_id uuid)` — `004_tighten_org_invitation_policies.sql:21-28`. SECURITY DEFINER. GRANT EXECUTE TO anon, authenticated.
- `set_alert_status_updated_at()` — `007_alert_status.sql:33-41`.

### 2.5 — Triggers
- `organizations_updated_at` — `001_initial_schema.sql:114-116`.
- `alert_status_updated_at` — `007_alert_status.sql:43-46`.

---

## SECCIÓN 3 — Auth

### 3.1 — signInWithOAuth (Google)
**Estado:** ✅ implementado.
**Evidencia:** `src/pages/AuthPage.tsx:85-93`
```ts
const handleGoogle = async () => {
  const redirectTo = joinOrgId
    ? `${window.location.origin}/auth/callback?join=${joinOrgId}`
    : `${window.location.origin}/auth/callback`
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo },
  })
}
```
También login email/password (`AuthPage.tsx:36-55`), signup (`:57-83`), reset password (`:95-110`).

### 3.2 — Manejo de sesión
**Estado:** ✅ implementado.
**Evidencia:**
- Hook `src/lib/useAuth.ts:30-60` hace `getSession()` + `onAuthStateChange()` y mete user/session en `useAuthStore`.
- Store `src/store/authStore.ts:14-22` tiene `{ user, session, loading }`. **NO persistido** (sin `persist` middleware) — la sesión se restaura del SDK Supabase (que sí persiste el JWT en localStorage por default).
- Guard QW6 contra updates duplicados: `useAuth.ts:11` `lastSyncedEmail = new Map()`.

### 3.3 — Callback post-login
**Estado:** ✅ implementado.
**Evidencia:** `src/pages/AuthCallbackPage.tsx:8-48`
```ts
const { data: { session } } = await supabase.auth.getSession()
if (!session) { navigate('/login'); return }
const userId = session.user.id
const params = new URLSearchParams(window.location.search)
const joinOrgId = params.get('join')
if (joinOrgId) {
  await supabase.from('organization_members').insert({ org_id: joinOrgId, user_id: userId, role: 'viewer' })
  navigate('/dashboard'); return
}
const { data: membership } = await supabase
  .from('organization_members').select('org_id').eq('user_id', userId).single()
if (!membership) { navigate('/onboarding'); return }
navigate('/dashboard', { replace: true })
```
Ramas: join → /dashboard, sin org → /onboarding, con org → /dashboard. Onboarding (`OnboardingPage.tsx:97-115` create / `:117-161` join) crea org via `createOrg()` o auto-inserta member.

### 3.4 — Flujo user → org
**Estado:** ✅ implementado.
**Evidencia:** `src/lib/orgService.ts:8-26` `getUserOrg(userId)` consulta:
```ts
const { data: membership } = await supabase
  .from('organization_members')
  .select('org_id, role, allowed_pages, organizations(*)')
  .eq('user_id', userId).single()
```
Hidrata `useOrgStore` (`useAuth.ts:14-21`). `.single()` asume **un usuario = una org** — multi-org no soportado en frontend (ver 5.4).

### 3.5 — Logout
**Estado:** ⚠️ parcial.
**Evidencia:** `src/components/layout/Sidebar.tsx:41-46`
```ts
const handleLogout = async () => {
  if (isDemo) { navigate('/'); return }
  await supabase.auth.signOut()
  resetAll()
  navigate('/login')
}
```
`resetAll` (`appStore.ts:423-469`) limpia `salesflow-storage` localStorage + reset state. **NO limpia**:
- `useOrgStore` (no se llama `useOrgStore.getState().reset()` aquí — sin embargo `useAuth.ts:52` lo limpia cuando `onAuthStateChange` recibe sesión nula).
- `useAlertStatusStore` (`salesflow-alert-status` localStorage) — persiste cross-logout.
- IndexedDB `salesflow-cache` (datasets) — persiste cross-logout. Otro user en mismo browser podría cargarlos (`useAutoLoad.ts:51-57`).

**Gap:** logout deja IndexedDB con datos de la org anterior. `useAutoLoad.ts:48-61` los hidrata si `dataSource==='real'`.

---

## SECCIÓN 4 — Persistencia sales/metas/inventory (LO MÁS IMPORTANTE)

### 4.1 — ¿Existen tablas SQL para sales/metas/inventory?
**Estado:** ❌ no como tablas relacionales.
- En migrations: tablas `sales_history`, `inventory_positions`, `sales_aggregated` existieron en 001/002 pero fueron **DROPed** en `003_drop_legacy_forecast_tables.sql:7-15`.
- En schema real (45 tablas según contexto): hay tablas `inventory_*` (12) creadas vía Studio fuera de migrations. **Frontend no las consulta** (Grep `supabase.from` no las nombra).

### 4.2 — Confirmación
Persistencia comercial **NO** ocurre en tablas SQL. **SÍ** ocurre en **Supabase Storage bucket `org-data`** como archivos crudos por org.

### 4.3 — Call sites de `supabase.from/rpc/auth/storage` relacionados con datos comerciales

**Storage (sales/metas/inventory):**
- `src/lib/orgService.ts:128` — `supabase.storage.from(BUCKET).list(orgId, { limit: 20 })` (listar archivos de org).
- `src/lib/orgService.ts:188` — `supabase.storage.from(BUCKET).list(orgId)` (deleteOrgFiles).
- `src/lib/orgService.ts:191` — `supabase.storage.from(BUCKET).remove(paths)`.
- `src/lib/orgService.ts:200-202` — `supabase.storage.from(BUCKET).upload(path, file, { upsert: true })`.
- `src/lib/orgService.ts:210` — `supabase.storage.from(BUCKET).list(orgId)` (downloadAndParse).
- `src/lib/orgService.ts:214-216` — `supabase.storage.from(BUCKET).download(\`${orgId}/${match.name}\`)`.

Bucket es `'org-data'` (`orgService.ts:4`). Archivos: `${orgId}/ventas.{csv|xlsx}`, `${orgId}/metas.{csv|xlsx}`, `${orgId}/inventario.{csv|xlsx}`.

**Tablas (no datos comerciales pero relacionados):**
- `profiles`: `useAuth.ts:26` (UPDATE email), `orgService.ts:101-103` (SELECT id,full_name,email,avatar_url).
- `organizations`: `orgService.ts:33` (insert), `orgService.ts:144-148` (select id,name,allow_open_join), `orgService.ts:163-165` (update allow_open_join).
- `organization_members`: `orgService.ts:14`, `:40-44`, `:53-55`, `:64-67`, `:77-81`, `:93-95`, `:172-176` (CRUD).
  - También `AuthPage.tsx:46-48`, `AuthCallbackPage.tsx:23-25,32-36`, `OnboardingPage.tsx:141-143`, `InvitationPage.tsx:46-48`.
- `alert_status`: `alertStatusStore.ts:57-66` (upsert), `:71-74` (select).
- `user_subscriptions`: `useSubscription.ts:41-45` (select). **Tabla no existe en migrations**, código asume falla graceful.
- RPC `get_org_public_info`: `InvitationPage.tsx:27`.

### 4.4 — Flujo upload → dashboard
**Estado:** ✅ implementado.
**Evidencia:** `src/pages/UploadPage.tsx:653-690`
```ts
setIsProcessed(false)
setSales(salesData)
setMetas(metasData)
setInventory(inventoryData)
setDataSource('real')

// Persistir en IndexedDB para sobrevivir refreshes
saveDatasets(salesData, metasData, inventoryData).catch(() => {})

if (org) {
  setLoading({ title: 'Guardando en la nube...', ... })
  const toUpload = steps.filter(s => s.status === 'loaded' && s.file)
  const results = await Promise.allSettled(
    toUpload.map(s => uploadOrgFile(org.id, s.id as 'ventas'|'metas'|'inventario', s.file!))
  )
  const failed = results.filter(...).length
  if (failed > 0) toast.warning('...no se pudieron guardar en la nube...')
}
```
Pasos: parser → Zustand (`setSales/Metas/Inventory`) → IndexedDB (`saveDatasets`) → Supabase Storage (`uploadOrgFile` por archivo, con `upsert: true`). Si falla Storage solo emite toast — datos quedan en memoria + IndexedDB. `useAnalysis()` reanaliza al cambiar `sales` (porque setters resetean `isProcessed=false`). Pages leen del store.

**No hay POST a una API route** — todo va directo al cliente Supabase.

### 4.5 — Flujo login → dashboard
**Estado:** ✅ implementado.
**Evidencia:** `src/lib/useAutoLoad.ts:71-115`
```ts
// AuthCallbackPage maneja su propio redirect — no interferir
if (location.pathname === '/auth/callback') return
if (loadingAuth || !user || isProcessed || ranRef.current) return
if (dataSource === 'demo' || dataSource === 'real') return
ranRef.current = true
const run = async () => {
  setIsLoading(true)
  const { org, role } = await getUserOrg(user.id)
  if (!org) { navigate('/onboarding'); return }
  setOrg(org); setCurrentRole(role)
  const { sales, metas, inventory } = await loadOrgData(org.id)
  if (!sales || sales.length === 0) { navigate('/cargar'); return }
  setSales(sales)
  if (metas && metas.length > 0) setMetas(metas)
  if (inventory && inventory.length > 0) setInventory(inventory)
}
```
`loadOrgData` (`orgService.ts:248-258`) descarga 3 archivos de Storage en paralelo, parsea cada uno en un Web Worker (`parseWorker.ts`), retorna arrays.

**F5 después de upload:** dos rutas de restauración:
1. `useAutoLoad.ts:33-68` (sin auth o auth tardío): si `dataSource==='real'` → IndexedDB via `loadDatasets()`. Si `dataSource==='demo'` → `getDemoData()`.
2. `useAutoLoad.ts:71-115` (con auth): salta si ya hubo restauración local; sino baja de Storage.

Datos **no se pierden** post-F5 — cubierto doblemente (IndexedDB + Storage). El comentario de `appStore.ts:510-511` ("sales/metas/inventory NO se persisten en localStorage…") refiere solo a `salesflow-storage` (Zustand persist).

### 4.6 — Botón "Limpiar"
**Estado:** ✅ borra ambos.
**Evidencia:** `src/pages/UploadPage.tsx:750-768`
```ts
const handleLimpiar = async () => {
  resetAll() // ya limpia wizardDraft
  clearDatasets().catch(() => {})  // IndexedDB
  setSteps(INITIAL_STEPS)
  // ... resets locales ...
  if (org?.id) {
    await deleteOrgFiles(org.id)  // Supabase Storage
  }
}
```
Limpia Zustand (`resetAll`) + IndexedDB (`clearDatasets`) + Supabase Storage (`deleteOrgFiles` → `list` + `remove`).

### 4.7 — Persistencia incompleta / código muerto
**Estado:** ⚠️ código muerto en backend.
- `backend/app/services/sales_forecast_service.py` exporta `persist_forecast_to_supabase`, `get_persisted_forecast` consumidos por `backend/app/api/routes/sales_forecast.py`. Estas rutas Python escriben a Supabase con service-role key. **No conectado al frontend** — `forecastApi.ts` está marcado como deuda (`CLAUDE.md` lo lista en "no tocar / código muerto").
- `useSubscription.ts:42` consulta `user_subscriptions` que no existe en migrations — falla graceful (`useSubscription.ts:66` "Supabase table doesn't exist yet — default to trial").

No hay TODOs "persist to Supabase" en frontend. La persistencia comercial vía Storage **sí está conectada** y funcionando.

---

## SECCIÓN 5 — Multi-tenancy actual

### 5.1 — `organizations`
Cubierto en 2.3. RLS habilitado. 3 policies (members read, owner update, authenticated insert con `owner_id = auth.uid()`).

### 5.2 — `organization_members`
Cubierto en 2.3. RLS habilitado. Policies (post 004_roles + 006):
- `Members can read membership` — select via `get_my_org_ids()` (003_orgs:88).
- `Owner can insert/delete/update members` — vía `get_my_owner_org_ids()` (004_roles:48-67).
- `Authenticated can join org as viewer` — insert auto-join si `org.allow_open_join = true` (006:8-18).

### 5.3 — Funciones SECURITY DEFINER
Definiciones SQL completas: ver sección 2.4. `get_my_org_ids` y `get_my_admin_org_ids` en `003_organizations.sql:37-59`. `get_my_owner_org_ids` y `get_my_editor_org_ids` en `004_roles_update.sql:33-43,84-94`. Todas: `language sql security definer stable set search_path = public`.

### 5.4 — `currentOrgId` / `orgId` en frontend
**Estado:** ⚠️ asume una sola org por user.
**Evidencia:**
- `useOrgStore.ts:20-34` mantiene `org: Organization | null` (singular).
- `getUserOrg` (`orgService.ts:13-17`) usa `.single()` — **tira error si user tiene múltiples memberships**.
- Hay un campo `orgId` persistido en `appStore.ts:507` (partialize) pero el flujo activo lee de `useOrgStore.org.id` (Sidebar:25, UploadPage:677, useAutoLoad:84).
**Gap:** no hay UI para elegir org si un usuario perteneciera a varias. Estructura DB sí lo permite (constraint `unique(org_id, user_id)` en members no impide múltiples orgs por user).

### 5.5 — Flujo de invitación
**Estado:** ✅ implementado (link público).
**Evidencia:**
- `InvitationPage.tsx:26-28` consume RPC `get_org_public_info(p_org_id)` (anon-allowed).
- `InvitationPage.tsx:46-48` hace `insert` a organization_members con role 'viewer'. Validación cubierta por policy `Authenticated can join org as viewer` (006).
- Tabla `organization_invitations` existe pero **no se usa desde frontend** (Grep `organization_invitations` en src → 0 hits). El flujo activo es link directo `/join/:orgId`.
**Gap:** las invitaciones por email + token (campos en la tabla) están sin consumer. Solo el link público está activo.

---

## SECCIÓN 6 — Store Zustand

### 6.1 — Stores
- `src/store/appStore.ts` — store principal con persist v3 key `salesflow-storage`.
- `src/store/authStore.ts` — sesión Supabase (sin persist).
- `src/store/orgStore.ts` — org actual (sin persist).
- `src/store/alertStatusStore.ts` — estados de alertas con persist key `salesflow-alert-status`.

### 6.2 — Slices del appStore
**Datos:** sales, metas, inventory.
**Análisis:** vendorAnalysis, teamStats, insights, filteredCandidates, clientesDormidos, concentracionRiesgo, categoriasInventario(+PorCategoria), supervisorAnalysis, categoriaAnalysis, canalAnalysis, dataAvailability.
**Resúmenes:** clienteSummaries, productoSummaries, departamentoSummaries, mesesDisponibles, canalesDisponibles, monthlyTotals, monthlyTotalsSameDay, fechaRefISO.
**Chat:** chatContextVendedor, chatContextCliente, chatMessages, wizardDraft.
**Forecast:** forecastData, forecastLoading, forecastChartLoading.
**UI/control:** isProcessed, isLoading, loadingMessage, orgId, dataSource ('none'|'demo'|'real'), comparisonEnabled, comparisonPeriod, selectedPeriod, configuracion, tipoMetaActivo.

### 6.3 — Persist
**Evidencia:** `appStore.ts:510-518`
```ts
// sales/metas/inventory NO se persisten: son muy grandes para localStorage
partialize: (state) => ({
  selectedPeriod: state.selectedPeriod,
  configuracion: state.configuracion,
  orgId: state.orgId,
  dataSource: state.dataSource,
  tipoMetaActivo: state.tipoMetaActivo,
}) as any,
```
Solo 5 campos. Confirmado.

### 6.4 — `resetAll`
**Estado:** ✅ existe. **Evidencia:** `appStore.ts:423-469`. Limpia localStorage `salesflow-storage` + setea todo el state vaciado: sales/metas/inventory, todos los análisis derivados, chatMessages, forecastData, dataSource='none', selectedPeriod neutro.
**Gap:** no toca `useOrgStore`, `useAlertStatusStore` ni IndexedDB (`dataCache.ts`). Se llama desde `Sidebar.tsx:44` (logout) y `UploadPage.tsx:751` (limpiar wizard).

### 6.5 — Modo demo/live
**Estado:** ✅ implementado vía `dataSource`.
**Evidencia:** `appStore.ts:251` initial `dataSource: 'none'`. Tipo (inferible de uso) `'none' | 'demo' | 'real'` — no `'live'`. Setters: `DemoPage.tsx:46` `setDataSource('demo')`, `UploadPage.tsx:667` `setDataSource('real')`. **No hay campo `mode`**, sólo `dataSource`. `dataSource` se persiste (en partialize), por lo que al refrescar el sistema sabe si restaurar de IndexedDB (real) o regenerar (demo).

---

## SECCIÓN 7 — Modo demo

### 7.1 — Flujo landing → /demo/dashboard
**Estado:** ✅ implementado.
**Evidencia:** `src/pages/DemoPage.tsx:30-67`
```ts
useEffect(() => {
  if (loaded) return
  const { sales: demoSales, metas, inventory } = getDemoData()
  setSales(demoSales); setMetas(metas); setInventory(inventory)
  setConfiguracion({ empresa: DEMO_EMPRESA })
  setDataSource('demo')
  setLoaded(true)
}, [loaded, ...])
useAnalysis()
useEffect(() => {
  if (location.pathname === '/demo') navigate('/demo/dashboard', { replace: true })
}, ...)
```
Hijos via `<Outlet />`. Sidebar añade prefix `/demo` (`Sidebar.tsx:38-39`).

### 7.2 — Estructura del store
Mismo `useAppStore`. NO hay store separado para demo. La distinción se hace via `dataSource === 'demo'` y prefijo de ruta.

### 7.3 — ¿Demo toca Supabase?
**Estado:** ✅ aislado. `DemoPage.tsx` no importa `supabase`. Datos vienen de `getDemoData()` (`src/lib/demoData.ts`, generador local). Sidebar logout en demo: `if (isDemo) { navigate('/'); return }` — ni siquiera llama `supabase.auth.signOut()`.

### 7.4 — Mezcla user-logueado + /demo
**Estado:** ⚠️ riesgo de mezcla.
**Evidencia:** `useAutoLoad.ts:75-76`
```ts
// Si hay datos locales (demo o real), no interferir con carga Supabase
if (dataSource === 'demo' || dataSource === 'real') return
```
Si user logueado entra a `/demo`, `DemoPage` setea `dataSource='demo'` + sobre-escribe `sales/metas/inventory` con datos demo. `useAuth` sigue activo hidratando `useOrgStore` (porque el SDK aún tiene sesión). Si después el user navega a `/dashboard`, `useAutoLoad` ve `dataSource==='demo'` y **no recarga** datos reales — el dashboard verá datos demo aunque haya org real autenticada. No hay leak entre orgs (sólo es mezcla local user vs demo).

---

## SECCIÓN 8 — Env vars + secrets

### 8.1 — Nombres
**Públicas (frontend, build-baked en Vite):** `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_APP_NAME`, `VITE_APP_VERSION`, `VITE_FORECAST_API_URL`, `VITE_BACKEND_URL`.
**Privadas (backend):** `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `DEEPSEEK_API_KEY`, `APP_ENV`, `LOG_LEVEL`.

### 8.2 — `git ls-files | grep -i env`
```
.env.example
backend/.env.example
src/vite-env.d.ts
```
Solo plantillas. `.env` real **no trackeado** (cubierto por `.gitignore`). Existen localmente `.env`, `.env.development`, `backend/.env` (vistos por Glob) pero no están en git.

### 8.3 — Secrets hardcodeados
**Estado:** ✅ sin leaks.
- Búsqueda regex JWT (`eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.`) → 0 hits en `src/`. Único hit fue en `node_modules/zod/.../string.test.ts` (test fixture, no es nuestro).
- `.env.example` y `backend/.env.example` solo tienen placeholders genéricos (`your-anon-key-here`, `your_service_role_key_here`).
- `008_allowed_pages_and_profile_email.sql:10` tiene un email hardcoded (`lfgg2000@gmail.com`) y un uuid de user — no es un secret en sentido cripto, pero es PII personal en migration trackeada.

---

## SECCIÓN 9 — Backend Python

### 9.1 — ¿Se conecta a Supabase?
**Estado:** ⚠️ sí, pero solo en rutas de forecast no usadas por frontend.
**Evidencia:**
- `backend/app/core/supabase_client.py:1-12`:
```py
from supabase import create_client, Client
def get_supabase() -> Client:
  global _client
  if _client is None:
    _client = create_client(settings.supabase_url, settings.supabase_service_key)
  return _client
```
- `backend/requirements.txt` lista `supabase`.
- Usado por `backend/app/services/sales_forecast_service.py` (Grep).

### 9.2 — Credenciales
**Estado:** service-role.
**Evidencia:** `backend/app/core/config.py:11` `supabase_service_key: str`. `backend/.env.example:2` `SUPABASE_SERVICE_KEY=your_service_role_key_here`. **Bypassa RLS.**
**Riesgo:** si el endpoint forecast se reactivara sin filtros explícitos por org, podría exponer cross-org. Hoy está descolgado del frontend (CLAUDE.md "deuda técnica: conectar backend Python forecast a RendimientoPage").

### 9.3 — Endpoints que escriben a Supabase
**Estado:** confirmado — `sales_forecast.py` (`persist_forecast_to_supabase`). El `chat.py` (proxy DeepSeek) no toca Supabase. `forecast.py`, `health.py` tampoco según el contexto entrante.
Frontend **no llama** estos endpoints (no hay fetch al `VITE_FORECAST_API_URL` de rutas de forecast en el código activo — `forecastApi.ts` marcado código muerto en CLAUDE.md).

---

## CUADRO RESPUESTAS BINARIAS

| # | Pregunta | Respuesta |
|---|---|---|
| 1 | ¿Sales persistidas en Supabase hoy? | **Sí** — como archivo crudo en Storage `org-data/{orgId}/ventas.{csv\|xlsx}`. **No** como tabla SQL. |
| 2 | ¿Metas persistidas en Supabase hoy? | **Sí** — como archivo crudo en Storage. No como tabla SQL. |
| 3 | ¿Inventario persistido en Supabase hoy? | **Sí** — como archivo crudo en Storage. No como tabla SQL. |
| 4 | ¿Existen tablas creadas para esos 3? | **No** en migrations vivas. (Las viejas `sales_history`, `inventory_positions`, `sales_aggregated` fueron DROPed en 003_drop_legacy.) |
| 5 | ¿Hay código persistencia escrito pero no conectado? | **Sí** — `backend/app/services/sales_forecast_service.py` (`persist_forecast_to_supabase`) usa service-role key pero el frontend no lo invoca. Además `useSubscription.ts:42` consulta `user_subscriptions` que no existe en migrations. |
| 6 | ¿Auth Google funciona end-to-end? | **Sí** — signInWithOAuth → callback → check membership → onboarding o dashboard. |
| 7 | ¿Sesión persiste al refrescar? | **Sí** — Supabase SDK persiste JWT en localStorage; `useAuth.getSession()` lo restaura al montar. |
| 8 | ¿Modo demo aislado de Supabase? | **Sí** — `DemoPage` no importa supabase y `dataSource='demo'` cortocircuita `useAutoLoad` (Sección 7.4 advierte caso edge user-logueado entrando a /demo: mezcla local, no leak cross-org). |
| 9 | ¿RLS habilitado donde corresponde? | **Parcial** — habilitado en organizations, organization_members, organization_invitations, alert_status, y bucket Storage org-data. **No verificable** en `profiles` y `user_subscriptions` (no creadas por migrations en el repo). Tablas legacy 001/002 tenían RLS deshabilitado pero ya están DROPed. Las 40 tablas extra del proyecto Supabase real (creadas vía Studio fuera de migrations) no se pueden auditar desde el repo. |
| 10 | ¿Riesgo de leak de datos entre orgs según código actual? | **No** según el código activo del frontend. Storage tiene policy "Members can read org files" filtrada por `get_my_org_ids()` (003_orgs:151-159) y todos los `from('organization_members')` consultan `eq('user_id', user.id)`. Riesgo latente: backend Python con service-role key bypassa RLS si se reactiva sin filtros. |

---

## % DEL TRABAJO DE PERSISTENCIA HECHO

**60-70%**, con la siguiente justificación:

**Hecho (lo que ya funciona):**
- Cliente Supabase singleton (1.1).
- Auth Google + email/password + reset + callback + onboarding (3.1-3.4).
- Modelo multi-tenant con RLS en orgs/members/invitations + 4 funciones SECURITY DEFINER (Sección 5).
- Persistencia comercial completa via Storage: upload, download, delete, parse en worker (4.4-4.6).
- Restauración doble post-F5: IndexedDB local + Supabase Storage por org (4.5).
- alert_status sincronizado con upsert por org (alertStatusStore).
- Bucket `org-data` con 4 policies por rol (003_orgs:139-183, 004_roles:96-124).

**Faltante para llegar a "datos persistidos por org con RLS sobre tablas relacionales":**
1. **Schema relacional para sales/metas/inventory** — actualmente es archivo crudo en Storage; eso impide queries server-side (filtros por fecha, agregaciones SQL, joins). Toda la analítica corre en el cliente. Si los datasets crecen >100MB, IndexedDB y el parse cliente se vuelven cuello de botella.
2. **Tipos TS generados (`Database`)** — sin tipos del schema, todas las queries son `any` y un rename rompe en runtime (1.3).
3. **Reconciliar las 40 tablas creadas vía Studio** que no están en migrations — deuda no versionada (2.3).
4. **`user_subscriptions`** está consultada pero no existe (2.3, 4.7).
5. **`profiles`** se consulta pero no se crea en ninguna migration (2.3).
6. **`supabase/config.toml` ausente** — sin entorno local reproducible (1.4).
7. **Logout no limpia IndexedDB ni alertStatusStore** — riesgo cross-user en mismo browser (3.5).
8. **Multi-org por user** no soportado en UI aunque el modelo DB lo permite (5.4).

---

## TOP 3 GAPS CRÍTICOS PARA "DATOS PERSISTIDOS POR ORG CON RLS"

1. **Inexistencia de tablas SQL para sales/metas/inventory.** Storage de archivos crudos cumple el "persistir" pero impide RLS row-level real, queries SQL, joins, índices, agregaciones server-side, y limita escalabilidad. Migrar al menos `sales` a tabla particionada por org_id con RLS via `get_my_org_ids()` es el siguiente salto natural.
2. **Divergencia migrations vs proyecto real (5 migradas vs 45 en el proyecto Supabase actual + `profiles`/`user_subscriptions` consultadas pero no migradas).** Hace que el repo no sea fuente de verdad del schema y bloquea cualquier reset/recreate.
3. **Logout incompleto + sin tipos generados.** Logout deja IndexedDB + alertStatusStore con datos de la sesión anterior (riesgo cross-user en kioskos / equipos compartidos). Sin `Database` TypeScript types, cualquier cambio de schema solo se descubre en runtime.

---

## SECRETS EN REPO

**No.** Búsqueda de patrones JWT (`eyJ...`) en el repo (excluyendo node_modules) = 0 hits. `.env.example` y `backend/.env.example` solo contienen placeholders. `.env` reales están en `.gitignore` y no trackeados. Único PII expuesto: `lfgg2000@gmail.com` + uuid del user en `008_allowed_pages_and_profile_email.sql:10` — backfill personal hardcoded en migration.
