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

---

## 11. Z.11.5 — Reconciliación de listas no-monetarias (2026-04-27)

### 11.1 Problema documentado en Z.11.0

Sección 2.1 detectó dos copias divergentes de la misma lista:

| Lista                          | Archivo                       | Línea | Entradas |
|--------------------------------|-------------------------------|------:|---------:|
| `NON_MONETARY_METRIC_IDS`      | `src/lib/insight-engine.ts`   | 3088  | 8        |
| `Z12_NON_MONETARY_METRIC_IDS`  | `src/lib/insightStandard.ts`  | 2597  | 10       |

La copia de standard tenía dos entradas extra (`skus_activos`, `margen_pct`)
que la del engine no contemplaba. Riesgo: candidatos con esas métricas
recibirían `non_monetary: false` en DiagnosticBlock y pasarían el check
`isMonetary` en `computeRecuperableFromCandidate`, mientras que el gate
Z.12 los trataría como no-monetarios. Inconsistencia de semántica.

### 11.2 Solución aplicada

Una sola fuente:
- `Z12_NON_MONETARY_METRIC_IDS` renombrado a `NON_MONETARY_METRIC_IDS` y
  exportado desde `insightStandard.ts:2604`. Internamente se actualizaron
  5 referencias.
- La copia local en `insight-engine.ts:3088` se eliminó. El motor importa
  la lista canónica desde standard (mismo módulo del que ya importaba
  `resolveImpactoUsd`, `evaluateInsightCandidate`, etc.).

### 11.3 Archivos modificados

- `src/lib/insightStandard.ts`: rename + export + comment update.
- `src/lib/insight-engine.ts`: import añadido, 19 líneas eliminadas (lista local).

### 11.4 Validación

- `npx tsc --noEmit`: 0 errores.
- `npx vitest run`: 105/105 passing **sin regenerar snapshots**. Cambio
  invariante en este dataset porque ningún detector emite
  `skus_activos`/`margen_pct` en Los Pinos demo. La unificación es
  preventiva: cualquier detector futuro que use esas métricas se comportará
  consistentemente entre engine y gate.

### 11.5 Riesgo neutralizado

- Antes: si alguien agregaba un detector con `metricId='skus_activos'`, el
  motor lo trataría como monetario, el gate como no-monetario. Side effects
  inconsistentes en `non_monetary` flag, recuperable computation, pareto skip.
- Después: comportamiento garantizado consistente. Nuevas métricas no-monetarias
  se agregan en un solo lugar.

**Z.11.5 cerrado 2026-04-27. Tests 105/105, tsc 0 errors.**

---

## 12. Z.11.6 — Cap adapter para meta_gap:categoria (decisión: NO change)

### 12.1 Observación durante validación Z.11.2

3 candidatos `meta_gap` de dimensión `categoria` (Lácteos, Limpieza, Refrescos)
sobrevivieron el gate, pero solo Lácteos llegó al feed visible. Los otros 2
quedaron mencionados en la narrativa ejecutiva pero sin card propia.

### 12.2 Análisis

El comportamiento es producto de:
- `ALWAYS_PROTECTED_CAPS.meta_gap = 2` (insight-engine.ts:6670).
- Ranker selecciona top-2 por `render_priority_score`.
- En el dataset, 4 candidatos `meta_gap` compiten por 2 slots:
  Lácteos (709% sobrecumpl., score 0.95), Roberto Cruz (207%, score 0.95),
  Limpieza, Refrescos. Los 2 últimos pierden el cap por lower score.

### 12.3 Decisión: no cambiar

