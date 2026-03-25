---
title: "ADR-003: IA como puente contextual, no como destino"
tags: [adr, ia, ux, producto]
date: 2026-03-21
status: Aceptada
---

# ADR-003: IA como puente contextual, no como destino

## Estado
✅ Aceptada e implementada

## Contexto

Al integrar IA en SalesFlow, surgió la pregunta de cómo posicionarla en la UX:

**Opción A — IA como sección principal**
La sidebar tiene un ítem "Chat con IA" prominente. El usuario navega al chat,
escribe su pregunta desde cero, y obtiene respuesta.

**Opción B — IA como puente contextual**
Cada página tiene botones "Analizar con IA" que detectan el contexto actual
(qué vendedor, qué período, qué anomalía) y pre-cargan la pregunta en el chat.
El usuario hace un clic y obtiene la respuesta directamente relevante.

## El problema con la Opción A

Los usuarios objetivo (gerentes comerciales, directores de ventas de distribuidoras
en El Salvador) son usuarios no técnicos. Frente a un chat vacío, no saben qué preguntar.
La pantalla en blanco genera parálisis.

Además, la Opción A hace que "usar la IA" sea una acción consciente y separada,
cuando el objetivo es que la IA sea **infraestructura invisible** que potencia
la comprensión del negocio.

## Decisión

**La IA opera como puente contextual.** Los botones "Analizar con IA" están
distribuidos en las páginas con contexto pre-cargado. El [[features/ChatIA|ChatPage]]
existe pero no es el punto de entrada. No hay un ítem destacado en la sidebar.

```
EstadoComercial detecta problema
  └─▶ Botón "¿Por qué cayó el canal Mostrador?"
            └─▶ navigate('/chat', { state: { pregunta: '...' } })
                      └─▶ ChatPage recibe pregunta pre-cargada
                                └─▶ Un clic para enviar
```

## Consecuencias

### Positivas
- Reduce fricción para usuarios no técnicos — la pregunta ya está escrita
- La IA se siente como parte natural del producto, no como un feature separado
- Las preguntas pre-cargadas son más específicas y útiles que preguntas libres
- El usuario aprende qué se puede preguntar al ver los ejemplos

### Negativas
- Requiere más trabajo de diseño: definir los botones correctos en cada página
- El chat libre sigue disponible pero menos descubierto
- Si el usuario quiere hacer una pregunta diferente, tiene que editarla

## Implementación actual

Páginas con botones "Analizar con IA":
- [[features/EstadoComercial]] — preguntas por período, canal, segmento
- [[features/DepartamentosPage]] — preguntas por departamento específico

Ver [[Roadmap]] para páginas pendientes de agregar estos botones.
Ver [[Principios]] §3 para la filosofía de producto detrás de esta decisión.
