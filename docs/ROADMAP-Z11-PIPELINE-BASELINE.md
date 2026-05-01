# Roadmap Z.11 - Baseline real del pipeline de insights

> **Estado:** activo, no ejecutado.
> **Regla principal:** Z.11 empieza con un sprint forense. No se cambia codigo
> funcional hasta cerrar Z.11.0 con una baseline unica.
>
> **Fuente de verdad:** este documento manda sobre cualquier roadmap previo de
> visibilidad del motor mientras Z.11.0 este abierto.

---

## Prompt definitivo para retomar

Sos un ingeniero senior de TypeScript trabajando en SalesFlow. Tu tarea es
ejecutar **Sprint Z.11.0 - Baseline real del pipeline de insights**.

Contexto:
- El repo tiene evidencia contradictoria sobre el pipeline de insights.
- Un audit runtime reporto pass rate Z.11 de 16.7% con `sin-usd` dominante.
- Los goldens/audit tests del repo muestran un panorama distinto: pool selected
  con fallos dominados por Pareto/narrativa/materialidad y
  `monetaryCoherence: 0`.
- `analysisWorker.ts` corre motor 2 para `store.insights`.
- `EstadoComercialPage.tsx` vuelve a correr motor 2 para diagnostic blocks.
- `resolveImpactoUsd()` vive en `insightStandard.ts`, pero `runInsightEngine()`
  conserva normalizacion local de `impacto_usd_*`.
- `Z11_ROOT_STRONG_TYPES` y `Z12_ROOT_STRONG_TYPES` son listas separadas.
- `tipo-debil(...)` probablemente no es una blacklist formal, sino el negativo
  de "no esta en Z11 root-strong cuando `usd == null`"; confirmalo leyendo el
  codigo.

Reglas duras:
- No tocar `src/lib/insightEngine.ts` (motor 1).
- No tocar reglas del gate, ranker, caps, builders ni listas.
- No regenerar snapshots.
- No instalar librerias.
- No cambiar codigo funcional durante Z.11.0.
- Solo se permite documentacion y artefactos de baseline.

Entregables de Z.11.0:
1. `docs/BASELINE-Z11-0.md` completo con la tabla unica del pipeline.
2. Conteos crudos auditables en `docs/baselines/insight-pipeline-baseline.z11-0.json`
   si el owner autoriza un artefacto JSON; si no, pegar el dump reducido dentro
   del Markdown.
3. Comparacion worker vs page-side:
   - `[Step B] motor2_insights` del worker.
   - `_insightCandidates` y `_filteredCandidates` de `EstadoComercialPage`.
   - runtime audit page-side (`recordInsightRuntimeAuditReport` /
     `getLastInsightRuntimeAuditReport`).
   - misma funcion + mismos inputs deben producir mismos conteos; si no,
     documentar el input divergente.
4. Inventario de duplicacion USD:
   - que cubre `resolveImpactoUsd()` en `insightStandard.ts`.
   - que cubre la normalizacion local de `runInsightEngine()` en
     `insight-engine.ts`.
   - divergencias por `insightTypeId` y por `metricId`.
5. Inventario real de listas:
   - `Z11_ROOT_STRONG_TYPES`.
   - `Z12_ROOT_STRONG_TYPES`.
   - `Z12_VALID_USD_SOURCES`.
   - `Z12_NON_MONETARY_METRIC_IDS` y `NON_MONETARY_METRIC_IDS`.
   - existencia real o no de blacklist formal de "tipos debiles".
6. Reconciliacion documental:
   - README, CLAUDE, MANIFIESTO, GLOSARIO y roadmaps previos no deben inducir
     a ejecutar fixes funcionales antes de Z.11.0.

