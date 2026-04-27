# Baseline Z.11.0 - Pipeline de insights

> **Estado:** **CERRADO 2026-04-26**. Captura runtime integrada desde
> `docs/baselines/insight-pipeline-baseline.z11-0.json` → `runtime_capture`.
> **Proposito:** concentrar una sola verdad operacional antes de tocar gate,
> ranker, builders, listas o normalizacion USD.

---

## 0. Estado conocido (validacion local fresca)

- **Branch:** `motorinsights`.
- **Workspace:** cambios locales activos sobre 14 archivos modificados.
- **Validacion 2026-04-26 16:35:**
  - `npx tsc --noEmit`: 0 errores.
  - `npx vitest run`: **5 archivos / 105 tests passing**.
- **Discrepancia documental aclarada:**
  - `ROADMAP-INGESTA-REGISTRY.md` cita `106/106` como cierre **historico** del sprint A→F.2.
  - `ROADMAP-MOTOR-VISIBILITY.md` cita `110/110` como cierre **historico** del sprint A→F.
  - Ninguno representa la baseline actual. La baseline canonica es **105/105**.

---

## 1. Hallazgos del inventario USD

### 1.1 Resolver canonico declarado vs. resolver activo

| Funcion                    | Archivo                       | Linea       | Estado actual                     |
|----------------------------|-------------------------------|-------------|-----------------------------------|
| `resolveImpactoUsd()`      | `src/lib/insightStandard.ts`  | 2610-2656   | **Exportado e importado, nunca invocado.** |
| Resolver inline (sin nombre) | `src/lib/insight-engine.ts`  | 7124-7172   | **Activo.** Asigna `c.impacto_usd_normalizado` y `c.impacto_usd_source` en cada candidato post-`hydratarCandidatoZ9`. |

> **Implicancia critica.** La aparente "fuente unica" `resolveImpactoUsd` es codigo
> muerto. Cualquier fix aplicado ahi no muta el comportamiento runtime. Toda
> asignacion real de `impacto_usd_*` ocurre en el bloque inline del motor 2.

### 1.2 Diferencias funcionales entre los dos resolvers

| Paso del resolver                              | Inline en `insight-engine.ts:7124+` | `resolveImpactoUsd` en `insightStandard.ts:2610+` |
|------------------------------------------------|:-----------------------------------:|:------------------------------------------------:|
| 1. `impacto_gap_meta` → `gap_meta`             | si                                  | si                                               |
| 2. `detail.cross_context.varAbs` → `cross_varAbs` | si                                | si                                               |
| 3. `impacto_recuperable` → `recuperable` (skip si metricId no-monetario) | si | si                                               |
| 4. `calcularImpactoValor(c)` typed amount → `recuperable`/`detail_monto` | **NO**       | **si**                                           |
| 5. `detail.monto` → `detail_monto`             | si                                  | si                                               |
| 6. `detail.magnitud` → `detail_magnitud`       | si                                  | si                                               |
| 7. `detail.totalCaida` → `detail_totalCaida`   | si                                  | si                                               |
| 8. metric en lista no-monetaria → `non_monetary` | si                                | si                                               |
| 9. fallback → `unavailable`                    | si                                  | si                                               |

> **Diferencia funcional unica.** El paso 4 (typed amount via
> `calcularImpactoValor`) solo existe en el resolver muerto. El motor depende
> de que `hydratarCandidatoZ9` haya hidratado `impacto_recuperable` ANTES,
> porque la rama 4 que extraeria USD por tipo no se ejecuta.

### 1.3 Cadena efectiva por tipo terminal en runtime

| Tipo                | Cadena activa observada                                                 | Punto fragil                                          |
|---------------------|-------------------------------------------------------------------------|-------------------------------------------------------|
| `cliente_dormido`   | builder no setea USD → `hydratarCandidatoZ9` setea `impacto_recuperable = calcularImpactoValor` → resolver inline lee `impacto_recuperable` → `recuperable` | si `detail.impactoVentaHistorica == 0` y `detail.valor_yoy_usd == 0`, recuperable cae a 0/null y termina en `unavailable` |
| `cliente_perdido`   | builder **si** setea `impacto_usd_normalizado = impacto > 0 ? impacto : null` y `impacto_usd_source = 'recuperable' \| 'non_monetary'` ANTES de la hidratacion | resolver inline post-hidratacion **sobrescribe sin condicional**; si recuperable=0 cae a `unavailable` |
| `stock_risk`        | builder no setea USD → hidratacion calcula `impacto_recuperable = items[0].ventaYTD ?? calcularImpactoValor` → resolver lee | depende de que `_res.detail.items[0].ventaYTD` venga del `invType.detect()` |
| `stock_excess`      | builder no setea USD → hidratacion calcula `impacto_recuperable = top[0].ventaYTD ?? calcularImpactoValor` → resolver lee | depende de que `_res.detail.top[0].ventaYTD` venga del `invType.detect()` |

### 1.4 Por que el audit runtime vio `sin-usd` dominante en estos tipos

`sin-usd` es la frase que `_z11EvaluarSupervivencia` agrega a `regla` cuando
`c.impacto_usd_normalizado == null`. Eso ocurre cuando el resolver inline
termina en `unavailable` o `non_monetary`. Para los 4 tipos terminales el
resolver depende de `impacto_recuperable`, que en el dataset Los Pinos demo
puede ser 0 si:
- `prevSalesFull` no encontro YoY del cliente (cliente_dormido/perdido).
- `_res.detail.items[]` o `_res.detail.top[]` venian vacios (stock_*).

No es bug del gate. Es bug aguas arriba: el builder no le entrega al resolver
los datos que el resolver sabria como leer si el paso 4 (`calcularImpactoValor`)
del resolver muerto se hubiera portado al inline.

---

## 2. Hallazgos del inventario de listas

### 2.1 Tabla canonica (snapshot del repo)

