# CONTEXT.md — SalesFlow

## Stack
Vite + React + TypeScript, Supabase (Postgres + Auth), Tailwind, React Router.

## Reglas de negocio
- Año natural únicamente.
- Comparaciones permitidas: MTD vs MTD anterior, YTD vs YTD anterior, ambas
  truncadas al mismo día del mes/año.
- Comparación prohibida: mes en curso (parcial) vs mes cerrado (completo).
- Moneda default: USD.
- Metas pueden estar en USD o en unidades; el usuario lo declara al cargar.
- Aislamiento estricto por organization_id en toda query.

## Convenciones de código
- Funciones de fecha: solo en lib/periods.ts. Prohibido calcular fechas inline.
- Queries a Supabase: solo en lib/db/*. Componentes no llaman al cliente
  de Supabase directamente.
- Tests: tests/unit/* (vitest), tests/e2e/* (playwright).

## Comandos
- Validación pre-commit: npm run sprint-check
- Tests E2E: npm run test:e2e
- Tests unit: npm run test:unit

## Decisiones tomadas (no reabrir sin razón fuerte)
- No exportar PDF aún.
- No guardar conversaciones de chat aún.
- No año fiscal.
- No WhatsApp, no ERP, no comparativa multi-período.
- Mapa solo El Salvador por ahora.
- Página principal = Estado Comercial (resumen). Vista detallada en pestaña.