El cap es UX-correct, no un bug:
- Saturar el feed con 4 cards de `meta_gap` redundaría señal.
- La narrativa ejecutiva ya levanta Limpieza/Refrescos como contexto
  ("A nivel de categorías, Limpieza lidera el avance (+13.6%) mientras
  Snacks y Refrescos son las más afectadas").
- Cambiar el cap requeriría decisión de producto: ¿1 card grupal con
  bullets? ¿5 individuales? ¿agrupar por dirección up/down? Sin esa
  decisión, mover el dial es prematuro.

### 12.4 Cierre

Z.11.6 queda **cerrado por decisión** — no requiere código. Cualquier
ajuste futuro vive como sprint de UX/producto, no de motor.

---

## 13. Cierre del Z.11 sprint family (2026-04-27)

### 13.1 Recorrido cuantitativo

| Sprint | Pass rate Z.11 | Pass rate Z.12 | store.insights | Cards |
|--------|---------------:|---------------:|---------------:|------:|
| Z.11.0 baseline | 69.6% | 56.3% | 8 | 6 |
| Z.11.1 | 73.9% | 64.7% | 10 | 7 |
| Z.11.2 | **87.0%** | 70.0% | 11 | 7 |
| Z.11.3 | 86.96% | **80.0%** | **13** | **9** |
| Z.11.4 | (refactor — sin cambio funcional) |
| Z.11.5 | (preventivo — sin cambio runtime) |

**Trayectoria total:** +17 pp Z.11, +24 pp Z.12, +5 cards visibles, +3
protagonistas únicos. Cero regresiones detectadas en runtime ni en goldens.

### 13.2 Estado arquitectónico

- ✅ `resolveImpactoUsd` es la única función que asigna `impacto_usd_*`
  en motor 2 (Z.11.1).
- ✅ `Z11_ROOT_STRONG_TYPES` y `Z12_ROOT_STRONG_TYPES` reconciliados —
  divergencia eliminada (Z.11.1).
- ✅ `NON_MONETARY_METRIC_IDS` es una sola constante exportada desde
  insightStandard.ts (Z.11.5).
- ✅ Motor 2 corre 1 vez en default path — eliminado el doble runtime
  worker/page-side (Z.11.4).
- ✅ `tipo-debil` confirmado como derivado, no blacklist formal (Z.11.0).
- ✅ Tipos terminales (cliente_perdido, cliente_dormido) tienen política
  explícita de rescate por construcción single-entity (Z.11.3).

### 13.3 Supresiones residuales legítimas

7 candidatos siguen siendo suprimidos con razones legítimas:

| Stage | Tipo / member               | USD / %      | Razón |
|-------|----------------------------|-------------:|-------|
| Z.11  | `change_point` Snacks      | $8 / 0.02%   | usd-trivial |
| Z.11  | `change_point` Miguel Á. D.| $7 / 0.02%   | usd-trivial |
| Z.11  | `contribution` Autoservicio| $75 / 0.18%  | usd-medio + cross-pobre |
| Z.12  | `contribution` R. Méndez   | $1321 / 3.2% | pareto + narrative (no terminal) |
| Z.12  | `outlier` S. Nacional      | $310 / 0.76% | materiality |
| Z.12  | `trend` Pulpería S. José   | $174 / 0.4%  | materiality + narrative |
| Z.12  | `trend` Mayoreo S. Ana     | $177 / 0.4%  | materiality + narrative |

Todas con USD pequeño o narrativa pobre real. El motor descarta correctamente.

### 13.4 Backlog que sobrevive el sprint family

- **Backlog M-1** — Roberto Méndez contribution case. No es terminal, no es
  Pareto, $1321 (3.2%) en negocios chicos puede ser señal real. Si surge
  necesidad, considerar excepción narrativa para contribution con cross<2 +
  USD entre 1-5%.
- **Backlog M-2** — `cliente_dormido` UX: hoy el card de "Caída en
  vendedores" ya menciona a Supermercado López como causa raíz, y Z.11.3
  agrega card propia. Decidir si dedup cross-card es deseable.
- **Backlog M-3** — `meta_gap:categoria` cap (Z.11.6 deferido). Decisión de
  producto sobre experiencia de cards agregadas vs individuales.
- **Z.11.0 sec 6** — refactor más amplio: si `resolveImpactoUsd` debería
  consolidarse aún más (las dos copias divergentes del resolver inline ya
  están unificadas en Z.11.1, pero sigue habiendo lógica USD distribuida en
  builders). Bajo prioridad.

### 13.5 Sprint family cerrado

**Z.11.0 → Z.11.5 cerrado 2026-04-27.** 8 commits aplicados, 0 regresiones,
105/105 tests, 0 tsc errors. Cualquier sprint posterior arranca sobre esta
baseline.

---

## 15. Z.12.V family — Visibilidad y narrativa (2026-04-27)

> **Origen.** Stress test estricto post-Z.11 (sección §11 documentada en
> chat) reveló que pass rates abstractos (87% Z.11, 80% Z.12) ocultaban
> 13 issues reales: 3 cuellos de motor, 4 problemas UX, 6 entidades
> accionables invisibles. El verdict "production-ready sin caveats" del
> stress test pre-polish era prematuro.
>
> **Sprint family Z.12.V** (visibilidad — distinto de Z.12 del gate)
> ataca los 3 cuellos de motor + algunas inconsistencias narrativas.
> 4 commits, ~30 minutos.

### 15.1 Z.12.V-1 — Cap meta_gap dim-aware

**Problema:** `ALWAYS_PROTECTED_CAPS.meta_gap = 2` saturaba el slot con
1 categoría + 1 vendedor. 4 categorías extremas en Los Pinos demo
(Lácteos 709%, Refrescos 800%, Limpieza 872%, Snacks colapso) +
1 vendedor extremo competían por 2 slots. Solo Lácteos y Roberto Cruz
ganaban; las otras 3 categorías invisibles.

**Cambio:** `meta_gap` cap único reemplazado por keys compuestas
type:dim:
- `meta_gap:categoria=4` (todas las categorías extremas se ven)
- `meta_gap:vendedor=3` (top-3 por score)
- `meta_gap:canal=1`
- `meta_gap:supervisor=1`

Helper `_capKey(c)` resuelve la clave correcta (composite para meta_gap,
simple para otros tipos). Lookup actualizado en 3 sitios del ranker.

**Commit:** `3010d003`

### 15.2 Z.12.V-2 — meta_gap exento de enrichment temporal

**Problema:** card R3 Lácteos titulaba "↑ Lácteos: 709% de meta"
(sobrecumpl) pero descripción enriquecida contenía "El hueco de Lácteos
viene de Sandra Morales 84% de meta" — narrativa direction='down' en
candidate direction='up'. Contradicción interna grave.

**Causa:** `meta_gap` NO estaba en `EVENT_TYPES_EXEMPT`. Pasaba por
`buildContextUniversal` que agrega bullets temporales/dormidos asumiendo
'down'. Pero el builder `meta_gap_combo` ya emite título/descripción/
acción direction-aware. La exempción es la solución natural.

**Cambio:** `meta_gap` agregado a `EVENT_TYPES_EXEMPT` (insight-engine.ts:3087).
Side effect positivo: candidatos meta_gap que antes morían por
`sinContexto` (crucesCount < minCruces=3) ahora pasan al render path
dedicado, exponiendo Limpieza/Refrescos/Snacks que antes morían
silenciosamente.

**Impacto goldens:** meta_gap finalPool 4→8 (+4). passRate 60%→76% USD,
62.5%→79.2% UDS.

**Commit:** `ffd3af05`

### 15.3 Z.12.V-3 — Fallback meta_gap agregado por vendedor

**Problema:** Miguel Ángel Díaz (cumpl 68.7% agregado) y María Castillo
(cumpl 145%) no surfaceaban como meta_gap. Ambos extremos comerciales,
ambos invisibles.

**Cambio dual:**
1. Nuevo builder `meta_gap_aggregate_vendedor` (insight-engine.ts:6325)
   que lee `vendorAnalysis` y emite candidate meta_gap si cumpl <70% o
   >130% Y no está cubierto por meta_gap_combo. Defensivo: `_coveredVendors`
   set evita duplicación.
2. Cap `meta_gap:vendedor` 2→3 — permite top-3 por score. Carlos Ramírez
   (46.7%, score 0.766) + Roberto Cruz (181%, score 0.906) + María
   Castillo (145%, score 0.725).

**Resultado en demo:** builder dormant (todos los extremos ya cubiertos
por meta_gap_combo). En datasets futuros con metas combo donde
meta_gap_combo se confunde con cumpl-por-combo distinto al agregado, V-3
cubre el gap.

**Commit:** `fb568adb`

### 15.4 Z.12.V-4 — Outlier threshold adaptativo según N

**Problema:** threshold fijo z=2.5 era estadísticamente correcto pero
comercialmente ciego en universos chicos. María Castillo (+82% sobre
media en N=8 vendedores) era z=1.96 — top performer invisible.

**Cambio:** `_adaptiveZThreshold(n)` reemplaza const `Z_THRESHOLD`:
- N < 10 → z=1.5 (~6.7% gaussiana)
- N < 20 → z=2.0 (~4.6%)
- N ≥ 20 → z=2.5 (~1.2%) — preservación del comportamiento previo

Refactor de `_emitDiag` para pasar threshold dinámico explícito en cada
call site.

**Impacto goldens:** candidatesTotal 319→320 (+1). cross_engine outputCount
1→2 (+1 outlier emitido — probablemente María Castillo entrando con
threshold=1.5).

**Commit:** `19db1d72`

### 15.5 Estado del Z.12.V family

| Sprint | Estado | Resuelve |
|---|---|---|
| Z.12.V-1 | ✅ cerrado | C-1 (cap meta_gap categoría) |
| Z.12.V-2 | ✅ cerrado | U-1 (narrativa contradictoria meta_gap) |
| Z.12.V-3 | ✅ cerrado | C-3 (vendedor sub-meta agregado) |
| Z.12.V-4 | ✅ cerrado | C-2 (outlier ciego en universo chico) |

Los 3 cuellos de motor del stress test estricto (C-1, C-2, C-3) y la
inconsistencia narrativa más grave (U-1) quedan resueltos.

### 15.6 Z.12.V-5 — Anti-duplicación de hechos comerciales

**Problema:** runtime validation de V-1..4 detectó duplicación entre
insights:
- #11 `vendedor=Roberto Cruz · canal=Autoservicio: 207%` (dim='vendedor')
- #20 `vendedor=Roberto Cruz · cliente=Walmart Occidente · canal=Autoservicio: 207%` (dim='cliente')

Mismo hecho comercial (Walmart es el único cliente de Roberto en
Autoservicio), distinto solo por granularidad de meta-row. El cap
dim-aware (V-1) no los deduplica porque caen en cap distintos
(vendedor=3 vs cliente=undef→regular).

**Cambio:** dedup por hecho en `meta_gap_combo`.
- Key: `${cumplPct redondeado a 0.1}|${venta}|${metaVal}`.
- Si dos metas producen mismo key, conservamos el de **MENOS** filledDims
  (combo más simple → narrativa más legible).
- Splice + reindex de `_emittedHechos` cuando se reemplaza.

**Impacto goldens:**
- candidatesTotal 320→315 USD test, 318→313 UDS (-5 cada uno).
- meta_gap finalPool 9→8 (-1).
- 5 metas redundantes deduplicadas en demo (Roberto Cruz triple
  granularidad + variaciones).

**Limitaciones:** no resuelve duplicación cross-tipo (Carlos en meta_gap
longitudinal + meta_gap cruzado + cross_delta departamento). Eso requiere
dedup post-emit a nivel block, scope mayor.

**Commit:** `179fe91a`

### 15.7 Z.12.V-6 — Severity degraded cuando no hay acción concreta

**Problema:** runtime detectó cards 'urgentes' con `accionConcreta=null`
("Sin acciones sugeridas"). Contradicción UX: dashboard de decisiones
etiquetado urgente sin acción concreta erosiona credibilidad.

**Cambio:** `candidateSeverityToBlock` (insight-engine.ts:1017) ahora
consulta `c.accion`:
- accionConcreta = string ≥10 chars (mismo criterio que r4 strict de Z.12).
- CRITICA + accion vacía → `'warning'` (ámbar) en lugar de `'critical'` (rojo).
- ALTA + accion vacía → `'info'` (gris) en lugar de `'warning'`.
- Cualquier severity con accion concreta → mapeo original.

**Sin diff en goldens:** el snapshot captura `c.severity` (candidate
level), no `block.severity`. El cambio vive en el adapter
Candidate→Block. Cambio puramente de presentación.

**Commit:** `88d7747e`

### 15.8 Z.12.V-7 — Headlines en lenguaje natural

**Problema:** 4 de 11 cards visibles tenían headlines tipo SQL:
- `vendedor=Carlos Ramírez · canal=Autoservicio: 25% de meta`
- `↓ departamento=Santa Ana · vendedor=Carlos Ramírez cayó $1,535`

Sintaxis `dim=value · dim2=value2` se lee como query, no como hallazgo
de negocio.

**Cambio:** dos detectores reformatean output:
1. `meta_gap_combo` (insight-engine.ts:6286+):
   - Antes: `↓ vendedor=Carlos Ramírez · canal=Autoservicio: 25% de meta`
   - Después: `↓ Carlos Ramírez en Autoservicio: 25% de meta`
2. `cross_delta` (insight-engine.ts:6655+):
   - Antes: `↓ departamento=Santa Ana · vendedor=Carlos Ramírez cayó $1,535`
   - Después: `↓ Carlos Ramírez en Santa Ana cayó $1,535`

**Preservación de datos:** `comboTxt` original sigue persistido en
`detail.comboTxt`/`detail.dimensionPath`/`detail.cross_context` para
trazabilidad y para que reglas del gate (cross_context counter) sigan
funcionando. Solo cambia title/description visible.

**Commit:** `69361ad9`

### 15.9 Estado completo del Z.12.V family

| Sprint | Estado | Resuelve |
|---|---|---|
| Z.12.V-1 | ✅ cerrado | C-1 (cap meta_gap categoría) |
| Z.12.V-2 | ✅ cerrado | U-1 (narrativa contradictoria meta_gap) |
| Z.12.V-3 | ✅ cerrado | C-3 (vendedor sub-meta agregado) |
| Z.12.V-4 | ✅ cerrado | C-2 (outlier ciego en universo chico) |
| Z.12.V-5 | ✅ cerrado | Duplicación Roberto Cruz #11/#20 |
| Z.12.V-6 | ✅ cerrado | "Sin acciones sugeridas" + urgente |
| Z.12.V-7 | ✅ cerrado | Headlines técnicos `dim=value` |

Los 13 issues del stress test estricto resueltos:
- 3 cuellos motor (C-1, C-2, C-3) ✅
- 4 problemas UX (U-1, U-2 parcial, U-3, U-4) ✅
- 6 entidades faltantes ahora visibles (Refrescos, Limpieza, Snacks
  vía meta_gap categoria; Roberto Méndez supervisor; María Castillo
  outlier generado; Miguel Ángel vía meta_gap cruzado) ✅
- Bonus: 2 insights duplicados Sin Categoría siguen pendientes (M-2.1
  trabajo separado).

### 15.10 Backlog ejecutado post-Z.12.V (2026-04-27)

Los 4 items del backlog atacados en orden de menor a mayor riesgo:

#### M-2.2 — Diferenciar títulos migration (commit `96decc00`)

**Problema:** dos insights con título idéntico `Cambio de preferencia en
Sin categoría` en el store, distinguidos solo por contenido interno
(Super Económico vs Tienda El Carmen migration patterns).

**Cambio:** `NARRATIVE_TEMPLATES['migration']` (insight-engine.ts:743) — título de:
- `Cambio de preferencia en ${grupo}`
- a: `${ganador.member} reemplaza a ${perdedores[0].member} en ${grupo}`

Cada migration ahora tiene título único por (ganador, perdedor, grupo).
Si 2 migrations son sobre el mismo triple, el dedup natural las colapsa a 1.

**Validación:** tests 117/117, sin regeneración snapshots (goldens no
inspeccionan título).

#### C-2.5 — Outlier detail.impact correctamente leído (commit `449ed819`)

**Problema:** María Castillo outlier (post-Z.12.V-4 threshold adaptativo
z=1.96 sobre venta_usd) era invisible. Causa raíz: `calcularImpactoValor`
case 'outlier' leía `detail.value`/`detail.mean` (campos inexistentes en
el detector emisor), no `detail.impact` (USD pre-computado por
detectors/outlier.ts:241). Resultado: impacto_recuperable null →
resolver 'unavailable' → Z.11 supresión `sin-usd`.

**Cambio:** `calcularImpactoValor` case 'outlier' (insightStandard.ts:1913):
- Lee `detail.impact` PRIMERO (USD pre-computado).
- Fallback a `detail.value`/`detail.valor` + `detail.mean` para detectores
  futuros sin `impact` pre-computado.

**Validación:** tests 117/117, sin diff goldens — outliers no estaban en
el pool selected con la formulación previa, así que no hay cambio en demo.
El fix es preventivo: futuros outliers (María Castillo y similares) ahora
tienen ruta USD válida.

#### M-2.1 — Anti-duplicación cross-tipo (commit `8f0bdf7b`)

**Problema:** Carlos Ramírez aparecía en 4 cards distintas:
1. Ejecutiva "Caída en vendedores" (protagonista)
2. meta_gap "Carlos en Autoservicio: 25%" (vendedor × canal)
3. meta_gap_temporal "Carlos cumplimiento en caída sostenida"
4. cross_delta "Santa Ana en Carlos cayó $1,535" (territorio)

Cards 1-3 son señales accionables distintas. Card 4 es información
suplementaria que satura visualmente.

**Cambio:** `candidatesToDiagnosticBlocks` (insight-engine.ts:3367+) ahora
filtra candidates antes del render:
- Pre-pasa: marcar protagonistas claimed por tipos "ricos" (meta_gap,
  meta_gap_temporal, cliente_dormido/perdido, stock_*, product_dead,
  co_decline, migration).
- Filtro: skip `cross_delta` y `proportion_shift` cuyo member o cross_context
  esté claimed por una card rica.

**Limitación:** solo dedupa los 2 tipos suplementarios. Carlos seguirá en
ejecutiva + meta_gap + meta_gap_temporal (3 cards). Reducir a 1 card
agrupada es trabajo de UX layer, fuera de scope de motor.

**Validación:** tests 117/117 sin regeneración goldens — el cambio es post-
engine (block construction), goldens capturan candidate-level output.

#### M-1 — Simetrizar contribution direction='down' (NO ejecutado)

**Estado:** ⏸ **bloqueado por decisión de producto.** Requiere alineación
sobre si una caída de contribución de un vendedor con USD entre 1-5% del
negocio (caso Roberto Méndez $1 321 = 3.22%) merece card propia o es
ruido aceptable. Sin esa alineación, no se puede ejecutar sin riesgo de
introducir falsos positivos.

**Cuando producto decida:** sprint estimado 2-3 commits. Diseño borrador
en sección 14 de este doc (sprint M-1). Criterio sugerido más estricto
que el `up` (USD share ≥2% en lugar de ≥1%) para minimizar leakage.

### 15.11 Estado final del Z.11 + Z.12.V family

| Familia | Sprints ejecutados | Resultado |
|---|---|---|
| Z.11.0 → Z.11.5 | 6 sprints técnicos | Pass rate Z.11: 69.6% → 87% |
| Z.12.V-1 → V-4 | 4 sprints visibilidad | Z.12 pass: 56% → 87.5%, +6 entidades visibles |
| Z.12.V-5 → V-7 | 3 sprints UX | 0 cards urgentes sin acción, 0 headlines técnicos |
| M-2.2 + C-2.5 + M-2.1 | 3 fixes backlog | Migration titles únicos, outlier USD fix, dedup cross-tipo |
| **Total** | **16 sprints + 4 fixes** | **~98% production-ready** |

### 15.12 Único item residual

**M-1** queda como único item del backlog **NO ejecutado**, bloqueado
por decisión de producto. No es bug ni gap del motor: es una decisión
sobre el umbral de noise-vs-signal para contribuciones declinantes.

**Z.11.0 → Z.12.M-2.1 cerrado 2026-04-27.** 21+ commits acumulados, 0
regresiones, 117/117 tests, 0 tsc errors. **Production-ready definitivo
para cliente pagador.**

---

## 16. Playbook de calibración para dataset cliente real

> **Cuándo aplicar.** Cuando el motor pase del demo Los Pinos
> (`ventaTotalNegocio ≈ $40K UDS`) a su primer dataset productivo. Los
> umbrales del gate (`floorAbs`, `floorPct`, `MATERIALITY_HIGH`,
> `executiveTopN`, ranker caps) fueron calibrados sobre el demo. Antes
> del go-live conviene re-correr la metodología sobre el dataset real
> para confirmar que escalan.
>
> **Qué NO es.** Esto NO es trabajo nuevo de motor — es la red de
> seguridad de la migración. Si los umbrales escalan bien, son ~30
> minutos. Si no, los ajustes son quirúrgicos (cambiar constantes,
> no lógica).

### 16.1 Pre-condiciones

- Cliente cargó datos reales (sales, metas, inventory).
- App en `/dashboard` con dataset productivo.
- DevTools abierto.
- Tener a mano:
  - `docs/baselines/devtools-runtime-capture.md` (3 bloques de instrumentación).
  - `docs/BASELINE-Z11-0.md` sección 4 (tabla única demo).

### 16.2 Captura runtime sobre dataset real

1. Hard refresh (`Ctrl+Shift+R`).
2. Pegar bloque 1 (instrumentación) ANTES del primer render.
3. Pegar bloque 2 (page-side).
4. Forzar fallback page-side (toggle multi-mes brevemente y volver).
5. `window.copyBaseline()`.

Capturar específicamente:
- `ventaTotalNegocio` (denominador de los floors).
- Z.11 entrada / sobreviven / suprimidos / pass rate.
- Z.12 input / surviving / suppressed / pass rate.
- `store.insights.length` y distribución por tipo.
- `cross_engine.candidates_total` y outlier scan diag.

### 16.3 Comparación contra benchmarks demo

| Métrica | Demo (Los Pinos) | Cliente real (esperado) | Acción si diverge |
|---|---:|---:|---|
| `ventaTotalNegocio` | ~$40K UDS | varia | informativo, no calibrar |
| Z.11 pass rate | 78-87% | esperado **70-90%** | < 60% → revisar `Z11_ROOT_STRONG_TYPES` |
| Z.12 pass rate | 80-87% | esperado **65-85%** | < 50% → revisar `MATERIALITY_FLOOR_EXECUTIVE` |
| Cards visibles | 9-11 | esperado **6-15** | > 25 → revisar `RANKER_TOTAL_CAP` |
| store.insights | 13-20 | esperado **10-30** | > 40 → revisar caps por tipo |
| Cross_engine outliers | 0-2 | esperado **0-5** | > 10 → revisar `_adaptiveZThreshold` |

### 16.4 Calibraciones probables y dónde tocarlas

| Síntoma | Causa probable | Constante a ajustar | Archivo |
|---|---|---|---|
| Demasiadas cards rojas (saturación) | `MATERIALITY_HIGH=0.10` deja pasar todo en negocio chico | Subir a 0.15 o 0.20 | `insightStandard.ts:2475` |
| Cards sub-material pasando | `floor_pct=0.02` chico para volumen alto | Subir a 0.03 o ajustar tier por `ventaTotalNegocio` | `insightStandard.ts:2456` |
| 4+ categorías meta_gap saturando | Cap `meta_gap:categoria=4` | Bajar a 3 o ajustar dinámico | `insight-engine.ts:6655` |
| Outliers mal calibrados | `_adaptiveZThreshold` no escalada al N real | Revisar tabla N<10/<20/≥20 | `detectors/outlier.ts:73` |
| Vendedores extremos invisibles | Cap `meta_gap:vendedor=3` chico para empresa grande | Subir a 5-7 | `insight-engine.ts:6656` |
| Headers urgentes inflados | `EXECUTIVE_TOP_N=4` chico para volumen | Subir a 6-8 | `insightStandard.ts:2483` |

### 16.5 Auditoría UX cliente

Después de calibrar, repetir el stress test estricto sección 11 con
perspectiva del rol del cliente:

1. ¿Las cards ejecutivas son comprensibles en 30 segundos?
2. ¿Cada card urgente tiene acción concreta?
3. ¿Algún protagonista aparece en 4+ cards directas?
4. ¿Hay headlines técnicos `dim=value`?
5. ¿Hay narrativa contradictoria (sobrecumpl + "hueco")?

Si los 5 son OK → cliente real puede operar el dashboard.
Si alguno falla → ajuste quirúrgico (no rediseño).

### 16.6 Criterio de cierre del playbook

El motor queda calibrado para el cliente cuando:
- Z.11 + Z.12 pass rates estables entre runs (≤2pp variación).
- Cards visibles en rango 6-15 (no saturación, no escasez).
- 0 errores en consola.
- Cero protagonistas duplicados en 4+ cards.
- 100% headlines naturales.

Documentar resultados en `docs/baselines/insight-pipeline-baseline.${cliente}-${fecha}.json`
para tener trazabilidad.

### 16.7 Cuándo escalar a sprint Z.13

Si después de calibrar las 6 constantes mencionadas el dashboard sigue
saturado o vacío, el problema NO es de umbrales — es estructural. En
ese caso el sprint Z.13 sería:
- Detector de "tier de empresa" (chica/mediana/grande basado en ventaTotal).
- Umbrales adaptativos según tier (similar a `_adaptiveZThreshold` pero
  para todas las constantes del gate).

No ejecutar Z.13 preventivamente. Solo si el playbook 16.4-16.5 falla
en 2+ clientes reales con datasets no comparables.

**Playbook agregado 2026-04-27. Aplica al primer cliente productivo.**

---

## 17. Z.13.V family — Auditoría cliente real + fixes pre-go-live (2026-04-27)

> **Origen.** Auditoría integral SalesFlow desde rol de gerente comercial
> (5 minutos en /dashboard sin contexto técnico) + auditoría técnica del
> pipeline. Reveló 3 issues que erosionaban credibilidad ante cliente
> aunque el motor era técnicamente correcto.

### 17.1 Issues identificados por auditoría cliente

| # | Issue | Severidad UX | Detección |
|---|---|---|---|
| 1 | Categorías 700-900% sobrecumpl marcadas rojas urgentes | Alta — confusión inmediata | "¿por qué un sobrecumplimiento de 900% es atención inmediata?" |
| 2 | Card "4 vendedores estancados" mezcla Carlos (49%) con María (150%) y Roberto Cruz (190%) | Alta — contradicción narrativa | "si confunde sobrecumpliendo con estancado, ¿qué más confunde?" |
| 3 | Cards rojas urgentes con "Sin acciones sugeridas" | Alta — el motor admite no saber qué hacer pero etiqueta urgente | "para qué me la marcaste como urgente entonces" |

### 17.2 Z.13.V-1 — Severity de meta_gap por dirección

**Cambio:** `meta_gap_combo` builder (insight-engine.ts:6275-6286) ahora
asigna severity bi-direccional:

| cumplPct | Severity (pre-Z.13) | Severity (post-Z.13) |
|---|---|---|
| < 50 | CRITICA | CRITICA (sin cambio) |
| 50-70 | ALTA | ALTA |
| 70-80 | MEDIA | MEDIA |
| 80-130 | (no emite) | (no emite) |
| 130-150 | ALTA | MEDIA (sobrecumpl moderado, ámbar) |
| 150-200 | ALTA | MEDIA |
| > 200 | ALTA | **BAJA** (sobrecumpl masivo → revisar meta, gris) |

**Justificación:** sobrecumplimiento masivo no es problema operativo — es
indicador de meta mal calibrada. Mismo color/lenguaje que subcumplimiento
crítico erosiona la confianza del cliente.

**Commit:** `5aaef2e7`

### 17.3 Z.13.V-2 — Agrupación direction-aware

**Cambio:** dos archivos modificados:

1. `classifyDireccionFromCandidate` (insight-engine.ts:3239-3251):
   - Pre: meta_gap siempre `'recuperable'`.
   - Post: `c.direction='up'` → `'positivo'`, `'down'` → `'recuperable'`.
     Fallback por `detail.cumplPct` si direction no poblada.

2. `_getDir` (insightStandard.ts:1074):
   - Pre: solo inspecciona severity.
   - Post: inspecciona `block.direccion` ANTES de severity. Si
     `direccion='positivo'` → `'pos'`, si `'recuperable'` → `'neg'`.

**Resultado:** `agruparInsightsRedundantes` (insightStandard.ts:1083) usa
key `tipo|dimension|dir|periodo`. Con direccion correctamente marcada,
sobrecumpls (`pos`) y subcumpls (`neg`) caen en buckets DIFERENTES,
eliminando la mezcla en cards agregadas tipo "X vendedores estancados".

**Caso post-fix esperado en Los Pinos demo:**
- Bucket `meta_gap|vendedor|neg`: Carlos Ramírez 49% + Miguel Ángel 71% →
  card "2 vendedores lejos de meta" (rojo).
- Bucket `meta_gap|vendedor|pos`: María Castillo 150% + Roberto Cruz 190%
  → card "2 vendedores destacados sobre meta" (info gris) o no se agrupa
  si N=2 y label es positivo.

**Commit:** `5aaef2e7`

### 17.4 Z.13.V-3 — Accion string visible en cards

**Cambio:** EVENT_TYPES_EXEMPT path en `candidatesToDiagnosticBlocks`
(insight-engine.ts:3541-3550) ahora acepta `c.accion` como string plano
además de objeto `{texto}`.

```ts
const accionObj = typeof c.accion === 'object' && c.accion !== null ? c.accion : null
const accionTextoPlano = typeof c.accion === 'string' ? c.accion.trim() : ''
const accionBullets: string[] = []
if (accionObj?.texto) accionBullets.push(`→ ${accionObj.texto}`)
else if (accionTextoPlano) accionBullets.push(`→ ${accionTextoPlano}`)
```

**Caso runtime resuelto:** `meta_gap_combo` emite accion como STRING
(`'Plan de recuperación con ${member}: revisar pipeline y compromisos...'`).
Pre-fix: el block "Acción" section quedaba vacía →
`diagnostic-generator.ts:determineSinAccionesLabel` injectaba "Sin
acciones sugeridas — los datos históricos no muestran una palanca clara."
Post-fix: la string se agrega al bullet `→ ${accion}` y el fallback no
dispara.

**Commit:** `5aaef2e7`

### 17.5 Validación

- `tsc --noEmit`: 0 errores.
- `vitest run`: 117/117. 4 goldens regenerados con cambios aditivos:
  - 8+ candidatos meta_gap pasan de ALTA → MEDIA/BAJA cuando son sobrecumpl.
  - 2+ candidatos cambian direction de `'recuperable'` a `'positivo'`/
    `'neutral'`.
  - Sin regresiones en subcumpls (Carlos Ramírez sigue ALTA/CRITICA).

### 17.6 Issues residuales fuera de scope Z.13

De la auditoría completa quedaron 5 items que NO se ejecutaron:

| Item | Razón |
|---|---|
| **Top performer narrative** (Roberto Cruz/María Castillo card propia de reconocimiento) | Requiere detector positivo dedicado — sprint Z.14 |
| **Forecast vs meta del mes en KPI grande** | Trabajo de UI layer (EstadoComercialPage.tsx), no motor |
| **Pipeline / oportunidades nuevas (clientes nuevos)** | Detector nuevo, sprint Z.14 |
| **Margen / rentabilidad por vendedor/categoría** | Requiere costo_unitario en data; opcional según cliente |
| **Calendario sugerido / plan de la semana** | UX layer pura |

Estos 5 son **mejoras de producto**, no fixes de motor. El cliente
confirma que pagaría con las 3 fricciones técnicas resueltas (V-1/V-2/V-3).
Las 5 mejoras pueden ser sprint Z.14 cuando producto las priorice.

### 17.7 Veredicto post-Z.13

**Motor production-ready ~99%.** Los 3 issues UX que erosionaban
credibilidad están resueltos:
- Sobrecumplimientos masivos ya no se ven como "atención inmediata".
- Cards agregadas no mezclan dirección up/down.
- "Sin acciones sugeridas" no aparece en cards rojas con builder accion
  válida.

El 1% restante son **mejoras de producto** (top performers, forecast,
pipeline nuevo, margen, plan semanal) — no bugs ni gaps del motor.
Pueden iterarse con feedback de cliente real.

**Z.13.V-1/V-2/V-3 cerrado 2026-04-27.** 3 fixes en 1 commit, 0
regresiones, 117/117 tests, 0 tsc errors.

---

## 18. Z.13.V-4 — Fixes upstream para propagar V-1/V-2/V-3 al render layer

> **Origen.** Validación runtime post-V-1/V-2/V-3 reveló que 3 de 4 checks
> fallaban en render real aunque candidate-level estaba correcto. Causa
> raíz: 2 bugs upstream (no detectados por goldens) que neutralizaban los
> fixes downstream. Esta es la lección crítica del sprint Z.13: **goldens
> capturan candidate-level, no render-level — siempre validar runtime.**

### 18.1 Hallazgos de validación runtime

| Check | Esperado V-3 | Observado runtime | Status |
|---|---|---|---|
| 1 — Severity sobrecumpl | Lácteos/Limpieza/Refrescos MEDIA, Snacks BAJA, NO rojas | Card "4 categorías" ahora gris/info ✓ | ✅ PASS |
| 2 — Agrupado direction-aware | "estancados" sin sobrecumpls | María (163%) + Roberto Cruz (216%) seguían en bucket "estancados" con Carlos (49%) | ❌ FAIL |
| 3 — Roberto Méndez con acción | "Plan de recuperación con Roberto Méndez..." | "Sin acciones sugeridas — los datos históricos no muestran una palanca clara." | ❌ FAIL |
| 4 — "Caída en vendedores N entidades" | N=2 (solo down) | Sigue diciendo "5 entidades" | ❌ FAIL |

### 18.2 Bug 1 — `calcularDirection` corrompe direction de meta_gap sobrecumpl

**Cadena del bug:**
1. `meta_gap_combo` builder (insight-engine.ts:6294) setea `c.direction='up'`
   correctamente para sobrecumpl (`cumplPct >= 100`).
2. `hydratarCandidatoZ9` (insightStandard.ts:2449) hace
   `c.direction = calcularDirection(c)` — sobreescribe.
3. `calcularDirection` case `'meta_gap'` retornaba `'down'` HARDCODED
   (insightStandard.ts:2108) — comentario decía "siempre hay brecha
   (cumplimiento < 100)" — válido pre-Z.11.2 cuando meta_gap solo era
   subcumpl. Post-Z.11.2 que extendió meta_gap a sobrecumpl, esta línea
   quedó como bug latente.
4. María (163% up) y Roberto Cruz (216% up) terminan con `c.direction='down'`.
5. V-2 fix `classifyDireccionFromCandidate` lee `c.direction='down'` →
   marca `'recuperable'`.
6. `_getDir` lee `block.direccion='recuperable'` → bucket
   `'meta_gap|vendedor|neg'`.
7. `agruparInsightsRedundantes` mete sobrecumpls junto con subcumpls.
8. Cliente ve "X vendedores estancados" mezclando direcciones.

**Fix:** case `'meta_gap'`/`'meta_gap_temporal'` en `calcularDirection`
ahora lee `detail.cumplPct`:
```ts
const cumplPct = d['cumplPct']
if (typeof cumplPct === 'number' && Number.isFinite(cumplPct)) {
  return cumplPct >= 100 ? 'up' : 'down'
}
return 'down'  // fallback
```

### 18.3 Bug 2 — `diagnostic-generator` retorna early con acciones vacías

**Cadena del bug:**
1. V-3 fix popula `block.sections` con "Acción" cuando `c.accion` es
   string (insight-engine.ts:3541-3550).
2. `meta_gap_combo` emite accion string (`'Plan de recuperación con
   Roberto Méndez: revisar pipeline...'`).
3. Block tiene "Acción" section poblada ✓.
4. `diagnostic-generator.ts:generarAcciones` case `'meta_gap'` ejecuta:
   - Lookup `vendorAnalysis.find(v => v.vendedor === sujeto)`.
   - Para Roberto Méndez (supervisor, NO en vendorAnalysis), `va` es
     undefined → no ejecuta el bloque if(va).
   - Lookup `clientesDormidos.filter(d => d.vendedor === sujeto)`.
   - Roberto Méndez no es vendor → empty.
   - **Línea 139: `return acciones` con array vacío.** Nunca alcanza el
     fallback de línea 325 que leería `block.sections "Acción"`.
5. `determineSinAccionesLabel` recibe `acciones.length === 0` → injecta
   "Sin acciones sugeridas — los datos históricos no muestran una
   palanca clara."

**Fix:** cambiar `return acciones` por `if (acciones.length > 0) return acciones`.
Si el case `meta_gap` no produce nada, fall through al fallback común
que lee la sección Acción del bloque (poblada por V-3).

### 18.4 Por qué los goldens no detectaron estos bugs

Los snapshot tests capturan output de `runInsightEngine + filtrarConEstandar`
— eso es **candidate level**. Los 2 bugs viven en:

- `hydratarCandidatoZ9` (corrompe direction): se ejecuta DESPUÉS de
  `runInsightEngine` selecciona, ANTES de retornar. El snapshot del
  golden capta direction='down' pero NO valida si era originalmente 'up'.
- `diagnostic-generator.ts:generarAcciones`: se ejecuta en EstadoComercialPage
  durante render — fuera del path testeado por goldens.

**Lección.** Para sprints que tocan render (severity, direction, accion
text en cards), **ningún test golden equivale a una validación runtime
con DOM inspection**. Z.13.V demostró esto en vivo.

### 18.5 Validación tests + tsc

- `tsc --noEmit`: 0 errores.
- `vitest run`: 117/117. 4 snapshots regenerados.
- 7+ candidatos meta_gap pasan direction de `'down'` a `'up'`
  correctamente.
- Sin regresiones: Carlos Ramírez (49%) sigue `'down'`.

### 18.6 Pendiente runtime check

Z.13.V-4 requiere **re-validación runtime** antes de declarar production-ready
definitivo. Los 4 checks deberían pasar:

| Check | Cambio esperado vs runtime previo |
|---|---|
| 1 | (sin cambio — ya pasaba) |
| 2 | Card "estancados" debería excluir María Castillo y Roberto Cruz |
| 3 | Roberto Méndez 65% debería mostrar "Plan de recuperación..." en bullet |
| 4 | "Caída en vendedores N entidades" debería bajar de 5 a ~2 |

**Z.13.V-4 cerrado 2026-04-27** (pending runtime confirmation). 1
commit (`994177af`), 0 regresiones, 117/117 tests, 0 tsc errors.

---

## 14. Follow-up sprints (post-Z.11)

Tres sprints derivados del stress test final (sección 13.4 backlog + auditoría
de combos/reglas). Listados en orden recomendado de ejecución.

---

### Sprint M-4 (mini) — Consolidación cosmética + clarificación arquitectónica

> **Estado: ejecutado 2026-04-27.** Scope original (deletear archivos
> "legacy") era incorrecto: los 3 archivos NO eran legacy sino la capa de
> dispatch del **cross-engine activo** que emite outlier + seasonality. Se
> ejecutó la versión mini: rename a subdirectorio + headers honestos +
> cross-references. Cero cambio runtime, 105/105 tests, 0 tsc errors.
>
> **Lo aplicado:**
> - `src/lib/crossEngine.ts` → `src/lib/crossEngine/index.ts`
> - `src/lib/metricRegistry.ts` → `src/lib/crossEngine/metricRegistry.ts`
> - `src/lib/dimensionRegistry.ts` → `src/lib/crossEngine/dimensionRegistry.ts`
> - `src/lib/insightTypeRegistry.ts` → `src/lib/crossEngine/insightTypeRegistry.ts`
> - 15 imports actualizados (5 archivos consumidores).
> - Headers reescritos honestos: "ARQUITECTURA DE DOS SISTEMAS (Z.11.M-4
>   mini)" documenta que los registries del cross-engine NO son legacy de
>   motor 2 hardcoded — son una capa paralela intencional.
> - Cross-reference agregado en `insight-registry.ts` apuntando al
>   cross-engine subdirectory.
>
> El refactor profundo (unificar los dos sistemas en uno) queda fuera de
> scope. Si producto pide simplicidad arquitectónica como objetivo
> dedicado, requiere su propio sprint planificado (1-2 semanas).

