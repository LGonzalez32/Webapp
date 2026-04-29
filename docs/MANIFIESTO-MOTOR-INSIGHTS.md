# MANIFIESTO DEL MOTOR DE INSIGHTS — SalesFlow

**Versión:** 3.0.0 (post-rewrite Fase 4 del roadmap documental)
**Estado:** contrato operativo del motor en producción al 2026-04-24.
**Propósito:** documento canónico de "cómo funciona el motor". No es changelog,
no es ADR, no es referencia histórica. Para historia ver
`docs/historico/MANIFIESTO-MOTOR-INSIGHTS-Z9-Z13-HISTORICO.md`.

> **Lectura obligatoria** antes de tocar `insight-engine.ts`,
> `decision-engine.ts`, `insightStandard.ts` o sus consumidores.
> Para "dónde agrego X", ver `docs/GLOSARIO-MOTOR-INSIGHTS.md` (cuando exista).

---

## 1. Pipeline canónico (10 etapas)

| # | Etapa | Input | Output | Archivo dueño |
|---|---|---|---|---|
| 1 | Carga de datos crudos | Excel/CSV upload | `SaleRecord[]`, `MetaRecord[]`, `InventoryItem[]` | `src/lib/fileParser.ts` |
| 2 | Índice de ventas | `SaleRecord[]` | `SaleIndex` (byPeriod, byVendor, byProduct, byClient, fechaReferencia) | `src/lib/analysis.ts:buildSaleIndex` |
| 3 | Análisis comercial derivado | `SaleIndex` + metas + config + selectedPeriod | `vendorAnalysis`, `teamStats`, `clientesDormidos`, `concentracionRiesgo` | `src/lib/analysis.ts:computeCommercialAnalysis` |
| 4 | Análisis dimensionales | `SaleIndex` + metas | `categoriaAnalysis`, `canalAnalysis`, `supervisorAnalysis` | `src/lib/analysis.ts:analyzeCategoria/Canal/Supervisor` |
| 5 | Inventario por categoría | `sales` + `inventory` + `selectedPeriod` | `categoriasInventario` (PM3 de 3 meses cerrados) | `src/lib/analysis.ts:computeCategoriasInventario` |
| 6 | Detectores → pool bruto | Análisis derivados de etapas 3-5 | `InsightCandidate[]` (bruto) | `src/lib/insight-engine.ts:runInsightEngine` |
| 7 | Ranker + cap → pool seleccionado | Pool bruto | `InsightCandidate[]` (seleccionado, post-cap) | `runInsightEngine` (mismo) |
| 8 | Gate estándar (filtro pass/fail) | Pool seleccionado + agregados + contexto | `InsightCandidate[]` (que pasa el estándar) | `src/lib/insight-engine.ts:filtrarConEstandar` (wrapper temporal) → `src/lib/insightStandard.ts` (gate canónico tras Fase 6) |
| 9 | Causal linking + compresión ejecutiva | Filtrados | `InsightChain[]`, `ExecutiveProblem[]` | `src/lib/decision-engine.ts:buildInsightChains/buildExecutiveProblems` |
| 10 | Render | Executive problems + filtered residuales | `DiagnosticBlock[]` → UI cards | `src/lib/insight-engine.ts:candidatesToDiagnosticBlocks` + `src/pages/EstadoComercialPage.tsx` |

**Llamada explícita a getAgregadosParaFiltro entre 7 y 8:** pre-computa mapas
de ventas en una pasada para que `filtrarConEstandar` no recompute (`Z.4` —
ver `domain-aggregations.ts:getAgregadosParaFiltro`).

### Mapa runtime verificable

El motor mantiene un mapa auditable no visible para el usuario:

- Cada `InsightCandidate` puede llevar `_origin` interno:
  `motor2_registry_loop`, `cross_engine`, `special_builder`,
  `motor1_legacy`, `executive_compression` o `legacy_render_adapter`.
- `EngineStatusReport.pipeline` mide etapas internas de `runInsightEngine`:
  `motor2_registry_loop`, `cross_engine`, `special_builders`, `dedup` y
  `ranker`, con entradas, salidas, descartes y duracion.
- `recordInsightRuntimeAuditReport()` completa el mapa fuera del motor con
  `gate`, `executive_compression` y `render_adapter`.
- `getLastInsightRuntimeAuditReport()` devuelve el ultimo reporte completo
  para tests, consola DEV y auditorias.

Contrato: estos campos son solo diagnostico. No deben cambiar ranking, gate,
copy visible ni render.

---

## 2. Tipos canónicos

