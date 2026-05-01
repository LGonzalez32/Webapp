# Sprint 2 — Cierre formal

**Inicio:** 2026-04-29 (commit `9eac9a16`)
**Cierre:** 2026-04-29 (Ticket 2.6)
**Estado:** Completo. Suite verde. Listo para Sprint 3.

## Objetivo del sprint

Migrar el modelo de período de la app de "mes único" (`selectedPeriod.month`) a "rango contiguo" (`{ year, monthStart, monthEnd }`), manteniendo coherencia con la regla CONTEXT.md "MTD vs MTD same-day, YTD vs YTD same-day". El cambio incluye refactor del store, selector global en TopBar, migración de consumers piloto (ClientePanel, VendedorPanel), remoción del chip multi-mes legacy, y E2E de integración.

## Commits del sprint (orden cronológico)

| # | Hash | Ticket | Resumen |
|---|------|--------|---------|
| 1 | `9eac9a16` | 2.0 | Hotfix PulsoPanel — MTD comparison usa fechaRef truncada al día |
| 2 | `a47668ae` | 2.0.1 | Hotfix PulsoPanel — quiebreDate y diasDesdeUltimaCompra anclados a fechaRef |
| 3 | `317d4faf` | 2.1.1 | `lib/periods.ts` — 5 primitivas centrales de fecha |
| 4 | `b2508a63` | 2.1.2 | 25 tests unit `lib/periods.ts` cubriendo MTD/YTD truncado |
| 5 | `e3fa6928` | 2.2 (pre) | docs(backlog): registrar bugfix `analyzeSupervisor` MTD YoY |
| 6 | `10f67300` | 2.2-B | fix `analyzeSupervisor` trunca período anterior al mismo día |
| 7 | `3509a2cd` | 2.2-A | fix eliminar fallback `new Date()` de funciones internas en `analysis.ts` |
| 8 | `e2540ca6` | 2.2-C | refactor `analysis.ts` consume `lib/periods.ts` en lugar de cálculos inline |
| 9 | `65bd41b5` | 2.3.1 | feat store: `selectedPeriod` shape pasa a `{ monthStart, monthEnd }` con compat |
| 10 | `d6cee115` | 2.3.2 | fix store: anclar default a fechaRef + alias `.month` → `monthEnd`; persist v11 |
| 11 | `a58e4b06` | 2.3.3 | fix RendimientoPage: sincronizar `selectedYear` local con store |
| 12 | `bff18bdf` | 2.3.4 | feat TopBar: selector global Desde/Hasta + 3 E2E tests |
| 13 | `147f91df` | 2.4.0 | feat `salesInRange` primitive en `lib/analysis.ts` + 6 tests unit |
| 14 | `f71d27cb` | 2.4.3 | docs PulsoPanel — period-agnostic deliberado |
| 15 | `bc5b1705` | 2.4.1a | refactor ClientePanel consume rango + helper `formatPeriodLabel` (6 tests) |
| 16 | `6cf50831` | 2.4.1b | fix ClientePanel `metrics.ventasPrev` YoY real (bug pre-existente) |
| 17 | `b2b7e62b` | 2.4.1c | docs(backlog): congelar spec Sprint 3 Rendimiento Anual |
| 18 | `70b17c20` | 2.4.2 | refactor VendedorPanel consume rango + helper `salesInRangeYoYSameDay` (5 tests) |
| 19 | `44637b46` | 2.4.4 | refactor: remover chip multi-mes EstadoComercial + cleanup `selectedMonths`; persist v12 |
| 20 | `8bd43858` | 2.4.5 | test(e2e): integración rango end-to-end + smoke + empty-data shape |
| 21 | `ffa48683` | 2.5 | docs(backlog): plan migración consumers no piloto + auditoría YTD-anchored |
| 22 | _(este commit)_ | 2.6 | Cierre formal Sprint 2 + handoff Sprint 3 |

**Nota cronológica**: el sprint completo se ejecutó el 2026-04-29 en una sesión intensiva — no representa elapsed time real de un sprint tradicional.

