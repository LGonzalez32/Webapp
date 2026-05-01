# SalesFlow — Auditoría de inconsistencias numéricas + arquitectura

Fecha: 2026-04-30 · Branch: `motorinsights` · Auditor: técnico (read-only).

> Reglas: cada claim tiene `archivo:línea` + snippet. Donde no se pudo verificar, se indica.
> No se modificó código.

---

## #1 — Meta de Abril con 3 valores (54.1k / 22.999 / 46.057)

### Respuesta corta
**Bug de filtros**: hay 3 fórmulas con denominadores distintos sobre el mismo set de metas. La fuente de fondo es que `demoData.ts` genera metas single-dim **y** multi-dim (vendedor+canal, vendedor+categoría, vendedor+cliente+canal); cada vista decide qué subset sumar y los filtros no coinciden. La landing tiene un valor **hardcoded**.

### Evidencia

**Dashboard (`/dashboard`) — `metaActiva` lee `teamStats.meta_equipo_total`:**

`src/pages/EstadoComercialPage.tsx:1726`
```ts
const metaActiva = teamStats?.meta_equipo_total ?? teamStats?.meta_equipo ?? 0
const cumplimientoFinal = metaActiva > 0
  ? (proyActiva / metaActiva) * 100
  : (teamStats?.cumplimiento_equipo ?? 0)
```

`teamStats.meta_equipo_total` se calcula en `src/lib/analysis.ts:1003-1012`:
```ts
const metasDelPeriodo = metas.filter((m) => m.mes === month + 1 && m.anio === year)
const getMetaVal = (m) => tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)
// Only sum vendedor-level metas (exclude supervisor/categoria metas)
const vendedorMetas = metasDelPeriodo.filter((m) => m.vendedor && !m.supervisor && !m.categoria)
const meta_equipo =
  vendedorMetas.length > 0
    ? vendedorMetas.reduce((a, m) => a + getMetaVal(m), 0)
    : undefined
const meta_equipo_total: number | null =
  vendedorMetas.length > 0 ? vendedorMetas.reduce((a, m) => a + getMetaVal(m), 0) : null
```
**Nota crítica**: el filtro excluye `supervisor` y `categoria` pero NO excluye `canal` ni `cliente`. Por eso suma metas single-dim **+** multi-dim (vendedor+canal, vendedor+cliente+canal). Resultado: el sumatorio inflado (54.1k en abril 2026).

**MetasPage (`/metas`) — `teamMeta`:**

`src/pages/MetasPage.tsx:216-218`
```ts
const teamMeta = metas
  .filter((m) => m.anio === currentYear && m.mes === currentMonth + 1
                 && m.vendedor && !m.canal && !m.categoria && !m.cliente)
  .reduce((a, m) => a + (tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)), 0)
```
Aquí sí se excluyen `canal`, `categoria` y `cliente` → solo single-dim → **22.999** en abril 2026.

**Landing hero — hardcoded:**

`src/pages/LandingPage.tsx:616-617`
```tsx
<div className="text-[9px] text-slate-300 font-medium">Equipo no cerrará la meta del mes</div>
<div className="text-[10px] text-slate-500">Brecha: 23,473 uds de 46,057</div>
```
**Hardcoded literal.** No se calcula; es copy estático. El `46,057` no viene del store ni del análisis.

**Origen del split en demo:** `src/lib/demoData.ts:359-437` genera metas single-dim (`{vendedor}`), 2-dim (`{vendedor, canal}` y `{vendedor, categoria}`) y 3-dim (`{vendedor, cliente, canal}`).

### Diagnóstico
- **Dashboard (54.1k)**: bug de cálculo — filtro insuficiente, suma single-dim + multi-dim cuyas dimensiones se solapan; sobre-cuenta.
- **MetasPage (22.999)**: comportamiento correcto pero asimétrico — filtro estricto a single-dim.
- **Landing (46.057)**: copy hardcoded, ningún binding al motor.

