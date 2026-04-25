# SalesFlow Forecast Engine — ⚠️ LEGACY DIFERIDO

> Este backend **NO está conectado** al frontend activo de SalesFlow.
> No lo modifiques sin leer antes `/docs/LEGACY-PYTHON-FORECAST.md`.

## Estado

- FastAPI 0.110 sobre Python 3.11
- Endpoints bajo `/api/v1`: `health`, `chat` (DeepSeek proxy), `forecast` (ETS/SARIMA/Ensemble con statsmodels)
- Estructura: `app/models/forecast_models.py` y `app/services/forecast_engine.py` existen y exportan los símbolos esperados; el endpoint `forecast` arranca sin imports rotos.
- El frontend no consume `forecast` todavía: las páginas de rendimiento/forecast usan datos del store, no del backend.

## Cómo levantarlo localmente (si alguien lo necesita)

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env   # completar DEEPSEEK_API_KEY si se quiere probar chat
uvicorn main:app --reload --port 8000
```

Luego probar: `curl http://localhost:8000/api/v1/health`

## Docker

```bash
docker build -t salesflow-forecast .
docker run -p 8000:8000 --env-file .env salesflow-forecast
```

## No tocar sin...

1. Leer `/docs/LEGACY-PYTHON-FORECAST.md` completo.
2. Confirmar con el owner del proyecto que se está retomando el frente.
3. Crear fase dedicada en el manifiesto (fuera del Frente Z).

## Qué ES parte activa del proyecto

Todo el motor de insights vive en `/src/lib/`. Para el detalle ver
`docs/MANIFIESTO-MOTOR-INSIGHTS.md` y `docs/GLOSARIO-MOTOR-INSIGHTS.md`.
Resumen rápido:

- `insight-engine.ts` — pipeline canónico (detectores → ranker/cap → gate)
- `insightStandard.ts` — gate canónico Z.12 (`evaluateInsightCandidate`)
- `decision-engine.ts` — chains + executive compression Z.9
- `domain-aggregations.ts` — agregaciones de ventas
- `narrative-builder.ts` / `diagnostic-actions.ts` — narrativa + sanitizadores

Nada aquí depende del backend Python.
