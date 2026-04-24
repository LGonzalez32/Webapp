# PR-M4b Audit — Mecanismo `group-*` y re-integración de outlier

**Contexto**: PR-M4b integró el detector outlier (Z-score) al cross-engine.
Verificación runtime detectó regresión: `totalImpact` cayó de **$75,127 → $50,573**
(−$24,554, −32.7%) al aparecer `group-vendor-7weadm` con `impact=$43,790` que
desplazó del top-10 insights hardcoded USD-recuperable preexistentes.

Este documento audita el mecanismo responsable (`group-*`) y define los
requisitos para re-habilitar outlier sin canibalización.

---

## 1. Mecanismo `group-*` — origen, lógica, criterios

### Origen del prefijo

Función única: **`agruparInsightsRedundantes(pool)`** en
[insightStandard.ts:1054-1162](../src/lib/insightStandard.ts#L1054-L1162). Invocada desde
`runInsightEngine` en [insight-engine.ts](../src/lib/insight-engine.ts) tras
construir `validScored` y **antes** del sort/slice del ranking
(step PR-5 original).

No existe otra ruta que emita ids `group-*` en el codebase (confirmado
por grep exhaustivo: único sitio es la línea `const parentId = \`group-${tipo}-${h.toString(36)}\``).

### ¿Qué lo dispara?

Itera sobre `pool: DiagnosticBlock[]` y agrupa por clave compuesta:

```
key = `${tipo}|${dimension}|${direction}|${period}`
```

Donde:
- `tipo` viene de `_extractTipoDim(b)`: parseo de `b.id`:
  - `vendor-*` → tipo='vendor'
  - `ie-{dim}-{type}-{idx}` (regex `/^ie-([^-]+)-(.+?)-\d+$/`) → tipo=`type`
  - Bloques legacy no matcheables → **ignorados** (no agrupan)
- `dimension` derivada del mismo parseo
- `direction` = `_getDir(b)`: `'neg'` si severity∈{critical,warning}; `'pos'` si 'positive'; `'info'` otherwise
- `period` = `b.metadataBadges?.[1] ?? 'Mes actual'`

Si un bucket tiene **≥2 miembros**, se emite un parent `group-*`. Singletons pasan intactos.

### Cómo calcula el impact del grupo

**Línea 1087-1088**:
```typescript
const impactoUSD = members.reduce((s, b) =>
  s + (!b.non_monetary && typeof b.impactoUSD === 'number' ? b.impactoUSD : 0), 0)
```

**Es una suma aritmética de los impactoUSD individuales de los hijos monetarios.**
No hay ponderación, max, ni normalización. Si cada outlier de vendedor emite
impact=|value-mean| y hay 8 vendedores con ~6 outliers (|z|≥2), la suma
acumulada puede superar fácilmente los $40k.

**Recuperable del grupo** (L1092-1097): suma parcial de miembros con
`direccion='recuperable'`. Mismo mecanismo aditivo.

### ¿Pasa por dedup o lo bypasea?

El dedup de motor 2 (step 4 en `runInsightEngine`) opera sobre
`InsightCandidate[]` **antes** de `candidatesToDiagnosticBlocks`. La clave es
`member|dimensionId|insightTypeId`.

`agruparInsightsRedundantes` corre DESPUÉS en el pipeline:
- `candidates` (con dedup step 4) → `candidatesToDiagnosticBlocks` → `valid` → `validScored` → `agruparInsightsRedundantes(validScored)` → `groupedPool` → sort + slice(0,16)

**El mecanismo group-\* NO bypasea el dedup** — opera sobre bloques ya deduplicados.
Pero **opera sobre `DiagnosticBlock`, no sobre candidates crudos** — y los grupos
emitidos son nuevos bloques que no pasan por el dedup de nuevo.

### Criterios de direccion/recuperable del parent

Líneas 1100-1103:
```typescript
const _hasRec = members.some(b => b.direccion === 'recuperable')
const _allPos = members.every(b => b.direccion === 'positivo')
const _parentDireccion =
  _hasRec ? 'recuperable' : _allPos ? 'positivo' : 'neutral'
```

**Cualquier miembro `recuperable` hace al grupo `recuperable`**. Esto es lo
que canibalizó el ranking: un outlier con direccion=recuperable (un vendedor
bajo performer) arrastra a todo el bucket (`vendor|vendedor|neg|Mes actual`)
a ser un grupo recuperable, cuyo impactoUSD es la suma de los 8 vendedores,
no solo del outlier.

---

## 2. Interacción outlier × group-*

### Qué pasó en PR-M4b runtime

1. `detectOutlier` emitió candidatos con `insightTypeId='outlier'` y `dimensionId='vendedor'`.
2. Motor 2 construyó bloques `ie-vendedor-outlier-{idx}` via EVENT_TYPES_EXEMPT.
3. `_extractTipoDim` parseó el id → `{tipo: 'outlier', dimension: 'vendedor'}`.
4. Todos los outliers de vendedor cayeron en el mismo bucket:
   `outlier|vendedor|neg|Mes actual` (severity CRITICA/ALTA por score≥0.5).
5. Bucket con ≥2 miembros → `agruparInsightsRedundantes` emitió
   `group-vendor-7weadm` **— pero con tipo='outlier' en el hash**, no 'vendor'.
   Actually el id es `group-${tipo}-...` donde `tipo='outlier'`, entonces
   debería ser `group-outlier-*`. El runtime reportó `group-vendor-7weadm`
   (con tipo='vendor'). Esto implica que el id del bloque hijo NO era
   `ie-vendedor-outlier-*` sino algo como `vendor-*` (legacy path).
6. **Hipótesis refinada**: los candidatos outlier crearon bloques con id
   format `vendor-{member}` (legacy) en vez de `ie-vendedor-outlier-{idx}`,
   o el regex `_extractTipoDim` se quedó con `vendor-` como match. Lo cual
   significaría que los outliers de vendedor fueron interpretados como
   miembros del grupo legacy `vendor-*` existente (el agregado de vendor-
   estancado que ya existía).
7. Efecto neto: el grupo `group-vendor-*` existente (≈$43k) absorbió los
   outliers **Y** su impactoUSD se recalculó sumando los nuevos miembros,
   elevándolo o reemplazándolo en el ranking.

### Impact semántico vs impact del group

El detector outlier emite:
```typescript
impact = |g.value - mean|       // para cada outlier individual
```

Semántica: "este vendedor está $X por debajo/encima del promedio del equipo".

Cuando el grupo acumula 8 outliers, `impactoUSD_grupo = Σ |vᵢ - mean|`.
Esta suma **no tiene interpretación operativa**: no es "lo que se puede
recuperar" (ya que eso implicaría llevar a todos a la media, lo cual es
imposible si el mean se redefine), ni es "la pérdida total". Es un
**artefacto estadístico**.