### Fix sugerido
Centralizar el cómputo de "meta del mes" en `domain-aggregations.ts` con un único filtro canónico (single-dim por defecto, opt-in a multi-dim) y consumirlo desde dashboard, MetasPage y radar/pulso. Reemplazar la cifra de la landing por copy genérico o screenshot.

---

## #2 — YTD variance: dashboard +0.9% vs /rendimiento +3.4%

### Respuesta corta
**Bug de scope/métrica**: las dos vistas usan ventanas y agregadores distintos. Dashboard suma `monthlyTotals` (con same-day-range para el mes parcial sólo en el mes corriente) sobre el rango activo del TopBar. Rendimiento itera sobre `filteredForChart` (afectado por `selectedVendor` / `metric`) y sólo aplica same-day-range si `selectedYear === fechaRef.year`.

### Evidencia

**Dashboard `ytdChart` — `src/pages/EstadoComercialPage.tsx:1515-1549`:**
```ts
const ytdChart = useMemo(() => {
  const currentYear = maxDate.getTime() > 0 ? maxDate.getFullYear() : selectedPeriod.year
  const previousYear = currentYear - 1
  const latestMonth = maxDate.getFullYear() === currentYear ? maxDate.getMonth() : selectedPeriod.monthEnd
  ...
  for (let m = monthStart; m <= monthEnd; m++) {
    const isPartialMonth = m === latestMonth
    const ventasActual   = monthlyTotals[`${currentYear}-${m}`]?.uds ?? 0
    const ventasAnterior = isPartialMonth
      ? (monthlyTotalsSameDay[`${previousYear}-${m}`]?.uds ?? 0)
      : (monthlyTotals[`${previousYear}-${m}`]?.uds ?? 0)
    totalActual += ventasActual; totalAnterior += ventasAnterior
  }
  return { data, totalActual, totalAnterior, maxDay }
}, [monthlyTotals, monthlyTotalsSameDay, selectedPeriod.year, selectedPeriod.monthStart, selectedPeriod.monthEnd, maxDate])
```
- Inputs: `monthlyTotals` (totales globales pre-computados en analysis worker) + rango `selectedPeriod.{monthStart,monthEnd}` del TopBar.
- Métrica: `.uds` (o `.neta` en su gemelo `ytdChartUSD` líneas 1552-1573).
- Same-day cap solo en `m === latestMonth`.

**RendimientoPage `ytdStats` — `src/pages/RendimientoPage.tsx:407-456`:**
```ts
const ytdStats = useMemo(() => {
  if (forecastData && forecastData.kpis) { /* prefiere backend */ ... }
  // Fallback local
  const chartPrev = selectedYear - 1
  const maxSaleDate = filteredForChart.reduce((max, s) => { const d = new Date(s.fecha); return d > max ? d : max }, new Date(0))
  const isPartialMonth = isCurrentYear && currentMonth === maxSaleDate.getMonth() && selectedYear === maxSaleDate.getFullYear()
  const maxDay = maxSaleDate.getDate()
  let ytdCurr = 0, ytdPrev = 0
  for (let m = 0; m <= currentMonth; m++) {
    const cs = salesInPeriod(filteredForChart, selectedYear, m)
    let ps = salesInPeriod(filteredForChart, chartPrev, m)
    if (isPartialMonth && m === currentMonth) ps = ps.filter(s => new Date(s.fecha).getDate() <= maxDay)
    ytdCurr += useVentaNeta ? cs.reduce(...) : cs.reduce((a, s) => a + s.unidades, 0)
    ytdPrev += useVentaNeta ? ps.reduce(...) : ps.reduce((a, s) => a + s.unidades, 0)
  }
  const variacion = ytdPrev > 0 ? ((ytdCurr - ytdPrev) / ytdPrev) * 100 : null
  ...
}, [filteredForChart, selectedYear, currentMonth, useVentaNeta, isCurrentYear, forecastData])
```
- Inputs: `filteredForChart` (afectado por `selectedVendor`, `useVentaNeta`).
- Recalcula desde sales crudas con `salesInPeriod` (no `monthlyTotals`).
- Rango fijo `[0, currentMonth]`, ignora `selectedPeriod.monthStart/monthEnd`.

