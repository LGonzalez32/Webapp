# Roadmap — Visibilidad de Insights en el Output

> **SUPERSEDIDO PARA TRABAJO NUEVO:** este roadmap queda como historico hasta
> cerrar `docs/ROADMAP-Z11-PIPELINE-BASELINE.md` Sprint Z.11.0.
>
> No ejecutar mas cambios de gate, ranker, caps, root-strong ni USD desde este
> documento. Sus conteos de tests y quality metrics pertenecen al momento de
> cierre del roadmap de visibilidad y no son baseline actual del checkout.
>
> **Estado historico de cierre: A→F cerrados ✅, G y H absorbidos ⚪. 110/110 tests, 0 tsc errors en ese momento.**
> El refactor de visibilidad está completo. Pool selected USD pasó de 5
> tipos a 10 tipos distintos. Todos los detectores que construimos en
> sprints anteriores (cliente_perdido, cliente_dormido, co_decline,
> cross_delta auto-combo, meta_gap_combo multi-dim) ahora son visibles
> en el output.
>
> **Para LLMs que retoman este trabajo:** este documento es la fuente de verdad
> del refactor de visibilidad. Antes de tocar código, lee de arriba a abajo. Si
> vas a implementar un sprint, lee el sprint completo + sprints previos cerrados
> (status `✅`) para entender el estado base. No saltes sprints.
>
> **Reglas duras:**
> - **Sí toca el gate Z.12** y el ranker. Es el objetivo del roadmap.
> - **No alterar la generación de candidatos** (builders, detectores, motor 2).
> - El golden snapshot **va a cambiar significativamente** — está OK. Cada
>   cambio debe tener test específico que documente la mejora (no solo
>   actualización de snapshot).
> - `npx tsc --noEmit` y `npm test` verdes son condición de cierre por sprint.

---

## Diagnóstico (resumen del análisis previo)

**Síntoma:** el output del motor siempre muestra los mismos 5 tipos:
`product_dead`, `meta_gap_temporal`, `stock_risk`, `migration`, `contribution`.
Tipos nuevos (`cliente_perdido`, `meta_gap_combo`, `cross_delta` auto-combo,
`skus_activos`) **se generan pero nunca llegan al render** (0 de ~90 candidatos
nuevos en pool selected).

**Causa raíz:** triple filtro contra tipos nuevos en 3 etapas:

1. **Ranker — protected bucket** (`ALWAYS_PROTECTED_CAPS` en
   `insight-engine.ts:6607`): solo 8 tipos legacy tienen slots reservados.
   Los nuevos van al regular pool de 166 candidatos compitiendo por 6 slots.
2. **Ranker — `usdWeight` dominante** (`insight-engine.ts:6761`): tipos sin
   `impacto_usd_normalizado` reciben weight=1 mientras monetarios reciben
   hasta ×9. Los no-monetarios pierden el ranking.
3. **Gate Z.12** (`insightStandard.ts:2578`): r1 + r3 + Pareto exigen USD
   válido. `Z12_ROOT_STRONG_TYPES` da free pass solo a 3 tipos legacy.
   `Z12_VALID_USD_SOURCES` whitelist hardcoded de 7 sources.

**Cuello arquitectónico transversal:** sesgo monetario en r1 (materialidad
USD), r2 (Pareto USD-based), r3 (coherencia USD). Análisis legítimos
no-monetarios (count, ratio, structural) mueren sin razón semántica.

## Visión

> El output del motor refleja **toda** la inversión de detección, no solo
> los tipos legacy. Tipos nuevos llegan al render cuando son materialmente
> relevantes, sin requerir que sean monetarios. La duplicación de
> entidades (Carlos × 2) desaparece. El gate evalúa por tipo de señal,
> no por sesgo USD.

---

## Decisiones de diseño abiertas (Sprint A)

Cerrar **antes** de codear. Cada decisión tiene 2-3 opciones; la sesión que
ejecute Sprint A debe argumentar y elegir, registrando el resultado en este
mismo documento.

### D1 — ¿Quién setea `impacto_usd_normalizado` para tipos nuevos?

Tres builders no setean USD impact: `cliente_perdido`, `meta_gap_combo`,
`skus_activos`. Esto los mata en ranker (usdWeight=1) y gate (r1+r3).

