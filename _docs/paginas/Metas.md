---
title: Metas
tags: [pagina, analisis, metas]
ruta: /metas
loc: 271
updated: 2026-03-29
---

# Metas — Cumplimiento

**Ruta**: `/metas`
**LOC**: 271
**IA**: No
**Guard**: Redirect a `/dashboard` si `!has_metas`

## Datos que consume
`sales`, `metas`, `dataAvailability`, `selectedPeriod`, `configuracion`, `vendorAnalysis`

## Secciones UI
1. **Header** — título, badge período actual
2. **Team progress card** — meta total equipo, real total, cumplimiento %, progress bar
3. **Vendor matrix table** — filas: cada vendedor de `metas`; columnas: últimos 6 meses (ventana deslizante); cada celda: real vs meta + CumplimientoBadge (≥100% verde, ≥80% amarillo, <80% rojo); mes actual destacado

## Filtros
Ninguno. Período heredado del global `selectedPeriod`.

## Integración IA
Ninguna.

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]]