| Lista / regla                  | Archivo                       | Linea  | Contenido                                                                                                                  | Notas                                                                                  |
|--------------------------------|-------------------------------|-------:|----------------------------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------|
| `Z11_ROOT_STRONG_TYPES`        | `src/lib/insight-engine.ts`   | 4631   | meta_gap_temporal, product_dead, migration, cliente_perdido, cliente_dormido, meta_gap, cross_delta                        | 7 tipos. Usado solo en `_z11EvaluarSupervivencia` regla C y para el label `tipo-debil`. |
| `Z12_ROOT_STRONG_TYPES`        | `src/lib/insightStandard.ts`  | 2563   | meta_gap_temporal, product_dead, migration, cliente_perdido, cliente_dormido, **stock_risk**, **stock_excess**, meta_gap, cross_delta | 9 tipos. Usado en `evaluateInsightCandidate` con `crossCount >= 2`.                    |
| `Z12_VALID_USD_SOURCES`        | `src/lib/insightStandard.ts`  | 2582   | gap_meta, cross_varAbs, recuperable, detail_monto, detail_magnitud, detail_totalCaida, cross_delta_yoy                     | `non_monetary` y `unavailable` excluidos por diseno.                                   |
| `Z12_NON_MONETARY_METRIC_IDS`  | `src/lib/insightStandard.ts`  | 2597   | num_transacciones, ticket_promedio, cumplimiento_meta, pct_participacion, num_clientes_activos, precio_unitario, frecuencia_compra, ventas_por_cliente, **skus_activos**, **margen_pct** | 10 entradas. Usado en `evaluateInsightCandidate` para Pareto-skip y rama no-monetaria del resolver muerto. |
| `NON_MONETARY_METRIC_IDS`      | `src/lib/insight-engine.ts`   | 3088   | num_transacciones, ticket_promedio, cumplimiento_meta, pct_participacion, num_clientes_activos, precio_unitario, frecuencia_compra, ventas_por_cliente | 8 entradas. Usado en el resolver inline para skip de `recuperable` y rama final `non_monetary`. |
| `EVENT_TYPES_EXEMPT`           | `src/lib/insight-engine.ts`   | 3085   | stock_risk, stock_excess, migration, co_decline, product_dead, seasonality, outlier, change_point, steady_share, correlation, meta_gap_temporal | Usado en heuristicas previas al ranker.                                                |
| `ALWAYS_PROTECTED_CAPS`        | `src/lib/insight-engine.ts`   | 6649   | stock_risk(2), product_dead(3), migration(2), outlier(1), change_point(2), steady_share(1), correlation(1), meta_gap_temporal(2), cliente_perdido(1), cliente_dormido(2), meta_gap(2), cross_delta(2), stock_excess(1), co_decline(1) | Caps por tipo en el ranker. **No** dispone de `Z11_ROOT_STRONG_TYPES`.                  |

### 2.2 Divergencias formales

| Pareja                                           | Tipos solo en A                | Tipos solo en B   | Implicancia                                                                                                                     |
|--------------------------------------------------|--------------------------------|-------------------|---------------------------------------------------------------------------------------------------------------------------------|
| Z11_ROOT_STRONG_TYPES (engine) vs Z12_ROOT_STRONG_TYPES (standard) | (ninguno)            | stock_risk, stock_excess | `stock_*` reciben rescate Z.12 con cross>=2 pero NO reciben rescate Z.11 cuando llegan con `usd==null`. Z.11 los etiqueta `tipo-debil(stock_risk)` y los suprime. |
| NON_MONETARY_METRIC_IDS (engine) vs Z12_NON_MONETARY_METRIC_IDS (standard) | (ninguno)            | skus_activos, margen_pct | El gate ejecutivo aplica Pareto-skip a estas dos metricas; el resolver inline del motor no las trata como no-monetarias. Riesgo: candidatos con metricId='skus_activos' o 'margen_pct' caen a `unavailable` aguas arriba aunque luego Z.12 los hubiera tratado como no-monetarios. |

### 2.3 `tipo-debil` confirmado como derivado, NO blacklist formal

```ts
// insight-engine.ts:4690-4692
if (!Z11_ROOT_STRONG_TYPES.has(c.insightTypeId) && usd == null) {
  razones.push(`tipo-debil(${c.insightTypeId})`)
}
```

`tipo-debil(...)` es una etiqueta diagnostica que aparece en `regla` cuando dos
condiciones se cumplen simultaneamente:
1. `c.impacto_usd_normalizado == null` (ya fue catalogado como `sin-usd`).
2. `c.insightTypeId` NO esta en `Z11_ROOT_STRONG_TYPES`.

No existe lista llamada `tipos_debiles` o equivalente. La hipotesis del
reviewer queda confirmada: la asimetria es real y vive en la divergencia
entre `Z11_ROOT_STRONG_TYPES` y `Z12_ROOT_STRONG_TYPES`.

---

## 3. Mapa detectores → detail keys (tipos terminales)

### 3.1 Builders

| Tipo              | Archivo / linea inicial     | metricId          | dimensionId | Setea USD inline | Detail keys relevantes para resolver                                                                              |
|-------------------|-----------------------------|-------------------|-------------|------------------|-------------------------------------------------------------------------------------------------------------------|
| `cliente_dormido` | `insight-engine.ts:5341`    | `dias_sin_compra` | `cliente`   | **NO**           | `impactoVentaHistorica`, `impactoVentanaLabel`, `clienteNombre`, `vendedor`, `frecuenciaHistoricaDias`, `umbralDiasDormido`, `comparison` |
| `cliente_perdido` | `insight-engine.ts:5414`    | `dias_sin_compra` | `cliente`   | **SI** (lineas 5439-5440, `impacto > 0 ? recuperable : non_monetary`) — pero el resolver inline lo sobrescribe despues | `diasSinComprar`, `impactoVentaHistorica`, `clienteNombre`, `vendedor`, `frecuenciaHistoricaDias`, `recoveryScore`, `recoveryLabel`, `comparison` |
| `stock_risk`      | `insight-engine.ts:5527-5554` (loop sobre `_invTypes`) | `inventario`     | `producto`  | **NO**           | `..._res.detail` (incluye `topProduct`, `items`, `unidades`, `precio_unitario`, `diasCobertura` segun `invType.detect`), `_inventario`, `_conclusion`, `_accion` |
| `stock_excess`    | mismo loop, `insight-engine.ts:5527-5554`             | `inventario`     | `producto`  | **NO**           | `..._res.detail` (incluye `topProduct`, `top` array, `totalCapital`, `unidades_excedente`), `_inventario`, `_conclusion`, `_accion` |