Criterio de cierre:
- La baseline responde sin ambiguedad:
  1. Worker y page-side corren con los mismos inputs?
  2. Si no, que input diverge?
  3. Si si, por que los conteos previos no coincidian?
  4. Que funcion decide `impacto_usd_*` en cada etapa?
  5. `tipo-debil` es lista real o derivado de no-root-strong?
  6. Cual es el baseline oficial de tests y runtime actual?
- Solo despues de cerrar Z.11.0 se puede escribir o ejecutar Z.11.1.

---

## Por que existe Z.11

El roadmap anterior de visibilidad desbloqueo varios tipos, pero dejo dos
riesgos estructurales:

1. **Evidencia no reconciliada.** Los numeros de navegador, goldens y docs no
   cuentan la misma historia. Puede ser diferencia de periodo, dataset, fase
   del pipeline, o runtime worker vs page.
2. **Ownership duplicado.** Hay dos sitios que pueden decidir USD normalizado,
   dos listas root-strong, y un filtro Z.11 intermedio fuera del gate canonico
   Z.12.

Resolver una regla aislada antes de medir esto puede arreglar el runtime
equivocado.

---

## Sprints Z.11

### Sprint Z.11.0 - Baseline real del pipeline

**Tipo:** forense/documental.

**Goal:** reconciliar tests, runtime, docs y ownership antes de cualquier fix.

**Acceptance:**
- `docs/BASELINE-Z11-0.md` existe y contiene:
  - dataset usado, fecha de captura, branch, commit o dirty-state resumido.
  - `npx tsc --noEmit` y `npx vitest run` actuales.
  - tabla unica por etapa: bruto, selected, Z.11, Z.12, adapter,
    executive compression, residual, diagnostic blocks.
  - comparacion worker vs page-side.
  - inventario USD y listas.
- Si worker y page-side difieren, la causa queda documentada.
- Si no difieren, queda documentado por que el audit viejo y los goldens no
  eran comparables.

**Validation:**
- No hay cambios funcionales.
- No hay snapshots regenerados.
- Cualquier cambio de docs explica que Z.11.1 esta bloqueado hasta cerrar este
  sprint.

**Risk:** bajo. El riesgo es medir incompleto y declarar baseline falsa.

**Deps:** ninguna.

---

### Sprint Z.11.1 - Resolver USD canonico

**Tipo:** funcional, bloqueado por Z.11.0.

**Goal:** una sola fuente de verdad para `impacto_usd_normalizado` y
`impacto_usd_source`.

**Acceptance:**
- `runInsightEngine()` no mantiene una matriz propia divergente si
  `resolveImpactoUsd()` puede cubrir el caso.
- Las diferencias inevitables entre builder-time y gate-time quedan
  documentadas por tipo.
- Tests especificos cubren al menos:
  - `cliente_perdido`
  - `cliente_dormido`
  - `stock_risk`
  - `stock_excess`
  - `cross_delta`
  - no-monetarios declarados.

**Validation:**
- `npx tsc --noEmit`.
- `npx vitest run`.
- Snapshot golden solo cambia si el diff de baseline Z.11.0 lo justifica.

**Risk:** medio. Tocar USD afecta ranker, Pareto, materialidad y render.

**Deps:** Z.11.0 cerrado.

---

### Sprint Z.11.2 - Supervivencia Z.11 canonica

**Tipo:** funcional, bloqueado por Z.11.1.

**Goal:** eliminar la deriva entre Z.11 y Z.12 para root-strong y reglas de
supervivencia.

**Acceptance:**
- `Z11_ROOT_STRONG_TYPES` y `Z12_ROOT_STRONG_TYPES` ya no divergen sin una
  razon documentada.
- `tipo-debil` queda definido formalmente:
  - si es derivado, se documenta como `usd == null && !rootStrong`.
  - si existe una blacklist real, se documenta y se testea.
- La decision de agregar o quitar tipos terminales queda basada en baseline,
  no en intuicion.

**Validation:**
- Tests directos de supervivencia Z.11 para tipos root-strong y no-root-strong.
- Audit de suprimidos mantiene razones estables.

