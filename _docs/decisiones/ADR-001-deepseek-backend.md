---
title: "ADR-001: DeepSeek en backend, nunca en frontend"
tags: [adr, seguridad, ia, deepseek]
date: 2026-03-21
status: Aceptada
---

# ADR-001: DeepSeek en backend, nunca en frontend

## Estado
✅ Aceptada e implementada

## Contexto

SalesFlow usa DeepSeek como motor de IA para el [[features/ChatIA]].
La integración requiere una API key para autenticar cada request.

Opciones consideradas:
1. Llamar a DeepSeek directamente desde el frontend (React)
2. Proxy todas las llamadas de IA a través del backend FastAPI

## Decisión

**Todas las llamadas a DeepSeek pasan por el backend FastAPI.**
La API key nunca se expone en el código frontend, en variables de entorno
del cliente, ni en ningún bundle que llegue al browser.

## Consecuencias

### Positivas
- La API key no puede ser extraída del bundle por usuarios malintencionados
- Se puede agregar rate limiting, logging y control de costos en el backend
- Se puede cambiar el proveedor de IA (ej. OpenAI, Anthropic) sin tocar el frontend
- CORS puede restringirse correctamente — solo el frontend autorizado llama al backend

### Negativas
- Latencia adicional de un hop extra (frontend → backend → DeepSeek)
- El backend debe estar disponible para que el chat funcione
- Mayor complejidad de deploy (dos servicios en lugar de uno)

## Implementación

```
Frontend (React)
  └─▶ POST /api/v1/chat  (al backend en Render)
            └─▶ FastAPI lee DEEPSEEK_API_KEY de env vars
                      └─▶ DeepSeek API
```

Ver [[Arquitectura]] para el stack completo.
Ver [[features/ChatIA]] para el flujo del chat.
