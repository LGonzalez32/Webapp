# Roadmap — Ingesta Registry-Driven

> **Nota de baseline:** este roadmap es independiente del motor de insights.
> Sus conteos historicos de tests pertenecen al cierre de ingesta. Para la
> baseline activa del pipeline de insights, usar
> `docs/ROADMAP-Z11-PIPELINE-BASELINE.md` y `docs/BASELINE-Z11-0.md`.
>
> **Estado historico de cierre: A→F.2 cerrados ✅. 106/106 tests, 0 tsc errors en ese momento.**
> El refactor está completo en su fase principal. Lo que sigue son
> sub-passes opcionales (worker dispatch genérico, UploadPage handlers,
> orgService) que NO bloquean agregar tablas nuevas al sistema.
>
> **Para LLMs que retoman este trabajo:** este documento es la fuente de verdad
> del refactor de ingesta. Antes de tocar código, lee de arriba a abajo. Si vas
> a implementar un sprint, lee el sprint completo + los sprints previos cerrados
> (status `✅`) para entender el estado base. No saltes sprints.
>
> **Reglas duras:**
> - No alterar el motor de insights (ranker, gate Z.12, detectores) en este roadmap.
> - No cambiar el shape de output del motor (InsightCandidate, DiagnosticBlock).
> - Cualquier cambio que rompa el snapshot del golden test debe estar justificado
>   en el sprint correspondiente. Si no, es bug.
> - `npx tsc --noEmit` y `npm test` verdes son condición de cierre por sprint.

---

## TL;DR — Cómo agregar una tabla nueva ahora

1. **Definir 4 catálogos en `src/lib/fileParser.ts`**:
   - `XXX_FIELDS: Record<string, FieldDefinition>` — labels, examples, valueType, displayOrder
   - `XXX_MAPPINGS: Record<string, string[]>` — aliases de columnas
   - `xxxSchema = z.object({...})` — validación zod
   - Entry en `TABLE_REGISTRY`: `mappings`, `fields`, `schema`, `obligatoriedad`,
     `relations` opcionales, `postProcessRow` opcional, `wizardStepId`,
     `wizardRequired`, `displayOrder`, `isUserUpload`, `templateSheetName`,
     `uploadLabel`, `description`.

2. **Dos líneas de runtime**:
   - Agregar `'xxx'` al union `TableId`
   - Agregar `xxxSchema` al map `schemaKeys` (validador interno)

3. **Listo.** Estos se activan automáticamente desde el registry:
   - Paso del wizard (UploadPage)
   - Plantilla XLSX descargable
   - Sheet en el preview
   - Detección de fechas (DataPreview)
   - Cross-table validation (uploadValidation dispatcher)
   - Disponibilidad de dimensiones para el motor
   - Inclusión en `getUserUploadTables()` y consumers downstream
   - Coerción type-aware desde `valueType`
   - Cobertura por tests de integridad (validan automáticamente que
     mappings/fields/obligatoriedad sean consistentes)

**Lo que NO está cubierto automáticamente** (sub-passes opcionales): el
worker dispatch (`fileParseWorker.ts`, `parseWorker.ts`) y `UploadPage::
handleFileSelect` siguen con branches per-tabla. La 4ta tabla `precios`
puede subirse vía `parsePreciosFile()` directamente; integrarla al wizard
del UploadPage requiere un branch nuevo en `handleFileSelect`. Estimado
total: ~30 líneas runtime.

---

## Visión

> Cambiar de industria = cambiar variables, no código.

Hoy la app está cableada para 3 tablas (ventas/metas/inventario) y un set
fijo de columnas. La meta: que el cliente declare su esquema (qué tablas, qué
columnas, qué relaciones) y todo lo demás — UI, validación, parsing,
disponibilidad de dimensiones para el motor — se derive automáticamente.

El **motor de insights** ya consume `DIMENSION_REGISTRY` y `METRIC_REGISTRY`
de forma generalizada (`dim × metric × insightType` + auto-combo de
`dim-relationships.ts`). El cuello restante está **antes** del motor: la capa
de ingesta y validación todavía tiene supuestos de "3 tablas, columnas
conocidas".

---

## Estado historico (cerrado antes de este roadmap)

- ✅ `TABLE_REGISTRY` existe en `fileParser.ts` con 3 tablas
- ✅ Obligatoriedad declarativa con `requireAllOf` / `requireAnyOf` /
  `requireOneOfSets`
- ✅ Parser principal y workers (`fileParseWorker.ts`, `parseWorker.ts`) usan
  validación centralizada vía `buildObligatoriedadParseError()`