### Diferencias concretas que producen +0.9% vs +3.4%
1. **Universo de sales**: dashboard usa `monthlyTotals` (todas las ventas); Rendimiento usa `filteredForChart` (post `selectedVendor` filter).
2. **Rango**: dashboard respeta TopBar (`monthStart..monthEnd` puede ser `2..3` p.ej.); Rendimiento siempre arranca en `0`.
3. **Métrica activa**: en Rendimiento, `useVentaNeta` controla; en dashboard hay dos memos paralelos (`ytdChart` UDS + `ytdChartUSD`). Si tipoMetaActivo difiere de useVentaNeta, son métricas distintas.
4. Ambas hacen same-day-range para el mes parcial, así que ese no es el bug.

### Diagnóstico
**Bug de naming + scope**. Las dos vistas se etiquetan "YTD" pero responden preguntas distintas:
- Dashboard: "YTD del rango seleccionado en TopBar para todo el equipo".
- Rendimiento: "Ene→mes-actual del vendedor/métrica filtrados".

### Fix sugerido
Mover `ytdStats` a un selector compartido (`lib/metrics/ytd.ts`) parametrizado por `{salesView, monthRange, metric}` y dejar que cada página inyecte sus parámetros explícitamente, con tooltip que indique el rango efectivo.

---

## #3 — Chat IA dice -45.5% Santa Ana, mapa /departamentos dice -24%

### Respuesta corta
**Bug de fórmula**: el chat construye el agregado por departamento desde `sales` crudas SIN aplicar `same-day-range` para el mes parcial; el mapa usa `departamentoSummaries` pre-computados con `inYTDRange` que CAPA en `refDay` simétricamente. El chat sobrecuenta el año anterior → caída más grande.

### Evidencia

**Chat (`src/lib/chatService.ts:435-510`):**
```ts
if (dataAvailability.has_departamento) {
  const currentYear = año
  const previousYear = currentYear - 1
  const currentMonth = selectedPeriod.month
  ...
  for (const sale of sales) {
    const d = toDate(sale.fecha)
    const yr = d.getFullYear()
    const mo = d.getMonth()
    if (mo > currentMonth) continue            // ← solo filtra mes, NO día
    if (!sale.departamento) continue
    const dept = sale.departamento.trim()
    ...
    if (yr === currentYear)      entry.actual   += sale.unidades
    else if (yr === previousYear) entry.anterior += sale.unidades
  }
  ...
  variacion: data.anterior > 0 ? ((data.actual - data.anterior) / data.anterior * 100) : 0,
```
No hay cap por día. Si fechaRef es `30 abr 2026`, el chat suma para 2025 todo abril completo (30 días). Si current está incompleto (digamos 20 abril cargado), el divisor es ~50% más grande de lo justo.

**Mapa (`src/pages/DepartamentosPage.tsx:148-181`) — caso default usa `departamentoSummaries`:**
```ts
if (noFilters) {
  if (!departamentoSummaries.length) return {}
  for (const s of departamentoSummaries) {
    const dept = matchDept(s.nombre)
    const a = useUSDmetric ? s.ventaCur : s.udsCur
    const b = useUSDmetric ? s.ventaPrev : s.udsPrev
    const v = b > 0 ? Math.round(((a - b) / b) * 100) : null
    ...
```

**`departamentoSummaries` se computa con `inYTDRange` simétrico — `src/lib/analysis.ts:1716-1727, 1789, 1865-1866`:**
```ts
const fechaRef = getFechaReferencia(sales) ?? new Date()
const refMonth = fechaRef.getMonth()
const refDay = fechaRef.getDate()
const inYTDRange = (fm: number, fd: number): boolean => {
  if (fm > refMonth) return false
  if (fm < refMonth) return true
  return fd <= refDay   // ← cap simétrico por día
}
...
const inRange = (isCurYear || isPrevYear) && inYTDRange(fm, fd)
...
if (isCurYear  && inRange) { dp.totalCur  += venta; dp.udsCur  += uds }
if (isPrevYear && inRange) { dp.totalPrev += venta; dp.udsPrev += uds }
```

