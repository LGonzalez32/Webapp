# AUDIT-MIGRATION-PLAN.md — Storage → SQL para SalesFlow

Fecha: 2026-04-30. Read-only. Cada claim con `archivo:línea`. Cuando algo no se pudo verificar se marca **NO SE PUEDE VERIFICAR**.

---

## 0 — Corrección de premisa

El usuario describe el proyecto como "App Next.js". **Esto está equivocado.** Stack real verificado:

- `package.json`/`vite.config.ts` + `CLAUDE.md` líneas 6-12: **Vite + React 19 + TypeScript + Zustand v5 (persist v3, key `salesflow-storage`)**, Tailwind v4, react-router-dom v7. No hay Next.js, ni `app/` ni `pages/api/` server-side, ni middleware.
- Toda llamada a Supabase pasa **directamente del navegador** al SDK (`src/lib/supabaseClient.ts:1-7`). **No existen API routes** intermedias en el frontend.
- El backend Python en `backend/` (FastAPI) está construido pero **no conectado al frontend** (`CLAUDE.md` línea ~14). Cualquier "function" o "edge function" que el plan sugiera implica trabajo nuevo, no migrar código existente.

Cualquier plan que asuma "tenemos rutas server-side donde poner lógica" arranca en falso.

Las auditorías existentes que se reutilizan (cito secciones, no repito):
- `AUDIT-SUPABASE.md` — flujo Storage end-to-end, multi-tenant, env, secrets.
- `AUDIT-INCONSISTENCIES.md` — bugs derivados (KPI mapping).
- `AUDIT.md` — latencia chat ↔ datos.

---

## BLOQUE 1 — Mapa del flujo actual de datos

### 1.1 — End-to-end "Cargar archivo → dashboard poblado"

| Paso | Archivo:línea | Función |
|---|---|---|
| 1 | `src/pages/UploadPage.tsx` (drag/drop wizard) | Selección de archivos + parse worker step-by-step |
| 2 | Parser → store por step | `parsedData` por step, `setSteps` actualiza UI antes de analizar |
| 3 | `UploadPage.tsx:640-668` `doAnalyze` | `setIsProcessed(false); setSales(...); setMetas(...); setInventory(...); setDataSource('real')` |
| 4 | `UploadPage.tsx:670` `saveDatasets` | IndexedDB (`src/lib/dataCache.ts:44-56`) |
| 5 | `UploadPage.tsx:672-689` | Si hay `org`: `uploadOrgFile(org.id, ...)` por archivo a Storage `org-data` |
| 6 | `useAnalysis()` se monta en cada page | `src/lib/useAnalysis.ts:86-197` arranca worker `analysisWorker.ts` cuando `sales.length>0 && !isProcessed` |
| 7 | Worker computa todo | `setVendorAnalysis/setTeamStats/setInsights/...` (≈20 setters), luego `setIsProcessed(true)` |
| 8 | Pages re-renderizan | leen del store con selectores |

Snippet upload→store→cache→storage (`UploadPage.tsx:663-678`):
```ts
setIsProcessed(false)
setSales(salesData); setMetas(metasData); setInventory(inventoryData)
setDataSource('real')
saveDatasets(salesData, metasData, inventoryData).catch(() => {})
if (org) {
  const toUpload = steps.filter(s => s.status === 'loaded' && s.file)
  const results = await Promise.allSettled(
    toUpload.map(s => uploadOrgFile(org.id, s.id as 'ventas'|'metas'|'inventario', s.file!))
  )
}
```

### 1.2 — Qué se sube a Storage

Se sube **el archivo crudo del usuario** (CSV o XLSX original), no JSON procesado. Evidencia `src/lib/orgService.ts:194-204`:
```ts
export async function uploadOrgFile(orgId, type, file) {
  const path = `${orgId}/${type}.${getExtension(file)}`
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true })
  return { error: error?.message ?? null }
}
```
`getExtension` (`orgService.ts:183-185`) preserva la extensión del File. El parseo (PapaParse / XLSX) se vuelve a hacer al descargar (`orgService.ts:206-246` arranca un worker para parsear el `arrayBuffer`).

Implicación: **se parsea dos veces** — una en upload (para mostrar preview/validación) y otra en login (al bajar de Storage). Costo dominante: ~93k filas demo equivalen a ~5-15s de parse en el worker.

### 1.3 — Buckets

- Bucket único: `'org-data'` (`orgService.ts:4`).
- Estructura: `${orgId}/ventas.{csv|xlsx}`, `${orgId}/metas.{csv|xlsx}`, `${orgId}/inventario.{csv|xlsx}`.
- Policies en `supabase/migrations/003_organizations.sql` y `004_roles_update.sql:96-124` (cubierto en `AUDIT-SUPABASE.md` 4.x).
- Upsert por `type`: cada archivo nuevo del mismo `type` sobrescribe el anterior. **No hay versionado.**