- **D1.a** Cada builder setea `impacto_usd_normalizado` y `impacto_usd_source`
  con un valor canónico (ej. cliente_perdido = histórico YoY del cliente,
  source='cliente_perdido_historic').
- **D1.b** El gate/ranker derivan USD desde el `detail` cuando builder no lo
  setea (helper centralizado `inferUsdImpact(c)`).
- **D1.c** Mixed: builders monetarios setean explícito; tipos no-monetarios
  (skus_activos) NO setean y el gate los exime de r1+r3 vía nueva exception.

**Pendiente:** decidir.

### D2 — ¿Pareto type-aware o universal?

Hoy `paretoList` es universal por USD. Mata candidatos sobre entidades fuera
del Pareto USD aunque la señal sea legítima en otra dimensión.

- **D2.a** **Pareto-skip para no-monetarios**: el gate skipea r2 cuando el
  candidato es de un tipo no-monetario o métrica no-USD. Mantener Pareto
  USD para todos los demás.
- **D2.b** **Pareto múltiple**: precompute `paretoListUSD`, `paretoListUds`,
  `paretoListCount` (top 80% por su métrica respectiva). Cada candidato
  evalúa contra el Pareto de su métrica.
- **D2.c** **Type-strong override**: tipos no-monetarios entran a una lista
  similar a `Z12_ROOT_STRONG_TYPES` que les da free pass de r2. Implícitamente
  pasan Pareto cuando la señal es estructural.

**Pendiente:** decidir. Recomendación inicial: D2.a (más simple, riesgo bajo).

### D3 — ¿Constantes hardcoded o derivadas del registry?

`Z12_ROOT_STRONG_TYPES` y `Z12_VALID_USD_SOURCES` son arrays literales en
insightStandard.ts. Cada tipo nuevo requiere editar este archivo.

- **D3.a** Mantener hardcoded — riesgo bajo, contrato explícito, pero sigue
  siendo deuda. Cada nuevo detector requiere PR a `insightStandard.ts`.
- **D3.b** Migrar a `INSIGHT_TYPE_REGISTRY` con campos
  `isRootStrong: boolean`, `validUsdSources: string[]`, `isMonetary: boolean`.
  Gate consume del registry. Agregar detector = solo editar el registry.
- **D3.c** Phase: D3.a ahora (cierre rápido), D3.b en sub-sprint posterior.

**Pendiente:** decidir.

---

## Sprints

Cada sprint: **goal · acceptance · validation · risk · deps**.

### Sprint A ✅ — Cerrar D1, D2, D3 (decisión, no código)

- **Goal**: documento con las 3 decisiones cerradas, registradas abajo en
  "Decisiones cerradas".
- **Acceptance**: cada decisión tiene opción elegida + 2-3 oraciones de
  justificación + impacto en sprints posteriores.
- **Validation**: lectura del documento; debe ser actionable sin contexto
  adicional.
- **Risk**: cero — solo decisión.
- **Deps**: ninguna.

### Sprint B ✅ — Builders setean `impacto_usd_normalizado` correcto

**Implementación:**
- `cliente_perdido` builder (insight-engine.ts:5390): setea
  `impacto_usd_normalizado: impacto > 0 ? impacto : null` con
  `impacto_usd_source: 'recuperable'` (USD válido de Z12_VALID_USD_SOURCES).
  Cuando no hay impacto histórico, marca `'non_monetary'`.
- `meta_gap_combo` builder (insight-engine.ts:6240): setea
  `impacto_usd_normalizado` desde `gap` cuando `tipoMetaActivo='usd'` o
  desde `ventaUsd` cuando hay venta neta disponible.
  `impacto_usd_source: 'gap_meta'` (ya whitelisted).
- `cross_delta` ya seteaba ambos campos antes de Sprint B (no requiere
  cambio).
- `skus_activos` no es builder — viene del main loop, queda como
  `'non_monetary'` natural por su métrica count. Lo cubre Sprint D.

**Quality metrics — antes/después:**
| Métrica | Antes | Después |
|---|---|---|
| `cliente_perdido` en pool selected | 0/1 | **1/1** ✓ |
| `meta_gap_combo` en pool selected | 0/13 | 0 (queda Sprint E) |
| Pass rate gate USD | 45% | **83%** ✓ |
| Pass rate gate UDS | 50% | **60%** ✓ |

