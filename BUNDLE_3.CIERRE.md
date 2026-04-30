# Sprint 3 — Cierre formal

**Fecha de cierre:** 2026-04-29
**Commit ancla:** `71504170` (3.E.3 truncamiento monthColumns)
**Branch:** motorinsights
**Próximo:** Sprint 4 — foco a definir

## 1. Resumen ejecutivo

Sprint 3 consolidó la migración del modelo "rango activo" iniciada en Sprint 2. Tres bloques principales:

- **Bundle 3.A** (3 commits): introducción del primitivo `computeRangeYoY` en `lib/analysis.ts` como única fuente de YTD/rango YoY. Migración del wrapper legacy `computeYTD` y de los 3 entry points del motor (`analyze`, `analyzeVendor`, `analyzeSupervisor`) para aceptar `selectedPeriod` con `monthStart`/`monthEnd` opcionales — bit-exact con goldens.

- **Bundle 3.B** (10 commits, cerrado en `2eb9ce98`): hardening del TopBar con simetría Desde/Hasta, propagación de rango-awareness end-to-end por las 3 superficies P0 (EstadoComercial card VENTA ACUMULADA, VendedoresPage tabla + cards, ClientesPage labels + `valor_yoy_usd`), fix crítico del rebote del dropdown `setFechaRefISO`, cleanup del wrapper `computeYTD` y BACKLOG con 3 follow-ups.

- **Bundle 3.E** (3 commits): nueva tabla "Venta mensual histórica" en `/rendimiento` con toggle vs vista YTD existente (3.E.1), paridad estructural total tree pivot YTD ↔ monthly reusando `flattenPivot` genérico y `expandedKeys` compartido (3.E.2), y truncamiento `monthColumns` por `fechaRef` para ocultar meses futuros y pre-dataset (3.E.3).

Adicionalmente: refactor cosmético de `ComparisonSummary` (3.D) para consumir `salesInPeriod` global y eliminar duplicación.

## 2. Mapa de commits

| # | Hash | Ticket | Resumen | Tipo |
|---|------|--------|---------|------|
| 1 | `677db06e` | 3.D | ComparisonSummary consume `salesInPeriod` global | refactor |
| 2 | `e733b4f8` | 3.A | `computeRangeYoY` primitive + `computeYTD` wrapper legacy | feat |
| 3 | `a8d8e6da` | 3.A.1 | migrate `analyzeSupervisor` to `computeRangeYoY` | refactor |
| 4 | `ed0ce72c` | 3.B.1 | TopBar simetría dropdown "Desde" + tope fechaRef | fix |
| 5 | `7a3b9e80` | 3.B.½ | entry points motor rango-aware + sentinel year=0 | refactor |
| 6 | `8109d002` | 3.B.2 | EstadoComercial card VENTA ACUMULADA rango-aware | feat |
| 7 | `d54e18c7` | 3.B.2.1 | `formatPeriodLabel` admits `includeYear` option | refactor |
| 8 | `d29eb68c` | 3.B.8 | fix rebote dropdown `setFechaRefISO` post-worker | fix |
| 9 | `e0a7d389` | 3.B.3 | VendedoresPage labels rango-aware | feat |
| 10 | `5a4c2cb7` | 3.B.4 | ClientesPage + `valor_yoy_usd` rango-aware (absorbe 3.C) | feat |
| 11 | `d5e463be` | 3.B.6 | cleanup `computeYTD` + dead destructure + tooltips + BACKLOG | chore |
| 12 | `2eb9ce98` | 3.B.cierre | doc bundle 3.B | doc |
| 13 | `de267ac1` | 3.E.1 | tabla "Venta mensual histórica" con toggle | feat |
| 14 | `a3a12e6e` | 3.E.2 | tree pivot paritario YTD ↔ monthly | refactor |
| 15 | `71504170` | 3.E.3 | truncar `monthColumns` por `fechaRef` + 7 tests builder | feat |

**15 commits funcionales.** Doc-only de cierre (este) suma 16. Investigaciones intermedias sin commit: 3.B.0, 3.B.3.5, 3.E.0, 3.E.1.fix.

## 3. Suite final

- **typecheck**: 0 errores
- **unit**: **209/209** verde (+27 vs Sprint 2 cierre = 181)
  - +22 propagación rango-aware del bundle 3.B (entry points, store, valor_yoy_usd, formatPeriodLabel)
  - +7 builder monthly en 3.E.3
- **E2E**: 22/22 verde (sin cambio neto vs Sprint 2 cierre)
- **goldens**: bit-exact (`insight-engine.golden.test.ts.snap` y `insight-engine.gate-audit.test.ts.snap` no se movieron en ningún commit del sprint)
- **lint**: estado equivalente a Sprint 2 cierre, sin nuevas warnings introducidas

## 4. Decisiones de producto materializadas

