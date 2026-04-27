# Runtime Capture - Z.11.0

> Script y prompt para que Claude en Chrome capture la baseline runtime
> requerida por `docs/BASELINE-Z11-0.md`. NO modifica codigo. NO modifica
> snapshots. Solo lee estado y escribe a window.

---

## 0. Pre-requisitos

1. App corriendo en local con dataset Los Pinos demo cargado.
2. Estar parado en `/dashboard` (EstadoComercialPage).
3. DevTools abierto, tab Console.
4. Build de desarrollo (Vite dev server). Si es production build, `import.meta.env.DEV` es false y muchos logs no aparecen.

---

## 1. Script de instrumentacion

Pegar este bloque ENTERO en la consola **antes** de recargar la pagina (Ctrl+Shift+R). El script:

- Intercepta `console.debug` para capturar logs `[Step B]`, `[Z.11.1]`, `[Z.10.5b]` y similares.
- Expone `window.__Z11_BASELINE__` con el estado acumulado.
- Expone helpers `dumpBaseline()` y `copyBaseline()`.

```js
;(() => {
  const W = window;
  if (W.__Z11_BASELINE__) {
    console.warn('[Z.11.0] Ya instrumentado. Refrescar para reset limpio.');
    return W.__Z11_BASELINE__;
  }

  const state = {
    captured_at: new Date().toISOString(),
    user_agent: navigator.userAgent,
    href: location.href,
    logs: { worker: [], gate_z11: [], gate_z12: [], usd_norm: [], misc: [] },
    page_side: null,
    worker_summary: null,
    audit_global: null,
    inputs_check: null,
  };
  W.__Z11_BASELINE__ = state;

  const origDebug = console.debug.bind(console);
  console.debug = function (...args) {
    try {
      const head = typeof args[0] === 'string' ? args[0] : '';
      const payload = args.length > 1 ? args.slice(1) : [];
      const entry = { ts: Date.now(), head, payload };
      if (head.startsWith('[Step B]')) {
        state.logs.worker.push(entry);
        if (head.includes('motor2_insights') && payload[0]) state.worker_summary = payload[0];
      } else if (head.startsWith('[Z.11.1]')) {
        state.logs.gate_z11.push(entry);
      } else if (head.startsWith('[Z.12]') || head.startsWith('[Z.12.')) {
        state.logs.gate_z12.push(entry);
      } else if (head.startsWith('[Z.10.5')) {
        state.logs.usd_norm.push(entry);
      } else if (head.startsWith('[Z.') || head.startsWith('[PR-')) {
        state.logs.misc.push(entry);
      }
    } catch { /* swallow */ }
    return origDebug(...args);
  };

  W.dumpBaseline = function () {
    const out = {
      ...state,
      audit_global: W.__INSIGHT_AUDIT__ ?? null,
    };
    return out;
  };

  W.copyBaseline = async function () {
    const out = W.dumpBaseline();
    const json = JSON.stringify(out, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      console.log('[Z.11.0] baseline JSON copiado al clipboard (' + json.length + ' chars)');
    } catch (e) {
      console.warn('[Z.11.0] clipboard failed; logging JSON:', e);
      console.log(json);
    }
    return out;
  };

  console.log('[Z.11.0] Instrumentacion lista. Pasos:');
  console.log('  1. Recargar la pagina (Ctrl+Shift+R) con esta consola abierta.');
  console.log('  2. Esperar que el dashboard renderice 100%.');
  console.log('  3. Cambiar selectedPeriod o tipoMetaActivo si quieres forzar re-run.');
  console.log('  4. Pegar el bloque page-side (siguiente seccion del .md).');
  console.log('  5. Llamar window.copyBaseline() para JSON listo para pegar.');
  return state;
})();
```

---

## 2. Captura page-side

Despues de recargar y que el dashboard este listo, pegar este bloque. Lee
estado del store + ejecuta motor 2 page-side via los hooks expuestos
(intentando ambos accesos posibles).

