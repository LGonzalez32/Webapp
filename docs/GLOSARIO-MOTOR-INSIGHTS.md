# GLOSARIO MOTOR DE INSIGHTS — SalesFlow

> **Regla de oro:** si una entrada requiere más de 5 líneas, pertenece al
> MANIFIESTO o al código, no al GLOSARIO. Acá solo "qué es" y "dónde vive".

---

## Nota runtime audit

- `getLastInsightEngineStatus()` expone stages internos, origenes y ranker audit.
- `getLastInsightRuntimeAuditReport()` completa gate, compresion ejecutiva y render.
- Z.11.0 esta activo: reconciliar worker vs page-side antes de tocar gate,
  ranker, listas o normalizacion USD. Ver `docs/ROADMAP-Z11-PIPELINE-BASELINE.md`.
- Los registries declarativos (`metricRegistry`, `dimensionRegistry`,
  `insightTypeRegistry`) siguen siendo metadata parcial: no son la fuente
  principal del runtime hasta que una migracion futura los conecte.

---

## Cómo usarlo

Primera parada cuando una sesión nueva pregunta "¿dónde va X?".

| Pregunta | Respuesta primaria |
|---|---|
| ¿Qué archivo manda? | Sección **Fuentes canónicas** |
| ¿Dónde agrego un detector / regla / métrica? | Sección **Dónde agregar X** |
| ¿Por qué hay 4 registries? | Sección **Registries** |
| ¿Cómo funciona el pipeline? | `docs/MANIFIESTO-MOTOR-INSIGHTS.md` |
| ¿Qué hace este archivo de 6000 líneas? | El código primero, después el manifiesto |

---

## Fuentes canónicas (quién manda sobre qué)

| Pregunta | Archivo |
|---|---|
| Pass/fail de un insight | `src/lib/insightStandard.ts:evaluateInsightCandidate` |
| Excepción contribution-up | `src/lib/insightStandard.ts` — rescata r2 cuando crecimiento positivo cumple 6 criterios estrechos. `reason='relaxed:exception_contribution_up'`. Ver MANIFIESTO §4. |
| Pipeline completo | `src/lib/insight-engine.ts` |
| Compresión ejecutiva (chains, problemas) | `src/lib/decision-engine.ts` |
| Detectores vivos | `src/lib/insight-registry.ts` (legacy activo) |
| Cálculos derivados de ventas | `src/lib/domain-aggregations.ts` |
| Análisis comercial (vendor/cliente/categoria) | `src/lib/analysis.ts` |
| Telemetría del motor | `getLastInsightEngineStatus()` en `insight-engine.ts` |
| Reglas operativas / DO NOT TOUCH | `CLAUDE.md` |
| Contrato del motor | `docs/MANIFIESTO-MOTOR-INSIGHTS.md` |
| Roadmap activo Z.11 | `docs/ROADMAP-Z11-PIPELINE-BASELINE.md` |
| Baseline Z.11.0 | `docs/BASELINE-Z11-0.md` |

---

## Registries — los 4 y cuál manda

| Registry | Status | Quién lo lee | Para qué |
|---|---|---|---|
| `insight-registry.ts` | **ACTIVO** | `runInsightEngine` (motor 2) | Detectores con `detect()`. Esto es lo que produce candidatos. |
| `metricRegistry.ts` | **METADATA declarativa** | Telemetría / cross-doc | Definición formal de métricas (USD, uds, ticket, etc.). Espera migración PR-M4. |
| `dimensionRegistry.ts` | **METADATA declarativa** | Telemetría / cross-doc | Definición formal de dimensiones (vendedor, producto, etc.). Espera PR-M4. |
| `insightTypeRegistry.ts` | **METADATA declarativa** | Telemetría / cross-doc | Definición formal de tipos. `status: 'implemented' \| 'declared'`. Espera PR-M4. |

> **Si tocás `metricRegistry/dimensionRegistry/insightTypeRegistry` esperando
> cambiar comportamiento del motor — error.** No están conectados. PR-M4
> ejecutará la migración del motor de cruce a estos 3 registries.

---

## Métricas

Ejes monetarios y volumétricos que el motor cuantifica. Definidos en
`metricRegistry.ts` (metadata) y consumidos como string id por candidatos.

