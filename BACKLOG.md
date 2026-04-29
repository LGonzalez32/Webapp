# BACKLOG — SalesFlow

Items pendientes que **no se arreglan en el ticket que los descubre**.
Se atacan en sprints futuros con tickets propios.

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

## Sprint 0.5 — diagnóstico (sin fix)

### ~~A. Bug de hooks en /rotacion (Sprint 1.1)~~ ✓ RESUELTO en sprint-1.1
- **Archivo:** `src/pages/RotacionPage.tsx:462`
- **Regla:** `react-hooks/rules-of-hooks` (error)
- **Diagnóstico:** `useMemo(buildEstadoTooltips, [...])` en L462 se llama
  después de un early-return (`if (!hasInventario) return <EmptyState/>`)
  dentro del componente, violando el orden estable de hooks. Cualquier
  render donde la rama temprana se tome rompe React. Fix: mover el
  `useMemo` arriba del early-return.

### B. Snapshots de insight-engine.golden.test.ts (Sprint 1.3)
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