```js
;(async () => {
  const W = window;
  if (!W.__Z11_BASELINE__) {
    console.error('[Z.11.0] correr primero el bloque de instrumentacion');
    return;
  }
  const baseline = W.__Z11_BASELINE__;

  // Helper: intenta resolver useAppStore desde modules conocidos
  let store = null;
  try {
    if (typeof W.useAppStore === 'function') store = W.useAppStore.getState();
  } catch (e) { /* ignore */ }

  // Si no se expuso, leer el persist directamente
  let persistedConfig = null;
  try {
    const raw = localStorage.getItem('salesflow-storage');
    if (raw) persistedConfig = JSON.parse(raw);
  } catch (e) { /* ignore */ }

  // Estado del store en memoria (si disponible)
  const storeState = store ? {
    insights_length: store.insights?.length ?? null,
    insights_por_tipo: (() => {
      const m = {};
      for (const i of (store.insights ?? [])) m[i.tipo] = (m[i.tipo] ?? 0) + 1;
      return m;
    })(),
    insights_por_prioridad: (() => {
      const m = {};
      for (const i of (store.insights ?? [])) m[i.prioridad] = (m[i.prioridad] ?? 0) + 1;
      return m;
    })(),
    sales_length: store.sales?.length ?? null,
    metas_length: store.metas?.length ?? null,
    inventory_length: store.inventory?.length ?? null,
    vendorAnalysis_length: store.vendorAnalysis?.length ?? null,
    clientesDormidos_length: store.clientesDormidos?.length ?? null,
    categoriasInventario_length: store.categoriasInventario?.length ?? null,
    selectedPeriod: store.selectedPeriod ?? null,
    tipoMetaActivo: store.tipoMetaActivo ?? null,
  } : null;

  // Counts de cards renderizadas en el DOM
  const cardCounts = {
    executive: document.querySelectorAll('[data-testid="executive-problem-card"], [data-card-kind="executive"]').length,
    diagnostic: document.querySelectorAll('[data-testid="diagnostic-block"], [data-card-kind="diagnostic"]').length,
    total_potential_cards: document.querySelectorAll('article, [role="article"]').length,
  };

  baseline.page_side = {
    captured_at: new Date().toISOString(),
    store_accessible: !!store,
    persisted_config: persistedConfig,
    store_state: storeState,
    card_counts_dom: cardCounts,
    audit_global_present: typeof W.__INSIGHT_AUDIT__ !== 'undefined',
  };

  console.log('[Z.11.0] page-side capturado:', baseline.page_side);
  if (!store) {
    console.warn(
      '[Z.11.0] useAppStore no expuesto en window. ' +
      'Para esta corrida, page-side recibe solo card counts del DOM. ' +
      'Si quieres detalles internos (_insightCandidates, etc.), abrir el componente ' +
      'EstadoComercialPage en React DevTools, seleccionar el componente, y leer hooks.'
    );
  }
  return baseline.page_side;
})();
```

---

## 3. Validacion de inputs (worker vs page)

Para confirmar que worker y page-side reciben los mismos datos:

```js
;(() => {
  const W = window;
  const b = W.__Z11_BASELINE__;
  if (!b || !b.page_side) {
    console.error('[Z.11.0] correr instrumentacion + page-side primero');
    return;
  }
  const ws = b.worker_summary ?? {};
  const ss = b.page_side.store_state ?? {};

  const inputs_check = {
    worker_log_present: !!b.worker_summary,
    candidates_raw: ws.candidates_raw ?? null,
    candidates_filtered: ws.candidates_filtered ?? null,
    insights_adapted: ws.insights_adapted ?? null,
    store_insights_length: ss.insights_length ?? null,
    matches: {
      adapted_equals_store_insights: (ws.insights_adapted ?? -1) === (ss.insights_length ?? -2),
    },
  };

  b.inputs_check = inputs_check;
  console.log('[Z.11.0] inputs_check:', inputs_check);
  return inputs_check;
})();
```

---

## 4. Export

Cuando los 3 bloques anteriores corrieron sin errores:

```js
window.copyBaseline()
```

El JSON queda en clipboard listo para pegar en
`docs/baselines/insight-pipeline-baseline.z11-0.json` bajo la key
`runtime_capture` (NO sobrescribir secciones existentes — agregar como
nueva key top-level).