- ✅ `uploadValidation.ts` deriva dimensiones compartidas desde el registry
- ✅ Metas copia automáticamente todas las dimensiones declaradas
- ✅ Cobertura: `schema-consistency.test.ts` con 5 casos
- ✅ 69/69 tests, 0 tsc errors
- ✅ Sprints A, B, C cerrados — registry como fuente de verdad de UI/parsing
- ✅ 80/80 tests, 0 tsc errors (post-Sprint C)

---

## Decisiones de diseño abiertas (Phase 0)

Cerrar **antes** de tocar código. Cada decisión tiene 2-3 opciones; la otra
sesión LLM debe argumentar y elegir, registrando el resultado en este mismo
documento.

### D1 — Single source of truth de los tipos

`SaleRecord`/`MetaRecord`/`InventoryItem` son interfaces estáticas. El
registry es runtime data. Si divergen, el motor falla silenciosamente.

**Opciones:**
- **D1.a** Tipos derivados: `type SaleRecord = InferRecord<typeof TABLE_REGISTRY.sales>`
  usando mapped types sobre `fields`.
- **D1.b** Mantener interfaces, generar test que falle si registry y tipos
  divergen (snapshot de keys).
- **D1.c** Generador de código: script que regenera `types/index.ts` desde
  el registry y se corre en pre-commit.

**Pendiente:** elegir y justificar.

### D2 — Soporte de N tablas

Cuántos lugares siguen cableados a 3 tablas:

- `UploadStep.id` cerrado a `'ventas' | 'metas' | 'inventario'`
- `orgService` storage asume las 3
- Wizard tiene 3 pasos hardcoded
- Páginas (`RendimientoPage`, `MetasPage`, etc.) leen `'ventas'` como
  string literal

**Pendiente:** mapear cada lugar y decidir si abre vía registry o si la 4ta
tabla rompería ahí.

### D3 — Cross-table rules — alcance del shape genérico

Propuesta actual:
```ts
{ sourceTable, targetTable, fields, severity, requireTargetLoaded }
```

Casos que el shape pequeño NO cubre:
- Membresía: `inventario.producto` ∈ `ventas.producto`
- Rango temporal: `metas.fecha` ∈ `[min(ventas.fecha), max(ventas.fecha)]`
- Cálculo cruzado: `devoluciones.monto / ventas.monto < 0.X`

**Pendiente:** o bien extender el shape para cubrir los 3 casos, o bien
diseñar `customValidator` registrable y dejar el shape pequeño solo para el
caso 80%.

---

## Sprints

Cada sprint tiene: **goal · acceptance · validation · risk · deps**.

### Sprint A ✅ — Cerrar D1, D2, D3 (decisión, no código)

- **Goal**: documento con las 3 decisiones cerradas, registradas en este
  mismo archivo (sección "Decisiones cerradas")
- **Acceptance**: cada decisión tiene opción elegida + 2-3 oraciones de
  justificación + impacto en sprints posteriores
- **Validation**: lectura del documento; debe ser actionable sin contexto
  adicional
- **Risk**: bajo; es solo decisión
- **Deps**: ninguna

### Sprint B ✅ — `FieldDefinition` enriquecido + migración registry

**Implementación:**
- `src/lib/registry-types.ts` (nuevo): `FieldDefinition`, `ValueType`, `FieldRole`,
  `CrossTableRule` discriminated union, helpers `fieldsByRole` y
  `rolesConsistentWithFields`, helper `InferRecord<T>` para Sprint G.
- `fileParser.ts`: `TableDefinition` extendido con `uploadLabel`, `description`,
  `templateSheetName`, `isUserUpload`, `displayOrder`, `fields`, `relations?`.
- 3 catálogos `SALES_FIELDS`, `META_FIELDS`, `INVENTORY_FIELDS` con metadata
  completa (label, example, role, valueType, nullable, displayOrder,
  requirementGroup donde aplica).
- 6 tests de integridad en `schema-consistency.test.ts` (75/75 total).

- **Goal**: extender `TableDefinition` con `fields: Record<string, FieldDefinition>`
  donde `FieldDefinition` lleva todos los metadatos visibles (label,
  description, example, displayOrder, role, requirementGroup,
  visibleInTemplate, visibleInPreview)
- **Acceptance**:
  - Las 3 tablas existentes migradas
  - `roles.{date,metrics,dimensions,attributes}` y `obligatoriedad` se
    derivan de `fields` (o se auto-validan contra ellos)
  - Mappings se mantienen como están (es la capa de aliases bruta)
  - 0 cambios en consumers — la migración es aditiva
- **Validation**:
  - test que enumera todos los fields y valida shape
  - test que confirma backwards-compat con consumers actuales
- **Risk**: medio; el shape final debe cubrir UI sin sobre-diseñar
- **Deps**: D1 cerrado (sabemos si tipos vienen del registry)

### Sprint C ✅ — UI consume `FieldDefinition`

