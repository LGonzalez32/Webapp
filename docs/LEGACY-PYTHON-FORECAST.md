# Backend Python Forecast Engine — LEGACY DIFERIDO

**Estado:** código presente, **NO conectado** al frontend.
**Última revisión:** 17 abril 2026.
**Decisión:** diferir integración indefinidamente. Documentar para poder retomar sin arqueología.

---

## 1. Qué existe hoy

### 1.1 Estructura de archivos reales
```
backend/
├── main.py                      # FastAPI bootstrap + CORS + mount routers
├── requirements.txt             # deps Python
├── Dockerfile                   # python:3.11-slim, EXPOSE 8000
└── app/
    ├── core/
    │   └── config.py            # Settings con supabase_url/key, log_level
    ├── api/routes/
    │   ├── health.py            # GET /health
    │   ├── chat.py              # POST /chat — proxy a DeepSeek
    │   └── forecast.py          # POST /forecast — ETS/SARIMA/Ensemble
    └── models/
        └── __init__.py          # vacío
```

### 1.2 Stack

- **Framework:** FastAPI 0.110.0 sobre Uvicorn 0.27.0
- **Python:** 3.11 (Docker base slim)
- **Modelos estadísticos:** statsmodels 0.14.1 (ETS, SARIMA), scikit-learn 1.4.0, scipy 1.12.0, numpy 1.26.4, pandas 2.2.0
- **Persistencia:** supabase 2.3.0 (cliente)
- **LLM:** DeepSeek (`https://api.deepseek.com/chat/completions`) vía httpx 0.27.0
- **Config:** pydantic-settings 2.2.0, carga `.env` desde `/backend/.env`
- **Tests:** pytest 8.1.0 + pytest-asyncio 0.23.5 (sin tests escritos aún)

### 1.3 Endpoints expuestos (prefix `/api/v1`)

| Método | Ruta | Archivo | Estado |
|---|---|---|---|
| GET | `/api/v1/health` | routes/health.py | ✅ funcional |
| POST | `/api/v1/chat` | routes/chat.py | ⚠️ requiere `DEEPSEEK_API_KEY` — falla con `503 CONFIG_MISSING` si falta |
| POST | `/api/v1/forecast` | routes/forecast.py | ⚠️ **arranca pero no consumido por el frontend.** `app/models/forecast_models.py` y `app/services/forecast_engine.py` existen y exportan los símbolos esperados. Falta validación end-to-end + integración con el frontend. |

### 1.4 Contrato `/api/v1/forecast` (según firma en routes/forecast.py)

**Request (ForecastRequest):**
- `inventory`: estructura no definida todavía (no existe el schema)
- `sales`: estructura no definida
- `horizon_months`: int

**Response (ForecastResponse):**
- `results`: lista por SKU
- `total_skus`: int = len(results)
- `processing_time_ms`: float

**Ejecución:** `await asyncio.to_thread(run_forecast, ...)` — CPU-bound, evita bloquear el event loop.

### 1.5 CORS configurado en `main.py`

Orígenes permitidos:
- `https://data-solutions-hub.com` (prod)
- `http://localhost:5173` (vite dev por defecto)
- `http://localhost:3000` (SalesFlow frontend actual)

Credentials: `false`. Métodos: `GET`, `POST`. Headers: `Content-Type`, `Authorization`.

### 1.6 Config via `.env` en `/backend/.env` (no versionado)

Variables esperadas por `Settings`:
- `APP_ENV` (default: "development")
- `LOG_LEVEL` (default: "INFO")
- `SUPABASE_URL`
- `SUPABASE_SERVICE_KEY`
- `DEEPSEEK_API_KEY` (para chat)
- `ALLOWED_ORIGINS` (override CSV de CORS)

---

## 2. Qué falta para conectar al frontend

### 2.1 Backend (estado actual — abril 2026)

1. ✅ `/backend/app/models/forecast_models.py` existe con los Pydantic models.
2. ✅ `/backend/app/services/forecast_engine.py` existe con la implementación ETS/SARIMA/Ensemble vía statsmodels (más helpers en `arima_model.py`, `ets_model.py`, `ensemble.py`, `model_selector.py`, `outlier_detector.py`, `feature_engineer.py`).
3. ⚠️ Tests: `/backend/tests/` existe pero la cobertura del path forecast es parcial. Validar manualmente con `curl POST /api/v1/forecast` antes de cualquier integración.
4. ⏳ **Persistir forecasts** (opcional): decidir si se guardan en Supabase o son stateless.

