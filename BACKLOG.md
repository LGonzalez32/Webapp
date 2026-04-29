# BACKLOG — SalesFlow

Items pendientes que **no se arreglan en el ticket que los descubre**.
Se atacan en sprints futuros con tickets propios.

## 🔒 Seguridad — Bloqueantes con fecha de vencimiento

Ítems vivos detectados al cerrar bucket G del triage 1.4.5. NO son
emergencia hoy (repo privado en GitHub, sin despliegue en Render),
pero cada uno tiene un evento que los vuelve críticos.

### S1 — Rotar DeepSeek API key (vence: cuando se invite a colaboradores o antes del primer push a Render)
- Key sk-be7fa627... commiteada en initial commit `01fc8fd6` (14-mar-2026).
- Backend lee correctamente de `os.getenv("DEEPSEEK_API_KEY")`; `.env` ya
  está en `.gitignore`.
- Acción: rotar en DeepSeek dashboard, actualizar `backend/.env` local.
- NO requiere `git filter-repo` mientras el repo siga privado y solo.

### S2 — Rate limiting en POST /chat (vence: antes del primer despliegue a Render)
- `backend/app/api/routes/chat.py` expone `/chat` sin slowapi/rate-limit.
- Riesgo: billing abuse contra DeepSeek vía proxy.
- Acción: agregar slowapi (o equivalente) con límite por IP + por
  usuario autenticado. Confirmar también que `/chat` exige JWT de Supabase.

### S3 — RLS en sales_forecasts / sales_forecast_results / sales_aggregated (vence: antes de cablear feature de forecasts al frontend)
- `supabase/migrations/002_sales_forecast_schema.sql:107-109` tiene
  `DISABLE ROW LEVEL SECURITY` explícito.
- Acción: nueva migration con `ENABLE ROW LEVEL SECURITY` + política
  `members_select_own_org` (mismo patrón que `alert_status`).

### S4 — Auditar resto de tablas Supabase (recomendado, no bloqueante)
- Verificar que no haya otras tablas con RLS off "por descuido".
- Media hora de trabajo, mejor antes que después.

## Sprint 0.3 — sprint-check pipeline (descubierto)

### Lint (eslint . --max-warnings=0) — 238 errors, 28 warnings
- **Razón:** primera corrida de ESLint sobre código preexistente.
- **Acción:** se dejó `sprint-check` con `;` en vez de `&&` temporalmente.
  Cuando el lint quede en 0/0, volver a `&&`.
- **Patrones dominantes:**
  - `@typescript-eslint/no-explicit-any` (mayoría) — tipar `any` en
    `src/lib/insight-engine.ts`, `src/lib/insightEngine.ts`,
    `src/store/appStore.ts`, `src/types/index.ts`, builders, narrativa.
  - `@typescript-eslint/no-unused-vars` — variables/imports muertos.
  - `react-hooks/exhaustive-deps` (warnings) — deps faltantes en hooks.
  - `react-refresh/only-export-components` — archivos que mezclan
    componentes y exports no-componente.
- **Tickets sugeridos** (Sprint 1+):
  - sprint-1.x: limpiar `no-unused-vars` en todo `src/`.
  - sprint-1.x: tipar `any` en motor de insights (archivo por archivo).
  - sprint-1.x: revisar deps de hooks en páginas y componentes.

### Tests unitarios (vitest run) — 5 failed / 116 passed
- **Razón:** snapshots desactualizados en motor de insights.
- **Archivos afectados:**
  - `src/lib/__tests__/insight-engine.golden.test.ts` (5 snapshots).
- **Acción:** regenerar snapshots cuando se haga cambio funcional auditado
  o cuando se cierre la fase Z.11.0 del baseline. NO regenerar a ciegas.

### Typecheck (tsc --noEmit) — 0 errores ✓
Sin deuda.

## Sprint 0.4 — smoke E2E (descubierto)

### tests/e2e/smoke.spec.ts — 2 tests en `fixme`
- **`demo rotacion loads`** (Sprint 1.1): RotacionPage crashea por hooks
  llamados condicionalmente. Reactivar tras fix.