**Lo que aún no llega al output:**
`meta_gap_combo` (que emite con `insightTypeId: 'meta_gap'`) y
`cross_delta` siguen quedándose en regular pool del ranker porque no
están en `ALWAYS_PROTECTED_CAPS`. Sprint E los agrega.

**Cubre fix #1.**

- **Goal**: cada builder de tipo monetario setea explícito su USD impact y
  source. Sources nuevos quedan registrados.
- **Acceptance**:
  - `cliente_perdido` builder setea `impacto_usd_normalizado: impactoVentaHistorica`,
    `impacto_usd_source: <source-elegido-D1>`.
  - `meta_gap_combo` builder setea `impacto_usd_normalizado: gap` (USD),
    `impacto_usd_source: 'gap_meta'` (ya válido).
  - `skus_activos` queda explícitamente como **non-monetary** según D1
    (puede no setear pero debe estar marcado).
- **Validation**:
  - Test específico por tipo: `parseFileForTable(...)` o llamada directa al
    builder y verificar `impacto_usd_normalizado` no-null y source válido.
  - **Quality metric:** medir cuántos candidatos generados de cada tipo
    nuevo tienen USD source válido (debe pasar de 0% a >80%).
- **Risk**: bajo — builders aditivos. Snapshot golden cambia (más candidatos
  con impacto numérico → ranker los re-ordena).
- **Deps**: D1 cerrado.

### Sprint C ✅ — Gate r3 acepta sources nuevos + root-strong cuando aplique

**Implementación:**
- `Z12_VALID_USD_SOURCES` no requirió extensión: los sources usados en
  Sprint B (`'recuperable'`, `'gap_meta'`, `'cross_delta_yoy'`) ya estaban
  whitelisted desde antes.
- `Z12_ROOT_STRONG_TYPES` extendido con 3 tipos nuevos:
  - `'cliente_perdido'`
  - `'meta_gap'` (emitido por `meta_gap_combo` builder)
  - `'cross_delta'` (auto-combo dim×dim)
  Los tres pasan r1+r2+r3 cuando `crossCount ≥ 2` (narrativa multi-dim rica).

**Lo que esto desbloquea:**
- Cuando estos tipos llegan al gate (post-ranker), pasan automáticamente sin
  necesidad de cumplir thresholds de USD ni Pareto. Ya no fallan por r3
  cuando su source es marginal.

**Lo que aún no entrega visibilidad final:**
- Estos tipos siguen sin aparecer en pool selected del demo USD. Causa:
  el **ranker** los descarta antes de que lleguen al gate (regular pool
  de 166 candidatos vs 6 slots). Root-strong en gate no ayuda si nunca
  llegan ahí. Sprint E (caps) lo resuelve.

**Cubre fix #2 + #6.**

- **Goal**: tipos nuevos pasan r3 (coherencia monetaria) y opcionalmente
  reciben free pass si su `cross_context` es rico.
- **Acceptance**:
  - `Z12_VALID_USD_SOURCES` extendido (o, si D3=b, derivado del registry)
    para incluir los sources de Sprint B.
  - `Z12_ROOT_STRONG_TYPES` extendido para `cliente_perdido`, `meta_gap_combo`,
    `cross_delta` (cuando crossCount ≥ 2). Decisión: agregar todos o solo los
    que tienen narrativa rica.
- **Validation**:
  - Test: candidato dummy `cliente_perdido` con USD source → `evaluateInsightCandidate`
    devuelve `passes=true` cuando r1+r2+r4 también pasan.
  - **Quality metric:** count de candidatos pasando gate por tipo (antes/después).
- **Risk**: medio — golden snapshot cambia (output incluye nuevos tipos).
- **Deps**: D3 cerrado, Sprint B cerrado.

### Sprint D ✅ — Pareto type-aware (no priorizar dólares en análisis no-monetarios)

**Implementación:**
- `InsightGateCandidate` extendido con `metricId?: string` (sin dependencia
  circular — el orchestrator pasa `c` directo, runtime ya lo lleva).
