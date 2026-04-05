---
title: Departamentos
tags: [pagina, analisis, mapa]
ruta: /departamentos
loc: 857
updated: 2026-03-29
---

# Departamentos — Mapa SVG El Salvador

**Ruta**: `/departamentos`
**LOC**: 857
**IA**: Sí — 2 flujos inline (mapa + tabla)
**Guard**: Empty state si no hay columna `departamento` en sales

## Datos que consume
`sales` (via selector), `selectedPeriod` (via selector), `configuracion` (via selector)

Usa Zustand selectors fine-grained en vez de destructuring completo.

## Secciones UI
1. **Empty state** — si no hay `departamento`, card instructiva
2. **Summary bar** — total departamentos arriba/abajo del año anterior
3. **SVG choropleth map** — SVG interactivo (`viewBox="0 0 1000 547"`), coloreado heat-map por variación YTD vs año anterior por departamento
4. **Right panel** — aparece al click en mapa: stats del depto + tabla breakdown por canal + análisis IA inline
5. **Department table** — todos los deptos rankeados por YTD: nombre, YTD actual, YTD anterior, var%, botón IA por fila

## Filtros
Ninguno (la interacción con el mapa actúa como filtro)

## Integración IA
- **Map click**: `callAI` (`deepseek-chat`, 500 tokens) → prompt con nombre depto, YTD, variación, breakdown canales → RESUMEN / CRECIMIENTO / CAÍDA / HALLAZGO → "Profundizar" → [[ChatIA]]
- **Table row**: mismo `callAI`, mismo formato, por botón "Analizar" en tabla → resultados en `aiExplanation` + `insightText` (useState)

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Prompts Inline]]