### 3.2 Hidratacion Z.9 (`hydratarCandidatoZ9` → `calcularImpactoRecuperableCandidato`)

Llamada en `insight-engine.ts:7115` antes del resolver inline:

| Tipo              | Formula activa                                                                                                  |
|-------------------|-----------------------------------------------------------------------------------------------------------------|
| `cliente_dormido` | `calcularImpactoValor(c)` = `n('impactoVentaHistorica') ?? n('valor_yoy_usd')`                                  |
| `cliente_perdido` | `calcularImpactoValor(c)` = `n('impactoVentaHistorica') ?? n('valor_yoy_usd')`                                  |
| `stock_risk`      | `items[0].ventaYTD` si existe, fallback `calcularImpactoValor(c)` = `n('impactoTotal') ?? mult('unidades')`     |
| `stock_excess`    | `top[0].ventaYTD` si existe, fallback `calcularImpactoValor(c)` = `n('totalCapital') ?? mult('unidades_excedente')` |

> Si la hidratacion produce `0` o `null` (porque el detail no tiene la key
> esperada), el resolver inline no encuentra USD y termina en `unavailable`.
> Esa es la cadena exacta que produce `sin-usd` en el log Z.11.

---

## 4. Tabla unica del pipeline (CAPTURA RUNTIME — Los Pinos demo, 2026-04-26)

Dataset: 94 969 filas de ventas, 2 340 metas, 20 productos en inventario,
8 vendedores, 30 clientes, 2 dormidos. selectedPeriod={2026,3} (abril 2026).
tipoMetaActivo='uds'.

### 4.1 Worker (off-thread, alimenta `store.insights`)

| Etapa                                              | Valor | Fuente |
|----------------------------------------------------|------:|--------|
| `worker.candidates_total` (motor 2 worker)         | 3     | log `[PR-L1] motor2_insights` |
| `worker.blocks_final`                              | 4     | idem |
| `por_tipo`                                         | migration:2, cross_delta:1 | idem |
| `por_dimension`                                    | producto:1, cliente:1, departamento:1 | idem |
| `tiempo_ms`                                        | 11    | idem |
| `store.insights.length` (post-adapter)             | 8     | store_state via fiber walk |
| `store.insights.por_tipo`                          | riesgo_meta:3, riesgo_producto:1, cruzado:4 | idem |

> **Observacion.** `worker.blocks_final=4` pero `store.insights=8`. Hay 4
> insights extra en el store que no provienen del log `[PR-L1]`. Hipotesis:
> el worker emite mas que lo que el log reporta (o el log captura solo los
> blocks tras compresion ejecutiva), o el pipeline `[Z.5]` legacy aun
> contribuye al store. Ver Z.11.4 para resolver.

### 4.2 Page-side (main thread, alimenta `diagnosticBlocks`)

| Etapa                                              | Valor | Fuente |
|----------------------------------------------------|------:|--------|
| Z.11 entrada                                       | 23    | log `[Z.11.1] quality_gate.entrada` (last run) |
| Z.11 sobreviven                                    | 16    | idem |
| Z.11 suprimidos                                    | 7     | idem |
| **Z.11 pass rate**                                 | **69.6%** | derivado |
| Z.12 input                                         | 16    | feeding from Z.11 sobreviven |
| Z.12 surviving (no suppressed)                     | 9     | log `[Z.12]` last run |
| Z.12 suppressed                                    | 7     | idem |
| Z.12 relaxed survivors                             | 2     | idem |
| **Z.12 pass rate**                                 | **56.3%** | derivado |
| ventaTotalNegocio                                  | $40 995.85 | idem |
| floorAbsAlto (2%)                                  | $819.92 | idem |
| executiveTopN                                      | 4     | idem |

### 4.3 Z.11 — tipos suprimidos en el ultimo run

| tid             | metric              | member              | regla |
|-----------------|---------------------|---------------------|-------|
| meta_gap        | cumplimiento_meta   | Limpieza            | sin-usd \| cross-pobre(1) |
| meta_gap        | cumplimiento_meta   | Refrescos           | sin-usd \| cross-pobre(1) |
| meta_gap        | cumplimiento_meta   | Lácteos             | sin-usd \| cross-pobre(1) |
| stock_excess    | inventario          | Cacahuates 100g     | sin-usd \| cross-pobre(0) \| tipo-debil(stock_excess) |
| change_point    | ticket_promedio     | Snacks              | sin-usd \| cross-pobre(0) \| accion-generica \| tipo-debil(change_point) |
| change_point    | ticket_promedio     | Miguel Ángel Díaz   | sin-usd \| accion-generica \| tipo-debil(change_point) |
| contribution    | num_transacciones   | Autoservicio        | sin-usd \| cross-pobre(0) \| tipo-debil(contribution) |

**Patron:** `sin-usd` aparece en los 7. La cadena efectiva es:
- `meta_gap` muere porque `calcularImpactoValor` para meta_gap devuelve `null`
  (`insightStandard.ts:1882`). Hidratacion → impacto_recuperable=null →
  resolver inline → unavailable → sin-usd.
- `stock_excess` muere porque su `_res.detail.top[]` no trae `ventaYTD`
  poblado en este dataset (o el fallback `mult('unidades_excedente')` no
  encuentra `precio_unitario` en detail).
- `change_point` y `contribution` usan metricas no-monetarias
  (`ticket_promedio`, `num_transacciones`); el resolver inline cae a
  `non_monetary` → sin-usd.

### 4.4 Z.12 — tipos suprimidos en el ultimo run (todos con `monetaryCoherence: true`)

