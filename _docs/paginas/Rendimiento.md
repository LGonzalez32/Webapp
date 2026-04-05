---
title: Rendimiento
tags: [pagina, analisis, pivot]
ruta: /rendimiento
loc: 847
updated: 2026-03-29
---

# Rendimiento — Pivot Table + Chart YoY

**Ruta**: `/rendimiento`
**LOC**: 847
**IA**: No (forecast backend deshabilitado)

## Datos que consume
`sales`, `metas`, `dataAvailability`, `selectedPeriod`, `configuracion`, `forecastData`, `forecastChartLoading`, `setForecastData`, `setForecastChartLoading`, `dataSource`

## Secciones UI
1. **Metric/filter bar** — métrica, año, vendedor, cliente/canal/producto dropdowns, budget toggle
2. **YTD KPI cards** — 4 cards: YTD actual, YTD anterior, variación %, proyección anual
3. **Annual trend chart** — ComposedChart (Line+Area) año actual vs anterior, línea meta opcional, forecast series (deshabilitado: `FORECAST_BACKEND_ENABLED = false`)
4. **Pivot configurator** — pills arrastrables (dnd-kit), presets, column toggles, subtotals toggle
5. **Pivot table** — computada via Web Worker (`pivotWorker.ts`), filas expandibles en árbol, columnas sorteables

## Filtros
- Métrica: `unidades | venta_neta`
- Año selector (todos los años en `sales`)
- Vendedor selector (todos + cada vendedor)
- Cliente selector (condicional `has_cliente`)
- Canal selector (condicional `has_canal`)
- Producto selector (condicional `has_producto`)
- Budget line toggle
- Pivot dimensions: drag-reorderable (mes, vendedor, canal, cliente, producto)
- Dims persistidas en `localStorage` key `sf_pivot_dims`
- Column visibility toggles + subtotals toggle

## Integración IA
Ninguna. El forecast backend está explícitamente deshabilitado.

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Backend]]
