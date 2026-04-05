---
title: Prompts Inline
tags: [ia, prompt, inline]
updated: 2026-03-29
---

# Prompts Inline — Análisis IA por Página

6 prompts inline que se ejecutan con `callAI()` directamente desde cada página.
Todos usan `deepseek-chat`, temperature 0.3, max_tokens 300 (salvo dashboard: 400/0.4).

## Tabla de prompts

| # | Página | Trigger | Formato respuesta | max_tokens | temp |
|---|--------|---------|-------------------|------------|------|
| 1 | [[EstadoComercial]] | "Analizar" en cada InsightCard | RESUMEN / CAUSAS / PALANCAS / ACCIÓN HOY | 400 | 0.4 |
| 2 | [[Clientes]] (Pareto) | "Analizar" en cada fila top cliente | RESUMEN / CRECIMIENTO / RIESGO / HALLAZGO | 300 | 0.3 |
| 3 | [[Clientes]] (Dormido) | "Analizar" en cada fila dormido | RESUMEN / CRECIMIENTO / CAÍDA / HALLAZGO | 300 | 0.3 |
| 4 | [[Rotacion]] | "Analizar" en productos riesgo_quiebre y baja_cobertura | RESUMEN / INVENTARIO / RIESGO / HALLAZGO | 300 | 0.3 |
| 5 | [[Departamentos]] (Insight) | Click en mapa o "Analizar" en tabla | RESUMEN / CRECIMIENTO / CAÍDA / HALLAZGO | 500 | 0.3 |
| 6 | [[Departamentos]] (Caída) | Análisis de caída por departamento | RESUMEN / CRECIMIENTO / CAÍDA / HALLAZGO | 300 | 0.3 |

## Flujo común

```
1. Usuario click "✦ Analizar"
2. Construir messages: [system (formato + contexto), user (datos específicos)]
3. callAI(messages) → POST /api/v1/chat → DeepSeek
4. Parsear respuesta por secciones (split por headers)
5. Mostrar inline debajo del elemento (useState local)
6. Opción "Profundizar" → navigate('/chat', { state: { prefill, displayPrefill } })
```

## Persistencia
- Resultados guardados en `useState` local (`analysisMap`, `paretoAnalysisMap`, etc.)
- Se pierden al navegar fuera de la página
- No se guardan en Zustand ni IndexedDB

## Profundizar
Cada análisis inline incluye un botón "Profundizar" que:
1. Toma el contexto completo (datos + respuesta IA) como `prefill`
2. Crea un `displayPrefill` corto para mostrar al usuario
3. Navega a `/chat` con `location.state`
4. [[ChatIA]] recibe y auto-envía el `prefill` como primer mensaje

Ver: [[System Prompt]], [[Seguridad IA]]