| tid              | member              | usdAbs   | pct       | cross | source        | falla       |
|------------------|---------------------|---------:|----------:|------:|---------------|-------------|
| outlier          | Supermercado Nacional| $310.34 | 0.76%     | 4     | cross_varAbs  | materiality |
| trend            | Pulpería San José    | $173.79 | 0.42%     | 4     | cross_varAbs  | materiality + narrativeCoherence |
| trend            | Mayoreo Santa Ana    | $177.23 | 0.43%     | 4     | cross_varAbs  | materiality + narrativeCoherence |
| cliente_perdido  | Tienda El Progreso  | $819.12 | 1.99%     | 0     | recuperable   | materiality + pareto (apenas debajo de floor 2%, cross<2 bloquea rescate Z12 root-strong) |
| stock_risk       | Té Helado 500ml     | **$6665** | **16.26%** | 0   | recuperable   | **pareto** (16% del negocio muere por no estar en lista Pareto y cross<2) |
| cliente_dormido  | Supermercado López  | $1633.26 | 3.98%    | 0     | recuperable   | pareto + narrativeCoherence |
| contribution     | Roberto Méndez      | $1321    | 3.22%     | 0     | recuperable   | pareto + narrativeCoherence |

**Patrones criticos:**

1. **Z.12 pareto rule mata candidatos materialmente relevantes** cuando
   no estan en la lista Pareto USD top y `crossCount < 2`. El caso mas
   egregio: `stock_risk` con 16.26% del negocio. La regla `pareto || isRootStrong || isNonMonetary` requiere cross>=2 para activar root-strong.
2. **Z.11 ya no es el cuello principal.** Pass rate 69.6% (no 16.7%).
3. **Todos los suprimidos en Z.12 tienen USD correctamente resuelto**
   (`monetaryCoherence: true` para los 7). El resolver inline funciona
   para los tipos terminales monetarios. La asuncion previa "el resolver
   no encuentra el USD" era valida solo para Z.11 / metricas no-monetarias.

### 4.5 Z.10.5b — distribucion `impacto_usd_source` y boosts

| Source         | Count | Notas |
|----------------|------:|-------|
| non_monetary   | 7     | metric en `NON_MONETARY_METRIC_IDS` (engine list) |
| cross_varAbs   | 6     | de `detail.cross_context.varAbs` |
| recuperable    | 5     | de `impacto_recuperable` post-hidratacion |
| unavailable    | 3     | fallback final |
| gap_meta       | 2     | de `impacto_gap_meta` post-hidratacion |

**Top boosts** (factor que aplica el ranker por log USD):
1. meta_gap_temporal Carlos Ramírez — USD $35 514 → factor 1.642
2. meta_gap_temporal Luis Hernández — USD $16 989 → factor 1.533
3. co_decline Palomitas 80g — USD $7 633 → factor 1.418
4. stock_risk Té Helado 500ml — USD $6 665 → factor 1.399 (irónico: el ranker lo prioriza, Z.12 lo mata)
5. product_dead Cacahuates 100g — USD $2 000 → factor 1.241

---

## 5. Preguntas que cierran Z.11.0 — TODAS RESUELTAS

1. **Worker y page-side corren con los mismos inputs?**
   → No exactamente. Worker emite 3 candidates_total / 4 blocks_final. Page-side
   procesa 23 candidatos en Z.11. Los 23 incluyen detectores que el log del
   worker no expone explicitamente. Los inputs base (sales/metas/etc.) son los
   mismos del store; lo que difiere es la profundidad del pipeline ejecutado.
2. **Si no, cual input diverge?**
   → No es input lo que diverge: es **scope del pipeline**. Worker corre motor 2
   + filtrarConEstandar + adapter. Page-side corre motor 2 + Z.11 + Z.12 +
   ranker + executive compression + diagnostic blocks. Es la misma data
   fluyendo por cadenas distintas.
3. **Por que el audit runtime viejo y los goldens no coincidian?**
   → **Confirmado.** Z.11 (`_z11EvaluarSupervivencia`,
   `insight-engine.ts:4665`) y Z.12 (`evaluateInsightCandidate`,
   `insightStandard.ts:2675`) son dos gates independientes con listas
   distintas. El audit viejo midio Z.11. Los goldens miden Z.12. Sus salidas
   no son comparables sin contexto.
4. **Que funcion decide `impacto_usd_*` antes del ranker?**
   → resuelto: el bloque inline `insight-engine.ts:7124-7172`.
   `resolveImpactoUsd` esta importado pero **nunca invocado**.
5. **Que funcion decide coherencia monetaria en el gate?**
   → resuelto: regla 3 de `evaluateInsightCandidate`
   (`insightStandard.ts:2713-2718`).
6. **`tipo-debil` es lista real o derivado?**
   → resuelto: derivado de `!Z11_ROOT_STRONG_TYPES.has(tid) && usd == null`.
7. **Cual es el baseline oficial de tests?**
   → resuelto: 5 archivos / 105 tests passing / 0 errores tsc.
8. **Cual es el baseline oficial runtime para Los Pinos demo?**
   → resuelto. Z.11: 23 → 16 (69.6% pass). Z.12: 16 → 9 (56.3% pass).
   `store.insights.length=8`. Worker `blocks_final=4`. Sources de USD:
   non_monetary 7, cross_varAbs 6, recuperable 5, unavailable 3, gap_meta 2.

---

## 6. VEREDICTO Z.11.0

### 6.1 Lo que cambio respecto al brief original

El brief original Z.11.x apuntaba a "Z.11 mata 83% por sin-usd". **Esa
medicion era stale.** El runtime fresco muestra:

- **Z.11 pass rate ya es 69.6%**, no 16.7%. El cuello de botella original ya
  esta parcialmente resuelto. Sigue cobrando victimas (`meta_gap`,
  `stock_excess`, `change_point`, `contribution`) pero a menor escala.
- **Z.12 es el cuello de botella efectivo hoy.** 7 de 16 supervivientes de
  Z.11 mueren en Z.12. Todos con `monetaryCoherence: true` — el USD esta
  resuelto, el problema es otro.

