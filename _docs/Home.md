---
title: SalesFlow Docs
tags: [home, index, legacy-wiki]
updated: 2026-04-24
---

# SalesFlow — Documentación

> **Este wiki (`_docs/`) es legacy.** La documentación viva del motor y la
> ingesta vive en `docs/` (raíz, sin underscore). Esta carpeta se conserva
> solo para referencia histórica de páginas, ADRs y arquitectura. No se
> actualiza con cada cambio.
>
> **Fuentes vivas:**
> - [`CLAUDE.md`](../CLAUDE.md) — reglas operativas, ownership documental,
>   read order, cuellos pendientes.
> - [`docs/MANIFIESTO-MOTOR-INSIGHTS.md`](../docs/MANIFIESTO-MOTOR-INSIGHTS.md)
>   — pipeline canónico del motor (10 etapas + invariantes).
> - [`docs/ROADMAP-Z11-PIPELINE-BASELINE.md`](../docs/ROADMAP-Z11-PIPELINE-BASELINE.md)
>   — roadmap activo para reconciliar baseline worker/page antes de tocar gate.
> - [`docs/BASELINE-Z11-0.md`](../docs/BASELINE-Z11-0.md)
>   — artefacto de baseline real del pipeline de insights.
> - [`docs/GLOSARIO-MOTOR-INSIGHTS.md`](../docs/GLOSARIO-MOTOR-INSIGHTS.md)
>   — mapa "dónde vive cada cosa" (métricas, dimensiones, detectores).
> - [`docs/ROADMAP-INGESTA-REGISTRY.md`](../docs/ROADMAP-INGESTA-REGISTRY.md)
>   — refactor de ingesta registry-driven (Sprints A→F.2).
> - [`docs/LEGACY-PYTHON-FORECAST.md`](../docs/LEGACY-PYTHON-FORECAST.md)
>   — backend Python forecast (no conectado al frontend).
> - [`docs/historico/`](../docs/historico/) — historial detallado por fase.

## Navegación legacy (referencia)

### Arquitectura
- [[Infraestructura]] — Mapa de servicios, URLs, variables de entorno
- [[Frontend]] — Páginas, stores, hooks, workers, tipos
- [[Backend]] — FastAPI, endpoints, proxy DeepSeek, forecast engine
- [[Supabase]] — Tablas, auth, storage, RLS, funciones SQL
- [[Persistencia]] — IndexedDB, localStorage, Zustand, Supabase Storage

### IA
- [[System Prompt]] — Secciones del prompt principal del chat
- [[Prompts Inline]] — Prompts de análisis por página
- [[Seguridad IA]] — Reglas y validaciones del chat

### Páginas
- [[EstadoComercial]] · [[Vendedores]] · [[Rendimiento]] · [[Clientes]]
- [[Departamentos]] · [[Rotacion]] · [[Metas]] · [[ChatIA]]
- [[CargarDatos]] · [[Configuracion]]

### Decisiones (ADRs)
- [[ADR-001 DeepSeek Backend]] — API key movida al backend proxy
- [[ADR-002 IndexedDB Persistencia]] — Datos en IndexedDB, no localStorage
- [[ADR-003 Zustand Hydration]] — useStoreHydrated para timing
- [[ADR-004 Seguridad IA]] — Reglas de seguridad en system prompt

---

## Eliminados en esta consolidación (2026-04-24)

- ~~Pendientes.md~~ — superseded por `CLAUDE.md` (sección "Motor de Insights — Ownership")
- ~~Changelog.md~~ — superseded por `docs/historico/`
- ~~ia/Motor de Insights.md~~ — superseded por `docs/MANIFIESTO-MOTOR-INSIGHTS.md`