| `metricId` | Unidad | Eje |
|---|---|---|
| `venta` | USD | venta neta del período |
| `unidades` | u | unidades del período |
| `cumplimiento_meta` | pct | progreso vs meta |
| `inventario` | u | stock / cobertura |
| `ticket_promedio` | USD/u | derivada (USD ÷ uds) |
| `precio_unitario` | USD/u | derivada — no volumétrica |
| `clientes_activos` | clientes | conteo de cuentas con compra |

`tipoMetaActivo` ∈ `'usd' | 'uds'` segrega vista global; nunca se mezclan
en la misma card.

---

## Dimensiones

Ejes de agrupación. Definidos en `dimensionRegistry.ts` (metadata).

| `dimensionId` | `requires` | Notas |
|---|---|---|
| `vendedor` | siempre | obligatorio en `SaleRecord` |
| `mes` | siempre | deriva de `fecha` |
| `cliente` | `has_cliente` | usa `clientKey` |
| `producto` | `has_producto` | |
| `categoria` | `has_categoria` | |
| `subcategoria` | `has_subcategoria` | |
| `canal` | `has_canal` | |
| `departamento` | `has_departamento` | |
| `supervisor` | `has_supervisor` | |
| `proveedor` | `has_proveedor` | |
| `codigo_producto` / `codigo_cliente` | flags propios | identificadores |

Disponibilidad calculada en `detectDataAvailability()`.

---

## Insight types / detectores

Detectores que emiten candidatos en etapa 6 del pipeline. Source en
`insight-registry.ts`. Telemetría en `EngineStatusReport.detectors`.

| Detector | `insightTypeId` que emite (entre otros) | Status |
|---|---|---|
| `motor1` | `cliente_dormido`, `concentracion`, `meta_critica`, `product_dead`, `migration`, `stock_risk`, etc. | activo (grueso) |
| `change_point` | `change` | activo |
| `outlier_builder` | `outlier` | activo |
| `steady_share` | `dominance`, `proportion_shift` | activo |
| `correlation` | `correlation` | activo (sin emisión en demo) |
| `meta_gap_temporal` | `meta_gap_temporal` | activo si hay metas |
| `z9_hydration` | rellena campos ejecutivos, no emite tipos nuevos | siempre |

---

## Candidato y gate

Tipo central: `InsightCandidate` en `insight-engine.ts:313`.

**Campos que afectan pipeline / gate / render** (resto en código):

| Campo | Capa que lo lee |
|---|---|
| `metricId` / `dimensionId` / `insightTypeId` | identidad — todo el pipeline |
| `member` | identidad de la entidad concreta |
| `score` / `score_normalized` | ranker pre-gate (etapa 7) |
| `severity` | UI + ranker ejecutivo |
| `impacto_valor` / `impacto_pct` | gate (materialidad) |
| `impacto_usd_normalizado` | pareto + ranker (etapa 8/9) |
| `impacto_usd_source` | trazabilidad del impacto |
| `direction` | causal linking (etapa 9) |
| `time_scope` | familia temporal → `root_problem_key` |
| `root_problem_key` | grouping de chains |
| `entity_path` | jerarquía para chaining |
| `render_priority_score` | orden ejecutivo |
| `_stats` | interno — solo set en `selected[0]`, no UI |

Gate orquestado por `filtrarConEstandar` (en `insight-engine.ts:3791` —
wrapper temporal). Reglas viven en `insightStandard.ts`. Detalle en
manifiesto §4.

Nota Z.11.0: `tipo-debil(...)` debe tratarse como hipotesis a confirmar. La
lectura inicial sugiere que puede ser derivado de `usd == null` y no pertenecer
a `Z11_ROOT_STRONG_TYPES`, no una blacklist formal.

---

## Narrativa y render

| Concepto | Archivo |
|---|---|
| Builder de narrativas (`title`, `description`, `accion`, `conclusion`) | `src/lib/narrative-builder.ts` |
| Plantillas por tipo nuevo (Z.7) | `NARRATIVE_TEMPLATES` en `insight-engine.ts` |
| Sanitización + reglas R88-R101 | `src/lib/diagnostic-actions.ts` |
| `DiagnosticBlock` (card visual) | `src/types/diagnostic-types.ts` |
| `candidatesToDiagnosticBlocks` | `insight-engine.ts` |
| Adaptador motor viejo → blocks ricos | `buildRichBlocksFromInsights` (Z.5) |
| Render UI | `src/pages/EstadoComercialPage.tsx` |

