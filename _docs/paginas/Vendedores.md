---
title: Vendedores
tags: [pagina, analisis]
ruta: /vendedores
loc: 814
updated: 2026-03-29
---

# Vendedores — Tabla Jerárquica

**Ruta**: `/vendedores`
**LOC**: 814
**IA**: No (VendedorPanel puede tener IA)

## Datos que consume
`vendorAnalysis`, `insights`, `dataAvailability`, `isProcessed`, `sales`, `selectedPeriod`, `clientesDormidos`, `configuracion`, `supervisorAnalysis`, `dataSource`

## Secciones UI
1. **Header status chips** — badges conteo por estado: critico / riesgo / ok / superando (clickeables)
2. **Filter bar** — búsqueda texto, estado, canal, métrica
3. **Supervisor group headers** — expandibles cuando `has_supervisor`, stats por zona
4. **Vendor table** — columnas: Vendedor, YTD Act., YTD Ant., Var, Var%, Peso%, Meta% (condicional), Alertas, Estado, flecha → VendedorPanel
5. **Totals row** — agregados filtrados
6. **VendedorPanel** — slide-over al click en fila

## Filtros
- Búsqueda texto por nombre vendedor
- Estado: `all | critico | riesgo | ok | superando` (URL-driven via `?filter=`)
- Canal dropdown (dinámico desde `sales`)
- Métrica: `unidades | dolares` (solo si `has_venta_neta`)
- Column sort: vendedor, ytd, ytd_ant, var, var_pct, peso, meta, alertas, estado, impacto

## Integración IA
Ninguna directamente. El VendedorPanel (slide-over) puede contener análisis.

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[EstadoComercial]]