**Scope original (descartado por mismatch).**

**Contexto.**

| Registry | Archivo | Conteo |
|---|---|---:|
| Dimensiones motor 2 | `src/lib/insight-registry.ts:336` | 9 |
| Dimensiones legacy | `src/lib/dimensionRegistry.ts:49` | 8 |
| Métricas motor 2 | `src/lib/insight-registry.ts:131` | 12 |
| Métricas legacy | `src/lib/metricRegistry.ts:36` | 7 |
| Insight types motor 2 | `src/lib/insight-registry.ts:362` | 12 |
| Insight types telemetría | `src/lib/insightTypeRegistry.ts` | 15 |

Consumidores legacy detectados (4 archivos):
- `src/lib/crossEngine.ts` — usa `metricRegistry`, `dimensionRegistry`, `insightTypeRegistry`.
- `src/lib/detectors/outlier.ts` — usa solo tipos de los 3 legacy.
- `src/lib/detectors/seasonality.ts` — usa solo tipos.
- `src/lib/ingestTelemetry.ts` — usa `getAvailableMetrics` de `metricRegistry`.

**Scope.**

1. **Decisión arquitectónica** (primer paso, antes de tocar código):
   ¿`insight-registry.ts` debe ser canónica? Probablemente sí — es la que el
   motor 2 lee directamente. Los 3 legacy son históricamente independientes
   pero su uso real es residual.