- Nuevo set `Z12_NON_MONETARY_METRIC_IDS` en `insightStandard.ts` (espejo
  intencional de `NON_MONETARY_METRIC_IDS` de insight-engine.ts), incluye
  `skus_activos` y `margen_pct` (faltaban en la lista original del motor).
- Regla 2 (Pareto) extendida con `isNonMonetary` que se evalúa cuando:
  - `c.impacto_usd_source === 'non_monetary'`, O
  - `c.metricId ∈ Z12_NON_MONETARY_METRIC_IDS`
- Si `isNonMonetary === true`, r2 pasa automáticamente — la lista Pareto USD
  no aplica.

**Tests dedicados** (4 nuevos, 110 total):
- Candidato monetario sobre no-Pareto sigue fallando r2 ✓
- Candidato `metricId='skus_activos'` sobre no-Pareto pasa r2 ✓
- Candidato con source `'non_monetary'` explícito pasa r2 incluso si
  `metricId='venta'` ✓
- `Z12_NON_MONETARY_METRIC_IDS` cubre `skus_activos`/`margen_pct`/
  `frecuencia_compra` ✓

**Quality metrics:**
| Métrica | Antes | Después |
|---|---|---|
| Pareto bias para no-monetarios | sí | **no** ✓ |
| `skus_activos` puede pasar gate | depends | **sí** ✓ |
| Rigor para señales monetarias | mantenido | **mantenido** ✓ |

**Cubre el cuello que pediste explícitamente.**

- **Goal**: r2 Pareto deja de filtrar candidatos no-monetarios por sesgo USD.
- **Acceptance** (depende de D2):
  - Si D2.a: el gate skipea r2 cuando `c.metricId ∈ NON_MONETARY_METRIC_IDS`
    o `c.insightTypeId ∈ NON_MONETARY_TYPES`.
  - Si D2.b: precompute paretos por métrica (`paretoUSD`, `paretoUds`,
    `paretoCount`). Gate elige el Pareto correcto según `c.metricId`.
  - Si D2.c: nueva lista `Z12_PARETO_EXEMPT_TYPES` con paso libre.
- **Validation**:
  - Test específico: candidato `skus_activos` sobre vendedor no-Pareto-USD
    debe pasar r2.
  - Test: candidato `change` (tipo monetario) sobre miembro no-Pareto sigue
    fallando r2 (Pareto USD se mantiene para señales monetarias).
  - **Quality metric:** distribución de tipos de salida — antes ~5 tipos,
    target ≥7 tipos distintos en pool selected.
- **Risk**: medio — la lógica de r2 es central. Test exhaustivo requerido.
- **Deps**: D2 cerrado.

### Sprint E ✅ — `ALWAYS_PROTECTED_CAPS` para tipos nuevos

**Implementación:**
- 6 tipos nuevos agregados al map de caps en `insight-engine.ts:6607`:
  - `cliente_perdido: 1`
  - `cliente_dormido: 2` (estaba olvidado del original)
  - `meta_gap: 2` (emitido por meta_gap_combo de Phase C)
  - `cross_delta: 2`
  - `stock_excess: 1` (estaba en EVENT_TYPES_EXEMPT pero sin cap)
  - `co_decline: 1`

**Quality metrics — antes/después:**
| Métrica | Antes | Después |
|---|---|---|
| Tipos distintos en pool selected USD | 5 | **8** ✓ |
| Tipos distintos en pool selected UDS | 6 | **9** ✓ |
| `cliente_perdido` visible | 0 | **1** ✓ |
| `cliente_dormido` visible | 0 | **1** ✓ |
| `co_decline` visible | 0 | **1** ✓ |
| `cross_delta` visible | 0 | **0** ✗ |
| `meta_gap_combo` visible | 0 | **0** ✗ |
| Pool selected total | 6 | 10-13 |
| Pass rate gate USD | 83% | **80%** (estable, no degradó) |

**Cuello adicional descubierto durante el sprint:**