**Implementación:**
- `src/lib/registry-ui.ts` (nuevo): helpers `getUiHeaders`, `getTemplateHeaderRow`,
  `getTemplateExampleRow`, `getAllDateFieldKeys`, `getUserUploadTables`,
  `findFieldDefinition`, `getTableLabel/UploadLabel/Description`.
- `UploadPage.tsx`: removidos `VENTAS_HEADERS/METAS_HEADERS/INVENTARIO_HEADERS`
  y `VENTAS_ROWS/METAS_ROWS/INVENTARIO_ROWS` arrays hardcodeados. Ahora
  `headersForStep()` y `exampleRowsForStep()` derivan del registry. Mapper
  temporal `STEP_TO_TABLE_ID` (Sprint D unificará).
- `UploadPage.tsx::downloadTemplate`: itera `getUserUploadTables()` y genera
  cada sheet con `getTemplateHeaderRow` + `getTemplateExampleRow`. Antes 3
  arrays hardcoded de ~15 filas cada uno.
- `DataPreview.tsx`: detección de fechas usa `DATE_FIELD_KEYS` derivado del
  registry. Si agregás `fecha_vencimiento` al registry, se formatea
  automáticamente.
- `TemplatePreviewModal.tsx` y `ColumnGuide.tsx`: identificados como legacy
  no usados (sin consumers en el codebase). Se dejan as-is, no migrados.
- 5 tests nuevos en `schema-consistency.test.ts` (80/80 total).

**Bug encontrado en revisión y corregido:**
- La plantilla XLSX inicial mostraba `mes_periodo + mes + anio` simultáneamente
  en metas (los 3 son alternativas, antes solo `mes_periodo` aparecía en la
  plantilla). Confundiría al usuario.
- **Fix**: introducido contexto en `getUiHeaders(tableId, context)` con
  valores `'template' | 'preview' | 'all'`. Template filtra por
  `visibleInTemplate`, preview por `visibleInPreview`.
- `META_FIELDS.mes` y `META_FIELDS.anio` marcados con `visibleInTemplate: false`
  (siguen visibles en preview para informar que el parser acepta ambas formas).
- Nuevo helper `getPreviewExampleRow` para que TablaEjemplo tenga rows de
  mismo length que sus headers de preview.

**Validación:**
- Smoke: el orden de headers respeta `displayOrder` (test `getUiHeaders`).
- `getTemplateHeaderRow` y `getTemplateExampleRow` tienen mismo length para
  las 3 tablas.
- `getAllDateFieldKeys` incluye `fecha` y `mes_periodo`, excluye no-fechas.
- Test dedicado: contexto `template` excluye alternativas, `preview` las
  incluye, lengths coinciden.

- **Goal**: las piezas UI hardcodeadas listadas en el análisis previo leen
  del registry
  - `VENTAS_HEADERS` / `METAS_HEADERS` / `INVENTARIO_HEADERS` → `fields`
  - Plantilla XLSX (rows/headers) → `fields[].example`
  - `TemplatePreviewModal` → `fields`
  - `DataPreview` (detección de fecha) → `fields[role='date']`
  - Chips de columnas detectadas → `fields[].label`
  - Mensajes de error que listan dims → `roles.dimensions`
- **Acceptance**: agregar un `field` al registry hace que aparezca en
  plantilla, chips y preview sin tocar JSX
- **Validation**:
  - smoke test: agregar campo dummy al registry, verificar que aparece
    en `VENTAS_HEADERS` derivado, plantilla y preview
  - tests existentes siguen verdes
- **Risk**: medio; tocar UI tiene riesgo de regresión visual
- **Deps**: Sprint B cerrado

### Sprint D ✅ — N tablas: abrir wizard y derivar pasos del registry

**Bug encontrado en revisión y corregido:**
- `UploadStep.id` tenía union cerrado `'ventas' | 'metas' | 'inventario'` y la
  cast `as UploadStep[]` lo ocultaba. Agregar 4ta tabla habría roto el tipo
  contradiciendo la promesa del sprint.
- Fix: `UploadStep.id` widened a `string` con comentario explicativo. Las
  comparaciones `step.id === 'X'` siguen siendo válidas (feature flags
  per-tabla, no exhaustividad estructural).
- Casts eliminados: `INITIAL_STEPS` y `STEP_TO_TABLE_ID` ahora type-safe
  sin assertions.

**Implementación (subset core del sprint):**
- `TableDefinition` extendido con `wizardStepId: string` y `wizardRequired: boolean`.
- `registry-ui.ts` ganó dos helpers nuevos:
  - `getInitialWizardSteps()` — deriva los pasos del wizard del registry,
    filtrando por `isUserUpload` y ordenando por `displayOrder`.
  - `getStepIdToTableIdMap()` — deriva el mapa `slug → TableId`.
