# BACKLOG — SalesFlow

> **Sprint 2 cerrado:** 2026-04-29. Ver `SPRINT_2_CIERRE.md` para auditoría retrospectiva. Las entradas siguientes están organizadas por sprint de destino. Sprint 3 arranca con Ticket 3.A (`computeYTD` rango-aware) como prerequisito de 3.B y 3.C.

Items pendientes que **no se arreglan en el ticket que los descubre**.
Se atacan en sprints futuros con tickets propios.

## Sprint 2 / Cierre — Plan migración consumers no piloto (Ticket 2.5)

Auditoría doc-only de los consumers de `selectedPeriod` que NO migraron en Tickets 2.4.1/2.4.2 + campos YTD-anchored upstream en `analysis.ts` que ignoran el rango activo. Producto: plan de tickets para Sprint 3 / Sprint 4.

### Inventario de consumers no migrados

| Archivo | Líneas | Campo leído | Uso | Propuesta semántica |
|---------|--------|-------------|-----|---------------------|
| `components/producto/ProductoPanel.tsx` | 22, 38, 60, 75 | `.year`, `.month` | trendData (6 meses ancla), topVendedores/topClientes (filtro período) | Firma → `{year, monthStart, monthEnd}`. `month` ancla → `monthEnd` (B1). topVendedores/topClientes → `salesInRange` (B2). |
| `components/MetasPivotPanel.tsx` | 226–229 | `currentYear`, `currentMonth` (props derivados de selectedPeriod) | render columnas pivot por mes | B1: `currentMonth = monthEnd`. Tabla pivot ya muestra columna por mes; la "celda activa" es monthEnd. |
| `components/estado-general/EstadoGeneralEmpresa.tsx` | 14, 19–20, 25 | `.year`, `.month` | computeEstadoGeneralEmpresa(year, month, ...) | Firma del helper a evaluar — probablemente B1 (`monthEnd` como mes activo). Single-source con dashboard. |
| `components/ui/ComparisonSummary.tsx` | 19, 23, 64 | `.year`, `.month` | currentSales = salesInRange-local-shadow(year, month), currentLabel = `${MESES_CORTO[month]} ${year}` | B1 (`monthEnd` como mes activo) **+ rename** del helper local `salesInRange` para no colisionar con el de `lib/analysis.ts` (`salesInMonth` o similar). |
| `pages/MetasPage.tsx` | 40, 46–47 | `.year`, `.month` (alias `currentYear` / `currentMonth`) | Filtros sobre tabla de metas por mes | B1 (mes activo = `monthEnd`). Si MetasPage muestra "metas del rango", evaluar B2 — decisión de producto. |
| `pages/RotacionPage.tsx` | 272, 295, 372, 623 | `.year`, `.month` | handleAnalyzeProducto: filter ventas del producto en `(year, month)` para vendedores/clientes; ProductoPanel prop | B1 (`monthEnd`). RotacionPage es período-agnóstico en su core (categoriasInventario es un snapshot global), solo el "análisis" usa el período. |
| `pages/DepartamentosPage.tsx` | 112 | `.year`, `.month` (destructurados) | ver uso completo en página | Pendiente lectura completa — probablemente B1. |
| `pages/ChatPage.tsx` | 766, 795, 804, 916 | `.year`, `.month` (en context object al backend) | Contexto que se envía a DeepSeek con metadata del período activo | **P2 trivial**: pasar el objeto completo `{year, monthStart, monthEnd}` y dejar que el prompt lo formatee. |
| `pages/VendedoresPage.tsx` | 64, 457–458, 769 | `.year` (header buttons YTD/YTD_ANT), prop a VendedorPanel | KPIs de tabla principal NO leen selectedPeriod directamente: leen `vendorAnalysis.ytd_actual_*` que es **YTD-año-completo** upstream. **P0**: incoherencia visible — el TopBar puede decir Mar–Abr y los totales muestran Ene–Abr (ver auditoría YTD-anchored abajo). |
| `pages/ClientesPage.tsx` | 61, 141, 217, 265, 639, 663, 851, 1330 | `.year`, `.month` | Cross-table local (analyze pareto), labels "Valor {MES} {year-1}" | B1 (`monthEnd`) en labels y filtros. Múltiples sitios, similar a VendedoresPage tabla. |
| `pages/EstadoComercialPage.tsx` | 256, 335, 356–357, 408, 413, 467, 472, 556, 1009, 1172, 1339, 1365, 1392–1395, 1405, 1412, 1455, 1517, 1553, 1577, 1717, 1829 | `.year`, `.month` (alias = monthEnd) | KPIs del mes, comparaciones YoY mes-a-mes, label `MESES_LARGO[month]`, sub-label "Acumulado Ene–{mes}" L1849 (hardcoded "Ene–"), `now = new Date(year, month, dia)` | Mayoría coherente accidentalmente (B1 = `monthEnd`). **P0 crítico**: sub-label hardcoded "Ene–" L1849. **P1**: label `MESES_LARGO[selectedPeriod.month]` (L1405) usa solo monthEnd, debería ser `formatPeriodLabel(year, monthStart, monthEnd)`. |

