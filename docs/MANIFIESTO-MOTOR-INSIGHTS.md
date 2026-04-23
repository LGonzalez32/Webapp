# 📘 MANIFIESTO DEL MOTOR DE INSIGHTS — SalesFlow

**Versión:** 2.6.0 (Fase Z.8 — Motor 2: detectores estadísticos Metric × Dimension × InsightType)
**Última actualización:** 22 de abril 2026
**Propósito:** documento único de referencia sobre cómo funciona el motor de diagnóstico de SalesFlow. Lectura obligatoria antes de tocar código del motor o de abrir una fase nueva.

**Nota v2.5.0-pre (Z.7 T1 — nuevos tipos + templates):** Tanda 1 de migración al grid unificado. §29.1: 4 tipos nuevos (`stock_risk`, `stock_excess`, `migration`, `co_decline`) agregados al `INSIGHT_TYPE_REGISTRY` con lógica cuantitativa copiada literalmente de los detectores del motor viejo (L963, L2499, L2157, L2258). `NARRATIVE_TEMPLATES` agregado en `insight-engine.ts` — copia literal del copy del motor viejo para los 4 tipos nuevos más `meta_gap`. Pase de inventario especial (3D) en `runInsightEngine` construye `DataPoint[]` desde `categoriasInventario` + agregados YTD, llama a `detect()` y aplica templates. Motor viejo sigue corriendo en paralelo (no apagado). R132: nuevos tipos en registry. R133: templates preservan calidad del motor viejo. `tsc --noEmit` 0 errores. `npm run build` limpio.

**Nota v2.3.0 (Z.5 — fusión real de motores):** Fase Z.5 completada en dos frentes. Frente 1: adaptador `buildRichBlocksFromInsights` reparado — umbral de protagonista bajado de ≥3 a ≥1 con filtro de impacto ≥$500, secciones `concentracion`/`looseClients`/`productInsights` alineadas a prefijos reales del motor viejo, `.slice(0,6)` eliminado del adaptador. Motor viejo pasa de 0% a aporte real en el pipeline de cards. Frente 2: `impactoUSD: number` agregado como campo obligatorio a `DiagnosticBlock` — los 7 sitios de construcción lo setean; `enrichDiagnosticBlocks` usa `impactoUSD > 0` como criterio rector de ordenamiento, con fallback × 0.5 para no-monetizables. R118, R119, R120. `tsc --noEmit` 0 errores.

**Nota v2.0:** Esta versión absorbe las 8 mini-fases del Frente A (5I–5I.7) y la Fase Z.1. Reemplaza completamente v1.4.1. Las reglas R68–R101 documentadas abajo cubren toda la lógica de saneado narrativo. El archivo `domain-aggregations.ts` es ahora la fuente única de cálculos derivados de ventas (R102/R103).

**Nota v2.2.0 (Z.4 — performance):** Fase Z.4 completada: Cuello 2 (`getAgregadosParaFiltro` — 3 pasadas → 1, R114), Cuello 4 (`_stats` pre-computadas de `runInsightEngine` → `filtrarConEstandar`, R115), Cuello 1 (poda Pareto Pareto en main loop, `prunable` en registry, R116 — solo `dominance` por seguridad), Cuello 3 (`buildRichBlocksFromInsights` exportado + `_legacyBlocks` useMemo, R117). Cuello 5 descartado (O(n²) acotado a ~600 ops). Cuello 7 ya estaba implementado. Gap 5 (V1–V14 en código) ya estaba implementado. `tsc --noEmit` 0 errores. `npm run build` limpio.

**Nota v2.1.0 (Z.3 + auditoría):** Frente Z.3 completado: `NarrativeBuilder` creado (R111–R113), `diagnostic-actions.ts` reducido a 316 líneas, `diagnostic-generator.ts` y `narrative-builder.ts` extraídos, 8 sanitizadores eliminados, 23 tests. Alineación doc↔código: §3 actualizado (diagnostic-engine.ts eliminado, builders ricos documentados), §7 reescrito (merge real documentado), §8 aclarado (estándares huérfanos reales identificados), §9 pipeline actualizado, §16 tabla V1–V14 con líneas reales de código, §20 rango actualizado a R1–R113, §24 categorías ACTIVA/SOLO-ALERTA/NO-IMPLEMENTADA, §25 nueva con R111–R113. Cuellos de performance: useMemo dividido en 3 en EstadoComercialPage (Cuello 6), guards R99/R100 solo en DEV (Cuello 7).

**Nota v2.0.1 (Z.1.b):** Barrido de consumidores completado. Las 4 páginas activas importan de `domain-aggregations.ts`. Nuevos helpers: `getParetoClientes`, `getClientesEnRiesgoTemprano`, `getValorEnRiesgoTotal`, `getConteosPorEstado`, `getVentasTotalEquipoYTD`, `getVentasPorVendedorAgrupado`, `getVentasNetaPeriodo`, `getMatrizHistoricaVendedorMes`, `getSupervisorMap`, `getListaSupervisores`. Total: ~27 exports. R103 aplicado en todos los useMemos locales con justificación explícita. R104/R105 activados.

### v2.0.1 — Barrido consumidores Z.1.b

**Migraciones:**
- EstadoComercialPage: `topProductosPorCliente` ya migrado (Z.1); 9+ marcadores R103 aplicados
- ClientesPage: 3 useMemos migrados (`paretoClientes`, `riesgoTemprano`, `totalValorEnRiesgo`); 6+ marcadores R103
- VendedoresPage: 3 useMemos migrados (`counts`, `teamTotal`, `filteredTotals`); 4+ marcadores R103
- MetasPage: 4 useMemos migrados (`matrix`, `teamRealNeto`, `supervisorMap`, `supervisores`); 5+ marcadores R103

**Helpers nuevos en domain-aggregations.ts:**
- `getParetoClientes`, `getClientesEnRiesgoTemprano`, `getValorEnRiesgoTotal`
- `getConteosPorEstado`, `getVentasTotalEquipoYTD`, `getVentasPorVendedorAgrupado`
- `getVentasNetaPeriodo`, `getMatrizHistoricaVendedorMes`
- `getSupervisorMap`, `getListaSupervisores`

**R103 aplicado:** todo useMemo en página lleva comentario // R103: [razón UI-local].
**R104 activado:** helpers reutilizados entre páginas (R104 nota en los comentarios).
**R105 activado:** todo useMemo es (a) import de domain-aggregations, (b) derivación trivial, o (c) tiene R103.

**Convención de lectura:** cuando una sección describe comportamiento futuro, se marca explícitamente con `[OBJETIVO]`. Todo lo demás describe el estado actual.

---

## 1. ¿Qué es este sistema?

SalesFlow es una plataforma de inteligencia comercial para equipos de ventas. El motor de insights es el componente que lee los datos operativos de una empresa (ventas, inventario, metas, cartera) y genera automáticamente alertas de diagnóstico que un vendedor, supervisor o gerente puede leer en 30 segundos para entender qué está pasando en su negocio.

No es un dashboard. No es una lista de gráficos. Es un sistema que piensa por el usuario y le dice qué pasa, por qué pasa y dónde duele, con el contexto suficiente para actuar.

## 2. Principio rector

Cada tarjeta que llega a pantalla cumple tres cosas al mismo tiempo:

- **Qué pasa**: el dato duro observado.
- **Por qué pasa**: la causa conectada a otras variables de la operación.
- **Dónde duele**: el impacto concreto en ventas o metas.

Si un candidato no cumple los tres, no entra. No existen tarjetas decorativas ni informativas "por si acaso". El sistema prefiere mostrar menos y mejor, antes que llenar la pantalla.

## 3. Arquitectura de archivos — la diferencia crítica

Hay dos archivos centrales que no hay que confundir:

### `src/lib/insightStandard.ts` — LA FUENTE DE LA VERDAD

**Rol:** biblioteca de reglas, umbrales, constantes, validadores puros y utilidades de cálculo.
**Tamaño actual:** 94,881 bytes.
**Exports actuales:** 37 (los 37 estándares).
**Dependencias:** ninguna interna del dominio de insights.

Contiene las **reglas del sistema**: umbrales de ruido, cálculos de Pareto, detección de redundancia, términos prohibidos en output, formato de impacto, validaciones formales, etc.

Es **declarativo y sin estado**. Cada función recibe inputs y devuelve un resultado. No sabe nada del pipeline, del UI ni de tarjetas. Solo sabe aplicar reglas.

**Cuándo se toca:** cuando cambia un umbral, una constante numérica, una regla de validación formal, un término prohibido, o se agrega un estándar nuevo.

### `src/lib/insight-engine.ts` — EL ORQUESTADOR

**Rol:** motor que toma los datos, aplica las reglas de `insightStandard.ts`, construye los candidatos, los enriquece con cruces, los redacta con storytelling, y los devuelve listos para renderizar.
**Tamaño actual:** 302,778 bytes.
**Exports actuales:** `runInsightEngine`, `filtrarConEstandar`, y artefactos auxiliares.
**Dependencia:** importa `insightStandard.ts`.

Contiene la **orquestación del pipeline**: generación de candidatos, enriquecimiento, rescues, introMap, refMap, REF_GENERICA_POR_DIM, LEMA_MAP, plantillas de bullets, validadores aplicados (V1–V15 como lógica), pipeline end-to-end.

**Cuándo se toca:** cuando cambia cómo se redacta, cómo se enriquece, cómo se orquesta el pipeline, qué tipos de insight se detectan, cómo se conectan las tablas entre sí.

### Heredero del motor viejo — builders ricos en `insight-engine.ts`

**`diagnostic-engine.ts` fue eliminado en Fase Z.2.** Su lógica vive ahora dentro de `src/lib/insight-engine.ts` como funciones privadas:

| Función | Línea aprox. | Rol |
|---|---|---|
| `buildRichVendorSection` | L1847 | Narrativa de bloque vendedor |
| `buildRichProductSection` | L1968 | Narrativa de bloque producto |
| `buildRichConcentracionSection` | L2075 | Narrativa de bloque concentración |
| `buildRichClientsSection` | L2126 | Narrativa de bloque clientes sueltos |
| `buildRichPositiveSection` | L2181 | Narrativa de bloque positivo (equipo) |
| `buildRichBlocksFromInsights` | L2284 | Orquestador: invoca los 5 builders |

Todos estos builders fueron migrados a `NarrativeBuilder` en Z.3 (sentinel `__nb__`). No son exportados; los consumidores reciben `DiagnosticBlock` ya enriquecido.

**Convención de ids por prefijo:**
- `vendor-${vendedor}` — bloques del motor heredado (legacy)
- `ie-${dim}-${tipo}-${idx}` — bloques del motor estadístico nuevo
- `ie-${dim}-dormido-${idx}` — bloques de cliente dormido

### `src/lib/narrative-builder.ts` — BUILDER TIPADO (Fase Z.3)

**Rol:** `NarrativeBuilder` absorbe R68, R81, R83, R87, R88, R91, R94, R95, R97 por construcción. Sin post-hoc sanitizers.
**Tamaño actual:** 317 líneas.
**Exports:** `NarrativeBuilder`, `NB_SECTION_LABEL`, `fmtDeltaDisplay`, `parseDisplayDelta`, `DisplayDelta`, `fmtSignedDelta`, `validateProductoContraTopList`, `joinSentences`.

### `src/lib/diagnostic-generator.ts` — GENERADOR DE ACCIONES (Fase Z.3)

**Rol:** `generarAcciones`, `parseBlockMeta`, `determineSinAccionesLabel` movidos aquí desde `diagnostic-actions.ts`.
**Tamaño actual:** 305 líneas.
**Exports:** `Accion`, `StoreForGenerator`, `parseBlockMeta`, `generarAcciones`, `determineSinAccionesLabel`.

### `src/lib/diagnostic-actions.ts` — MOTOR DE SANEADO NARRATIVO (Frente A → Z.3)

**Rol:** enriquecimiento determinístico de `DiagnosticBlock`. Implementa R68–R101. Sin LLM.
**Tamaño actual:** 316 líneas (reducido de 1,064 en Z.3).
**Exports principales:** `enrichDiagnosticBlocks`, `EnrichedDiagnosticBlock`, `TopProductoClientEntry`, `TopProductoEntry`, `DisplayDelta` (re-export), `Accion` (re-export), `StoreSnapshot`, `fmtDeltaDisplay` (re-export).
**Estado:** estable. Sanitizadores eliminados: `sanitizeR80`, `pickConnector`, `buildStockNarrative`, `repairStockClauses`, `repairDormidoReferenceInBullet`, `cleanDanglingConnectors`, `repairTopProductRef`, `normalizeSpacing`. Retenidos como guards: `repairGrammar`, `collapseRedundantTopProductClauses`.

### `src/lib/domain-aggregations.ts` — FUENTE ÚNICA DE CÁLCULOS (Fase Z.1)

**Rol:** fuente única de toda función que agrega o deriva ventas. Páginas y motores importan desde aquí (R102). Importaciones directas a `insightStandard.ts` desde páginas solo se permiten para constantes (R103).
**Exports principales:** `getRangoMTD`, `getRangoYTD`, `getRangoMTDComparableYoY`, `getRangoYTDComparableYoY`, `getRangoUltimos3Meses`, `filtrarVentasPorRango`, `getDeltaYoYPorCliente/Vendedor/Producto/Categoria/Zona`, `getTopProductosPorCliente`, `getTopProductosPorClienteAmbosRangos`, `getCumplimientoMeta`, `getCompradoresUnicosPorProducto`, `esEntidadPareto`, `fmtMonedaCompacta`.
**Estado:** nuevo en v2.0. Expandir cuando se extrae lógica de páginas en Fase Z.2.

### Regla operativa

- Cambia un umbral o una constante numérica → se edita `insightStandard.ts` (y antes, este manifiesto).
- Cambia cómo se redacta o cómo se orquesta → se edita `insight-engine.ts` (y antes, este manifiesto).
- Agrega/modifica una función que agrega ventas → se edita `domain-aggregations.ts`.
- Nunca se duplica lógica. Si un umbral aparece hardcodeado en `insight-engine.ts` es bug. Si un cálculo sobre ventas vive en una página, es deuda Z.1 (R102).

## 4. Principios inamovibles

**P1 — Fuente única de configuración.** Los 37 estándares en `insightStandard.ts` son el único lugar donde viven las reglas de comportamiento del motor. Todo ajuste numérico, estético o de prioridad se codifica como estándar. No existen valores mágicos sueltos en `insight-engine.ts` ni en otros archivos.

**P2 — Autoconfiguración por datos.** El motor no le pide al usuario que configure umbrales, cantidad de tarjetas, severidades, orden o tono. Todo se deduce de los datos disponibles en la empresa activa y de los estándares.

**P3 — Pareto como vara universal.** La relevancia de clientes, productos, vendedores y categorías se mide con el Pareto 80/20 de la empresa activa. Una empresa de $10K mensuales y una de $10M mensuales generan alertas igual de relevantes sin configuración manual. La función canónica es `calcularPareto()` en `insightStandard.ts`.

**P4 — Ventanas temporales con control de estacionalidad.** Las únicas comparaciones de crecimiento válidas son **MTD vs mismo MTD del año anterior** (YoY mensual) y **YTD vs mismo YTD del año anterior** (YoY anual). Comparar contra el mes anterior está prohibido bajo cualquier forma, porque no controla por estacionalidad: una caída contra el mes anterior puede ser ruido estacional (fin de temporada, cambio de ciclo, promoción no repetida) y no una caída real del negocio. La evolución mes-a-mes solo se usa como **tendencia móvil** sobre varios meses, nunca como punto de comparación puntual.

**P5 — Prioridad por impacto en venta.** Todos los tipos de insight compiten por una métrica común: cuánto explican del movimiento de venta en la moneda o unidad activa (`tipoMetaActivo`). Ese es el criterio de orden final.

**P6 — Dormidos con umbral configurable.** Los clientes clasificados como dormidos se tratan como cualquier otro insight — compiten en el ranking por impacto en venta y pasan por los 37 filtros y validadores V1–V16. El umbral que define "cuántos días sin comprar = dormido" es configurable por el usuario (default 45 días, rango 15–180) vía input en la página Clientes, persistido en localStorage con clave `salesflow.dias_dormido`. Cada alerta que clasifique un cliente como dormido debe incluir los días sin comprar en su texto visible; si hay ≥1 alerta de dormido renderizada, aparece un cintillo informativo con el umbral actual y link al input de ajuste.

**P7 — Integridad de datos no negociable.** El motor no inventa cruces, no suaviza números, no correlaciona sin evidencia real. Un cruce mencionado en texto tiene que tener respaldo medible en las tablas.

**P8 — Storytelling obligatorio.** Todo insight tiene estructura narrativa: qué pasa + por qué pasa + dónde duele. Datos crudos sin contexto no pasan. Jergas técnicas (p-valor, σ, slope, outlier, cuartil) no aparecen nunca en texto visible. La validación formal vive en `TERMINOS_PROHIBIDOS_EN_OUTPUT` de `insightStandard.ts`.

**P9 — Recuperación escalonada, no veto absoluto.** Cuando un validador detecta un problema, el sistema intenta corregir antes de descartar. Primero sustituye por sinónimo, después reescribe con plantilla alternativa, después degrada a un bullet, y solo al final descarta. [Estado actual: veto absoluto en V13–V15. Objetivo Fase 5E: recuperación escalonada completa.]

## 5. Ventanas temporales y estacionalidad

### Por qué no se compara contra el mes anterior

El negocio comercial es cíclico. Un producto puede vender más en un mes porque era temporada (bebidas frías en verano, útiles escolares en enero, artículos de limpieza en fin de mes), porque hubo una promoción puntual, porque un cliente grande hizo un pedido anual, o porque el mes anterior tuvo más días hábiles o una quincena distinta.

Comparar MTD actual contra el mes anterior (completo o MTD) mezcla señal real de negocio con ruido estacional. Un "cayó 78% vs el mes pasado" puede ser:
- caída real del negocio que requiere acción, o
- fin natural de una temporada alta, o
- ausencia de una promoción puntual, o
- cambio de calendario entre meses.

El motor no puede distinguir cuál es cuál con datos mes-a-mes. Entonces la regla es: no se compara contra el mes anterior bajo ninguna forma.

### Las únicas comparaciones válidas

**YoY mensual — MTD vs mismo MTD del año anterior.**
Si hoy es 16 de abril de 2026, el período base es 1–16 de abril 2026 y el comparable es 1–16 de abril 2025. Esto controla estacionalidad porque compara el mismo momento del ciclo anual.

**YoY anual — YTD vs mismo YTD del año anterior.**
Si hoy es 16 de abril 2026, YTD actual es 1 de enero al 16 de abril 2026, y YTD comparable es 1 de enero al 16 de abril 2025.

### Tendencia móvil — el otro uso legítimo de datos mes-a-mes

La evolución mes-a-mes se usa solo para detectar **trayectoria** sobre varios meses, no para comparar dos puntos. Un insight tipo `trend` mira los últimos 3 meses y detecta si la pendiente es positiva o negativa. No dice "cayó X% contra el mes anterior", dice "viene cayendo sostenidamente en los últimos 3 meses". La ventana larga neutraliza el ruido estacional puntual.

### Fallbacks cuando no hay datos YoY

Empresas nuevas o con menos de 12 meses de historia no pueden hacer YoY. En ese caso:

1. **Primera opción: tendencia móvil.** Usar trayectoria de los meses disponibles (mínimo 3) para detectar si el período actual se desvía de la curva. No hay número de crecimiento, hay evaluación de consistencia con la tendencia.
2. **Segunda opción: análisis descriptivo sin comparación.** Mencionar el valor actual en contexto ("Snacks vende 815 USD MTD, concentrando 12% de la venta total del mes") sin comparar con ningún período. Menos accionable pero honesto.
3. **Nunca: fallback a mes anterior.** Está prohibido incluso como último recurso.