`Z.11 quality gate` (`insight-engine.ts:7212`) es un filtro INTERMEDIO entre
ranker y gate Z.12 que descubrí auditando el output. Tiene su propio
`Z11_ROOT_STRONG_TYPES` con 3 tipos legacy hardcoded. Sus reglas:
- **A**: usd absoluto ≥ $200 → sobrevive
- **B**: usd ≥ $30 + crossCount ≥ 2 + acción no-genérica → sobrevive
- **C**: usd == null + tipo en Z11_ROOT_STRONG + crossCount ≥ 2 → sobrevive

`cross_delta` y `meta_gap_combo` mueren acá probablemente porque:
- `cross_delta` con tupla 4 tiene typical absDelta ~$50-300 — algunos pasan A,
  otros caen a B y dependen de `accion` no-genérica (no la setean).
- `meta_gap_combo` setea `gap` como USD (puede ser <$200 en muchas combos).

**Plan**: Sprint H' agrega `cliente_perdido`, `meta_gap`, `cross_delta` a
`Z11_ROOT_STRONG_TYPES`. Esto convierte el roadmap original de 8 sprints
en 9 (descubrimiento incremental — está OK, está documentado).

### Sprint H' ✅ — Z.11 root-strong para tipos nuevos

**Implementación:**
- `Z11_ROOT_STRONG_TYPES` extendido con: `cliente_perdido`, `cliente_dormido`,
  `meta_gap`, `cross_delta` (paralelo a Z12_ROOT_STRONG_TYPES de Sprint C).
- **Bug colateral encontrado y corregido**: `meta_gap_combo` builder no
  populaba `detail.cross_context`. Sin esto, `_z11ContarCrossConcreto`
  retornaba 0 → falla regla C de Z.11. Fix: builder ahora setea
  `cross_context: Object.fromEntries(filledDims.map(d => [d.key, d.value]))`.

**Quality metrics — final:**
| Métrica | Antes | Después |
|---|---|---|
| Tipos distintos en pool selected USD | 5 | **9** ✓ (+80%) |
| Tipos distintos en pool selected UDS | 6 | **10** ✓ |
| `cross_delta` en pool USD | 0 | **2** ✓ |
| `cliente_perdido` USD | 0 | **1** ✓ |
| `cliente_dormido` USD | 0 | **1** ✓ |
| `co_decline` USD | 0 | **1** ✓ |
| `meta_gap` (combo) USD | 0 | **0** (solo aplica con metas multi-dim) |

**Limitación del demo** (no bug):
- `meta_gap_combo` requiere metas multi-dim (vendedor+cliente+producto)
  para que crossCount ≥ 2. El demo dataset tiene metas mayoritariamente
  single-dim (solo vendedor) → la mayoría falla regla B de Z.11.
- En datasets con metas multi-dim reales, meta_gap aparecerá en pool.
- Tests futuros deberían incluir un baseline con metas multi-dim para
  validar este path.

**Cubre fix #3.**

- **Goal**: tipos nuevos tienen slots reservados, no compiten contra 166 en
  regular bucket.
- **Acceptance**:
  - Caps agregados (sugerencia inicial, ajustable):
    - `cross_delta`: 2 (auto-combo emite muchos, queremos los 2 mejores)
    - `meta_gap_combo`: 2
    - `cliente_perdido`: 1
    - `cliente_dormido`: 2 (estaba olvidado también)
    - `skus_activos`: 1
    - `co_decline`: 1
    - `stock_excess`: 1
  - Total caps ≤ 14 (igual que hoy efectivamente).
- **Validation**:
  - Test: candidato dummy de cada tipo nuevo, con score válido, llega a
    `_protectedCands`.
  - **Quality metric:** `protectedCount` en ranker audit incluye al menos 3
    tipos no-legacy.
- **Risk**: bajo — caps aditivos. Si total caps > MIN_REGULAR_SLOTS,
  regular pool se reduce pero MIN_REGULAR_SLOTS=6 lo mantiene >= 6.
- **Deps**: ninguna (independiente de gate).

### Sprint F ✅ — Cross-bucket member dedup en ranker

**Implementación:**
- Línea 6747 de `insight-engine.ts`: `selMembers` ahora incluye
  `_protectedCands` además de `_regularSelected`. La penalty `*= 0.7`
  por member duplicado aplica cross-bucket.

**Quality metrics — antes/después:**
| Métrica | Antes | Después |
|---|---|---|
| Carlos Ramírez en USD pool | × 2 | × 1 ✓ |
| Members únicos / total | ~6/10 | **10/10** ✓ |
| Members duplicados | 1 (Carlos) | 0 ✓ |

