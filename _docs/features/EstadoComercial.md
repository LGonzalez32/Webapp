---
title: EstadoComercialPage
tags: [feature, dashboard, insights]
---

# EstadoComercialPage

## Propósito
Vista principal de salud comercial del período activo. Permite al gerente detectar de un vistazo
si el mes va bien o mal, por qué, y qué hacer al respecto.

Es la pantalla de entrada del producto — la primera que ve el usuario al cargar datos.

## Estado
✅ Producción

## Ruta
`/dashboard`

---

## Componentes clave

### KPI Badges
- Ventas del período vs mismo período año anterior (YoY)
- Comparación homóloga desde el 1 de enero — no comparación MoM
- Motivo: la estacionalidad en distribución hace que MoM sea engañoso

### Causas de atraso
- Lista expandible de razones por las que el período va por debajo de meta
- Colapsadas por defecto para no abrumar al usuario
- Detalle por vendor y canal al expandir

### Simulación de escenarios
- Dos escenarios: cierre optimista y pesimista del período
- Basado en ritmo de ventas actual vs días hábiles restantes

### Botones "Analizar con IA"
- Pre-llenan preguntas específicas en [[ChatIA]]
- Implementan [[decisiones/ADR-003-ia-como-puente]]
- Ejemplo: "¿Por qué el canal Mostrador está cayendo este mes?"

### Oportunidades detectadas
- Clientes con potencial de reactivación
- Productos con quiebre de tendencia positiva
- Generadas por `insightEngine.ts`

---

## Los 20 Insights (insightEngine.ts)

Prioridades: `CRITICA > ALTA > MEDIA > BAJA`

Insights con `impacto_economico` (solo si `has_venta_neta`):
- #1 Meta en Peligro
- #9 Concentración Sistémica
- #15 Equipo No Cerrará Meta
- #19 Doble Riesgo
- #20 Caída Explicada

Regla: `fechaReferencia` se propaga a todos los detectores desde `useAnalysis.ts`.

---

## Decisiones de diseño

- **YoY en lugar de MoM** — más relevante para distribución con estacionalidad marcada
- **Causas colapsadas** — el usuario promedio no quiere el detalle inmediatamente;
  lo abre cuando algo llama su atención
- **Sin gráficas en esta página** — la información crítica es texto + números;
  las gráficas están en [[RendimientoPage]]

---

## Pendiente
- Más preguntas contextuales pre-cargadas para [[ChatIA]] por segmento (en [[Roadmap]])
- Exportar como PDF (en backlog del [[Roadmap]])