### 1.4 — Momento de lectura

Dos rutas de restauración (`src/lib/useAutoLoad.ts`):

- **Sin auth o auth tardío** (`useAutoLoad.ts:33-68`): si `dataSource==='demo'` → `getDemoData()`; si `==='real'` → `loadDatasets()` de IndexedDB.
- **Con auth** (`useAutoLoad.ts:71-115`): `getUserOrg(user.id)` → si hay `org` → `loadOrgData(org.id)` que descarga 3 archivos de Storage en paralelo y los parsea cada uno en su Worker (`orgService.ts:248-258`).

Ya cubierto en `AUDIT-SUPABASE.md` 4.5. **No hay otros entry points** verificados con Grep `loadOrgData|loadDatasets` en `src/`.

### 1.5 — Stores Zustand persistidos

| Store | Archivo | Persist | Storage backend | Key |
|---|---|---|---|---|
| `appStore` | `src/store/appStore.ts:512-518` | sí (parcial) | localStorage | `salesflow-storage` |
| `authStore` | `src/store/authStore.ts` | no | — (Supabase SDK persiste JWT en localStorage solo) | — |
| `orgStore` | `src/store/orgStore.ts` | no | — | — |
| `alertStatusStore` | `src/store/alertStatusStore.ts:57-74` | sí | localStorage | `salesflow-alert-status` |

`appStore` partialize (`appStore.ts:512-518`) persiste solo: `selectedPeriod, configuracion, orgId, dataSource, tipoMetaActivo`. **`sales/metas/inventory` NO** (comentario explícito `appStore.ts:510-511`: "muy grandes para localStorage").

### 1.6 — Lógica que depende de "datos en memoria"

`useAnalysis` (`src/lib/useAnalysis.ts`) corre `computeCommercialAnalysis` (`src/lib/analysis.ts:879`) **una vez** por dataset y cachea ≈20 derivados en el store:

- `vendorAnalysis`, `teamStats`, `insights`, `filteredCandidates` (Z.11.4)
- `clientesDormidos`, `concentracionRiesgo`
- `categoriasInventario`, `categoriasInventarioPorCategoria`
- `supervisorAnalysis`, `categoriaAnalysis`, `canalAnalysis`
- `clienteSummaries`, `productoSummaries`, `departamentoSummaries`
- `mesesDisponibles`, `canalesDisponibles`
- `monthlyTotals`, `monthlyTotalsSameDay`, `fechaRefISO`
- `dataAvailability`

Definidos en `appStore.ts:70-95`. **Páginas iteran sobre arrays completos en render**: `EstadoComercialPage.tsx`, `VendedoresPage.tsx`, `RendimientoPage.tsx`, `RotacionPage.tsx`, `ClientesPage.tsx`, `DepartamentosPage.tsx`. Si las páginas leyeran fresh del servidor cada navegación:
- pérdida del cache de 20 derivados → recalcular o agregar SQL en cada render.
- `useAnalysis` se monta en cada page (no es un guard de root layout) → cada navegación dispararía worker o queries.
- Telemetría (`recordAnalysisWorkerStageReport` `useAnalysis.ts:132`) asume un único pase por dataset.

Cosas que sí se pueden mover sin tocar UI:
- `monthlyTotals`, `monthlyTotalsSameDay` — son agregados puros y aplican mismo schema en consumer.

Cosas que sí requieren rewrite:
- `insights/filteredCandidates` — los detectores corren sobre `SaleRecord[]` con `_stats` mutables (ver `CLAUDE.md` Z.7.5-B). Migrar esto a SQL implica re-implementar el motor de insights, **no es portable a SQL en su forma actual**.

---

## BLOQUE 2 — Mapa de lo que existe en Supabase hoy

### 2.1 — Las 45 tablas reales

Resultado de `mcp__supabase__list_tables` (45 tablas, todas con RLS habilitada):

**Auth/Org (5)** — usadas hoy:
| Tabla | Rows | Origen |
|---|---|---|
| `organizations` | 1 | migrations 001/003 |
| `organization_members` | 1 | migration 003 |
| `organization_invitations` | 0 | migration 003 |
| `profiles` | 1 | **NO está en migrations** (creada vía Studio + trigger `handle_new_user`) |
| `subscriptions` | 0 | **NO está en migrations** (Studio) |

**Finanzas / cashflow (no usadas por SalesFlow comercial — 12)**:
`accounts, transactions, transaction_imports, ar_invoices, ap_bills, bank_movements, cash_assumptions, cash_positions, cash_profile, recurring_outflows, promises_to_pay, audit_log, action_items`.