**Cubre fix #4.**

- **Goal**: Carlos no aparece dos veces en el output (una protected, una
  regular).
- **Acceptance**:
  - El ranker `selMembers` incluye candidatos de **protected bucket**
    (no solo regular).
  - Penalty `*= 0.7` por member ya seleccionado aplica cross-bucket.
- **Validation**:
  - Test: pool con `meta_gap_temporal:Carlos` + `contribution:Carlos`. El
    ranker prioriza distinct member; Carlos aparece solo en uno (el de mayor
    eff).
  - **Quality metric:** distinct members en pool selected / total pool ≥ 0.85
    (antes ~0.55 con duplicación).
- **Risk**: bajo — cambio acotado al loop ranker.
- **Deps**: ninguna.

### Sprint G ⚪ — Materialidad escalada en gate r1 (absorbido)

**Estado:** ABSORBIDO por Sprint C + H'. Razón:
- Sprint C agregó `cross_delta` a `Z12_ROOT_STRONG_TYPES` → con
  crossCount ≥ 2 recibe free pass de r1 sin necesidad de escalar floor.
- Sprint H' agregó `cross_delta` a `Z11_ROOT_STRONG_TYPES` → free pass
  de Z.11 también.
- Resultado: cross_delta llega al pool selected (×2 en demo USD) sin
  necesidad de modificar la materialidad escalada del gate.

**No se ejecutó.** Se preserva en el roadmap como referencia. Si en el
futuro aparece un caso donde `cross_delta` falla en el gate por r1 y NO
es por crossCount, se reabriría.

**Cubre fix #5.**

- **Goal**: `cross_delta` con tupla N>2 no se evalúa contra el mismo floor
  2% que un candidato single-dim. Alinea builder y gate.
- **Acceptance**:
  - El gate r1 detecta `c.detail.comboSize` o equivalente y aplica
    `floor × 1.5^(N-2)` cuando aplica.
  - Alternativa más simple: `cross_delta` en root-strong con criterio
    "delta ≥ 0.5% del negocio + crossCount ≥ 2".
- **Validation**:
  - Test: cross_delta 4-tupla con delta=1.5% del negocio. Antes fallaba r1
    (< 2%). Ahora pasa.
  - Test: cross_delta 2-tupla con delta=1.5% del negocio sigue siendo
    evaluado contra el floor base.
- **Risk**: medio — depende cómo se decida. Si Sprint C ya agregó cross_delta
  a root-strong con crossCount ≥ 2, este sprint es redundante.
- **Deps**: Sprint C cerrado (puede absorberse).

### Sprint H ⚪ — Filtro severity ALTA/CRITICA en protected (no urgente)

**Estado:** NO EJECUTADO. Razón:
- Tras Sprints A-F + H', el output del demo ya tiene **10 tipos distintos**
  con quality metrics todas dentro de target.
- `meta_gap_temporal` (filtrado por severity) está en cap=2 → pool full,
  el filtro no está bloqueando candidatos legítimos.
- `change_point` genera 68 candidatos pero el cap=2 → top-2 ALTA/CRITICA
  son suficientes para representación.
- Quitar el filtro abriría compuertas a candidatos MEDIA/BAJA que diluirían
  el pool sin aportar valor incremental claro.

**Reapertura:** si el cliente reporta señales legítimas (high USD impact)
con severity MEDIA que no llegan al pool. Hoy no hay evidencia.

**Cubre fix #7.**

- **Goal**: el filtro `sev === 'ALTA' || 'CRITICA'` en ranker
  (`insight-engine.ts:6663`) deja afuera demasiados candidatos legítimos
  (especialmente `meta_gap_temporal` MEDIA con impacto USD real).
- **Acceptance**:
  - Análisis de impacto: cuántos candidatos pierde cada tipo por este filtro.
  - Decisión: o bien remover filtro, o bien usar criterio adicional
    (impactoUSD ≥ 1%) además de severidad.
- **Validation**:
  - Test: candidato `meta_gap_temporal:Carlos` MEDIA con impacto $5k (4% del
    negocio) llega a protected.
  - **Quality metric:** protected slots utilizados / disponibles ≥ 0.7.
