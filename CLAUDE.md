# SalesFlow — Monitor de Riesgo Comercial
## v2.0 | React + TypeScript + Zustand + Recharts + Vite

---

## PRODUCTO
B2B SaaS para empresas con equipos de ventas. Detecta riesgos comerciales
antes de que afecten resultados. NO es un dashboard BI, es un motor de decisiones.

---

## STACK FRONTEND (activo)
- React 19 + TypeScript + Vite
- Zustand v5 (persist v3, key: salesflow-storage)
- Recharts para gráficas
- Tailwind v4 (sin tailwind.config.js)
- react-router-dom v7
- Lucide React para iconos
- Sonner para toasts
- PapaParse + XLSX para archivos
- Zod para validación

## STACK BACKEND (construido, no conectado al frontend)
- Python FastAPI en /backend
- Modelos: NAIVE, ETS, SARIMA, ENSEMBLE
- NO tocar backend salvo instrucción explícita

## SERVICIOS EXTERNOS
- DeepSeek API (chat): https://api.deepseek.com/chat/completions
  Modelos: deepseek-chat, deepseek-reasoner
  API key: configuracion.deepseek_api_key (en store)
- Supabase: configurado pero NO activo en frontend

---

## ARQUITECTURA FRONTEND

### Flujo de datos
1. Upload → fileParser.ts → setSales/setMetas/setInventory
2. useAnalysis.ts → detectDataAvailability → computeCommercialAnalysis
   → computeCategoriasInventario → generateInsights → store
3. Páginas leen del store via useAppStore()
4. TopBar cambia selectedPeriod → isProcessed=false → re-análisis

### Store (appStore.ts)
PERSISTIDO: selectedPeriod, configuracion, orgId
SOLO MEMORIA: vendorAnalysis, teamStats, insights, clientesDormidos,
  concentracionRiesgo, categoriasInventario, forecastData, isProcessed, isLoading

### Análisis
- fechaReferencia = SIEMPRE max(sales.fecha), NUNCA new Date()
- YTD: comparación homóloga (1 ene año actual vs 1 ene año anterior)
- Inventario: PM3 de 3 meses CERRADOS antes de selectedPeriod

---

## REGLAS DE NEGOCIO CRÍTICAS

### Comparaciones de períodos (ABSOLUTO — nunca romper)
- YTD: Jan 1 a fechaReferencia año actual vs mismo rango año anterior
- MTD YoY: día 1 al día N del mes actual vs mismo rango del mismo mes año anterior
- NUNCA comparar período parcial contra mes completo
- isCurrentMonth=true: filtrar año anterior con getDate() <= diasTranscurridos

### recoveryScore
- Interno en vendorAnalysis — NUNCA mostrar el número x/100 en UI
- Mostrar solo: etiqueta en español + texto de acción contextual

### tipoMetaActivo ('uds' | 'usd')
- Todos los KPIs, cards y tablas muestran SOLO el tipo activo
- No mezclar métricas en la misma vista

### Componentes — DO NOT TOUCH (salvo instrucción explícita)
- PulsoPanel.tsx, VendedorPanel.tsx, AnalysisDrawer.tsx
- El chat / asistente virtual (ChatPage.tsx, chatService.ts, ChatBot.tsx, ChatMessage.tsx)
- Botón `chatQuestion` — NO modificar el trigger del asistente
- La apariencia de las PULSO cards en el dashboard

### Componentes UI reutilizables (siempre en lugar de nativos)
- src/components/ui/SFSelect.tsx — select estilizado
- src/components/ui/SFSearch.tsx — input de búsqueda

---

## REGLAS DE DESARROLLO

### Edición de código
- Usar str_replace, NO reescribir archivos completos
- Leer SOLO las funciones afectadas, no el archivo entero
- Cambios quirúrgicos únicamente
- tsc --noEmit debe dar 0 errores al terminar

### Lo que NO tocar salvo instrucción explícita
- backend/ (Python FastAPI — no conectado)
- supabase/ (migraciones — no activo)
- forecastApi.ts, errorHandler.ts (código muerto)