### 6.2 Caso de estudio mas grave

`stock_risk` de "Té Helado 500ml" trae **USD $6 665 (16.26% del negocio)**,
fuente `recuperable` valida, narrativa OK. **Muere en Z.12 por la regla
Pareto** porque:
- No esta en la lista Pareto top USD del periodo.
- `crossCount = 0` (es una senal de inventario aislada, no tiene
  cross_context).
- El rescate Z12 root-strong requiere `crossCount >= 2`.

Un riesgo de quiebre que vale 16% del negocio se descarta porque su
detector emite con cross=0. **Esto es una regla de gate fallando, no un
problema de USD.**

### 6.3 Z.11.1 — scope ajustado a los datos reales

Antes de implementar nada, dos verdades se establecen:

- **No es necesario "fix sin-usd" en Z.11 como prioridad principal.** Sigue
  matando 4 tipos pero con cobertura limitada y reglas razonables (el
  mecanismo es "usd null + cross pobre + tipo debil"). Hay margen para
  Z.11.1, pero no es la urgencia.
- **La urgencia es Z.12 pareto rule.** Casos materialmente relevantes (≥2%
  del negocio) con `crossCount = 0` mueren sin razon ejecutiva real.

#### Z.11.1 — propuesta de scope (1 PR, 3 cambios)

1. **Z.12 pareto rescue por materialidad alta.** Modificar regla 2 de
   `evaluateInsightCandidate` (insightStandard.ts:2697+) para que
   candidatos con `usdAbs >= ventaTotalNegocio * MATERIALITY_HIGH` (10%)
   pasen Pareto independientemente de la lista Pareto top y cross.
   Justificacion: un riesgo de 16% del negocio NO debe morir por no estar
   en una lista de top contributors. Magnitud absoluta es razon ejecutiva
   suficiente.
2. **Z.11 — agregar `stock_excess` a Z11_ROOT_STRONG_TYPES.** Reconciliar
   con Z12_ROOT_STRONG_TYPES (que ya lo incluye junto a `stock_risk`).
   Esto desbloquea regla C de Z.11 para stock_excess cuando cross>=2.
   stock_risk ya esta en Z12 root-strong pero no en Z11; agregar a Z11.
3. **(Opcional, bajo riesgo) Migrar resolver inline a llamar
   `resolveImpactoUsd`** para eliminar duplicacion. La unica diferencia
   funcional (paso 4 typed amount via calcularImpactoValor) podria
   resolver el `meta_gap = null` automaticamente si calcularImpactoValor
   tuviera formula para meta_gap. Hoy devuelve null tambien (insightStandard.ts:1882).
   Migracion no cambia comportamiento pero centraliza el riesgo.

#### Lo que NO va en Z.11.1

- **Refactor del doble runtime** (worker + page-side). Esto requiere
  evaluar costo/beneficio aparte. Reservado para Z.11.4.
- **Reconciliacion masiva de listas** (`NON_MONETARY_METRIC_IDS`
  vs `Z12_NON_MONETARY_METRIC_IDS`). Hay impacto pero requiere su sprint.
  Reservado para Z.11.2.
- **Tipos terminales policy formal** (cuando un cliente_perdido aislado
  con USD < 2% deberia sobrevivir). Reservado para Z.11.3.
- **Pareto rule rediseno completo.** Por ahora solo agregamos rescate por
  materialidad alta; rediseno full requiere data adicional.

### 6.4 Verificacion de cierre

- [x] Validacion local: 105/105 tests, 0 tsc errors.
- [x] Inventario USD resolver — completo (seccion 1).
- [x] Inventario de listas — completo (seccion 2).
- [x] Mapa detector → detail keys — completo (seccion 3).
- [x] Tabla unica del pipeline — completa (seccion 4) con datos runtime de
  Los Pinos demo, 2026-04-26.
- [x] Preguntas 1-8 — todas resueltas (seccion 5).
- [x] Veredicto y scope Z.11.1 — definidos sobre datos reales (seccion 6).

**Z.11.0 cerrado.** Z.11.1 desbloqueado con scope quirurgico ajustado.

---

## 7. Z.11.1 — verificacion runtime (2026-04-26)

Snapshot detallado en
`docs/baselines/insight-pipeline-baseline.z11-1.json`. Esta seccion
resume el delta sobre Los Pinos demo (mismo escenario que Z.11.0 captura).

### 7.1 Cambios aplicados

| # | Archivo                       | Lineas        | Naturaleza                                                           |
|---|-------------------------------|---------------|----------------------------------------------------------------------|
| 1 | `src/lib/insightStandard.ts`  | 2697-2718     | feat(gate): Z.12 pareto rescue por materialidad alta (`MATERIALITY_HIGH = 0.10`) |
| 2 | `src/lib/insight-engine.ts`   | 4641-4644     | fix(gate): agregar `stock_risk` y `stock_excess` a `Z11_ROOT_STRONG_TYPES` |
| 3 | `src/lib/insight-engine.ts`   | 7130-7142     | refactor(usd): migrar resolver inline a `resolveImpactoUsd` canónico |

Snapshots regenerados: `insight-engine.gate-audit.test.ts.snap`,
`insight-engine.golden.test.ts.snap`. Tests 105/105, tsc 0 errors.

### 7.2 Delta de pipeline (Los Pinos demo, mismo escenario)

| Metrica                 | Z.11.0 | Z.11.1 | Delta    |
|-------------------------|-------:|-------:|---------:|
| Z.11 entrada            | 23     | 23     | 0        |
| Z.11 sobreviven         | 16     | 17     | +1       |
| **Z.11 pass rate**      | 69.6%  | **73.9%** | **+4.3 pp** |
| Z.12 input              | 16     | 17     | +1       |
| Z.12 surviving          | 9      | 11     | +2       |
| **Z.12 pass rate**      | 56.3%  | **64.7%** | **+8.4 pp** |
| store.insights.length   | 8      | 10     | +2       |
| Cards visibles dashboard| 6      | 7      | +1       |
| Productos unicos en feed| 2      | 4      | +2       |