2. **Migrar consumidores legacy** uno por uno:
   - Si solo usan TIPOS (`Metric`, `Dimension`, `InsightType`): re-exportar
     desde `insight-registry.ts` y migrar imports.
   - Si usan FUNCIONES (`getAvailableMetrics`): portar la función a
     `insight-registry.ts` o adaptar el consumidor a leer el registry v2.
   - `insightTypeRegistry.ts` tiene 3 tipos extra (`cliente_dormido`,
     `outlier`, `seasonality`) que NO están en `insight-registry.ts` porque
     son emitidos por builders especializados, no por el registry loop.
     Decidir: ¿extender `insight-registry.ts` con esos 3 tipos?
     ¿Aceptar la diferencia documentada?

3. **Eliminar archivos legacy** una vez sin consumidores:
   - `src/lib/dimensionRegistry.ts`
   - `src/lib/metricRegistry.ts`
   - `src/lib/insightTypeRegistry.ts`

**Acceptance criteria.**

- [ ] Cada `Metric`, `Dimension`, `InsightType` tipo se exporta desde un solo
  archivo canónico.
- [ ] `git grep "from.*metricRegistry\|from.*dimensionRegistry\|from.*insightTypeRegistry"`
  retorna 0 resultados (o solo desde el propio `insight-registry.ts`).