### Snippet del system prompt (sección Departamentos completa, ~30 líneas — la función completa `buildSystemPrompt` ocupa ~463 líneas, src/lib/chatService.ts:181-643)
Se muestra el bloque relevante en la evidencia anterior. Los datos NO son alucinados — están en el payload del prompt; el bug es cómo se calculan en el momento de construir el prompt.

### Diagnóstico
**Bug de cálculo** en chat: omitió el cap por `refDay` para el mes parcial. Resultado: prev_year denominador inflado → variación más negativa que la del mapa.

### Fix sugerido
Reemplazar el for-loop en `chatService.ts:445-464` por consumo directo de `ctx.departamentoSummaries` (ya pre-computados, mismo motor que el mapa).

---

## #4 — Pill `/clientes` "2 inactivos" pero tabla "Inactivos (0)"

### Respuesta corta
**Bug de threshold desincronizado**: la pill renderiza `clientesDormidos.length` (calculado en analysis worker con `config.dias_dormido_threshold` del store al momento del análisis); la tabla aplica un slider local `diasDormidoInput` que re-filtra **sobre** ese mismo array. Si el usuario sube el slider local sin guardar, la tabla puede dar 0 mientras la pill sigue mostrando el número original.

### Evidencia

**Pill — `src/pages/ClientesPage.tsx:431-435`:**
```tsx
<span ... title={`Clientes sin comprar desde hace al menos ${configuracion.dias_dormido_threshold} días (umbral configurable).`}>
  {clientesDormidos.length} inactivos
</span>
```

**Tabla — `src/pages/ClientesPage.tsx:344-352, 590`:**
```ts
const filtered = useMemo(() => {
  return clientesDormidos.filter(c => {
    if ((c.dias_sin_actividad ?? 0) < diasDormidoInput) return false
    if (filterVendedor !== 'all' && c.vendedor !== filterVendedor) return false
    if (searchQ && !c.cliente.toLowerCase().includes(searchQ)) return false
    return true
  })
}, [clientesDormidos, diasDormidoInput, filterVendedor, searchQ])
...
{ key: 'dormidos', label: `Inactivos (${filtered.length})`, ... },
```

**Origen de `clientesDormidos` (umbral fijo del store) — `src/lib/analysis.ts:1034-1036`:**
```ts
const clientesDormidos = hasCliente
  ? computeClientesDormidos(sales, config.dias_dormido_threshold, selectedPeriod, idx.byClient)
  : []
```

### Diagnóstico
**Bug de naming + UX**. La pill rotula "X inactivos" usando el threshold del store; la tabla rotula "Inactivos (Y)" usando el threshold del slider. Si difieren, los dos números son verdaderos pero contestan preguntas distintas. Cuando `diasDormidoInput > config.dias_dormido_threshold`, además, la tabla puede llegar a `0` mientras la pill muestra > 0 (la tabla solo puede SUBSET del array; nunca verá clientes con días entre los dos thresholds porque ya fueron filtrados por el worker con el threshold MÁS BAJO).

Caso "2 vs 0" probablemente surge cuando `diasDormidoInput` se sube por encima de los `dias_sin_actividad` máximos del array pre-filtrado.

### Fix sugerido
Recalcular `filtered` desde `sales` con el threshold local del slider, **o** sincronizar pill y tabla mostrando ambos al mismo número (`filtered.length` también en la pill cuando hay slider custom). Indicar visualmente cuando el slider está override (ya hay `diasDormidoCustom`).

---

# ARQUITECTURA — 5 PREGUNTAS

## A. Capa de datos

