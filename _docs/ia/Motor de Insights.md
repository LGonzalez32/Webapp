---
title: Motor de Insights
tags: [ia, insights, analisis]
updated: 2026-03-29
---

# Motor de Insights — 22 Detectores

Archivo: `src/lib/insightEngine.ts`
Ejecutado por: `analysisWorker.ts` (Web Worker)
Prioridades: CRITICA > ALTA > MEDIA > BAJA

## Flujo

```
useAnalysis hook → isProcessed === false
  → analysisWorker.postMessage(sales, metas, inventory, config)
  → buildSaleIndex() → compute*() → generateInsights()
  → 22 detectores ejecutados con fechaReferencia = max(sales.fecha)
  → insights[] ordenados por prioridad → store
  → Renderizados en [[EstadoComercial]] feed
```

## Detectores

### Riesgo Vendedor (8)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 1 | Meta en peligro | CRITICA | proyeccion < meta × 0.85 |
| 3 | Vendedor deteriorado | CRITICA/ALTA | Caída YTD + semanas bajo promedio |
| 4 | Patrón sub-ejecución | ALTA | ≥3 meses consecutivos bajo meta |
| 9 | Vendedor mono-categoría | MEDIA | 1 categoría > 80% de sus ventas |
| 14 | Supervisor zona riesgo | CRITICA/ALTA | Zona con riesgo agregado |
| 16 | Superando meta | BAJA | Cumplimiento > 110% |
| 17 | Mejor momento | BAJA | Mejor período histórico del vendedor |
| 18 | Dependencia vendedor | ALTA/MEDIA | 1 vendedor > 50% de un canal |

### Riesgo Equipo (1)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 2 | Estado meta equipo | CRITICA/ALTA | ratio equipo < 90% / 99% |

### Riesgo Cliente (3)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 5 | Clientes en riesgo | ALTA | Dormidos + declive ≥ 30% |
| 6 | Concentración cartera | CRITICA/ALTA | Top 3 clientes > 60% ventas |
| 7 | Cliente nuevo activo | BAJA | Primera compra en período reciente |

### Riesgo Producto (3)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 8 | Productos en riesgo | ALTA | Sin movimiento + caída > 25% |
| 10 | Producto en crecimiento | BAJA | Crecimiento > 50% |
| 15 | Categoría en colapso | CRITICA | Tendencia colapso + alto impacto |

### Cruzados (3)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 11 | Doble riesgo | CRITICA | Vendedor crítico + dormido alto valor |
| 12 | Caída explicada | CRITICA | Caída significativa + causa identificable |
| 13 | Cliente dormido × inventario | ALTA | Dormido compraba productos ahora lentos |

### Hallazgos (4)

| # | Nombre | Prioridad | Condición |
|---|--------|-----------|-----------|
| 19 | Migración canal | MEDIA | Canal desaparecido respecto a período anterior |
| 20 | Outlier variación | ALTA/MEDIA | Variación > ±2 desviaciones estándar |
| 21 | Causa raíz compartida | ALTA | ≥2 vendedores cayendo en mismo canal |
| 22 | Oportunidad no explotada | MEDIA | Producto alto volumen, 0 ventas en depto |

## Insights con impacto económico

Solo se calculan si `has_venta_neta === true`:
- #1 Meta en Peligro
- #9 Concentración Sistémica (referenciado como #6)
- #15 Equipo No Cerrará Meta (referenciado como #2)
- #19 Doble Riesgo (referenciado como #11)
- #20 Caída Explicada (referenciado como #12)

## Fecha referencia

`fechaReferencia = max(sales.fecha)` — NUNCA `new Date()`.
Propagada a todos los detectores para cálculos consistentes.

Ver: [[EstadoComercial]], [[System Prompt]]