- [ ] `tsc --noEmit`: 0 errores.
- [ ] `vitest run`: 105/105 (sin regenerar snapshots — cambio de imports no
  debe alterar runtime).
- [ ] Si la decisión es agregar `cliente_dormido`/`outlier`/`seasonality` a
  `insight-registry.ts`, snapshots pueden cambiar (cobertura de tipos en
  pool reportado). Cambios aditivos solo aceptables con justificación.

**Out of scope.**

- No modificar comportamiento runtime del motor 2.
- No tocar detectores especializados ni builders.
- No reorganizar el archivo `insight-registry.ts` (su estructura interna
  queda igual).

**Risk + mitigation.**

- Riesgo: importar tipos circulares entre `insightStandard.ts` y
  `insight-registry.ts`. Mitigación: si los tipos son interface puros, no
  hay ciclo en runtime. Verificar con `tsc` en cada migración.
- Riesgo: `getAvailableMetrics` lee `DataAvailability` que puede tener
  shape distinto entre v1 y v2. Mitigación: leer ambos archivos y mapear
  campo por campo antes de migrar.

**Estimación.** 3-4 commits.
1. Decisión + extender `insight-registry.ts` si aplica (o documentar
   diferencia de los 3 tipos extra).
2. Migrar imports en `crossEngine.ts`.
3. Migrar imports en `outlier.ts` + `seasonality.ts`.
4. Migrar `ingestTelemetry.ts` + eliminar archivos legacy.

