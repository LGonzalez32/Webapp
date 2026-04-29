---
title: Clientes
tags: [pagina, analisis, clientes]
ruta: /clientes
loc: 882
updated: 2026-03-29
---

# Clientes — Dormidos, Pareto, Riesgo Temprano

**Ruta**: `/clientes`
**LOC**: 882
**IA**: Sí — 2 flujos inline (dormidos + pareto)
**Guard**: Redirect a `/dashboard` si `!has_cliente`

## Datos que consume
`clientesDormidos`, `sales`, `selectedPeriod`, `dataAvailability`, `configuracion`

## Secciones UI

### Tab: Clientes Dormidos
1. **Filter bar** — vendedor dropdown
2. **Sort controls** — prioridad, días sin actividad, valor histórico, compras, vendedor, cliente
3. **Table** — cliente, vendedor, días inactivo, compras hist., valor hist., recovery score badge, botón IA
4. **Inline IA panel** — expandible debajo de cada fila

### Tab: Top Clientes (Pareto)
1. **Ranked list** — top 20 clientes por YTD
2. **Columns** — rank, nombre, vendedor, unidades/venta YTD, variación YoY, peso%, cumulative%, botón IA
3. **Inline IA panel** — expandible por fila

### Tab: Riesgo Temprano
1. **Clients list** — clientes no dormidos pero con anomalías de frecuencia
2. **Columns** — nombre, vendedor, último pedido, frecuencia esperada, días atraso, señal badge (`en riesgo | desacelerando`)

## Filtros
- Tab selector: `dormidos | pareto | riesgo`
- Vendedor dropdown (solo tab Dormidos)
- Column sort (tab Dormidos)

## Integración IA
- **Dormidos**: "✦ Analizar" por fila → `deepseek-chat`, 300 tokens, temp 0.3 → RESUMEN / CRECIMIENTO / CAÍDA / HALLAZGO → datos: nombre, vendedor, días, compras, valor, recovery_score, frecuencia
- **Pareto**: "✦ Analizar" por fila → `deepseek-chat`, 300 tokens, temp 0.3 → RESUMEN / CRECIMIENTO / RIESGO / HALLAZGO → datos: nombre, vendedor, YTD, variación, peso
- Ambos con botón "Profundizar" → [[ChatIA]]
- Persistencia: `analysisMap` y `paretoAnalysisMap` (useState local)

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Prompts Inline]], `docs/MANIFIESTO-MOTOR-INSIGHTS.md`
