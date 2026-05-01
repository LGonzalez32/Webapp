---
name: regression-sweep
description: Detecta regresiones silenciosas tras un refactor (Z.X u otro). Ejecuta diff vs main/HEAD anterior y delega a un subagente Explore que marca fallback removidos, edge-cases borrados, optimizaciones rotas o detectores eliminados. Úsalo después de cada fase grande antes de commit. Trigger: "/regression-sweep" o "barrer regresiones".
---

# Regression Sweep

Tras un refactor grande, regresiones silenciosas son la causa #1 de bugs en SalesFlow. Este skill levanta un subagente que audita el diff y reporta sólo lo sospechoso.

## Pasos

1. Determinar baseline: `git rev-parse main` o último commit antes de la fase.
2. Levantar `Agent` (Explore, "very thorough") con este prompt:

   > Audita el diff entre `<baseline>` y HEAD en este repo (SalesFlow). Reporta SÓLO lo siguiente, en bullets cortos:
   > - Fallbacks removidos (catch/else/?? o defaults eliminados)
   > - Edge-cases borrados (`if (!x)`, `if (length === 0)`, validaciones zod, isNaN)
   > - Detectores/insights eliminados o desconectados de pipeline
   > - Optimizaciones rotas (memo/cache/break temprano que ya no aplica)
   > - Cambios en orden/tipos de comparación de períodos (YTD/MTD YoY)
   > - Imports muertos o re-exports rotos
   >
   > NO reportes: refactors estilísticos, renames consistentes, tipos nuevos, tests nuevos. Bajo 250 palabras. Cita archivo:línea.

3. Mostrar al usuario el reporte y preguntar cuáles restaurar antes de commit.

## Cuándo NO usarlo
- Cambios <50 líneas o un solo archivo (lo revisas a ojo).
- Branch ya mergeada (es tarde).
