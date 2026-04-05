---
title: SalesFlow Docs
tags: [home, index]
updated: 2026-03-29
---

# SalesFlow v2.5 — Documentación

## Navegación

### Arquitectura
- [[Infraestructura]] — Mapa de servicios, URLs, variables de entorno
- [[Frontend]] — 16 páginas, stores, hooks, workers, tipos
- [[Backend]] — FastAPI, endpoints, proxy DeepSeek, forecast engine
- [[Supabase]] — Tablas, auth, storage, RLS, funciones SQL
- [[Persistencia]] — IndexedDB, localStorage, Zustand, Supabase Storage

### IA
- [[System Prompt]] — 14 secciones del prompt principal del chat
- [[Prompts Inline]] — 6 prompts de análisis por página
- [[Seguridad IA]] — 9 reglas, stress test 96.7%
- [[Motor de Insights]] — 22 detectores con umbrales

### Páginas
- [[EstadoComercial]] — Dashboard principal
- [[Vendedores]] — Tabla jerárquica
- [[Rendimiento]] — Pivot + chart YoY
- [[Clientes]] — Dormidos, Pareto, Riesgo temprano
- [[Departamentos]] — Mapa SVG El Salvador
- [[Rotacion]] — Clasificación inventario
- [[Metas]] — Cumplimiento
- [[ChatIA]] — Chat conversacional
- [[CargarDatos]] — Upload wizard
- [[Configuracion]] — Params empresa

### Decisiones
- [[ADR-001 DeepSeek Backend]] — API key movida al backend proxy
- [[ADR-002 IndexedDB Persistencia]] — Datos en IndexedDB, no localStorage
- [[ADR-003 Zustand Hydration]] — useStoreHydrated para timing
- [[ADR-004 Seguridad IA]] — 9 reglas de seguridad en system prompt

### Estado
- [[Pendientes]] — Roadmap técnico priorizado
- [[Changelog]] — Historial de cambios