## Métricas finales

- **Suite**: typecheck 0 errores · 181 unit tests verde · 23 E2E tests verde · lint baseline 239 (sin cambio).
- **Diff total** (`9eac9a16^..HEAD`): 19 archivos · 1587 insertions / 421 deletions · neto +1166.
- **Archivos creados**:
  - `src/lib/periods.ts` (249 líneas)
  - `tests/unit/periods.test.ts` (308 líneas, 25 tests)
  - `tests/unit/analysis.salesInRange.test.ts` (118 líneas, 11 tests)
  - `tests/e2e/period-selector.spec.ts` (73 líneas, 3 tests)
  - `tests/e2e/period-range-integration.spec.ts` (130 líneas, 4 tests)
  - `SPRINT_2_CIERRE.md` (este documento)
- **Archivos eliminados**: ninguno — todo cleanup quirúrgico dentro de archivos existentes.
- **Tests netos agregados**: +43 unit (138 → 181), +7 E2E (16 → 23).

## Lo que se entregó

**Store de período** (Tickets 2.3, 2.3.1–2.3.4): el shape `selectedPeriod` migró de `{ year, month }` a `{ year, monthStart, monthEnd, month }` donde `.month` queda como alias compat sincronizado a `monthEnd`. Persist bumpeado v9→v12 con migrate idempotente. Setter `setSelectedPeriodRange(monthStart, monthEnd, lastChanged)` resuelve inversiones con regla "el lado que el usuario movió manda". Selector global Desde/Hasta visible en TopBar desde toda la app, con meses futuros disabled en el dropdown Hasta cuando el año seleccionado es el de fechaRef.

**Lib primitivas** (Tickets 2.1, 2.4.0): `lib/periods.ts` codifica 5 primitivas — `getFechaReferencia`, `buildDefaultYtdRange`, `buildMonthlyRange`, `buildComparisonRangeYoY`, `truncateRangeToData` — más el helper `formatPeriodLabel(year, monthStart, monthEnd)`. `lib/analysis.ts` agrega `salesInRange` (filtro por rango contiguo) y `salesInRangeYoYSameDay` (rango YoY con cutoff same-day en monthEnd, codificando la regla CONTEXT.md MTD/YTD). `salesInPeriod` legacy se mantiene como wrapper de `salesInRange(_, m, m)`.

**Refactor consumers piloto** (Tickets 2.4.1, 2.4.2): ClientePanel y VendedorPanel migrados a `[monthStart, monthEnd]` con decisiones B1 (anclar a `monthEnd` cuando el cálculo es single-month por contrato), B2 (acumular rango con `salesInRange`) y keep (sitios que solo leen `.year`) documentadas explícitamente por sitio.

**Bugfix latentes** (Tickets 2.0, 2.0.1, 2.4.1b): 3 bugs pre-existentes corregidos durante la migración. PulsoPanel L162/L505 (quiebreDate y diasDesdeUltimaCompra usaban `new Date()` browser en lugar de fechaRef) y L623 (MTD comparison sin truncamiento). ClientePanel `metrics.ventasPrev` usaba `prevPeriod` sequential pero el label decía "vs ${year-1}" (YoY) — split en commit dedicado 2.4.1b para preservar git-bisect.

**Cleanup** (Ticket 2.4.4): chip multi-mes EstadoComercialPage removido completamente (75+ líneas). Campo `selectedMonths` eliminado del store + firmas de `analysisWorker`, `runInsightEngine`, mocks de tests golden. Persist v11→v12. Imports huérfanos limpiados (`createPortal`, `ChevronDown`, `runInsightEngine`, `filtrarConEstandar`, `salesInPeriod` en EstadoComercialPage, `getAgregadosParaFiltro`).

**E2E integración** (Ticket 2.4.5): 4 tests nuevos cubriendo cambio de rango → badge calendario, header ClientePanel single-month vs range, smoke VendedoresPage post-cambio, empty-data shape `year=0` sin crash.