> El gate (`insightStandard.ts`) **NO depende** de `DiagnosticBlock`.
> Reglas visuales van a otro estándar (queda como deuda Fase 7+).

---

## Executive compression (Z.9)

| Concepto | Archivo / símbolo |
|---|---|
| Flag global | `decision-engine.ts:21` — `EXECUTIVE_COMPRESSION_ENABLED = true` |
| Construcción de chains | `decision-engine.ts:buildInsightChains` |
| Construcción de problemas ejecutivos | `decision-engine.ts:buildExecutiveProblems` |
| Clave de agrupación | `buildRootProblemKey` → `${direction}:${dimensionId}:${familia_temporal}` |
| Familia temporal | `timeScopeFamily()`: mtd/monthly→current, ytd/rolling→longitudinal, seasonal→seasonal |
| Materialidad ejecutiva | `MaterialityContext` + denominadores en `EstadoComercialPage` |

Detalle en manifiesto §5–§6.

---

## Telemetría

| Necesidad | API |
|---|---|
| Pool bruto vs seleccionado | `getLastInsightEngineStatus()` → `candidatesTotal` / `candidatesSelected` |
| Por detector | `EngineStatusReport.detectors[id].candidatesEmitted` |
| Resultado por detector | `result: 'ok' \| 'partial' \| 'failed' \| 'skipped'` |

Snapshot de baseline: `src/lib/__tests__/__snapshots__/insight-engine.golden.test.ts.snap`.

---

## Dónde agregar X

| Tarea | Archivo | Capa pipeline |
|---|---|---|
| Nuevo detector | `insight-registry.ts` (legacy activo) + telemetría en `EngineStatusReport.detectors` | etapa 6 |
| Nueva regla pass/fail | `insightStandard.ts` | etapa 8 |
| Nuevo `insightTypeId` | `insight-registry.ts` (lógica) + `insightTypeRegistry.ts` (metadata, status='declared') | etapa 6 |
| Nueva métrica | `metricRegistry.ts` (metadata) — pipeline lo lee tras PR-M4 | metadata |
| Nueva dimensión | `dimensionRegistry.ts` (metadata) — idem | metadata |
| Nueva narrativa de tipo existente | `narrative-builder.ts` o `NARRATIVE_TEMPLATES` | etapa 10 |
| Nuevo campo en `InsightCandidate` | `insight-engine.ts:313` + propagar a etapas 7-9 | tipo |
| Nuevo umbral / constante de regla | `insightStandard.ts` | etapa 8 |
| Nuevo cálculo derivado de `sales` | `domain-aggregations.ts` | pre-pipeline |
| Nuevo análisis dimensional | `analysis.ts` | etapa 4 |
| Cambiar política de cap / ranker | `runInsightEngine` (post-detectores) | etapa 7 |
| Cambiar agrupación causal | `decision-engine.ts:buildInsightChains` | etapa 9 |

---

## No agregar aquí

| NO va en | Razón |
|---|---|
| `metricRegistry/dimensionRegistry/insightTypeRegistry` | Metadata declarativa, no afecta motor todavía |
| `insight-engine.ts` reglas pass/fail nuevas | Tras Fase 6 son deuda — van a `insightStandard.ts` |
| `PROJECT_MAP.md` | Stub deprecado |
| Nuevos archivos `*Registry.ts` | Sin antes documentar solapamiento con los 4 existentes |
| `decision-engine.ts` filtrado pre-chain | El gate ya pasó; chains operan sobre filtrados |
| Cualquier `.md` cualquier credencial / API key | Va a `backend/.env` (gitignored) |
| `CLAUDE.md` o `MANIFIESTO` cualquier changelog | Histórico va a `docs/historico/` |

---

## Tests que protegen el contrato

| Test | Cubre |
|---|---|
| `src/lib/__tests__/insight-engine.golden.test.ts` | Baseline 3-capa (bruto / seleccionado / filtrado) |
| `src/lib/__tests__/decision-engine.test.ts` | Z.9 invariantes + familia temporal |
| `src/lib/__tests__/narrative-builder.test.ts` | Z.3 invariantes del builder |

`npm test` corre los 3 (~2s).

---

**Para mantener este documento:**
- Cada entrada nueva pasa el filtro de "≤ 5 líneas". Si necesita más, va al manifiesto o al código.
- Si un registry cambia de status (declared → implemented), actualizar la tabla en sección Registries.
- Si se mueve un símbolo entre archivos, actualizar la columna "Archivo" del item afectado.