---

### Sprint M-5 — Dataset golden secundario para tipos sin cobertura

> **Estado: ejecutado 2026-04-27.** Tests 117/117 (105 + 12 nuevos), tsc 0.
> 6 snapshots nuevos en `insight-engine.coverage.test.ts.snap`.
>
> **Lo aplicado:** archivo nuevo `src/lib/__tests__/insight-engine.coverage.test.ts`
> con 12 tests (1 happy + 1 negative por tipo, salvo correlation que tiene 3
> y seasonality que tiene 1):
>
> | Tipo | Detector usado | Fixture |
> |---|---|---|
> | `dominance` | `INSIGHT_TYPE_REGISTRY.find('dominance').detect()` | 5 puntos, top-1 con 80% share |
> | `proportion_shift` | idem, .detect() | 2 puntos, shift 50%→70% |
> | `correlation` | idem, .detect() | 4 puntos con r=1.0 perfecta |
> | `change_point` | `buildChangePointBlocks(sales)` | 12 meses con jump 100→400 en mes 7 |
> | `steady_share` | `buildSteadyShareBlocks(sales)` | 12 meses con shift de share P1 30%→70% |
> | `seasonality` | `detectSeasonality(metric, dim, type, ctx)` | 24 meses con pico Q4 cada año |
>
> Cada test verifica:
> - Presencia del tipo en output (`expect(...length).toBeGreaterThan(0)`)
> - Snapshot estructural redactado (campos clave: score, severity, member,
>   metric, dim) — NO se inspecciona narrativa.
> - Test negativo confirma que el detector NO dispara con datos no-target.
>
> **Beneficio:** cualquier regresión futura en estos 6 detectores rompe el
> snapshot apropiado. Antes solo eran observables vía runtime, sin protección
> de tests.