### Dependencias
- NO instalar librerías nuevas sin preguntar
- NO usar react-markdown ni librerías de parsing externas
- Tailwind v4: no tiene tailwind.config.js, usa @tailwindcss/vite

---

## PÁGINAS ACTIVAS (9 rutas)
/dashboard      → EstadoComercialPage
/vendedores     → VendedoresPage
/rendimiento    → RendimientoPage
/clientes       → ClientesPage (condicional has_cliente)
/rotacion       → RotacionPage (condicional has_inventario)
/metas          → MetasPage (condicional has_metas)
/chat           → ChatPage (DeepSeek conectado)
/cargar         → UploadPage
/configuracion  → ConfiguracionPage

---

## INSIGHTS (insightEngine.ts)
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
~26 detectores activos con cross-table analysis (vendedores × clientes × productos × inventario).
Same-day-range para comparaciones YoY.
Impacto económico (solo si has_venta_neta): Meta en Peligro, Concentración Sistémica,
  Equipo No Cerrará Meta, Doble Riesgo, Caída Explicada

---

## MOTOR DE INSIGHTS — OWNERSHIP DOCUMENTAL Y READ ORDER

> **Fase 0 (timing del refactor).** El refactor lógico grande del motor va
> **después** de estabilizar docs + gate, en este orden estricto:
> 1. CLAUDE.md (este archivo) actualizado con ownership y read order ← **hecho**
> 2. PROJECT_MAP.md degradado/eliminado como fuente de verdad ← **hecho**
> 3. Golden-master test del motor actual (snapshot del output con dataset demo) ← **hecho** (`src/lib/__tests__/insight-engine.golden.test.ts`)
> 4. `docs/MANIFIESTO-MOTOR-INSIGHTS.md` reescrito como tabla de proceso ← **hecho** (v3.0.0, 258 líneas, contrato operativo). Histórico v2.x movido a `docs/historico/MANIFIESTO-MOTOR-INSIGHTS-Z9-Z13-HISTORICO.md`
> 5. `docs/GLOSARIO-MOTOR-INSIGHTS.md` creado ("dónde va cada cosa") ← **hecho** (232 líneas, regla "≤ 5 líneas por entrada")
> 6. Gate movido a `insightStandard.ts` (`evaluateInsightCandidate` / `shouldInsightPass`)
>    sin cambio funcional ← **6A hecho** (Z.12 bi-nivel: 4 reglas, regex genéricas, root-strong, USD sources).
>    **6B diferido**: filtro-ruido, proporcionalidad, dedup, cascadas, integración inv/metas, etc. Mezclan mutación + enriquecimiento + dedup; migrarlas ahora antes del refactor lógico es trabajo de plomería que se va a tirar. Quedan en `filtrarConEstandar` como orquestación.
> 7. Refactor lógico del motor.
>
>    **Fase 7.1 — Two-stage gate-aware ranker (revertido).** Hipótesis: el
>    ranker selecciona 10 y 4 mueren en el gate; agregando una segunda etapa
>    gate-aware sobre un pool intermedio se mejoraría pass rate. Resultado:
>    `gatePassInIntermediate: 0` en USD y UDS. Diagnóstico real: la regla
>    Z.12 r3 (coherencia monetaria) excluye sistemáticamente los tipos del
>    pool regular (`trend`/`change`/`contribution`/etc.) porque tienen
>    `impacto_usd_source ∈ {non_monetary, unavailable}`. Los gate-passers
>    salen casi todos por `ALWAYS_PROTECTED_CAPS`. Conclusión: el ranker no
>    es el bottleneck; r3 sí.
>
>    **Fase 7.2 — Gate failure audit (✅).** Snapshot estructural en
>    `src/lib/__tests__/insight-engine.gate-audit.test.ts`. Hallazgos:
>    cero candidatos del pool seleccionado fallan r3 (refuta hipótesis
>    7.1). r2 (Pareto) y r4 (narrativa) son los dominantes; la mayoría
>    falla múltiples reglas a la vez. `onlyMonetaryCoherenceFails: 0`
>    en USD y UDS.
>
>    **Fase 7.3 — Audit cualitativo (✅).** Se agregó `failingItems[]`
>    al snapshot del audit. Reveló dos categorías: (a) bug de copy
>    "La caída se concentra" en candidatos `direction='up'` y (b)
>    señales perdidas por `contribution +` no-Pareto (ej. María Castillo).
>
>    **Fase 7.4 — Fix narrativa direction-aware (✅ calidad, ❌ pass rate).**
>    `cross-context.ts:enriquecerCandidate` ahora elige la frase auxiliar
>    según `direction` del candidato (no según `varPct` del cliente).
>    Bug de copy resuelto. **Lección registrada:** la expectativa de que
>    `narrativeCoherence` fails bajaría fue incorrecta — el gate r4 fallaba
>    por `accion: null` + materiality fail simultáneo, no por la regex
>    anti-genérica disparada por la contradicción interna. Counts del
>    gate sin cambio. Goldens regenerados.
>
>    **Fase 7.5-A — Contribution positive audit (✅).** Sub-snapshot
>    `contributionPositiveAudit` en el audit. María Castillo cumple los
>    5 criterios estrechos (score 1.0, severity CRITICA, share 3.09%);
>    UDS no tiene casos. Patrón único, no sistémico.
>
>    **Fase 7.5-B — Excepción contribution-up (✅).** `evaluateInsightCandidate`
>    rescata r2 (Pareto) cuando un crecimiento positivo cumple los 6 criterios
>    estrechos (contribution+direction=up+score≥0.95+ALTA/CRITICA+share≥1%+source válido).
>    `reason='relaxed:exception_contribution_up'` distinguible. Resultado:
>    USD pool tras gate 6→7, UDS sin cambio. Contador
>    `gateRescuedByContributionUpException` en audit para monitoreo.
>
> **Fase 7 cerrada.** Backlog explícito (no continuación inmediata):
>   - **7.6** — atacar `accion: null` en detectores `change`/`trend`
>     para que la puerta relajada se active. Diferido hasta tener criterio
>     claro de producto para "acción concreta aceptable" (riesgo: inventar
>     acciones genéricas que el gate ya filtra correctamente).
>
> **Regla post-6A:** todo cambio que afecte pass/fail va en `evaluateInsightCandidate()` o helpers de `insightStandard.ts`. Cambios de generación/detección/ranker pueden vivir en `insight-engine.ts` mientras respeten el gate.
>
> Mientras una fase no esté cerrada, no avanzar a la siguiente.