### Auditoría campos YTD-anchored en `analysis.ts`

Todos los `ytd_*` se calculan con `buildDefaultYtdRange(fechaReferencia)` = **[1-ene, fechaRef]**, NO con monthStart/monthEnd del usuario.

| Campo | Línea | Consumers principales | Recomendación |
|-------|-------|-----------------------|---------------|
| `ytd_actual_uds` / `ytd_anterior_uds` (VendorAnalysis) | analysis.ts:341–358 (computeYTD), 1036, 1270 | VendedoresPage tabla EQUIPO TOTAL + columnas YTD; EstadoComercialPage MaterialityContext L1494, 1503; chatService L310 | **P0**: rango-aware. Recomputar con `salesInRange(sales, year, monthStart, monthEnd)` cuando el usuario elige rango; mantener YTD-completo cuando rango = año entero. Requiere agregar variants `ytd_range_actual_uds` o re-anchor del cálculo. |
| `ytd_actual_usd` / `ytd_anterior_usd` (VendorAnalysis) | analysis.ts:344–366 | Mismos consumers que uds + EstadoComercialPage MaterialityContext L1493 | Mismo tratamiento que uds. |
| `variacion_ytd_uds_pct` / `variacion_ytd_usd_pct` | analysis.ts:343, 360, 367–370 | Tabla VAR % en VendedoresPage L719 | Consecuencia de los anteriores. Migrar junto. |
| `variacion_vs_anio` (categoria) | analysis.ts:485–486 | EstadoComercialPage card categorías | Idem — rango-aware. |
| `ytd_actual_equipo_uds` / `ytd_anterior_equipo_uds` (TeamStats) | analysis.ts:1038–1040 | EstadoComercialPage card "VENTA ACUMULADA" L1814+ | **P0**: el card de venta acumulada es la primera vista del founder. Si el TopBar dice "Mar–Abr" y el card sigue mostrando Ene–Abr, es la incoherencia más visible. |
| `ytd_actual_uds` (supervisorAnalysis) | analysis.ts:1270–1306 | EstadoComercialPage tabla supervisores | P1: superficie menor que vendedores. |
| `ventas_periodo`, `ventas_mes_anterior` (VendorAnalysis) | analysis.ts:422–428 | VendorPanel KPI principal, useRecomendaciones | **Coherente accidentalmente con B1** (anchor = `month` = `monthEnd`). El cálculo es single-month. Si Sprint 3 cambia a "venta acumulada del rango", requiere `ventas_rango`. |

### Categorización de prioridad

**P0 — Bloquea Sprint 3 / clientes reales** (incoherencia visible TopBar vs dato):

1. **VendedoresPage tabla EQUIPO TOTAL** (`ytd_actual_uds` upstream YTD-anchored). Probado en Test 3 de 2.4.5: el valor no cambia con rango.
2. **EstadoComercialPage card VENTA ACUMULADA** (`ytd_actual_equipo_uds` upstream YTD-anchored).
3. **EstadoComercialPage sub-label "Acumulado Ene–{mes}"** L1849 hardcoded.
4. **EstadoComercialPage label `MESES_LARGO[selectedPeriod.month]`** L1405 (período sin formatPeriodLabel).
5. **ClientesPage labels "Valor {MES} {year-1}"** múltiples sitios (L265, 639, 663, 851) — usan `selectedPeriod.month` único, no rango. Confunde si el TopBar muestra rango.

