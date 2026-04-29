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

## Reglas operativas para sesiones de Claude Code

### Anti-archivos huérfanos
Antes de cerrar cualquier sesión donde se haya creado un archivo nuevo,
verificar que esté trackeado:
- `git ls-files <path>`  → debe retornar el path.
Si NO está trackeado pero ya hay imports apuntando a él en archivos
commiteados, HEAD se rompe en clones nuevos. Caso ya ocurrido dos veces
(`dim-relationships.ts`, `insightAdapter.ts`).

### Working tree no es memoria
Cualquier trabajo que viva solo en working tree sin commit pierde
contexto rápido. Si una sesión termina con archivos modificados sin
commitear, dejar al menos un commit de WIP con cuerpo descriptivo
("WIP: refactor X, paso 3/7, falta hacer Y") en lugar de cerrar
silenciosamente. Vale más un commit que reescribir luego que un
working tree con 35 archivos cuyo propósito ya nadie recuerda.

### Triage periódico
Si `git status` reporta más de ~10 archivos modificados o más de ~3
untracked sin razón clara, frenar nuevos tickets y hacer triage
(ticket 1.4.5 como referencia).