### 2.2 Frontend (no existe nada)

1. **Cliente TS:** `/src/lib/forecast-client.ts` con fetch a `/api/v1/forecast`. Validar con Zod el response.
2. **Hook React:** `/src/hooks/useForecast.ts` con cache por SKU + estado loading/error/data.
3. **Variable de entorno:** `VITE_FORECAST_API_BASE` en `.env.local` (default `http://localhost:8000/api/v1`).
4. **Fallback:** si backend devuelve 5xx o timeout, `RendimientoPage` sigue usando forecast local del Worker. El usuario no debe ver error.
5. **UX de latencia:** forecast Python puede tardar segundos (statsmodels es CPU-bound). Loading skeleton por card, no bloqueo global.

### 2.3 Contrato compartido

- Schema Zod en frontend ↔ Pydantic en backend. Idealmente generado desde una sola fuente (OpenAPI del FastAPI exporta JSON Schema; se puede tipar el frontend desde ahí con `openapi-typescript`).

---

## 3. RendimientoPage.tsx — estado actual

- **1805 líneas, 247 KB**
- 51 menciones a "forecast", 2 a ETS, 2 a SARIMA en el código
- **0 llamadas a `fetch()`, 0 `/api/v1`, 0 imports de cliente Python, 0 `useForecast`**
- El forecast que ve el usuario proviene del **Worker off-thread + insight-engine.ts**, 100% en navegador
- Es la página destino natural para la integración futura

---

## 4. Por qué se difiere

[Completar cuando el usuario retome el tema. Posibles razones: prioridad de producto, costos de infra backend, validación de UX local antes de invertir en servidor, dependencia de decisiones de deploy, etc.]

---

## 5. Criterios para retomar

- [x] `forecast_models.py` y `forecast_engine.py` ya existen en backend (verificado abril 2026; el endpoint arranca sin imports rotos).
- [ ] Validar end-to-end que `/api/v1/forecast` responde con SKUs pronosticados y accuracy contra dataset de prueba.
- [ ] Backend deployado y accesible (dev: `localhost:8000`, prod: dominio con CORS correcto).
- [ ] Decisión UX: ¿forecast Python reemplaza al local o convive como opción de mayor precisión?
- [ ] Presupuesto de latencia definido (máximo aceptable por card, estrategia de skeleton).
- [ ] Estrategia de fallback probada (backend caído → forecast local sin romper UI).

---

## 6. Reglas cuando se retome (pre-aprobadas)

- **R-LEGACY-1:** el cliente Python vive en `src/lib/forecast-client.ts`. Nunca en páginas, nunca en componentes.
- **R-LEGACY-2:** si el backend falla (timeout, 5xx, CORS), `RendimientoPage` **NO** debe romper — fallback silencioso al forecast local del Worker.
- **R-LEGACY-3:** contrato I/O tipado con Zod en frontend y Pydantic en backend. Una sola fuente de verdad (preferible OpenAPI → openapi-typescript).
- **R-LEGACY-4:** ninguna fase del Frente Z toca `/backend/` hasta que exista fase dedicada de integración.
- **R-LEGACY-5:** `RendimientoPage` no importa directamente `forecast-client.ts` — pasa por `useForecast` que encapsula cache, fallback y loading.
- **R-LEGACY-6:** el endpoint `/api/v1/chat` (DeepSeek proxy) es **frente independiente**. No mezclar con el frente forecast. Si se activa chat primero que forecast, crear `docs/LEGACY-PYTHON-CHAT.md` aparte.

---

## 7. Riesgos conocidos

1. **Cobertura de tests parcial** — `/backend/tests/` existe pero no garantiza que `forecast` esté validado contra inputs realistas. Cualquier retoma debe empezar por escribir tests de contrato y golden-master del response.
2. **`chat.py` depende de DeepSeek** — vendor lock-in con una API externa. Revisar si se quiere abstraer a interfaz neutral antes de conectarlo.
3. **Supabase service_key en `Settings`** — si se filtra, compromiso total de la BD. No commitear `.env`, no exponer en logs.
4. **Divergencia de versiones:** statsmodels 0.14.1 es de inicios 2024. Revisar CVEs y actualizaciones antes de reactivar.
5. **Sin contrato OpenAPI/Zod compartido** — el frontend y backend no comparten una fuente de verdad de tipos. Antes de conectar, idealmente generar tipos TS desde el OpenAPI del FastAPI.

---

## 8. Contacto / ownership

[Completar cuando el usuario retome. Responsable de backend, responsable de integración frontend, SLAs esperados.]
