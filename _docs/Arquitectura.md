---
title: Arquitectura
tags: [arquitectura, stack, infraestructura]
---

# 🏗️ Arquitectura — SalesFlow

Ver [[Principios]] para las decisiones de diseño detrás de estas elecciones.
Ver los [[decisiones/ADR-001-deepseek-backend|ADRs]] para el razonamiento de decisiones específicas.

---

## Stack completo

| Capa | Tecnología | Notas |
|------|------------|-------|
| Frontend | React 19 + TypeScript + Vite | |
| Estilos | Tailwind v4 | Sin `tailwind.config.js`, usa `@tailwindcss/vite` |
| Estado global | Zustand v5 | Persist v3, key: `salesflow-storage` |
| Gráficas | Recharts | |
| Backend | FastAPI (Python) | Desplegado en Render |
| Base de datos | Supabase PostgreSQL | |
| Autenticación | Supabase Auth | Ver [[features/AuthOrganizaciones]] |
| Storage | Supabase Storage | Ver [[features/UploadPage]] |
| IA | DeepSeek API | Solo accesible desde backend — ver [[decisiones/ADR-001-deepseek-backend]] |
| Deploy frontend | Cloudflare Pages | |
| Dominio | data-solutions-hub.com | |

---

## Flujo de datos general

```
Usuario sube archivo
  └─▶ UploadPage → fileParser.ts → setSales / setMetas / setInventory
                                          │
                                          ▼
                                   useAnalysis.ts
                                   ├─ detectDataAvailability
                                   ├─ computeCommercialAnalysis
                                   ├─ computeCategoriasInventario
                                   └─ generateInsights
                                          │
                                          ▼
                                    Zustand Store
                                          │
                          ┌───────────────┼───────────────┐
                          ▼               ▼               ▼
                  EstadoComercial  DepartamentosPage   ChatIA
                                          │
                                          ▼
                              FastAPI /api/v1/chat
                                          │
                                          ▼
                                    DeepSeek API
```

---

## Estado persistido vs. en memoria

### Persistido en localStorage (sobrevive recarga)
- `selectedPeriod` — período activo seleccionado
- `configuracion` — API keys, preferencias del usuario
- `orgId` — organización activa

### Solo en memoria (recalculado desde datos cargados)
- `vendorAnalysis`, `teamStats`, `insights`
- `clientesDormidos`, `concentracionRiesgo`
- `categoriasInventario`, `forecastData`
- `isProcessed`, `isLoading`

> **Regla clave:** cuando `selectedPeriod` cambia, `isProcessed` se pone en `false`
> y el análisis completo se recalcula. No hay caché entre períodos.

---

## Reglas de análisis

- `fechaReferencia` = siempre `max(sales.fecha)`, **nunca** `new Date()`
- YTD: comparación homóloga (1 ene año actual vs 1 ene año anterior)
- Inventario: promedio móvil de 3 meses cerrados antes de `selectedPeriod`

---

## Rutas activas

| Ruta | Página | Condición |
|------|--------|-----------|
| `/dashboard` | [[features/EstadoComercial\|EstadoComercialPage]] | Siempre |
| `/vendedores` | VendedoresPage | Siempre |
| `/rendimiento` | RendimientoPage | Siempre |
| `/clientes` | ClientesPage | `has_cliente` |
| `/rotacion` | RotacionPage | `has_inventario` |
| `/metas` | MetasPage | `has_metas` |
| `/chat` | [[features/ChatIA\|ChatPage]] | Siempre |
| `/cargar` | [[features/UploadPage\|UploadPage]] | Siempre |
| `/configuracion` | ConfiguracionPage | Siempre |

---

## Backend (no conectado al frontend actualmente)

El backend Python FastAPI está construido y desplegado en Render pero **no está integrado
con el frontend**. Expone los siguientes endpoints:

- `GET /health` — health check
- `POST /api/v1/forecast` — modelos NAIVE, ETS, SARIMA, ENSEMBLE
- `POST /api/v1/chat` — proxy a DeepSeek API (con API key protegida)

La reconexión del forecast a `RendimientoPage` es deuda técnica pendiente.
Ver [[Roadmap]] para estado.

---

## Archivos de código muerto (no tocar)

- `forecastApi.ts` — pendiente reconexión con backend
- `errorHandler.ts` — no interfiere, pendiente limpieza