**¿Una fuente de verdad o cada página recalcula?**
Mixto: existe `src/lib/domain-aggregations.ts` ("R102/Z.1.b: fuente única" según comentarios y MEMORY.md) pero NO se usa consistentemente. Páginas como `EstadoComercialPage.tsx`, `RendimientoPage.tsx`, `DepartamentosPage.tsx`, `MetasPage.tsx` y `chatService.ts` recalculan KPIs in-place.

**Archivos con cálculos KPI (meta/cumplimiento/YoY/MoM):**
- `src/lib/analysis.ts` (motor central, `computeCommercialAnalysis`, ~1830 LOC)
- `src/lib/analysisWorker.ts` (wrapper Web Worker)
- `src/lib/domain-aggregations.ts` (helpers compartidos — fuente "canónica" parcial)
- `src/lib/insight-engine.ts` (motor insights — recalcula sus propios subagregados)
- `src/lib/insightEngine.ts` (motor legacy)
- `src/lib/decision-engine.ts`
- `src/lib/pulso-engine.ts`, `src/lib/radar-engine.ts`
- `src/lib/cross-context.ts`
- `src/lib/chatService.ts` (recalcula departamentos, top-clientes, etc.)
- `src/lib/estadoGeneralHelpers.ts`
- `src/lib/exportUtils.ts`
- Páginas con cálculos in-place: `EstadoComercialPage.tsx`, `RendimientoPage.tsx`, `DepartamentosPage.tsx`, `MetasPage.tsx`, `VendedoresPage.tsx`, `ClientesPage.tsx`, `RotacionPage.tsx`.

**Cliente o servidor?**
100% cliente. `analysisWorker.ts` corre `computeCommercialAnalysis` en Web Worker. Backend Python (Render) sólo se invoca opcionalmente desde `forecastApi.ts` y está desactivado por flag (`FORECAST_BACKEND_ENABLED = false` en `RendimientoPage.tsx:89`).

No hay Supabase RPC para métricas. Tablas históricas (`sales_history`, `sales_aggregated`) fueron eliminadas en `supabase/migrations/003_drop_legacy_forecast_tables.sql`.

---

## B. DeepSeek

**Prompt builder:** `src/lib/chatService.ts` función `buildSystemPrompt` (líneas ~181-643). Confirmado.

**¿Qué se envía?** Resumen pre-calc en texto plano (sin JSON crudo). El prompt construye secciones: período actual, KPIs equipo, vendedores, clientes (concentración + dormidos), departamentos, inventario, metas, insights. Toda la info ya está reducida.

**Hyperparámetros (`src/lib/chatService.ts:817-824, 855-862`):**
```ts
return callDeepSeek('', {
  messages: apiMessages,
  model: 'deepseek-chat',
  max_tokens: 1024,
  temperature: 0.3,
  top_p: 0.9,
  frequency_penalty: 0.1,
})
```
Same-set en `sendChatMessageStream`. (Hay otros callsites con `max_tokens: 3000` y `temperature: 0.3` — `chatService.ts:725-727, 800`.)

**Function calling / tools?** No. Texto libre + system prompt + last 10 messages.

**Memoria de conversación:** Stateful por sesión, **truncada a últimas 10 mensajes** (`chatService.ts:810, 845`):
```ts
const recentMessages = messages.slice(-10)
const apiMessages = [
  { role: 'system', content: systemPrompt },
  ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
]
```
Backend (`backend/app/api/routes/chat.py`) es proxy SSE puro a DeepSeek, confirmado en contexto inicial.

---

## C. Flujo de carga

**Drop archivo → /dashboard.**

1. **Parseo**: cliente. `src/lib/fileParser.ts` y `src/lib/fileParseWorker.ts` (Web Worker). Usa SheetJS (`XLSX.read(buffer, { cellDates: true })`, `fileParser.ts:1118, 1265`) y PapaParse (`Papa.parse`, `fileParser.ts:1097, 1257`).

