---
title: "ADR-003: useStoreHydrated para Timing de Hydration"
status: accepted
date: 2026-03-27
tags: [adr, zustand, hydration]
---

# ADR-003: Zustand Hydration Timing Fix

## Contexto
Bug en producción: al hacer refresh, `dataSource` leía como `'none'` (valor default de Zustand) antes de que el persist middleware terminara de rehydratar desde localStorage. Esto causaba que `useAutoLoad()` interpretara que no había datos y redirigiera prematuramente a `/cargar`, aunque el usuario ya tenía datos cargados.

## Síntoma
1. Usuario carga datos → `dataSource = 'real'` → funciona
2. Refresh → Zustand inicializa con `dataSource = 'none'` (default)
3. `useAutoLoad` ve `'none'` → redirect a `/cargar`
4. Zustand rehydrate completa (tarde) → `dataSource = 'real'` pero ya redirigió

## Decisión
Crear `useStoreHydrated()` hook que bloquea el render hasta que Zustand termine de rehydratar:

```typescript
// Espera a que onRehydrateStorage complete
const hydrated = useStoreHydrated();
if (!hydrated) return <LoadingOverlay />;
// Ahora sí es seguro leer dataSource
```

## Alternativas consideradas
1. **setTimeout / delay** — Descartado: race condition, no determinístico
2. **onRehydrateStorage callback** — Base de la solución, pero necesitaba un hook que bloqueara render
3. **useStoreHydrated (elegido)** — Escucha `onRehydrateStorage`, expone boolean, bloquea tree

## Consecuencias
- ✅ Elimina race condition de hydration
- ✅ Loading overlay visible durante rehydrate (~50-100ms)
- ✅ `useAutoLoad` siempre lee valores reales, no defaults
- ⚠️ Flash de loading screen en cada refresh (imperceptible en práctica)

Ver: [[Persistencia]]