- **Opción Z** — campos `ytd_*` siempre reflejan rango activo, no se renombran (bundle 3.B).
- **Opción β** para `computeRangeYoY` — función nueva + wrapper legacy `computeYTD` interno (3.A).
- **Sentinel `year === 0`** — pre-hidratación / pre-carga del store: silently fallback al path legacy YTD; throw solo si year > 0 y year ≠ fechaRef.year (3.B.½).
- **Variante 1 TopBar** — dropdowns Desde y Hasta acotados a fechaRef como tope superior, simétricos (3.B.1).
- **Sub-label compacto** — sin año intermedio en EstadoComercial card: "Acumulado Ene–Feb día 6 vs mismo período 2025" (3.B.2.1, opción B).
- **VendedoresPage P1=β / P2=a** — headers dinámicos con año explícito; cards "en {período}" en vez de "año a la fecha" (3.B.3).
- **ClientesPage Opción Z aplicada a `valor_yoy_usd`** — semántica intencionalmente cambiada de single-month a rango con same-day cutoff en monthEnd (3.B.4).
- **Tabla mensual NO altera vista YTD** — convive vía toggle "Venta YTD" / "Venta mensual histórica" (3.E.1).
- **Paridad estructural total tree YTD ↔ monthly** — mismos chevron, indent, badges, expand/collapse handlers (3.E.2).
- **`'mes'` excluido de `pivotDims`** al construir filas monthly — `'mes'` ya está en columnas; chip queda disabled visualmente (3.E.2).
- **Sort root monthly por columna TOTAL únicamente** — no se agregan flechas en columnas mes individuales (ruido visual con 24-36 cols) (3.E.2).
- **`expandedKeys` compartido** entre vistas YTD y monthly — IDs `${parentId}::${val}` idénticos por construcción (3.E.2).
- **Truncamiento `monthColumns`** — primer mes con venta del dataset INCLUSIVE → `fechaRef.month` INCLUSIVE; meses futuros y pre-dataset ocultos (3.E.3).
- **`fechaRef` como única fuente de "hoy"** — nunca `new Date()` browser, ni siquiera como fallback (todo el sprint).

## 5. BACKLOG actualizado

Tres entradas nuevas agregadas a `BACKLOG.md` § "Sprint 4 candidates" (raíz del repo, mismo lugar donde 3.B.6 ya había agregado las 3 anteriores).

### 3.E.4 — Consistency tree pivot monthly (Sprint 4, prioridad media)

Detectado en validación visual de 3.E.2:

- **Indent monthly = 24px vs YTD = 28px**. Unificar a 28px para alineación visual exacta.
- **`expandAll` / `collapseAll`** del header en vista monthly solo recolectan IDs de `pivotData` (YTD). Cuando `tableView === 'monthly'`, deberían recolectar de `monthlyPivotData` (state ya disponible en RendimientoPage). Caso límite cuando dim chains no coinciden entre vistas.

Diff esperado: ~10–15 líneas. Riesgo bajo. No blocker para ningún feature.

### 3.E.5 — Refactor extracción `<TreeRow>` compartido (Sprint 4, prioridad baja)

Bundle 3.E generó duplicación de UI tree entre vista YTD y monthly. Cada vista tiene su propio render inline de chevron + indent + badge + cell + handlers (~100 líneas duplicadas con shape divergente solo en las cells).

Reducción estimada: ~80–120 líneas si se extrae `<TreeRow>` con prop polimórfica para renderizar cells distintas por vista. Diff total esperado del refactor: ~150–200 (extracción + 2 call sites). Riesgo medio (refactor visible, requiere validación visual exhaustiva). NO blocker.

### Pendientes pre-existentes (preservados)

Los 3 follow-ups de bundle 3.B.6 siguen vigentes — Sprint 3 no los invalidó:

- **`cumplimiento_pct` rango-aware** (Sprint 4) — decisión de producto pendiente: ¿anclado a `monthEnd` o agregado del rango?
- **Default `'ok'` para vendedores sin baseline YoY** (Sprint 4) — bug menor pre-existente, decisión de producto sobre nuevo bucket `'sin_baseline'`.
- **UX labels "YTD" en drawer ClientesPage** (3.B.9) — copy-only, scope reducido.

Total BACKLOG vigente para Sprint 4: **5 follow-ups** (3 de 3.B + 2 de 3.E), todos non-blocking.

## 6. Estado para Sprint 4 / producción

Sprint 3 deja la página `/rendimiento` con dos vistas paritarias (YTD + monthly histórica), el primitivo `computeRangeYoY` listo para nuevos usos, y el bundle 3.B materializó rango-awareness end-to-end en las 3 superficies P0 del flujo principal. Tech debt acotada: 5 entries de BACKLOG, todas non-blocking. Goldens bit-exact en todos los commits → producción puede iterar sobre Sprint 4 sin miedo a regresiones de motor.

**Sugerencias de foco para Sprint 4** (a definir con el founder):

1. **Continuación natural de bundle 3.B**: `cumplimiento_pct` rango-aware + cleanup de los otros 2 follow-ups 3.B → cierre completo de la migración rango.
2. **Pivote a otra superficie**: revisar páginas que aún no consumen el rango (Rotación, Departamentos) o features nuevos.
3. **Extracción `<TreeRow>` compartido (3.E.5)**: refactor doloroso pero deja el código de pivot tree mantenible para futuras superficies similares.

Listo para arrancar Sprint 4 cuando se defina el foco.