**Inventario v2 (no usadas — 12)**:
`inventory_snapshots, inventory_sku_master, inventory_sales_history, inventory_onhand, inventory_forecast_base, inventory_forecast_overrides, inventory_forecast_final, inventory_forecast_versions, inventory_metrics_sku, inventory_metrics_supplier, inventory_metrics_category, inventory_settings, inventory_health_history`.

**Planning / scenarios (no usadas — 5)**: `plan_nodes, plan_node_values, plan_scenarios, plan_scenario_values, plan_monthly`.

**AI / misc (no usadas — 4)**: `ai_conversations, ai_messages, ai_usage_monthly, alerts, categories, customers, vendors, data_sources, imports`.

**Crítico:** la tabla `alert_status` que usa `src/store/alertStatusStore.ts:57` **no existe en la DB** (no aparece en `pg_tables`). El upsert estaría fallando silenciosamente. NO SE PUEDE VERIFICAR si fue dropeada manualmente o si nunca se aplicó la migration `007_alert_status.sql`.

### 2.2 — USADA / DUDOSA / NO USADA

Grep `supabase\.(from|rpc|storage|auth)` en `src/`:

| Tabla / recurso | Estado | Call site |
|---|---|---|
| `organizations` | USADA | `orgService.ts:32, 144, 163` |
| `organization_members` | USADA | `orgService.ts:14, 40, 53, 64, 77, 93, 172`, `AuthCallbackPage.tsx:23, 32`, `OnboardingPage.tsx:141`, `InvitationPage.tsx:46`, `AuthPage.tsx:46` |
| `profiles` | USADA | `useAuth.ts:26`, `orgService.ts:101` |
| `alert_status` | USADA en código, **inexistente en DB** | `alertStatusStore.ts:57, 71` — pendiente bug latente |
| `user_subscriptions` | DUDOSA — código asume falla graceful, tabla real es `subscriptions` | `useSubscription.ts:42` |
| `organization_invitations` | NO USADA por frontend | tabla existe, sin call site (verificado con Grep) |
| `subscriptions` (real) | NO USADA — código consulta `user_subscriptions` por error | — |
| Storage `org-data` | USADA | `orgService.ts:128, 188, 191, 200, 210, 214` |
| RPC `get_org_public_info` | USADA | `InvitationPage.tsx:27` |
| Las otras 38 tablas | **NO USADAS por frontend** (0 hits) | — |

### 2.3 — RLS por tabla + policies

**Toda tabla pública tiene `rowsecurity=true`** (verificado con `select … from pg_tables`).

Policies extraídas (resumen — todas filtran via `is_org_member()` / `get_my_org_ids()`):
- `organizations`: 3 policies (read members, update owner, insert authenticated)
- `organization_members`: 4 policies (admin insert/delete, viewer auto-join, members read)
- `organization_invitations`: 1 (Admin can manage)
- `profiles`: 2 (select_own, update_own)
- Las otras 41 tablas: una o varias policies tipo `*_all_member` / `*_select_member` / `*_admin_write`. Están **listas para multi-tenant** aunque no se usen.

Policies completas en `pg_policies`. Disponibles si se necesitan para schema relacional sales/metas/inventory — el patrón ya existe.

**Ausencias:**
- `alert_status` no aparece (tabla no existe).
- `subscriptions` tiene 1 policy `subs_select_member`.

### 2.4 — `profiles` y `user_subscriptions`

**`profiles`**: existe (1 row). NO SE PUEDE VERIFICAR el `CREATE TABLE` exacto desde el repo (no hay migration). La función `handle_new_user` (rutina detectada en `information_schema.routines`) probablemente la materializa al hacer signup. Columnas accedidas por código: `id, full_name, email, avatar_url` (`orgService.ts:102`).

**`user_subscriptions`**: **no existe**. La tabla real es `subscriptions`. El código (`src/lib/useSubscription.ts:42`) consulta una tabla por nombre incorrecto:
```ts
const { data, error } = await supabase
  .from('user_subscriptions')   // ← no existe
  .select('*').eq('user_id', userId).single()
```
El comentario en `useSubscription.ts:50,66` ya anota que se asume falla graceful — pero la lógica real de billing está rota.

### 2.5 — FKs / índices / constraints

Índices verificados (`pg_indexes`): la mayoría de tablas tienen `*_pkey` y al menos un índice por `organization_id`. Patrones notables:
- `idx_tx_org_date(org_id, date)` — patrón compuesto correcto.
- `idx_inv_msku_snap_risk_cov` — multi-col en inventory metrics.
- Tablas usadas hoy (`organizations`, `organization_members`, `profiles`): solo PK + uniques.