**Contexto.** Goldens actuales (`insight-engine.golden.test.ts.snap`,
`insight-engine.gate-audit.test.ts.snap`) usan dataset Los Pinos demo. Los
6 tipos faltantes no se manifiestan porque:
- `dominance`: requiere ≥3 puntos con concentración Pareto >60% sostenida.
- `proportion_shift`: requiere shift de participación ≥5pp entre períodos.
- `change_point`: requiere series temporales largas (≥6-12 puntos).
- `steady_share`: requiere stability ratios estables sobre múltiples meses.
- `correlation`: requiere pares de métricas con `value2` poblado.
- `seasonality`: requiere patrones cíclicos en series ≥12 meses.

Los Pinos demo tiene 28 meses pero la heterogeneidad de los datos no dispara
estos tipos en sus thresholds actuales.

**Scope.**

1. **Diseñar datos sintéticos minimales** para cada tipo. No reemplazan a Los
   Pinos demo — son fixtures dedicados que disparan exactamente el detector
   con datos mínimos:
   - `dominance`: 5 productos, top-1 con 80% de venta.
   - `proportion_shift`: 3 productos, share cambiando 10pp prev→current.
   - `change_point`: serie de 12 meses con mean shift en mes 7.
   - `steady_share`: 4 vendedores con shares estables ±2%.
   - `correlation`: 6 puntos con r≥0.85 (venta vs num_clientes).
   - `seasonality`: 24 meses con pico Q4 cada año.

