---
title: ChatIA
tags: [pagina, ia, chat]
ruta: /chat
loc: 962
updated: 2026-03-29
---

# Chat IA — Conversacional con DeepSeek

**Ruta**: `/chat`
**LOC**: 962
**IA**: Heavy — es la página de IA principal

## Datos que consume
`isProcessed`, `vendorAnalysis`, `teamStats`, `insights`, `clientesDormidos`, `concentracionRiesgo`, `categoriasInventario`, `dataAvailability`, `configuracion`, `selectedPeriod`, `sales`, `chatMessages`, `setChatMessages`, `addChatMessage`

## Secciones UI
1. **Header bar** — título, botón deep analysis (BrainCircuit icon)
2. **Message thread** — scrollable; cada mensaje con ParsedContent (markdown: tablas, listas, headers, bold, italic, code blocks, charts inline)
3. **Inline charts** — `InlineChart` soporta `bar | horizontal_bar | line | pie` (data via `[CHART:...]` blocks)
4. **Follow-up chips** — debajo del último mensaje asistente (de `[FOLLOWUPS:...]` blocks)
5. **Navigation links** — auto-detectados: "Ver vendedores/clientes/rotación"
6. **Quick suggestions** — 4 sugerencias dinámicas cuando thread vacío
7. **Active entity indicator** — badge con vendedor/cliente en contexto
8. **Input area** — textarea + Send + toggle deep analysis

## Filtros
Ninguno (interfaz conversacional)

## Integración IA

### Chat normal
- `handleSend` → `sendChatMessage` (chatService) → `deepseek-chat`, 1024 tokens, temp 0.3
- System prompt: 14 secciones construidas desde todo el store (ver [[System Prompt]])
- Historial: últimos 10 mensajes enviados en cada turno
- Respuestas parseadas para charts y follow-ups

### Deep analysis
- Botón BrainCircuit o `?deep=1` en URL
- `sendDeepAnalysis` → `deepseek-reasoner`, 2048 tokens
- Razonamiento más detallado

### Profundizar (desde items numerados)
- Click en item numerado del último mensaje
- Envía follow-up estructurado: QUIÉN / QUÉ DECIR / PASOS / RESULTADO EN 24H

### Auto-welcome
- Primera carga con datos: envía silenciosamente "¿Cuáles son los 3 problemas principales?"

### Bridge desde otras páginas
- Recibe `?q=` param o `location.state.prefill`
- Auto-envía después de 800ms delay
- `displayPrefill` se muestra al usuario, `prefill` completo va a DeepSeek

### Entity context
- Detecta si el mensaje menciona un vendedor o cliente dormido
- Agrega hint al system prompt (sección 14)

## Persistencia
- `chatMessages` en Zustand (memoria) — se pierden en refresh
- No se persisten en IndexedDB (pendiente, ver [[Pendientes]])

## Estado
- Light mode: Sí
- Dark mode: Sí

Ver: [[System Prompt]], [[Prompts Inline]], [[Seguridad IA]]
