---
title: Rotacion
tags: [pagina, analisis, inventario]
ruta: /rotacion
loc: 436
updated: 2026-03-29
---

# Rotación — Clasificación Inventario PM3

**Ruta**: `/rotacion`
**LOC**: 436
**IA**: Sí — inline para productos en riesgo
**Guard**: Muestra prompt de upload si `!has_inventario`

## Datos que consume
`categoriasInventario`, `dataAvailability`, `configuracion`

## Secciones UI
1. **Summary header** — total unidades, conteo por clasificación, % breakdown
2. **5 secciones colapsables** (ordenadas):
   - `riesgo_quiebre` (rojo, abierto por defecto)
   - `baja_cobertura` (ámbar, abierto por defecto)
   - `normal` (verde, cerrado por defecto)
   - `lento_movimiento` (gris, cerrado por defecto)
   - `sin_movimiento` (oscuro, cerrado por defecto)
3. **Header de sección**: conteo, unidades, % del total, expand/collapse
4. **Tabla por sección** — Producto, Categoría (si `has_categoria`), Uds. actuales, PM3, Días inv., Estado badge, Último mov., botón IA
5. **IA panel** — inline expandido debajo del producto analizado

## Filtros
Ninguno (la agrupación por clasificación es estructural)

## Integración IA
- Botón "✦ Analizar" solo en filas de `riesgo_quiebre` y `baja_cobertura`
- `deepseek-chat`, 300 tokens, temp 0.3
- Prompt: RESUMEN / INVENTARIO / RIESGO / HALLAZGO
- Datos: producto, categoría, unidades_actuales, PM3, días_inventario, estado, último_movimiento
- "Profundizar" → [[ChatIA]] con contexto completo

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Prompts Inline]]