| Tipo | Definido en | Rol |
|---|---|---|
| `InsightCandidate` | `insight-engine.ts:313` | Estructura de un candidato del motor (etapas 6–8) |
| `EngineParams` | `insight-engine.ts:396` | Input de `runInsightEngine` |
| `InsightRuntimeAuditReport` | `insightTelemetry.ts` | Mapa completo desde candidatos retornados hasta gate, compresion ejecutiva y render adapter. Se accede via `getLastInsightRuntimeAuditReport()` |
| `EngineStatusReport` | `insight-engine.ts:421` | Telemetría: bruto vs seleccionado, por detector. Se accede vía `getLastInsightEngineStatus()` |
| `InsightChain` | `decision-engine.ts` | Cadena causal entre candidatos con `root_problem_key` compatible |
| `ExecutiveProblem` | `decision-engine.ts` | Compresión ejecutiva sobre una chain (etapa 9) |
| `DiagnosticBlock` | `src/types/diagnostic-types.ts` | Card visual (etapa 10) |

Nota: `EngineStatusReport` ya no es solo conteo por detector; tambien expone
`pipeline`, `originBreakdown` y `rankerAudit`.

---

## 3. Detectores activos

7 categorías de detector emiten al pool bruto en etapa 6. Counts esperados
contra demo dataset (Los Pinos S.A., reloj congelado en 2026-04-24,
tipoMetaActivo='usd') — ver baseline en sección 7.

| Detector | Métrica del status | Comportamiento esperado |
|---|---|---|
| `motor1` | clásico legacy | Grueso de candidatos. Cubre cliente dormido, concentración, meta crítica, etc. |
| `change_point` | quiebre estadístico | Cambios bruscos en serie temporal por entidad |
| `outlier_builder` | Z.7 — outlier por entidad | Magnitud anómala vs distribución de la dimensión |
| `steady_share` | Z.7 — share estable | Baseline de share consistente que se rompe |
| `correlation` | Z.7 — co-movimiento | **No emite contra demo** (0 candidatos). No es detector muerto: requiere co-ocurrencia que el demo no genera. |
| `meta_gap_temporal` | Z.7 — gap a meta proyectado | Solo si hay metas asignadas |
| `z9_hydration` | Z.9 — hidrata campos ejecutivos | Pase post-detección que rellena `direction`, `time_scope`, `entity_path`, `impacto_*` |

Cada detector tiene `EngineDetectorStatus` con `result: 'ok'|'partial'|'failed'|'skipped'` y `candidatesEmitted: number` accesible via `getLastInsightEngineStatus()`.

---

## 4. Contrato del gate estándar (etapa 8)

`insightStandard.ts` exporta el gate canónico Z.12:
- `evaluateInsightCandidate(c, ctx) → InsightGateDecision` (pura)
- `shouldInsightPass(c, ctx) → boolean` (shorthand)

Tipos estructurales: `InsightGateCandidate`, `InsightGateContext`,
`InsightGateDecision`. Definidos por duck typing para evitar dependencia
circular hacia `InsightCandidate`.

`filtrarConEstandar` (en `insight-engine.ts:3791`) queda como orquestador
array-level: precomputa `crossCount`, llama al gate, aplica mutación
`_z122_relaxed` cuando el modo es relaxed, emite telemetría DEV. Reglas
extra (filtro-ruido, proporcionalidad, dedup, cascadas, integración inv/metas)
siguen orquestadas dentro de `filtrarConEstandar` — migración pendiente
Fase 6B.

### Excepción contribution-up (Fase 7.5-B)

El gate rescata r2 (Pareto) cuando un crecimiento positivo cumple los
6 criterios estrechos por construcción:

- `insightTypeId === 'contribution'`
- `direction === 'up'`
- `score ≥ 0.95`
- `severity ∈ {ALTA, CRITICA}`
- `|impacto_usd_normalizado| / ventaTotalNegocio ≥ 1%`
- `impacto_usd_source` válido bajo r3 (no `non_monetary` ni `unavailable`)
- `tituloOk` y `descOk` (narrativa básica concreta)

Si todos se cumplen y la única regla que el candidato fallaría es r2,
el gate lo deja pasar con `reason='relaxed:exception_contribution_up'`.
`rules.pareto` sigue exponiendo el valor RAW (false), pero `passes` y
`failedRules` reflejan el resultado efectivo post-excepción.

**Telemetría:** `gateRescuedByContributionUpException` en el audit cuenta
estos rescates por dataset. Si crece descontroladamente en producción,
ajustar criterios. Hoy esperado: ≤1 sobre demo Los Pinos.

Reglas que el gate aplica (todas viven en `insightStandard.ts` aunque la
orquestación todavía esté afuera):

- **Materialidad** (`Z.12`): impacto debe superar umbral relativo al período.
- **Pareto sobre dinero real** (`Z.12`): pareto se calcula sobre
  `|impacto_usd_normalizado|`, no sobre score.
- **Validación de proporcionalidad** (`validarProporcionalidad`): el % debe
  estar dentro del rango razonable según contexto.