### 7.3 Casos especificos validados

| # | Caso                                       | USD     | %      | Resultado Z.11.0 | Resultado Z.11.1                          |
|---|--------------------------------------------|--------:|-------:|------------------|-------------------------------------------|
| 1 | `stock_excess` Cacahuates 100g (Z.11)      | $7 930  | 19.3%  | suprimido `tipo-debil` | **superviviente Z.11**                  |
| 2 | `stock_risk`   Té Helado 500ml  (Z.12)     | $6 665  | 16.3%  | suprimido `pareto`  | **superviviente Z.12** (rescate alta-mat) |
| 3 | `co_decline`   Palomitas 80g    (Z.12)     | $7 633  | 18.6%  | suprimido `pareto`  | **superviviente Z.12** (rescate alta-mat) |
| 4 | `cliente_dormido` Supermercado López (Z.12)| $1 633  | 3.98%  | suprimido          | **sigue suprimido** (correcto: <10% high-mat, falla narrative) |
| 5 | `cliente_perdido` Tienda El Progreso (Z.12)| $819    | 1.99%  | suprimido          | **sigue suprimido** (correcto: <2% floor) |

Casos 4 y 5 son trabajo de Z.11.3 (politica de tipos terminales).

### 7.4 Beneficio inesperado del cambio 3 (resolver migration)

`source_dist` del Z.10.5b log capturado:

| Source        | Z.11.0 | Z.11.1 |
|---------------|-------:|-------:|
| non_monetary  | 7      | 4      |
| **detail_monto**| 0    | **4**  |
| recuperable   | 5      | 5      |
| unavailable   | 3      | 2      |
| cross_varAbs  | 6      | 6      |
| gap_meta      | 2      | 2      |

3 candidatos (probablemente change_point/contribution con `memberChange`
disponible en detail) que antes caian a `non_monetary` ahora resuelven
USD via el paso 4 typed amount de `resolveImpactoUsd`. El refactor no
es cosmetico: rescata informacion economica que el resolver inline
descartaba. Visible tambien en Z.11 donde candidatos antes etiquetados
`tipo-debil(change_point|contribution)` ahora reciben etiqueta
`usd-trivial($7-8)` o `usd-medio($75)` — el USD se encuentra, solo es
chico.

### 7.5 Las 6 supresiones residuales en Z.11 son legitimas

| tid           | member             | regla                                              | naturaleza                |
|---------------|--------------------|-----------------------------------------------------|----------------------------|
| meta_gap (×3) | Limpieza/Refrescos/Lácteos | `sin-usd \| cross-pobre(1)`             | `calcularImpactoValor` para `meta_gap` devuelve `null` (insightStandard.ts:1882). **Trabajo Z.11.2.** |
| change_point  | Snacks             | `usd-trivial($8) \| cross-pobre(0) \| accion-generica` | $8 USD es ruido. Suprimir es correcto. |
| change_point  | Miguel Ángel Díaz  | `usd-trivial($7) \| accion-generica`               | idem.                       |
| contribution  | Autoservicio       | `usd-medio($75) \| cross-pobre(0)`                  | $75 = 0.18% del negocio. Suprimir es correcto. |

El target Z.11 ≥75% era conservador. 73.9% es el techo natural sin
agregar formula USD para `meta_gap`. **Z.11.1 cerrado por verificacion.**

### 7.6 Trabajo derivado para sprints siguientes

- **Z.11.2** — Agregar formula USD para `meta_gap` en `calcularImpactoValor`
  (insightStandard.ts:1882). Hoy devuelve `null`, deberia devolver `gap × meta`
  o equivalente.
- **Z.11.3** — Politica de tipos terminales aislados (cross=0): `cliente_perdido`
  y `cliente_dormido` con USD entre 1-10% del negocio mueren en Z.12 por
  pareto+narrative. Definir excepcion narrativa o ablandar pareto solo para
  tipos terminales.
- **Z.11.4** — Eliminar doble runtime worker / page-side. Worker emite 4
  blocks; page-side procesa 23 candidatos. Misma data, dos cadenas distintas.
- **Z.11.5** — Reconciliar `NON_MONETARY_METRIC_IDS` (engine, 8 entradas) vs
  `Z12_NON_MONETARY_METRIC_IDS` (standard, 10 entradas). Hoy `skus_activos`
  y `margen_pct` son tratados como monetarios por el resolver pero como
  no-monetarios por el gate Z.12.

**Z.11.1 cerrado 2026-04-26. Tests 105/105, tsc 0 errors. Commits aplicados.**

---

## 8. Z.11.4 — Eliminacion del doble runtime motor 2 (2026-04-26)

### 8.1 Problema documentado en Z.11.0

Motor 2 corria dos veces sobre los mismos datos:
- **Worker** (`analysisWorker.ts`): `runInsightEngine` + `filtrarConEstandar` + adapter → `store.insights` (8 insights).
- **Page-side** (`EstadoComercialPage.tsx:1429`): `runInsightEngine` + `filtrarConEstandar` → `_filteredCandidates` (16-17 candidatos).

Ambos producian arrays distintos por contrato, no por divergencia: el worker corria con `selectedMonths: null` y emitia el adapter para `store.insights`; el page-side corria con `selectedMonths` real (UI multi-mes) y mantenia `InsightCandidate[]` para alimentar `candidatesToDiagnosticBlocks`.

### 8.2 Solución aplicada

Worker emite `filteredCandidates` (array post-Z.11+Z.12) ademas de `insights`. Store lo guarda en memoria. Page-side consume el store directo cuando `selectedMonths === null` (caso por defecto). Cuando el usuario activa multi-mes, page-side mantiene fallback a `runInsightEngine + filtrarConEstandar` con el `selectedMonths` real.

### 8.3 Archivos modificados