---

## 5. Prompt para Claude en Chrome

Si vas a delegarle a Claude en Chrome la ejecucion completa, copiale el
prompt de la siguiente seccion:

```
Necesito que captures el runtime baseline de SalesFlow para cerrar el sprint
forense Z.11.0. La app esta corriendo en localhost. Vas a trabajar SOLO con
DevTools y la UI; no toques codigo ni snapshots.

CONTEXTO:
- SalesFlow tiene dos motores de insights. Motor 1 (deprecated) en
  insightEngine.ts. Motor 2 activo en insight-engine.ts. Existen DOS gates
  independientes: Z.11 (en insight-engine.ts:4665, function
  _z11EvaluarSupervivencia) y Z.12 (en insightStandard.ts:2675, function
  evaluateInsightCandidate). Se confunden facilmente porque la palabra "gate"
  se usa para ambos.
- Motor 2 corre dos veces: una vez en el web worker (analysisWorker.ts,
  alimenta store.insights via candidatesToInsights adapter), una vez en main
  thread (EstadoComercialPage.tsx:1429, alimenta diagnosticBlocks). Se asume
  que reciben los mismos inputs pero hay que confirmarlo.
- Existe contradiccion historica:
  - audit runtime viejo decia "Z.11 pass rate 16.7%, sin-usd dominante"
  - test goldens del repo decian "monetaryCoherence: 0, fallos por Pareto"
  Esa contradiccion ya tiene hipotesis (los dos audits midieron gates
  distintos), pero hay que confirmarla con captura fresca.

OBJETIVO:
Producir un JSON crudo con la tabla unica del pipeline para Los Pinos demo.
NO interpretar, NO proponer fixes. Solo medir.

PASOS:
1. Asegurar que la app este en /dashboard con dataset Los Pinos cargado.
2. Pegar el bloque "1. Script de instrumentacion" del archivo
   docs/baselines/devtools-runtime-capture.md ANTES de recargar.
3. Hacer hard refresh (Ctrl+Shift+R). Esperar que el dashboard este 100%
   renderizado (todas las cards visibles, sin loaders).
4. Pegar el bloque "2. Captura page-side".
5. Pegar el bloque "3. Validacion de inputs".
6. Llamar window.copyBaseline() y guardar el JSON.

QUE REPORTAR (en orden, sin interpretar):
- Resultado de cada paso (ok / error con mensaje).
- Si window.useAppStore no esta expuesto, decirlo explicito y reportar que
  store_state quedo en null.
- Si window.__INSIGHT_AUDIT__ no esta expuesto, decirlo explicito.
- El JSON completo de window.dumpBaseline() (o el clipboard si funciono
  copyBaseline).

QUE NO HACER:
- No proponer fixes para "sin-usd" o "tipo-debil".
- No editar codigo.
- No tocar tests ni snapshots.
- No abrir PRs.
- No interpretar contradicciones; solo registrarlas.

FORMATO DEL ENTREGABLE:
- Un solo bloque ```json``` con el output de window.dumpBaseline().
- Una nota corta (max 5 lineas) listando que paso fallo (si hubo alguno) y
  que campos quedaron null por capacidad limitada de DevTools (ej.
  store_state si useAppStore no expuesto).

Cuando termines, pega el JSON aca y yo lo integro al baseline canonico.
```

---

## 6. Que hacer con el JSON capturado

1. Tomar el output de `window.copyBaseline()` (clipboard).
2. Editar `docs/baselines/insight-pipeline-baseline.z11-0.json`.
3. Agregar una nueva key top-level `"runtime_capture"` con el JSON pegado.
4. NO sobrescribir las keys existentes (`usd_resolver_inventory`,
   `lists_inventory`, etc.).
5. Actualizar `docs/BASELINE-Z11-0.md` seccion 4 con la tabla unica
   completa, derivada del JSON.
6. Marcar las preguntas 1, 2, 3, 8 de seccion 5 como resueltas con su
   respuesta concreta.
7. Solo entonces Z.11.0 puede declararse cerrado y Z.11.1 desbloqueado.