### Fuente de verdad por dominio

| Dominio | Archivo canónico | Notas |
|---|---|---|
| **Pass/fail de un insight** | `src/lib/insightStandard.ts` → `evaluateInsightCandidate(c, ctx)` / `shouldInsightPass(c, ctx)` | Gate canónico Z.12 movido en Fase 6A. `filtrarConEstandar` (en insight-engine.ts:3791) queda como orquestador array-level que precomputa contexto y aplica mutación `_z122_relaxed`. Reglas extra (filtro-ruido, proporcionalidad, dedup, cascadas) siguen orquestadas en filtrarConEstandar — migración pendiente Fase 6B. |
| **Pipeline completo del motor** | `docs/MANIFIESTO-MOTOR-INSIGHTS.md` | Tabla canónica de 10 etapas + baseline operacional + invariantes. v3.0.0, 258 líneas. Histórico v2.x en `docs/historico/`. |
| **Dónde va cada cosa** | `docs/GLOSARIO-MOTOR-INSIGHTS.md` | Mapa compacto (232 líneas, regla "≤ 5 líneas por entrada") de métricas, dimensiones, detectores, registries, narrativa. Primera parada para "¿dónde agrego X?". |
| **Detectores y candidatos** | `src/lib/insight-engine.ts` | Genera candidatos. NO debería decidir pass/fail — eso es de insightStandard.ts. Migración pendiente (Fase 6). |
| **Cadenas de causalidad / problema ejecutivo** | `src/lib/decision-engine.ts` | Z.9 framework (InsightChains, ExecutiveProblems). Consume insights ya filtrados. |
| **Registros** | `insight-registry.ts` (motor principal), `metricRegistry.ts` / `dimensionRegistry.ts` / `insightTypeRegistry.ts` (cross/telemetría) | **Coexisten — no consolidar todavía.** El glosario aclarará cuál manda para qué cuando se cree. |
| **Mapa del repo** | (pendiente decisión) | `src/PROJECT_MAP.md` deja de ser fuente de verdad en Fase 2. Se reduce a stub o se elimina. |