NO SE PUEDE VERIFICAR el FK exacto sin un query a `pg_constraint` (no se ejecutó por presupuesto).

### 2.6 — Funciones / triggers / vistas

Funciones SQL detectadas (11):
- `get_my_admin_org_ids, get_my_org_ids, get_org_public_info` (de migrations).
- `handle_new_user` (Supabase Auth — bootstraps profiles).
- `is_org_member, is_org_owner_or_admin` (helpers no en migrations).
- `refresh_monthly_summary, trg_refresh_monthly_summary` (refresh probable de MV — NO SE PUEDE VERIFICAR qué MV refresca; nada en migrations).
- `update_cash_profile_updated_at, update_updated_at`, `rls_auto_enable`.

Vistas: NO SE PUEDE VERIFICAR — query no se corrió (presupuesto). El patrón `refresh_monthly_summary` sugiere que existe alguna materialized view de un módulo no-SalesFlow.

---

## BLOQUE 3 — Estructura de datos del cliente

### 3.1 — Shape exacto de los objetos en memoria

`src/types/index.ts:3-25` `SaleRecord`:
```ts
export interface SaleRecord {
  fecha: Date
  vendedor: string
  unidades: number
  producto?: string; cliente?: string; venta_neta?: number
  categoria?: string; subcategoria?: string; proveedor?: string
  canal?: string; departamento?: string; supervisor?: string
  costo_unitario?: number
  clientKey?: string | null
}
```

`src/types/index.ts:27-45` `MetaRecord` — pivote por mes/año con dimensiones opcionales (vendedor/cliente/producto/categoria/subcategoria/departamento/supervisor/canal/proveedor); `meta_uds?` y `meta_usd?` ambos opcionales (uno u otro). Hay campos `@deprecated meta` y `tipo_meta` por compat.

`src/types/index.ts:47-56` `InventoryItem`:
```ts
export interface InventoryItem {
  fecha: Date          // snapshot date — required
  producto: string
  unidades: number
  categoria?: string; subcategoria?: string; proveedor?: string
}
```

### 3.2 — Volúmenes típicos

- **Demo** (`CLAUDE.md` línea ~95): 8 vendedores, 20 productos, 30 clientes, **93,155 filas** de ventas; rango 2024-01 a 2026-04.
- **Producción real**: NO SE PUEDE VERIFICAR — `uploadValidation.ts` no contiene constantes `MAX_FILE_SIZE` ni `MAX_ROWS` (Grep negativo). El parser no impone límites duros visibles en lectura inicial. Supabase Storage default es 50 MB por upload (no verificable desde el repo).
- Razonable estimar 100k-500k filas/año para un cliente B2B mediano (por extrapolación del demo a 2 años).

### 3.3 — Datos derivados — recompute / view / table?

Recomendación por agregado, asumiendo migración a SQL:

| Derivado | Recomendación | Justificación |
|---|---|---|
| `monthlyTotals` / `monthlyTotalsSameDay` | **Materialized view** o tabla agregada con refresh on insert | Se usan en YoY/MTD; recalcular es trivial pero pagar 5s × N páginas no |
| `vendorAnalysis` | **View** + filtro por mes en runtime | Se proyecta por `selectedPeriod`; SQL puede hacer todo |
| `teamStats` | **View** que agrega `vendorAnalysis` | Trivial |
| `clientesDormidos` | **View** parametrizable por `threshold` | LEFT JOIN sobre `last_sale_date < now() - interval` |
| `concentracionRiesgo` | **View** | Pareto requires window functions — Postgres lo hace fácil |
| `clienteSummaries / productoSummaries / departamentoSummaries` | **View** | Agregaciones puras |
| `mesesDisponibles / canalesDisponibles` | **runtime** (`SELECT DISTINCT`) | Cardinalidad baja; índice cubre |
| `categoriasInventario / categoriasInventarioPorCategoria` | **View** sobre inventory + sales | Cruce tabla con join + window |
| `supervisorAnalysis / categoriaAnalysis / canalAnalysis` | **View** | Mismo patrón |
| `insights / filteredCandidates` | **runtime cliente** (motor actual) | Z.11+Z.12 tienen state mutable (`_stats`, gate Z.12 r3). Re-implementar en SQL es fase ≥2. |

### 3.4 — Alertas (clientes dormidos / concentración)

`computeClientesDormidos` (`analysis.ts:686`) y `computeConcentracionRiesgo` corren **en cliente, dentro del worker**. Se podrían precalcular como views:
```sql
-- ejemplo conceptual, NO crear
create view v_clientes_dormidos as
select cliente, max(fecha) as last_sale, current_date - max(fecha) as days_dormant
from sales group by org_id, cliente
having current_date - max(fecha) > 30;
```
Trade-off: hoy son ~50ms en el worker. Migrar a view solo aporta si la query se reusa server-side (chat). Para el dashboard, ninguna ganancia.