### Análisis histórico como contexto

La venta total acumulada por año, por trimestre, por canal, es información descriptiva válida y se puede mostrar como contexto. Pero no se usa como base de comparación de crecimiento ni genera insights de tipo `change`.

### Prohibiciones explícitas

- Comparar MTD actual contra mes anterior completo. Siempre mal.
- Comparar MTD actual contra MTD del mes anterior. Siempre mal (estacionalidad).
- Usar "vs el mes anterior" en texto visible bajo cualquier forma.
- Inventar comparaciones YoY cuando no hay datos YoY reales (fabricar números).

### Estado actual

**Bug detectado:** los insights tipo `change` en el render actual comparan contra mes anterior completo ("Snacks: 815 USD vs 3,463 USD el mes anterior"). Esto viola P4 y el principio de estacionalidad. La corrección es Fase 5A, que migra toda comparación a YoY o a tendencia móvil según disponibilidad de datos.

## 6. Qué datos consume el motor

El motor lee las siguientes tablas del estado global de la empresa activa. Cada tabla es opcional excepto `sales`. Si una tabla falta, los rescues y cruces que la necesitan se deshabilitan automáticamente sin romper el motor.

- **`sales`** — ventas. Único obligatorio. Cada registro: fecha, cliente, producto, vendedor, categoría, departamento, canal, cantidad, precio unitario, monto.
- **`inventory`** — stock por producto.
- **`metas`** — metas mensuales por vendedor/producto/cliente/categoría.
- **`vendorAnalysis`** — resumen por vendedor precalculado.
- **`clienteSummaries`** — resumen por cliente.
- **`productoSummaries`** — resumen por producto.
- **`concentracionRiesgo`** — qué entidades concentran un % peligroso.
- **`categoriaAnalysis`** — venta/tendencia/contribución por categoría.
- **`canalAnalysis`** — venta/tendencia por canal.
- **`clientesDormidos`** — **NO se consulta en este motor.** Vive solo en la pantalla de Clientes (P6).
- **`teamStats` / `supervisorAnalysis`** — agregados del equipo comercial.

## 7. Los dos motores (fusión real — Fase Z.5)

> **Realidad actual (v2.3.0):** `diagnostic-engine.ts` fue eliminado en Fase Z.2. El "motor viejo" (`insightEngine.ts`, 27 detectores) genera `Insight[]` que pasan por `buildRichBlocksFromInsights` — adaptador en `insight-engine.ts`. Post-Z.5: el adaptador reconecta correctamente todos los prefijos del motor viejo y contribuye bloques reales al pool final. El motor viejo ya **no es inerte** — aporta vendor-cards, product+inventory-cards, y concentration-cards que compiten por las 12 posiciones finales ordenadas por `impactoUSD`.

### Motor estadístico: `runInsightEngine`

Ubicación: `src/lib/insight-engine.ts`.
Enfoque estadístico. Detecta patrones matemáticos sin reglas de negocio hardcodeadas.

**Estado actual en producción:** Motor 1 (heredado) emite `correlation`, `cliente_dormido`, `change`, `trend`, `contribution`, `meta_gap`, `stock_risk`, `stock_excess`, `migration`, `co_decline`. Motor 2 (estadístico Z.8) emite `change_point`, `steady_share`, `correlation` (builder dedicado), `outlier`, `seasonality`, `meta_gap_temporal`. Los candidatos del Motor 1 pasan por `filtrarConEstandar` (V1–V14 + V15/V16) antes de llegar al render. Los del Motor 2 pasan por el ranker con `ALWAYS_PROTECTED_CAPS` por tipo.

Tipos de insight declarados:
- **change** — cambio significativo entre el período actual y su comparable YoY. Para MTD, compara contra el mismo MTD del año anterior. Para YTD, contra el mismo YTD del año anterior. Nunca contra el mes anterior.
- **trend** — tendencia sostenida últimos N meses.
- **contribution** — qué miembro explica la mayor parte del movimiento del grupo.
- **meta_gap** — brecha entre cumplimiento actual y proyección al cierre.
- **dominance** — concentración excesiva en un miembro.
- **concentration** — dependencia peligrosa de pocos miembros.
- **cliente_dormido** — cliente con `dias_sin_actividad ≥ umbral` (configurable, default 45).

Dimensiones: vendedor, cliente, producto, categoría, departamento, supervisor.

Métricas: venta (USD), unidades, número de transacciones, precio unitario, cumplimiento de meta.

### Motor heredado: `buildRichBlocksFromInsights`

Ubicación: función privada en `src/lib/insight-engine.ts`, L2284.
Enfoque de reglas de negocio para los 7 tipos operacionales (vendor, productos, concentracion, clientes-sueltos, positivo).

**Merge actual (L2373–L2489 de `candidatesToDiagnosticBlocks`):**
1. `legacyBlocks = buildRichBlocksFromInsights(ctx.insights, ctx.vendorAnalysis)` (L2373)
2. `legacyEntities = new Set(legacyBlocks.map(b => b.headline))` (L2376–2381) — dedup por nombre
3. `uncoveredCandidates = filtered.filter(c => !legacyEntities.has(c.member))` (L2384–2388)
4. `merged = [...legacyBlocks, ...blocks].slice(0, 12)` (L2489–2492)

### Estado de la fusión

**Ya ejecutado (Z.5):** adaptador reparado — motor viejo aporta vendor-blocks, product+inventory-blocks, concentration-blocks. Dedup por entidad (string match) operativa. Ordenamiento final por `impactoUSD`.

**Pendiente (Z.6):** `mergeCandidates()` formal con dedup por tripla `(dim, miembro, métrica)`, elección de ganador por score/severidad, y `backupCandidate`. Diversificación top-k por dimensión.

**Estado oficial:** fusión real activa (Z.5) — motor viejo contribuye al render; mergeCandidates formal pendiente Z.6.

## 8. Los estándares de calidad en `insightStandard.ts`

Viven en `src/lib/insightStandard.ts`. Son la fuente única de configuración (P1). El motor los consume pero no los define.

> **Nota v2.1.0:** Los exports de `insightStandard.ts` son ~57 (funciones + constantes + tipos). De esos, 40 son importados directamente por `insight-engine.ts`. Los 17 restantes se clasifican así:

### Estándares re-exportados vía `domain-aggregations.ts` (consumidos por páginas)

`getRangoMTD`, `getRangoMTDComparableYoY`, `getRangoYTD`, `getRangoYTDComparableYoY`, `filtrarPorRango` — re-exportados desde `domain-aggregations.ts` y consumidos por las 4 páginas activas. No son huérfanos; cumplen R103.

### Utilidades de UI consumidas directamente por páginas

`DIAS_DORMIDO_MIN`, `DIAS_DORMIDO_MAX`, `LOCAL_STORAGE_KEY_DIAS_DORMIDO` — importados directamente desde `ClientesPage.tsx`. Permitido por R103 (son constantes de configuración UI).

### Huérfanos reales (definidos en insightStandard.ts, no llamados desde ningún otro archivo)

| Función/Constante | Línea | Estado |
|---|---|---|
| `evaluarPenetracion` | L195 | `[HUÉRFANO]` — solo en TODO comment L2781 de insight-engine.ts, no se llama |
| `tieneDatosYoY` | L792 | `[HUÉRFANO]` — definido, no llamado en ningún archivo |
| `mesesDisponiblesConData` | L801 | `[HUÉRFANO]` — definido, no llamado en ningún archivo |
| `clasificarDormido` | L868 | `[HUÉRFANO]` — definido, no llamado en ningún archivo |

**Estos 4 son candidatos a borrar en limpieza futura. NO borrar en esta fase.**

### Cómo se categorizan

Los 52 estándares cubren ocho áreas del comportamiento del motor. La lista completa con nombres reales de export está en el archivo `src/lib/insightStandard.ts`. Este manifiesto no enumera todos uno por uno porque el archivo ES la fuente; duplicarlos acá crearía la posibilidad de desincronización.

**Grupo A — Estadística y umbrales (incluye `calcularPercentiles`, `calcularPareto`, `esEntidadPareto`, `pasaFiltroRuido`).**
Define qué es estadísticamente relevante. Percentiles de corte, Pareto por dimensión, filtro de ruido.

**Grupo B — Coherencia entre tablas (incluye `detectarRedundancia`, `detectarCoDeclive`, `detectarCascadas`).**
Detecta redundancia entre candidatos, caídas conjuntas, cascadas causales.

**Grupo C — Cruces disponibles (`CRUCES_DISPONIBLES`, `evaluarPenetracion`).**
Define qué cruces son posibles y cuándo un miembro tiene penetración suficiente.

**Grupo D — Redacción y jerga (`TERMINOS_PROHIBIDOS_EN_OUTPUT`, `sustituirJerga`, `contieneJerga`, `sanitizarNarrativa`, `esConclusionValida`).**
Prohíbe términos técnicos, sanitiza texto, valida que una conclusión sea completa.

**Grupo E — Formato e impacto (`formatearImpacto`, `FORMATO`).**
Define cómo se expresa el impacto monetario y el formato de números.

**Grupo F — Validación final (`validarBalance`, `validarInsight`, `calcularDiasEnMes`, `calcularDiaDelMes`).**
Valida el insight completo antes de entregar, calcula días equivalentes para ventanas temporales.

**Grupo G — Ventanas temporales YoY (Fase 5A) (`getRangoMTD`, `getRangoMTDComparableYoY`, `getRangoYTD`, `getRangoYTDComparableYoY`, `filtrarPorRango`, `tieneDatosYoY`, `mesesDisponiblesConData`, `tieneReferenciaTemporalProhibida`, `COMPARACIONES_PERMITIDAS`).**
Ventanas temporales canónicas con control de estacionalidad. Prohibiciones anti-regresión sobre referencias temporales prohibidas.

**Grupo H — Dormidos con umbral configurable (Fase 5B) (`DIAS_DORMIDO_DEFAULT`, `DIAS_DORMIDO_MIN`, `DIAS_DORMIDO_MAX`, `LOCAL_STORAGE_KEY_DIAS_DORMIDO`, `getDiasDormidoUsuario`, `ClasificacionDormido`, `clasificarDormido`).**
Umbral días-dormido configurable por usuario vía localStorage. Clasificación histórica de frecuencia de compra.

### Regla operativa

Si una función o constante no está en `insightStandard.ts`, no es un estándar. Si una regla de negocio está hardcodeada en `insight-engine.ts`, es un bug de arquitectura y debe migrarse. Esto será auditado en Fase 5C.

## 9. Pipeline completo: de los datos al render

### Etapa 1 — Recolección de datos

El motor lee el estado global de la empresa activa. Construye un mapa `availableTables` que dice qué tablas están presentes. Los rescues y cruces que requieren tablas ausentes se deshabilitan automáticamente.

### Etapa 2 — Generación de candidatos crudos

Ambos motores (`runInsightEngine` y `buildDiagnostic`) se ejecutan. Cada candidato tiene: `metricId`, `dimensionId`, `insightTypeId`, `member`, `score`, `severity`, `title`, `description`, `detail`. En esta etapa no se filtra.

### Etapa 3 — Enriquecimiento con cruces

Cada candidato se enriquece respondiendo tres preguntas:

- **¿Qué lo causó?** Si cae un vendedor, qué clientes bajaron. Si cae un producto, qué vendedores lo manejan.
- **¿Qué se correlaciona?** Inventario, otras categorías afectadas, canal completo.
- **¿Qué amplifica?** Meta en riesgo, concentración, otros insights del grupo.

**[OBJETIVO FASE 5C]:** guardar cada cruce con su evidencia (tabla, valores, fecha) en una estructura `evidenceChain` adjunta al candidato. Estado actual: los cruces se agregan ad-hoc al texto sin estructura intermedia explícita.

### Etapa 4 — Filtrado por los 37 estándares

Se llama `filtrarConEstandar()` que aplica las reglas de `insightStandard.ts`. Candidatos que fallan estándares bloqueantes se descartan. Candidatos que fallan estándares menores siguen adelante para intento de corrección en redacción.

### Etapa 5 — Selección entre motores

**[OBJETIVO FASE 5E]:** `mergeCandidates()` dedupe por tripla, elige ganador, guarda perdedor como `backupCandidate`. Estado actual: dedup implícita por `usedEntities`.

### Etapa 6 — Verificación de contexto mínimo

Umbral: **2 cruces mínimo**. Si tiene exactamente 2 → formato `1-bullet-largo`. Si tiene 3+ → formato `2-bullets-storytelling`. Si tiene menos de 2 → descartado.

### Etapa 7 — Redacción (storytelling)

Estructura fija de cada tarjeta:

- **Headline**: emoji direccional + miembro + métrica.
- **Summary**: dato duro en una frase.
- **Bullet 1**: causa principal con conector causal.
- **Bullet 2** (si 3+ cruces): impacto o amplificación con coletilla rotada.

Artefactos involucrados en `insight-engine.ts`: `introMap`, `refMap`, `refPrepMap`, `REF_GENERICA_POR_DIM`, `LEMA_MAP`, plantillas por tipo, diccionario de sinónimos.

### Etapa 8 — Validación con recuperación

Validadores V1–V15 se ejecutan sobre el texto redactado.

**Estado actual:** solo V15 está rotulado en código con ID. V1–V14 existen como lógica dentro del motor pero sin IDs explícitos. Todos operan en modo veto absoluto (si detectan problema, descartan el bullet o la tarjeta).

### Pipeline real en `EstadoComercialPage.tsx` (v2.1.0 — Cuello 6 aplicado)

El pipeline completo tal como se ejecuta actualmente (3 useMemos encadenados):

```
useMemo A — deps: [sales, metas, vendorAnalysis, ...]
  1. runInsightEngine({ sales, metas, vendorAnalysis, ... }) → candidates

useMemo B — deps: [candidates, sales, metas, ...]
  2. filtrarConEstandar(candidates, { diaDelMes, ... })      → filtered (V1–V14)

useMemo C — deps: [filtered, tipoMetaActivo, sales, ...]
  3. candidatesToDiagnosticBlocks(filtered, { ... })         → diagnosticBlocks
        └─ buildRichBlocksFromInsights(insights, vendorAnalysis) → legacyBlocks (motor heredado)
        └─ merge = [...legacyBlocks, ...newBlocks].slice(0, 12)

useMemo D (separado, stático)
  4. getTopProductosPorClienteAmbosRangos(sales, now)        → topProductosPorCliente

useMemo E — deps: [diagnosticBlocks, topProductosPorCliente, ...]
  5. enrichDiagnosticBlocks(diagnosticBlocks, storeSnapshot) → enrichedBlocks (R68–R113)
```

La separación en useMemos encadenados (Cuello 6) evita re-ejecutar `runInsightEngine` cuando solo cambian deps del enriquecimiento. El merge vía `legacyEntities` (dedup por nombre) ocurre dentro de `candidatesToDiagnosticBlocks`. La fusión explícita por tripla (dim, miembro, métrica) es Objetivo Frente 5E.

**[OBJETIVO FASE 5E]:** rotular los 15 validadores con IDs y convertir a estrategia escalonada de 5 pasos (corregir in-place → reescribir plantilla alternativa → degradar a 1 bullet → intentar `backupCandidate` → descartar).

### Etapa 9 — Deduplicación narrativa y render

Un miembro protagoniza máximo una tarjeta. En otras aparece como referencia indirecta. Orden final por impacto en venta descendente.

## 10. Cálculo de impacto en venta por tipo de insight

P5 dice que el orden final es por impacto en venta. Acá se define cómo se calcula el impacto para cada tipo. Esto es referencia para Fase 5F.

- **change**: `|valor_comparable_YoY - valor_actual|` en la unidad activa (USD o unidades), donde `valor_comparable_YoY` es el mismo período del año anterior (MTD o YTD según aplique). Si el cambio es en precio unitario, el impacto es `delta_precio × volumen_actual`. Prohibido usar valor del mes anterior como `previous`.
- **trend**: `slope × meses_proyectados_hacia_adelante` (magnitud del cambio si la tendencia continúa un período más).
- **contribution**: `|memberChange|` — cuánto aporta el miembro al movimiento del grupo.
- **meta_gap**: `(meta_total − proyeccion_cierre)` en la unidad activa (USD faltantes).
- **dominance**: `valor_del_miembro × factor_riesgo_concentracion` (cuánto está en juego si ese miembro falla).
- **concentration**: similar a dominance pero agregado sobre el top N concentrador.

**[OBJETIVO FASE 5F]:** implementar función `calcularImpactoVenta(candidato)` en `insightStandard.ts` que devuelve un número uniforme para todos los tipos. El orden final se genera con ese número descendente.

## 11. Pareto — definición operativa

**Función canónica:** `calcularPareto()` en `insightStandard.ts`.

**Ventana temporal:** últimos 3 meses completos (no MTD) para tener base estable.

**Dimensiones a las que aplica:** cliente, producto, vendedor, categoría.

**Regla:** un miembro es "Pareto" si está entre los que acumulan el 80% de la venta ordenados de mayor a menor. La función auxiliar `esEntidadPareto(miembro, dim)` responde sí/no.

**Fallback con datos insuficientes:** si la empresa tiene menos de 3 meses de historia, se usa la ventana disponible. Si tiene menos de 30 días, el Pareto no se calcula y se toman todos los miembros activos como relevantes (evita alertas vacías en empresas nuevas).

**Uso en el pipeline:** etapa 3 (enriquecimiento) usa Pareto para saber qué clientes/productos son relevantes mencionar como causa. Etapa 4 lo usa como filtro de volumen mínimo relativo.

## 12. Qué puede hacer el motor

- Detectar cambios MTD vs MTD comparable con magnitud relevante.
- Detectar tendencias sostenidas de 3 meses.
- Identificar contribuciones al movimiento de un grupo.
- Proyectar cumplimiento de metas al cierre.
- Detectar concentración peligrosa y dominancia.
- Cruzar automáticamente las 9 tablas disponibles.
- Distinguir correlación de causalidad con evidencia de cartera histórica.
- Adaptarse al tamaño de empresa por Pareto sin configuración manual.
- Generar español natural sin jerga técnica.
- Evitar repetir miembros, frases y estructuras entre tarjetas.

## 13. Qué NO puede hacer el motor

**No compara contra el mes anterior bajo ninguna forma.** Por qué: no controla por estacionalidad. Un cambio contra el mes anterior puede ser ruido estacional (fin de temporada, promoción no repetida, diferencia de calendario) y no señal real del negocio. Las únicas comparaciones válidas son YoY mensual (MTD vs mismo MTD año anterior) y YoY anual (YTD vs mismo YTD año anterior). La evolución mes-a-mes solo se usa como tendencia sobre varios meses.

**No incluye dormidos en alertas.** Ni primarios ni como contexto. Viven solo en pantalla de Clientes con ventana dinámica (P6).

**No inventa cruces.** Si menciona que X cae por Y, Y tiene que haber bajado medible en las tablas.

**No muestra datos crudos sin contexto.** Ningún insight llega diciendo solo "Cliente X bajó 30%".

**No usa jerga técnica.** Nada de p-valor, σ, slope, outlier, cuartil, desviación estándar. Lista formal en `TERMINOS_PROHIBIDOS_EN_OUTPUT`.

**No permite configuración estética por el usuario.** Tono, largo, orden, cantidad — todo se deduce (P2).

**No correlaciona sin evidencia.** Rescue C solo inyecta productos de cartera histórica validada en las ventas del cliente de los últimos 3 meses.