2. **Persistencia en Supabase?** **NO** para sales/metas/inventory. Las tablas legacy fueron eliminadas (`supabase/migrations/003_drop_legacy_forecast_tables.sql`). Datos quedan solo en memoria del browser (Zustand sin persist para sales/metas/inventory — confirmado en CLAUDE.md). `setSales`/`setMetas`/`setInventory` se llaman desde `UploadPage.tsx:664, 718`.

3. **Validación de columnas**: `src/lib/uploadValidation.ts:120` da mensaje genérico de columnas faltantes. No se halló validación específica que falle si falta `fecha`. **NO SE PUEDE VERIFICAR** que la app rompa con error claro al faltar `fecha`; el parser lo trataría como `undefined` y fallaría en cálculos posteriores con `getFullYear`.

4. **Archivos > 50MB**: límite duro, sin chunking. `src/pages/UploadPage.tsx:302, 320`:
```ts
// 50MB cubre archivos reales con holgura
...
message: `El archivo pesa ${sizeMB}MB y supera el límite de 50MB. ...`,
```

5. **Logs de tiempo para 95k registros**: **NO SE PUEDE VERIFICAR** — `console.time`/`performance.mark` no figura en grep en upload/parser. El worker no registra timing.

---

## D. SARIMA / forecasting

**¿Existe?** Sí en backend, NO conectado al frontend.

- `backend/app/services/arima_model.py`, `forecast_engine.py`, `ensemble.py`, `model_selector.py`, `ets_model.py`, `sales_forecast_service.py`.
- Endpoint: `backend/app/api/routes/sales_forecast.py` y `forecast.py`.
- Cliente frontend: `src/lib/forecastApi.ts` (define `syncSalesData`, `getAnnualPerformance`).
- Único consumidor en UI: `src/pages/RendimientoPage.tsx:200-240` — pero gated por flag:
  `src/pages/RendimientoPage.tsx:89`
  ```ts
  const FORECAST_BACKEND_ENABLED = false // TODO: reactivar cuando el backend esté desplegado en producción
  ```
- En UI, cuando se habilite, mostraría líneas de forecast en el ComposedChart anual (linea 195-240 setean `forecastData`). Hoy: `showForecast = false`.

---

## E. Multi-tenancy / RLS

**¿RLS por organización?** Parcial.

- RLS habilitado para `organizations`, `organization_members`, `organization_invitations` (`supabase/migrations/003_organizations.sql:63-106`):
```sql
alter table public.organizations enable row level security;
create policy ... on public.organizations for select to authenticated using (id in (select public.get_my_org_ids()));
create policy ... on public.organizations for update to authenticated using (id in (select public.get_my_admin_org_ids()));
create policy ... on public.organizations for insert to authenticated with check (auth.uid() = owner_id);
alter table public.organization_members enable row level security;
...
```
- `sales_history` original tenía RLS DESHABILITADO (`supabase/migrations/001_initial_schema.sql:124`: `alter table sales_history disable row level security;`) y **fue dropeada** (`003_drop_legacy_forecast_tables.sql`).
- No existe tabla `sales` con políticas en las migraciones actuales.

**¿Dos usuarios mismo org subiendo archivos: reemplaza o acumula?**
Como no hay persistencia server-side de sales, cada browser tiene su propio set en memoria. El otro usuario NO ve el archivo. **No es multi-usuario funcional**: es single-user-per-browser sobre un shell organizacional vacío.

---

# Top 3 fixes urgentes

| # | Fix | Esfuerzo | Impacto en confianza |
|---|---|---|---|
| 1 | Unificar fórmula "meta del mes" en `domain-aggregations.ts` y consumirla desde dashboard, MetasPage, radar/pulso. Reemplazar literal `46,057` en LandingPage por copy genérico. | 3-5 h | **Alto** — la cifra en hero/dashboard/metas es lo primero que mira el cliente. |
| 2 | Reemplazar el agregado de departamentos en `chatService.ts:445-464` por consumo de `ctx.departamentoSummaries` ya pre-computado en analysis worker. | 1-2 h | **Alto** — chat-IA contradiciendo el mapa destruye confianza en el asistente. |
| 3 | Sincronizar pill `/clientes` con `filtered.length` cuando hay slider override, o recalcular `clientesDormidos` con threshold local. | 1-2 h | **Medio** — contradicción visible en una sola vista, pero confunde inmediatamente. |