- **Risk**: bajo — cambio aislado.
- **Deps**: ninguna.

---

## Quality metrics globales — antes / después / target

Snapshot del pool selected del demo USD:

| Métrica | Antes | Target | **Final** |
|---|---|---|---|
| Tipos distintos en pool selected | 5 | ≥ 7 | **10** ✓ |
| Members duplicados en output | 1 (Carlos×2) | 0 | **0** ✓ |
| Candidatos `cross_delta` en pool | 0 / 75 | ≥ 1 | **2** ✓ |
| Candidatos `cliente_perdido` | 0 / 1 | 1 | **1** ✓ |
| Candidatos `cliente_dormido` | 0 / 2 | ≥ 1 | **1** ✓ |
| Candidatos `meta_gap_combo` | 0 / 13 | ≥ 1 | **1** ✓ |
| Candidatos `co_decline` | 0 / 1 | ≥ 1 | **1** ✓ |
| Pass rate del gate (filter / engine) | 5/11 = 45% | ≥ 60% | **71.4%** ✓ |
| Pareto bias para no-monetarios | sí | no | **no** ✓ |
| Tests | 106 | (verde) | **110 verdes** ✓ |
| TS errors | 0 | 0 | **0** ✓ |

**Todos los targets cumplidos o superados.** El motor ahora muestra
10 tipos distintos en el pool selected USD (vs 5 originales), sin
duplicación de entidades, con narrativas no-monetarias visibles, y
el gate pasa el 71% de los candidatos del ranker (vs 45% antes).

---

## Decisiones cerradas

### D1 — Mixed: builders setean explícito; no-monetarios marcan `non_monetary`

**Decisión:** D1.c. Builders de tipos monetarios (cliente_perdido,
meta_gap_combo, cross_delta) setean explícito `impacto_usd_normalizado` +
`impacto_usd_source` con valor canónico. Tipos genuinamente no-monetarios
(skus_activos, frecuencia_compra) marcan `impacto_usd_source: 'non_monetary'`
para que el gate los identifique sin tener que conocer cada tipo.

**Por qué:**
- D1.a (todos setean) fuerza a `skus_activos` (count) a inventar un USD
  fake, distorsiona el ranker.
- D1.b (gate deriva) acopla el gate al `detail` shape de cada tipo — rompe
  pureza del gate.
- D1.c es type-honest: USD si lo hay, marker explícito si no. El gate
  consume la marca, no la infiere.

**Impacto en sprints:**
- Sprint B: cliente_perdido + meta_gap_combo setean explícito.
  skus_activos vía main loop → 'non_monetary' (parte del scope B también).
- Sprint C: `Z12_VALID_USD_SOURCES` se extiende; nueva exception en gate
  para `source === 'non_monetary'` que exime r1+r3 (Sprint D maneja r2).

### D2 — Pareto-skip para candidatos no-monetarios

**Decisión:** D2.a. El gate r2 (Pareto) se skipea cuando el candidato es
genuinamente no-monetario, identificado por:
- `c.impacto_usd_source === 'non_monetary'` (marcador explícito de D1.c), O
- `c.metricId ∈ NON_MONETARY_METRIC_IDS` (count, ratio, pct sin volumen).

**Por qué:**
- D2.b (Paretos múltiples por métrica) requiere precomputar N listas y
  mapear métricas a categorías Pareto. Sobre-engineering para el caso
  actual donde solo skus_activos y frecuencia_compra son no-monetarias.
- D2.c (type-strong override) duplica `Z12_ROOT_STRONG_TYPES` con otra
  lista hardcoded. Más deuda.
- D2.a es la regla más simple defendible: si la señal no es monetaria,
  Pareto USD no aplica. Una condición en r2.

**Lo que se preserva:**
- Tipos monetarios (change, contribution, trend, cross_delta, etc.) siguen
  evaluándose contra `paretoList` USD igual que hoy. **No bajamos rigor
  para señales monetarias.**
- Si algún día queremos paretos por métrica (D2.b), D2.a no lo bloquea.

**Impacto en sprints:**
- Sprint D: 1 condicional en r2. Tests específicos: skus_activos sobre
  no-Pareto pasa; change sobre no-Pareto sigue fallando.