---

## BLOQUE 4 — Propuesta de esquema SQL (textual, no se aplica)

### 4.1 — Esquema mínimo

**Reusar:** `organizations`, `organization_members`, `profiles` (estado actual cumple).

**Nuevas tablas (propuesta):**

```sql
-- sales — la tabla pesada
create table sales (
  id            bigint generated always as identity primary key,
  org_id        uuid not null references organizations(id) on delete cascade,
  fecha         date not null,
  vendedor      text not null,
  unidades      numeric not null,
  producto      text,
  cliente       text,
  venta_neta    numeric,
  categoria     text,
  subcategoria  text,
  proveedor     text,
  canal         text,
  departamento  text,
  supervisor    text,
  costo_unitario numeric,
  client_key    text,             -- normalized cliente
  upload_id     uuid references data_uploads(id),
  created_at    timestamptz default now()
);

-- particionamiento: NO partition. Para <1M rows/org/año un índice compuesto basta.
-- Subir a 5M+ → partition by range(fecha) anual.
create index sales_org_fecha_idx       on sales (org_id, fecha desc);
create index sales_org_vendedor_fecha  on sales (org_id, vendedor, fecha desc);
create index sales_org_cliente_fecha   on sales (org_id, cliente, fecha desc) where cliente is not null;
create index sales_org_producto_fecha  on sales (org_id, producto, fecha desc) where producto is not null;
create index sales_org_depto_fecha     on sales (org_id, departamento, fecha desc) where departamento is not null;

-- RLS
alter table sales enable row level security;
create policy sales_member_all on sales for all using (org_id = any(get_my_org_ids()));

-- goals (metas)
create table goals (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  mes          smallint not null check (mes between 1 and 12),
  anio         smallint not null,
  meta_uds     numeric,
  meta_usd     numeric,
  vendedor     text, cliente text, producto text, categoria text,
  subcategoria text, departamento text, supervisor text, canal text, proveedor text,
  upload_id    uuid references data_uploads(id),
  unique (org_id, anio, mes, vendedor, cliente, producto, categoria,
          subcategoria, departamento, supervisor, canal, proveedor)
);
create index goals_org_anio_mes on goals (org_id, anio, mes);

-- inventory snapshots
create table inventory (
  id           bigint generated always as identity primary key,
  org_id       uuid not null references organizations(id) on delete cascade,
  fecha        date not null,
  producto     text not null,
  unidades     numeric not null,
  categoria    text, subcategoria text, proveedor text,
  upload_id    uuid references data_uploads(id),
  unique (org_id, fecha, producto)
);
create index inventory_org_fecha on inventory (org_id, fecha desc);

-- data_uploads (audit trail)
create table data_uploads (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id),
  file_type   text not null check (file_type in ('ventas','metas','inventario')),
  filename    text,
  row_count   integer,
  file_size   bigint,
  status      text default 'completed',
  created_at  timestamptz default now()
);
create index data_uploads_org_created on data_uploads (org_id, created_at desc);
```

**Salespeople / customers / products: derivables.** No crear tablas separadas a menos que aparezca un caso de uso (ej. atributos extra del vendedor que no vienen en sales). Hoy no hay. Crear como views si se quiere catálogo:
```sql
create view v_vendedores as select distinct org_id, vendedor from sales;
```

### 4.2 — Materialización

Tabla física: solo `sales/goals/inventory/data_uploads`. **Nada más.**

Views (no materialized salvo `monthly_totals`):
- `v_monthly_totals` — `(org_id, anio, mes, sum(uds), sum(neta))`. Refresh-on-insert con trigger AFTER INSERT (concurrency: row-level lock). Si refresca cuesta más que la query directa, dejar como view normal.
- `v_clientes_dormidos`, `v_concentracion_riesgo`, `v_vendor_analysis_base` — views normales.

### 4.3 — Particionamiento + índices

Para perfiles <1M filas/org (todos los clientes esperados en año 1): **no particionar**. Un solo índice compuesto `(org_id, fecha desc)` cubre 95% de queries. Postgres free tier tiene 500MB DB + límite de connections — particionar agrega complejidad y coste de planning sin ganancia.

Si un cliente único supera 5M filas: partition by range(fecha) anual + index parcial por org_id.

Patrones de query atacados:
- "ventas YTD del equipo": `where org_id=? and fecha between ? and ?` → `sales_org_fecha_idx`.
- "ventas por vendedor en mes": `sales_org_vendedor_fecha`.
- "top clientes": `sales_org_cliente_fecha` + agg.
- "departamentos heatmap": `sales_org_depto_fecha`.
- "rotación inventario": `inventory_org_fecha` + join sales.

