---
title: Roadmap
updated: 2026-03-21
tags: [roadmap, planning]
---

# 🗺️ Roadmap — SalesFlow

Ver [[Principios]] para entender los criterios de priorización.
Ver [[Changelog]] para lo que ya se completó.

---

## 🔄 En progreso

- [ ] Profundizar análisis IA en [[features/EstadoComercial]] — más preguntas contextuales por segmento
- [ ] Filtro por supervisor en [[features/DepartamentosPage]]
- [ ] Refinar system prompt de [[features/ChatIA]] para respuestas más cortas y accionables

---

## 📋 Backlog — Features

- [ ] Nueva página: Clientes — ranking, frecuencia, riesgo de churn
- [ ] Nueva página: Productos — ABC, rotación, quiebres de stock
- [ ] Exportar reporte PDF desde [[features/EstadoComercial]]
- [ ] Segmentación por canal de venta en [[features/DepartamentosPage]]
- [ ] Comparación entre períodos personalizable (no solo YoY)
- [ ] Notificaciones push cuando se detectan anomalías en ventas
- [ ] Dashboard de administrador para gestionar organizaciones (ver [[features/AuthOrganizaciones]])

---

## 📋 Backlog — Infraestructura

- [ ] Tests de integración para el parser de [[features/UploadPage]]
- [ ] Rate limiting en endpoints de [[features/ChatIA]] por organización
- [ ] Anonimización de datos para clientes enterprise (ver [[Principios]])
- [ ] Pipeline de CI/CD con GitHub Actions
- [ ] Sentry + PostHog en producción

---

## 🌎 Backlog — Crecimiento

- [ ] Internacionalización: Guatemala, Honduras como segundo mercado
- [ ] Landing page pública en data-solutions-hub.com
- [ ] Customer acquisition automation (Apollo.io + n8n + HubSpot)
- [ ] Tier de pricing: Free trial → Pro → Enterprise

---

## ✅ Completado

- [x] Fix bug de persistencia en uploads — ver [[decisiones/ADR-002-upload-bloqueante]]
- [x] Heat map SVG de los 14 departamentos — ver [[features/DepartamentosPage]]
- [x] Toggle `join_control` en tabla organizations — ver [[features/AuthOrganizaciones]]
- [x] API key DeepSeek movida a FastAPI — ver [[decisiones/ADR-001-deepseek-backend]]
- [x] CORS restringido por variables de entorno
- [x] Markdown rendering en [[features/ChatIA]]
- [x] Follow-up chips y detección de entidades en chat
- [x] KPI badges compactos con comparación YoY en [[features/EstadoComercial]]
- [x] Causas de atraso expandibles con detalle por vendor/canal
- [x] Bloque de simulación de dos escenarios
- [x] Botones "Analizar con IA" que pre-llenan [[features/ChatIA]]
- [x] Typed `ParseError` con 8 códigos en [[features/UploadPage]]
- [x] Bloque de estado de archivos en Supabase Storage