**No repite entidades como protagonistas.** Un miembro protagoniza una sola tarjeta. En las demás aparece como referencia indirecta.

**No reproduce frases textuales entre tarjetas.** Coletillas rotadas, verbos distintos.

**No descarta por veto absoluto.** [Objetivo Fase 5E — estado actual es veto absoluto en V13–V15, por corregir.]

## 14. Tipos de cruce que el motor realiza

Los cruces posibles están catalogados en `CRUCES_DISPONIBLES` de `insightStandard.ts`. Cada cruce requiere ciertas tablas. Si las tablas faltan, el cruce no se genera.

- **Vendedor → clientes**: qué clientes de la cartera bajaron. Requiere `sales`, `vendorAnalysis`.
- **Vendedor → productos**: qué productos del catálogo cayeron. Requiere `sales`, `productoSummaries`.
- **Vendedor → metas**: gap de cumplimiento. Requiere `metas`, `vendorAnalysis`.
- **Producto → clientes**: clientes que dejaron de comprar. Requiere `sales`, `clienteSummaries`.
- **Producto → inventario**: quiebre o exceso. Requiere `inventory`.
- **Producto → vendedores**: responsables. Requiere `sales`, `vendorAnalysis`.
- **Cliente → cartera histórica**: productos del cliente últimos 3 meses. Requiere `sales` con ventana 3M.
- **Cliente → vendedor asignado**: responsable + cumplimiento. Requiere `sales`, `vendorAnalysis`.
- **Categoría → productos**: productos que arrastran. Requiere `sales`, `categoriaAnalysis`.
- **Categoría → vendedores**: fuerza de ventas en la categoría. Requiere `sales`, `vendorAnalysis`.
- **Departamento → clientes**: clientes de la zona que bajaron. Requiere `sales`, `clienteSummaries`.
- **Departamento → vendedores**: cobertura. Requiere `sales`, `vendorAnalysis`.
- **Supervisor → equipo**: miembros cayendo. Requiere `supervisorAnalysis`, `vendorAnalysis`.
- **Métrica → concentración**: % concentrado. Requiere tabla base + `concentracionRiesgo`.

Al agregar tablas nuevas, los cruces que las involucran se activan automáticamente si el rescue correspondiente está implementado.

## 15. Rescues disponibles

Los rescues enriquecen candidatos que no alcanzan el umbral mínimo con cruces primarios.

### Estado actual y objetivo

La implementación actual tiene rótulos explícitos para Rescue B y Rescue C en código. Rescue A (metas) y Rescue D (delta temporal) existen como lógica bajo otros nombres dentro del motor pero no están formalizados con interfaz estándar. **[OBJETIVO FASE 5H]:** formalizar los 4 rescues con patrón uniforme `{ id, isAvailable(tables), enrich(candidate), priority }` para que agregar rescues nuevos no toque el core del motor.

### Rescues definidos

**Rescue A — Metas.** Conecta caídas de vendedor o supervisor con el gap de cumplimiento al cierre proyectado. Disponible cuando existe `metas` y el candidato es `vendedor` o `supervisor`.

**Rescue B — Dormidos. ELIMINADO.** Existió en fases previas pero queda eliminado según P6. **[OBJETIVO FASE 5B]:** remover toda referencia a Rescue B en `insight-engine.ts`. Los dormidos no son consultados por el motor de alertas bajo ningún motivo.

**Rescue C — Inventario con cartera histórica.** Busca productos con stock relevante que aparecen en la cartera histórica del cliente o categoría del candidato. Solo inyecta productos con evidencia de transacciones en los últimos 3 meses. Requiere `inventory` y cartera verificable en `sales`.

**Rescue D — Delta temporal.** Conecta el cambio actual con la trayectoria de los últimos períodos. Requiere al menos 3 meses de datos comparables. Si hay solo 2 meses, degrada a mención sin proyección. Si hay menos de 2, no se activa.

## 16. Validadores (V1 a V16)

Los validadores revisan la redacción final y detectan bugs específicos de texto.

### Estado actual (v2.1.0)

V1–V14 **ahora rotulados en código** dentro de `filtrarConEstandar` (insight-engine.ts). V15 y V16 ya estaban rotulados. V1–V13 operan en modo veto absoluto o degradación de severidad; V14 es un enriquecedor (leading indicator); V16 aplica estrategia escalonada.

### Catálogo operacional V1–V14 (en `filtrarConEstandar`, insight-engine.ts)

Estos validadores operan sobre candidatos estadísticos antes de la redacción:

| ID | Nombre | Función insightStandard | Modo | Línea aprox. |
|----|--------|------------------------|------|-------------|
| V1 | filtro-ruido | `pasaFiltroRuido` | veto (filter) | L2606 |
| V2 | proporcionalidad | `validarProporcionalidad` | degradación severity | L2631 |
| V3 | variante-promocional | `esVariantePromocional` | degradación severity | L2645 |
| V4 | comparación-temporal | `validarComparacionTemporal` | degradación severity | L2655 |
| V5 | inventario | `evaluarIntegracionInventario` | enriquecimiento | L2668 |
| V6 | metas | `evaluarIntegracionMetas` | enriquecimiento | L2690 |
| V7 | dormido-contexto | `evaluarDormidoConContexto` | degradación severity | L2714 |
| V8 | churn | `esChurnSignificativo` | degradación severity | L2760 |
| V9 | penetración | `evaluarPenetracion` | NO IMPLEMENTADO — TODO | L2782 |
| V10 | pareto | `esEntidadPareto` | elevación severity | L2785 |
| V11 | cruces-tipo-estándar | `CRUCES_DISPONIBLES` | veto (filter) | L2796 |
| V12 | co-declive | `detectarCoDeclive` | enriquecimiento | L2826 |
| V13 | cascadas | `detectarCascadas` | enriquecimiento | L2858 |
| V14 | indicador-anticipado | `evaluarIndicadorAnticipado` | elevación severity | L2875 |

### Catálogo de redacción V15–V16 (en redacción/render, insight-engine.ts)

V15 y V16 operan sobre el texto redactado final:
- **V15** — Compara lemas verbales entre bullet 1 y bullet 2 (usa `LEMA_MAP`), evita repetición. Veto absoluto si lema idéntico.
- **V16** — Detecta referencias temporales prohibidas ("mes anterior", "mes pasado", "período anterior", "respecto al mes", "mes previo"). Estrategia escalonada: reparación in-place reemplazando por "mismo período del año anterior"; si el patrón persiste, descartar. Candado anti-regresión de la regla 48 (Fase 5A).

### Objetivo

**[OBJETIVO FASE 5E]:** convertir veto absoluto de V1–V13 a estrategia escalonada: corregir in-place → reescribir plantilla alternativa → degradar a 1 bullet → intentar `backupCandidate` → descartar. V9 necesita implementación completa.

## 17. Convenciones visuales

### Emojis direccionales en headlines

- **↓** — métrica en caída.
- **↑** — métrica en alza.
- **📈** — tendencia creciente sostenida.
- **📉** — tendencia decreciente sostenida.
- **⚠️** — alerta crítica (meta_gap severo, concentración peligrosa).
- **🎯** — meta o cumplimiento.

### Coletillas rotantes para bullet 2

Generadas por `insight-engine.ts`. En Z.3, `sanitizeR80()` fue eliminada — los builders ricos de `insight-engine.ts` y `NarrativeBuilder` **nunca emiten** estas coletillas (exclusión por construcción). El catálogo sigue vigente como invariante de diseño (R80), pero no existe función que las enforcement post-render.

Coletillas eliminadas por R80 (catálogo ampliado v1.9.2):
- "Lo que más duele: ..." · "Lo que más afecta: ..." · "Lo que más pesa: ..."
- "Lo que más preocupa: ..." · "Lo que más golpea: ..." · "Lo que duele más: ..."
- "Lo que hay que mirar: ..." · "Lo que vale resaltar: ..." · "Lo que vale mencionar: ..."
- "Cabe destacar: ..." · "Cabe resaltar: ..." · "Es importante notar: ..."
- "Vale la pena mencionar: ..." · "Se observa que ..." · "Los datos sugieren ..."
- "Es preciso señalar: ..." · "Hay que tener en cuenta: ..." · "Cabe mencionar: ..."

Conectores rotantes neutros (deterministas, ≥3 variantes):
"Además, " · "En paralelo, " · "También, " · "Suma a esto que " · "Y "

### Refs genéricas por dimensión

Definidas en `REF_GENERICA_POR_DIM` de `insight-engine.ts`.

- producto → "ese producto"
- departamento / zona → "ese territorio"
- categoría → "esa categoría"
- cliente → "ese cliente"
- vendedor → "ese vendedor"
- supervisor → "ese supervisor"
- fallback → "ese grupo"

## 18. Dormidos — umbral configurable

Los clientes clasificados como dormidos vuelven al pipeline como candidatos de pleno derecho (Fase 5B). No hay tratamiento especial: compiten con cualquier otro insight por ranking de impacto en venta y pasan por los mismos validadores V1–V16.

### Configuración del umbral

- **Default:** 45 días sin comprar.
- **Rango válido:** 15 a 180 días (fuera de rango se descarta y se aplica default).
- **Fuente canónica:** `DIAS_DORMIDO_DEFAULT`, `DIAS_DORMIDO_MIN`, `DIAS_DORMIDO_MAX` en `insightStandard.ts`.
- **Persistencia:** `localStorage` con clave `salesflow.dias_dormido` (constante `LOCAL_STORAGE_KEY_DIAS_DORMIDO`).
- **Lectura runtime:** `getDiasDormidoUsuario()` retorna `{ valor, esDefault }`. El motor consulta este valor en `filtrarConEstandar` cada vez que corre.
- **UI:** input numérico en la página Clientes con label "Considerar dormido después de [__] días sin comprar", feedback live de clientes clasificados con el umbral actual, botón "Restablecer (45 días)" visible solo cuando hay override.

### Integración con el motor de insights

- No hay rutas separadas, ni cuotas reservadas, ni categorías de alerta dedicadas.
- Cada candidato cliente cuyo `dias_sin_actividad ≥ umbral` se enriquece con:
  - `detail.umbralDiasDormido`
  - `detail.esUmbralDefault`
  - `detail.diasSinComprar`
  - `detail.impactoVentaHistorica`
- Cada bullet que clasifique un cliente como dormido menciona los días sin comprar explícitamente (R50).
- Si hay ≥1 alerta con `dormidoMeta` renderizada en Estado Comercial, aparece un cintillo informativo arriba del grupo con el umbral actual y link a `/clientes#dias-dormido-input`.

### Navegación cross-page

El link del cintillo navega a `/clientes#dias-dormido-input`. `ClientesPage` detecta el hash en mount y hace scroll + focus automático al input.

## 19. Política de errores y fallbacks

### Si el motor nuevo falla

Si `runInsightEngine()` tira excepción, se captura y se registra en consola con prefijo `[engine-error]`. La página no se rompe — se muestran solo las tarjetas generadas por `buildDiagnostic()` (motor viejo) si hubo output válido.

### Si el motor heredado falla

Si `buildRichBlocksFromInsights()` tira excepción dentro de `candidatesToDiagnosticBlocks`, se captura y se retornan solo los bloques del motor estadístico.

### Si ambos fallan

Se muestra un mensaje genérico "No se pudieron generar insights en este momento" y se registra error para diagnóstico.

### Si no hay suficientes datos

Si la empresa tiene menos de 7 días de ventas, no se generan alertas de change/trend. Solo se muestran meta_gap si hay metas cargadas.

## 20. Reglas anti-regresión (R1–R117)

Las reglas acumuladas del desarrollo viven en este manifiesto como fuente única. No están duplicadas en código como comentarios numerados (eso sería redundancia y fuente de desincronización).

**Resumen de reglas (v2.2.0):**

| Categoría | Rango | Total |
|---|---|---|
| Fundamentos + Fases 4B–4I | R1–R60 | 60 |
| Fases 5H/5H.1 (badges, léxico) | R61–R67 | 7 |
| Fase 5I + 5I.1–5I.7 (UX tarjetas) | R68–R101 | 34 |
| Fase Z.1 (fuente única) | R102–R103 | 2 |
| Fase Z.2 (motor único, R104–R110) | R104–R110 | 7 |
| Fase Z.3 (NarrativeBuilder) | R111–R113 | 3 |
| Fase Z.4 (performance) | R114–R117 | 4 |
| **Total emitidas** | R1–R117 | **117** |
| Obsoletas (R43, R73) | — | 2 |
| **Vigentes activas** | — | ~99 |
| Vigentes SOLO-ALERTA (console.warn DEV) | R99, R100, R101 | 3 |
| Vigentes NO IMPLEMENTADAS | V9/R_penetracion, backupCandidate | ~3 |

Cada regla nació para cerrar un bug específico. Pueden extenderse, no pueden removerse sin reabrir el bug que cerraron.

### Bloque 1–6 — Fundamentos universales

1. Sin branches por dimensión en redacción: una sola función genera texto para todos los dims.
2. Mínimo 2 cruces por candidato para entrar al render.
3. Conectores causales flexibles permitidos (causales y correlacionales).
4. `usedEntities` persiste entre tarjetas para evitar repetir protagonistas.
5. Prohibida jerga técnica visible (`TERMINOS_PROHIBIDOS_EN_OUTPUT`).
6. Storytelling obligatorio: qué + por qué + dónde duele.

### Bloque 7–13 — Fase 4B (direccionalidad y umbrales)

7. Outlier como tipo primario eliminado (solo sirve como dato secundario en otros insights).
8. Dirección explícita por tipo (change up / change down / trend up / trend down).
9. `usedEntities` pre-populada antes de generar cualquier tarjeta.
10. Formato 2 bullets con storytelling cruzado cuando hay 3+ cruces.
11. Conectores causales flexibles.
12. Umbral de 3 tablas distintas cruzadas para severidad alta (por revisar en Fase 5E — propuesta uniformar a 2).
13. Validación de cruces con evidencia real.

### Bloque 14–17 — Fase 4C (marcado y rescues)

14. Marcado de tablas con literales explícitos, no solo dimensión.
15. Declaración de todas las tablas usadas al construir el candidato.
16. Rescues obligatorios cuando el candidato no llega a umbral.
17. Umbral condicional por severidad (CRÍTICA/ALTA: 3 tablas; MEDIA/BAJA: 2 tablas). [Por uniformar en Fase 5D.]

### Bloque 18–23 — Fase 4D (coherencia y protagonismo)

18. Todas las cards tienen que estar enriquecidas (no cards crudas).
19. Rescue metas coherente con el vendedor real del cliente.
20. Protagonista explícito en bullet 1.
21. Plantillas rotantes para evitar repetición textual.
22. `usedEntities` mencionadas coherentemente con su rol.
23. Contador de urgentes coherente entre tarjetas.

### Bloque 24–27 — Fase 4E (cards peladas y bullet 2)

24. No se permiten cards peladas (sin bullet de contexto).
25. Bullet 2 con referencia indirecta al protagonista de bullet 1.
26. Verbo y conector diferentes entre bullet 1 y bullet 2.
27. Sin cláusulas redundantes entre bullets.

### Bloque 28–32 — Fase 4F (blindaje universal)

28. Sin modo compacto (siempre expandido).
29. `depersonalizarBullet2` itera sobre todas las entidades, no solo la primera.
30. Plantillas con test de no-redundancia léxica.
31. 10 validadores universales aplicados a todos los tipos.
32. `usedEntities` se actualiza después de que el candidato pasa validadores.

### Bloque 33–37 — Fase 4G (expansión y gramática)

33. Expansión universal (todas las tarjetas deben poder expandirse).
34. Absorción de sujeto + verbo + conector para evitar redundancia gramatical.
35. Absorción de preposición duplicada.
36. V12 detecta doble preposición ("en del cliente").
37. `claim()` aplicado en todos los rescues para marcar entidades usadas.

### Bloque 38–44 — Fase 4H (concordancia y variedad)

38. Concordancia singular/plural entre determinante y sustantivo (V13).
39. `introMap` sin duplicados léxicos con las plantillas (eliminar "vale resaltar" en introMap cuando el template ya lo trae).
40. Sujetos compuestos llevan verbo plural (V14).
41. Rescue C solo inyecta productos con evidencia de cartera del cliente.
42. Verbos distintos en bullet 1 y bullet 2 (V15, por lema — Fase 4I).
43. Variar coletillas del rescue B entre tarjetas. **Obsoleta** en Fase 5B (rescue B eliminado).
44. Mayúscula automática tras ":" en bullet 2.

### Bloque 45–47 — Fase 4I (lemas y refs)

45. Rescue C con `dim === 'cliente'` valida cartera histórica (últimos 3 meses, ≥1 transacción).
46. V15 compara lemas verbales con `LEMA_MAP`, no formas conjugadas.
47. Ref genérica por dim con `REF_GENERICA_POR_DIM`. Prohibido hardcodear "ese segmento" u otros.

### Bloque 48 — Fase 5 (estacionalidad y YoY)

48. Toda comparación de crecimiento es YoY (año contra año). Prohibido comparar contra mes anterior bajo cualquier forma (completo, MTD, cerrado, abierto). La única excepción es tendencia móvil sobre 3+ meses, que no compara dos puntos sino una trayectoria. [Fase 5A]

49. V16 bloquea referencias temporales prohibidas en texto visible: "mes anterior", "mes pasado", "período anterior", "respecto al mes", "mes previo". Este validador es el candado anti-regresión de la regla 48. Cualquier bullet con estos patrones se intenta reparar in-place reemplazando por "mismo período del año anterior"; si la reparación falla (patrón residual detectado), se descarta el bullet. Las plantillas deben usar "en el mismo período del año anterior" o lenguaje de tendencia móvil. [Fase 5A]

### Bloque 50 — Fase 5B (dormidos configurables)

50. Toda alerta que clasifique un cliente como dormido debe (a) incluir los días sin comprar en el bullet o contexto y (b) hacer referencia explícita al umbral actual, sea directamente en el texto o vía el cintillo del grupo en Estado Comercial. Los candidatos elegibles se enriquecen con `detail.umbralDiasDormido`, `detail.esUmbralDefault`, `detail.diasSinComprar` y `detail.impactoVentaHistorica`. [Fase 5B]

### Bloque 51–54 — Fase 5C (integridad numérica)

51. Campos **valor-entidad** y **valor-agregado** deben estar separados y etiquetados. Nunca reutilizar el total del grupo como si fuera el valor de la entidad destacada. En insights de atribución (`contribution`), el texto muestra primero los números de la entidad (`memberValue` / `memberPrevValue`) y después los del grupo como contexto explícitamente rotulado "del grupo". [Fase 5C]

52. Insights de atribución (`contribution`, `mayor_aporte`) solo emiten miembros cuyo `memberChange` tiene el **mismo signo** que `totalChange`. Un miembro que crece cuando el agregado cae no "aporta al descenso" — resiste. Si ningún miembro se alinea con la dirección del grupo, el insight no se emite. Guard implementado en `insight-registry.ts` dentro de `contribution.detect`. [Fase 5C]

53. El histórico de clientes dormidos usa ventana YoY (mismo mes del año anterior, `prevSalesFull` del motor), **no** suma total del cliente. El texto visible nombra la ventana explícitamente ("Aportaba $X en abril 2025"); prohibido "en histórico" ambiguo. `detail.impactoVentaHistorica` y `detail.impactoVentanaLabel` documentan valor y ventana. [Fase 5C]

54. Los textos de tendencia describen **literalmente** la fórmula que se calcula. `pctChange` de trend es el cambio porcentual del primer al último mes de la historia (`(last - first) / first`); los valores extremos (`historyStart` → `historyEnd`) aparecen dentro del paréntesis del texto para que el lector pueda verificar el cálculo. Prohibido texto que sugiera una interpretación distinta de la fórmula usada. [Fase 5C]