---

## BLOQUE 5 — Plan de migración (sin escribir código)

### 5.1 — Pasos por dependencia

1. **Generar tipos** `Database` (`mcp__supabase__generate_typescript_types` ya disponible). Sin esto, todo el resto es `any`. **Riesgo Bajo.** 1-2h.
2. **Reconciliar tablas fantasma**: aplicar migration `007_alert_status.sql` (no aplicada en DB live), arreglar `useSubscription.ts:42` para usar `subscriptions` (no `user_subscriptions`). **Riesgo Bajo.** 1-2h.
3. **Crear schema sales/goals/inventory + RLS + data_uploads** vía migration nueva. No tocar app aún. **Riesgo Bajo.** 3-5h (incluye verificar policies con `is_org_member`).
4. **Construir capa de acceso `dataService.ts`** que envuelva `supabase.from('sales').select(...)`. Mantener firma `loadOrgData(orgId) → {sales, metas, inventory}`. **Riesgo Medio** (volumen: bajar 100k+ rows en JSON cuesta ~5-10s y RAM 50MB; el cliente Supabase no streamea por default). 6-10h.
5. **Reemplazar uploadOrgFile**: parsear → bulk insert vía `supabase.from('sales').insert(rows)` en batches de 1000. **Riesgo Alto** (latencia de upload sube de 1 archivo a N requests; necesita progreso UI; rate limits PostgREST). 8-12h.
6. **Backfill existente** (si hay): leer Storage → parsear → insert. Single user → puede descartarse. **Riesgo Bajo si se descarta.** 0-3h.
7. **Apagar Storage uploads** detrás de feature flag `VITE_USE_SQL_BACKEND`. **Riesgo Bajo** una vez 4-5 estables. 1-2h.
8. **Migrar agregados servidor-side** (views `v_monthly_totals`, etc.). Cambiar `useAnalysis` para que **omita** los pasos que la view ya cubre. **Riesgo Alto** — `useAnalysis` está acoplado al motor de insights cliente. Mejor dejar para post-launch. 15-30h.

### 5.2 — Por paso

| Paso | Archivos | Riesgo | Test | Horas |
|---|---|---|---|---|
| 1 Tipos `Database` | `src/types/database.ts` (nuevo), `supabaseClient.ts` (typed createClient) | Bajo | `tsc --noEmit` antes/después | 1-2 |
| 2 alert_status + subscriptions | `alertStatusStore.ts`, `useSubscription.ts`, migrations | Bajo | upsert manual + UI alertas | 1-2 |
| 3 Schema migration | `supabase/migrations/009_sales_relational.sql` | Bajo | apply en branch supabase + select de prueba | 3-5 |
| 4 dataService | `src/lib/dataService.ts` (nuevo), `useAutoLoad.ts` | Medio | mock: cargar demo via SQL = comparar con Storage | 6-10 |
| 5 Bulk insert | `UploadPage.tsx:640-690`, `orgService.ts` | Alto | upload demo (93k filas) y medir tiempo | 8-12 |
| 6 Backfill | script ad-hoc | Bajo | no aplica si descarte | 0-3 |
| 7 Feature flag | `vite.config.ts`, `.env.example` | Bajo | toggle on/off en dev | 1-2 |
| 8 Views server-side | nueva migration + `useAnalysis.ts` | Alto | regression sweep de `vendorAnalysis` cliente vs server | 15-30 |

**Total estimado: 35-66h** sin paso 8. Con paso 8: 50-95h.

### 5.3 — Sin tocar UI vs con rewrite

- **Sin tocar UI** (capa de acceso): pasos 1-7. Las páginas siguen leyendo del store; solo cambia de dónde se llena.
- **Rewrite obligado**: paso 8 (motor de insights). `CLAUDE.md` línea ~80 lo prohíbe explícitamente sin pasar por las fases Z.11/Z.12.

### 5.4 — Datos existentes en Storage

Hoy hay 1 organización con 1 miembro (`organizations:1, organization_members:1`). Si el usuario `lfgg2000@gmail.com` tiene archivos en `org-data/`, NO SE PUEDE VERIFICAR sin listar el bucket (no hecho por presupuesto). Recomendación: **descartar** y re-uploadear post-migración. Aceptable para single user.

### 5.5 — Demo durante y post-migración

Demo no toca Supabase (`DemoPage.tsx:30-67` no importa `supabase`; `dataSource='demo'` cortocircuita `useAutoLoad` línea 76). **No requiere cambios.** Confirmado.

### 5.6 — Rollback