- ~~**`demo clientes has at least 3 tabs`** (Sprint 1.2)~~ ✓ RESUELTO
  en sprint-1.2: `src/pages/ClientesPage.tsx` ahora usa `role="tablist"`,
  `role="tab"` con `aria-selected`/`aria-controls`, panel con
  `role="tabpanel"`/`aria-labelledby` y navegación por teclado
  ArrowLeft/Right/Home/End. El mismo componente sirve `/demo/clientes`
  y `/clientes` (no se necesitó ticket 1.2.b).

## Follow-ups del refactor metas-pivot

Commiteado en `3c9c93b5` + `9d416117`. Lo que queda:

- **Tests dedicados de `MetasPivotPanel`**: cubrir agregaciones por combo
  (vendedor×cliente×producto), drag-drop reorder via `@dnd-kit`,
  persistencia `localStorage` (`sf_metas_pivot_dims`), gating de
  `availableDims` (no mostrar pills para dims sin data en metas YTD).
  Hoy 0 tests específicos — la cobertura actual es vía golden tests del
  motor, no del componente UI.
- **Extraer hook reutilizable**: si `RendimientoPage` necesita el mismo
  pattern de árbol/agregación multi-dim contra meta YTD, considerar
  extraer `buildMetaTree`/`flattenTree` (en `MetasPivotPanel.tsx`) a un
  hook `usePivotTree(metas, sales, dims, scope)` reutilizable.

## Follow-ups del refactor motor-visibility (post-Sprint H')

Roadmap principal cerrado en commits `b5b0af97` + `18017494`. El roadmap
está marcado `SUPERSEDIDO PARA TRABAJO NUEVO` — no ejecutar más cambios
de gate/ranker/caps desde ese documento. Lo que queda como follow-up
opcional:

- **Sub-sprint registry-driven**: migrar `Z12_ROOT_STRONG_TYPES`,
  `Z12_VALID_USD_SOURCES`, `Z11_ROOT_STRONG_TYPES`, `ALWAYS_PROTECTED_CAPS`
  y `NON_MONETARY_METRIC_IDS` a un `INSIGHT_TYPE_REGISTRY` centralizado
  (mismo patrón declarativo que `TABLE_REGISTRY` del bucket C). Hoy son
  4 arrays hardcoded en `src/lib/insightStandard.ts` y
  `src/lib/insight-engine.ts:6607`. Cada tipo nuevo requiere editar 4
  lugares. Decisión D3.c del roadmap explícitamente lo difirió.
- **Tests con metas multi-dim**: el demo dataset tiene metas mayoritariamente
  single-dim (solo vendedor) → `meta_gap_combo` falla regla B de Z.11 en
  ~todos los casos. Agregar baseline test con metas multi-dim
  (vendedor+cliente+producto) para validar el path completo.

## Follow-ups del refactor ingesta-registry (post-Sprint F.2)

Roadmap principal cerrado en commits `bcf2b832` → `42ed86ed`. Lo que
queda como follow-up opcional (no bloquea agregar tablas nuevas):

- **Sprint G**: consumir `InferRecord<T>` en `src/types/index.ts` para
  derivar `SaleRecord` / `MetaRecord` / `InventoryItem` desde el registry.
  El helper ya existe en `src/lib/registry-types.ts:113`; falta convertir
  los interfaces estáticas en re-exports + test de divergencia.
- **Worker dispatch genérico**: `src/lib/fileParseWorker.ts` y
  `src/workers/parseWorker.ts` aún tienen branches `type === 'sales' | 'metas'
  | 'inventory'`. Refactor: usar lookup desde registry como hace
  `parseFileForTable<T>`.
- **`UploadPage::handleFileSelect` per-step**: branches per-tabla en el
  handler. Refactor a un dispatcher genérico que use `TableId` del registry.
- **`orgService` storage iteration**: hardcoded a 3 tablas. Iterar el
  registry para storage keys.

## Deuda técnica

### `wizardCache` usa module-level state para debounce
- `pendingDraft`/`pendingTimer`/`pendingPromise`/`pendingResolve` viven a
  nivel de módulo, lo que requirió exponer `_resetForTests()` para que
  los casos no se contaminen entre sí.
- Si en el futuro el módulo crece a manejar múltiples drafts en paralelo
  (ej. uno por organización), refactorizar a clase `WizardCache` con
  instance state.

