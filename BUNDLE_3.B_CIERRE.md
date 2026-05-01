# Bundle 3.B — Cierre formal

**Fecha de cierre:** 2026-04-29
**Commit ancla:** `d5e463be` (3.B.6 cleanup)
**Branch:** motorinsights
**Próximo:** Ticket 3.E — Rendimiento Anual rediseño

## Objetivo del bundle

Migrar la cadena completa "TopBar selector → store → worker → motor → superficies UI P0" para que respete el rango activo elegido por el usuario, en lugar de estar anclado a YTD-año-completo.

Producto eligió **Opción Z**: el campo `ytd_actual_uds` (y pares) siempre significa "ventas del rango activo". Si el usuario no toca el TopBar, el rango activo es YTD canónico (Ene–fechaRef.month) y los campos son bit-exact con la semántica legacy.

## Commits del bundle

| # | Ticket | Hash | Descripción |
|---|---|---|---|
| 1 | 3.B.0 | (sin commit) | Investigación de superficies P0 |
| 2 | 3.B.1 | `ed0ce72c` | TopBar simetría dropdown "Desde" |
| 3 | 3.B.½ | `7a3b9e80` | Entry points del motor rango-aware |
| 4 | 3.B.2 | `8109d002` | EstadoComercial card consume rango |
| 5 | 3.B.2.1 | `d54e18c7` | formatPeriodLabel admite includeYear |
| 6 | 3.B.8 | `d29eb68c` | Fix rebote dropdown post-worker |
| 7 | 3.B.3 | `e0a7d389` | VendedoresPage labels dinámicos |
| 8 | 3.B.4 | `5a4c2cb7` | ClientesPage + valor_yoy_usd rango-aware (absorbe 3.C) |
| 9 | 3.B.3.5 | (doc-only) | Investigación stats top + PULSO |
| 10 | 3.B.6 | `d5e463be` | Cleanup computeYTD + tooltips + BACKLOG |

**Total: 9 commits funcionales + 2 investigaciones doc-only.**

## Suite final

- tsc: 0 errores
- unit: 202/202 verde (vs 181 al inicio del sprint, +21 tests netos)
- E2E: 22/22 verde (vs 23 al inicio; 1 test E2E migrado a 2 unit tests del store en 3.B.1)
- Goldens: bit-exact en todos los commits, salvo ajuste intencional documentado en 3.B.4 (`valor_yoy_usd` cambió semántica de single-month a rango — los snapshots golden no capturan el campo directamente, así que no se movieron físicamente)

## Logros principales

1. Primitiva `computeRangeYoY` consolidada como única fuente de YTD/rango YoY en el motor. Wrapper legacy `computeYTD` removido en 3.B.6.
2. Cadena completa rango-aware: TopBar → store → worker → motor → 3 superficies UI P0.
3. Bug crítico del rebote del dropdown "Desde" identificado durante validación visual y fixeado en 3.B.8 — era pre-existente, expuesto por la migración de `ytdChart` en 3.B.2.
4. 2 bugs latentes detectados durante investigaciones:
   - G7 `valor_yoy_usd` (single-month → rango): fixeado en 3.B.4.
   - Default `'ok'` para vendedores sin baseline: documentado en BACKLOG (Sprint 4).
5. Helper `formatPeriodLabel` extendido con flag `includeYear` para reuso en distintos contextos UX.

## Decisiones de producto registradas

- **Variante 1** (TopBar acotado a fechaRef como tope superior, simetría Desde+Hasta).
- **Opción Z** (campos `ytd_*` siempre reflejan rango activo, no se renombran).
- **Sub-label EstadoComercial Opción B** (compacto, sin año intermedio: "Acumulado Ene–Feb día 6 vs mismo período 2025").
- **VendedoresPage P1=β / P2=a** (headers dinámicos con año explícito; cards con "en {período}" en vez de "año a la fecha").
- **ClientesPage Opción Z aplicada también a `valor_yoy_usd`** (semántica intencionalmente cambiada de single-month a rango con same-day cutoff en monthEnd).

## Deudas conscientes (documentadas en `BACKLOG.md` § Sprint 4 candidates)

1. **`cumplimiento_pct` rango-aware** (Sprint 4) — decisión de producto pendiente: ¿anclado a `monthEnd` o agregado del rango?
2. **Default `'ok'` para vendedores sin baseline** (Sprint 4) — decisión de producto pendiente: ¿clasificar como `'sin_baseline'` / `'nuevo'`?
3. **UX labels "YTD" en drawer ClientesPage** (3.B.9) — copy-only, scope reducido.

## Cleanup adicional pendiente (3.B.7, opcional)

- `MESES_CORTOS` posible huérfano en [src/pages/ClientesPage.tsx:29](src/pages/ClientesPage.tsx#L29) tras la migración de los 4 labels en 3.B.4.
- `MESES_CORTO` posible huérfano en EstadoComercialPage.tsx (~L40) post-3.B.2.
- Comentario obsoleto referenciando el wrapper `computeYTD` removido (verificar si quedó algún rastro tras 3.B.6).
- `buildDefaultYtdRange` en `src/lib/periods.ts` sin consumers en `analysis.ts` post-3.A.1; verificar si algún test lo sigue usando antes de deprecar.

## Próximo ticket

**3.E — Rendimiento Anual rediseño:** último ticket de Sprint 3. Spec congelado en commit `b2b7e62b` (Ticket 2.4.1c, Sprint 2). Scope: revisar/rediseñar `/rendimiento` para alinear con el modelo de rango — esta página es el único candidato a mantener el modo "año completo cerrado" (per decisión de producto Sprint 2: el resto mantiene YTD-same-day como semántica primaria).

Estimación: 3-4 commits según el spec original (lógica del toggle, UI dropdowns, chart con 1 vs 2 líneas, E2E).
