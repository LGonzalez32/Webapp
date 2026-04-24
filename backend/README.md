# SalesFlow Forecast Engine — ⚠️ LEGACY DIFERIDO

> Este backend **NO está conectado** al frontend activo de SalesFlow.
> No lo modifiques sin leer antes `/docs/LEGACY-PYTHON-FORECAST.md`.

## Estado

- FastAPI 0.110 sobre Python 3.11
- Endpoints bajo `/api/v1`: `health`, `chat` (DeepSeek proxy), `forecast` (ETS/SARIMA/Ensemble con statsmodels)
- ⚠️ **`forecast.py` rompe al arrancar** por imports faltantes (`forecast_models`, `forecast_engine`). Comentar su inclusión en `main.py` si se quiere levantar el server.
- Última revisión: 17 abril 2026

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

Todo el motor de insights vive en `/src/lib/`:
- `insight-engine.ts` — motor nuevo (activo)
- `diagnostic-engine.ts` — motor viejo (en proceso de absorción por Frente Z.2)
- `insightStandard.ts` — estándares compartidos
- `domain-aggregations.ts` — agregaciones de ventas (R102)
- `diagnostic-actions.ts` — sanitizadores narrativos R68–R101

Nada aquí depende del backend Python.