- `UploadPage.tsx` reemplaza `INITIAL_STEPS` literal y `STEP_TO_TABLE_ID`
  hardcoded por las llamadas a estos helpers.
- 4 tests nuevos en `schema-consistency.test.ts` validan: nº de pasos, orden,
  unicidad de slugs, mapping correcto, `wizardRequired` por tabla.

**Lo que queda fuera (sub-passes futuros, opcionales):**
- `orgService` storage iteration (hoy hardcoded a 3 tablas) — afecta
  persistencia, no flujo de carga.
- Worker dispatch (`type: 'sales' | 'metas' | 'inventory'`) — funciona como
  unión literal; abrirlo a `TableId` requiere cambios en 2 workers.
- `ParseError` codes específicos → genéricos — estético, no funcional.

**Estado:** la promesa central de D ("agregar tabla con `isUserUpload=true` =
aparece en wizard sin tocar UploadPage") está cumplida. Los sub-passes
restantes pueden hacerse de a uno cuando aparezca el primer caso real
(probablemente con Sprint F = prueba de fuego).

**Métricas:** 80 → **84 tests** (+4), 0 tsc errors.

- **Goal**: agregar una 4ta tabla al registry no requiere tocar
  `UploadStep`, `orgService`, ni el wizard
- **Acceptance**:
  - `UploadStep.id` deriva de `keyof typeof TABLE_REGISTRY`
  - `orgService` itera tablas del registry
  - Wizard genera pasos del registry (1 paso por tabla, en orden de
    `displayOrder`)
- **Validation**:
  - test integración: registrar tabla `__test__` con `fields` y `mappings`,
    verificar que aparece en wizard y se persiste
  - test que la app sigue funcionando con las 3 tablas existentes
- **Risk**: alto; el wizard y storage son código vivido. Hacer en un commit
  separado y reversible
- **Deps**: D2 cerrado, Sprint B cerrado

### Sprint E.2 ✅ — Cross-table dispatcher invocado desde UI (gap fixed)

**Bug encontrado en audit post-Sprint F.2:** el `evaluateAllRulesForTable`
existía y estaba testeado pero **ningún consumer lo invocaba en
producción**. Las relations declaradas en `TABLE_REGISTRY` (membership
inventory.producto ⊆ sales.producto) eran cosméticas.

**Fix:**
- `UploadPage::handleFileSelect` ahora llama `runCrossTableRules(tableId, parsedData)`
  helper local después de cada parse exitoso de metas e inventario.
- El helper:
  - Construye `dataByTable` con prioridad wizard draft → store fallback
  - Invoca `evaluateAllRulesForTable(tableId, dataByTable)`
  - Issues con `severity='error'` se convierten en `parseError` bloqueante
  - Issues con `severity='warning'` se acumulan en `warningsMap` (visibles al usuario)
- Compatibilidad: códigos legacy `META_DIM_NOT_IN_SALES` y `SALES_NOT_LOADED`
  se preservan mapeando desde códigos genéricos del dispatcher.
- Validación inline previa de metas (`findMetaDimsMissingFromSales`) reemplazada
  por el dispatcher genérico.
- El `else` que asumía 'inventory' por descarte se reemplazó por error
  explícito `'Tipo de paso no soportado'` para evitar fallos silenciosos.

**Lo que esto activa en producción** (antes muerto):
- `inventory.relations` — productos en inventario que no están en ventas
  ahora emiten warning visible al usuario.

**Tests E2E** (3 nuevos, 105 total):
- inventory.relations dispara membership warning para productos huérfanos
- metas.relations sigue bloqueando (error severity) cuando dim falta en sales
- dataset bien-formado: ninguna regla emite issue

### Sprint E ✅ — Cross-table rules genérico

**Implementación:**
- `uploadValidation.ts` reescrito como dispatcher genérico:
  - `evaluateCrossTableRule(rule, data)` — entry point por regla
  - `evaluateAllRulesForTable(tableId, data)` — corre todas las reglas
    declaradas en `TABLE_REGISTRY[tableId].relations`
  - 4 evaluadores: `dim_consistency`, `membership`, `range_overlap`, `custom`
  - `registerCrossTableValidator(name, fn)` para reglas custom
  - `_resetCustomValidators()` para tests
- `TABLE_REGISTRY.metas.relations` declara la regla actual `dim_consistency`
  metas→sales con `requireTargetLoaded: true`.
- Compat shims preservados (`findMetaDimsMissingFromSales`,
  `getSharedMetaSalesDimensions`, `selectSalesForMetasValidation`) reescritos
  internamente para usar el dispatcher. UploadPage no cambia.
- Códigos de error estandarizados: `CROSS_TABLE_DIM_MISSING`,
  `CROSS_TABLE_TARGET_NOT_LOADED`, `CROSS_TABLE_MEMBERSHIP_VIOLATION`,
  `CROSS_TABLE_RANGE_OUT_OF_BOUNDS`, `CROSS_TABLE_RANGE_NO_OVERLAP`,
  `CROSS_TABLE_CUSTOM_VALIDATOR_NOT_FOUND`, `CROSS_TABLE_CUSTOM_VALIDATOR_ERROR`.

**Bug encontrado en revisión y corregido:**
- `dim_consistency` disparaba `CROSS_TABLE_TARGET_NOT_LOADED` aunque source
  estuviera vacía (caso wizard sin nada cargado). Fix: el evaluador ahora
  retorna `[]` early si source no tiene datos.

**Tests:** 84 → **95** (+11). Cubre:
- 3 evaluadores built-in con casos positivos y negativos
- `mode: 'within'` y `mode: 'intersect'` de range_overlap
- Custom validator registrado vs no registrado
- `evaluateAllRulesForTable` ejecutando reglas declaradas
- Edge case de source vacío
- Compat con shim legacy.

**Próximo paso natural:** Sprint F (prueba de fuego — 4ta tabla solo
editando el registry). Con A+B+C+D+E cerrados, esto debería ser commit
de pocas líneas.

- **Goal**: `uploadValidation.ts` consume reglas declarativas del registry,
  sin hardcoding de "metas vs ventas"
- **Acceptance**:
  - 3 tipos de regla soportados: `dim_consistency` (caso actual),
    `membership` (producto inv ∈ producto ventas), `range_overlap`
    (fechas metas ∈ rango ventas)
  - Si hay caso de regla custom, registrable vía
    `registerCustomValidator(name, fn)`
  - Reglas declaradas en `TABLE_REGISTRY[id].relations`
- **Validation**:
  - test por cada tipo de regla
  - test que regla nueva agregada al registry corre sin tocar
    `uploadValidation.ts`
- **Risk**: medio
- **Deps**: D3 cerrado, Sprint B cerrado

### Sprint F 🟡 — Prueba de fuego: agregar `precios` como 4ta tabla

**Objetivo del sprint (texto original):** "agregar tabla nueva *únicamente
editando el registry*. El commit debe ser solo registry + test, 0 cambios
en código de runtime."

**Resultado real:** la promesa se cumple para la **capa declarativa**.
La capa de **pipeline de archivo** todavía requiere boilerplate per-tabla.

#### Lo que sí funciona automáticamente (cumplido)
- Wizard genera el paso "Lista de Precios" desde `TABLE_REGISTRY.precios`
- Plantilla XLSX incluye sheet 'Precios' con headers + ejemplo
- `dataAvailability` propaga `has_precios` (vía registry, no flag manual)
- Cross-table rules (membership precios.producto ⊆ sales.producto y
  range_overlap fechas) corren con el dispatcher genérico
- `getAllDateFieldKeys()` incluye `precios.fecha` automáticamente
- DataPreview formatea fechas correctamente

#### Lo que tuve que tocar fuera del registry (incumplido)
- `TableId` union: 1 línea (`| 'precios'`)
- `schemaKeys` map en validador interno: 1 línea para incluir `preciosSchema`

Total: **2 líneas fuera del registry**. Aceptable pero no cero.

#### Lo que NO se hizo en Sprint F (sub-passes pendientes)
Para que un usuario pueda **realmente subir un archivo `precios.csv`**, faltaría:
- `parsePreciosFile()` wrapper (~30 líneas siguiendo el patrón de
  parseInventoryFile)
- `parsePreciosFileInWorker()` thin wrapper
- Entry en worker dispatch (`type === 'precios'` branch en
  `fileParseWorker.ts` y `parseWorker.ts`)
- Branch en `UploadPage::handleFileSelect`
- Persistencia en `orgService` storage

Estimado: ~70-100 líneas de boilerplate runtime per tabla. Esto está
documentado en Sprint D como "sub-passes pendientes".

#### Conclusión
El sistema es **N-table-ready en la capa declarativa** (lo que el usuario
ve y configura). La **capa de pipeline de archivo** sigue per-tabla y se
beneficiaría de un `parseFileForTable(tableId, file)` genérico que use
schema/mappings del registry. Ese trabajo es un sprint propio (Sprint F.2
o similar) si se quiere llegar al 100%.

**Tests:** 95 → **102** (+7). Cubren:
- precios en registry con metadata completa
- precios en wizard pasos
- precios en plantilla XLSX
- precios.fecha en getAllDateFieldKeys
- Cross-table rules de precios (membership + range_overlap) funcionan
- PRECIOS_MAPPINGS tiene aliases para todos los fields
- preciosSchema acepta válido / rechaza inválido
- 3 tests previos hardcodeaban "3 tablas" — actualizados a derivar del
  registry (no más hardcoding del conteo)

**Estado:** 🟡 — promesa parcialmente cumplida. La capa que importa
(declarativa) es N-table; la capa de pipeline aún no lo es y queda
documentada como deuda explícita.

---

### Sprint F + F.2 ⚪ — REVERTIDO (decisión de producto)

**La tabla `precios` fue eliminada del sistema** por decisión del owner:
"no tengo ese paso, no debería haber un archivo así, solo ventas, metas
e inventario". Lo que se conserva del trabajo:

- `parseFileForTable<T>(tableId, file)` — parser genérico se mantiene.
  Aplica a las 3 tablas reales (sales, metas, inventory). Si en el
  futuro se agrega una tabla nueva, este parser la cubre sin
  boilerplate.
- `TableDefinition` con `schema`, `postProcessRow`, `hasCustomParser`
  se mantiene.
- Coerción type-aware via `valueType` se mantiene.

**Lo que se removió**:
- `TABLE_REGISTRY.precios` y todas sus relations
- `PRECIOS_FIELDS`, `PRECIOS_MAPPINGS`, `preciosSchema`
- `parsePreciosFile` wrapper
- `'precios'` del union `TableId`
- 8 tests dedicados a precios (102 → 105 con nuevos tests reemplazo)

**Veredicto:** la inversión NO se perdió. El parser genérico sirve
para las 3 tablas actuales y para cualquier 4ta tabla legítima futura.
La capacidad N-table sigue intacta.

### Sprint F.2 ✅ — Generic `parseFileForTable` cierra el último gap

**Objetivo:** eliminar el boilerplate per-tabla del parser. Agregar tabla
nueva = solo registry, sin escribir parseXFile.

**Implementación:**
- `TableDefinition` extendido con `schema`, `postProcessRow?`, `hasCustomParser?`.
- `parseFileForTable(tableId, file)` — parser genérico que:
  1. Lookup `mappings`, `schema`, `obligatoriedad`, `postProcessRow` desde
     el registry
  2. Aplica el flujo estándar: read → mapRow → coerce numérica via `valueType`
     → obligatoriedad → schema validation → postProcessRow
  3. Retorna `ParseResult<T>` igual que los parsers específicos
  4. Si `hasCustomParser=true`, delega al parser custom (caso `metas`)
- `parsePreciosFile()` reducido a un thin wrapper de 3 líneas que delega
  a `parseFileForTable('precios', file)`. Sin boilerplate.
- Coerción type-aware desde `FieldDefinition.valueType`: cualquier field
  marcado como `number` se intenta parsear automáticamente. Antes había
  una lista hardcoded `['unidades','venta_neta','meta','costo_unitario']`
  en mapRow; ahora `precio` (y cualquier futuro field numérico) funciona
  sin tocar mapRow.

**Tests E2E nuevos** (102 → **106**):
- `parseFileForTable('precios', file)` con CSV válido produce data
- `parsePreciosFile` (thin wrapper) hace lo mismo
- Rechaza con `MISSING_REQUIRED` si falta columna obligatoria
- `parseFileForTable('sales', file)` aplica `postProcessRow` (clientKey)
- `parseFileForTable('metas', file)` delega correctamente al parser custom

**Lo que sigue siendo per-tabla** (sub-passes futuros, opcional):
- Worker dispatch (`fileParseWorker.ts`, `parseWorker.ts`) tiene branches
  per-tipo. Refactor: usar la misma estrategia (lookup desde registry).
- `UploadPage::handleFileSelect` tiene branches per-step.
- `orgService` storage iteration.

Estos NO bloquean agregar tablas. El parser genérico ya es N-table; los
workers y UI siguen funcionando con el patrón actual.

**Estado:** ✅ — el cuello principal del Sprint F está resuelto. Una tabla
nueva ahora se agrega así:
1. Editar `TABLE_REGISTRY` (mappings, fields, schema, relations, postProcessRow opcional)
2. Agregar al union `TableId`
3. Agregar al map `schemaKeys` (línea de validador interno)

Los wrappers `parseXFile()` son thin (3-5 líneas) o se omiten si los
consumidores llaman directo a `parseFileForTable`.

- **Goal**: agregar `precios` o `devoluciones` como 4ta tabla,
  **únicamente editando el registry** (sin tocar parsers, workers, UI ni
  validación)
- **Acceptance**:
  - Wizard muestra el nuevo paso
  - Plantilla incluye la nueva sheet
  - Parser acepta el archivo y aplica obligatoriedad declarativa
  - Cross-table rules aplican si están declaradas
  - Disponibilidad propaga (`has_precios` o equivalente)
- **Validation**:
  - test E2E: subir archivo de la 4ta tabla y verificar que se persiste
    correctamente
  - diff de código: el commit de Sprint F debe ser **solo** registry +
    test, **0 cambios** en código de runtime
- **Risk**: medio; si requiere tocar runtime, los sprints B-E quedan
  incompletos y hay que volver
- **Deps**: B + C + D + E cerrados

### Sprint G — Tipos derivados (si D1 = a o c)

- **Goal**: ejecutar la opción elegida en D1
- **Acceptance**: cambiar `fields` en registry actualiza tipos sin
  intervención manual
- **Validation**:
  - test que confirma divergencia detectada (caso negativo)
  - tsc verde después de agregar campo dummy al registry
- **Risk**: medio; los mapped types complejos pueden generar errores
  crípticos
- **Deps**: D1 cerrado, Sprint B cerrado

---

## Decisiones cerradas

### D1 — Tipos derivados con safety net (D1.a + D1.b combinado)

**Decisión:** los tipos canónicos (`SaleRecord`, `MetaRecord`, `InventoryItem`,
y los futuros) se **derivan del registry** vía mapped types. Los interfaces
estáticas en `types/index.ts` se convierten en re-exports del tipo derivado
para no romper a los 100+ consumers que importan desde ahí. Adicionalmente
hay un test de integridad que falla si los re-exports y el registry divergen.

**Por qué:**
- D1.a sola es ideal pero arriesga errores TS crípticos. Con D1.b como red
  de seguridad, los errores de divergencia son explícitos y traceables.
- D1.c (codegen) agrega tooling, pre-commit hooks, archivos generados en el
  repo. Más superficie de mantenimiento.
- La combinación D1.a+D1.b da: automatización + backwards-compat + test
  diagnostic.

**Implicaciones:**
- `FieldDefinition` debe declarar `valueType: 'string' | 'number' | 'date' | 'boolean'`
  explícitamente. No inferir desde `role` (es coincidencia, no contrato).
- `FieldDefinition` debe declarar `nullable: boolean` (= !required) para que
  el mapped type marque `?` correctamente.
- Helper `InferRecord<T>` vive en `src/lib/registry-types.ts` (nuevo).
- Test de integridad en `schema-consistency.test.ts` valida que cada key del
  interface estática existe en el registry y viceversa.

**Impacto en sprints posteriores:**
- Sprint B agrega `valueType` y `nullable` a `FieldDefinition`.
- Sprint G ejecuta la derivación final (queda separado para no inflar B).

---

### D2 — Apertura completa a N tablas con flag `isUserUpload`

**Decisión:** todos los puntos cableados a "3 tablas" se derivan del registry.
Agregar 4ta tabla = solo editar `TABLE_REGISTRY`. Se introduce un flag
`isUserUpload: boolean` en `TableDefinition` para distinguir tablas que el
usuario sube en el wizard de tablas internas/derivadas.

**Por qué:**
- La promesa "cambiar industria = cambiar variables" no se cumple si
  `UploadStep.id`, `orgService` y el wizard tienen literales hardcoded.
- `isUserUpload` permite al registry crecer con tablas computadas
  (ej. `productos_dormidos` derivada del análisis) sin que aparezcan en el
  wizard.
- No abstraemos las páginas (`RendimientoPage`, `MetasPage`, etc.) — son
  vistas específicas que naturalmente conocen su tabla. Solo abstraemos la
  capa **infraestructura** (registro, persistencia, wizard, validación).

**Mapeo de cambios necesarios (Sprint D):**
- `UploadStep.id` → `TableId = keyof typeof TABLE_REGISTRY`
- `INITIAL_STEPS` → derivado de `TABLE_REGISTRY` filtrado por `isUserUpload`
  y ordenado por `displayOrder`
- `orgService` → itera registry para storage keys
- `ParseError` codes específicos como `META_DIM_NOT_IN_SALES` → genéricos
  como `CROSS_TABLE_DIM_MISSING` con `sourceTable`/`targetTable` en el detail
- Worker dispatch (`type: 'sales' | 'metas' | 'inventory'`) → `type: TableId`

**No se cambia:**
- Páginas concretas que muestran data específica
- Tipos canónicos por tabla (cada tabla tiene su record type)
- El motor de insights — sigue consumiendo `DIMENSION_REGISTRY` /
  `METRIC_REGISTRY`

**Impacto en sprints posteriores:**
- Sprint B agrega `isUserUpload`, `displayOrder`, `uploadLabel`,
  `description`, `templateSheetName` al `TableDefinition`.
- Sprint D ejecuta la apertura de wizard/storage/parser dispatch.
- Sprint F valida con prueba de fuego (4ta tabla solo desde registry).

---

### D3 — Discriminated union con 3 built-ins + custom escape hatch

**Decisión:** las cross-table rules viven en `TABLE_REGISTRY[id].relations`
como discriminated union. Hay 3 tipos built-in que cubren el 80% de casos,
y un tipo `custom` que delega a un validator registrado.

**Shape:**
```ts
type CrossTableRule =
  | {
      type: 'dim_consistency'
      sourceTable: TableId
      targetTable: TableId
      severity: 'error' | 'warning'
      requireTargetLoaded?: boolean
    }
  | {
      type: 'membership'
      sourceTable: TableId
      sourceField: string
      targetTable: TableId
      targetField: string
      severity: 'error' | 'warning'
    }
  | {
      type: 'range_overlap'
      sourceTable: TableId
      sourceField: string
      targetTable: TableId
      targetField: string
      severity: 'error' | 'warning'
      mode: 'within' | 'intersect'
    }
  | {
      type: 'custom'
      name: string  // key registrado vía registerCrossTableValidator
      severity: 'error' | 'warning'
      params?: Record<string, unknown>
    }
```

**Por qué:**
- Los 3 built-ins (`dim_consistency`, `membership`, `range_overlap`) cubren
  los casos identificados: validación dimensional metas↔ventas, integridad
  referencial inv.producto↔ventas.producto, rango temporal metas.fecha
  ⊂ ventas.fecha.
- `custom` permite agregar reglas con cálculos (ratios, agregaciones) sin
  forzar a meterlas en el shape declarativo.
- Discriminated union permite extender en el futuro (ej. `aggregation_check`)
  sin romper reglas existentes — TypeScript fuerza handle de todos los
  variants.

**Implicaciones:**
- `uploadValidation.ts` se reescribe como un dispatcher por `rule.type`.
- Cada built-in tiene un evaluador puro: `(rule, sourceData, targetData) => ValidationResult`.
- Registro custom via `registerCrossTableValidator(name, evaluator)` en
  `uploadValidation.ts` (similar a cómo `crossEngine.ts` registra detectores).
- Los códigos de error existentes (`META_DIM_NOT_IN_SALES`,
  `SALES_NOT_LOADED`) quedan deprecados; se reemplazan por códigos
  genéricos (`CROSS_TABLE_DIM_MISSING`, `CROSS_TABLE_TARGET_NOT_LOADED`,
  `CROSS_TABLE_MEMBERSHIP_VIOLATION`, etc.) que llevan `rule` en su detail.

**Impacto en sprints posteriores:**
- Sprint B agrega `relations: CrossTableRule[]` al `TableDefinition`.
- Sprint E ejecuta el reemplazo del validador con dispatcher genérico.
- La regla actual metas↔ventas se migra a `dim_consistency` declarativa.

---

## Cuellos identificados (referencia, no se atacan en este roadmap)

Estos quedan documentados para no perderlos pero **no se tocan** durante
este refactor. Tienen su propio roadmap en
`docs/MANIFIESTO-MOTOR-INSIGHTS.md`:

- `clientes_nuevos` builder (análogo a `cliente_perdido`)
- Inventario `proveedor_concentration` detector (single-source-risk)
- `meta_gap_temporal` multi-dim
- Inventario temporal (snapshots over time)
- Forecast Python conectado al motor
- Ranker protection / Z.12 reglas dedicadas para tipos nuevos

---

## Cómo retomar este trabajo (LLM checklist)

1. Lee este archivo de arriba a abajo.
2. Verifica el estado actual: `npx tsc --noEmit` debe pasar, `npm test`
   debe pasar (verifica el conteo historico en este documento; si bajo,
   algo se rompió antes de tu turno).
3. Identifica el **primer sprint sin `✅`** y lee sus deps.
4. Si las deps no están cerradas, retrocedé al sprint que falta.
5. Si el sprint que vas a hacer requiere decisión (D1/D2/D3), abrí Sprint A
   primero y registralo aquí antes de codear.
6. Al cerrar un sprint:
   - Marcá `✅` en el header del sprint
   - Agregá nota breve de implementación (archivos clave, decisiones de
     última hora)
   - Verificá que `tsc` y `npm test` siguen verdes
   - **No** cierres dos sprints en un solo commit; un sprint = un commit
     reversible

## Reglas anti-scope-creep

- Si encontrás un cuello que no está en este roadmap pero parece urgente,
  **escribilo en la sección "Cuellos identificados"** y seguí con tu
  sprint.
- Si un sprint resulta más grande de lo previsto (>500 líneas de diff),
  pausá y preguntá antes de seguir.
- Si la implementación contradice una decisión cerrada (D1/D2/D3), pausá
  y proponé reabrir la decisión, no la ignores.

---

**Última actualización:** documento inicial. Próximo paso: ejecutar
Sprint A (cerrar D1, D2, D3).
