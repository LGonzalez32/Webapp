---
title: "ADR-001: API Key de DeepSeek movida al Backend"
status: accepted
date: 2026-03-25
tags: [adr, seguridad]
---

# ADR-001: API Key de DeepSeek al Backend

## Contexto
La API key de DeepSeek estaba en el frontend (`VITE_DEEPSEEK_API_KEY`), compilada al bundle JS, visible con F12 en cualquier browser.

## Decisión
Mover todas las llamadas IA al proxy del backend (POST `/api/v1/chat`). La key solo existe en Render env vars (`DEEPSEEK_API_KEY`). El frontend ya no tiene ninguna referencia directa a la API de DeepSeek.

## Alternativas consideradas
1. **Supabase Edge Functions** — Descartado: complejidad adicional, otro servicio que mantener
2. **API key rotada pero en frontend** — Descartado: el problema fundamental persiste
3. **Backend proxy (elegido)** — Simple, ya teníamos FastAPI en Render

## Consecuencias
- ✅ Key invisible para usuarios
- ✅ Rate limiting centralizado (pendiente implementación)
- ✅ Logging y monitoreo centralizado
- ⚠️ Latencia adicional (~100ms por hop al backend)
- ⚠️ Free tier Render: cold start ~50s después de inactividad
- ⚠️ La key vieja estuvo expuesta en el repo — pendiente rotación

## Estado
Aceptado e implementado. Pendiente: rate limiting y rotación de key.

Ver: [[Backend]], [[Seguridad IA]], [[Pendientes]]
