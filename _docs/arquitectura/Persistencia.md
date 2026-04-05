---
title: Persistencia de Datos
tags: [arquitectura, persistencia]
updated: 2026-03-29
---

# Persistencia

| Dato | Dónde | Invalida |
|------|-------|----------|
| sales, metas, inventory | IndexedDB `salesflow-cache` (real) / `getDemoData()` (demo) | `clearDatasets()` / `resetAll()` |
| dataSource | localStorage (Zustand persist v6) | `resetAll()` → 'none' |
| selectedPeriod | localStorage (Zustand persist v6) | Manual (TopBar) |
| configuracion | localStorage (Zustand persist v6) | Manual ([[Configuracion]]) |
| orgId | localStorage (Zustand persist v6) | `resetAll()` |
| vendorAnalysis, teamStats, insights... | Zustand (memoria) | `isProcessed=false` |
| chatMessages | Zustand (memoria) | `resetAll()` / refresh |
| analysisMap (inline IA) | `useState` local por página | Navegar fuera |
| Auth session | Supabase interno | `signOut()` |
| Archivos CSV/XLSX | Supabase Storage `org-data` | `deleteOrgFiles()` |
| Pivot dimensions | localStorage `sf_pivot_dims` | Manual (drag-drop) |

## Flujo de refresh

1. Zustand rehydrate (localStorage) → `dataSource`
2. `useStoreHydrated()` bloquea render hasta rehydrate completo
3. `useAutoLoad()`:
   - `demo` → `getDemoData()` → store
   - `real` → IndexedDB → store
   - `none` + auth → Supabase Storage → store
   - `none` + no auth → redirect `/cargar`
4. `isProcessed = false` → `analysisWorker` re-ejecuta con datos restaurados

## IndexedDB

- DB name: `salesflow-cache`
- Stores: `sales`, `metas`, `inventory`
- Wrapper: `src/lib/dataCache.ts`
- Métodos: `saveDatasets()`, `loadDatasets()`, `clearDatasets()`
- Capacidad: varios MB sin problema (vs. ~5MB límite de localStorage)

## Zustand persist

- Key: `salesflow-storage`
- Version: 6
- Solo persiste: `selectedPeriod`, `configuracion`, `orgId`, `dataSource`
- No persiste: arrays de datos, computed analysis, chatMessages

Ver: [[ADR-002 IndexedDB Persistencia]], [[ADR-003 Zustand Hydration]]
