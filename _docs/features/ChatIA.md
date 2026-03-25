---
title: ChatIA
tags: [feature, ia, deepseek, chat]
---

# ChatPage — IA

## Propósito
Chat contextual con DeepSeek que permite al usuario profundizar en cualquier métrica
o situación detectada en otras páginas del sistema.

No es el punto de entrada principal — es el destino de los botones "Analizar con IA"
distribuidos en todas las páginas. Ver [[decisiones/ADR-003-ia-como-puente]].

## Estado
✅ Producción

## Ruta
`/chat`

---

## Componentes clave

### Markdown rendering
- Respuestas de DeepSeek renderizadas con formato completo
- Soporte para listas, tablas, negritas, código inline

### System prompt contextual
- Incluye contexto de distribución LATAM
- Datos del período activo inyectados automáticamente
- Nombre de la organización y métricas clave del store

### Follow-up chips
- Generados dinámicamente tras cada respuesta
- Sugieren la siguiente pregunta relevante según la respuesta anterior
- Reducen fricción para usuarios no técnicos

### Detección de entidades
- Detecta menciones de productos, clientes y departamentos en las respuestas
- Genera chips de drill-down específicos ("Ver detalle de San Miguel")

### Modelos disponibles
- `deepseek-chat` — respuestas rápidas para consultas normales
- `deepseek-reasoner` — análisis profundo para preguntas complejas

---

## Flujo técnico

```
Usuario escribe / llega con pregunta pre-cargada
  └─▶ ChatPage → chatService.ts
                    └─▶ FastAPI /api/v1/chat (con API key protegida)
                              └─▶ DeepSeek API
                                    └─▶ Respuesta en markdown
                                          └─▶ Follow-up chips generados
```

Ver [[decisiones/ADR-001-deepseek-backend]] para la razón de ir via backend.

---

## Decisiones de diseño

- **No es una sección prominente de la UI** — no hay botón grande en la sidebar
  que diga "Chat con IA". Se accede desde contexto específico. Ver [[decisiones/ADR-003-ia-como-puente]].
- **Pre-carga de preguntas** — cuando el usuario llega desde [[features/EstadoComercial]]
  u otra página, la pregunta ya está escrita. Un clic y obtiene respuesta.
- **Modelo elegido por tipo de pregunta** — consultas simples usan `deepseek-chat`,
  análisis estratégico usa `deepseek-reasoner`

---

## Pendiente

- Refinar system prompt para respuestas más cortas y accionables (en progreso en [[Roadmap]])
- Rate limiting por organización (infraestructura, en [[Roadmap]])
- Historial de conversaciones persistido en Supabase (no priorizado)