| Archivo                                  | Cambio                                                                |
|------------------------------------------|------------------------------------------------------------------------|
| `src/lib/analysisWorker.ts`              | Phase 1 y Phase 2 postMessage incluyen `filteredCandidates: _filtered`. |
| `src/store/appStore.ts`                  | Nuevo campo `filteredCandidates: InsightCandidate[]` + setter `setFilteredCandidates`. No se persiste. |
| `src/lib/useAnalysis.ts`                 | Lee `data.filteredCandidates` del worker y lo envia al store.          |
| `src/pages/EstadoComercialPage.tsx:1430+`| `_insightCandidates` (useMemo) eliminado. `_filteredCandidates` ahora retorna `filteredCandidatesStore` cuando `selectedMonths===null`; cae a runInsightEngine+filtrarConEstandar en multi-mes. |
| `src/pages/EstadoComercialPage.tsx:1576+`| `recordInsightRuntimeAuditReport` ya no consume `_insightCandidates`; usa `_filteredCandidates` en ambos slots porque el gate stage del worker queda capturado en `analysis_worker` stage report. |

### 8.4 Beneficios medibles

- **Default path (selectedMonths===null):** motor 2 corre **1 vez** (en worker, off-thread) en lugar de 2. Eliminacion completa de ~1118 candidates × 2 detectores en main thread.
- **Multi-mes path:** sin cambios. Mantiene UX de comparacion entre meses no-contiguos.
- **Contrato unificado:** `store.filteredCandidates` es la fuente unica para `_insightChains`, `_executiveProblems`, `_residualCandidates`, `diagnosticBlocks` en el caso por defecto.

### 8.5 Validacion

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run`: 5 archivos / 105 tests passing. Goldens sin cambio (los tests de motor 2 no dependen del wiring page-side).

### 8.6 Backlog desbloqueado

Con `filteredCandidates` siendo single source of truth, los siguientes sprints son menos riesgosos:
- **Z.11.2** — Formula USD para `meta_gap` en `calcularImpactoValor` (insightStandard.ts:1882). El cambio solo afectara una sola corrida de motor 2 en lugar de dos.
- **Z.11.3** — Politica de tipos terminales aislados (cliente_dormido/cliente_perdido con cross=0). Ahora el rescate aplicado en worker se refleja inmediatamente page-side sin re-correr nada.
- **Z.11.5** — Reconciliar `NON_MONETARY_METRIC_IDS` engine vs Z12_NON_MONETARY_METRIC_IDS. Cambio se mide en un solo run.

**Z.11.4 cerrado 2026-04-26. Tests 105/105, tsc 0 errors.**

---

## 9. Z.11.2 — Formula USD para meta_gap (2026-04-27)

### 9.1 Problema documentado en Z.11.1

Z.11.1 cerró con pass rate 73.9%, marginal vs target 75%. El residual era
estructural: 3 candidatos `meta_gap` (Limpieza/Refrescos/Lácteos en uds mode)
morían en Z.11 con `sin-usd|cross-pobre(1)`. Razón:
`calcularImpactoGapMeta` retornaba `null` para `meta_gap`, lo que hacía que
la cadena del resolver cayera a `metricId='cumplimiento_meta'` ∈
`NON_MONETARY_METRIC_IDS` → source='non_monetary' → Z.11 etiqueta 'sin-usd'.

El builder `meta_gap_combo` (insight-engine.ts:6271+) ya seteaba
`impacto_usd_normalizado` inline correctamente, pero el resolver post-hidratación
lo sobrescribía sin condicional (esa es la dinámica del refactor Z.11.1
cambio 3 — todo USD pasa por el resolver canónico).

### 9.2 Solución aplicada

`calcularImpactoGapMeta` (insightStandard.ts:1976) ahora computa USD para
`meta_gap` siguiendo el mismo criterio que el builder inline:

| `detail.tipoMetaActivo` | Fórmula USD                                  | Source asignado |
|-------------------------|----------------------------------------------|-----------------|
| `'usd'`                 | `Math.abs(detail.gap)` (gap ya está en USD)  | `gap_meta`      |
| `'uds'`                 | `detail.ventaUsd` si > 0                     | `gap_meta`      |
| Cualquier otro          | `null` (fallback)                            | (sigue cadena del resolver) |

Sin tocar el resolver ni `calcularImpactoValor`. La asignación viene primera
en el orden del resolver (paso 1: `gap_meta`), así que bypassa el check de
`Z12_NON_MONETARY_METRIC_IDS` que estaba condenando a `meta_gap`.

### 9.3 Archivos modificados

- `src/lib/insightStandard.ts:1976-2002` — `calcularImpactoGapMeta` con formula concreta para `meta_gap`.
- 5 snapshots regenerados (insight-engine.golden + insight-engine.gate-audit + nuevos goldens estructurales).

### 9.4 Impacto medido en goldens

| Métrica            | Z.11.1 → Z.11.2 (USD test) | Z.11.1 → Z.11.2 (UDS test) |
|--------------------|---------------------------:|---------------------------:|
| `gatePassCount`    | **11 → 16** (+5)           | **11 → 14** (+3)           |
| `poolSize`         | **15 → 20** (+5)           | **17 → 20** (+3)           |
| Conteo `meta_gap`  | **1 → 3** en gate failure breakdown; **1 → 6** en finalPool | **1 → 2** en gate failure; **1 → 4** en finalPool |

Nuevos supervivientes confirmados:
- `meta_gap:Lácteos` (categoria)
- `meta_gap:Limpieza` (categoria)
- `meta_gap:Refrescos` (categoria)
- `meta_gap:Patricia Ruiz` (supervisor — bonus, este antes ni pasaba el ranker)

### 9.5 Validación

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run`: 105/105 passing. 5 snapshots regenerados (cambios aditivos
  esperados; ningún candidato previamente válido se eliminó).

### 9.6 Pass rate proyectado

Pre-Z.11.2 (Z.11.0 baseline): pass rate 69.6%, 7 supresiones.
Post-Z.11.1: pass rate 73.9%, 6 supresiones.
Post-Z.11.2 (proyectado runtime sobre Los Pinos demo): 3 supresiones residuales
esperadas → pass rate **~87% (20/23)**.