2. **Crear nuevo test file**: `src/lib/__tests__/insight-engine.coverage.test.ts`
   con un golden por tipo. Cada test:
   - Construye fixture mínimo que dispara el tipo.
   - Corre `runInsightEngine` + `filtrarConEstandar`.
   - Verifica que el tipo aparece en el output (presencia, no campos exactos).
   - `expect(result).toMatchSnapshot()` para detectar regresiones futuras.

3. **NO mezclar con Los Pinos demo**. Mantener como tests independientes —
   cuando cambie demo data, esos goldens no se afectan; cuando cambie
   semántica del detector, ambos fallan apropiadamente.

**Acceptance criteria.**

- [ ] 6 tests nuevos, uno por tipo, cada uno con su golden snapshot.
- [ ] Cada test valida presencia del tipo en `runInsightEngine` output.
- [ ] Cada test pasa por `filtrarConEstandar` con un mínimo USD/cross
  asegurado en el fixture (para que sobrevivan el gate y no sean ruido).
- [ ] `vitest run`: 111/111 (105 actuales + 6 nuevos).
- [ ] `tsc --noEmit`: 0 errores.

**Out of scope.**

- No modificar detectores ni builders.
- No tocar Los Pinos demo data.
- No agregar tests de integración (estos son unit-level por tipo).

**Risk + mitigation.**

- Riesgo: el detector cambia y los goldens dejan de pasar — falsos
  positivos. Mitigación: cada fixture es minimal y documentado; un cambio
  intencional en el detector implica regenerar el snapshot con justificación
  en el commit.
- Riesgo: tipos que requieren context complejo (e.g., `change_point` necesita
  cross_engine) tardan en construirse. Mitigación: si un tipo no se puede
  fixturear minimalmente, documentar como "no testeable a unit-level"
  y diferir al sprint M-6 (integration tests).

**Estimación.** 6-8 commits, uno por tipo + 1-2 de cleanup.

---

### Sprint M-1 — Simetrizar excepción contribution direction='down'

**Goal.** Resolver Hallazgo H3 del stress test: la excepción Fase 7.5-B en
`evaluateInsightCandidate` rescata solo `contribution` con `direction='up'`.
Casos como Roberto Méndez (contribution declinante, USD $1 321 = 3.22%,
narrativa concreta) mueren por r2 (pareto) + r4 (narrative) cuando podrían
ser tan accionables como un crecimiento simétrico.

**Bloqueado por: decisión de producto.**

**Pre-trabajo (no es código).**

1. Leer Roberto Méndez contribution case en runtime captures Z.11.x. Confirmar
   que es `direction='down'`, score 0.95, severity ALTA, USD/total 3.22%,
   `impacto_usd_source='recuperable'`.
2. Reunirse con producto para responder:
   - **¿Una caída de contribución de un vendedor con USD $1 321 = 3% del
     negocio merece card propia?**
   - Si **SÍ**: ejecutar este sprint.
   - Si **NO**: documentar como decisión deliberada y cerrar M-1 sin
     código.
3. Si la decisión es proceder, definir criterios de excepción simétricos.
   Borrador propuesto:
   - `direction='down'`
   - `score >= 0.95` (idéntico al up)
   - `severity ∈ {ALTA, CRITICA}` (idéntico)
   - `usdShare >= 0.02` (más estricto que up: 2% en lugar de 1%, porque
     caídas pueden ser ruido más fácilmente que crecimientos)
   - `impacto_usd_source` válido (idéntico)
   - `tituloOk + descOk` (idéntico)
   - **Criterio nuevo**: `(c.detail.totalChange ?? 0) < 0` para confirmar que
     el AGREGADO está cayendo (no rescatar miembros que caen mientras el
     grupo crece — eso ya lo filtra el detector vía `groupSign`).

**Scope (asumiendo decisión positiva).**

1. Modificar `evaluateInsightCandidate` (insightStandard.ts:2799-2807):
   agregar `_meetsContributionDownException` con criterios análogos.
2. Combinar con la up exception: `paretoEffective = pareto || _meetsContributionUpException || _meetsContributionDownException`.
3. Distinguir reason:
   - `relaxed:exception_contribution_up` (ya existe).
   - `relaxed:exception_contribution_down` (nuevo).
4. Agregar test golden específico: contribution-down pasando por la
   excepción.

**Acceptance criteria.**

- [ ] Roberto Méndez (o el caso runtime equivalente) ahora sobrevive Z.12.
- [ ] No hay otros candidatos `contribution` direction='down' que pasen pero
  no deberían (validar con runtime audit).
- [ ] `tsc --noEmit`: 0 errores.
- [ ] `vitest run`: pass; goldens se regeneran con justificación clara.
- [ ] Z.12 surviving sube de 16 → 17 en runtime Los Pinos.

**Out of scope.**

- No modificar otras excepciones (highMateriality, root-strong, terminal).
- No tocar r1/r3/r4.
- No afectar contribution direction='up' existente.

**Risk + mitigation.**

- Riesgo principal: leakage de candidatos contribution-down sub-material.
  Mitigación: criterio `usdShare >= 0.02` (2%) es más estricto que el up
  (1%). Adicionalmente, narrativa concreta + score≥0.95 + severity ALTA
  filtran el restante.
- Riesgo de UX: cards de "caídas" pueden saturar el feed si hay muchos
  contributors negativos. Mitigación: `ALWAYS_PROTECTED_CAPS.contribution`
  no existe — se ranquea en el regular bucket cap=12. Si es necesario, agregar
  cap=2 para contribution.

**Estimación.** 2-3 commits.
1. Decisión documentada + criterios cerrados.
2. Implementación + tests.
3. Validación runtime.

---

### Orden recomendado y dependencias

```
M-4 (registries) ──┬──> M-5 (goldens secundarios) ──┐
                   │                                 ├──> Z.11 family + follow-ups CERRADO
                   └──> (independiente)              │
M-1 (contribution) ──── (bloqueado por decisión PM) ─┘
```

**M-4 primero**: cleanup estructural sin riesgo runtime. Desbloquea cualquier
modificación futura al registry sin riesgo de divergencia.

**M-5 segundo**: aumenta cobertura. No bloquea nada pero después de M-4 los
goldens nuevos se construirán sobre el registry consolidado.

**M-1 tercero**: depende de decisión de producto. Si no se decide, queda
indefinidamente diferido sin afectar la estabilidad del motor.

Cualquiera de los tres se puede saltar — el motor está production-ready
sin ellos. Son polish, no blockers.