### Bloque 55–57 — Fase 5D (convenciones de nomenclatura y coherencia unidad↔unidad)

55. **Todo campo numérico que represente magnitud debe declarar su unidad en el nombre.** Sufijos válidos: `_usd` (dinero), `_uds` (unidades vendidas), `_txns` (transacciones), `_pct` (porcentaje), `_dias` (días). Sufijos genéricos como `_neto`, `_bruto`, `_total` solo se admiten en combinación con una unidad (`_neto_usd` está bien, `_neto` solo no). Aplica a `VendorAnalysis`, `TeamStats`, `SupervisorAnalysis` y a toda estructura derivada que se pase a render o al LLM. Los nombres heredados sin unidad (`ytd_actual`, `ytd_anterior`, `variacion_ytd_pct`, `ytd_actual_neto`, `ytd_anterior_neto`, `ytd_actual_equipo`, `ytd_anterior_equipo`, `variacion_ytd_equipo`) quedan prohibidos y fueron sustituidos por sus variantes con sufijo. [Fase 5D]

56. **Coherencia matemática entre columnas adyacentes en cualquier visualización.** Cuando una tabla o tarjeta muestra dos columnas de magnitudes en la misma unidad (p. ej. `$ actual` y `$ anterior`), la columna de variación (`VAR %`, `VAR abs`) debe calcularse sobre la misma serie visible — prohibido derivar la variación de una serie distinta (p. ej. mostrar `$ actual`/`$ anterior` pero calcular `VAR %` sobre unidades). Si dos unidades son relevantes, se presentan como columnas separadas con etiqueta explícita (`VAR $ %`, `VAR uds %`) nunca colapsadas en una sola. El bug cerrado: el dashboard de vendedores mostraba VAR% calculado sobre unidades al lado de columnas en dólares, produciendo discrepancias visibles de hasta 5 pp. [Fase 5D]

57. **Prompts del módulo IA reciben campos con unidad declarada en el nombre o con etiqueta adyacente en el texto del prompt.** Prohibido pasar al LLM un campo ambiguo (`ytd_actual`, `meta`). El `systemPrompt` debe incluir una cláusula explícita que instruya:
    - Campos con sufijo `_usd` son dinero en la moneda configurada y deben narrarse con el prefijo de moneda (`USD 11,916`).
    - Campos con sufijo `_uds` son unidades y deben narrarse con el sufijo `uds` (`8,976 uds`).
    - **Nunca prefijar unidades con `$`. Nunca presentar dinero sin símbolo de moneda.**
    El bug cerrado: el panel "Análisis IA" de vendedores narraba "Acumulado YTD de $8,976" cuando 8,976 eran unidades, porque el prompt exponía `ytd_actual` sin etiqueta y el LLM asumió que era dinero. [Fase 5D]

### Bloque 58–60 — Fase 5F (integridad de ventana temporal en clientes)

58. **El campo "valor en riesgo" de un cliente dormido se calcula sobre la ventana YoY correspondiente al período activo, no sobre el total histórico.** `valor_yoy_usd` = suma de `venta_neta` (o `unidades` si no hay venta neta) del cliente en `selectedPeriod.month` del año `selectedPeriod.year - 1`. El campo renombrado de `valor_historico` a `valor_yoy_usd` refleja esta semántica; renombrado paralelo de `compras_historicas` a `transacciones_yoy`. El bug cerrado: `valor_historico` acumulaba los 27 meses del dataset completo (~$65.7k) inflando el banner "en riesgo", el chip, y la copia de recuperación. [Fase 5F]

59. **El peso (`peso`, `cumulativePct`) de un cliente en la vista Top Clientes se calcula sobre el universo total del negocio, no sobre el subconjunto visible.** `peso = cur / totalAll` donde `totalAll` es la suma de todos los `clienteSummaries`, no solo el top-20. El bug cerrado: la fórmula anterior normalizaba sobre el top-20, haciendo que el último cliente de la lista siempre sumara el 100% acumulado, y que el chip "X% top cliente" mostrara el porcentaje relativo al subconjunto en lugar del peso real. La nota de cobertura al pie de la tabla indica cuántos clientes concentran qué porcentaje del negocio total. [Fase 5F]

60. **Las etiquetas de columnas temporales deben declarar explícitamente la ventana y el año de referencia.** La columna de valor en la pestaña Inactivos se rotula dinámicamente como `Valor {mes_corto} {año-1}` (p. ej. "Valor abr 2025" para el período activo abril 2026). El mini-KPI del drawer de análisis usa la misma etiqueta. El banner de impacto dice "venta YoY perdida (abr 2025)" en lugar de "ventas históricas". [Fase 5F]

### Convención para nuevas reglas

Cada fase futura (5A–5I) agrega sus reglas a este bloque con numeración continua. Una regla nueva se agrega acá **antes** de implementarse en código, para que el manifiesto sea siempre la fuente.

## 21. Roadmap de rediseño (Fase 5)

- **Fase 5A — Fix comparación temporal con YoY. [COMPLETADA]** Eliminada toda comparación contra mes anterior. Insights `change` migrados a comparación YoY mensual (MTD vs mismo MTD del año anterior) con recorte de día para controlar estacionalidad. Cuando no hay datos YoY, el candidato `change` no se emite; `trend` sigue operando con ventana móvil de 3 meses consecutivos como trayectoria. Validador V16 bloquea referencias temporales prohibidas. 7 plantillas textuales migradas a "mismo período del año anterior".
- **Fase 5B — Dormidos con umbral configurable. [COMPLETADA]** Decisión revisada: los dormidos vuelven al pipeline como candidatos de pleno derecho (compiten en ranking por impacto y pasan por V1–V16). Infraestructura agregada en `insightStandard.ts`: `DIAS_DORMIDO_DEFAULT=45`, `DIAS_DORMIDO_MIN=15`, `DIAS_DORMIDO_MAX=180`, `LOCAL_STORAGE_KEY_DIAS_DORMIDO`, `getDiasDormidoUsuario()`, `clasificarDormido()`. Candidatos cliente enriquecidos con `detail.umbralDiasDormido`/`esUmbralDefault`/`diasSinComprar`/`impactoVentaHistorica`. `DiagnosticBlock` extendido con `dormidoMeta`. Input numérico en `ClientesPage` con persistencia en localStorage, hash-scroll `#dias-dormido-input` para navegación cross-page. Cintillo informativo en `EstadoComercialPage` antes de bloques con umbral actual + link. Tile KPI "Venta acumulada" migrado a YoY (MTD actual vs mismo mes año anterior). Regla 50 agregada, P6 reformulado.
- **Fase 5B.1 — Emisión efectiva de candidatos dormidos. [COMPLETADA]** `runInsightEngine` ahora recorre `clientesDormidos` del store y emite candidatos con `insightTypeId: 'cliente_dormido'` cuando `dias_sin_actividad >= umbral`. Score derivado en [0,1]: base por severity (0.7 si dias ≥ 2×umbral, 0.5 sino) + bonus hasta 0.25 por impacto normalizado. `candidatesToDiagnosticBlocks` incluye render path dedicado que construye bullets desde `detail` (menciona días, frecuencia histórica e impacto) sin pasar por `buildContextUniversal`, y filtra por V16 (ref temporal prohibida). Shape de `DiagnosticBlock.dormidoMeta` fijado a `{umbralDiasDormido, esUmbralDefault, cantidadClientesDormidos}`. Cintillo en Estado Comercial actualizado a los nuevos nombres y usa `cantidadClientesDormidos` para el conteo. Logs `[fase5b]` emitidos por cada candidato dormido con cliente, días, y tipo de umbral.
- **Fase 5B.2 — Exención de candidatos no_temporal. [COMPLETADA]** `filtrarConEstandar` descartaba silenciosamente todos los candidatos `cliente_dormido` (comparison: `'no_temporal'`) porque `pasaFiltroRuido` mide tráfico en el período actual y los dormidos codifican la ausencia de tráfico. Idéntica causa en los validadores temporales posteriores. Fix quirúrgico: exención de candidatos con `detail.comparison === 'no_temporal'` del `pasaFiltroRuido`; guards `if (... === 'no_temporal') continue` en los cinco bucles temporales (B7 `validarProporcionalidad`, B9 `validarComparacionTemporal`, C10 `evaluarIntegracionInventario`, C11 `evaluarIntegracionMetas`, G31 `validarCoherenciaTemporal`). Log `[fase5b.2]` por cada candidato exento + resumen final del pipeline (`{ candidatosEntrada, candidatosSalida, dormidosSalida }`). **Principio reforzado:** el guard es por **capacidad del candidato** (`comparison: 'no_temporal'`), no por `insightTypeId` — extensible a futuros insights sin dimensión temporal sin hardcodes. Cero cambios en `pasaFiltroRuido` ni en `diagnostic-engine.ts`.
- **Fase 5B.3 — Cierre del cerco de filtros para no_temporal. [COMPLETADA]** Auditoría runtime de 5B.2 reveló que el guard solo cubría el filtro de ruido B6: los dormidos seguían muriendo en filtros posicionales posteriores (`result = result.filter(...)` reasignaciones, no bucles de validadores). El culpable principal confirmado: **C16 CRUCES_DISPONIBLES + isStandardType** — la whitelist `['trend', 'change', 'dominance', 'contribution', 'meta_gap', 'proportion_shift', 'correlation']` no incluye `cliente_dormido` y el filtro lo descartaba silenciosamente. Fix: guard inicial `if (comparison === 'no_temporal') return true` en los **4 filtros posicionales restantes** dentro de `filtrarConEstandar` — (1) C16 cruces+tipo estándar, (2) E20 resolverContradiccion, (3) E21 detectarRedundancia, (4) G28 esConclusionValida. Además, E22 `validarBalance` (reasignación escondida en el cap_negativos) reestructurada para partitionar `noTemporales` aparte y garantizar que nunca sean podados. Log renombrado a `[fase5b.3]` con alerta `console.warn` si entran dormidos y ninguno sobrevive. **Segunda pasada del principio:** cualquier filtro posicional que opere sobre comparaciones/cruces/conclusión/balance temporal debe exentar `comparison: 'no_temporal'` — capacidad es el criterio único. Cero modificaciones en `insightStandard.ts` (`pasaFiltroRuido`, `resolverContradiccion`, `detectarRedundancia`, `esConclusionValida`, `CRUCES_DISPONIBLES` intactos). Cero hardcodes por `insightTypeId`.