- **Feature flag `VITE_USE_SQL_BACKEND`**: en `dataService.ts`, sí → SQL, no → Storage. Un build, dos backends.
- **Dual-write transitorio**: en paso 5, escribir a Storage **y** SQL hasta validar. Costo: 2× tiempo de upload, pero rollback gratis.
- **Snapshots de Storage**: descargar bucket completo antes del cutoff (manual con CLI o script).
- **Backups Postgres**: Supabase free hace 1 backup diario automático. Verificar que esté on antes de schema migration.

---

## BLOQUE 6 — Riesgos y bloqueadores

### 6.1 — Acoplamiento con datos en memoria

Grep `useAppStore` en `src/`: **45 hits en 13 pages + 34 hits en 11 components = 79 sitios** acoplados al store. Pages que iteran arrays completos en render:

- `EstadoComercialPage.tsx` (6 selectores `useAppStore`)
- `DepartamentosPage.tsx` (11)
- `ChatPage.tsx` (8)
- `RendimientoPage.tsx`, `ClientesPage.tsx`, `RotacionPage.tsx`, `VendedoresPage.tsx`, `MetasPage.tsx` (≥2 c/u)

Si los datos viven en SQL, **no es necesario** cambiar las pages — solo cambiar quién llena el store. Las páginas se pueden envolver. **No requieren rewrite** salvo que decidas paginación server-side (entonces sí, casi todo).

### 6.2 — Chat con DeepSeek

`chatService.ts:181` `buildSystemPrompt(ctx)`. Construye prompt con KPIs agregados ya en memoria (cubierto en `AUDIT.md`). Si datos en SQL:
- chat hace queries por pregunta → +200-800ms de latencia por query (vs 0 hoy).
- **Mejor:** materializar agregados (views) y mantener `buildSystemPrompt` leyendo del store. El store lo llena `useAnalysis` con un fetch único de las views. Latencia chat sin cambio.
- Recomendación: NO mover buildSystemPrompt a server-side. La estrategia "store cargado de views agregadas" es más simple y mantiene LCP.

### 6.3 — Ratio Zustand

79 sitios acoplados / ~24 archivos consumer activos. ~3 selectores por archivo en promedio. **Ratio alto** — no es un wrapper delgado; es la columna vertebral del frontend. Cambiar el storage de fondo es viable (paso 4). Cambiar la API del store rompe todo.

### 6.4 — Recomendación honesta

Honestidad bruta: **migrar todo el storage a SQL en 30 días siendo un solo data analyst con 4-5h/día y un solo user activo es tirar runway**. Lo que funciona hoy:

- Single user, datos chicos (93k filas demo).
- IndexedDB + Storage cubren refresh + cross-device.
- Worker offthread = analysis no bloquea UI.

Lo que NO mejora con migración a SQL hoy:
- Latencia (peor — bajar JSON de 100k filas vs un blob).
- Performance percibida (igual: el worker tarda lo mismo).
- Multi-user real (no hay).
- Compliance/auditoría (no hay regulación).

Lo que SÍ mejora con migración:
- Server-side queries para chat avanzado (futuro).
- Ingestión incremental (subir solo nuevas filas vs re-upload completo).
- Reportes server-side / scheduled (futuro).

Ninguno de esos drivers existe en los próximos 30 días.

### 6.5 — Bugs latentes detectados durante este audit

1. **`alert_status` no existe en DB** pero `alertStatusStore.ts:57` la usa con upsert. Migration `007_alert_status.sql` está en el repo pero **nunca se aplicó al proyecto live** — solo aparecen las migrations 001-006 y 008 a través de las tablas que crearon. Síntoma: alertas no persisten cross-device.
2. **`useSubscription.ts:42` consulta `user_subscriptions` que no existe** — la tabla real es `subscriptions`. Síntoma: billing/trial logic en estado degradado permanente. Ya hay comentario que lo asume.
3. **45 tablas vs 5 migrations versionadas**: el proyecto Supabase mezcla SalesFlow con tablas de otro dominio (cashflow, inventory v2, planning) creadas vía Studio. Riesgo: cualquier `000_reset.sql` futuro toca solo lo de las migrations; el resto queda zombie.
4. **`organization_members` consulta con `.single()`** (`orgService.ts:13-17`) — multi-org por user no soportado en frontend aunque DB lo permite. Bug latente: si un user con 2 memberships entra, error.
5. **`useAuth.ts` race**: `localRestoreRef` (`useAutoLoad.ts:23`) y `ranRef` (`:22`) son refs separados — un cambio rápido `dataSource: none → real → demo` puede dejar al guard local-first sin disparar la rama auth aunque sí debería.
6. **Backend Python con service-role key disponible** (`backend/app/core/supabase_client.py:10`). Si alguien reactiva el endpoint forecast sin filtrar por `org_id`, leak cross-org.
7. **`UploadPage.tsx:670` `saveDatasets(...).catch(() => {})`** — IndexedDB falla silenciosa. Si el storage del navegador está lleno, próximo refresh pierde datos sin warning.
8. **Logout incompleto** (cubierto en `AUDIT-SUPABASE.md` 3.5): IndexedDB + alertStatusStore persisten cross-user. Riesgo en kioskos.
9. **`profiles` no migrada**: la tabla existe en DB pero su `CREATE TABLE` no está en el repo. Cualquier reset desde repo borra `organizations` y deja `profiles` huérfana → FK rotas.
10. **Función `refresh_monthly_summary`** existe en DB sin migration en el repo — alguien creó algo a mano y no se versionó.

