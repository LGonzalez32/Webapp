---
title: EstadoComercial
tags: [pagina, analisis, dashboard]
ruta: /dashboard
loc: 1740
updated: 2026-03-29
---

# EstadoComercial — Dashboard Principal

**Ruta**: `/dashboard`
**LOC**: 1740
**IA**: Sí — inline por insight + chat bridges

## Datos que consume
`insights`, `vendorAnalysis`, `teamStats`, `dataAvailability`, `configuracion`, `selectedPeriod`, `sales`, `clientesDormidos`, `concentracionRiesgo`, `categoriasInventario`, `supervisorAnalysis`, `canalAnalysis`, `categoriaAnalysis`, `dataSource`, `loadingMessage`

## Secciones UI
1. **Period selector** — chip strip de meses (max = fechaReferencia)
2. **Loading overlay** — animación mientras `!teamStats`
3. **Estado del Mes** — unidades actual vs. esperado al día (histórico), badge de estado (`adelantado/en_linea/atrasado/sin_base`), proyección al cierre
4. **Resumen Ejecutivo** — 4 bullet points auto-generados
5. **Focos de Riesgo** — hasta 3 insights CRITICA con impacto económico
6. **Acciones Hoy** — 3 cards (urgente/meta/oportunidad) con botón "chat bridge" → `/chat?q=...`
7. **Causas del Atraso** — solo si estado === 'atrasado', top 3 causas por dimensión
8. **Causas Narrativas** — cards visuales por dimensión
9. **Oportunidades activas** — vendedores superando, clientes recuperables
10. **Preguntas puente a IA** — 4 shortcuts contextuales → `/chat`
11. **Escenario de Mejora** — proyección delta si dormidos se recuperan
12. **Insight Feed** — lista filtrable con análisis IA inline por insight
13. **VendedorPanel** — slide-over al click en vendedor

## Filtros
- Period chip selector (mes/año)
- Feed tabs: `all | riesgos | hallazgo | cruzado`
- "Ver más" paginador (5 en 5)

## Integración IA
- **Per-insight**: botón "✦ Analizar" → `callAI` (`deepseek-chat`, 400 tokens, temp 0.4) → formato RESUMEN / CAUSAS / PALANCAS / ACCIÓN HOY → inline colapsable
- **Chat bridges**: botones en "Acciones Hoy" y "Preguntas puente" → navegan a `/chat?q=...`
- **Profundizar**: disponible en cada análisis inline → navega a [[ChatIA]] con contexto completo
- Sin persistencia: resultados en `analysisMap` (useState local)

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[Frontend]], [[Motor de Insights]], [[System Prompt]]