**P1 — Alta deuda técnica** (coherente accidentalmente, no robusto):

6. **ProductoPanel.tsx** completo — usa `.month` (= monthEnd). Funcional pero firma legacy.
7. **MetasPivotPanel.tsx** prop `currentMonth` — alias legacy, migrar firma.
8. **EstadoGeneralEmpresa.tsx** + helper `computeEstadoGeneralEmpresa(year, month, ...)` — firma legacy.
9. **ComparisonSummary.tsx** — helper local `salesInRange` colisiona en nombre con `lib/analysis.ts`. Renombrar.
10. **MetasPage.tsx** alias `currentYear/currentMonth` — firma legacy.
11. **RotacionPage.tsx** handleAnalyzeProducto + ProductoPanel prop.
12. **EstadoComercialPage** otros sitios `.month` (~20 líneas) — coherente con B1, candidato a barrido único.

**P2 — Deuda menor** (no afecta nada visible):

13. **ChatPage.tsx** context al backend — el LLM ignora la diferencia, pero el contexto debería ser correcto.
14. **DepartamentosPage.tsx** L112 — pendiente lectura completa.

**P3 — Excepciones documentadas** (no migrar):

15. **PulsoPanel.tsx** — period-agnostic deliberado (Ticket 2.4.3).
16. **`ventas_periodo` / `ventas_mes_anterior` upstream** — semántica single-month deliberada para VendorPanel KPI principal y `useRecomendaciones`. Si Sprint 3 lo demanda, se agrega variant `ventas_rango` sin tocar el original.

### Plan de tickets sugerido

**Sprint 3 (post-Rendimiento Anual) — P0 bloqueantes**:

- **Ticket 3.A — `ytd_*` rango-aware en analysis.ts** (1–2 commits):
  - Refactor de `computeYTD`: aceptar `monthStart, monthEnd` opcionales; default = año completo (preserva comportamiento legacy).
  - Re-correr worker cuando cambia el rango (verificar que `setSelectedPeriodRange` invalida `isProcessed` y dispara re-análisis — confirmado en store).
  - Tests unit nuevos para `computeYTD` con rango. Esperado: ~3 commits si se separa interfaz + impl + consumers downstream.

- **Ticket 3.B — VendedoresPage rango-aware** (1 commit, depende de 3.A):
  - Tabla EQUIPO TOTAL y columnas YTD/VAR consumen los nuevos campos rango-aware.
  - Test 3 de 2.4.5 sube de smoke a assertion estricta de cambio numérico.

- **Ticket 3.C — EstadoComercialPage card VENTA ACUMULADA + sub-label** (1 commit, depende de 3.A):
  - Card consume `ytd_actual_equipo_uds` rango-aware.
  - Sub-label L1849: reemplazar "Acumulado Ene–{mes}" por `formatPeriodLabel(year, monthStart, monthEnd)`.
  - Label L1405 → `formatPeriodLabel`.

- **Ticket 3.D — ClientesPage labels rango-aware** (1 commit):
  - Reemplazar `MESES_CORTOS[selectedPeriod.month]` por `formatPeriodLabel` en labels (L265, 639, 663, 851).
  - Cross-table local (L141): consumir rango con `salesInRange`.

**Total Sprint 3**: 4 sub-tickets, ~5 commits. Dependencia: 3.B y 3.C requieren 3.A.

**Sprint 4 (pre-clientes reales) — P1 alta deuda + P2**:

- **Ticket 4.A — ProductoPanel + MetasPivotPanel migrados** (2 commits): firmas + B1 + topVendedores/topClientes a `salesInRange`.
- **Ticket 4.B — EstadoGeneralEmpresa + ComparisonSummary** (2 commits): firma helper + rename `salesInRange` local.
- **Ticket 4.C — MetasPage + RotacionPage** (2 commits): firmas legacy + tests E2E mínimos.
- **Ticket 4.D — EstadoComercialPage barrido `.month`** (1 commit): los ~20 sitios coherentes accidentalmente.
- **Ticket 4.E — ChatPage + DepartamentosPage** (1 commit, P2): contexto al backend + lectura completa Departamentos.
- **Ticket 4.F — Tests E2E 4.2 + 4.3 con fixtures empty-data** (1 commit): cierra deuda registrada en BACKLOG Ticket 2.4.5.