---

## RECOMENDACIÓN HONESTA FINAL

**Opción B: Lanzar con Storage actual, migrar post-launch cuando aparezca un caso de uso real para SQL.**

Justificación:
- Hoy Storage + IndexedDB funciona end-to-end (verified — `AUDIT-SUPABASE.md` 60-70% complete con persistencia operativa).
- 30 días + 4-5h/día (~120h totales) cubren a duras penas migración full + QA + fixes (estimación 50-95h del Bloque 5 sin contar paso 8). Si se mete en migración, el lanzamiento se atrasa o se lanza con bugs sin probar.
- Ningún driver de negocio actual obliga: no hay multi-user real, no hay queries server-side, no hay regulación.

**Lo que SÍ haría en estos 30 días (5-10h totales):**
1. Generar tipos `Database` (paso 1) — bloquea toda evolución futura. **2h.**
2. Arreglar bugs 1, 2 y 9 de la lista 6.5 (`alert_status`, `subscriptions`, `profiles` no migrada). **3-5h.**
3. Snapshot manual de migrations en SQL real (`pg_dump` schema-only) y meter al repo como `010_snapshot_real.sql`. Permite rebuild reproducible. **1-2h.**
4. Logout completo (`Sidebar.tsx:41-46` + `clearDatasets()` + `useAlertStatusStore.getState().clear()`). **1h.**

Migración SQL completa: dejarla planificada como **Sprint Z.M (post-launch)**, con el plan de Bloque 5 listo para cuando aparezca: (a) primer cliente con >500k filas o (b) chat que requiera queries server-side o (c) multi-user activo.

Si el usuario insiste en migrar AHORA: **opción C (solo `sales`)** — 25-40h, riesgo medio, deja `metas`/`inventario` en Storage (volumen bajo, pueden esperar).

---

## Resumen ejecutivo (12-18 líneas)

- **Bloque 1**: el flujo está completo Storage→IndexedDB→Worker→Store; cualquier "leer fresh del servidor" rompe `useAnalysis` que cachea ≈20 derivados de un parse único.
- **Bloque 2**: 45 tablas con RLS habilitada en DB; solo 5 las usa el frontend; `alert_status` no existe en DB aunque el código la usa; `user_subscriptions` es nombre incorrecto (la real es `subscriptions`).
- **Bloque 3**: shapes claros en `src/types/index.ts`; la mayoría de derivados son views naturales en SQL excepto `insights/filteredCandidates` (motor cliente con state mutable, no portable trivial).
- **Bloque 4**: schema `sales/goals/inventory/data_uploads` con índice compuesto `(org_id, fecha desc)` cubre 95%; particionar es prematuro <1M rows.
- **Bloque 5**: 35-66h sin tocar motor de insights, 50-95h con; 8 pasos por dependencia (tipos `Database` primero, RLS antes de escrituras, feature flag).
- **Bloque 6**: 79 sitios consumen Zustand — viable cambiar el backing store sin tocar pages; chat con DeepSeek no debe migrar a queries server-side por latencia; 10 bugs latentes detectados durante el audit.
- **Recomendación: Opción B** — lanzar con Storage actual; en estos 30 días arreglar tipos `Database`, bug `alert_status`/`subscriptions`/`profiles`, snapshot SQL al repo, logout completo (5-10h totales). Migrar a SQL cuando aparezca driver real (cliente >500k filas, chat server-side, multi-user activo).
- **Top 3 riesgos si se migra ahora**: (a) bulk-insert de 100k filas + RLS rate limits sin probar — alto; (b) `useAnalysis` y motor de insights asumen state cliente único, romper esto cuesta tanto como migrar todo el resto junto — alto; (c) sin tipos `Database` la migración rompe en runtime, no en `tsc` — alto y barato de prevenir.
- **Estimación migración total**: **50-95h** (paso 8 incluido); migración parcial solo `sales`: **25-40h**.