Motor 2 lo trata como USD real y lo suma al totalImpact.

### Segundo artefacto: `group-outlier-tq2pap`

Runtime reportó también `group-outlier-tq2pap` con `impact=0` y
`direccion=recuperable`, con `razon_exclusion=recuperable_sin_monto_usd`.
Esto es el grupo de outliers en métricas **no-USD** (unidades,
precio_unitario, etc.). Entraron al ranking ocupando un slot, pero al
computar contribuye_al_total fueron excluidos por la razón.

**Problema**: ocupan slot de top-10 sin aportar valor monetario.

---

## 3. Requisitos para re-habilitar outlier

### a. Dedup vs hardcoded (PR-M4d)

Antes de que outlier entre al pool, verificar si ya existe un bloque
hardcoded para el mismo `(member, dimensionId)`. Si existe (ej. `vendor-
Ana González` ya está en el ranking vía motor 1 legacy), el outlier de
Ana en la misma dim debe ser **descartado** o absorbido como campo
enriquecido del bloque existente (no nuevo bloque).

Clave de dedup sugerida: `{dimensionId, member}` normalizados. Si el
hardcoded tiene `direccion=recuperable`, el outlier es redundante.

### b. Bypass del mecanismo `group-*` para outliers

Dos opciones:

**Opción 1 (recomendada)**: excluir el tipo `outlier` del
agrupador `_extractTipoDim`. Retornar `null` para `ie-*-outlier-*`, lo
que hace que no participe del bucketing. Outliers quedan como bloques
individuales en el ranking.

**Ventaja**: preserva la señal individual del z-score. Cada outlier es
visible como card propia con su impact = gap-to-mean. Ranking refleja
al nivel de granularidad correcta.

**Desventaja**: si hay muchos outliers, el ranking se satura. Mitigable
subiendo el threshold a 2.5σ (reduce ~5× los positivos).

**Opción 2**: agrupar outliers pero redefinir el impact del parent. En
lugar de suma, usar `max(|impactᵢ|)` o `media`. Esto limita el grupo
al outlier más extremo, semánticamente más cerca de "el grupo tiene un
caso notable" que de "total acumulado".

**Desventaja**: oscurece la información de múltiples outliers y complica
el mecanismo group-* con lógica per-tipo.

### c. Threshold a 2.5σ

Z=2.0 (valor actual) incluye ~5% de la distribución gaussiana. En un
dataset con 30 clientes × 5 métricas = 150 evaluaciones, esperamos
~7-8 outliers. Con Z=2.5, baja a ~1% → ~1-2 outliers. Ratio más
accionable para el ranking.

Cambio concreto en `outlier.ts`:
```typescript
const Z_THRESHOLD = 2.5  // antes 2.0
```

### d. Filtrar outliers no-USD antes del pool