Bonus (deuda fundacional, 1-2 días): crear `src/lib/metrics/` con selectors centralizados (`getYTD`, `getMetaMes`, `getDeptVariance`, etc.) y migrar páginas/chat para que ninguna recalcule. Hoy hay >10 archivos con cálculos KPI redundantes.

---

# Recomendación arquitectónica

**Sí: crear `src/lib/metrics/` formal** (o promover `domain-aggregations.ts` a hub canónico real).

`domain-aggregations.ts` ya existe y según MEMORY.md fue intento de fuente única (Z.1, Z.1.b, R102-R105). Pero:
- Páginas críticas (`EstadoComercialPage.tsx`, `RendimientoPage.tsx`) siguen recalculando in-place memos.
- `chatService.ts` reimplementa agregaciones que ya están en `analysisWorker` (departamentos, clientes top).
- Las 4 inconsistencias auditadas tienen el mismo patrón de raíz: **misma pregunta semántica, fórmulas distintas en archivos distintos, tests que no comparan cross-página**.

Acción concreta:
1. Adoptar `lib/metrics/` con selectors puros y typed (input: store snapshot; output: KPI con metadata `{rango, métrica, filtros}`).
2. Test de regression que compare salida de cada selector con su versión legacy en cada página, hasta migrar todas.
3. Marcar `chatService.ts` como **consumidor**, no calculador.

---

# Promesas no implementadas

| Promesa | Dónde aparece | Realidad en código |
|---|---|---|
| **"22 patrones de riesgo"** | `src/pages/LandingPage.tsx:465, 635, 731` (`'22 patrones de riesgo'`, `{ num: '22', label: 'Patrones de riesgo' }`, `'detecta 22 patrones de riesgo en segundos'`) | NO SE PUEDE VERIFICAR el número exacto: `insight-registry.ts` define varios tipos pero no fue audited contra "22". El número parece copy de marketing sin binding. |
| **Forecast SARIMA/ENSEMBLE** | CLAUDE.md ("Modelos: NAIVE, ETS, SARIMA, ENSEMBLE"); copy en RendimientoPage | Backend existe, pero `FORECAST_BACKEND_ENABLED = false` (`RendimientoPage.tsx:89`). No reachable desde la UI. |
| **Brecha "23,473 uds de 46,057"** | `LandingPage.tsx:617` | Hardcoded literal, no calculado. |
| **Export PDF** | NO se encontraron menciones explícitas en código (`jsPDF`/`pdfkit`/`exportPDF` solo aparecen en `node_modules/typescript/lib/typesMap.json`, no en src). | NO existe. Si está prometido en marketing, no está implementado. |
| **Multi-tenancy real** | `organizations`, `org_members`, invites con policies | Solo metadata de org. No hay tabla compartida de sales/metas/inventory: cada browser corre standalone. Dos usuarios del mismo org no ven los datos del otro. |
| **Persistencia de datos** | UX implícita: "subo archivo y queda guardado" | Sales/metas/inventory NO se persisten ni en Supabase ni en localStorage (`appStore.ts` persist excluye estos). Refresh del navegador limpia todo. |
| **Backend forecast desplegado en Render** | Contexto del audit + flag `FORECAST_BACKEND_ENABLED` indica intención | Aunque desplegado, frontend hardcoded a `false`. Endpoint inalcanzable hoy desde producción. |

**Secrets en repo**: NO SE PUEDE VERIFICAR exhaustivamente sin grep de keys; este audit no escaneó `.env*`. Recomendado pasar `gitleaks`/`trufflehog` en pipeline.
