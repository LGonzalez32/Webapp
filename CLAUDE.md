Actualiza CLAUDE.md con los siguientes cambios exactos. Usa str_replace para cada sección afectada. NO reescribas el archivo completo.

=== CAMBIO 1: Versión en el título ===

Cambiar:
## v2.3 | React + TypeScript + Zustand + Recharts + Vite

Por:
## v2.0 | React + TypeScript + Zustand + Recharts + Vite

=== CAMBIO 2: Datos demo ===

Cambiar la sección ## DATOS DEMO completa:

Antes:
## DATOS DEMO

Empresa: Los Pinos S.A.
8 vendedores, 12 productos, 11 clientes, 18 meses historial
3 canales: Mostrador, Visita directa, Teléfono
Inventario demo: 5 categorías activas

Por:
## DATOS DEMO

Empresa: Los Pinos S.A.
8 vendedores, 20 productos, 30 clientes, 93,155 filas de ventas
Rango: Enero 2024 – Abril 2026 (fecha ref: Abr 9, 2026)
4 categorías: Refrescos, Lácteos, Limpieza, Snacks
3 canales: Mayoreo, Mostrador, Autoservicio
3 supervisores, 10 departamentos (El Salvador)

=== CAMBIO 3: Insights ===

Cambiar:
## LOS 20 INSIGHTS (insightEngine.ts)

Por:
## INSIGHTS (insightEngine.ts)

Y cambiar el contenido de esa sección:

Antes:
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
Insights con impacto_economico (solo si has_venta_neta):
  #1 Meta en Peligro, #9 Concentración Sistémica,
  #15 Equipo No Cerrará Meta, #19 Doble Riesgo,
  #20 Caída Explicada

Por:
Prioridades: CRITICA > ALTA > MEDIA > BAJA
fechaReferencia propagada a todos los detectores.
~26 detectores activos con cross-table analysis (vendedores × clientes × productos × inventario).
Todos los detectores usan same-day-range para comparaciones YoY.
Insights con impacto_economico (solo si has_venta_neta):
  Meta en Peligro, Concentración Sistémica, Equipo No Cerrará Meta,
  Doble Riesgo, Caída Explicada

=== CAMBIO 4: Agregar sección de reglas críticas de negocio ===

Después de la sección ## ARQUITECTURA FRONTEND y antes de ## REGLAS DE DESARROLLO, agregar esta sección nueva:

## REGLAS DE NEGOCIO CRÍTICAS

### Comparaciones de períodos (ABSOLUTO — nunca romper)
- Solo 2 tipos válidos de comparación:
  - YTD: Jan 1 a fechaReferencia del año actual vs mismo rango año anterior
  - MTD YoY: día 1 al día N del mes actual vs mismo rango del mismo mes año anterior
- NUNCA comparar un período parcial (ej: 9 días) contra un mes completo (30 días)
- Cuando isCurrentMonth=true: filtrar año anterior con getDate() <= diasTranscurridos

### recoveryScore
- Existe internamente en vendorAnalysis para ordenar/priorizar
- NUNCA mostrar el número x/100 al usuario en ninguna UI
- Mostrar solo: etiqueta en español + texto de acción contextual

### tipoMetaActivo
- Valores: 'uds' | 'usd'
- Todos los KPIs, cards y tablas deben mostrar SOLO el tipo activo
- No mezclar métricas en la misma vista

### Componentes — DO NOT TOUCH (salvo instrucción explícita)
- PulsoPanel.tsx (Content components ya enriquecidos con cross-table)
- VendedorPanel.tsx (análisis correcto)
- AnalysisDrawer.tsx (soporta analysisContent JSX además de texto plano)
- El chat / asistente virtual
- La apariencia de las PULSO cards en el dashboard

### Componentes UI reutilizables (usar siempre en lugar de <select>/<input> nativos)
- src/components/ui/SFSelect.tsx — select estilizado con chevron propio
- src/components/ui/SFSearch.tsx — input de búsqueda con icono integrado

=== VERIFICACIÓN ===

Al terminar: confirma qué secciones editaste y muestra el diff de cada str_replace.
tsc --noEmit no aplica para archivos .md, pero confirma que el archivo queda bien formado.