**Plan migración** (Ticket 2.5): auditoría doc-only de 11 consumers no piloto + 6 grupos de campos YTD-anchored en `analysis.ts`. Categorización P0 (5 sitios bloqueantes), P1 (7 sitios alta deuda), P2 (2 sitios menor), P3 (2 excepciones documentadas). Plan de 4 sub-tickets para Sprint 3 + 6 sub-tickets para Sprint 4.

## Decisiones de producto congeladas

- **Rango contiguo (Desde/Hasta)** en lugar de selección múltiple no contigua. Razón: la regla CONTEXT.md "MTD vs MTD same-day, YTD vs YTD same-day" no tiene análogo limpio sobre meses no contiguos.
- **Selector global en TopBar** visible desde toda la app excepto Rendimiento Anual (que tendrá su propio control en Sprint 3.E).
- **Default al abrir la app**: YTD (`monthStart=0`, `monthEnd=mesDeFechaRef`), anclado a fechaRef NO a `new Date()`.
- **Año cerrado completo** (suma sin truncamiento) exclusivo de Rendimiento Anual; el resto de páginas mantienen YTD-same-day como semántica primaria.
- **Alias `.month` mapea a `monthEnd`** (semántica "mes activo = último del rango"). Mantener hasta que todos los consumers migren.
- **PulsoPanel period-agnostic deliberado**: documentado por contrato; cambiar requiere ticket de redefinición de producto.

## Deudas técnicas registradas en BACKLOG

**Bugs latentes confirmados (P0)** — agregadas en Ticket 2.5 (`ffa48683`):

- `VendedoresPage` tabla EQUIPO TOTAL muestra `ytd_actual_uds` YTD-año-completo pese a rango activo (Test 3 de 2.4.5 lo confirma).
- `EstadoComercialPage` card VENTA ACUMULADA con `ytd_actual_equipo_uds` YTD-año-completo.
- `EstadoComercialPage` sub-label "Acumulado Ene–{mes}" L1849 con "Ene–" hardcoded — registrada también en BACKLOG `## Deuda técnica` por Ticket 2.4.5 (`8bd43858`).
- `EstadoComercialPage` label `MESES_LARGO[selectedPeriod.month]` L1405 sin `formatPeriodLabel`.
- `ClientesPage` labels "Valor {MES} {year-1}" en L265, 639, 663, 851 usan `selectedPeriod.month` único.

**Refactors pendientes (P1/P2)** — Ticket 2.5: ProductoPanel, MetasPivotPanel, EstadoGeneralEmpresa, ComparisonSummary (con name shadowing peligroso de `salesInRange` local), MetasPage, RotacionPage, ChatPage, DepartamentosPage, EstadoComercialPage barrido `.month` (~20 sitios coherentes accidentalmente).

**Mejoras UX** — Ticket 2.4.5 (`8bd43858`): badge calendario explicita cutoff same-day (copy "Ene 1 — Feb 6, 2026" en una línea). Decisión congelada: año cerrado completo vive solo en Rendimiento Anual.

**Tests pendientes** — Ticket 2.4.5: E2E 4.2 (fechaRef año pasado) y 4.3 (same-day cutoff con día específico) diferidos por falta de fixtures empty-data. Plan: agregar `tests/fixtures/demo-empty-data-*.json` en Sprint 4.

**Refactor menor** — Tickets 2.4.2 / 2.4.4 / pre-2.5:
- `useRecomendaciones` B1 estricto en rango multi-mes (Ticket 2.4.2): copy "el mes pasado" cae dentro del rango activo. Escalar si visualmente molesta.
- `salesInPeriod` deprecable cuando todos los consumers migren a `salesInRange` (Ticket 4 de Sprint 4).
- migrate `(state, version)` signature en lugar de discriminar por shape (registrada en BACKLOG previo a Sprint 2).
- Verificación visual flicker primer render (BACKLOG, Ticket 2.3.2).

## Riesgos conocidos al cierre