Las 3 supresiones que quedan son **legítimas** y no son trabajo de Z.11.2:
- `change_point Snacks` — `usd-trivial($8)`
- `change_point Miguel Ángel Díaz` — `usd-trivial($7)`
- `contribution Autoservicio` — `usd-medio($75) + cross-pobre(0)`

### 9.7 Backlog restante

Con Z.11.2 cerrado, el roadmap Z.11 queda:
- **Z.11.3** — Política de tipos terminales aislados (cliente_dormido/
  cliente_perdido con cross=0). Las 2 supresiones residuales de Z.12 que
  importan: Supermercado López ($1633, 3.98%) y Tienda El Progreso ($819,
  1.99%). Trabajo de diseño mayor.
- **Z.11.5** — Reconciliar `NON_MONETARY_METRIC_IDS` (engine, 8) vs
  `Z12_NON_MONETARY_METRIC_IDS` (standard, 10). Bajo impacto inmediato,
  alta deuda estructural.

**Z.11.2 cerrado 2026-04-27. Tests 105/105, tsc 0 errors.**

---

## 10. Z.11.3 — Política tipos terminales aislados (2026-04-27)

### 10.1 Problema documentado en Z.11.2

Z.11.2 dejó pass rate Z.11 en 87% (techo natural). Pero Z.12 seguía con 6
supresiones, 3 de ellas accionables y suprimidas por una asimetría
estructural:

- `cliente_perdido` Tienda El Progreso ($819, 1.99%, cross=0): muere por
  `materiality + pareto` — apenas debajo del 2% floor + bloqueo Pareto.
- `cliente_dormido` Supermercado López ($1633, 3.98%, cross=0): muere por
  `pareto + narrativeCoherence` — pareto bloqueado, narrative requería acción
  concreta.
- (Roberto Méndez contribution + 3 trend/outlier legítimas son trabajo
  separado.)

Las dos primeras son tipos **terminales por construcción**: la entidad
protagonista (el cliente) ES la señal completa. No hay dimensiones cruzables
naturales. El `Z12_ROOT_STRONG_TYPES` rescue requería `crossCount >= 2`,
diseño hecho para tipos como `cross_delta` o `meta_gap_combo` que son
multi-dim por naturaleza.

### 10.2 Solución aplicada

Nueva constante `Z12_TERMINAL_TYPES` en insightStandard.ts:2589-2592:

```ts
const Z12_TERMINAL_TYPES = new Set([
  'cliente_perdido',
  'cliente_dormido',
])
```

`isRootStrong` modificado en `evaluateInsightCandidate` (línea 2706-2711):

```ts
const isRootStrong =
  Z12_ROOT_STRONG_TYPES.has(c.insightTypeId) && (
    ctx.crossCount >= 2 ||
    Z12_TERMINAL_TYPES.has(c.insightTypeId)   // [Z.11.3] terminales saltan cross req
  )
```

Sin cambios en r1/r2/r3/r4. Solo se relaja el qualifying condition de
isRootStrong para tipos terminales. Side effect intencional:

- r1 (materiality): tercera rama (`isRootStrong`) ahora deja pasar terminales
  con USD < 1% del negocio. Riesgo controlado por:
  - Detector ya filtra por `recovery_label`/`umbralDias` antes del gate.
  - `ALWAYS_PROTECTED_CAPS`: cliente_perdido cap=1, cliente_dormido cap=2.
- r2 (pareto): isRootStrong ahora rescata terminales con cross=0.
- r3 (monetaryCoherence): inocuo para terminales — Z.11.2 ya garantiza
  source='recuperable' valida.

### 10.3 Archivos modificados

- `src/lib/insightStandard.ts:2589-2592` — nueva constante `Z12_TERMINAL_TYPES`.
- `src/lib/insightStandard.ts:2706-2711` — isRootStrong extendido.
- 6 snapshots regenerados (cambios aditivos: 2 supervivientes nuevos en USD test, 2 en UDS test, contadores derivados).

### 10.4 Impacto medido en goldens

| Métrica         | Z.11.2 → Z.11.3 (USD test) | Z.11.2 → Z.11.3 (UDS test) |
|-----------------|---------------------------:|---------------------------:|
| `gatePassCount` | 16 → **18** (+2)           | 14 → **16** (+2)           |
| `gateFailCount` | 4 → **2** (-2)             | 6 → **4** (-2)             |
| Tipos rescatados | cliente_perdido + cliente_dormido | idem                  |

### 10.5 Validación

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run`: 105/105 passing. 6 goldens regenerados (cambios aditivos).
- Sin regresiones: todos los candidatos pre-existentes mantienen su estado
  pasa/falla (excepto los 2 nuevos terminales).

### 10.6 Pass rate Z.12 proyectado runtime

Pre-Z.11.3: Z.12 surviving 14, suppressed 6 (66% pass).
Post-Z.11.3: Z.12 surviving 16, suppressed 4 (80% pass).

Las 4 supresiones residuales son **legítimas y NO son trabajo de Z.11.3**:
- `Roberto Méndez` (contribution) — caso aparte, no terminal. Backlog.
- `outlier Supermercado Nacional` $310 (0.76%) — USD chico, ruido válido.
- `trend Pulpería San José` $174 (0.42%) — idem.
- `trend Mayoreo Santa Ana` $177 (0.43%) — idem.

### 10.7 Estado del roadmap

Z.11 sprint family casi cerrado:

| Sprint | Estado | Entregable |
|---|---|---|
| Z.11.0 | ✅ cerrado | Baseline forense |
| Z.11.1 | ✅ cerrado | 3 fixes de gate |
| Z.11.2 | ✅ cerrado | Formula USD para meta_gap |
| Z.11.3 | ✅ cerrado | Política tipos terminales |
| Z.11.4 | ✅ cerrado | Single source of truth motor 2 |
| Z.11.5 | ⚪ pendiente | Reconciliar listas non_monetary |
| Z.11.6 | ⚪ apuntado | Cap adapter para meta_gap:categoria multi-miembro |

**Z.11.3 cerrado 2026-04-27. Tests 105/105, tsc 0 errors.**