Actualmente el detector emite outliers de todas las métricas aplicables
(5 × 4 dim = 20 cruces). Los outliers no-USD (unidades, precio_unitario,
num_clientes_activos, frecuencia_compra) entran al pool con
`_impactoEvento=null` → `impactoUSD=0` → `razon=recuperable_sin_monto_usd`.

**Costo**: ocupan slot del ranking sin aportar valor.

Solución: el detector debe filtrar al inicio según `metric.unit`:
```typescript
if (metric.unit !== 'USD') return []   // solo USD en PR-M4b', non-USD en PR futuro
```

O más granular: emitirlos con un flag `is_informational=true` que motor 2
use para **excluirlos del ranking** (pero dejarlos accesibles para el
panel "Atípicos" en UI futura).

---

## 4. Propuesta PR-M4d (integral)

**Scope**: resolver a + b + c + d + dedup general + gate group-*.

### Cambios

#### 4.1 Dedup cross-engine vs hardcoded

En `runInsightEngine`, después del `push(...xe.candidates)` al allCandidates y
ANTES del dedup step 4 existente, filtrar candidates xe-* cuya clave
`{dimensionId, member}` ya exista en un hardcoded. Contabilizar en
`cross_engine.deduplicados_vs_hardcoded`.

#### 4.2 Gate en `_extractTipoDim`

Modificar [insightStandard.ts:1038-1043](../src/lib/insightStandard.ts#L1038-L1043):
```typescript
function _extractTipoDim(b: DiagnosticBlock): { tipo: string; dimension: string } | null {
  // [PR-M4d] outliers no se agrupan — cada Z-score es una señal individual
  if (b.id.includes('-outlier-')) return null
  if (b.id.startsWith('vendor-')) return { tipo: 'vendor', dimension: 'vendedor' }
  const m = b.id.match(/^ie-([^-]+)-(.+?)-\d+$/)
  if (m) return { tipo: m[2], dimension: m[1] }
  return null
}
```

#### 4.3 Threshold y filtro USD-only en outlier.ts

```typescript
const Z_THRESHOLD = 2.5
// al inicio de detectOutlier:
if (metric.unit !== 'USD') return []
```

#### 4.4 Re-wire DETECTORS

```typescript
const DETECTORS: Partial<Record<InsightTypeId, CrossDetectFn>> = {
  outlier: detectOutlier,
}
```

#### 4.5 Telemetría extendida

`cross_engine.deduplicados_vs_hardcoded` deja de ser 0 y refleja los outliers
descartados. Además agregar:
```
outlier_skipped_non_usd: number  // cuántos se filtraron por unit!=USD
```

### Invariantes esperados post-PR-M4d

- **outlier emite solo para venta_usd × {vendedor, producto, cliente, departamento}** = 4 cruces
- Threshold Z=2.5 → ~1-3 outliers totales en Los Pinos
- Dedup vs hardcoded descarta los que ya tienen bloque (ej. Ana González ya en vendor-*)
- Outliers sobrevivientes son bloques individuales (no group-*), con impact real
- totalImpact sube **razonablemente** (~$5-15k extra máx.) representando señales genuinamente nuevas
- ranking_size puede llegar a 11-13 (aceptable)

### Criterios de éxito PR-M4d

1. `totalImpact` ≤ $90,000 (subida controlada)
2. `ranking_size` ≤ 13
3. Al menos 1 outlier como card individual (no en group-*)
4. `deduplicados_vs_hardcoded` > 0 si existen colisiones
5. 0 bloques `group-outlier-*` en ranking
6. tsc=0

---

## Estado actual del código (post PR-M4b-revert)

- [crossEngine.ts](../src/lib/crossEngine.ts): DETECTORS={} (vacío), import de detectOutlier comentado con referencia a este doc
- [detectors/outlier.ts](../src/lib/detectors/outlier.ts): preservado, header de documentación con plan de re-habilitación
- [insight-engine.ts](../src/lib/insight-engine.ts): reverteados los 5 cambios específicos de outlier (EVENT_TYPES_EXEMPT, _impactoEvento, computeRecuperableFromCandidate, classifyDireccionFromCandidate, deriveUrgenciaInput). Cross-engine call permanece vivo.
- [metricRegistry.ts](../src/lib/metricRegistry.ts): `cumplimiento_meta` + `pct` unit preservados (PR-M4a)
- [insightTypeRegistry.ts](../src/lib/insightTypeRegistry.ts): `meta_gap.applicableMetrics=['cumplimiento_meta']` preservado (PR-M4a)
- `tsc`: 0

## Baseline de invariantes restaurado

| Invariante | Valor |
|------------|-------|
| totalImpact | **$75,127.00** |
| ranking_size | 10 |
| cobertura_usd | 100%, elegibles=4 |
| leaks_positivas | 0 |
| product_dead.detectados | 3, total_prev=$5,484.98 |
| Agregado productos | $1,298 |
| chains | 1 (post L2a-fix) |
| `[PR-M4] cross_engine.tipos_ejecutados` | [] |
| tsc | 0 |