- **Inconsistencia visible**: VendedoresPage tabla EQUIPO TOTAL y EstadoComercial card VENTA ACUMULADA + sub-label muestran YTD-año-completo pese a que TopBar permite cambiar el rango. P0, prioridad de Sprint 3 (Tickets 3.A → 3.B/3.C).
- **Comportamiento sutil B1 en `useRecomendaciones`** con rango multi-mes: el copy "el mes pasado" puede caer dentro del rango activo del usuario. Aceptado como deuda; escalar si visualmente molesta con clientes reales.
- **Sin smoke con datos reales**: toda la validación visual del sprint se hizo con datos demo (Los Pinos S.A., fechaRef abr-2026). Antes de clientes reales, smoke obligatorio incluyendo: dataset con fechaRef en año pasado, datasets con métricas USD vs UDS, datasets con metas ambiguas.
- **`selectedMonths` removido sin migración real de datos persistidos**: el campo nunca estuvo en `partialize`, así que ninguna sesión lo persistió. Si alguna instancia lo tuviera vía mecanismo no estándar, el migrate v11→v12 limpia. Riesgo cero para clientes nuevos; teórico para sesiones legacy.

## Handoff a Sprint 3

Sprint 3 arranca con 5 frentes (orden recomendado, no estricto):

1. **Ticket 3.A — `computeYTD` rango-aware con default=año-completo** (1–2 commits). Prerequisito de 3.B y 3.C. Refactor de `analysis.ts:computeYTD` para aceptar `monthStart, monthEnd` opcionales, default = comportamiento legacy. Tests unit nuevos.
2. **Ticket 3.B — Migrar consumers P0 downstream** (1 commit, depende de 3.A): VendedoresPage tabla EQUIPO TOTAL + EstadoComercial card VENTA ACUMULADA consumen los nuevos campos rango-aware. Test 3 de 2.4.5 sube de smoke a assertion estricta.
3. **Ticket 3.C — Sub-label "Ene–" hardcoded en EstadoComercial** (1 commit, independiente). Reemplazar L1849 + L1405 por `formatPeriodLabel`. Puede ir en paralelo con 3.A/3.B.
4. **Ticket 3.D — Resolver name shadowing `salesInRange`** en ComparisonSummary antes de migrar el componente. Independiente, commit chico.
5. **Ticket 3.E — Rendimiento Anual**: dropdowns mes inicio/fin propios + toggle YTD/Mensual + chart con 1 vs 2 líneas + columnas con vs sin YoY. Spec congelado en commit `b2b7e62b` (Ticket 2.4.1c). 3-4 commits estimados.

Ver Ticket 2.5 (`ffa48683`) en BACKLOG para inventario completo de los 11 consumers no piloto + 6 grupos YTD-anchored, con plan detallado de 4 tickets Sprint 3 + 6 tickets Sprint 4.

## Métricas de proceso

- **Tiempo total**: 1 día (sesión intensiva, no representa elapsed time tradicional de sprint).
- **Commits totales**: 22.
- **Commits doc-only**: 5 (`e3fa6928` 2.2, `f71d27cb` 2.4.3, `b2b7e62b` 2.4.1c, `ffa48683` 2.5, `8c…` 2.6).
- **Bugs latentes detectados durante el sprint que no estaban en plan inicial**: 3 — PulsoPanel L162+L505 (Ticket 2.0.1), PulsoPanel L623 (Ticket 2.0), ClientePanel `metrics.ventasPrev` YoY-vs-sequential (Ticket 2.4.1b).
- **Splits retroactivos forzados**: 1 — commit `384179a6` partido en 3 commits limpios (`bc5b1705` 2.4.1a + `6cf50831` 2.4.1b + `b2b7e62b` 2.4.1c) para preservar git-bisect.
- **Pausas explícitas del flujo por descubrimiento**: 4 — pre-investigación VendedorPanel pre-2.4.2, propuesta de helper `salesInRangeYoYSameDay` antes de 2.4.2, scope realista de E2E pre-2.4.5, investigación RotacionPage hook-order (resultó ser stale source map).