- **Filtro de ruido** (`pasaFiltroRuido`): score mínimo + cobertura mínima.
- **Detección de redundancia** (`detectarRedundancia`): no dos candidatos del
  mismo `(insightTypeId, member)` con scores cercanos.
- **Heterogeneidad** (`analizarHeterogeneidad`): items con impactos USD
  dispares se segmentan, no se mezclan.
- **Cascadas** (`detectarCascadas`): chains de causalidad detectadas se
  preservan aunque alguno individual no llegue a materialidad.
- **Excepción `no_temporal`**: candidatos sin `time_scope` derivable pasan
  por su propia ruta.

El gate **NO depende de `DiagnosticBlock`**. El contrato es sobre
candidatos, no sobre UI.

---

## 5. Compresión ejecutiva — Z.9 (etapa 9)

### Estado del flag

```ts
// src/lib/decision-engine.ts:21
export const EXECUTIVE_COMPRESSION_ENABLED = true
```

**Activo en producción.** El flag gobierna el render en `EstadoComercialPage`,
no el filtro.

### root_problem_key — familia temporal

`buildRootProblemKey(candidate)` retorna `${direction}:${dimensionId}:${time_scope_family}` donde `time_scope_family` proyecta:

| `time_scope` crudo | familia |
|---|---|
| `mtd`, `monthly` | `current` |
| `ytd`, `rolling` | `longitudinal` |
| `seasonal` | `seasonal` |
| ausente / `unknown` | `unknown` |

Implementado en `decision-engine.ts:75` (`timeScopeFamily`). Antes de Z.9.6 el
formato exponía `time_scope` crudo — eso es el formato histórico, ya no es
contrato.

### Pipeline ejecutivo

```
filtered candidates
  → buildInsightChains(allowSingletons: true)
     agrupa por root_problem_key compatible + intersección de entidad
  → buildExecutiveProblems
     comprime cada chain en un ExecutiveProblem con:
       - rootCandidate (el de mayor impacto monetario)
       - coveredCandidates (subconjunto estricto del pool)
       - severity, impacto_usd, render_priority_score
  → render: ExecutiveProblem[] como cards principales,
            residuales (no cubiertos) como "DETALLE RESIDUAL"
```

### Invariantes Z.9 (testeadas en `decision-engine.test.ts`)

- `buildInsightChains` no crea ciclos.
- `buildInsightChains` no conecta entidades sin intersección real.
- `buildExecutiveProblems` no pierde el problema principal (top impacto aparece como root).
- `coveredCandidates` es subconjunto estricto del pool original.
- Pipeline no rompe sin metas / sin venta_neta / sin chain.

---

## 6. Hidratación Z.9.2 — campos ejecutivos del candidato

Detector `z9_hydration` puebla en cada `InsightCandidate`:

| Campo | Significado | Fuente cuando ausente |
|---|---|---|
| `direction` | `up` / `down` / `neutral` (estadístico) | `neutral` |
| `time_scope` | `mtd`/`ytd`/`rolling`/`monthly`/`seasonal`/`unknown` | `unknown` |
| `entity_path` | jerarquía ej. `["vendedor", "Carlos R."]` | `[]` |
| `impacto_valor` | magnitud observada (USD o uds) | `null` |
| `impacto_pct` | % sobre baseline explícito por tipo | `null` si denominador ambiguo |
| `impacto_gap_meta` | gap a meta si hay metas y cruce claro | `null` |
| `impacto_recuperable` | valor concentrado en hojas identificables | `null` |
| `impacto_usd_normalizado` | monto absoluto USD del candidato | `null` si no monetario |
| `impacto_usd_source` | trazabilidad: `gap_meta`, `recuperable`, `cross_varAbs`, `detail_monto`, `detail_magnitud`, `detail_totalCaida`, `cross_delta_yoy`, `non_monetary`, `unavailable` | siempre presente |
| `render_priority_score` | score determinístico del ranker ejecutivo | calculado |
| `root_problem_key` | familia temporal (sección 5) | `null` |

Distinción clave (R137):
- `direction` = dato estadístico (`up`/`down`/`neutral`).
- `DiagnosticBlock.direccion` = framing narrativo (`recuperable`/`positivo`/`neutral`).

El mapeo no es 1:1; cada capa tiene su semántica.

---

## 7. Baseline operacional

> **Estado Z.11.0:** la baseline numerica esta en reconciliacion. No usar
> esta seccion para justificar cambios funcionales hasta cerrar
> `docs/BASELINE-Z11-0.md`.
>
> Motivo: existe evidencia contradictoria entre un audit runtime previo
> (pass rate Z.11 de 16.7% con `sin-usd` dominante) y los goldens/audit tests
> del repo (fallos sin `monetaryCoherence`). La proxima fuente de verdad debe
> comparar worker `[Step B] motor2_insights` contra la corrida page-side de
> `EstadoComercialPage`.

