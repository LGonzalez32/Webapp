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