- **Fase 5B.4 — Uniformización visual de dormidos. [COMPLETADA]** Las cards `cliente_dormido` se renderizaban visualmente distintas al resto (sin flecha direccional, con KPI lateral "Impacto histórico", con cintillo de grupo arriba). Fix quirúrgico en `insight-engine.ts`: (1) título con `↓` prefijado (unifica encabezado con otros insights de caída); (2) `impactoTotal`/`impactoLabel` del block puestos en `null` — el monto histórico se narró dentro de `description` como parte del párrafo (sin KPI lateral); (3) `dormidoMeta` eliminado del block en ambos render paths (dedicado y estándar), el loop final que completaba `cantidadClientesDormidos` retirado como código muerto; (4) JSX del cintillo retirado de `EstadoComercialPage.tsx`; (5) campo opcional `dormidoMeta` retirado de `DiagnosticBlock` en `diagnostic-engine.ts`. **Principio reforzado:** los insights `no_temporal` siguen siendo un concepto del pipeline (exención de validadores temporales, Fase 5B.2/5B.3) pero a nivel de presentación visual son indistinguibles del resto — la uniformidad visual es separable de la capacidad interna. `comparison: 'no_temporal'` y todos los guards de filtros intactos. Umbral sigue configurable desde `/clientes` y mencionado en la narrativa de cada card dormida.
- **Fase 5C — Barrido de integridad numérica. [COMPLETADA]** Auditoría runtime reveló cuatro fallos estructurales que confundían totales-de-grupo con valores-de-entidad y emitían atribuciones matemáticamente imposibles. **(FALLO #1, R51)** `buildText` de `contribution` ahora muestra primero los números de la entidad (`memberValue` → `memberValue`, `memberPctChange`), y después los del grupo como contexto etiquetado "del grupo". La entidad y el agregado quedan separados y nunca reutilizan el total como si fuera individual. **(FALLO #2, R52)** `contribution.detect` (en `insight-registry.ts`) filtra miembros counter-trend: solo consideran candidatos cuyo `memberChange` tiene el mismo signo que `totalChange`. Si ningún miembro se alinea con la dirección del grupo, el insight no se emite — un miembro que crece mientras el grupo cae NO "aporta al descenso". **(FALLO #3, R53)** El impacto histórico de `cliente_dormido` dejó de ser `valor_historico` (all-time del cliente) para pasar a ser la suma de su venta en el mismo mes del año anterior (`prevSalesFull` ya disponible en el motor). `detail.impactoVentaHistorica` y el nuevo `detail.impactoVentanaLabel` documentan valor + etiqueta ("abril 2025"). El texto visible ahora dice "Aportaba $X en abril 2025" — cero "en histórico" ambiguo. **(FALLO #4, R54)** La fórmula `pctChange` de `trend` se sobrescribe post-detect con el cambio % literal primer→último mes (`(last - first) / first`); el texto del `buildText` incluye los extremos (`historyStart` → `historyEnd`) dentro del paréntesis, haciendo el cálculo verificable. La fórmula anterior (`slope · (N-1) / mean`) producía números discrepantes con la lectura natural del bullet. Cambios en `insight-engine.ts` (3 puntos) y `insight-registry.ts` (1 punto, detect de contribution — insightStandard.ts intacto).

### Gaps conocidos para Fase 5C

- En demo Los Pinos, `frecuenciaHistoricaDias: 1` aparece en al menos un cliente dormido (p. ej. Supermercado López). El cálculo de frecuencia histórica merece revisión en Fase 5C — no corregir en esta fase.
- El pre-cómputo upstream de `clientesDormidos` en `analysis.ts` sigue usando `config.dias_dormido_threshold` del store (default 30), independiente del `LOCAL_STORAGE_KEY_DIAS_DORMIDO`. Si el usuario baja el input local a 15, los clientes con 15–29 días no están en el store. Resolver propagando el umbral del usuario al pipeline de análisis.
- **Fase 5C — 37 estándares como fuente única.** Auditar que todo umbral viva en `insightStandard.ts`. Migrar cualquier hardcode de `insight-engine.ts`. Implementar estructura `evidenceChain` como propiedad del candidato.
- **Fase 5D — Coherencia semántica unidades vs dinero. [COMPLETADA]** Auditoría runtime detectó que `VendorAnalysis` almacenaba unidades bajo el nombre `ytd_actual` y dinero bajo `ytd_actual_neto`, con una sola `variacion_ytd_pct` calculada sobre unidades. La tabla de Vendedores pintaba columnas `$2026/$2025` con la `VAR%` de otra serie (gaps visibles de hasta 5 pp entre Roberto Cruz +15.1% mostrado vs +20.1% real en dinero). El panel "Análisis IA" narraba unidades con prefijo `$`. **Renombrado estructural** en `src/types/index.ts`: `ytd_actual` → `ytd_actual_uds`, `ytd_anterior` → `ytd_anterior_uds`, `variacion_ytd_pct` → `variacion_ytd_uds_pct`; `ytd_actual_neto` → `ytd_actual_usd`, `ytd_anterior_neto` → `ytd_anterior_usd`; agregado `variacion_ytd_usd_pct`. Idéntico tratamiento en `TeamStats` (`*_equipo_uds_pct`) y `SupervisorAnalysis`. `computeYTD` y `analyzeVendor` en `analysis.ts` devuelven la terna `_uds` + `_usd` + ambas variaciones. **Rewire de consumidores**: `VendedoresPage` (tabla, sort, KPI cards "Mejor del mes"/"Necesita atención", drawer subtitle, prompt de análisis IA), `EstadoComercialPage` (agregado YTD en USD, `peorVendedor`), `RendimientoPage` (badges del drawer), `MetasPage` (prompt), `chatService` (prompt del asistente), `pulso-engine`, `insightEngine` (apertura de bloque 1), `radar-engine` (card buena_noticia, mejor_jugador), `exportUtils`. La tabla de Vendedores ahora calcula `VAR%` sobre la misma serie que `$ ant`/`$ act` (R56); el prompt del LLM incluye cláusula de convención de sufijos `_usd`/`_uds` con prohibición de cruzar símbolos (R57). 3 reglas nuevas (R55–R57), header del bloque actualizado a "(1–57)". `tsc --noEmit` 0 errores.
- **Fase 5D (legacy) — Autoconfiguración por Pareto.** Reemplazar umbrales absolutos por relativos al Pareto de la empresa. Uniformar umbral de cruces a 2. **Reasignada a Fase 5E.**
- **Fase 5E — Validadores con recuperación.** Rotular V1–V15 con IDs explícitos. Convertir veto absoluto en estrategia escalonada de 5 pasos. Implementar `mergeCandidates()` con `backupCandidate`.
- **Fase 5F — Integridad de ventana temporal en clientes. [COMPLETADA]** `valor_historico` → `valor_yoy_usd` (mismo mes año anterior). `compras_historicas` → `transacciones_yoy`. Top Clientes: peso sobre universo total. Etiquetas de columna con año explícito. R58/R59/R60. tsc 0 errores.
- **Fase 5G — Deduplicación narrativa. [GAP — No ejecutada]** La fusión narrativa entre dimensiones relacionadas no se implementó. La deduplicación actual es por `usedEntities` (nombre de entidad), no por tripla (dim, miembro, métrica). Pendiente para Frente Z.2.
- **Fase 5H — Coherencia narrativa + badges. [COMPLETADA]** Ver v1.8.0/v1.8.1 en historial.
- **Fase 5I — UX tarjetas diagnóstico. [COMPLETADA EN 8 MINI-FASES (5I–5I.7)]**
  - 5I: rediseño CollapsedView/ExpandedView, diagnostic-actions.ts, R68–R74.
  - 5I.1: displayDelta absoluto, sortKey USD-equiv, R75–R80.
  - 5I.2: fidelidad stock/dormidos, repairGrammar, R81–R85.
  - 5I.3: stock agregado, conector huérfano, spacing R88, R89–R92 gramática.
  - 5I.4: pipeline universal R93, topProductosPorCliente multi-rango, exactMatch top-3, Pass0 split ambiguo.
  - 5I.5: R97 signo-verbo, R98 normalizeSpacing, R99 validator runtime.
  - 5I.6: R100 colapso cláusulas redundantes.
  - 5I.7: R101 gate final post-grammar en enrichDiagnosticBlocks.

### Frente Z — Alineación arquitectónica

- **Z.1 — Saneado del manifiesto + extracción de cálculos a fuente única. [COMPLETADA (17 abr 2026)]**
  Creado `domain-aggregations.ts` (R102). `topProductosPorCliente` extraído de `EstadoComercialPage` a `getTopProductosPorClienteAmbosRangos`. Manifiesto actualizado a v2.0. R103 declara que páginas solo importan constantes de `insightStandard.ts` directamente. Marcadores `// TODO Z.1` agregados en useMemos pendientes de extracción.

- **Z.2 — Absorción del motor viejo en el nuevo. [COMPLETADA (17 abr 2026)]**
  Implementar `mergeCandidates()` con dedup explícita por tripla (dim, miembro, métrica). El motor nuevo debe cubrir los 7 tipos operacionales actuales del motor viejo. El motor viejo (`diagnostic-engine.ts`) pasa a legacy-only. Extraer useMemos marcados `// TODO Z.1` de EstadoComercialPage a `domain-aggregations.ts`.

- **Z.3 — Plantillas como builders tipados. [COMPLETADA (18 abr 2026)]**
  Reemplazar plantillas de texto inline en `insight-engine.ts` por builders tipados con interfaz `build(context: CandidateContext): string`. Cada builder tiene tests unitarios verificables.
- **Z.4 — Optimización de performance. [COMPLETADA (18 abr 2026)]**
  Cuello 2: `getAgregadosParaFiltro` unifica 3 pasadas sobre sales en 1 (R114). Cuello 4: `_stats` adjuntos a candidato para evitar doble cálculo de percentiles (R115). Cuello 1: poda Pareto en `dominance` (R116). Cuello 3: `buildRichBlocksFromInsights` memoizada (R117). R114–R117 documentadas en §26.
- **Z.5 — Fusión real de motores. [COMPLETADA (18 abr 2026)]**
  Adaptador `buildRichBlocksFromInsights` reparado — umbral de protagonista ≥1 con filtro impacto ≥USD500. `impactoUSD` como criterio rector del merge. R118–R120 documentadas en §27.
- **Z.6 — Render Rate Recovery. [COMPLETADA (18 abr 2026)]**
  Heterogeneity Split + Fallback Bullet (§28.1). Huérfanos, hidratación de positivos, headline fix (§28.2). Deprecación detectores no accionables (§28.3).
- **Z.7 T1 — Nuevos tipos + templates de narrativa. [COMPLETADA (18 abr 2026)]**
  Cuatro tipos nuevos (`stock_risk`, `stock_excess`, `migration`, `co_decline`) en `INSIGHT_TYPE_REGISTRY`. `NARRATIVE_TEMPLATES` para los 4 tipos nuevos más `meta_gap`. Pase inventario 3D. R132–R133 documentadas en §29.1.
- **Z.8 — Motor 2: detectores estadísticos Metric × Dimension × InsightType. [COMPLETADA (22 abr 2026)]**
  Arquitectura Power BI Quick Insights / SpotIQ implementada: cruce automático métrica × dimensión × tipo de insight. Nueve PRs verificados en runtime con datos demo (93,013 filas, 8 vendedores, 18 meses). Builders implementados: `buildChangePointBlocks` (change_point × 7 dimensiones × 5 métricas), `buildSteadyShareBlocks` (steady_share × 7 dimensiones × 2 métricas), `buildCorrelationBlocks` (2 pares de métricas × dimensiones), `buildTransactionOutlierBlocks` (outlier × 7 dimensiones × 6 métricas), `buildMetaGapTemporalBlocks` (meta_gap_temporal por vendedor con filtro ymCutoff). Registros centrales: `DIMENSION_REGISTRY` con campo `supports` por tipo, `METRIC_REGISTRY` con campo `compatibleInsights` — agregar dimensión o métrica es 1 línea en `insight-registry.ts`, los builders la recogen automáticamente. Caps protegidos: outlier:1, change_point:2, steady_share:1, correlation:1, meta_gap_temporal:2. Baseline runtime: blocks_final:11, urgentes:10, 6 señales convergentes. `tsc` 0 errores en los 9 PRs. Documentado en §29.2.

## 22. Glosario

- **Candidato**: un insight detectado por un motor, antes de ser filtrado/enriquecido/redactado.
- **Miembro**: el sujeto concreto del insight (un vendedor, un cliente, un producto, una categoría).
- **Dimensión**: la categoría a la que pertenece el miembro (vendedor, cliente, producto, etc.).
- **Métrica**: la variable medida (venta, unidades, transacciones, precio unitario, cumplimiento).
- **Tipo de insight**: el patrón estadístico o de negocio detectado (change, trend, contribution, meta_gap, dominance, concentration).
- **Cruce**: conexión entre dos variables de distintas tablas que aporta contexto causal o correlativo.
- **Rescue**: módulo de enriquecimiento que se activa cuando los cruces primarios no alcanzan el umbral.
- **Cartera histórica**: conjunto de productos que un cliente compró en los últimos 3 meses con al menos una transacción.
- **Pareto**: miembros de una dimensión que acumulan el 80% de la venta, ordenados de mayor a menor.
- **Protagonista**: el miembro principal de una tarjeta. Cada miembro protagoniza máximo una tarjeta por render.
- **Ref genérica**: frase impersonal que reemplaza al protagonista cuando se lo menciona por segunda vez en la misma tarjeta (ej: "ese cliente", "esa categoría").
- **Validador**: función que revisa el texto redactado y detecta bugs específicos (V1–V15).
- **Lema verbal**: forma base de un verbo (ej: "pierde", "perdieron" y "perdiendo" comparten el lema "perder").
- **usedEntities**: registro compartido entre tarjetas que lista qué miembros ya protagonizaron alguna tarjeta en el render actual.
- **evidenceChain**: [Objetivo Fase 5C] estructura que acompaña al candidato listando cada cruce con su respaldo en tablas.
- **backupCandidate**: [Objetivo Fase 5E] candidato perdedor de la fusión entre motores, guardado por si el ganador falla en redacción.
- **MTD comparable (YoY)**: mismo período del mes en el año anterior. Si hoy es 16 de abril 2026, el MTD comparable es 1–16 de abril 2025. Controla estacionalidad.
- **YTD comparable (YoY)**: mismo período del año en el año anterior. Si hoy es 16 de abril 2026, el YTD comparable es 1 de enero al 16 de abril 2025. Controla estacionalidad.
- **Tendencia móvil**: evaluación de la trayectoria de una métrica sobre 3 o más meses consecutivos. Se usa para detectar dirección sostenida sin comparar dos puntos aislados. Es el único uso legítimo de datos mes-a-mes.
- **Estacionalidad**: variación natural de una métrica por el momento del ciclo anual, del trimestre o del mes. El motor la controla comparando siempre contra el mismo momento del año anterior.

## 23. Proceso de cambios al manifiesto

Este archivo es la fuente única de verdad del motor. Cuando cambian las reglas del sistema:

1. Se edita primero este manifiesto con el cambio propuesto.
2. Si el cambio toca una regla/constante/umbral → se actualiza `insightStandard.ts`.
3. Si el cambio toca orquestación/redacción/pipeline → se actualiza `insight-engine.ts`.
4. Se valida en el dashboard que el comportamiento cambió como esperado.
5. Al cerrar una fase del roadmap, se actualiza la versión en la cabecera del manifiesto y se retiran las etiquetas `[OBJETIVO FASE 5X]` de las secciones cumplidas.

Nunca al revés. El código sigue al manifiesto, no al contrario.

### Historial de versiones

- **v1.0** (16 abr 2026, post-Fase 4I): versión inicial del manifiesto.
- **v1.1** (16 abr 2026, post-Fase 4I): correcciones de consistencia contra código real, arquitectura de archivos clarificada, sección de ventanas temporales expandida, sección de cálculo de impacto, sección de Pareto operativo, glosario, política de errores, 47 reglas enumeradas una por una.
- **v1.2** (16 abr 2026, post-Fase 4I): corrección crítica de ventanas temporales. Se prohíbe comparar contra el mes anterior bajo cualquier forma por estacionalidad. Las únicas comparaciones válidas pasan a ser YoY mensual y YoY anual. Se agrega regla anti-regresión 48. Se expande sección 5 con explicación de estacionalidad, tendencia móvil y fallbacks legítimos.
- **v1.3** (16 abr 2026, post-Fase 5A): infraestructura YoY implementada en `insightStandard.ts` (`getRangoMTD`, `getRangoMTDComparableYoY`, `getRangoYTD`, `getRangoYTDComparableYoY`, `filtrarPorRango`, `tieneDatosYoY`, `mesesDisponiblesConData`, `COMPARACIONES_PERMITIDAS`). Tipos `change` en `insight-engine.ts` migran a comparación YoY con recorte de día para MTD equivalente. Fallback a `trend` vía ventana móvil de 3 meses consecutivos cuando no hay datos YoY. Validador V16 (`tieneReferenciaTemporalProhibida`) bloquea referencias temporales prohibidas en texto visible. 7 plantillas textuales reemplazadas ("mes anterior", "mes pasado", "período anterior" → "mismo período del año anterior"). Campo `detail.comparison` agregado a candidatos `change`/`trend`. Regla anti-regresión 49 agregada. Fase 5A marcada como COMPLETADA en roadmap.
- **v1.4** (16 abr 2026, post-Fase 5B): tile KPI "Venta acumulada" migrado a MTD YoY (mismo mes año anterior con recorte same-day) — el varPct deja de comparar contra mes anterior y cumple P4. Dormidos rehabilitados como candidatos de pleno derecho con umbral configurable por usuario: `DIAS_DORMIDO_DEFAULT=45`, rango 15–180, persistido en `localStorage` con clave `salesflow.dias_dormido`. Helpers en `insightStandard.ts`: `getDiasDormidoUsuario()`, `clasificarDormido()`. Candidatos cliente enriquecidos con `detail.umbralDiasDormido`/`esUmbralDefault`/`diasSinComprar`/`impactoVentaHistorica`. `DiagnosticBlock` extendido con `dormidoMeta` opcional. Input numérico en `ClientesPage` con validación de rango, feedback live de dormidos clasificados, botón "Restablecer", `id="dias-dormido-input"` + hash-scroll `#dias-dormido-input`. Cintillo informativo en `EstadoComercialPage` sobre el grupo de alertas con umbral actual y link cross-page. P6 reformulado. Sección 18 nueva dedicada a dormidos (secciones 18–22 anteriores renumeradas a 19–23). Regla anti-regresión 50 agregada. Header de reglas actualizado a "(1–50)". Fase 5B marcada como COMPLETADA en roadmap.
- **v1.4.1** (16 abr 2026, post-Fase 5B.1): fix quirúrgico de emisión. `runInsightEngine` ahora emite candidatos con `insightTypeId: 'cliente_dormido'`, `detail.umbralDiasDormido` y `dormidoMeta` poblados — antes la infraestructura existía pero el núcleo no producía ninguno. Shape de `DiagnosticBlock.dormidoMeta` fijado a `{umbralDiasDormido, esUmbralDefault, cantidadClientesDormidos}` (renombrado de `{umbral, esDefault, dias}`). Render path dedicado en `candidatesToDiagnosticBlocks` para `cliente_dormido` que construye bullets desde `detail` sin pasar por `buildContextUniversal` (menciona días, frecuencia histórica e impacto, con filtro V16). Cintillo operativo en Estado Comercial con conteo desde `cantidadClientesDormidos`. Cierra criterios 5, 6 y 7 pendientes de Fase 5B.
- **v1.4.2** (17 abr 2026, post-Fase 5B.2): fix de supervivencia en el pipeline. `filtrarConEstandar` descartaba silenciosamente los candidatos `cliente_dormido` porque `pasaFiltroRuido` mide actividad en el período actual y los dormidos codifican la ausencia de actividad. Exención por capacidad del candidato (`detail.comparison === 'no_temporal'`), aplicada al filtro de ruido y a 5 bucles temporales posteriores (B7 validarProporcionalidad, B9 validarComparacionTemporal, C10 evaluarIntegracionInventario, C11 evaluarIntegracionMetas, G31 validarCoherenciaTemporal). Nuevo log `[fase5b.2]` de resumen al final del pipeline: `{candidatosEntrada, candidatosSalida, dormidosSalida}`. Cero modificaciones en `pasaFiltroRuido`, `diagnostic-engine.ts` o rutas especiales por `insightTypeId`. Guard extensible a futuros insights no_temporal sin tocar este archivo.
- **v1.4.3** (17 abr 2026, post-Fase 5B.3): cierre del cerco de filtros. Runtime de 5B.2 reveló que el guard solo cubría B6 ruido — los dormidos seguían muriendo en 4 filtros posicionales posteriores (reasignaciones `result = result.filter(...)`, no bucles). Culpable principal: C16 CRUCES_DISPONIBLES + whitelist `isStandardType` sin `cliente_dormido`. Guards agregados en: C16 cruces+tipo estándar, E20 resolverContradiccion, E21 detectarRedundancia, G28 esConclusionValida. E22 `validarBalance` reestructurado para partitionar `noTemporales` y garantizar supervivencia en el cap_negativos. Log renombrado a `[fase5b.3]` con alerta `console.warn` si entran dormidos y ninguno sobrevive. Cero modificaciones en `insightStandard.ts`. Cero hardcodes por `insightTypeId`.
- **v1.4.4** (17 abr 2026, post-Fase 5B.4): uniformización visual de dormidos. Las cards `cliente_dormido` ahora son visualmente indistinguibles del resto — título con flecha `↓` prefijada, sin KPI lateral "Impacto histórico" (movido a la narrativa del `description`), sin cintillo de grupo arriba. `dormidoMeta` eliminado del bloque y del tipo `DiagnosticBlock` (diagnostic-engine.ts); loop que rellenaba `cantidadClientesDormidos` retirado como código muerto; JSX del cintillo en `EstadoComercialPage.tsx` retirado. La uniformidad visual es separable de la capacidad interna `no_temporal`: el pipeline conserva todos los guards de Fase 5B.2/5B.3 y el umbral sigue configurable y narrado en cada card.
- **v1.6.0** (17 abr 2026, post-Fase 5D): coherencia semántica unidades vs dinero. Renombrado estructural de campos YTD en `VendorAnalysis`/`TeamStats`/`SupervisorAnalysis` con sufijos obligatorios `_uds`/`_usd`/`_pct`; `computeYTD` devuelve ambas unidades con sus respectivas variaciones. La tabla y las tarjetas de Vendedores recalculan `VAR%` sobre la serie visible (R56). El prompt "Análisis IA" de vendedores incorpora cláusula explícita de convención de sufijos con prohibición de prefijar unidades con `$` (R57). Consumidores actualizados: `VendedoresPage`, `EstadoComercialPage`, `RendimientoPage`, `MetasPage`, `chatService`, `pulso-engine`, `insightEngine`, `radar-engine`, `exportUtils`. 3 reglas nuevas (R55–R57), header "(1–57)".
- **v1.7.0** (17 abr 2026, post-Fase 5F): integridad de ventana temporal en clientes dormidos y Top Clientes. `valor_historico` → `valor_yoy_usd` (suma de venta_neta en el mismo mes del año anterior al período activo, no acumulado all-time). `compras_historicas` → `transacciones_yoy`. Top Clientes recalcula `peso` / `cumulativePct` sobre el universo total del negocio, no el top-20. Etiquetas de columna dinámicas con mes+año explícitos ("Valor abr 2025"). Banner actualizado a "venta YoY perdida". Recovery copy usa `valor_yoy_usd` para el umbral. Consumidores actualizados: `analysis.ts`, `ClientesPage`, `EstadoComercialPage`, `VendedorPanel`, `PulsoPanel`, `chatService`, `pulso-engine`, `radar-engine`, `insight-engine`. 3 reglas nuevas (R58–R60), header "(1–60)". `tsc --noEmit` 0 errores.
- **v1.5.0** (17 abr 2026, post-Fase 5C): barrido de integridad numérica — cuatro fallos estructurales cerrados. (1) `buildText` de `contribution` muestra primero números de la entidad, después del grupo como contexto etiquetado (R51). (2) `contribution.detect` (insight-registry.ts) filtra miembros counter-trend: solo alineados con la dirección del agregado participan como "mayor aporte" (R52). (3) Impacto histórico de dormidos migrado a ventana YoY (mismo mes año anterior) con `detail.impactoVentanaLabel` explícito en el texto visible (R53). (4) `pctChange` de trend sobrescrito post-detect a fórmula literal primer→último mes, con extremos (`historyStart` → `historyEnd`) visibles en el bullet para verificabilidad (R54). 4 reglas nuevas (R51–R54), header del bloque actualizado a "(1–54)". Cambios acotados a `insight-engine.ts` (3 puntos) y `insight-registry.ts` (1 punto en `contribution.detect`); `insightStandard.ts` y `diagnostic-engine.ts` intactos; filtros B6/cerco 5B.3 intactos.
- **v1.8.0** (17 abr 2026, post-Fase 5H): coherencia narrativa YTD / Estado General / badges. Tarjeta "Venta acumulada" usa varPct YTD YoY. Estado General canal/supervisor usa YTD desde cross-tables (no variacion_pct MTD). Helper `lexSev(pct)` para léxico calibrado (R63). `fmtPct` de diagnostic-engine migrado a `toFixed(1)` (R66). R65: campo `metadataBadges` en DiagnosticBlock, derivado por `badgesFromCandidate()` como pills en DiagnosticBlock.tsx.
- **v1.8.1** (17 abr 2026, post-Fase 5H.1): fix badges. `badgesFromCandidate()` ahora deriva métrica y ventana del `insightTypeId`/`metricId` real del candidato. Correcciones: `num_transacciones` → 'Txns'; `ticket_promedio`/`precio_unitario` → 'Ticket prom'; ventana default cambiada de 'YTD' a 'Mes actual'; `insightTypeId === 'trend'` → 'Últimos 3 meses'. R67 nueva.
- **v1.9.0** (17 abr 2026, post-Fase 5I): rediseño UX de tarjetas diagnóstico. Nuevo módulo `diagnostic-actions.ts` con `enrichDiagnosticBlocks()` (sujeto, deltaValue, deltaUnidad, deltaSigno, chip, quePaso, porQueImporta, acciones) y `generarAcciones()` determinístico (sin LLM, toda acción cita un campo real del store). DiagnosticBlock.tsx refactorizado: CollapsedView = arrow+sujeto+delta+chip (R68); ExpandedView = Qué pasó + Por qué importa + Qué hacer en prosa (R69–R71). R70: QUÉ HACER omitida si sin datos. R72: lenguaje robótico prohibido. R73: orden por |deltaValue| descendente. R74: `cumplimiento.toFixed(1)` en meta_gap de buildText (fix 38.8% vs 39%).
- **v1.9.1** (17 abr 2026, post-Fase 5I.1): fix chip contraído + auditoría QUÉ HACER. `EnrichedDiagnosticBlock` añade `displayDelta` (R75), `sortKey` (R76), `sinAccionesLabel` (R79). `parseDisplayDelta()` extrae delta absoluto (cur−prev) de patrones de texto (`N USD vs M USD`, `N USD → M USD`, `$X.XX → $Y.YY`, `N txns vs M txns`); meta_gap y dormido siguen siendo reglas propias. `fmtDeltaDisplay` refactorizado para aceptar `DisplayDelta | null`, devuelve `—` cuando es null (R77). Sort migrado a `sortKey` = |delta_usd_equivalente| vía ticket promedio empresa (R76). `sanitizeR80()` en `buildPorQueImporta` elimina frases prohibidas del output. R79: `sinAccionesLabel` renderizado como línea gris antes del botón Profundizar cuando `acciones.length === 0`. R80: lista prohibida ampliada. `tsc --noEmit` 0 errores.
- **v1.9.2** (17 abr 2026, post-Fase 5I.2): fidelidad de datos y lenguaje. R80 ampliada con 6 variantes. Conectores rotantes neutros. `repairStockClauses()` R81/R82. `repairDormidoReferenceInBullet()` R83. `repairGrammar()` O3. `determineSinAccionesLabel()` R85. `tsc --noEmit` 0 errores.
- **v1.9.3** (17 abr 2026, post-Fase 5I.3): cierre residuales narrativos. `repairStockClauses` pasa por pipeline de stock agregado (B5/B6). Conector huérfano eliminado (B8). Spacing R88 (espacio entre cláusulas). R89–R92: gramática concordancia plural, top-producto desde `topProductosPorCliente`, cobertura R85 para cliente+positive. `tsc --noEmit` 0 errores.
- **v1.9.4** (17 abr 2026, post-Fase 5I.4): cierre definitivo B5/B6/B8/B9/B10. R93: pipeline universal de saneado (cobertura 100% de bloques). R94: `joinSentences` obligatorio. R95: validación exactMatch de top-3 productos contra `topProductosPorCliente`. R96: exposición de múltiples rangos (mesActual + ultimos3Meses). Pass0 split de cláusulas ambiguas. `tsc --noEmit` 0 errores.
- **v1.9.5** (17 abr 2026, post-Fase 5I.5): concordancia signo-verbo. R97: signo-verbo en citas de producto (alza/baja). R98: `normalizeSpacing` em-dash + conectores con espacio trailing. R99: validador runtime de invariantes. `topProductosPorCliente` añade campo `signo` a cada entry. `top[0].name` → `top[0].nombre` en templates inventory. `tsc --noEmit` 0 errores.
- **v1.9.6** (17 abr 2026, post-Fase 5I.6): R100: `collapseRedundantTopProductClauses()` fusiona cláusulas que convergen al mismo producto top en una sola mención (bug B14 — doble mención del mismo producto en bloques trend-positive). `tsc --noEmit` 0 errores.
- **v1.9.7** (17 abr 2026, post-Fase 5I.7): R101: gate final en `enrichDiagnosticBlocks` — aplica R100 después de `repairGrammar` (O3.4). Root cause B14: R100 corría antes de O3.4, que regeneraba la cláusula redundante. Punto único de salida narrativa garantizado. `tsc --noEmit` 0 errores.
- **v2.7.0** (22 abr 2026, post-Frente Z.9 — Motor de Decisión Ejecutiva): §30 nuevo. Z.9.3a migración `InsightChain` → `DiagnosticBlockChain` (4 archivos). Z.9.1/Z.9.2: campos ejecutivos + hidratación (R134–R138). Z.9.3: `buildInsightChains` en `decision-engine.ts` (nuevo módulo, sin deps circulares). Z.9.4: `buildExecutiveProblems` con `ExecutiveProblem`. Z.9.5: pipeline wired en `EstadoComercialPage` bajo `EXECUTIVE_COMPRESSION_ENABLED=false`. Z.9.6: `calcularRenderPriorityScore` [R143] + cap MAX_EXECUTIVE_PROBLEMS_SHOWN=7 [R142]. Z.9.7: `EngineStatusReport` + `getLastInsightEngineStatus()` hardening por detector. R134–R146 documentadas en §30. `tsc --noEmit` 0 errores en todas las fases.
- **v2.6.0** (22 abr 2026, post-Fase Z.8 — Motor 2 completo): Motor 2 expandido con arquitectura Metric × Dimension × InsightType. Nueve PRs implementados y verificados en runtime: PR-M8a (change_point ticket_promedio × vendedor/cliente), PR-M8b (+unidades +frecuencia_compra), PR-M9 (steady_share), PR-M9b (cap change_point=2), PR-M10 (correlation), PR-FIX.8 (DIMENSION_REGISTRY conectado — canal/dpto/supervisor/categoria), PR-M11 + fix H24 (meta_gap_temporal con ymCutoff), PR-FIX.9 (METRIC_REGISTRY conectado a builders), PR-FIX.10 (umbrales permisivos SS+Corr). Baseline final: blocks_final:11, urgentes:10, 6 señales convergentes, por_tipo: change_point:3, meta_gap_temporal:1, outlier:1, product_dead:1, stock_risk:1, migration:2, contribution:2, change:2, seasonality:1. §29.2 nueva sección con baseline completo. `tsc` 0 errores. Roadmap Frente Z actualizado con Z.4–Z.8.
- **v2.5.0** (18 abr 2026, post-Fase Z.7 T1 — nuevos tipos + templates): §29.1 cuatro tipos nuevos (`stock_risk`, `stock_excess`, `migration`, `co_decline`) en `INSIGHT_TYPE_REGISTRY`. `NARRATIVE_TEMPLATES` para los 4 tipos nuevos más `meta_gap`. Pase inventario 3D en `runInsightEngine`. `DataPoint.extra` y `detect(ctx)` extendidos. R132–R133 documentadas. `tsc --noEmit` 0 errores.
- **v2.4.0** (18 abr 2026, post-Fase Z.6 — Render Rate Recovery): §28.1 Heterogeneity Split + Fallback Bullet. §28.2 huérfanos, hidratación de positivos, headline fix. §28.3 deprecación detectores no accionables. `tsc --noEmit` 0 errores. `npm run build` ✓.
- **v2.3.0** (18 abr 2026, post-Fase Z.5 — fusión real de motores): Adaptador `buildRichBlocksFromInsights` reparado — umbral protagonista ≥1 con filtro impacto ≥USD500. `impactoUSD` como criterio rector del merge. R118–R120. §27 nuevo. `tsc --noEmit` 0 errores.
- **v2.2.0** (18 abr 2026, post-Fase Z.4 — performance): Cuello 2: `getAgregadosParaFiltro` en `domain-aggregations.ts` unifica 3 pasadas sobre sales en 1 (R114). Cuello 4: `_stats` adjuntos a `InsightCandidate[0]` para evitar doble `calcularPercentiles`/`calcularPareto` (R115). Cuello 1: `prunable: boolean` en `InsightTypeDef`; `dominance` podado a miembros Pareto (R116). Cuello 3: `buildRichBlocksFromInsights` exportada + `_legacyBlocks` useMemo en EstadoComercialPage (R117). Cuello 5: descartado (O(n²) acotado, ~780 ops). Cuello 7/Gap 5: ya estaban implementados. §26 nuevo en manifiesto. R114–R117 documentadas. `tsc --noEmit` 0 errores. `npm run build` ✓.
- **v2.1.0** (18 abr 2026, post-Frente Z.2/Z.3 + auditoría): Frente Z.2 completado — `diagnostic-engine.ts` eliminado, 5 builders ricos migrados a `insight-engine.ts` (R104–R110). Frente Z.3 completado — `NarrativeBuilder` creado (`narrative-builder.ts`, 317 líneas), `diagnostic-generator.ts` extraído (305 líneas), `diagnostic-actions.ts` reducido a 316 líneas, 8 sanitizadores eliminados por absorción, 23 tests vitest. R111–R113 garantizados por construcción. Auditoría doc↔código: §3 actualizado (heredero del motor viejo documentado), §7 reescrito (merge real L2489), §8 estándares huérfanos clasificados, §9 pipeline 3-useMemo (Cuello 6), §16 tabla V1–V14, §20 R1–R113, §21 Z.2/Z.3 COMPLETADAS, §24 R80–R101 con categorías ACTIVA/SOLO-ALERTA/NO-IMPLEMENTADA, §25 nueva (R111–R113). Guards DEV-only R99/R100 (Cuello 7). `tsc --noEmit` 0 errores. 23/23 tests vitest.
- **v2.0.0** (17 abr 2026, post-Frente Z.1): alineación arquitectónica. `domain-aggregations.ts` creado como fuente única de cálculos derivados de ventas (R102). `topProductosPorCliente` extraído de `EstadoComercialPage` a `getTopProductosPorClienteAmbosRangos`. R103: importaciones directas a `insightStandard.ts` desde páginas restringidas a constantes. Manifiesto actualizado a v2.0: Section 3 con 2 archivos nuevos, Section 7 con realidad actual de motores, Section 8 actualizado a 52 estándares, Section 9 con pipeline real documentado, historial completo 5I.3–5I.7, roadmap Frente Z (Z.1–Z.3). `tsc --noEmit` 0 errores.

---

## 24. Reglas R68–R101 (Frente A completo — UX tarjetas diagnóstico)

**R68 — Tarjeta contraída de diagnóstico.** Solo dirección (flecha + color), sujeto (entidad), delta absoluto con unidad y chip único `[ventana · métrica]`. Prohibido mostrar fórmula, tipo de insight, o múltiples badges en estado contraído. Flecha verde ▲ si sign=positivo, roja ▼ si negativo, gris ■ si neutro.

**R69 — Tarjeta expandida.** Estructura narrativa de tres secciones: QUÉ PASÓ (summaryShort), POR QUÉ IMPORTA (bullets convertidos a prosa), QUÉ HACER (lista numerada de acciones). Las dos primeras secciones son prosa continua, sin bullet points. QUÉ HACER admite máximo 3 acciones numeradas.

**R70 — Acciones determinísticas.** Generadas por `diagnostic-actions.ts`, nunca por LLM. Cada acción expone `fuente`: path real del store que la respalda. Si no hay datos válidos para generar acciones, la sección QUÉ HACER se omite por completo — prohibido inventar.

**R71 — Catálogo de verbos medibles.** Test de 3 condiciones: verbo físico observable + sujeto concreto del store + disparador binario (¿se hizo? sí/no). **Permitidos:** Llamar, Visitar, Enviar, Pedir, Reabastecer, Programar, Asignar, Confirmar, Suspender, Reunirse, Mencionar en junta, Revisar inventario, Bloquear precio, Cambiar ruta. **Prohibidos:** Reconocer, Estudiar, Analizar, Replicar, Auditar, Monitorear, Optimizar, Evaluar, Revisar plan/pipeline.

**R72 — Lenguaje prohibido por robótico.** Prohibido en todo texto visible de tarjetas: "es importante destacar", "cabe mencionar", "los datos sugieren", "se observa que", "cabe resaltar", "es fundamental". Reemplazar por voz activa directa. (Lista ampliada en R80.)

**R73 — Orden de tarjetas (deprecado por R76).** Reemplazado por R76. Se mantiene en el historial para referencia.

**R74 — Formato de % de cumplimiento.** Cualquier render de `cumplimiento_pct` o derivados usa `toFixed(1)` (1 decimal). El valor visible en la tarjeta y el valor del motor deben coincidir dígito a dígito. Prohibido `Math.round()` para este campo.

**R75 — `displayDelta.value` es siempre delta absoluto.** El chip contraído de diagnóstico muestra el delta en la métrica natural del candidato (cur − prev), nunca un porcentaje. Parseo vía `parseDisplayDelta()` en `diagnostic-actions.ts` a partir de los patrones de texto en `summaryShort`: `"N USD vs M USD"` (change), `"N USD → M USD"` (contribution/trend), `"$X.XX → $Y.YY"` (ticket), `"N txns vs M txns"` (txns). Prefijo `$` solo si unidad es USD o usd_ticket; sufijo ` uds` / ` txns` si aplica; `%` solo si es pct_meta. Prohibido combinar prefijo monetario con valor porcentual.

**R76 — Orden por `sortKey` = |delta_usd_equivalente|.** Los cards se ordenan por `sortKey` descendente. Conversión por unidad: USD → directo; uds → valor × ticket_promedio_empresa; txns → valor × ticket_promedio_empresa; usd_ticket → delta × avg_clientes_activos; pct_meta → delta × meta_usd_promedio / 100. Candidatos sin sortKey calculable van al final (sortKey = −1).

**R77 — Todo card contraído muestra un delta numérico.** Si la ventana es "Últimos 3 meses" u otra y el delta no es parseable, se muestra `—` (guion visible). Se registra `[5I.1] delta missing: [entidad]` en consola dev. Prohibido dejar el campo vacío.

**R78 — Formato k/M en USD.** `|valor| ≥ 1,000,000` → `(valor/1000000).toFixed(2) + 'M'`. `|valor| ≥ 1,000` → `(valor/1000).toFixed(1) + 'k'`. `|valor| < 1,000` → entero sin decimales. Consistente en chip contraído y texto expandido.

**R79 — Cards sin QUÉ HACER cierran con línea contextual (R85).** Cuando `acciones.length === 0`, la tarjeta muestra `sinAccionesLabel` antes del botón Profundizar. El texto es determinista según contexto del block (ver R85). Prohibido dejar la expandida con solo 2 secciones sin cierre.

**R80 — Lista prohibida ampliada v1.9.2 (extiende R72). [ESTADO: NO IMPLEMENTADA como función separada]** `sanitizeR80()` fue eliminada en Z.3 (absorbida por NarrativeBuilder). Los builders ricos de insight-engine.ts nunca emiten estas frases (el motor estadístico tampoco). El motor heredado migrado a NarrativeBuilder garantiza la exclusión por construcción. La lista sigue vigente como invariante, pero no hay función que la enforce post-render.

Lista prohibida: "lo que vale resaltar", "vale la pena mencionar", "es importante notar", "cabe destacar", "cabe resaltar", "se observa que", "los datos sugieren", "es preciso señalar", "hay que tener en cuenta", "cabe mencionar", "lo que vale mencionar", "lo que más duele", "lo que más afecta", "lo que más pesa", "lo que más preocupa", "lo que más golpea", "lo que duele más", "lo que hay que mirar". Conectores rotantes: "Además, " · "En paralelo, " · "También, " · "Suma a esto que ".

**R81 — Fidelidad de stock: una cifra cita exactamente un producto. [ESTADO: ACTIVA por construcción]** `addAdvertenciaStock()` en `NarrativeBuilder` (narrative-builder.ts L246) garantiza que cada llamada cita un solo producto con sus cifras propias. `repairStockClauses()` fue eliminada en Z.3. La garantía es ahora por construcción, no por reparación post-hoc.

**R82 — Clasificación de inventario determina la narrativa. [ESTADO: ACTIVA]** `addAdvertenciaStock()` usa `clasificacion: StockClasificacion` tipado. `baja_cobertura`/`riesgo_quiebre` → "hay que reabastecer". `lento_movimiento`/`sin_movimiento` → "urge rotar". Imposible invertir: el switch es exhaustivo en `renderStock()` de narrative-builder.ts L164.

**R83 — Dormidos con nombre, no con conteo. [ESTADO: ACTIVA por construcción]** `addAdvertenciaDormido()` en `NarrativeBuilder` (narrative-builder.ts L256) requiere `clientes: string[]` con nombres reales. `repairDormidoReferenceInBullet()` fue eliminada en Z.3. Si se pasa lista vacía, no se agrega nada. La garantía es por construcción.

**R84 — Producto top por delta absoluto dentro de la ventana.** La selección de "el que más jalona / empuja" usa `cur − prev` dentro de la ventana del candidato, no el total de venta ni rankings externos. Verificable con ventas filtradas por la ventana. Actualmente implementado en `insight-engine.ts`; el log `[5I.2] productos_ranking` en `buildPorQueImporta` permite auditar el valor recibido.

**R85 — Línea de cierre contextual, no hardcoded.** `determineSinAccionesLabel(block, sujeto, acciones, store)` decide en cascada: (1) `va superando la meta.` si `riesgo === 'superando'` o `cumplimiento_pct ≥ 100`; (2) `va creciendo con buen ritmo.` si `severity === 'positive'`; (3) `revisar la cartera de dormidos manualmente.` si el texto del block menciona dormidos o hay dormidos asignados al sujeto; (4) fallback: `los datos históricos no muestran una palanca clara.`

### Bloque R86–R92 — Fase 5I.3 (stock agregado, conectores, gramática)

**R86 — [gap documental]** Bloque 5I.3 - stock pasa por `repairStockClauses` de forma universal.

**R87 — [gap documental]** Bloque 5I.3 - top-producto derivado de `topProductosPorCliente` en bloques con dimensión cliente.

**R88 — Spacing entre cláusulas. [ESTADO: ACTIVA por construcción]** El separador entre dos cláusulas de `porQueImporta` siempre incluye un espacio después del punto o coma terminal. `normalizeSpacing()` fue eliminada en Z.3. `NarrativeBuilder.render()` aplica `replace(/(\S)—/g, '$1 —').replace(/—(\S)/g, '— $1').replace(/  +/g, ' ')` directamente (narrative-builder.ts L306). La garantía es por construcción.

**R89 — Plural concordante en cláusulas de cliente.** Si el sujeto de la cláusula es plural ("N clientes"), el verbo y el adjetivo siguen en plural. `repairGrammar()` verifica que la cláusula "N clientes ... fue..." se corrija a "N clientes ... fueron...".

**R90 — top-producto desde `topProductosPorCliente` en todos los bloques con dim=cliente.** `EnrichedDiagnosticBlock` recibe `topProductosPorCliente` en el snapshot y lo consume para determinar el producto con mayor delta en la ventana del candidato. Nunca usar rankings externos ni totales acumulados.

**R91 — Cobertura de R85 para bloques con severity=positive y dimensión=cliente.** Cuando un bloque tiene `severity === 'positive'` y `dim === 'cliente'`, la línea de cierre R85 opción (2) aplica también si `varPct > 0` aunque `riesgo` no sea explícitamente `superando`.

**R92 — Conector huérfano eliminado.** Si `porQueImporta` arranca con un conector adversativo ("Sin embargo,", "Aunque,", "A pesar de,") sin cláusula previa, el conector se elimina y la cláusula empieza directamente con su sujeto.

### Bloque R93–R96 — Fase 5I.4 (pipeline universal, rangos múltiples)

**R93 — Pipeline universal de saneado. [ESTADO: ACTIVA]** `enrichDiagnosticBlocks` aplica todas las funciones de reparación (R80–R92) a la totalidad de los bloques de entrada, independientemente del `insightTypeId`. No existen bloques exentos del pipeline de saneado.

**R94 — `joinSentences()` obligatorio en `porQueImporta`. [ESTADO: ACTIVA por construcción]** Las cláusulas de `porQueImporta` se concatenan siempre con `joinSentences()`, nunca con concatenación directa de strings. `joinSentences()` en `narrative-builder.ts` garantiza separador correcto, capitalización de primera letra y punto final. Los builders NarrativeBuilder lo llaman internamente en `render()`.

**R95 — Validación exactMatch de top producto contra `topProductosPorCliente`. [ESTADO: ACTIVA]** El producto citado en el texto de `porQueImporta` para un bloque de cliente debe estar en `topProductosPorCliente[cliente].topAlzas[0].nombre` o `topCaidas[0].nombre` para la ventana correspondiente. Si no hay match, la cláusula de producto se omite y se registra `[R95] no-match`. Implementado en `validateProductoContraTopList` de `narrative-builder.ts`.

**R96 — Exposición de ambos rangos: mesActual y ultimos3Meses. [ESTADO: ACTIVA]** `topProductosPorCliente` expone dos rangos simultáneamente. `enrichDiagnosticBlocks` selecciona el rango según `chip` del bloque: chip "Mes actual" → `mesActual`; chip "Últimos 3 meses" / otra → `ultimos3Meses`. Nunca usar un rango para el otro.

### Bloque R97–R99 — Fase 5I.5 (concordancia signo-verbo, spacing, validator)

**R97 — Concordancia signo-verbo en citas de producto. [ESTADO: ACTIVA por construcción]** En la cláusula "el producto X [verbo] [delta]", el verbo concuerda con el signo del delta: `delta > 0` → verbo de alza; `delta < 0` → verbo de caída. `repairSignVerbConcordance()` fue eliminada en Z.3. `fmtSignedDelta(n)` en narrative-builder.ts L178 deriva el signo de `Math.sign(n)` — imposible invertir. `TopProductoEntry.signo` sigue disponible como campo de control.

**R98 — Spacing em-dash y conectores. [ESTADO: ACTIVA por construcción]** El em-dash siempre lleva espacios. `normalizeSpacing()` fue eliminada en Z.3. Absorbida por `NarrativeBuilder.render()` (R88 vigente).

**R99 — Validador runtime de invariantes. [ESTADO: SOLO-ALERTA]** 4 regex dentro de `enrichDiagnosticBlocks` (diagnostic-actions.ts L291–L316) verifican post-enriquecimiento violaciones B5/B6 (stock agregado), B8 (conector sin espacio), B14 alza y B14 baja (cláusula redundante). Solo emiten `console.warn`; no reparan y no bloquean el render. **Solo activos en `import.meta.env.DEV`** (Cuello 7 aplicado en Z.3). Blocks del legacy (`vendor-*`) se saltan la verificación R100 de top-producto. `[MEJORA: convertir a reparación activa]`

### Bloque R100–R101 — Fase 5I.6/5I.7 (colapso cláusulas, gate final)

**R100 — Colapso de cláusulas redundantes. [ESTADO: ACTIVA — runtime guard]** `collapseRedundantTopProductClauses(text)` en diagnostic-actions.ts L178 fusiona dos cláusulas consecutivas que convergen en el mismo producto top. Función separada que existe y se ejecuta. Si dispara, es señal de bug en el motor principal (los bloques NarrativeBuilder no deberían llegar aquí).

**R101 — Gate final post-grammar en `enrichDiagnosticBlocks`. [ESTADO: ACTIVA]** `collapseRedundantTopProductClauses` (R100) se aplica dentro de `buildPorQueImporta` **después** de `repairGrammar` (O3.4). Este es el punto único de salida del pipeline de saneado. El orden garantiza que O3.4 no regenere cláusulas que R100 ya colapsó.

### Bloque R102–R103 — Fase Z.1 (arquitectura de fuente única)

**R102 — Toda función que agregue/derive ventas vive en `domain-aggregations.ts`.** Páginas y motores la consumen importándola. Prohibido replicar lógica de agregación en componentes. Si un useMemo en una página itera ventas para calcular un delta o top-list, es deuda Z.1 y debe marcarse `// TODO Z.1 — extraer a domain-aggregations`.

**R103 — Importaciones directas a `insightStandard.ts` desde páginas se restringen a constantes.** Constantes (`DIAS_DORMIDO_DEFAULT`, `DIAS_DORMIDO_MIN`, `DIAS_DORMIDO_MAX`, etc.) y utilidades de configuración UI (`getDiasDormidoUsuario`) pueden importarse directamente de `insightStandard.ts`. Para cálculos derivados de ventas, importar desde `domain-aggregations.ts`.

### Bloque R118–R120 — Fase Z.5 (fusión real de motores)

**R118 — Adaptador `buildRichBlocksFromInsights`: umbral mínimo de protagonista = 1 con filtro de impacto ≥ $500. [ESTADO: ACTIVA]** Antes de Z.5 el umbral era ≥3 insights por vendedor; ahora es ≥1, compensado con filtro de impacto mínimo por item ($500 USD). Secciones alineadas a prefijos reales del motor viejo: `meta-riesgo-*`, `cartera-pequeña-*`, `inventario-desabasto-*`, `sobrestock-*`, `co-declive-*`, `sustitucion-*`, `producto-oportunidad-*`, `productos-muertos-cat-*`, `concentracion*`, `grupo-concentracion`, `depto-caida-*`, `estancado-*`, `canal-contexto-*`, `positivo-estable-*`. No cortar a 6 dentro del adaptador — el `slice(12)` final vive en `candidatesToDiagnosticBlocks`. Motor viejo: 0% → aporte real. Archivo: `insight-engine.ts` función `buildRichBlocksFromInsights`.

**R119 — Todo bloque diagnóstico expone `impactoUSD: number` como campo obligatorio. [ESTADO: ACTIVA]** Proviene de `impacto_economico.valor` para bloques del motor viejo. Para bloques del motor nuevo: `computeImpactoUSDFromCandidate(c, ctx)` convierte a USD usando `avgPrecioUnitario` derivado de `vendorAnalysis`. `correlation` y otros tipos no-monetizables retornan 0 → fallback en `enrichDiagnosticBlocks`. El ordenamiento final de las cards se rige por este campo descendente. Archivos: `diagnostic-types.ts` (contrato), `insight-engine.ts` (7 sitios de construcción + `computeImpactoUSDFromCandidate`), `diagnostic-actions.ts` (`enrichDiagnosticBlocks`).

**R120 — Conversores USD (`avgPrecioUnitario`, `metaPromedioUSD`) se derivan de `ctx.vendorAnalysis` en `computeImpactoUSDFromCandidate`. [ESTADO: ACTIVA]** Deuda futura: migrar a `domain-aggregations.ts` como `getConversoresUSD(sales, metas, selectedPeriod)` con `useMemo` deps `[sales, metas, selectedPeriod]` para cumplir R102 estricto. Por ahora `vendorAnalysis` provee suficiente aproximación y evita cambios en la interfaz pública de `BlockContext`.

---

## 25. Reglas del NarrativeBuilder (R111–R113)

Las reglas R111–R113 son garantizadas **por construcción** en `src/lib/narrative-builder.ts`. A diferencia de R68–R101 (que son invariantes a mantener o guards runtime), estas reglas son imposibles de violar si se usa la API de `NarrativeBuilder` — no hay post-hoc sanitizer equivalente.

**R111 — `addHechoPrincipal` como único punto de entrada para texto libre. [ESTADO: ACTIVA por construcción]**
- **Archivo:** `narrative-builder.ts` L230 (`addHechoPrincipal(text: string)`)
- **Qué garantiza:** todo texto plano que forma el hecho principal del bloque pasa por este método. El builder lleva internamente el estado de si ya se añadió un hecho principal (dedup incluido — si se llama dos veces, la segunda se ignora). Los builders legacy en `insight-engine.ts` que migraron a NarrativeBuilder usan solo este método para prosa libre.
- **Bug cerrado:** doble-hecho-principal en bloques con rescue B (el segundo `addHechoPrincipal` era silenciosamente ignorado en vez de concatenar texto suelto).

**R112 — `addAdvertenciaStock` requiere payload tipado: prohibido texto libre de stock. [ESTADO: ACTIVA por construcción]**
- **Archivo:** `narrative-builder.ts` L246 (`addAdvertenciaStock({ sku, clasificacion, dias, uds })`)
- **Qué garantiza:** cualquier mención de stock en la narrativa pasa por este método con payload `{ sku: string, clasificacion: string, dias: number, uds: number }`. Es imposible agregar texto "stock..." o "inventario..." libre — el tipo no lo acepta. El render de stock produce una cláusula normalizada con formato fijo.
- **Bug cerrado:** B5/B6 — stock agregado (la función anterior `buildStockNarrative` aceptaba texto preformateado, produciendo cláusulas con totales del grupo en vez de cifras del producto individual).

**R113 — `addCitaProducto` requiere `ValidatedProducto` con `validadoContraTop: true`. [ESTADO: ACTIVA por construcción]**
- **Archivo:** `narrative-builder.ts` L235 (`addCitaProducto(p: ValidatedProducto)`)
- **Qué garantiza:** el producto citado en la narrativa de un bloque debe pasar por `validateProductoContraTopList()` (R95) antes de ser pasado a `addCitaProducto`. El tipo `ValidatedProducto` tiene el campo discriminante `validadoContraTop: true` como literal — TypeScript rechaza en compilación cualquier objeto sin ese campo. Si el producto no valida contra el top-list, no se crea un `ValidatedProducto` y no se cita.
- **Bug cerrado:** citas de productos que no estaban en el top-3 real de un cliente (el motor construía cláusulas de producto a partir de búsquedas en arrays no validadas).

### Uso correcto de NarrativeBuilder

```typescript
const nb = new NarrativeBuilder()
nb.addHechoPrincipal('Vendedor X bajó 15% MoM.')
const vp = validateProductoContraTopList(nombre, topList)
if (vp) nb.addCitaProducto(vp)
nb.addAdvertenciaStock({ sku: 'SKU-001', clasificacion: 'crítico', dias: 3, uds: 12 })
const prose = nb.render() // string final con spacing y puntuación normalizados
```

Cualquier builder nuevo de prose debe usar `NarrativeBuilder`. Prohibido agregar free-text sanitizers — si hay un bug de formato, corregir en `addHechoPrincipal`/`addCitaProducto`/`addAdvertenciaStock` o en `render()`.

---

## 26. Fase Z.4 — Optimización de performance (R114–R117)

### Contexto

Fase Z.4 atacó los cuellos de botella del motor de insights. Todos los cambios están marcados con comentario `// [Z.4 — perf: cuello-N]` en el código. La secuencia de cards rendereadas debe ser idéntica antes y después — no se cambió ningún criterio de selección ni ranker.

**Pre-estado:**
- 3 pasadas separadas sobre `sales` en `filtrarConEstandar` (A4, A5, memberTxCounts+memberValues)
- `runInsightEngine` y `filtrarConEstandar` computaban `calcularPercentiles` + `calcularPareto` dos veces sobre el mismo array
- `buildRichBlocksFromInsights` se re-computaba en cada render de `candidatesToDiagnosticBlocks`
- Main loop evaluaba todos los miembros contra todos los insight types sin poda

---

### Cuello 2 — Una pasada sobre sales (MAYOR ROI) **[IMPLEMENTADO]**

**Problema:** `filtrarConEstandar` tenía 3 bucles separados sobre `sales`:
- A4: `clientProductMap` (toda la historia, para coMatrix)
- A5: `byMonth` (toda la historia, para churnBaseline)
- `memberTxCounts + memberValues` (solo período seleccionado)

En 100k ventas = ~300k+ iteraciones extra por render donde `_filteredCandidates` se invalida.

**Solución:**
- `getAgregadosParaFiltro(sales, selectedPeriod)` en `domain-aggregations.ts` — **una sola pasada** que construye los 5 mapas simultáneamente.
- `filtrarConEstandar` acepta `agregados?: AgregadosFiltro` en su `contexto`. Si llega, no itera sales. Si no, llama `getAgregadosParaFiltro` internamente (backward compat, cero duplicación).
- En `EstadoComercialPage.tsx`, nuevo `_agregadosFiltro = useMemo(..., [sales, selectedPeriod])` — solo se re-computa cuando cambia el dataset o el período, no cuando cambian los candidatos.

**Regla nueva:**

**R114 — `getAgregadosParaFiltro` es el único punto de cómputo de mapas base de sales para `filtrarConEstandar`. [ESTADO: ACTIVA]** Archivo: `domain-aggregations.ts`. Recibe `(sales, selectedPeriod)`, devuelve `AgregadosFiltro`. Prohibido agregar nuevos bucles sobre `sales` raw dentro de `filtrarConEstandar` — si se necesita un nuevo mapa, añadirlo a `AgregadosFiltro` y a `getAgregadosParaFiltro`. Las 3 pasadas anteriores (A4, A5, memberTxCounts) quedan como referencia histórica en el historial — en el código solo existe la función unificada.

---

### Cuello 4 — Stats pre-computadas entre motor y filtro **[IMPLEMENTADO]**

**Problema:** `runInsightEngine` devuelve los candidatos seleccionados. `filtrarConEstandar` recibe esos mismos candidatos y re-computa `calcularPercentiles` + `calcularPareto` sobre el mismo array.

**Solución:**
- `InsightCandidate` tiene campo opcional `_stats?: { percentiles, paretoList, candidateCount }` (campo interno, prefijo underscore).
- Al final de `runInsightEngine`, antes de `return selected`, se calcula `_stats` y se adjunta a `selected[0]`.
- En `filtrarConEstandar` A1/A2, si `candidates[0]._stats.candidateCount === candidates.length`, se reusa. Si no (candidatos modificados externamente), se recalcula.

**Regla nueva:**

**R115 — `_stats` en `InsightCandidate[0]` como caché de pipeline. [ESTADO: ACTIVA]** Solo válido si `_stats.candidateCount === candidates.length`. `filtrarConEstandar` siempre verifica esta condición antes de reusarlo. No acceder a `_stats` desde UI — prefijo `_` indica campo interno de pipeline.

---

### Cuello 1 — Poda Pareto en main loop **[IMPLEMENTADO CONSERVADORAMENTE]**

**Problema:** para cada `(dim, metric)`, el main loop evalúa TODOS los miembros contra TODOS los insight types, aunque la mayoría de los miembros no representan volumen significativo.

**Solución:**
- Campo `prunable?: boolean` añadido a `InsightTypeDef` en `insight-registry.ts`.
- Solo `dominance` tiene `prunable: true` — es el único tipo donde ser Pareto es condición necesaria para el insight (no puedes "dominar" si no tienes volumen).
- `change`, `trend`, `proportion_shift`: **no podados** — miden % de cambio, independiente del volumen. Un vendedor pequeño con 80% de caída es un insight legítimo.
- `contribution`, `correlation`, `meta_gap`: **no podados** — necesitan el grupo completo.
- En DEV, log `[Z.4] pareto skipped: N / M (dim×metric)` cuando se salta evaluaciones.

**Regla nueva:**

**R116 — `prunable: true` solo para insight types que miden VOLUMEN ABSOLUTO. [ESTADO: ACTIVA]** Tipos elegibles: `dominance` (y potencialmente futuros tipos de ranking de cuota). NO elegibles: cualquier tipo que detecte cambio relativo, tendencia porcentual, correlación, contribución contrafactual, o gaps contra metas. Si se añade un tipo nuevo al registry, la decisión de `prunable` debe justificarse explícitamente.

---

### Cuello 3 — `buildRichBlocksFromInsights` memoizado **[IMPLEMENTADO]**

**Problema:** `candidatesToDiagnosticBlocks` llamaba `buildRichBlocksFromInsights(insights, vendorAnalysis)` internamente en cada render, aunque `insights` y `vendorAnalysis` raramente cambian entre renders del mismo período.

**Solución:**
- `buildRichBlocksFromInsights` exportada (antes era función privada).
- `candidatesToDiagnosticBlocks(candidates, ctx, prebuiltLegacyBlocks?)` — tercer argumento opcional. Si llega, lo usa; si no, computa internamente (backward compat).
- En `EstadoComercialPage.tsx`, nuevo `_legacyBlocks = useMemo(..., [insights, vendorAnalysis])`. Se pasa como tercer argumento a `candidatesToDiagnosticBlocks`.

**Regla nueva:**

**R117 — `buildRichBlocksFromInsights` no puede tener efectos secundarios ni estado mutable. [ESTADO: ACTIVA]** Al exportarla, garantizar que sea pure function: mismos inputs → mismos outputs. El estado mutable (`used`, `mark`, `remaining`) es local al call. Cualquier cache externa (useMemo) depende de esta pureza.

---

### Cuello 5 — Selector final O(n²) **[DESCARTADO — ACOTADO]**

El selector de diversidad (greedy ranker) en `runInsightEngine` es O(n²) en candidatos. Medición: el pool después de dedup tiene típicamente 50–80 candidatos únicos; el ranker selecciona 12. Total de comparaciones: 12 × 65 ≈ 780. Equivalente a microsegundos. No hay beneficio en refactorizar — la lógica de penalización acumulativa (depende del estado de selección en curso) hace imposible un sort-once approach sin cambiar el comportamiento.

**Documentado como:** acotado por diseño. Revisar solo si el número de candidatos únicos supera 200 (requeriría >200 dimensiones/miembros/tipos, que excede el modelo de datos actual).

---

### Cuello 6 — useMemo split **[YA ESTABA HECHO]**

Los 3 useMemos encadenados (`_insightCandidates`, `_filteredCandidates`, `diagnosticBlocks`) ya estaban implementados desde la sesión anterior (Fase Z.3/auditoría). No se tocó.

### Cuello 7 — Guards DEV-only **[YA ESTABA HECHO]**

`import.meta.env.DEV` en R99/R100 y skip de `vendor-*` en R100 ya estaban implementados en `diagnostic-actions.ts` L295–L317. No se tocó.

### Gap 5 — V1–V14 en código **[YA ESTABA HECHO]**

Los labels `// V1 — filtro-ruido` … `// V14 — indicador-anticipado` ya existían en `filtrarConEstandar` (L2605, L2631, L2646, L2657, L2671, L2694, L2719, L2766, L2789, L2793, L2805, L2836, L2869, L2887). No se tocó. §16 del manifiesto y el código están sincronizados.

---

## 27. Fase Z.5 — Fusión real de motores (R118–R120)

### Contexto

Auditoría del demo reveló que el motor viejo (`insightEngine.ts`, camelCase, ~2445 líneas) producía ~$89k USD de insights por render pero **0% llegaba a pantalla**: tres filtros silenciosos los eliminaban antes del render.

### Frente 1 — Adaptador reparado

**Problema 1 — umbral de protagonista:** `buildRichBlocksFromInsights` exigía ≥3 insights por vendedor. El motor viejo produce típicamente 1 insight por vendedor → 0 protagonistas → 0 vendor-cards.

**Solución:** Umbral bajado a ≥1, compensado con filtro de impacto mínimo $500 USD por item. Vendedores sin ningún item ≥$500 no generan bloque (evita bloques vacíos de contenido).

**Problema 2 — secciones muertas:** Los filtros de `concentracion` y `looseClients` buscaban patrones nunca emitidos por el motor viejo (`detector === 'dependencia_vendedor'`, `id.startsWith('monocat')`, `tipo === 'riesgo_cliente'`).

**Solución:** Filtros reemplazados con prefijos reales: `concentracion*`, `grupo-concentracion`, `cartera-pequeña-*`, `depto-caida-*` para concentración; `i.cliente && !i.vendedor` para clientes sueltos.

**Problema 3 — doble recorte:** `.slice(0, 6)` al final de `buildRichBlocksFromInsights` + `.slice(0, 12)` en `candidatesToDiagnosticBlocks`. El primer recorte eliminaba candidatos de alto impacto antes de la competencia final.

**Solución:** `.slice(0, 6)` eliminado. Solo queda el `.slice(0, 12)` en `candidatesToDiagnosticBlocks`.

**Problema 4 — product filter incompleto:** El filtro de productos solo miraba `tipo === 'riesgo_producto'`, ignorando `riesgo_inventario`, `sustitucion-*`, `co-declive-*`, `producto-oportunidad-*`.

**Solución:** Filtro extendido a todos esos tipos/prefijos.

### Frente 2 — `impactoUSD` como criterio rector

**Problema:** `computeSortKey` parseaba texto de `summaryShort` para extraer delta. Cards de $23k de desabasto competían contra cards de −986 uds usando score estadístico arbitrario.

**Solución:** `impactoUSD: number` agregado como campo obligatorio a `DiagnosticBlock`. Los 7 sitios de construcción lo populan. `enrichDiagnosticBlocks` usa `impactoUSD > 0` como sortKey primario; fallback × 0.5 para correlation y no-monetizables.

**Estado post-Z.5 del motor viejo:** pasa de inerte (0% render) a contribuidor activo. Vendor-cards, product-cards de inventario, y concentration-cards del motor viejo compiten en el pool final de 12 ordenadas por impacto USD.

### Deuda para Z.6+

- `mergeCandidates()` formal con `backupCandidate`: candidatos del motor viejo y del nuevo que cubren la misma entidad deberían fusionarse en un bloque único más rico.
- Diversificación top-k: garantizar cobertura de dimensiones (vendedor × producto × inventario × cliente) en el top-8.
- `getConversoresUSD` en `domain-aggregations.ts` para cumplir R102 estricto (R120).
- Causa raíz histórica con ventana de 6 meses.

---

## 28. Fase Z.6 — Render Rate Recovery (v2.4.0-pre)

### Contexto

Post-Z.5: el motor viejo produce 11 insights con pool $89,031 USD para el demo. Solo 2 cards llegan a pantalla (ratio 32.2%). El problema raíz post-Z.5: los builders ricos colapsan grupos con impactos heterogéneos en una sola card; además, varios tipos de insight (`cartera-pequeña`, `meta-riesgo`) no disparan ningún bullet en `buildRichVendorSection`, produciendo secciones vacías que el filtro final elimina.

### §28.1 — Frente 1: Heterogeneity Split + Fallback Bullet

**R121 — `analizarHeterogeneidad`** (`insightStandard.ts`)

Un grupo de insights es heterogéneo cuando el insight de mayor impacto supera al mediano por un factor ≥ 3× **y** el máximo es ≥ $1,000 USD. Umbral dual: el ratio captura dispersión relativa, el mínimo absoluto evita splits sobre cantidades marginales.

```
esHeterogeneo = (max / mediana ≥ 3) AND (max ≥ 1000)
```

**Patrón aplicado a los 5 Rich builders:**

Cada builder se refactoriza en dos funciones:
- `buildSingle*Card(items, idSuffix = '')` — cuerpo original, produce un `DiagnosticBlock` con `id = 'base' + idSuffix`.
- `buildRich*Section(items)` — wrapper que llama `analizarHeterogeneidad`; si es heterogéneo, emite card separada para el outlier y otra (`-resto`) para los demás. Retorno `DiagnosticBlock | DiagnosticBlock[]`.

**Fallback bullet en `buildSingleVendorCard`:** si el `NarrativeBuilder` queda sin cláusulas después de todos los matchers específicos (ningún patrón reconoció el tipo del insight), se emite el `titulo` de cada insight como bullet genérico. Esto cubre tipos `cartera-pequeña-*`, `meta-riesgo-*` y cualquier otro tipo futuro no explícitamente mapeado.

**`pushBlocks` helper** en `buildRichBlocksFromInsights`: los 5 call-sites actualizan de `blocks.push(buildRich*(…))` a `pushBlocks(blocks, buildRich*(…))`, soportando el nuevo tipo de retorno unión.

**Archivos modificados:**
- `src/lib/insightStandard.ts` — nueva función `analizarHeterogeneidad` exportada (R121)
- `src/lib/insight-engine.ts` — 5 builders refactorizados + `pushBlocks` + fallback bullet
- `docs/MANIFIESTO-MOTOR-INSIGHTS.md` — §28 agregado

**Deuda para Z.6 F3–F4:**
- F3 (R124, R125): floor mínimo + urgencia como desempate
- F4 (R126): `impactoRecuperable` opcional

**Historial:** v2.4.0-pre — Z.6 F1: heterogeneity split en Rich builders + fallback bullet para tipos no mapeados

---

### §28.2 — Frente 2: Huérfanos, hidratación de positivos y headline fix (v2.4.0-pre Z.6 F2)

**Contexto:** Tras F1, el ratio pool→render era 61.7% ($54,904 de $89,031). Tres problemas medidos:
1. Card de positivos tenía `impactoUSD: 0` aunque los insights tenían `impacto_economico.valor`.
2. Insights `equipo-contexto-*`, `canal-contexto-*`, `señal-temprana-*` no matcheaban ningún builder → pérdida silenciosa.
3. Cards de vendor con prefijos `cartera-pequeña-`, `meta-riesgo-`, `grupo-concentracion` caían al fallback `"{vendedor} bajo presión"`.

**R119.1 — Hidratación de impactoUSD para positivos** (`buildSinglePositiveCard`)

`impactoUSD` es magnitud absoluta; el signo semántico vive en `esPositivo`. La card de positivos ahora suma `Math.abs(impacto_economico.valor)` de todos sus items.

```
impactoUSD = Σ |impacto_economico.valor| para cada insight positivo
```

**R122 — Orphan routing** (`buildRichOrphanSection`, `buildSingleOrphanCard`)

Garantía de completeness: todo insight que no matchea ninguno de los 5 builders específicos (vendor, product, concentración, clients, positive) se rutea a `buildRichOrphanSection`. Si el grupo es heterogéneo (R121), el outlier obtiene card separada y el resto se agrupa en `-resto`. Cero pérdidas silenciosas.

```
orphans = remaining() after Steps 1–5
if orphans.length > 0 → buildRichOrphanSection(orphans)
```

**R123 — Headlines específicos de vendor** (`buildSingleVendorCard`)

El switch de prefijos se amplía:
- `meta-riesgo-` → mapeado igual que `meta-peligro-` (lejos de su meta)
- `cartera-pequeña-` → `"{vendedor} con cartera muy pequeña"`
- `grupo-concentracion` / `concentracion-` → `"{vendedor}: cartera concentrada en pocos clientes"`
- Sin prefijo reconocido → fallback al `titulo` del insight de mayor impacto; nunca "bajo presión"

**Archivos modificados:**
- `src/lib/insight-engine.ts` — R119.1 en `buildSinglePositiveCard`, R122 en `buildRichBlocksFromInsights` + dos nuevas funciones, R123 en `buildSingleVendorCard`
- `docs/MANIFIESTO-MOTOR-INSIGHTS.md` — §28.2 agregado

**Nota R119.2 (Z.6 F2.1):** R119.1 hidrataba `impactoUSD` a nivel de `DiagnosticBlock` (card). R119.2 hidrata a nivel de `Insight` crudo al inicio de `buildRichBlocksFromInsights`. Idempotente: no sobreescribe si ya está seteado. Degrada a `undefined` (no `0`) si falta `impacto_economico.valor`. Campo `impactoUSD?: number` agregado a la interfaz `Insight` en `src/types/index.ts`.

**Historial:** v2.4.0-pre — Z.6 F2: orphan routing, positive hydration, headline specialization | v2.4.2-pre — Z.6 F2.1: hydration a nivel Insight crudo (R119.2)

---

### §28.3 — Frente 2.2: Deprecación de detectores no accionables (v2.4.1-pre)

**Contexto:** Post-F2, los detectores `cartera-pequeña` y `concentracion` dominaban el pool con ~$42,644 USD (Sandra $22,396, Ana+Patricia $11,240, Miguel $9,008). Decisión de producto: estos insights no son accionables sin contexto de ruta/estructura comercial. Un vendedor puede tener pocos clientes por diseño de zona, o 2 clientes mayoristas como modelo de negocio.

**R126 — Detectores cartera-pequeña y concentracion → LEGACY**

Los detectores `vendedorConcentracion` y `vendedorCarteraPequeña` quedan en el código como referencia pero no se invocan en `runInsightEngine`. Sus llamadas en `candidatos.push()` están comentadas con trace `[Z.6 F2.2 — deprecation]`.

Las funciones y builders asociados se conservan íntegros para historial. No generan insights en runtime.

**Archivos afectados:**
- `src/lib/insightEngine.ts`: llamadas comentadas (L3364, L3368), funciones marcadas LEGACY (L1183, L1391), bloque grupo-concentracion marcado no-op (L2762), PREF_ID entries anotados
- `src/lib/insight-engine.ts`: `buildSingleConcentracionCard` marcada LEGACY, Step 3 comentado, `hasCartera`/`hasConcentracion` eliminados del headline switch
- `docs/MANIFIESTO-MOTOR-INSIGHTS.md` — §28.3 agregado

**Efecto en pool:** Pool esperado ~$89k − $42k = ~$47k. Ratio pool→render sube porque los insights reales (inventario, depto-caida, meta-riesgo, equipo-contexto) ya no compiten contra el ruido de concentración/cartera.

**Nota sobre depto-caida:** Antes era procesado en Step 3 junto a concentración. Ahora cae al Step 6 (orphan builder R122), manteniéndose visible.

**Historial:** v2.4.1-pre — Z.6 F2.2: deprecación definitiva de cartera-pequeña y concentracion (legacy)

---

### §29.1 — Tanda 1: 4 tipos nuevos + templates migrados (Z.7 T1)

**R132 — Nuevos tipos en INSIGHT_TYPE_REGISTRY**

Cuatro tipos añadidos al final de `INSIGHT_TYPE_REGISTRY` en `insight-registry.ts`:

| id | detector viejo | archivo | línea |
|----|----------------|---------|-------|
| `stock_risk` | `inventarioDesabasto` | insightEngine.ts | L963 |
| `stock_excess` | `inventarioSobrestock` | insightEngine.ts | L2499 |
| `migration` | `productoSustitucion` | insightEngine.ts | L2157 |
| `co_decline` | `productoCoDeclive` | insightEngine.ts | L2258 |

Los tipos `stock_risk` y `stock_excess` tienen `needsInventario: true` — el main loop `dim × metric` los salta; se activan en el pase de inventario 3D. Los tipos `migration` y `co_decline` tienen `needsPrevValue: true` — también se activan en 3D (no en el main loop, para evitar colisión con el producto-dimensión regular).

La interfaz `DataPoint` fue extendida con `extra?: Record<string, unknown>` para transportar metadatos por punto (diasCobertura, categoria, clientes, etc.).

La firma `detect` fue extendida a `(points: DataPoint[], ctx?: Record<string, unknown>)` para recibir `umbralVenta` y otros contextos externos.

`InsightTypeDef` fue extendida con `needsInventario?: boolean`.

**R133 — NARRATIVE_TEMPLATES preservan calidad del motor viejo**

El mapa `NARRATIVE_TEMPLATES` en `insight-engine.ts` contiene una función por tipo que replica literalmente el copy del motor viejo:
- `stock_risk` → copia de L1021–L1058 de `insightEngine.ts`
- `stock_excess` → copia de L2530–L2557
- `migration` → copia de L2210–L2251
- `co_decline` → copia de L2364–L2409
- `meta_gap` → versión simplificada de `vendedorMetaRiesgo` L696–L707

Los templates se aplican en dos sitios:
1. **Pase 3D** (inventario): candidatos stock_risk, stock_excess, migration, co_decline construidos desde YTD product aggregates
2. **Loop principal**: cualquier tipo con template (actualmente `meta_gap`) sobreescribe el output de `buildText`

Los campos `conclusion` y `accion` (nuevos en `InsightCandidate`) almacenan la narrativa rica del template.

**Motor viejo NO apagado en esta tanda.** Duplicados son esperados temporalmente. Tanda 3 decidirá el switch.

---

## §29.2 — Tanda 2: Motor 2 completo (Z.8)

**Baseline runtime post-Z.8 (datos demo: 93,013 filas, 8 vendedores, 18 meses):**

| Builder | Telemetría |
|---------|------------|
| `buildChangePointBlocks` | cells_evaluated:28, series_with_data:234, candidates_found:61 |
| `buildSteadyShareBlocks` | cells_evaluated:14, series_with_data:156, candidates_found:3 |
| `buildCorrelationBlocks` | pairs_evaluated:4, series_with_data:76, candidates_found:0 (correcto con datos sintéticos — activa con datos reales) |
| `buildMetaGapTemporalBlocks` | vendedores_con_meta:8, declining_found:2, structural_found:2, candidates_found:3 |
| Motor 2 ranker | candidates_total:14, blocks_final:11 |

**ALWAYS_PROTECTED_CAPS (no modificar sin verificación runtime):**
```
outlier: 1 | change_point: 2 | steady_share: 1 | correlation: 1 | meta_gap_temporal: 2
```

**DIMENSION_REGISTRY** — campo `supports` por insight type:
```
vendedor:     change_point, steady_share, outlier, correlation
producto:     change_point, steady_share, outlier
categoria:    change_point, steady_share, outlier
canal:        change_point, steady_share, outlier
departamento: change_point, steady_share, outlier
supervisor:   change_point, steady_share, outlier
cliente:      change_point, steady_share, outlier, correlation
```

**METRIC_REGISTRY** — campo `compatibleInsights`:
```
venta:              steady_share
unidades:           change_point, steady_share, outlier, correlation
ticket_promedio:    change_point, outlier, correlation
precio_unitario:    change_point, outlier, correlation
frecuencia_compra:  change_point, outlier, correlation
ventas_por_cliente: outlier
```

**Umbrales post-FIX.10:**
- Steady Share: `SS_MIN_MONTHS`:4, `SS_STABLE_WINDOW`:3, `SS_STABLE_CV`:0.25, `SS_MIN_SHIFT`:0.05
- Correlation: `CORR_MIN_MONTHS`:5, `CORR_R_THRESHOLD`:-0.50, `CORR_R_STRONG`:-0.75, banda ALTA:-0.65
- MetaGap: `MGT_CRITICAL_PCT`:50, `MGT_HIGH_PCT`:70, `MGT_DECLINING_N`:3, `MGT_STRUCTURAL_N`:4, `MGT_STRUCTURAL_GAP`:15

**Regla operativa Z.8:** Para agregar nueva dimensión → 1 línea en `DIMENSION_REGISTRY` con campo `supports`. Para agregar nueva métrica → 1 entrada en `METRIC_REGISTRY` con campo `compatibleInsights`. Los 5 builders la recogen automáticamente. No tocar builders.

**Nota H24 (bug corregido):** `buildMetaGapTemporalBlocks` recibe `selectedPeriod: { year, month }` (month 0-indexed). El builder calcula `ymCutoff = _ym(year, month + 1)` y salta con `if (ym > ymCutoff) continue` para excluir meses futuros donde ventas=0 activaría patrones falsos.

## §30. Frente Z.9 — Cierre del Motor hacia Decisión Ejecutiva (v2.7.0)

### Objetivo

Evolucionar el motor de insights de "detector de patrones + ranker" a "motor de decisión ejecutiva con causalidad y compresión". El resultado es `decision-engine.ts` — un módulo independiente sin dependencias circulares que agrupa candidatos en cadenas causales y problemas ejecutivos.

### Fases implementadas

| Fase | Descripción | Archivos |
|------|-------------|----------|
| Z.9.1 | Campos opcionales ejecutivos en `InsightCandidate` | `insight-engine.ts` |
| Z.9.2 | Hidratación `hydratarCandidatoZ9` — impacto, dirección, time_scope | `insightStandard.ts`, `insight-engine.ts` |
| Z.9.3a | Migración `InsightChain` → `DiagnosticBlockChain` (liberación del nombre) | `diagnostic-types.ts`, `insightStandard.ts`, `insight-engine.ts`, `diagnostic-actions.ts` |
| Z.9.3 | `buildInsightChains` — causal linking por `root_problem_key` | `decision-engine.ts` (nuevo) |
| Z.9.4 | `buildExecutiveProblems` — compresión ejecutiva de chains | `decision-engine.ts` |
| Z.9.5 | Pipeline wired en `EstadoComercialPage` + `EXECUTIVE_COMPRESSION_ENABLED=false` | `EstadoComercialPage.tsx` |
| Z.9.6 | `calcularRenderPriorityScore` [R143] + cap `MAX_EXECUTIVE_PROBLEMS_SHOWN=7` | `insightStandard.ts`, `decision-engine.ts` |
| Z.9.7 | `EngineStatusReport` — hardening por detector | `insight-engine.ts` |

### R134 — Campos ejecutivos opcionales en InsightCandidate

Todos los campos Z.9 son opcionales (`?`) o nullables. Builders existentes no se modifican. Consumidores manejan `null` sin crashear. Default implícito cuando ausente: numéricos → null, arrays → [], `time_scope` → "unknown", `direction` → "neutral".

### R135 — calcularImpactoValor por tipo

`insightStandard.ts::calcularImpactoValor()` implementa una tabla de 17 insightTypes con sus fórmulas de extracción de `impacto_valor` (magnitud en USD o uds). Si no hay insumo claro → `null`. La función NO llama al LLM — es determinística.

### R136 — calcularImpactoRecuperableCandidato

Delegada a `calcularImpactoValor` para tipos `trend`, `change`, `contribution`, `meta_gap`, `co_decline`, `stock_risk`. Explícitamente `null` para `dominance`, `correlation`, `steady_share`, `outlier`, `seasonality`.

### R137 — Semántica direction vs DiagnosticBlock.direccion

`InsightCandidate.direction ∈ {up, down, neutral}` = dato estadístico del patrón.
`DiagnosticBlock.direccion ∈ {recuperable, positivo, neutral}` = framing narrativo para recuperabilidad.
El mapeo no es 1:1. No mezclar las dos semánticas.

### R138 — computeImpactoUSDFromCandidate prioriza impacto_valor

En `insight-engine.ts::computeImpactoUSDFromCandidate`, si el candidato tiene `impacto_valor != null` y la métrica es USD-directa, ese valor tiene prioridad sobre el cálculo legacy del detalle.

### R139 — MIN_CONTRIBUTION_TO_PARENT_PCT = 0.05

Contribución mínima del candidato hijo respecto al candidato padre para incluirse en una `InsightChain`. Solo aplica cuando ambos tienen `impacto_valor` no-null. Si cualquiera es null, el nodo se incluye de todas formas (inclusión defensiva).

### R140 — MAX_CHAIN_DEPTH = 4

Profundidad máxima del árbol causal. Nivel 0 = root, nivel 1 = cause, nivel 2 = subcause, nivel 3+ = support.

### R141 — MAX_CANDIDATES_PER_CHAIN = 8

Candidatos máximos por cadena antes del corte. Los candidatos se ordenan por `render_priority_score` (R143) antes del corte.

### R142 — MAX_EXECUTIVE_PROBLEMS_SHOWN = 7

Problemas ejecutivos máximos retornados por `buildExecutiveProblems`. El corte ocurre después del ordenamiento por severity desc → totalImpactUSD desc.

### R143 — render_priority_score determinístico

Formula en `calcularRenderPriorityScore` (insightStandard.ts):
```
score = (sev_w*0.4 + scope_w*0.2 + impact_norm*0.3 + raw_score*0.1) * dir_mult
```
donde:
- `sev_w ∈ {CRITICA:4, ALTA:3, MEDIA:2, BAJA:1}`
- `scope_w ∈ {ytd:4, mtd:3, rolling:2, monthly:1, unknown:0}`
- `impact_norm = min(1, |impacto_valor| / 50_000)`
- `dir_mult ∈ {down:1.2, up:0.9, neutral:1.0}`

No exponer el número en UI.

### R144 — buildRootProblemKey

Formato: `{direction}:{dimensionId}:{time_scope}`. Ej: `"down:vendedor:ytd"`.
Agrupa candidatos que comparten dirección + dimensión + alcance temporal. `buildInsightChains` la asigna a candidatos que no la tienen.

### R145 — EngineStatusReport

`getLastInsightEngineStatus()` retorna el último `EngineStatusReport` generado por `runInsightEngine`. Campos por detector: `result ∈ {ok|partial|failed|skipped}`, `candidatesEmitted`, `error?`. Útil para telemetría y debugging en DEV.

### R146 — EXECUTIVE_COMPRESSION_ENABLED

Constante `false` en `decision-engine.ts`. El panel ejecutivo se renderiza solo cuando es `true`. Los useMemos de `_insightChains` y `_executiveProblems` en `EstadoComercialPage` cortocircuitan a `[]` cuando el flag es false — costo computacional nulo en producción actual.

---

## Legacy diferido

### Backend Python Forecast Engine

En `/backend/` existe una app FastAPI (`SalesFlow Forecast Engine v1.0.0`) con endpoints `/api/v1/health`, `/api/v1/chat` y `/api/v1/forecast`. **No está conectada al frontend activo.** El forecast que se muestra en `RendimientoPage` proviene del Worker off-thread + `insight-engine.ts`, 100% en navegador.

Ver documento dedicado: **[/docs/LEGACY-PYTHON-FORECAST.md](./LEGACY-PYTHON-FORECAST.md)** para inventario completo, contrato del endpoint, stack, riesgos y criterios de retoma.

**Regla de este manifiesto:** ninguna fase del Frente Z (ni posteriores del motor de insights) toca `/backend/`. Cualquier modificación al backend Python requiere fase dedicada fuera del Frente Z. Si alguien arranca `uvicorn main:app` hoy, el router `forecast` rompe al cargar por imports faltantes — esto es conocido y parte del estado legacy.

Reglas R-LEGACY-1 a R-LEGACY-6 aplicables al retomar el frente están en el doc dedicado.
