---
title: "ADR-002: Datos en IndexedDB, no localStorage"
status: accepted
date: 2026-03-26
tags: [adr, persistencia]
---

# ADR-002: IndexedDB para Persistencia de Datos

## Contexto
Los datasets de ventas pueden tener miles de registros (18 meses × 8 vendedores × múltiples transacciones). localStorage tiene un límite de ~5MB que se alcanza fácilmente. Guardar en Supabase PostgreSQL implicaría diseñar tablas para raw sales y gestionar sincronización bidireccional.

## Decisión
Usar IndexedDB (via `dataCache.ts`) para persistir `sales`, `metas` e `inventory` cuando `dataSource === 'real'`. Para `dataSource === 'demo'`, regenerar datos con `getDemoData()` en cada mount. Zustand persist solo guarda metadatos ligeros (`selectedPeriod`, `configuracion`, `orgId`, `dataSource`).

## Alternativas consideradas
1. **localStorage** — Descartado: límite de 5MB, serialización JSON lenta para arrays grandes
2. **Supabase DB (raw sales en PostgreSQL)** — Descartado: no queremos persistir CSV raw en la DB, complejidad de sync, costos de storage
3. **Supabase Storage (CSV files)** — Implementado como fallback: los archivos originales sí se guardan en Storage para compartir entre miembros
4. **IndexedDB (elegido)** — Sin límite práctico, API async nativa, no bloquea UI

## Consecuencias
- ✅ Sin límite de tamaño práctico
- ✅ Persist/restore rápido para datasets medianos
- ✅ Separación clara: metadatos en localStorage, datos en IndexedDB
- ⚠️ Datos son per-browser (no se comparten entre dispositivos sin Supabase Storage)
- ⚠️ Clear cache del browser elimina todo

## Implementación
- DB: `salesflow-cache`
- Stores: `sales`, `metas`, `inventory`
- `saveDatasets()`: guarda los 3 arrays
- `loadDatasets()`: restaura los 3 arrays
- `clearDatasets()`: limpia todo

Ver: [[Persistencia]], [[CargarDatos]]
