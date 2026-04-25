---
title: Changelog
tags: [changelog, deprecated]
updated: 2026-03-29
deprecated: true
---

> ⚠️ **DEPRECATED. Última entrada: v2.5 (29 marzo 2026).**
> El historial post-Z.5 (Z.6, Z.7, Z.9, Z.10, Z.11, Z.12, Z.13 y refactor Fases 0–7 del motor) vive en:
> - [`docs/historico/MANIFIESTO-MOTOR-INSIGHTS-Z9-Z13-HISTORICO.md`](../docs/historico/MANIFIESTO-MOTOR-INSIGHTS-Z9-Z13-HISTORICO.md) — historial detallado del motor.
> - `git log --oneline` — historial de commits.

---

# Changelog

## v2.5 — 2026-03-29 (Deploy a producción)
- Deploy frontend en Vercel + backend en Render
- API key movida al backend proxy ([[ADR-001 DeepSeek Backend]])
- Stress test IA: 96.7% (60 tests) ([[ADR-004 Seguridad IA]])
- Persistencia IndexedDB + Zustand hydration fix ([[ADR-002 IndexedDB Persistencia]], [[ADR-003 Zustand Hydration]])
- Chat: historial en sesión, displayContent, Profundizar con contexto
- Chart YTD barras con color individual por mes
- Departamentos en system prompt
- Top Clientes con análisis inline
- Personalidad IA humanizada
- 9 reglas de seguridad en system prompt
- Supabase Auth + Storage + multi-tenant

## v2.0 — 2026-03-25 (Pre-deploy)
- Feed unificado "Inteligencia Comercial"
- 5 detectores de hallazgos (insights #18-#22)
- Light mode completo
- Análisis IA inline en 4 páginas
- Motor de insights: 22 detectores
- [[Departamentos]] con mapa SVG El Salvador

## v1.0 — 2026-03-14 (MVP)
- Carga de datos CSV/XLSX
- Análisis por vendedor
- Chat IA con DeepSeek
- Auth Supabase (email + Google)
- Multi-tenant con roles (owner/editor/viewer)
- 6 páginas de análisis