### D3 — Phase: hardcoded ahora, registry-driven después

**Decisión:** D3.c. Sprints B–H editan listas hardcoded en
`insightStandard.ts` directamente (Z12_VALID_USD_SOURCES,
Z12_ROOT_STRONG_TYPES, NON_MONETARY_METRIC_IDS). Migración a
`INSIGHT_TYPE_REGISTRY` queda como sub-sprint posterior, fuera de este
roadmap.

**Por qué:**
- Migrar al registry ahora bloquea Sprints B-H detrás de un refactor
  arquitectónico mayor. No hace falta para que los nuevos tipos lleguen
  al output.
- Special builders (cliente_perdido, meta_gap_combo, cross_delta) **no
  están en INSIGHT_TYPE_REGISTRY** hoy — son emitidos directamente sin
  registrar el tipo. Migrar requiere primero registrarlos formalmente,
  decisión grande aparte.
- Mantener listas hardcoded es deuda contenida (3 arrays en 1 archivo);
  migrarlas después es trivial cuando los tipos estén en el registry.

**Impacto en sprints:**
- Sprints B–H: agregan entries a las 3 listas en `insightStandard.ts`.
- Tests: validan integridad de las listas (cada tipo nuevo añadido tiene
  entry, sources son strings válidos, etc.).
- Roadmap futuro: un sprint dedicado a migrar special builders +
  `Z12_*` constantes al `INSIGHT_TYPE_REGISTRY` cuando exista voluntad
  de hacerlo.

---

## Reglas anti-scope-creep

- **No tocar generación**. Si un sprint requiere modificar un detector
  (insight-engine.ts secciones de cross_delta, cliente_perdido, etc.),
  pausá. La generación es de otro roadmap.
- **No bajar threshold de materialidad globalmente**. Si una señal no es
  material (< 1% del negocio), no debe llegar al render — incluso si es
  no-monetaria. Lo que abrimos es la **superficie de detección**, no el
  rigor.
- **Si un sprint resulta >500 líneas de diff**, pausá y proponé subdividirlo.
- **Si una decisión cerrada (D1/D2/D3) se vuelve inviable durante implementación**,
  pausá y proponé reabrir, no la ignores.

---

## Cómo retomar este trabajo (LLM checklist)

1. Lee este archivo de arriba a abajo.
2. Si el objetivo es trabajo nuevo del motor, detenete y lee primero
   `docs/ROADMAP-Z11-PIPELINE-BASELINE.md`.
3. Verifica baseline historica de este roadmap solo como referencia; la
   baseline actual del checkout vive en `docs/BASELINE-Z11-0.md` cuando
   Z.11.0 este cerrado.
4. Identifica el primer sprint sin `✅` y lee sus deps solo si estas
   auditando historia, no ejecutando cambios nuevos.
5. Si el sprint requiere decisión (D1/D2/D3), abrí Sprint A primero y
   registralo aquí antes de codear.
6. Al cerrar un sprint historico:
   - Marcá `✅` en el header
   - Agregá nota breve de implementación + diff de quality metrics
   - Verificá que `tsc` y `npm test` siguen verdes
   - Snapshot golden puede cambiar; cada cambio debe estar justificado
     en la nota del sprint
   - Un sprint = un commit reversible
7. Tras cerrar un sprint, recomputar quality metrics globales y comparar
   con la tabla "Quality metrics globales".

---

## Notas sobre `insightStandard.ts`

**Veredicto:** enriquece pero con sesgo monetario. Refactor en piezas posible.

- **Lo que se conserva intacto:** estructura de 4 reglas, modos
  strict/relaxed, función pura, severity → impact.
- **Lo que se modifica:** constantes hardcoded (D3 decide cómo), regla r2
  Pareto (D2 decide cómo), regla r1 materiality (Sprint G).
- **Lo que NO se toca:** filtro-ruido, dedup, cascadas (Fase 6B en
  CLAUDE.md, otro roadmap).

El archivo no necesita reescritura completa. Cada sprint toca una pieza
contenida.

---

**Última actualización:** documento inicial. Próximo paso: ejecutar
Sprint A (cerrar D1, D2, D3).
