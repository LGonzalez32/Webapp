# SalesFlow — Monitor de Riesgo Comercial

B2B SaaS para empresas con equipos de ventas. Detecta riesgos comerciales
antes de que afecten resultados. **No es un dashboard BI** — es un motor
de decisiones que produce insights ejecutivos accionables.

## Stack

- React 19 + TypeScript + Vite
- Zustand v5 (estado), Recharts (gráficas), Tailwind v4 (estilos)
- PapaParse + XLSX (ingesta), Zod (validación)
- DeepSeek API para el chat conversacional

Detalle completo y reglas de desarrollo: [`CLAUDE.md`](./CLAUDE.md).

## Cómo correrlo localmente

**Requisitos:** Node.js 20+.

```bash
npm install
npm run dev          # http://localhost:3000
npm test             # vitest
npx tsc --noEmit     # type check
```

La app arranca con un dataset demo (Los Pinos S.A. — 8 vendedores,
~94k filas, abril 2024 a abril 2026). No requiere backend ni base de
datos para explorarla.

## Documentación interna

| Archivo | Para qué |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Reglas operativas, ownership documental, read order |
| [`docs/MANIFIESTO-MOTOR-INSIGHTS.md`](./docs/MANIFIESTO-MOTOR-INSIGHTS.md) | Pipeline canónico del motor de insights, baseline operacional |
| [`docs/ROADMAP-Z11-PIPELINE-BASELINE.md`](./docs/ROADMAP-Z11-PIPELINE-BASELINE.md) | Roadmap activo para reconciliar baseline worker/page antes de tocar gate o ranker |
| [`docs/BASELINE-Z11-0.md`](./docs/BASELINE-Z11-0.md) | Plantilla/artefacto de baseline real del pipeline de insights |
| [`docs/GLOSARIO-MOTOR-INSIGHTS.md`](./docs/GLOSARIO-MOTOR-INSIGHTS.md) | Mapa compacto de "dónde va cada cosa" |
| [`docs/historico/`](./docs/historico/) | Documentación histórica preservada |

## Backend

Hay un servicio Python FastAPI en [`backend/`](./backend/) que está
**construido pero no conectado al frontend**. Forecast con ETS/SARIMA/Ensemble.
Ver [`backend/README.md`](./backend/README.md) para estado actual.

## Estructura

```
src/
  lib/           Motor de insights, parser, análisis, store helpers
  pages/         9 rutas activas (dashboard, vendedores, clientes, etc.)
  components/   UI compartida
  store/         Zustand
  types/         Tipos canónicos del modelo
docs/            MANIFIESTO + GLOSARIO + auditorías
backend/         FastAPI legacy
```

## Privacidad

Los datos del cliente se procesan en el navegador (Web Worker). El
único servicio externo activo es DeepSeek para el chat. Las claves
viven en `backend/.env` (gitignored), nunca en el repo.