**Total Sprint 4**: 6 sub-tickets, ~9 commits.

**Resumen**: 5 sitios P0 + 7 sitios P1 + 2 sitios P2 + 2 excepciones P3. 4 tickets Sprint 3 + 6 tickets Sprint 4. Dependencia única: Sprint 3.A es prerequisito de 3.B y 3.C.

## Sprint 4 candidates — deudas conscientes del bundle 3.B

### cumplimiento_pct rango-aware

**Origen:** Investigación 3.B.3.5 (Sprint 3).
**Decisión pendiente:** Cuando el usuario elige rango Ene–Feb, ¿"Cumpl. prom" debe reflejar (a) cumplimiento de Feb solamente — comportamiento actual, anclado a `monthEnd` — o (b) cumplimiento agregado Ene+Feb vs meta Ene+Feb?
**Consumers afectados si migra:** EstadoComercialPage card PROYECCIÓN (~L1866), insightEngine (varios candidates basados en `cumplimiento_pct` y `proyeccion_cierre`), chatService:299 (context al LLM), exportUtils:108 (KPIs export), VendorPanel:488 (KPI principal "vs mes anterior").
**Recomendación técnica:** Si se elige (b), agregar campos paralelos `cumplimiento_rango` / `ventas_rango` en `VendorAnalysis` (mismo patrón que `ytd_*` post-3.B.½), no reemplazar — para no romper card PROYECCIÓN ni el motor.

### Default 'ok' para vendedores sin baseline YoY

