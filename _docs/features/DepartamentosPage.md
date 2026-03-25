---
title: DepartamentosPage
tags: [feature, geografico, heatmap]
---

# DepartamentosPage

## Propósito
Visualización geográfica de ventas por departamento en El Salvador. Permite identificar
zonas de oportunidad, bajo desempeño y distribución de cobertura en el territorio.

## Estado
✅ Producción

## Ruta
`/departamentos`

## Condición de acceso
Requiere columna `departamento` en los datos de ventas (`has_departamento`).

---

## Componentes clave

### Heat map SVG
- Mapa vectorial de los **14 departamentos** de El Salvador
- Colores proporcionales al volumen de ventas o cumplimiento de meta
- Hover muestra detalle del departamento
- El SVG está en `mapa.svg` en la raíz del proyecto

### Tabla de departamentos
- Ranking por ventas o cumplimiento
- Botones de insight IA por fila que pre-llenan [[ChatIA]]
- Implementa [[decisiones/ADR-003-ia-como-puente]]

### Colores
- Verde: cumplimiento alto (≥ 90% de meta)
- Amarillo: cumplimiento medio (60–89%)
- Rojo: cumplimiento bajo (< 60%)
- Gris: sin datos para el período

---

## Decisiones de diseño

- **SVG propio** en lugar de librería de mapas — menor bundle size,
  más control sobre la interacción, sin dependencia externa
- **Colores de cumplimiento, no de volumen absoluto** — normaliza diferencias
  entre departamentos grandes (San Salvador) y pequeños (Morazán)

---

## Pendiente

- Filtro por supervisor (en [[Roadmap]], en progreso)
- Drill-down por municipio (backlog)
- Segmentación por canal de venta (backlog)