Baseline previa documentada para demo Los Pinos S.A. con reloj congelado en
`2026-04-24 12:00`. Dos casos cubiertos: `tipoMetaActivo='usd'` y
`tipoMetaActivo='uds'`.

| Capa | USD | UDS |
|---|---|---|
| Sales rows | 94,838 | 94,838 |
| Metas rows | 900 | 900 |
| Inventory rows | 20 | 20 |
| Pool bruto (`engineStatus.candidatesTotal`) | 243 | 228 |
| Pool seleccionado (`engineStatus.candidatesSelected`) | 10 | 11 |
| Pool tras gate (`filtrarConEstandar`) | **7** | 8 |
| Pass rate del gate sobre pool seleccionado | **70.0%** | 72.7% |
| Rescatados por excepción contribution-up | **1** (María Castillo) | 0 |

**Distribución por detector (pool bruto):**

```
                    USD     UDS
motor1              155     140
change_point         68      68
z9_hydration         14      15
outlier_builder       4       4
steady_share          4       4
meta_gap_temporal     3       3
correlation           0       0   ← sin emisión en demo (no detector muerto)
```

Pre-Fase 7.5-B la pass rate USD era 60%; tras la excepción contribution-up
sube a 70% (María Castillo entra). UDS no tiene casos elegibles, su pass
rate se mantiene en 72.7%.

Histórico relevante: el audit de Fase 7.2 reveló que **cero** candidatos
del pool seleccionado fallan r3 (coherencia monetaria). r2 (Pareto) y r4
(narrativa) son los killers reales. Ver `docs/historico/MANIFIESTO-MOTOR-INSIGHTS-Z9-Z13-HISTORICO.md`
para el detalle de la hipótesis 7.1 refutada.

Snapshots exactos en `src/lib/__tests__/__snapshots__/insight-engine.golden.test.ts.snap`.
Cualquier cambio rompe el test — si es intencional, regenerar con `npx vitest -u`.
Durante Z.11.0 no se regeneran snapshots.

---

## 8. Invariantes que NO se rompen

1. **`fechaReferencia = max(sales.fecha)`**, nunca `new Date()` (excepto demo
   data generation).
2. **YTD vs MTD**: same-day-range entre años. Nunca período parcial vs mes
   completo.
3. **`recoveryScore` interno**: nunca expone número x/100 en UI.
4. **Pass/fail de un insight vive en `insightStandard.ts`** (post Fase 6).
   Reglas nuevas no se agregan en `insight-engine.ts`.
5. **`InsightCandidate.score` ≠ `impacto_usd_normalizado`**: el score gobierna
   ranker pre-gate; el impacto USD gobierna pareto y materialidad.
6. **`tipoMetaActivo` segrega vista**: USD y uds nunca se mezclan en el mismo
   render.
7. **`runAt` y `_stats` son internos**: no se exponen al UI ni se persisten.

---

## 9. Cómo extender el motor

| Tarea | Archivo a modificar | Capa |
|---|---|---|
| Agregar detector nuevo | `insight-engine.ts` (sección de detectores) + `insight-registry.ts` | Etapa 6 |
| Agregar regla pass/fail | `insightStandard.ts` (post Fase 6 del roadmap) | Etapa 8 |
| Cambiar narrativa de un tipo | `narrative-builder.ts` o `NARRATIVE_TEMPLATES` | Etapa 10 |
| Cambiar agrupación causal | `decision-engine.ts:buildInsightChains` | Etapa 9 |
| Agregar campo a `InsightCandidate` | `insight-engine.ts:313` | Etapa 6, propagar a 7-9 |
| Cambiar política de cap | `runInsightEngine` (sección post-detectores) | Etapa 7 |

Detalle "dónde va cada cosa exactamente" → `docs/GLOSARIO-MOTOR-INSIGHTS.md`
(pendiente Fase 5).

---

## 10. Tests que protegen el contrato

| Test | Cubre |
|---|---|
| `src/lib/__tests__/insight-engine.golden.test.ts` | Baseline 3-capa: bruto → seleccionado → filtrado. Snapshot estructural. |
| `src/lib/__tests__/decision-engine.test.ts` | Invariantes de chains + `buildRootProblemKey` con familia temporal. |
| `src/lib/__tests__/narrative-builder.test.ts` | Z.3 — invariantes del builder de narrativas. |

Comando: `npm test`. El golden corre en ~2s, los demás en <1s.

---

**Para mantener este documento:**
- Si se agrega un detector → actualizar sección 3.
- Si cambia el cap o ranker → actualizar baseline (sección 7) y regenerar snapshot.
- Si se mueve una regla a `insightStandard.ts` → actualizar tabla de sección 4.
- Cualquier cambio de versión del motor → bump de header + entrada en historico.