### ~~E2E de hidratación wizardCache requiere auth mock~~ ✓ RESUELTO
- Bypass DEV-only via URL `?e2e_bypass=1` agregado a `RequireAuth`.
- 3 tests E2E nuevos en `tests/e2e/wizard-cache.spec.ts` validan
  hydrate (v1 persists, v999 cleared, TTL>7d cleared).

### `npx vitest run` vs `npm run test:unit` — diferencia de cwd
- `npx vitest run <files>` falla con `TypeError: Cannot read properties of
  undefined (reading 'config')` al evaluar `describe(...)`.
- `npm run test:unit -- <files>` (mismo binario, mismo target) corre limpio.
- Hipótesis: `npx` resuelve cwd o config root distinto cuando se invoca con
  paths absolutos en Windows. Investigar y unificar invocación.

## Sprint 1.4 — fuera de scope, anotado

### Centralizar entrada/salida de modo demo
- 6 puntos del código escriben `DEMO_EMPRESA` a `appStore.configuracion.empresa`:
  `WelcomeModal.tsx`, `DemoPage.tsx`, `UploadPage.tsx`, `EmptyState.tsx`,
  `useAutoLoad.ts` (rama demo). Sugiere falta una helper `enterDemoMode()` /
  `exitDemoMode()` que centralice el seteo del bundle demo (empresa, sales,
  metas, inventory, dataSource).
- Próximo ticket de refactor (no urgente): consolidar y dejar 1 sola entrada.
- Riesgo si no se hace: cualquier campo nuevo de org (NIT, dirección, logo)
  hereda el mismo bug de doble fuente que arreglamos en sprint-1.4.

### sprint-check separator (Windows cmd)
- Cambiado `;` → `&` en `package.json:scripts.sprint-check` porque cmd.exe
  pasa `;` como argumento literal a `tsc`. `&` es el sequencer de cmd
  (always-run-next) y mantiene la semántica relajada hasta que lint quede
  en 0/0. En posix bash `&` backgroundea — si el equipo migra a Mac/Linux,
  cambiar a `npm-run-all2 --continue-on-error`.

## Sprint 0.5 — diagnóstico (sin fix)

### ~~A. Bug de hooks en /rotacion (Sprint 1.1)~~ ✓ RESUELTO en sprint-1.1
- **Archivo:** `src/pages/RotacionPage.tsx:462`
- **Regla:** `react-hooks/rules-of-hooks` (error)
- **Diagnóstico:** `useMemo(buildEstadoTooltips, [...])` en L462 se llama
  después de un early-return (`if (!hasInventario) return <EmptyState/>`)
  dentro del componente, violando el orden estable de hooks. Cualquier
  render donde la rama temprana se tome rompe React. Fix: mover el
  `useMemo` arriba del early-return.

### ~~B. Snapshots de insight-engine.golden.test.ts (Sprint 1.3)~~ ✓ RESUELTO en sprint-1.3
- **Archivos involucrados:**
  - Test: `src/lib/__tests__/insight-engine.golden.test.ts` (3 snapshots fallan)
  - Snapshots: `src/lib/__tests__/__snapshots__/insight-engine.golden.test.ts.snap`
  - Implementación tocada: `src/lib/insight-engine.ts`, `src/lib/insightStandard.ts`,
    `src/lib/cross-context.ts`, `src/lib/decision-engine.ts` (todos modificados,
    sin commitear).
- **Veredicto: snapshot stale.**
- **Evidencia:**
  1. Los commits recientes `Z.13.V-1..V-4` y `Z.12.M-2.1` (dedup cross-tipo,
     severity degraded, narrative direction-aware) cambiaron intencionalmente
     ranking/severidad/composición del pool — los goldens no se regeneraron.
  2. El diff del snapshot muestra reordenamiento de ranks (un meta_gap de
     Patricia Ruiz desaparece y ranks cercanos se desplazan), no un crash
     ni nulls inesperados — patrón típico de output funcional reorganizado,
     no de regresión rota.
- **Acción Sprint 1.3:** auditar el diff completo, validar que cada cambio
  estructural corresponde a un commit Z.12.M/Z.13.V documentado, y
  regenerar con `vitest -u`.