**Risk:** medio. Cambia que llega al gate Z.12.

**Deps:** Z.11.0 y Z.11.1 cerrados.

---

### Sprint Z.11.3 - Runtime unico o comparacion permanente

**Tipo:** arquitectura/runtime.

**Goal:** resolver o monitorear la doble corrida de motor 2 entre worker y
page-side.

**Acceptance:**
- Opcion A: page-side consume candidatos/audit producidos por worker cuando el
  input es equivalente.
- Opcion B: se conserva doble corrida, pero existe telemetria permanente que
  prueba igualdad de inputs y outputs.
- El usuario no puede ver una pagina que contradiga `store.insights` sin que el
  audit lo detecte.

**Validation:**
- Test o harness de comparacion deterministica.
- Captura de navegador con Los Pinos.

**Risk:** medio-alto. EstadoComercialPage tiene mucho acoplamiento visual.

**Deps:** Z.11.0 cerrado.

---

### Sprint Z.11.4 - Politica de tipos terminales accionables

**Tipo:** producto + gate.

**Goal:** definir cuando tipos terminales como `cliente_perdido`,
`cliente_dormido`, `stock_risk` y `stock_excess` deben sobrevivir aunque no
sean Pareto clasico.

**Acceptance:**
- Politica documentada por tipo:
  - impacto minimo.
  - evidencia cruzada minima.
  - narrativa/accion minima.
  - tratamiento USD vs no-monetario.
- No se baja materialidad global.
- No se rescatan tipos por nombre sin criterio verificable.

**Validation:**
- Tests por tipo con casos positivos y negativos.
- Runtime Los Pinos mantiene diversidad sin ruido obvio.

**Risk:** alto. Este sprint puede cambiar la experiencia del usuario.

**Deps:** Z.11.1 y Z.11.2 cerrados.

---

### Sprint Z.11.5 - Hardening de observabilidad y docs

**Tipo:** cierre.

**Goal:** que cualquier regresion futura del pipeline sea visible sin abrir
DevTools manualmente.

**Acceptance:**
- Runtime audit expone todas las etapas necesarias para comparar:
  - candidates total
  - selected
  - Z.11 suppressed
  - Z.12 filtered
  - adapter
  - executive problems
  - residual
  - diagnostic blocks
- MANIFIESTO y GLOSARIO reflejan el ownership final.
- Roadmaps historicos quedan marcados como historicos o superseded si aplica.

**Validation:**
- Tests verdes.
- Docs sin conteos contradictorios de tests/baseline.

**Risk:** bajo-medio. Mucha documentacion, poco comportamiento.

**Deps:** Z.11.0-Z.11.4 cerrados.

---

## Roadmaps previos y estado

| Documento | Estado bajo Z.11 |
|---|---|
| `docs/ROADMAP-MOTOR-VISIBILITY.md` | Historico. No ejecutar nuevos cambios desde ahi hasta cerrar Z.11.0. |
| `docs/ROADMAP-INGESTA-REGISTRY.md` | Independiente. Sus conteos historicos de tests no son baseline actual del motor. |
| `docs/MANIFIESTO-MOTOR-INSIGHTS.md` | Contrato operativo, pero su baseline numerica debe ser revalidada por Z.11.0. |
| `docs/GLOSARIO-MOTOR-INSIGHTS.md` | Mapa de ownership. Debe apuntar a este roadmap para trabajo Z.11. |
| `_docs/` | Wiki legacy. No usar como fuente activa de motor. |

---

## Anti-scope-creep

- No convertir Z.11.0 en fix.
- No tocar motor 1.
- No mover reglas solo porque parecen duplicadas: primero inventario, despues
  decision.
- No actualizar snapshots para "hacer pasar" un cambio documental.
- No mezclar este roadmap con ingesta registry-driven.
- No resolver forecast/backend aqui.

