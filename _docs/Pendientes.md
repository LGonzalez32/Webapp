---
title: Pendientes
tags: [roadmap, pendientes, deprecated]
updated: 2026-03-29
deprecated: true
---

> ⚠️ **DEPRECATED. Estancado en marzo 2026.**
> Roadmap vivo del motor de insights y reglas de desarrollo: [`CLAUDE.md`](../CLAUDE.md).
> Item "Rotar API key DeepSeek" sigue siendo válido al 2026-04-24 (pendiente de cierre por el owner del proyecto). El resto de items refleja estado pre-Z.5 y puede estar superado.

---

# Pendientes — Roadmap Técnico

## ALTA
- [ ] Rotar API key DeepSeek (la vieja estuvo expuesta en repo)
- [ ] Rate limiting en backend /chat (vulnerable a billing abuse)
- [ ] RLS en tablas forecast (sales_forecasts, sales_forecast_results)

## MEDIA
- [ ] Conectar forecast engine a prod (numpy en Render o tier paid)
- [ ] Eliminar 7 tablas huérfanas de [[Supabase]]
- [ ] Configurar Supabase service key en Render
- [ ] Auto-sync datos frontend → backend (/forecast/sync-data)
- [ ] Light mode completo en AuthPage, OnboardingPage

## BAJA
- [ ] Persistir chatMessages en IndexedDB
- [ ] Tests frontend (Vitest + testing-library)
- [ ] Tests backend (pytest para chat proxy)
- [ ] MetasPage: expandir dimensiones (producto/cliente/canal)
- [ ] Cache LRU en backend (en vez de clear-all)
- [ ] Unificar model selectors (model_selector.py vs sales_forecast_service.py)
- [ ] CI/CD con GitHub Actions
- [ ] Error boundaries en páginas
- [ ] AbortController en llamadas DeepSeek
- [ ] Streaming para respuestas IA

Ver: [[ADR-001 DeepSeek Backend]], [[Supabase]], [[Backend]]