### Read order recomendado para tareas del motor

Antes de tocar lógica de insights, leer en este orden (para minimizar tokens):

1. **`docs/GLOSARIO-MOTOR-INSIGHTS.md`** — para saber dónde vive lo que vas a tocar (cuando exista).
2. **`docs/MANIFIESTO-MOTOR-INSIGHTS.md`** — para entender qué etapa del pipeline estás afectando.
3. **`src/lib/insightStandard.ts`** — para entender las reglas pass/fail vigentes.
4. **Archivo concreto de la tarea** — leer con offset/limit, nunca completo.

Si la tarea es "agregar detector nuevo": glosario → manifiesto → `insight-engine.ts` (sección de detectores) → `insightStandard.ts` (qué reglas debe satisfacer el output).
Si la tarea es "ajustar umbral / regla de filtrado": glosario → `insightStandard.ts` directo.
Si la tarea es "cambiar narrativa o UI de bloque": leer `narrative-builder.ts` / `diagnostic-actions.ts`, NO insightStandard.

### Reglas de propiedad

- **No moveer reglas de pass/fail fuera de `insightStandard.ts`** una vez completada la Fase 6. Si una regla nueva vive en `insight-engine.ts`, es deuda y debe migrarse.
- **No agregar nuevos registries** sin antes documentar el solapamiento con los 4 existentes en el glosario.
- **No reescribir `insight-engine.ts` por afán de limpieza** mientras Fase 0–6 no estén cerradas. El refactor grande tiene su fase propia (7).

---

## DATOS DEMO
Empresa: Los Pinos S.A.
8 vendedores, 20 productos, 30 clientes, 93,155 filas de ventas
Rango: Enero 2024 – Abril 2026 | 4 categorías | 3 canales | 10 departamentos (El Salvador)

---

## DEUDA TÉCNICA
- Conectar backend Python forecast a RendimientoPage
- Supabase Auth + RLS (antes del primer cliente pagador)
- MetasPage: expandir para dimensiones producto/cliente/canal

---

## RESPONSE STYLE
- Chat: máx. 5 líneas resumiendo archivos cambiados. Detalle va en los archivos.
- No hacer dumps de código en el chat — usar Edit/Write directamente.
- Análisis extensos → escribir en archivo .md, no en el chat.

## BUILD & VERIFICATION
- Después de editar .ts/.tsx: correr `npx tsc --noEmit` y confirmar 0 errores.
- Si tsc falla: diagnosticar y corregir antes de continuar.

## REFACTORING RULES
- Preservar edge-cases, fallbacks y error paths a menos que se indique eliminarlos.
- Si se eliminó algo no pedido explícitamente: restaurar o preguntar primero.

## PERFORMANCE WORK
- Medir tiempo actual antes de optimizar (console.time o similar).
- Solo conservar el cambio si los números mejoran. Si es más lento: revertir.

## TOKEN & CONTEXT EFFICIENCY (crítico)
- NO releer un archivo después de Edit/Write — el harness ya valida el cambio.
- Archivos grandes (leer SIEMPRE con offset/limit, nunca completos):
  - src/lib/insight-engine.ts (6773 líneas)
  - src/lib/insightEngine.ts (3107)
  - src/pages/EstadoComercialPage.tsx (2650)
  - src/lib/insightStandard.ts (2454)
  - src/lib/analysis.ts (1830)
  - src/pages/ChatPage.tsx (1662)
  - src/lib/fileParser.ts (1628)
- Para "buscar dónde se usa X" o exploración con >3 queries: usar Agent (Explore), no Grep+Read en serie.
- Edits masivos: fragmentar en varios Edit en paralelo. NUNCA un Write gigante (dispara Output Token Limit).
- Después de cada fase Z.X: invocar /regression-sweep para detectar fallbacks/edge-cases removidos sin querer.
