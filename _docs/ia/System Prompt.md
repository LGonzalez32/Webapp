---
title: System Prompt del Chat IA
tags: [ia, prompt, chat]
updated: 2026-03-29
---

# System Prompt — 14 secciones

El system prompt del chat se construye dinámicamente en `chatService.ts → buildSystemPrompt()`.
Límite: `MAX_PROMPT_CHARS = 320,000` (~80K tokens).

## Secciones

| # | Sección | Datos de | Descripción |
|---|---------|----------|-------------|
| 1 | Identidad y personalidad | `configuracion.empresa` | Rol de analista comercial, nombre de empresa, personalidad humanizada |
| 2 | CÓMO RESPONDER (4 modos) | — | Saludo, pregunta directa, análisis, profundizar |
| 3 | Período analizado | `selectedPeriod`, `teamStats` | Fecha referencia, YTD boundaries, contexto temporal |
| 4 | Detalle por vendedor (hasta 20) | `vendorAnalysis`, `clientesDormidos`, `sales` | YTD, variación, riesgo, clientes dormidos, productos ausentes por vendedor |
| 5 | Vendedores sin detalle (>20) | `vendorAnalysis` | Resumen compacto cuando hay muchos vendedores |
| 6 | Alertas activas (top 5) | `insights` | Los 5 insights más críticos como contexto |
| 7 | Inventario | `categoriasInventario` | Productos por clasificación (quiebre, baja cobertura, etc.) |
| 8 | Cruce inventario × vendedor × canal | `sales` + `categoriasInventario` | Qué vendedor vende qué producto en riesgo por qué canal |
| 9 | Departamentos (top 10) | `sales` (has_departamento) | YTD por departamento, variación, canales principales |
| 10 | Clientes concentración (top 5) | `concentracionRiesgo` | Clientes con mayor peso en la cartera |
| 11 | Formato | — | Markdown, charts `:::chart`, seguimientos `[SEGUIMIENTO]` |
| 12 | PROHIBIDO (5 reglas) | — | No inventar datos, no diagnosticar, etc. |
| 13 | SEGURIDAD (9 reglas) | — | Ver [[Seguridad IA]] |
| 14 | Active entity hint | `ctx.activeEntityHint` | Vendedor o cliente en contexto actual |

## Charts en respuesta

El prompt instruye al modelo a generar bloques `:::chart` con formato:
```
:::chart
tipo: bar|line|pie|horizontal_bar
titulo: "..."
datos:
- nombre: "X", valor: 100
- nombre: "Y", valor: 200
:::
```

Parseados por `parseChartBlock()` en ChatPage y renderizados con Recharts.

## Follow-ups

El modelo genera sugerencias con formato `[SEGUIMIENTO: texto]`.
Se parsean y se muestran como chips clickeables debajo de la respuesta.

## Navegación contextual

El modelo puede sugerir `[VER: /ruta]` que se convierte en links navegables.

Ver: [[Prompts Inline]], [[Seguridad IA]], [[ChatIA]]
