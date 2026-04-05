---
title: Backend
tags: [arquitectura, backend, fastapi]
updated: 2026-03-29
---

# Backend — FastAPI + DeepSeek Proxy

## Stack
- Python FastAPI
- httpx (HTTP async client)
- Modelos forecast: NAIVE, ETS, SARIMA, ENSEMBLE (deshabilitados en prod)
- Deploy: Render (free tier)

## Estructura

```
backend/
├── main.py              — FastAPI app, CORS, routers
├── requirements.txt     — Todas las dependencias (numpy, pandas, statsmodels)
├── requirements-prod.txt — Solo httpx, fastapi, uvicorn (sin numpy)
├── Dockerfile
├── routers/
│   ├── chat.py          — POST /api/v1/chat (proxy DeepSeek)
│   └── forecast.py      — Endpoints forecast (deshabilitados)
├── services/
│   ├── deepseek_service.py
│   ├── forecast_service.py
│   ├── sales_forecast_service.py
│   └── model_selector.py
└── models/
    └── schemas.py
```

## Endpoints

| Método | Ruta | Activo en prod | Descripción |
|--------|------|----------------|-------------|
| GET | `/` | ✅ | Health check Render |
| GET | `/api/v1/health` | ✅ | `{"status": "ok"}` |
| POST | `/api/v1/chat` | ✅ | Proxy DeepSeek |
| POST | `/api/v1/forecast` | ❌ (sin numpy) | Forecast SKU |
| POST | `/api/v1/forecast/generate` | ❌ (sin numpy) | Forecast ventas |
| POST | `/api/v1/forecast/performance` | ❌ (sin numpy) | KPIs anuales |
| GET | `/api/v1/forecast/{y}/{v}/{m}` | ❌ | Lee forecast Supabase |
| POST | `/api/v1/forecast/sync-data` | ❌ | Sync datos |

En producción solo `/chat` y `/health` están activos porque `requirements-prod.txt` no incluye numpy/pandas/statsmodels.

## Proxy DeepSeek

```
Frontend callAI() → POST /api/v1/chat
  → chat.py: os.getenv("DEEPSEEK_API_KEY")
  → httpx POST api.deepseek.com/chat/completions (timeout 90s)
  → return resp.json() (respuesta completa OpenAI-compatible)
```

### Parámetros por caso de uso

| Uso | Model | max_tokens | temperature |
|-----|-------|------------|-------------|
| Chat normal | deepseek-chat | 1024 | 0.3 |
| Deep analysis | deepseek-reasoner | 2048 | — |
| Inline (páginas) | deepseek-chat | 300 | 0.3 |
| Inline dashboard | deepseek-chat | 400 | 0.4 |

## Forecast engine (deshabilitado)

El motor de forecast soporta 4 modelos:
- **NAIVE**: Repetición último valor
- **ETS**: Exponential smoothing
- **SARIMA**: Seasonal ARIMA
- **ENSEMBLE**: Promedio ponderado

Requiere numpy, pandas, statsmodels — no incluidos en `requirements-prod.txt` por limitaciones del free tier de Render.

## Notas
- Cold start en free tier: ~50 segundos
- Rate limiting: **pendiente** (ver [[Pendientes]])
- CORS configurado para `www.data-solutions-hub.com` y `data-solutions-hub.com`

Ver: [[Infraestructura]], [[ADR-001 DeepSeek Backend]]