**Origen:** Investigación 3.B.3.5 (Sprint 3).
**Bug menor pre-existente:** En [analysis.ts:556-571](src/lib/analysis.ts#L556), el branch sin meta usa `< -20%` / `< -10%` / `> +10%` para clasificar `riesgo`. Vendedores con `variacion_vs_anio === null` (sin baseline año anterior) caen en default `'ok'`, lo cual puede ser engañoso para vendedores nuevos sin historia.
**Decisión pendiente:** ¿Deberían clasificarse como `'sin_baseline'` o `'nuevo'` con visualización distinta (ej. badge gris en tabla, no contar en stats top)? Implica extender el tipo `RiesgoVendedor` y todos los consumers que matchean por valor.

### UX labels "YTD" en drawer ClientesPage

**Origen:** Validación visual post-3.B.4 (Sprint 3, Ticket 3.B.9 propuesto).
**Mejora cosmética:** Cards "YTD 2026", "YTD 2025", "NETO YTD 2026" en el drawer del cliente (ClientePanel) usan jerga "YTD" que puede confundir a usuarios no técnicos.
**Acción propuesta:** Renombrar a `"Año completo 2026"` o `"Total {año} a la fecha"`. Copy puro, scope reducido (~4 líneas en ClientePanel.tsx).
**Sin decisión técnica pendiente:** founder define el copy final.

### 3.E.4 — Consistency tree pivot monthly (Sprint 4, prioridad media)

**Origen:** Validación visual de 3.E.2.

Detectado en validación visual post-tree-pivot monthly:

- **Indent monthly = 24px vs YTD = 28px**. Unificar a 28px para alineación visual exacta entre ambas vistas.
- **`expandAll` / `collapseAll`** del header en vista monthly solo recolectan IDs de `pivotData` (YTD). Cuando `tableView === 'monthly'`, deberían recolectar de `monthlyPivotData` (state ya disponible en RendimientoPage). Caso límite cuando dim chains no coinciden entre vistas.

Diff esperado: ~10–15 líneas. Riesgo bajo. NO blocker.

### 3.E.5 — Refactor extracción `<TreeRow>` compartido (Sprint 4, prioridad baja)

**Origen:** Cierre Sprint 3 — análisis post-bundle 3.E.

Bundle 3.E generó duplicación de UI tree entre vista YTD y monthly. Cada vista tiene su propio render inline de chevron + indent + badge + cell + handlers (~100 líneas duplicadas con shape divergente solo en las cells).

**Acción propuesta:** Extraer `<TreeRow>` con prop polimórfica para renderizar cells distintas por vista. Reducción estimada: ~80–120 líneas. Diff total del refactor: ~150–200 (extracción + 2 call sites). Riesgo medio (refactor visible, requiere validación visual exhaustiva). NO blocker.

## Sprint 3 — Features visibles

### Rendimiento Anual — rediseño de filtros y toggle YTD/Mensual

Decisiones de producto (congeladas en Sprint 2, pendientes de implementación):

**Estado actual (post-Sprint 2):**
- Página tiene dropdown propio de año (SFSelect en RendimientoPage:588).
- Estado local `selectedYear` sincronizado con `selectedPeriod.year` del store (commit a58e4b06).
- No tiene dropdowns de mes inicio/fin propios.
- No tiene toggle YTD/Mensual.
- Sigue el filtro mensual global de TopBar (Desde/Hasta) como cualquier otra página.

**Estado objetivo (Sprint 3):**

1. Página única que NO sigue el filtro mensual global. Rendimiento Anual ignora los dropdowns Desde/Hasta de TopBar y tiene su propio control.

2. Control propio: dos dropdowns "Mes inicio" + "Mes fin" + toggle YTD/Mensual, todo dentro de la página (no en TopBar).

3. Toggle YTD (default):
   - Comportamiento como hoy + filtro mensual.
   - Columnas con comparación YoY (mismo rango año anterior).
   - Chart con dos líneas (actual + año anterior).
   - Si rango incluye mes en curso: truncar al mismo día (regla CONTEXT.md).

4. Toggle Mensual:
   - Desde primer mes con datos hasta fechaRef (mes truncado a día de fechaRef).
   - Columnas mensuales sin comparación YoY (solo venta del mes).
   - Chart con UNA sola línea (actual, sin año anterior).
   - Los dropdowns "Mes inicio" + "Mes fin" siguen activos pero ahora se interpretan como rango contiguo del año seleccionado.

5. Estimación: 3-4 commits.
   - Commit 3.1: lógica del toggle YTD/Mensual + estado en store o local (decidir al inicio del sprint).
   - Commit 3.2: UI del toggle + dropdowns Mes inicio/Mes fin propios.
   - Commit 3.3: lógica del chart de una línea en modo Mensual + columnas sin YoY.
   - Commit 3.4: E2E del toggle y persistencia.

**Decisiones pendientes para inicio de Sprint 3:**
- ¿El estado del toggle vive en `appStore` (global, persistido) o local en RendimientoPage (no persistido)?
- ¿El rango "Mes inicio + Mes fin" de Rendimiento Anual reusa el shape `selectedPeriod` con un override local, o tiene su propio slice del store?
- ¿`formatPeriodLabel` necesita variant para "anual completo" (ej. "2025 completo") en modo Mensual sin rango?

## 🔒 Seguridad — Bloqueantes con fecha de vencimiento

Ítems vivos detectados al cerrar bucket G del triage 1.4.5. NO son
emergencia hoy (repo privado en GitHub, sin despliegue en Render),
pero cada uno tiene un evento que los vuelve críticos.

### Sprint 0.6 — cierre parcial (4/5 resueltos)

- **S1**: ✅ parcial (key rotada en DeepSeek dashboard; limpieza de
  historia git pendiente — due: invitar colaboradores o push a Render)
- **S3** (políticas placebo): ✅ cerrado (commits `df9f1cf1`, `33f86022`,
  `9c4d39c4`, `a6d6daae`)
- **S4** (auditoría): ✅ cerrado (commit `6ccf12b9` drop + auditoría
  completa)
- **S4.1** (drop 14 tablas legacy): ✅ cerrado
- **S2** (rate limit /chat): ⏳ movido a deuda con due-date event-anchored
  (ver sección abajo)

### S1 — Rotación de DeepSeek key

**Estado:** Parcialmente resuelto (29-abr-2026)

**Resuelto:**
- Key vieja (`sk-be7fa627...`, expuesta en commit `01fc8fd6`) revocada en
  dashboard de DeepSeek.
- Key nueva en `backend/.env` local, chat funcional.
- Riesgo de uso indebido cerrado: la key vieja ya no abre ninguna puerta.

**Pendiente:**
- Limpieza de historia de git con `git filter-repo` para borrar la key
  vieja del commit `01fc8fd6` y descendientes.
- **Due-date:** antes de cualquiera de estos eventos:
  - Invitar colaborador al repo de GitHub.
  - Primer push a Render (o cualquier hosting con logs/builds visibles).
  - Cambio de visibilidad del repo a público.
- Camino aprobado: B (Python 3.14.3 disponible, único colaborador
  confirmado, force-push viable).
- Checklist completo guardado en historial de chat.

### S2 — Rate limiting en POST /chat

**Estado:** pendiente
**Due:** antes de cablear backend Python al frontend (o primer push a
Render con backend activo).

**Riesgo si se ignora:** sin rate limit, un atacante autenticado podría
drenar la cuota de DeepSeek API enviando requests masivos al endpoint
`/chat`. La key actual (post-S1) tiene tope de gasto en DeepSeek
dashboard como mitigación parcial.

**Decisión técnica pendiente al implementar:**
- Stack: `slowapi` (FastAPI nativo) vs middleware custom vs Redis-based.
- Política: por `user_id` (ya autenticado vía JWT), por IP, o combinada.
- Límite: TBD según patrón de uso esperado (ej. 30 req/min por user).

**Estimado al implementar:** 3-5 commits (config + middleware + tests + docs).

### ~~S3 — RLS en sales_forecasts / sales_forecast_results / sales_aggregated~~ ✓ RESUELTO en S4.1
- Las 3 tablas dropeadas en migration `003_drop_legacy_forecast_tables.sql`
  (commit `6ccf12b9`) — eran zombies sin uso en runtime. Sin RLS pero
  ya no existen.

### ~~S3.placebo — políticas placebo en organizations + organization_invitations~~ ✓ RESUELTO
- `Anyone can read invitation by token` y `Anyone can read org name by id`
  reemplazadas por RPC `get_org_public_info(uuid)` con SECURITY DEFINER.
- Migration `004_tighten_org_invitation_policies.sql` (commit `df9f1cf1`).
- Frontend migrado a `.rpc()` (commit `33f86022`).
- E2E coverage (commit `9c4d39c4`).

### ~~S4 — Auditar resto de tablas Supabase~~ ✓ RESUELTO
- Auditoría completa: 58 tablas → 14 dropeadas (legacy forecast) + 2
  políticas placebo cerradas. **0 tablas sin RLS y 0 políticas
  USING (true) restantes en schema public.**
- Estado final: 45 tablas, 100% con RLS ON.

## Follow-ups del ticket 1.5

- **E2E coverage gap: post-analyze cleanup nivel UI** (~30 LOC, 30 min).
  El spec `upload-wizard-persist.spec.ts` omite los pasos f-g (click
  "Analizar" → reload → wizard limpio) porque requieren simular skip
  de metas/inventario opcionales. Cubierto colateralmente por unit tests
  de `wizardCache` + E2E `wizard-cache` stale-version cleanup.
- **beforeunload nativo** no testeable con Playwright (skipea prompts
  del browser); validación manual requerida en cada release crítico:
  subir archivo → reload o cerrar tab → confirmar que aparece dialog.
- **Migración a `createBrowserRouter` (Data Router)** si se quiere
  `useBlocker` real con bloqueo de navegación programática (`useNavigate`
  in-code bypasea el click-interceptor actual). Prerequisito: refactor
  de routing en `App.tsx` + `main.tsx`; puede romper el patrón actual
  de `RequireAuth` wrapper.
- **Singleton-debounce en `wizardCache.ts`** usa `_resetForTests()` para
  aislar tests. Refactorizar a clase `WizardCache` con instance state
  si se necesitan múltiples drafts en paralelo (ej. uno por organización).

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

## Decisiones de producto futuras

### invitation-model-uuid-vs-token

**Estado:** decisión pendiente
**Due:** antes del primer cliente con equipo de >2 personas

Hoy SalesFlow usa modelo UUID-as-invitation: el owner comparte link
`/join/<orgId>`, cualquiera con el UUID puede unirse si
`allow_open_join=true`. La tabla `organization_invitations` existe pero
está sin frontend (política placebo dropeada en S3, commit `df9f1cf1`).

Modelo alternativo (B): tokens en `organization_invitations` con email +
expiración + revocación, ruta `/invite/<token>`.

**Trade-offs:**
- **Modelo A actual**: simple, kill-switch via `allow_open_join`, UUIDs
  no-enumerables. Riesgo si UUID se filtra mientras flag está ON.
- **Modelo B futuro**: tracking, audit log, expiración. Requiere infra
  de email (Resend/Supabase SMTP), diseño de pantalla `/invite/<token>`,
  flujo invitee-sin-cuenta. Estimado 1-2 sprints.

**Acción:** revisar cuando se invite el primer colaborador real fuera
del owner.

## Código huérfano post-drop

### sales-forecast-service-tabla-dropeada (post-S4.1)

`backend/app/services/sales_forecast_service.py` (L328, L380) hace
`supabase.table("sales_forecasts").insert(...)` y `.select(...)`. La
tabla `sales_forecasts` fue dropeada en migration
`003_drop_legacy_forecast_tables.sql` (commit `6ccf12b9`). El servicio
está en código pero el módulo forecast viejo no está conectado al
frontend ni se invoca en runtime, por lo que no rompe nada hoy.

**Acción pendiente:** cuando se decida si el módulo forecast viejo se
descarta del backend o se reemplaza, eliminar `sales_forecast_service.py`
o reescribirlo apuntando al nuevo modelo de forecast.

**Riesgo si se ignora:** llamar a este servicio en runtime fallará con
error de tabla inexistente (`relation "sales_forecasts" does not exist`).

## Migraciones silenciosas

### `bugfix-analyzeSupervisor-mtd-yoy` (Ticket 2.2-B)

**Antes del fix:** La función `analyzeSupervisor` en `src/lib/analysis.ts`
(L1134-1135) calculaba el rango "mes anterior año previo" como mes
calendario completo:

```ts
prevYearStart = new Date(year - 1, month, 1)
prevYearEnd   = new Date(year - 1, month + 1, 0, 23, 59, 59, 999)
```

Mientras que el período actual (`ventas_periodo` en L1161) venía de
`vendorAnalysis` ya truncado al día actual. Resultado: `variacion_pct`
comparaba MTD parcial actual contra mes completo del año pasado,
sobreestimando sistemáticamente el "anterior" cuando el período actual
era el mes en curso.

**Después del fix:** El rango anterior se trunca al mismo día
(`fr.getDate()`), aplicando el mismo patrón que ya usaban `computeYTD`
(L290-296) y `computeCommercialAnalysis` (L766-770).

**Impacto observable:** Los valores de `variacion_pct` de la tabla de
supervisores cambian para el mes en curso. Supervisores cuyo "anterior"
era inflado pueden subir aparentemente. Este NO es un cambio del
rendimiento real del supervisor — es la primera vez que el número se
calcula correctamente.

**Snapshot pre-fix:** commit anterior al hash del 2.2-B (registrar
hash post-commit).

**Goldens del motor:** se espera regeneración tras el fix (similar a lo
que pasó en Sprint 1.3 con Z.13.V).

**Si un cliente reporta "mis números de supervisor cambiaron solos":**
apuntar a esta entrada.

### `migracion-metas-keyword-fix` (commit 220711ea)
`detectTipoMeta` ahora reconoce headers con sufijos de moneda (`usd`,
`bs`, `mxn`, `cop`, `ars`, `clp`) como `'venta_neta'`. Antes el
keyword list solo cubría `venta|revenue|importe|monto|neta`, así que
headers como `meta_usd`, `Meta USD`, `target_usd`, `meta_bs`,
`meta_mxn`, `meta_cop`, `meta_ars`, `meta_clp` caían a default
`'unidades'` silenciosamente.

Datos previamente parseados como `'unidades'` con esos headers
**cambian de unidad al re-procesar**. Sin migración automática — el
override del modal del 1.6.2 cubre los casos que el usuario note.
Si un cliente reporta "mis metas cambiaron solas", apuntar acá.

## Mejoras UX

### Badge calendario explicita cutoff same-day (Ticket 2.4.5)

Hoy el header de EstadoComercialPage muestra dos badges separados: `"Ene–Feb 2026"` (rango formal) + `"Día 6 de 28"` (cutoff intra-mes). Considerar copy más directo tipo `"Ene 1 — Feb 6, 2026"` que comunica el truncamiento same-day en una sola línea.

**Decisión de producto aprobada Sprint 2** (no reabrir): el modo "año cerrado completo" (suma de todos los meses sin truncamiento) queda **exclusivo de Rendimiento Anual** (Sprint 3). Las otras páginas (EstadoComercialPage, ClientePanel, VendedorPanel) mantienen **YTD-same-day** como semántica primaria — el último mes del rango se trunca al día de `fechaRef`.

Due: Sprint 4 / pre-clientes reales.

## Deuda técnica

### Sub-label "Acumulado Ene–{mes}" hardcoded en EstadoComercialPage (Ticket 2.4.5)

[src/pages/EstadoComercialPage.tsx:1849](src/pages/EstadoComercialPage.tsx#L1849):
el sub-label de la card "VENTA ACUMULADA" muestra siempre `"Acumulado Ene–{mesActNombre} día X vs mismo período Y"`. El `Ene–` está hardcoded y no refleja el `monthStart` real del rango activo.

Detectado durante implementación de E2E del Ticket 2.4.5. Se difirió porque
no estaba en el inventario de Fase 1 y el fix implica decidir el copy correcto
para el modo rango (ej. "Acumulado {formatPeriodLabel(...)}").

Due: Sprint 4 / pre-clientes reales.

### Tests E2E 4.2 + 4.3 empty-data shapes (Ticket 2.4.5)

Diferidos por falta de fixture demo apropiado:
- **4.2**: dataset cuyo `fechaRef` esté en año pasado (no año-en-curso). Demo actual cubre Ene 2024–Abr 2026 → no aplica.
- **4.3**: validar que el cálculo MTD same-day usa exactamente el día de `fechaRef`, no `new Date().getDate()`. Requiere dataset con `fechaRef` en día específico (ej. 6-feb).

Solución propuesta: agregar `tests/fixtures/demo-empty-data-*.json` con datasets minimalistas + helper para sembrarlos vía localStorage antes de la navegación. Due: Sprint 4 / pre-clientes reales.

### useRecomendaciones B1 estricto en rango multi-mes (Ticket 2.4.2)

En rangos multi-mes (ej. Mar–Jun), el body de recomendaciones de
`useRecomendaciones` (VendedorPanel) dice "el mes pasado" / "vs el mes
anterior" refiriéndose a `monthEnd - 1` (Mayo en el ejemplo), que cae
**dentro del rango activo** del usuario. Mismatch sutil aceptado como
deuda al cierre de Ticket 2.4.2.

Razón: el hook calcula `prev = prevPeriod(year, monthEnd)` (sequential)
y los labels acoplan dato + texto. Migrar a B2 (acumular rango YoY)
requeriría reformular los copies a "vs el rango anterior" o similar,
lo cual es una decisión de producto, no de refactor.

Escalar si visualmente molesta con clientes reales. Due: smoke test
pre-clientes reales / Sprint 4.

### Verificación visual de flicker primer render (post-Ticket 2.3.2)

Con localStorage limpio, el initial state del store es neutro
(`selectedPeriod = {year:0, monthStart:0, monthEnd:0, month:0}`)
hasta que `setFechaRefISO` materializa el shape al cargar datos.
Riesgo teórico de flicker visible en consumers que rendean antes
de la materialización:

- `EstadoComercialPage` chip selector: `MESES_LARGO[selectedPeriod.month]`
  podría mostrar "enero" durante 1 frame antes del corregido.
- `ClientesPage:265`: `${selectedPeriod.year - 1}` muestra "-1" como
  literal antes de tener año real.
- Headers tipo "Año X" o "vs año anterior" en pantallas dependientes.

**Due:** smoke test pre-clientes reales / Sprint 4.
**Acción:** verificación manual con Network throttling para amplificar
la ventana, decidir si se necesita loading overlay extendido o si los
frames intermedios son imperceptibles.

### Refactor `migrate` de appStore a firma `(state, version)` (post-Ticket 2.3.2)

La función `migrate` actual (`src/store/appStore.ts:481`) ignora el
parámetro `version` que Zustand le pasa, y discrimina por shape del
`persistedState`. Funciona hoy pero es frágil: si una versión futura
cambia el shape conservando `monthStart`, la rama de detección se
dispara incorrectamente.

**Acción:** refactor a `migrate: (state, version) => { switch(version) { case 9: ...; case 10: ...; } }`.
**Due:** deuda técnica, sin urgencia. Reabrir cuando se planifique v12+.

### ~~`wizardCache` usa module-level state para debounce~~ → movido a Follow-ups del ticket 1.5

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
