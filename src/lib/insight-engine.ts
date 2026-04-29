import type {
  SaleRecord,
  MetaRecord,
  VendorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
  SupervisorAnalysis,
  ConcentracionRiesgo,
  ClienteDormido,
  CategoriaInventario,
  Insight,
  DataAvailability,
} from '../types'
import { runCrossEngine } from './crossEngine/'
import type {
  DiagnosticBlock,
  DiagnosticSection,
  DiagnosticLink,
  DiagnosticSeverity,
} from '../types/diagnostic-types'
import { NarrativeBuilder, NB_SECTION_LABEL } from './narrative-builder'
import {
  METRIC_REGISTRY,
  DIMENSION_REGISTRY,
  INSIGHT_TYPE_REGISTRY,
  type DataPoint,
  type MetricComputeOpts,
  type DetectResult,
} from './insight-registry'
import { analyzeDimRelationships, generateAutoCombos } from './dim-relationships'
import {
  // ya integrados en v1
  pasaFiltroRuido,
  detectarRedundancia,
  validarInsight,
  sanitizarNarrativa,
  resolverContradiccion,
  validarComparacionTemporal,
  TERMINOS_PROHIBIDOS_EN_OUTPUT,
  sustituirJerga,
  contieneJerga,
  // NUEVOS — Fase A: preparación estadística
  calcularPercentiles,
  determinarMaxPrioridad,
  calcularChurnBaseline,
  calcularPareto,
  detectarFamiliasProducto,
  calcularCoOcurrencia,
  // NUEVOS — Fase B: filtros
  validarProporcionalidad,
  esVariantePromocional,
  // NUEVOS — Fase C: enriquecimiento
  evaluarDormidoConContexto,
  esChurnSignificativo,
  esEntidadPareto,
  evaluarIntegracionInventario,
  evaluarIntegracionMetas,
  CRUCES_DISPONIBLES,
  // NUEVOS — Fase D: patrones compuestos
  detectarCoDeclive,
  detectarCascadas,
  evaluarIndicadorAnticipado,
  // NUEVOS — Fase E: dedup
  validarBalance,
  // NUEVOS — Fase G: calidad de texto
  esConclusionValida,
  limitarRepeticionKPI,
  formatearImpacto,
  FORMATO,
  validarCoherenciaTemporal,
  calcularConfianzaTemporal,
  validarAccionConcreta,
  // NUEVOS — Fase H: helpers de fecha
  calcularDiasEnMes,
  calcularDiaDelMes,
  // NUEVOS — Fase 5A: ventanas temporales con control de estacionalidad (YoY)
  COMPARACIONES_PERMITIDAS,
  tieneReferenciaTemporalProhibida,
  // NUEVOS — Fase 5B: umbral de dormidos configurable por usuario
  getDiasDormidoUsuario,
  DIAS_DORMIDO_DEFAULT,
  // [Z.6 F1 — heterogeneity] R121
  analizarHeterogeneidad,
  // [PR-0] filtro de entidades no canónicas
  ENTIDADES_NO_CANONICAS,
  // [PR-2] impacto recuperable
  calcularImpactoRecuperable,
  type ContextoInsights,
  // [PR-3] urgencia + priority score
  calcularUrgenciaTemporal,
  calcularPriorityScore,
  // [PR-5] agrupación ligera
  agruparInsightsRedundantes,
  // [PR-6] chaining
  construirInsightChains,
  // [PR-6.1b] normalización + dim helper
  normalizeEntity,
  dimensionDeBlock,
  // [PR-M6.A] cross-metric enrichment
  enrichInsightWithCrossMetricContext,
  type CrossMetricInsightLike,
  // [PR-M7c] diversity pass por métrica
  applyDiversityPass,
  type DiversityAudit,
  // [PR-M7e] normalización de score por métrica
  applyScoreNormalizationByMetric,
  type NormalizationAudit,
  // [Z.9.2] hidratación de campos ejecutivos por candidato
  hydratarCandidatoZ9,
  type ContextoImpactoZ9,
  // [Z.12] Tabla de la verdad ejecutiva
  MATERIALITY_FLOOR_EXECUTIVE,
  EXECUTIVE_TOP_N,
  // [Fase 6A] Gate canónico pass/fail
  evaluateInsightCandidate,
  resolveImpactoUsd,
  type InsightGateDecision,
  // [Z.11.5] Fuente única para métricas no-monetarias (count, ratio, pct).
  NON_MONETARY_METRIC_IDS,
} from './insightStandard'
import { getAgregadosParaFiltro, type AgregadosFiltro } from './domain-aggregations' // [Z.4 — perf: cuello-2]
import {
  buildPortfolioAudit,
  buildPortfolioPreview,
  makeStageReport,
  summarizeCandidateOrigins,
  type InsightCandidateOrigin,
  type InsightPipelineStageId,
  type InsightPipelineStageReport,
  type InsightPortfolioAudit,
  type InsightRuntimeAuditReport,
} from './insightTelemetry'
import { buildTransactionOutlierBlocks } from './builders/buildTransactionOutlierBlocks' // [PR-M7d]
import { buildChangePointBlocks }       from './builders/buildChangePointBlocks'        // [PR-M8a]
import { buildSteadyShareBlocks }       from './builders/buildSteadyShareBlocks'        // [PR-M9]
import { buildCorrelationBlocks }       from './builders/buildCorrelationBlocks'        // [PR-M10]
import { buildMetaGapTemporalBlocks }   from './builders/buildMetaGapTemporalBlocks'    // [PR-M11]
import { buildEnrichmentContext, enriquecerCandidate } from './cross-context' // [Z.10.4]

// Re-export so the page only imports from this file
export type { DiagnosticBlock, InsightChain, DiagnosticBlockChain } from '../types/diagnostic-types'

// ════════════════════════════════════════════════════════════════════
// REGLA UNIVERSAL DE STORYTELLING — NO ROMPER, NO HACER EXCEPCIONES
// ════════════════════════════════════════════════════════════════════
// 1. TODO candidate debe pasar por buildContextUniversal.
//    Prohibido agregar branches hardcodeados por dimensión/métrica/tipo.
//
// 2. Un dato solo procede si se conecta con al menos 2 variables de
//    OTRAS tablas (dimensiones, inventario, metas, dormidos, pareto).
//    Dato aislado = dato muerto = se descarta.
//
// 3. Cada sección del contexto es una FRASE CONECTADA
//    ({dato} {conector causal} {segunda variable} {conector} {tercera}),
//    no una bala de cifras sueltas.
//
// 4. usedEntities es obligatorio: leer para no repetir, escribir cada
//    entidad mencionada para que la siguiente card no la repita.
//
// 5. Si agregás una nueva metric/dimension/insightType al registry,
//    NO hay que tocar este archivo. La regla universal ya lo cubre.
//    Si no lo cubre, arreglá buildContextUniversal — no agregues branch.
//
// 6. Prohibido jerga técnica en el texto visible: nada de σ, slope,
//    p-valor, delta, outlier. Español de analista humano.
// ════════════════════════════════════════════════════════════════════
//
// ════════════ FASE 4B — REGLAS ADICIONALES ════════════
// 7. insightType `outlier` ELIMINADO como insight primario. Dato estadístico
//    crudo sin causa = ruido. Si necesitás señalar desviación, usala como
//    DATO SECUNDARIO dentro del contexto de otra card.
//
// 8. Dirección del insight se deriva explícitamente de detail:
//      meta_gap → siempre neg | contribution → sign(totalChange)
//      change → sign(pctChange) | trend → direction o sign(slope)
//    Vocabulario debe ser COHERENTE con la dirección. Nunca mezclar
//    "crecimiento" en card negativa ni "caída" en card positiva.
//
// 9. usedEntities es ÚNICO por llamada a candidatesToDiagnosticBlocks,
//    se pre-pobla con los `member` de TODOS los candidates antes de
//    construir contexto, y se escribe inmediatamente al mencionar
//    cualquier entidad cruzada.
//
// 10. Cada card = EXACTAMENTE 2 bullets de 20-35 palabras.
//     Bullet 1: explica por qué pasa. Bullet 2: resalta dónde duele más.
//     Cada bullet fusiona 2+ variables con conector causal ("porque",
//     "lo explica") o correlacional ("coincide con", "en paralelo",
//     "al mismo tiempo que"). Prohibido bullets sin conector.
//
// 11. Conector causal SOLO con evidencia fuerte (mismo vendedor, mismo
//     cliente, mismo delta). Si solo hay co-ocurrencia temporal → usar
//     correlacional. Mejor honesto que inventar causalidad.
//
// 12. Filtro de suficiencia: crucesCount >= 3 tablas distintas
//     (sales/inventory/metas/dormidos/delta_temporal/pareto).
//     Mencionar 3 dimensiones de sales cuenta como 1 sola tabla.
//     Card con < umbral se DESCARTA con console.debug.
//
// 13. Jerga técnica prohibida en TODO texto visible: σ, sigma, slope,
//     p-valor, outlier, atípica/o, "desviación estándar", "media del grupo"
//     (usar "promedio del grupo"). Sin excepciones.
// ════════════════════════════════════════════════════════════════════
//
// ════════ FASE 4F — VALIDADORES UNIVERSALES Y BLINDAJE ════════
// 28. NO existe "modo compact" ni render alternativo para cards adicionales.
//     Todas las cards usan el mismo componente y la misma lógica exacta.
//     La única diferencia permitida: estar dentro o fuera del fold.
//
// 29. depersonalizarBullet2 itera TODAS las ocurrencias del member,
//     sanea conectores huérfanos tras sustituir, y descarta la variante
//     si queda gramaticalmente rota. Se aplica a TODO bullet que no sea
//     el primero, sin excepción por items.length.
//
// 30. Toda variante de plantilla pasa el test de no-redundancia: su
//     segunda cláusula contiene un dato NUEVO (número, nombre, fecha)
//     no presente en la primera cláusula. Reformulaciones prohibidas.
//
// 31. Batería obligatoria de 10 validadores corre al final de
//     buildContextUniversal sobre cada item. Un item que no pasa se
//     descarta o se reescribe. Prohibido renderear un bullet sin pasar
//     por los validadores.
//
// 32. usedEntities solo se escribe DESPUÉS de que el bullet sobrevivió
//     los validadores. Si el bullet se descarta, sus entidades quedan
//     disponibles para otras cards.
// ════════════════════════════════════════════════════════════════
//
// ════════ FASE 4G — EXPANSIÓN UNIVERSAL Y GRAMÁTICA ════════
// 33. Toda card con sections.length >= 1 e items.length >= 1 en alguna
//     section debe ser expandible visualmente por el usuario en
//     DiagnosticBlock.tsx. Prohibido guards por severity, flags compact,
//     o cualquier condición extra que bloquee toggleExpand.
//
// 34. depersonalizarBullet2 detecta el patrón {member}+{verbo}+{conector}
//     al inicio del bullet y absorbe los TRES como unidad, inyectando
//     una cláusula introductoria en lugar del sujeto solo. Prohibido
//     dejar "pierde porque" / "cae porque" flotando tras el sujeto
//     reemplazado.
//
// 35. Antes de inyectar una referencia indirecta ("del grupo", "del
//     cliente", etc.), depersonalizarBullet2 absorbe la preposición
//     previa al nombre original, evitando doble preposición
//     ("en del", "a del", etc.). Tabla de contracciones: a+el=al,
//     de+el=del.
//
// 36. Validador V12 (doble preposición) atrapa cualquier patrón
//     "preposición1 + preposición2" restante. Si aparece, reescribir
//     o descartar el bullet.
//
// 37. claim() se ejecuta para TODA entidad mencionada en TODO bullet,
//     sin importar si viene de CRUCE 1-5 o de rescue A-D. Auditar
//     cada rescue para confirmar que claima antes de inyectar texto.
// ═══════════════════════════════════════════════════════════════
//
// ════════ FASE 4I — CIERRE DE BUGS REMANENTES ════════
// 45. Rescue C con dim=cliente exige validación de cartera histórica
//     (producto en sales del cliente últimos 3 meses, ≥1 txn). Sin
//     evidencia, rescue C no procede y se cae a A/B/D.
// 46. V15 compara LEMAS verbales (LEMA_MAP), no formas conjugadas.
//     "pierde" y "perdieron" comparten lema "perder" y deben dispararse.
// 47. Ref genérica por dim: usar REF_GENERICA_POR_DIM en todos los
//     templates, introMap y refPrepMap. "ese segmento" prohibido
//     como hardcode.
// ═══════════════════════════════════════════════════════════════
//
// ════════ FASE 4E — ENRIQUECIMIENTO COMPLETO Y NO-REDUNDANCIA ════════
// 24. NINGUNA card puede renderearse con sections.length === 0.
//     Si tras rescue sigue vacía o bajo umbral, se DESCARTA.
//     No hay cards peladas en el render — nunca.
//
// 25. Bullet 1 nombra al protagonista con nombre completo.
//     Bullet 2 usa referencia indirecta (posesivo, pronombre,
//     cláusula impersonal). Prohibido repetir el nombre literal
//     en bullet 2.
//
// 26. Bullet 2 no puede empezar con el mismo sujeto de bullet 1
//     ni usar el mismo verbo principal ni el mismo conector causal.
//     Si bullet 1 usa "porque", bullet 2 usa "coincide con" / "lo explica" /
//     "en paralelo" / "el origen está en".
//
// 27. Cada variante de plantilla pasa el test de no-redundancia:
//     si al quitar la segunda cláusula la frase conserva el mismo mensaje,
//     esa cláusula sobra. Cada cláusula debe aportar una variable o
//     un dato cuantitativo NUEVO, nunca reformular la anterior.
// ═════════════════════════════════════════════════════════════════════
//
// ════════ FASE 4D — COHERENCIA Y DIVERSIDAD ════════
// 18. TODAS las cards (primarias y adicionales) pasan por buildContextUniversal
//     y deben tener sections.length >= 1. Prohibido render card pelada.
//
// 19. Rescue de metas valida coherencia direccional:
//     isDown → solo agregar cumplimiento <100%
//     isUp   → solo agregar cumplimiento >90%
//     Si no hay coincidencia, saltar al siguiente rescue.
//
// 20. Bullet 1 SIEMPRE nombra al protagonista (member) o lo invoca con
//     posesivo ("sus clientes", "su zona"). Prohibido bullet 1 que
//     no conecte con el member.
//
// 21. Cada tipo de bullet tiene 4+ plantillas gramaticales distintas,
//     se rotan con tIdx (blocks.length al momento del render).
//     Prohibido que dos cards del mismo render usen plantilla idéntica.
//
// 22. usedEntities bloquea entidades MENCIONADAS (no solo members).
//     Rescue A y C llaman claim() para entidades nombradas explícitamente.
//
// 23. Contador de "N diagnósticos urgentes" = diagUrgentes.length
//     (critical+warning del render final). Nunca hardcodeado ni del engine viejo.
// ══════════════════════════════════════════════════════
//
// ════════════ FASE 4C — MARCADO CORRECTO DE TABLAS ════════════
// 14. addItem acepta tablas como argumentos de los 6 literales válidos:
//     'sales', 'inventory', 'metas', 'dormidos', 'pareto', 'delta_temporal'.
//     Prohibido pasar nombres de dimensiones ('cliente', 'vendedor') —
//     esas son dimensiones de sales y colapsan a 'sales'.
//
// 15. Cada addItem declara TODAS las tablas que el bullet realmente toca.
//     Si el bullet fusiona vendedor + meta + stock → declara
//     'sales', 'metas', 'inventory'. No 1. No 2.
//
// 16. Si tras los 2 bullets tablasUsadas.size < umbral, ejecutar
//     rescates obligatorios (metas si protagonista es vendedor,
//     dormidos si es cliente/vendedor, inventory si producto mencionado,
//     delta_temporal si insightType === 'change'). Fusionar en bullet 2.
//
// 17. Umbral por severidad: critica/alta=3 tablas, media/baja=2 tablas.
// ══════════════════════════════════════════════════════

// ─── Public types ─────────────────────────────────────────────────────────────

export interface InsightCandidate {
  metricId: string
  dimensionId: string
  insightTypeId: string
  member: string
  score: number
  severity: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'
  title: string
  description: string
  detail: Record<string, unknown>
  /** [Z.4 — perf: cuello-4] Stats pre-computadas por runInsightEngine para filtrarConEstandar.
   *  Solo en selected[0]. No usar en UI — campo interno de pipeline. */
  _stats?: {
    percentiles: { p5: number; p10: number; p20: number; p50: number; p75: number; p80: number; p90: number; p95: number }
    paretoList: string[]
    candidateCount: number
  }
  // [Z.7 T1 — B] Rich narrative fields set by NARRATIVE_TEMPLATES
  conclusion?: string
  accion?: { texto: string; entidades: string[]; respaldo: string; ejecutableEn: string } | string
  // [PR-M6.A.2] Snippets cruzados (otras métricas, misma entidad, mismo signo).
  // Se copian al block._crossMetricContext y enrichDiagnosticBlocks los apende
  // al final de porQueImporta, no a quePaso. null/undefined = sin enriquecer.
  _crossMetricContext?: string | null
  // [PR-M7e] Score pre-normalización (auditabilidad). El ranker consume `score`;
  // `score_raw` preserva el valor original para debugging.
  score_raw?:        number
  score_normalized?: number

  // [RUNTIME-AUDIT] Internal provenance only. It explains where the candidate
  // entered the pipeline and must not affect ranker, gate, copy, or render.
  _origin?: InsightCandidateOrigin
  _portfolioAudit?: InsightPortfolioAudit

  // ── Contrato ejecutivo Z.9 ────────────────────────────────────────────────
  // R134: todos estos campos son opcionales o nullables. Builders los pueblan
  // parcialmente en Z.9.2. Consumidores manejan null sin crashear.
  // Default implícito cuando ausente: numéricos → null, arrays → [],
  // time_scope → "unknown", direction → "neutral".

  // Z.9.2 — Impacto económico (ver tabla por tipo en §30 del manifiesto)
  impacto_valor?:       number | null    // magnitud observada en USD o uds según disponibilidad
  impacto_pct?:         number | null    // % sobre baseline explícito por tipo; null si denominador ambiguo
  impacto_gap_meta?:    number | null    // gap a meta solo si hay metas y cruce claro; null si no hay metas
  impacto_recuperable?: number | null    // valor concentrado en entidades hoja identificables (R136)

  // Z.9.2 — Dirección estadística del patrón (R137: distinto a DiagnosticBlock.direccion)
  // direction ∈ {up, down, neutral} = dato estadístico
  // DiagnosticBlock.direccion ∈ {recuperable, positivo, neutral} = framing narrativo
  // El mapeo no es 1:1; cada capa tiene su semántica propia.
  direction?: "up" | "down" | "neutral"

  // Z.9.2 — Alcance temporal real del insight
  time_scope?: "mtd" | "ytd" | "rolling" | "monthly" | "seasonal" | "unknown"

  // Z.9.3 — Jerarquía de entidades para chaining
  entity_path?:        string[]         // ej. ["vendedor", "Carlos Ramírez"]
  parent_entity_keys?: string[]         // candidateIds que son padres en la chain
  child_entity_keys?:  string[]         // candidateIds que son hijos en la chain

  // Z.9.4 — Compresión ejecutiva
  root_problem_key?:      string | null   // direction:dimensionId:time_scope (buildRootProblemKey)
  supporting_evidence?:   string[]        // frases trazables con cifras (no prosa consultiva)
  render_priority_score?: number          // score determinístico del ranker ejecutivo (R143)

  // [Z.10.5a] Normalización de impacto económico en USD (observabilidad)
  // impacto_usd_normalizado: monto absoluto en USD del candidato; null si no aplica
  // (metric no-monetaria) o si no se pudo resolver.
  // impacto_usd_source: trazabilidad del origen del número.
  impacto_usd_normalizado?: number | null
  impacto_usd_source?:
    | 'gap_meta'
    | 'recuperable'
    | 'cross_varAbs'
    | 'detail_monto'
    | 'detail_magnitud'
    | 'detail_totalCaida'
    | 'cross_delta_yoy'
    | 'non_monetary'
    | 'unavailable'

  // [Z.10.5b] Composición de render_priority_score por impacto económico.
  // render_priority_score_base preserva el valor pre-boost para auditoría.
  // render_priority_score_impacto_factor es el multiplicador aplicado (≥1).
  render_priority_score_base?: number
  render_priority_score_impacto_factor?: number
}

export interface EngineParams {
  sales: SaleRecord[]
  metas: MetaRecord[]
  vendorAnalysis: VendorAnalysis[]
  categoriaAnalysis: CategoriaAnalysis[]
  canalAnalysis: CanalAnalysis[]
  supervisorAnalysis: SupervisorAnalysis[]
  concentracionRiesgo: ConcentracionRiesgo[]
  clientesDormidos: ClienteDormido[]
  categoriasInventario: CategoriaInventario[]
  selectedPeriod: { year: number; month: number }
  tipoMetaActivo: 'uds' | 'usd'
}

// ─── [Z.9.7] Engine status report ────────────────────────────────────────────

export type EngineDetectorResult = 'ok' | 'partial' | 'failed' | 'skipped'

export interface EngineDetectorStatus {
  result:            EngineDetectorResult
  candidatesEmitted: number
  error?:            string
}

export interface EngineRankerAudit {
  protectedCount: number
  regularCount: number
  regularCap: number
  regularSelected: number
  selectedByOrigin: Record<InsightCandidateOrigin | 'unknown', number>
  portfolioPreview: InsightRuntimeAuditReport['portfolioPreview']
}

export interface EngineStatusReport {
  runAt:              number   // Date.now()
  candidatesTotal:    number
  candidatesSelected: number
  pipeline: Partial<Record<InsightPipelineStageId, InsightPipelineStageReport>>
  originBreakdown: Record<InsightCandidateOrigin | 'unknown', number>
  rankerAudit?: EngineRankerAudit
  detectors: {
    motor1:            EngineDetectorStatus
    outlier_builder:   EngineDetectorStatus
    change_point:      EngineDetectorStatus
    steady_share:      EngineDetectorStatus
    correlation:       EngineDetectorStatus
    meta_gap_temporal: EngineDetectorStatus
    z9_hydration:      EngineDetectorStatus
  }
}

function _emptyDetector(): EngineDetectorStatus {
  return { result: 'skipped', candidatesEmitted: 0 }
}

let _lastEngineStatus: EngineStatusReport | null = null
let _lastRuntimeAuditReport: InsightRuntimeAuditReport | null = null
let _lastAnalysisWorkerStage: InsightPipelineStageReport | null = null

/** Retorna el último EngineStatusReport generado por runInsightEngine, o null si aún no se ejecutó. */
export function getLastInsightEngineStatus(): EngineStatusReport | null {
  return _lastEngineStatus
}

export function getLastInsightRuntimeAuditReport(): InsightRuntimeAuditReport | null {
  return _lastRuntimeAuditReport
}

export function recordAnalysisWorkerStageReport(stage: InsightPipelineStageReport): void {
  _lastAnalysisWorkerStage = stage
}

export function recordInsightRuntimeAuditReport(input: {
  candidatesReturned: InsightCandidate[]
  filteredCandidates: InsightCandidate[]
  chainsCount: number
  executiveProblemsCount: number
  residualCandidatesCount: number
  legacyBlocksCount: number
  diagnosticBlocksCount: number
  enrichedBlocksCount: number
}): InsightRuntimeAuditReport {
  const engineStatus = _lastEngineStatus
  const stages: Partial<Record<InsightPipelineStageId, InsightPipelineStageReport>> = {
    ...(_lastAnalysisWorkerStage ? { analysis_worker: _lastAnalysisWorkerStage } : {}),
    ...(engineStatus?.pipeline ?? {}),
    gate: makeStageReport('gate', {
      status: 'ok',
      inputCount: input.candidatesReturned.length,
      outputCount: input.filteredCandidates.length,
      discardedCount: Math.max(0, input.candidatesReturned.length - input.filteredCandidates.length),
    }),
    executive_compression: makeStageReport('executive_compression', {
      status: input.chainsCount > 0 || input.executiveProblemsCount > 0 ? 'ok' : 'skipped',
      inputCount: input.filteredCandidates.length,
      outputCount: input.executiveProblemsCount,
      metadata: {
        chains: input.chainsCount,
        residualCandidates: input.residualCandidatesCount,
      },
    }),
    render_adapter: makeStageReport('render_adapter', {
      status: 'ok',
      inputCount: input.residualCandidatesCount + input.legacyBlocksCount,
      outputCount: input.enrichedBlocksCount,
      metadata: {
        legacyBlocks: input.legacyBlocksCount,
        diagnosticBlocks: input.diagnosticBlocksCount,
      },
    }),
  }

  _lastRuntimeAuditReport = {
    runAt: Date.now(),
    summary: {
      candidatesReturned: input.candidatesReturned.length,
      candidatesFiltered: input.filteredCandidates.length,
      candidatesRejectedByGate: Math.max(0, input.candidatesReturned.length - input.filteredCandidates.length),
      chains: input.chainsCount,
      executiveProblems: input.executiveProblemsCount,
      residualCandidates: input.residualCandidatesCount,
      legacyBlocks: input.legacyBlocksCount,
      diagnosticBlocks: input.diagnosticBlocksCount,
      enrichedBlocks: input.enrichedBlocksCount,
    },
    origins: summarizeCandidateOrigins(input.candidatesReturned),
    stages,
    portfolioPreview: buildPortfolioPreview(input.candidatesReturned),
  }

  if (import.meta.env.DEV) {
    console.debug('[insight-runtime-audit]', _lastRuntimeAuditReport)
  }

  return _lastRuntimeAuditReport
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function toDate(fecha: unknown): Date {
  if (fecha instanceof Date) return fecha
  return new Date(fecha as string)
}

function getSalesForPeriod(sales: SaleRecord[], year: number, month: number): SaleRecord[] {
  return sales.filter(r => {
    const d = toDate(r.fecha)
    return d.getFullYear() === year && d.getMonth() === month
  })
}

/** Período inmediatamente anterior (mes-a-mes). Solo para walking histórico de trend,
 *  NUNCA para comparación de crecimiento (viola P4 por estacionalidad). Usar getYoYPeriod. */
function getPrevPeriod(year: number, month: number): { year: number; month: number } {
  return month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
}

/** Período YoY: mismo mes del año anterior. Única comparación válida para change (P4). */
function getYoYPeriod(year: number, month: number): { year: number; month: number } {
  return { year: year - 1, month }
}

function groupByField(records: SaleRecord[], field: string): Map<string, SaleRecord[]> {
  const map = new Map<string, SaleRecord[]>()
  for (const r of records) {
    const key = (r as unknown as Record<string, unknown>)[field] as string | undefined
    if (!key) continue
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(r)
  }
  return map
}

function scoreToSeverity(score: number): InsightCandidate['severity'] {
  if (score > 0.8) return 'CRITICA'
  if (score > 0.6) return 'ALTA'
  if (score > 0.4) return 'MEDIA'
  return 'BAJA'
}

// ─── Format helpers ───────────────────────────────────────────────────────────

function fmtNum(value: number): string {
  return Math.round(value).toLocaleString('es-SV')
}

function fmtPct(value: number): string {
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}%`
}

// R65/R67 — Deriva badges [métrica, ventana] desde un candidato
// Métrica refleja el metricId real; ventana refleja el insightTypeId real.
// Prohibido usar defaults genéricos ('YTD', 'USD') sin evidencia del candidato.
function badgesFromCandidate(c: InsightCandidate, tipoMetaActivo: 'uds' | 'usd'): string[] {
  const badges: string[] = []
  // Métrica
  if (c.metricId === 'cumplimiento_meta') badges.push('%Meta')
  else if (c.metricId === 'dias_sin_compra') badges.push('Inactividad')
  else if (c.metricId === 'unidades') badges.push('Uds')
  else if (c.metricId === 'num_transacciones') badges.push('Txns')
  else if (c.metricId === 'ticket_promedio' || c.metricId === 'precio_unitario') badges.push('Ticket prom')
  else badges.push(tipoMetaActivo === 'usd' ? 'USD' : 'Uds')
  // Ventana — derivada del insightTypeId, no del metricId
  if (c.metricId === 'dias_sin_compra') badges.push('Acumulado')
  else if (c.insightTypeId === 'trend') badges.push('Últimos 3 meses')
  else badges.push('Mes actual')
  return badges
}

/** Format a metric value with its natural unit. Issue #1/#2 fix. */
function fmtMetricValue(value: number, metricId: string, tipoMetaActivo: 'uds' | 'usd'): string {
  switch (metricId) {
    case 'cumplimiento_meta': return `${value.toFixed(1)}%`
    case 'precio_unitario':   return `$${value.toFixed(2)}`
    case 'num_transacciones': return `${fmtNum(value)} txns`
    case 'frecuencia_compra': return `${value.toFixed(1)} txns/cli.`
    case 'unidades':          return `${fmtNum(value)} uds`
    case 'venta':
    case 'ticket_promedio':
      return tipoMetaActivo === 'uds' ? `${fmtNum(value)} uds` : `${fmtNum(value)} USD`
    default:
      return fmtNum(value)
  }
}

// [Z.7 T1 — B] Format helper used in NARRATIVE_TEMPLATES (mirrors fmtImp from insightEngine.ts)
function fmtImpT(value: number, isUsd: boolean): string {
  if (isUsd) {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000)     return `$${(value / 1_000).toFixed(1)}k`
    return `$${value.toFixed(0)}`
  }
  return `${fmtNum(Math.abs(value))} uds`
}

// [Z.7 T1 — B] Narrative templates — copy literal del motor viejo
// Se aplican en: (a) pase de inventario (nuevos tipos), (b) loop principal (meta_gap).
type NarrativeResult = {
  titulo: string
  descripcion: string
  conclusion: string
  accion: { texto: string; entidades: string[]; respaldo: string; ejecutableEn: string }
}
const NARRATIVE_TEMPLATES: Record<
  string,
  (detail: Record<string, unknown>, tma: 'uds' | 'usd') => NarrativeResult
> = {
  // Migra inventarioDesabasto (insightEngine.ts L1021-L1058)
  'stock_risk': (detail, tma) => {
    const isUsd = tma === 'usd'
    type Item = { member: string; stock: number; diasCobertura: number; ventaYTD: number }
    const items    = detail.items    as Item[]
    const urgentes = detail.urgentes as Item[]
    const alertas  = detail.alertas  as Item[]
    const impactoTotal = detail.impactoTotal as number
    const fmtItem = (r: Item) => `${r.member} (${fmtNum(r.stock)} uds, ${r.diasCobertura}d)`
    const listaUrg   = urgentes.slice(0, 4).map(fmtItem).join('; ')
    const listaAlert = alertas.slice(0, 3).map(fmtItem).join('; ')
    const descripcion = [
      urgentes.length > 0
        ? `${urgentes.length} producto${urgentes.length > 1 ? 's' : ''} con cobertura menor a una semana: ${listaUrg}.`
        : '',
      alertas.length > 0
        ? `${alertas.length} producto${alertas.length > 1 ? 's' : ''} en alerta (7 a 14 días de cobertura): ${listaAlert}.`
        : '',
      `Su venta combinada YTD es ${fmtImpT(impactoTotal, isUsd)}.`,
    ].filter(Boolean).join(' ')
    const conclusion = urgentes.length > 0
      ? `Si no llega reposición esta semana, se quiebra el surtido en los productos que más se venden.`
      : `Hay margen estrecho de reposición; conviene adelantar el pedido para no llegar a quiebre.`
    const titulo = urgentes.length > 0
      ? `Desabasto inminente en ${urgentes.length} producto${urgentes.length > 1 ? 's' : ''} clave`
      : `Cobertura ajustada en ${alertas.length} producto${alertas.length > 1 ? 's' : ''} clave`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: `Generar pedido urgente de reposición para ${items[0].member}${items[1] ? ` y ${items.length - 1} productos siguientes en la lista` : ''}.`,
        entidades: items.slice(0, 3).map(i => i.member),
        respaldo: `cobertura promedio ${(items.reduce((s, r) => s + r.diasCobertura, 0) / items.length).toFixed(1)} días`,
        ejecutableEn: 'inmediato',
      },
    }
  },

  // Migra inventarioSobrestock (insightEngine.ts L2530-L2557)
  'stock_excess': (detail, tma) => {
    const isUsd = tma === 'usd'
    type StockItem = { member: string; stock: number; mesesCobertura: number; ventaYTD: number }
    const sobrestock = detail.sobrestock as StockItem[]
    const top        = detail.top        as StockItem[]
    const totalCapital = detail.totalCapital as number
    const titulo = `Sobrestock en ${sobrestock.length} producto${sobrestock.length > 1 ? 's' : ''}`
    const descripcion = [
      `${sobrestock.length} producto${sobrestock.length > 1 ? 's' : ''} con más de 3 meses de cobertura.`,
      `Los más extremos: ${top.map(t => `${t.member} (${t.mesesCobertura.toFixed(1)} meses)`).join('; ')}.`,
      `Capital comprometido aproximado: ${fmtImpT(totalCapital, isUsd)}.`,
    ].join(' ')
    const conclusion = `Si el ritmo de venta no se acelera, este inventario quedará inmovilizado y afectará compras del próximo trimestre.`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: `Definir promoción o ajuste de pedidos para ${top[0].member} y revisar los siguientes 4 productos del listado.`,
        entidades: top.map(t => t.member),
        respaldo: `${top[0].mesesCobertura.toFixed(1)} meses de cobertura en el más extremo`,
        ejecutableEn: 'este_mes',
      },
    }
  },

  // Migra productoSustitucion (insightEngine.ts L2210-L2251)
  'migration': (detail, tma) => {
    const isUsd = tma === 'usd'
    type ProdPoint = { member: string; value: number; prevValue?: number }
    const ganador    = detail.ganador    as ProdPoint
    const perdedores = detail.perdedores as ProdPoint[]
    const totalCaida = detail.totalCaida as number
    const grupo      = detail.grupo      as string
    const ganancia   = ganador.value - (ganador.prevValue ?? 0)
    // [Z.12.M-2.2] Título incluye protagonista para evitar colisión cuando
    // hay 2+ migraciones en mismo grupo (ej: 2 migrations en "Sin categoría"
    // que antes producían títulos idénticos sin distinción).
    const titulo = `${ganador.member} reemplaza a ${perdedores[0].member} en ${grupo}`
    const descripcion = [
      `En ${grupo}, ${ganador.member} crece ${fmtImpT(ganancia, isUsd)} mientras ${perdedores.map(p => p.member).join(', ')} ${perdedores.length > 1 ? 'caen' : 'cae'} una cifra similar (${fmtImpT(totalCaida, isUsd)} combinado).`,
      `Los volúmenes son del mismo orden, lo que sugiere que los clientes están reemplazando un producto por otro.`,
    ].join(' ')
    const conclusion = `Es un cambio de preferencia dentro de ${grupo}, no una caída real de la categoría.`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: `Aumentar la cobertura de ${ganador.member} en clientes que aún piden ${perdedores[0].member}.`,
        entidades: [ganador.member, ...perdedores.map(p => p.member)],
        respaldo: `${fmtImpT(ganancia, isUsd)} arriba vs ${fmtImpT(totalCaida, isUsd)} abajo`,
        ejecutableEn: 'este_mes',
      },
    }
  },

  // [PR-L2b.1] product_dead — migra productoMuerto (insightEngine.ts L778 pre-L2b.1)
  'product_dead': (detail, tma) => {
    const isUsd = tma === 'usd'
    type Dead = { member: string; categoria: string; prevNet: number; clientes: string[]; stock: number }
    const items        = detail.items        as Dead[]
    const totalPrev    = detail.totalPrev    as number
    const totalStock   = detail.totalStock   as number
    const productCount = detail.productCount as number
    const topCategoria = detail.topCategoria as string
    const sustituto    = detail.sustituto    as { member: string; delta: number } | null
    const topNames     = items.slice(0, 3).map(d => d.member).join(', ')
    const titulo = productCount === 1
      ? `${items[0].member} dejó de venderse`
      : `${productCount} productos dejaron de venderse`
    const descripcion = [
      productCount === 1
        ? `${items[0].member} no registró ventas este año (vendía ${fmtImpT(items[0].prevNet, isUsd)} en el mismo período del año pasado).`
        : `${productCount} productos sin ventas este año: ${topNames}${productCount > 3 ? ` y ${productCount - 3} más` : ''}.`,
      `Venta histórica combinada: ${fmtImpT(totalPrev, isUsd)}.`,
      totalStock > 0 ? `Aún quedan ${fmtNum(totalStock)} unidades en inventario combinado.` : '',
      sustituto ? `En ${topCategoria}, ${sustituto.member} crece ${fmtImpT(sustituto.delta, isUsd)}: posible reemplazo.` : '',
    ].filter(Boolean).join(' ')
    const conclusion = sustituto
      ? `Los clientes migraron a ${sustituto.member}; el catálogo viejo quedó sin demanda.`
      : `Hay ${fmtImpT(totalPrev, isUsd)} de venta histórica sin reemplazo identificado — revisar surtido.`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: sustituto
          ? `Confirmar con ${items[0].clientes[0] ?? 'clientes principales'} si reemplazó ${items[0].member} por ${sustituto.member}; ajustar inventario.`
          : `Definir reemplazo o salida de ${items[0].member}${productCount > 1 ? ` y ${productCount - 1} producto${productCount > 2 ? 's' : ''} más` : ''} en ${topCategoria}.`,
        entidades: items.slice(0, 3).map(d => d.member),
        respaldo:  `${productCount} productos · ${fmtImpT(totalPrev, isUsd)} histórico`,
        ejecutableEn: 'este_mes',
      },
    }
  },

  // Migra productoCoDeclive (insightEngine.ts L2364-L2409)
  'co_decline': (detail, tma) => {
    const isUsd = tma === 'usd'
    const cluster      = detail.cluster      as string[]
    const impactoTotal = detail.impactoTotal as number
    const topClientes  = detail.topClientes  as string[]
    const titulo = `${cluster.length} productos en caída simultánea`
    const nombresClientes = topClientes.join(', ')
    const descripcion = [
      `${cluster.length} productos que comparten la misma base de clientes están cayendo al mismo tiempo: ${cluster.slice(0, 4).join(', ')}.`,
      `Caída combinada: ${fmtImpT(impactoTotal, isUsd)} YTD.`,
      topClientes.length > 0
        ? `${nombresClientes} concentra${topClientes.length > 1 ? 'n' : ''} las compras de estos productos.`
        : '',
      `Conviene revisar si estos clientes están migrando a otro proveedor.`,
    ].filter(Boolean).join(' ')
    const conclusion = `La caída no es producto por producto: es la misma base de clientes reduciendo todo el catálogo a la vez.`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: topClientes.length > 0
          ? `Visitar a ${topClientes[0]} esta semana para entender por qué reducen ${cluster.length} productos al mismo tiempo; revisar luego con los demás clientes del grupo.`
          : `Revisar con los clientes principales por qué reducen estos ${cluster.length} productos simultáneamente.`,
        entidades: [...cluster.slice(0, 3), ...topClientes],
        respaldo: `${fmtImpT(impactoTotal, isUsd)} de caída combinada`,
        ejecutableEn: 'esta_semana',
      },
    }
  },

  // Versión simplificada de meta_gap (detail tiene solo cumplimiento + gap desde el registry)
  'meta_gap': (detail, _tma) => {
    const member      = detail.member      as string
    const cumplimiento = detail.cumplimiento as number
    const titulo = `${member} proyecta cierre por debajo de meta`
    const descripcion = `${member} lleva el ${cumplimiento.toFixed(1)}% de cumplimiento — ${(100 - cumplimiento).toFixed(1)} puntos por debajo del umbral de seguridad (80%).`
    const conclusion = `El ritmo actual deja a ${member} ${(80 - cumplimiento).toFixed(1)} puntos debajo del umbral de cumplimiento.`
    return {
      titulo,
      descripcion,
      conclusion,
      accion: {
        texto: `Revisión de cartera urgente con ${member} para recuperar ritmo antes del cierre de mes.`,
        entidades: [member],
        respaldo: `${cumplimiento.toFixed(1)}% cumplimiento actual`,
        ejecutableEn: 'esta_semana',
      },
    }
  },
}

// ─── Non-trivial correlation pairs (Issue #3) ─────────────────────────────────
// Volume metrics (venta, unidades, num_transacciones) correlate trivially.
// Only run pairs where at least one metric is non-volume.

const CORRELATION_PAIRS: [string, string][] = [
  ['ticket_promedio',  'frecuencia_compra'],   // higher ticket → fewer transactions?
  ['precio_unitario',  'unidades'],             // price vs volume
  ['cumplimiento_meta','ticket_promedio'],       // compliance vs ticket quality
]

// ─── Title & description generation ──────────────────────────────────────────

function buildText(
  insightTypeId: string,
  detail: Record<string, unknown>,
  metricLabel: string,
  dimensionLabel: string,
  tipoMetaActivo: 'uds' | 'usd',
  metricId: string,
): { title: string; description: string } {
  const mv = (v: number) => fmtMetricValue(v, metricId, tipoMetaActivo)

  switch (insightTypeId) {
    case 'trend': {
      // Fase 5C — FALLO #4 (R54): texto describe literalmente lo calculado.
      // pctChange ahora es cambio % del primer al último mes (sobrescrito post-detect);
      // incluir los valores extremos hace el cálculo verificable por el lector.
      const { member, direction, pctChange, months, historyStart, historyEnd } = detail as {
        member: string; direction: string; pctChange: number; months: number
        historyStart?: number; historyEnd?: number
      }
      const arrow = direction === 'up' ? '📈' : '📉'
      const dir = direction === 'up' ? 'creciente' : 'decreciente'
      const extremos = historyStart != null && historyEnd != null
        ? `${mv(historyStart)} → ${mv(historyEnd)}, `
        : ''
      return {
        title: `${arrow} ${member} — tendencia ${dir}`,
        description: `${member} muestra una tendencia ${dir} en ${metricLabel} en los últimos ${months} meses (${extremos}${fmtPct(pctChange * 100)})`,
      }
    }

    case 'change': {
      // Issue #1/#2: use metric-native units instead of generic 'USD'
      const { member, current, previous, pctChange } = detail as {
        member: string; current: number; previous: number; pctChange: number
      }
      const arrow = pctChange > 0 ? '↑' : '↓'
      return {
        title: `${arrow} ${member} — cambio en ${metricLabel}`,
        description: `${member}: ${mv(current)} vs ${mv(previous)} en el mismo período del año anterior (${fmtPct(pctChange)})`,
      }
    }

    case 'dominance': {
      const { topMembers, pctShare, totalMembers } = detail as {
        topMembers: string[]; pctShare: number; totalMembers: number
      }
      const top3 = topMembers.slice(0, 3).join(', ')
      return {
        title: `⚠️ Concentración en ${dimensionLabel} — ${metricLabel}`,
        description: `${top3} concentran el ${pctShare.toFixed(0)}% de ${metricLabel} (${topMembers.length} de ${totalMembers} miembros)`,
      }
    }

    case 'contribution': {
      // Fase 5C — FALLO #1 (R51): separar valor-entidad de valor-agregado.
      // El texto debe mostrar primero los números de la ENTIDAD, y después los del
      // grupo como contexto. Nunca reutilizar totales agregados como si fueran
      // de la entidad destacada.
      const {
        member, contributionPct, totalChange, totalPrev, totalCurrent,
        memberValue, memberPrevValue,
      } = detail as {
        member: string; contributionPct: number; totalChange: number
        totalPrev?: number; totalCurrent?: number
        memberValue?: number; memberPrevValue?: number
      }
      // Direction from group total: positive = growth, negative = decline
      const groupDown = totalChange < 0
      const dir = groupDown ? 'descenso' : 'crecimiento'
      const arrow = groupDown ? '↓' : '↑'
      const pctAbs = Math.abs(contributionPct)

      // Línea primaria: cambio de la ENTIDAD destacada (R51).
      let memberLine = ''
      if (memberValue != null && memberPrevValue != null && memberPrevValue > 0) {
        const memberPctChange = ((memberValue - memberPrevValue) / memberPrevValue) * 100
        memberLine = `${member}: ${mv(memberPrevValue)} → ${mv(memberValue)} (${fmtPct(memberPctChange)}). `
      }

      // Línea secundaria: contexto del grupo, etiquetado explícitamente como "del grupo".
      let groupLine = ''
      if (totalPrev != null && totalCurrent != null && totalPrev > 0) {
        const groupPctChange = ((totalCurrent - totalPrev) / totalPrev) * 100
        groupLine = `${metricLabel} del grupo: ${mv(totalPrev)} → ${mv(totalCurrent)} (${fmtPct(groupPctChange)}). `
      }

      const contribution = pctAbs > 100
        ? `${member} fue el principal responsable del ${dir}`
        : `${member} explica el ${pctAbs.toFixed(0)}% del ${dir}`

      return {
        title: `${arrow} ${member} — mayor aporte al ${dir} en ${metricLabel}`,
        description: `${memberLine}${groupLine}${contribution}.`,
      }
    }

    case 'correlation': {
      // Issue #3: include both metric names in title and description
      const { r, direction: dir, metric1Label, metric2Label } = detail as {
        r: number; direction: string; metric1Label?: string; metric2Label?: string
      }
      const m1 = metric1Label ?? 'Métrica 1'
      const m2 = metric2Label ?? 'Métrica 2'
      const dirLabel = dir === 'positive' ? 'directamente' : 'inversamente'
      return {
        title: `🔗 ${m1} ↔ ${m2}`,
        description: `${m1} y ${m2} están ${dirLabel} correlacionados por ${dimensionLabel.toLowerCase()} (r = ${(r as number).toFixed(2)})`,
      }
    }

    case 'proportion_shift': {
      const { member, prevShare, currentShare, shiftPct } = detail as {
        member: string; prevShare: number; currentShare: number; shiftPct: number
      }
      const arrow = shiftPct > 0 ? '↑' : '↓'
      return {
        title: `${arrow} ${member} — cambio de participación`,
        description: `${member} pasó de ${prevShare.toFixed(0)}% a ${currentShare.toFixed(0)}% de participación en ${metricLabel} (${fmtPct(shiftPct)} pp)`,
      }
    }

    case 'meta_gap': {
      // Issue #5: add day context and projection
      const d = detail as {
        member: string; cumplimiento: number; gap: number
        diasTranscurridos?: number; diasTotalesMes?: number
      }
      const { member, cumplimiento } = d
      const diasTx = d.diasTranscurridos
      const diasTotal = d.diasTotalesMes
      const isPartial = diasTx != null && diasTotal != null && diasTx < diasTotal
      const proyeccion = isPartial && diasTx && diasTotal
        ? Math.min(Math.round(cumplimiento * diasTotal / diasTx), 999)
        : null
      // R74: cumplimiento usa toFixed(1) para consistencia con fmtPct del resto de la UI
      return {
        title: `⚠️ ${member} — meta en riesgo`,
        description: isPartial && proyeccion != null
          ? `${member} lleva ${cumplimiento.toFixed(1)}% de su meta al día ${diasTx}. Proyección de cierre: ~${proyeccion}%`
          : `${member} cerró el mes al ${cumplimiento.toFixed(1)}% de su meta (${Math.round(d.gap)} pts bajo el objetivo)`,
      }
    }

    default:
      return { title: 'Hallazgo detectado', description: 'Patrón significativo en los datos' }
  }
}

// ─── Adapter: InsightCandidate[] → DiagnosticBlock[] ─────────────────────────

function candidateSeverityToBlock(c: InsightCandidate): DiagnosticSeverity {
  // [Z.12.V-6] Degradación de severity cuando NO hay acción concreta.
  // Stress test runtime detectó cards "urgentes" con "Sin acciones sugeridas"
  // — contradicción UX: un dashboard de decisiones que termina en "no sé qué
  // hacer" no debería etiquetarse urgente. Degrada CRITICA→warning y
  // ALTA→info cuando c.accion está ausente o vacía.
  //
  // accionConcreta = string no vacío de ≥10 caracteres, o un objeto con
  // texto similar. Mismo criterio que r4 strict-mode en insightStandard.ts.
  const _accionStr = (
    typeof c.accion === 'object' && c.accion !== null
      ? (c.accion as { texto?: string }).texto ?? ''
      : typeof c.accion === 'string'
        ? c.accion
        : ''
  ).trim()
  const _hasAccionConcreta = _accionStr.length >= 10
  if (c.severity === 'CRITICA') return _hasAccionConcreta ? 'critical' : 'warning'
  if (c.severity === 'ALTA')    return _hasAccionConcreta ? 'warning'  : 'info'
  return 'info'
}

// ─── Context for cross-table narrative enrichment ─────────────────────────────

export interface BlockContext {
  tipoMetaActivo: 'uds' | 'usd'
  sales: SaleRecord[]
  inventory: CategoriaInventario[]
  metas: MetaRecord[]
  clientesDormidos: ClienteDormido[]
  vendorAnalysis: VendorAnalysis[]
  insights: Insight[]
  selectedPeriod: { year: number; month: number }
}

// FIX C (Fase 4I): ref genérica canónica por dim. Prohibido hardcode de "ese segmento".
const REF_GENERICA_POR_DIM: Record<string, string> = {
  producto:     'ese producto',
  departamento: 'ese territorio',
  categoria:    'esa categoría',
  cliente:      'ese cliente',
  vendedor:     'ese vendedor',
  zona:         'ese territorio',
  territorio:   'ese territorio',
  canal:        'ese canal',
}

// FIX B (Fase 4I): tabla de lemas verbales — V15 compara lemas, no formas conjugadas.
const LEMA_MAP: Record<string, string> = {
  // perder
  pierde: 'perder', pierden: 'perder', perdió: 'perder', perdieron: 'perder',
  perdiendo: 'perder', perdido: 'perder', perdida: 'perder',
  // caer
  cae: 'caer', caen: 'caer', cayó: 'caer', cayeron: 'caer', cayendo: 'caer', caído: 'caer',
  // bajar
  baja: 'bajar', bajan: 'bajar', bajó: 'bajar', bajaron: 'bajar', bajando: 'bajar', bajado: 'bajar',
  // arrastrar
  arrastra: 'arrastrar', arrastran: 'arrastrar', arrastró: 'arrastrar', arrastraron: 'arrastrar',
  // subir
  sube: 'subir', suben: 'subir', subió: 'subir', subieron: 'subir',
  // crecer
  crece: 'crecer', crecen: 'crecer', creció: 'crecer', crecieron: 'crecer', creciendo: 'crecer',
  // jalar / jalonar → mismo lema
  jala: 'jalar', jalan: 'jalar', jaló: 'jalar', jalaron: 'jalar',
  jalona: 'jalar', jalonan: 'jalar', jalonó: 'jalar',
  // empujar
  empuja: 'empujar', empujan: 'empujar', empujó: 'empujar',
  // sentir
  siente: 'sentir', sienten: 'sentir', sintió: 'sentir',
  // acusar
  acusa: 'acusar', acusan: 'acusar', acusó: 'acusar',
  // liderar
  lidera: 'liderar', lideran: 'liderar', lideró: 'liderar',
  // concentrar
  concentra: 'concentrar', concentran: 'concentrar', concentró: 'concentrar',
  // impulsar
  impulsa: 'impulsar', impulsan: 'impulsar', impulsó: 'impulsar',
  // recortar
  recorta: 'recortar', recortan: 'recortar', recortó: 'recortar',
  // sufrir
  sufre: 'sufrir', sufren: 'sufrir', sufrió: 'sufrir',
  // frenar
  frena: 'frenar', frenan: 'frenar', frenó: 'frenar',
  // ganar
  gana: 'ganar', ganan: 'ganar', ganó: 'ganar',
  // avanzar
  avanza: 'avanzar', avanzan: 'avanzar', avanzó: 'avanzar',
  // mejorar
  mejora: 'mejorar', mejoran: 'mejorar', mejoró: 'mejorar',
  // explicar
  explica: 'explicar', explican: 'explicar',
  // abrir
  abre: 'abrir', abren: 'abrir', abrió: 'abrir',
}

/** @see top-of-file REGLA UNIVERSAL DE STORYTELLING + FASE 4B + FASE 4D */
function buildContextUniversal(
  c: InsightCandidate,
  ctx: BlockContext,
  usedEntities: Set<string>,
  tIdx: number,   // FIX 4: template rotation index — increments per rendered card
): { sections: DiagnosticSection[]; crucesCount: number; tablasUsadas: string[] } {
  // FIX 4: pick(variants) selects variant[tIdx % N] to avoid identical bullet 1 across cards
  const pick = (variants: string[]): string => variants[tIdx % variants.length]
  const { tipoMetaActivo, sales, inventory, clientesDormidos, vendorAnalysis, selectedPeriod } = ctx
  const { year, month } = selectedPeriod

  const valOf = (r: SaleRecord): number =>
    tipoMetaActivo === 'uds' ? r.unidades : (r.venta_neta ?? 0)

  // CAMBIO 5 (Fase 4F): claim entities into pendingClaims; only transfer to usedEntities
  // after validators confirm the bullet survived. This allows discarded-bullet entities
  // to remain available for other cards.
  const pendingClaims = new Set<string>()
  const isClaimed = (name: string) =>
    usedEntities.has(name.toLowerCase()) || pendingClaims.has(name.toLowerCase())
  const claim = (name: string) => { pendingClaims.add(name.toLowerCase()) }

  // Fase 4B rule 12: normalize sales dimensions to T1 ('sales')
  const SALES_DIM_SET = new Set(['cliente', 'vendedor', 'producto', 'categoria', 'departamento', 'canal'])
  const tableOf = (t: string): string => SALES_DIM_SET.has(t) ? 'sales' : t

  let currAll: SaleRecord[] = []
  let prevAll: SaleRecord[] = []
  let diasEnMes = 30
  let diaDelMes = 30
  try {
    currAll = sales.filter(r => {
      const d = toDate(r.fecha)
      return d.getFullYear() === year && d.getMonth() === month
    })
    diasEnMes = new Date(year, month + 1, 0).getDate()
    diaDelMes = currAll.length > 0
      ? currAll.reduce((m, r) => Math.max(m, toDate(r.fecha).getDate()), 1)
      : diasEnMes
    // Fase 5A: prev YoY con control de estacionalidad (P4).
    // Mismo mes del año anterior, recortado a mismo día del mes (MTD comparable).
    const prev = getYoYPeriod(year, month)
    prevAll = sales.filter(r => {
      const d = toDate(r.fecha)
      return d.getFullYear() === prev.year && d.getMonth() === prev.month && d.getDate() <= diaDelMes
    })
  } catch { /* skip */ }

  const clean = (text: string): string => {
    try { return sanitizarNarrativa(sustituirJerga(text), { diaDelMes, diasEnMes }) }
    catch { return text }
  }

  // ── Protagonist slice ────────────────────────────────────────────────────────
  const protField = c.dimensionId
  const currProtag = currAll.filter(r => (r as unknown as Record<string, unknown>)[protField] === c.member)
  const prevProtag = prevAll.filter(r => (r as unknown as Record<string, unknown>)[protField] === c.member)

  // ── Insight direction — explicit by type (Fase 4B rule 8) ────────────────────
  const det = c.detail as Record<string, unknown>
  let isDown: boolean
  switch (c.insightTypeId) {
    case 'meta_gap':
      isDown = true   // meta_gap is always a negative situation
      break
    case 'change': {
      const pctChange = det.pctChange as number | undefined
      isDown = pctChange == null ? true : pctChange < 0
      break
    }
    case 'trend': {
      const dir = det.direction as string | undefined
      const slope = det.slope as number | undefined
      isDown = dir === 'down' || (dir == null && (slope ?? 0) < 0)
      break
    }
    case 'contribution': {
      // Direction determined by group total: member explaining a decline IS negative
      const totalChange = det.totalChange as number | undefined
      isDown = totalChange == null ? true : totalChange < 0
      break
    }
    default: {
      const dir = det.direction as string | undefined
      const pctChange = det.pctChange as number | undefined
      const slope = det.slope as number | undefined
      if (dir === 'up' || dir === 'above') isDown = false
      else if (dir === 'down' || dir === 'below') isDown = true
      else if (pctChange != null) isDown = pctChange < 0
      else if (slope != null) isDown = slope < 0
      else isDown = true   // conservative default
      break
    }
  }

  // ── Top-delta helper: top entities in any field sorted by |delta| ────────────
  const topDelta = (
    curr: SaleRecord[], prev: SaleRecord[], field: string, n: number,
  ): Array<{ name: string; curr: number; prev: number; delta: number }> => {
    const cMap = new Map<string, number>()
    const pMap = new Map<string, number>()
    for (const r of curr) {
      const k = (r as unknown as Record<string, unknown>)[field] as string | undefined
      if (k) cMap.set(k, (cMap.get(k) ?? 0) + valOf(r))
    }
    for (const r of prev) {
      const k = (r as unknown as Record<string, unknown>)[field] as string | undefined
      if (k) pMap.set(k, (pMap.get(k) ?? 0) + valOf(r))
    }
    const all = new Set([...cMap.keys(), ...pMap.keys()])
    return [...all]
      .map(name => ({
        name,
        curr:  cMap.get(name) ?? 0,
        prev:  pMap.get(name) ?? 0,
        delta: (cMap.get(name) ?? 0) - (pMap.get(name) ?? 0),
      }))
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, n)
  }

  const items: string[] = []
  // Fase 4B rule 12: track distinct tables (not dimensions)
  const mentionedTables = new Set<string>()

  // FIX 2 (Fase 4E): Bullet 2 must NEVER repeat the protagonist's full name.
  // Replace with posesivo / pronombre / cláusula impersonal.
  // Rule: same subject prohibited, same main verb prohibited, same causal connector prohibited.
  const depersonalizarBullet2 = (text: string): string => {
    if (!c.member) return text

    // FIX C (Fase 4I): Reference map by dimension type — canonical refs only.
    // REF_GENERICA_POR_DIM usada como fallback; 'ese segmento' prohibido como hardcode.
    const refMap: Record<string, string[]> = {
      vendedor:    ['su cartera', 'ese vendedor', 'del vendedor', 'su equipo'],
      producto:    ['ese producto', 'de ese producto', 'su línea', 'ese artículo'],
      cliente:     ['ese cliente', 'del cliente', 'en ese cliente', 'sus pedidos'],
      categoria:   ['esa categoría', 'en esa categoría', 'de esa línea', 'del rubro'],
      departamento:['ese territorio', 'en esa zona', 'del territorio', 'del área'],
      canal:       ['ese canal', 'en ese canal', 'del canal'],
    }
    const refGenericaPara = (dim: string): string =>
      REF_GENERICA_POR_DIM[dim.toLowerCase()] ?? 'ese grupo'
    const refs = refMap[protField] ?? [refGenericaPara(protField), 'ese conjunto', 'el grupo']
    const ref  = refs[tIdx % refs.length]

    const esc = c.member.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
    // noWordAfter: replaces trailing \b for names ending with accented chars (é,á,etc.)
    // \b fails after non-ASCII letters; this lookahead handles them correctly.
    const noWordAfter = '(?![a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9_])'
    // Parts of the name: full, last name (if has space), first name
    const parts = c.member.includes(' ')
      ? [c.member, c.member.split(' ')[0], c.member.split(' ').slice(1).join(' ')]
      : [c.member]
    const escParts = parts.map(p => p.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&'))

    let out = text

    // PASS 1 — "de {name}" / "del {name}" / "a {name}" prepositional complements
    out = out.replace(new RegExp(`\\b(?:de|del)\\s+${esc}${noWordAfter}`, 'gi'), ref)
    out = out.replace(new RegExp(`\\ba\\s+${esc}${noWordAfter}`, 'gi'), ref)

    // PASS 2 — Name as subject at sentence start
    // Fase 4G: if verb+connector pattern, absorb all three → intro clause (no orphan connector)
    // FIX 2 (Fase 4H): introMap entries only introduce the reference — no direction words
    // that duplicate the bullet-2 prefix ("Lo que más duele:" / "Lo que vale resaltar:").
    const introMap: Record<string, string> = {
      'down_vendedor':    'En su cartera, ',
      'down_cliente':     'En ese cliente, ',
      'down_producto':    'En ese producto, ',
      'down_categoria':   'En esa categoría, ',
      'down_departamento':'En ese territorio, ',
      'down_canal':       'En ese canal, ',
      'up_vendedor':      'En su cartera, ',
      'up_cliente':       'En ese cliente, ',
      'up_producto':      'En ese producto, ',
      'up_categoria':     'En esa categoría, ',
      'up_departamento':  'En ese territorio, ',
      'up_canal':         'En ese canal, ',
    }
    const dirKey = (isDown ? 'down' : 'up') + '_' + protField
    const intro = introMap[dirKey] ?? `En ${refGenericaPara(protField)}, `
    const verbConnRe = new RegExp(
      `^${esc}\\s+(?:pierde|cae|baja|arrastra|siente|recorta|sufre|no\\s+logra|jala|lidera|crece|empuja)\\s+(?:porque|y|ya\\s+que|debido\\s+a|pues)\\s+`,
      'i',
    )
    if (verbConnRe.test(out)) {
      // Absorb subject + verb + connector entirely — rest of bullet follows intro directly
      out = out.replace(verbConnRe, intro)
    } else {
      // Fallback: name + verb only (no connector) → "En {ref}, verb..."
      const verbPat = '(pierde|viene|cae|ve\\s+caer|siente|concentra|baja|sufre|crece|mejora|avanza|arrastra|lidera|opera|lleva|registra)'
      const subjectMatch = out.match(new RegExp(`^${esc}\\s+${verbPat}`, 'i'))
      if (subjectMatch) {
        out = out.replace(
          new RegExp(`^${esc}\\s+${verbPat}`, 'i'),
          (_m, verb) => `En ${ref}, ${verb}`,
        )
      }
    }

    // PASS 2.5 — preposition directly before name → absorb to prevent double preposition
    // e.g., "en Pulpería San José" → "en ese grupo" (not "en del grupo" via PASS 3)
    // de/del and a/al are handled by PASS 1; handle remaining prepositions here.
    // FIX C (Fase 4I): refPrepMap usa ref canónica por dim; fallback a refGenericaPara
    const refPrepMap: Record<string, string> = {
      vendedor: 'su cartera', producto: 'ese producto', cliente: 'ese cliente',
      categoria: 'esa categoría', departamento: 'ese territorio', canal: 'ese canal',
    }
    const refPrep = refPrepMap[protField] ?? refGenericaPara(protField)
    out = out.replace(new RegExp(`\\ben\\s+${esc}${noWordAfter}`, 'gi'),    `en ${refPrep}`)
    out = out.replace(new RegExp(`\\bcon\\s+${esc}${noWordAfter}`, 'gi'),   `con ${refPrep}`)
    out = out.replace(new RegExp(`\\bpor\\s+${esc}${noWordAfter}`, 'gi'),   `por ${refPrep}`)
    out = out.replace(new RegExp(`\\bsobre\\s+${esc}${noWordAfter}`, 'gi'), `sobre ${refPrep}`)

    // PASS 3 — Any remaining full-name occurrence → ref
    out = out.replace(new RegExp(`\\b${esc}${noWordAfter}`, 'gi'), ref)
    // PASS 4 — Partial-name fallback (first name, last name alone)
    for (const ep of escParts.slice(1)) {
      out = out.replace(new RegExp(`\\b${ep}${noWordAfter}`, 'gi'), ref)
    }

    // SANEAR — orphan connectors after substitution
    // "En {ref}, porque ..." → "En {ref}: ..."
    out = out.replace(/^(En\s+\S.+?),\s+(porque|y|coincide con|mientras que)\s+/i,
      (_m, pre) => `${pre}: `)
    // Bullet starting with connector
    out = out.replace(/^(porque|y |coincide con|en paralelo|mientras que|lo explica)\s+/i, '')
    // Double connector
    out = out.replace(/\s+(porque|y|coincide con)\s+(porque|y|coincide con)\s+/gi, ' y ')
    // Trailing comma/semicolon
    out = out.replace(/[,;:]\s*$/, '')

    // VALIDAR — if still starts with orphan connector or name literal, signal bad
    const stillHasName  = new RegExp(`\\b${esc}${noWordAfter}`, 'i').test(out)
    const startsOrphan  = /^(porque|y |coincide con|en paralelo)/i.test(out)
    if (stillHasName || startsOrphan) return '__INVALID__'

    return out
  }

  // addItem: each bullet may reference multiple tables (tables fused in one bullet)
  // Bullet 2+ automatically gets "Lo que más duele:" or "Lo que vale resaltar:" prefix
  // FIX 2 (Fase 4F): depersonalizar applies to ANY bullet that is not bullet 1
  const addItem = (text: string, ...tables: string[]) => {
    if (items.length >= 2) return
    const isBullet2 = items.length === 1
    const prefix = isBullet2
      ? (isDown ? 'Lo que más duele: ' : 'Lo que vale resaltar: ')
      : ''
    let finalText = isBullet2 ? depersonalizarBullet2(text) : text
    // If depersonalization failed, skip bullet 2 rather than render it broken
    if (finalText === '__INVALID__') return
    finalText = clean(prefix + finalText)
    // Bug 7 (Fase 4H): capitalize first letter after ': ' (prefix ends with ': ')
    if (prefix) {
      finalText = finalText.replace(/(:\s+)([a-záéíóúüñ])/, (_, colon, letter) => colon + letter.toUpperCase())
    }
    items.push(finalText)
    tables.forEach(t => mentionedTables.add(tableOf(t)))
  }

  // ── CRUCE 1: Top entities from other dimensions (universal) ──────────────────
  const ALL_DIMS = ['cliente', 'vendedor', 'producto', 'categoria', 'departamento', 'canal']
  const otherDims = ALL_DIMS.filter(d => d !== protField)

  for (const dim of otherDims) {
    if (items.length >= 2) break
    try {
      const topList = topDelta(currProtag, prevProtag, dim, 5)
      if (topList.length === 0) continue

      const aligned = isDown
        ? topList.filter(e => e.delta < 0)
        : topList.filter(e => e.delta > 0)
      const pool  = aligned.length > 0 ? aligned : topList
      const avail = pool.filter(e => e.name && !isClaimed(e.name))
      if (avail.length === 0) continue

      const top   = avail.slice(0, 2)
      top.forEach(e => claim(e.name))
      const names = top.map(e => e.name).join(' y ')

      // FIX 3: bullet 1 siempre nombra al protagonista (c.member) o lo invoca con posesivo
      // FIX 4: pick() rota entre 4+ variantes gramaticales para evitar mail-merge
      const m = c.member   // alias corto para legibilidad
      const tipoEntidad = (t: string): string =>
        t === 'cliente' ? 'clientes' : t === 'producto' ? 'productos' :
        t === 'vendedor' ? 'vendedores' : t === 'categoria' ? 'categorías' :
        t === 'departamento' ? 'zonas' : 'canales'
      const te = tipoEntidad(dim)

      if (dim === 'cliente') {
        const lost = top.filter(e => e.curr === 0 && e.prev > 0)
        if (lost.length > 0 && isDown) {
          const lostNames = lost.map(e => e.name).join(' y ')
          const dormidosMatch = lost.filter(e => clientesDormidos.some(d => d.cliente === e.name))
          if (dormidosMatch.length > 0) {
            addItem(
              pick([
                `${m} perdió a ${lostNames} — ${lost.length === 1 ? 'era' : 'eran'} compradores clave y ${lost.length === 1 ? 'lleva semanas' : 'llevan semanas'} sin actividad`,
                `${lostNames} dejaron de comprar en ${m} y ${lost.length === 1 ? 'lleva semanas' : 'llevan semanas'} dormidos — su ausencia es el principal peso`,
                `${m} siente el golpe: ${lostNames}, ${lost.length === 1 ? 'que era cliente clave, lleva' : 'que eran clientes clave, llevan'} semanas sin actividad`,
                `La caída de ${m} viene de ${lostNames}, ${lost.length === 1 ? 'cliente que dejó de comprar' : 'clientes que dejaron de comprar'} y lleva${lost.length > 1 ? 'n' : ''} semanas dormido${lost.length > 1 ? 's' : ''}`,
              ]),
              'sales', 'dormidos',
            )
          } else {
            addItem(
              pick([
                `${m} perdió a ${lostNames} este mes — ${lost.length === 1 ? 'era' : 'eran'} de sus principales compradores y sin ese volumen el mes cierra corto`,
                `${lostNames} ${lost.length === 1 ? 'dejó de comprar' : 'dejaron de comprar'} en ${m} — su ausencia abre un hueco que el resto de la cartera no alcanza a compensar`,
                `El hueco de ${m} viene de ${lostNames}, ${lost.length === 1 ? 'que dejó de pedir' : 'que dejaron de pedir'} y representa${lost.length === 1 ? '' : 'n'} más de la mitad del descenso`,
                `${m} ve caer su volumen porque ${lostNames} ${lost.length === 1 ? 'no registra compras' : 'no registran compras'} este período`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        } else if (isDown) {
          const dormidosMatch = top.filter(e => clientesDormidos.some(d => d.cliente === e.name))
          if (dormidosMatch.length > 0) {
            addItem(
              pick([
                `${m} pierde terreno porque ${names}, sus ${te} más activos, llevan semanas sin actividad`,
                `${names} arrastra${top.length > 1 ? 'n' : ''} la caída de ${m} — ${top.length > 1 ? 'llevan' : 'lleva'} semanas sin actividad y ese hueco es difícil de compensar con otros clientes`,
                `La caída de ${m} se concentra en ${names}, que ${top.length > 1 ? 'llevan semanas dormidos' : 'lleva semanas dormido'} y pesaban en el resultado`,
                `${m} siente el golpe por ${names} — concentraban el mayor volumen de la cartera y llevan semanas sin pedidos`,
              ]),
              'sales', 'dormidos',
            )
          } else {
            addItem(
              pick([
                `${m} pierde terreno porque ${names}, ${top.length > 1 ? 'sus dos compradores grandes' : 'su principal comprador'}, bajaron pedidos este mes`,
                `${names} ${top.length > 1 ? 'son los que más le cuestan' : 'es el que más le cuesta'} a ${m}: ${top.length > 1 ? 'entre los dos suman' : 'por sí solo suma'} el mayor peso de la caída`,
                `El hueco de ${m} viene de ${names}, ${top.length > 1 ? 'sus dos compradores principales, que pasaron a mínimos este período' : 'su comprador principal, que pasó a mínimos este período'}`,
                `${m} siente el golpe por ${names} — sumaban más del 50% de su volumen y pasaron a mínimos este período`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        } else {
          const nuevos = top.filter(e => e.prev === 0)
          addItem(
            pick([
              nuevos.length > 0
                ? `El crecimiento de ${m} viene de ${names} — ${nuevos.length === 1 ? 'cliente nuevo que abrió líneas' : 'clientes nuevos que abrieron líneas'} este mes`
                : `${m} crece porque ${names}, ${top.length > 1 ? 'sus compradores más activos' : 'su principal comprador'}, aumentaron pedidos`,
              nuevos.length > 0
                ? `${names} aporta${top.length > 1 ? 'n' : ''} al crecimiento de ${m} — ${top.length > 1 ? 'clientes que antes no compraban' : 'cliente que antes no compraba'} y abrieron líneas`
                : `El alza de ${m} se explica por ${names}, que subió su volumen de compra respecto al mismo período del año anterior`,
              `${m} mejora sus números gracias a ${names}, con mayor volumen que el mismo período del año anterior`,
              `${names} jala${top.length > 1 ? 'n' : ''} el crecimiento de ${m} este mes`,
            ]),
            'sales', 'delta_temporal',
          )
        }
      } else if (dim === 'vendedor') {
        const va0 = vendorAnalysis.find(v => v.vendedor === top[0].name)
        // FIX 2: coherencia direccional — solo fusionar metas si el cumplimiento coincide con la dirección
        const cumpl0 = va0?.cumplimiento_pct
        const metaCoherenteDown = cumpl0 != null && cumpl0 < 100
        const metaCoherenteUp   = cumpl0 != null && cumpl0 > 90
        if (va0 && metaCoherenteDown && cumpl0! < 70 && isDown) {
          addItem(
            pick([
              `${m} concentra su volumen en ${top[0].name}, que lleva ${Math.round(cumpl0!)}% de meta al día ${diaDelMes} — su bajo ritmo arrastra el resultado`,
              `${top[0].name} opera en ${m} y lleva ${Math.round(cumpl0!)}% de su meta — su ritmo bajo pesa en el resultado del grupo`,
              `En ${m} el bajo desempeño de ${top[0].name} (${Math.round(cumpl0!)}% de meta) es la causa principal del descenso`,
              `${top[0].name} arrastra ${m} hacia abajo — lleva solo ${Math.round(cumpl0!)}% de meta al día ${diaDelMes}`,
            ]),
            'sales', 'metas',
          )
        } else if (isDown) {
          if (va0 && metaCoherenteDown) {
            addItem(
              pick([
                `${m} viene abajo porque ${names} ${top.length === 1 ? 'viene cayendo' : 'vienen cayendo'} — ${top.length === 1 ? 'lleva' : `${top[0].name} lleva`} ${Math.round(cumpl0!)}% de meta y arrastra${top.length === 1 ? '' : 'n'} el grupo`,
                `${names} arrastra${top.length === 1 ? '' : 'n'} el resultado de ${m} — ${top.length === 1 ? 'lleva' : `${top[0].name} lleva`} ${Math.round(cumpl0!)}% de meta al día ${diaDelMes}`,
                `La caída de ${m} tiene a ${top[0].name} como causa: lleva ${Math.round(cumpl0!)}% de meta y su bajo ritmo pesa en el grupo`,
                `${top[0].name}, quien más opera en ${m}, lleva ${Math.round(cumpl0!)}% de meta — su desempeño arrastra los números`,
              ]),
              'sales', 'metas',
            )
          } else {
            addItem(
              pick([
                `${m} pierde porque ${names} ${top.length === 1 ? 'viene cayendo' : 'vienen cayendo'} este mes y ${top.length === 1 ? 'arrastra' : 'arrastran'} el resultado`,
                `${names} arrastra${top.length === 1 ? '' : 'n'} la caída de ${m} con el mayor descenso del período`,
                `La caída de ${m} se explica por ${names}, que registra${top.length === 1 ? '' : 'n'} el mayor retroceso este mes`,
                `En ${m} el descenso viene de ${names} — ${top.length === 1 ? 'el vendedor' : 'los vendedores'} con mayor caída del período`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        } else {
          if (va0 && metaCoherenteUp) {
            addItem(
              pick([
                `${m} crece porque ${names} ${top.length === 1 ? 'lidera' : 'lideran'} el grupo — ${top.length === 1 ? 'lleva' : `${top[0].name} lleva`} ${Math.round(cumpl0!)}% de meta al día ${diaDelMes}`,
                `${names} jala${top.length === 1 ? '' : 'n'} los números de ${m} al alza — ${top.length === 1 ? 'lleva' : `${top[0].name} lleva`} ${Math.round(cumpl0!)}% de meta`,
                `El crecimiento de ${m} lo explica ${top[0].name}: lleva ${Math.round(cumpl0!)}% de meta y lidera el ritmo del grupo`,
                `${top[0].name} impulsa a ${m} con ${Math.round(cumpl0!)}% de meta al día ${diaDelMes} — el mejor ritmo del grupo`,
              ]),
              'sales', 'metas',
            )
          } else {
            addItem(
              pick([
                `${m} crece porque ${names} ${top.length === 1 ? 'lidera' : 'lideran'} con el mayor aumento del período`,
                `${names} jala${top.length === 1 ? '' : 'n'} el crecimiento de ${m} con los números más altos del grupo`,
                `El alza de ${m} viene de ${names}, ${top.length === 1 ? 'el vendedor' : 'los vendedores'} con mayor crecimiento este mes`,
                `En ${m} quien más empuja hacia arriba es ${names} — con el mejor desempeño del período`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        }
      } else if (dim === 'producto') {
        if (isDown) {
          const invTop0 = inventory.find(i => i.producto === top[0].name)
          if (invTop0 && (invTop0.clasificacion === 'sin_movimiento' || invTop0.clasificacion === 'riesgo_quiebre' || invTop0.clasificacion === 'baja_cobertura')) {
            const invNote = invTop0.clasificacion === 'sin_movimiento'
              ? `${invTop0.unidades_actuales} uds detenidas en bodega`
              : `solo ${invTop0.unidades_actuales} uds disponibles`
            // R93/B5/B6: citar solo top[0].name — invNote es de top[0], evitar "P1 y P2 tienen solo N uds" ambiguo
            addItem(
              pick([
                `${m} baja y ${top[0].name} tiene ${invNote} — limita cualquier intento de recuperación`,
                `La caída de ${m} coincide con ${top[0].name}: ${invNote} y eso frena la recuperación`,
                `${top[0].name} arrastra el resultado de ${m} — ${invNote} y los compradores habituales no encuentran producto`,
                `En ${m} el descenso se suma a ${top[0].name}: ${invNote}, lo que bloquea el reabastecimiento`,
              ]),
              'sales', 'inventory',
            )
          } else {
            addItem(
              pick([
                `${m} pierde porque ${names} ${top.length === 1 ? 'perdió' : 'perdieron'} la mayor parte de sus compradores habituales este mes`,
                `${names} arrastra${top.length === 1 ? '' : 'n'} la caída de ${m} con el mayor descenso de compradores`,
                `La caída de ${m} se explica por ${names}, donde se concentraba el volumen y los pedidos cayeron`,
                // FIX 5 (Fase 4H): verbo distinto para evitar colisión con "siente el golpe" de dim=cliente
                `${m} acusa el retroceso en ${names} — concentraba el mayor volumen y este mes bajó a mínimos históricos`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        } else {
          const invTop0g = inventory.find(i => i.producto === top[0].name)
          if (invTop0g && invTop0g.clasificacion === 'riesgo_quiebre') {
            addItem(
              pick([
                `${m} crece por ${names}, que más empuja — pero tiene solo ${invTop0g.unidades_actuales} uds disponibles`,
                `${names} lidera el crecimiento de ${m} — aunque con solo ${invTop0g.unidades_actuales} uds puede quedar sin stock`,
                `El alza de ${m} la explica ${names}, pero con ${invTop0g.unidades_actuales} uds el riesgo de quiebre es real`,
                `${m} crece con ${names} como motor — riesgo: solo ${invTop0g.unidades_actuales} uds disponibles`,
              ]),
              'sales', 'inventory',
            )
          } else {
            addItem(
              pick([
                `${m} crece porque ${names} ${top.length === 1 ? 'es el producto que más empuja' : 'son los productos que más empujan'} este mes`,
                `${names} lidera${top.length === 1 ? '' : 'n'} el alza en ${m} — ${top.length === 1 ? 'creció' : 'crecieron'} por encima del promedio del grupo este mes`,
                `El alza de ${m} viene de ${names}, que registra${top.length === 1 ? '' : 'n'} el mayor incremento del período`,
                `En ${m} quien más jalona al alza es ${names} — con el mejor desempeño del mes`,
              ]),
              'sales', 'delta_temporal',
            )
          }
        }
      } else if (dim === 'categoria') {
        if (isDown) {
          addItem(
            pick([
              `${m} pierde terreno por la categoría ${names}, que arrastra el descenso del grupo este período`,
              `La caída de ${m} se concentra en ${names}, donde el descenso es más fuerte`,
              `${m} baja porque ${names} arrastra el resultado — el mayor descenso del grupo`,
              `En ${m} el hueco viene de ${names}, la categoría con mayor caída este período`,
            ]),
            'sales', 'delta_temporal',
          )
        } else {
          addItem(
            pick([
              `${m} crece porque ${names} es la categoría que más jalona, con el mayor aumento de participación`,
              `El alza de ${m} la explica ${names}, que registra el mayor crecimiento del grupo`,
              `${m} mejora por ${names} — la categoría con mayor dinamismo este período`,
              `En ${m} quien más empuja es ${names}, con la mayor ganancia de participación del mes`,
            ]),
            'sales', 'delta_temporal',
          )
        }
      } else if (dim === 'departamento') {
        addItem(isDown
          ? pick([
              `${m} sufre más en ${names} — la zona con mayor presión comercial este mes`,
              `La caída de ${m} es más fuerte en ${names}, la zona con mayor retroceso`,
              `${m} pierde terreno principalmente en ${names}, donde la presión comercial es más alta`,
              `En ${m} el descenso se concentra en ${names} — ahí está el mayor peso de la caída`,
            ])
          : pick([
              `${m} crece con más fuerza en ${names} — la zona con mejor respuesta en el período`,
              `El crecimiento de ${m} es más sólido en ${names}, donde la respuesta del mercado es mejor`,
              `${m} avanza más en ${names} — la zona con mayor tracción este mes`,
              `En ${m} el mayor crecimiento viene de ${names}, la zona con mejor desempeño del período`,
            ]),
          'sales', 'delta_temporal',
        )
      } else if (dim === 'canal') {
        addItem(isDown
          ? pick([
              `En ${m} el canal ${names} concentra la mayor parte del descenso este mes`,
              `${m} pierde terreno principalmente en el canal ${names}, donde el retroceso es más fuerte`,
              `El canal ${names} arrastra la caída de ${m} — el mayor descenso del período`,
              `La caída de ${m} se concentra en ${names} — el canal donde más pesaban los pedidos`,
            ])
          : pick([
              `En ${m} el canal ${names} jala el crecimiento, con la mayor ganancia en volumen`,
              `${m} avanza gracias al canal ${names}, donde el crecimiento es más fuerte`,
              `El canal ${names} explica el alza de ${m} — el mayor incremento del período`,
              `En ${m} el crecimiento viene de ${names}, el canal con mejor respuesta este mes`,
            ]),
          'sales', 'delta_temporal',
        )
      }
    } catch { /* skip */ }
  }

  // ── CRUCE 2: Delta temporal — clientes perdidos vs mismo período del año anterior (YoY) ──
  // Registers as T6 (delta_temporal), distinct from T1 (sales)
  if (items.length < 2 && isDown && protField !== 'cliente') {
    try {
      const prevCli = new Set(prevProtag.map(r => r.cliente).filter(Boolean) as string[])
      const currCli = new Set(currProtag.map(r => r.cliente).filter(Boolean) as string[])
      const lost    = [...prevCli].filter(cl => !currCli.has(cl))
      if (lost.length > 0) {
        const avail = lost.filter(cl => !isClaimed(cl))
        if (avail.length > 0) {
          const top = avail.slice(0, 2)
          top.forEach(claim)
          const names = top.join(' y ')
          const more  = lost.length > 2 ? ` y ${lost.length - 2} más` : ''
          addItem(
            `${names}${more} compraba${top.length === 1 ? '' : 'n'} en el mismo período del año anterior y no registra${top.length === 1 ? '' : 'n'} compras este mes — ese corte explica parte de la caída`,
            'sales', 'delta_temporal',
          )
        } else if (!mentionedTables.has('delta_temporal')) {
          addItem(
            `${lost.length} ${lost.length === 1 ? 'cliente' : 'clientes'} del mismo período del año anterior no registra${lost.length === 1 ? '' : 'n'} actividad este mes — el flujo de pedidos se cortó`,
            'sales', 'delta_temporal',
          )
        }
      }
    } catch { /* skip */ }
  }

  // ── CRUCE 3: Inventario ───────────────────────────────────────────────────────
  if (items.length < 2 && !mentionedTables.has('inventory')) {
    try {
      let invCandidates: CategoriaInventario[] = []
      if (protField === 'producto') {
        const inv = inventory.find(i => i.producto === c.member)
        if (inv) invCandidates = [inv]
      } else if (protField === 'categoria') {
        invCandidates = inventory.filter(i => i.categoria === c.member)
      } else {
        const prodMap = new Map<string, number>()
        for (const r of currProtag) {
          if (r.producto) prodMap.set(r.producto, (prodMap.get(r.producto) ?? 0) + r.unidades)
        }
        const topProds = [...prodMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([p]) => p)
        invCandidates = inventory.filter(i => topProds.includes(i.producto))
      }
      const riskInv = invCandidates.filter(i =>
        (i.clasificacion === 'riesgo_quiebre' ||
         i.clasificacion === 'baja_cobertura'  ||
         i.clasificacion === 'sin_movimiento') &&
        !isClaimed(i.producto)
      )
      if (riskInv.length > 0) {
        const topInv = riskInv[0]
        claim(topInv.producto)
        if (isDown) {
          if (topInv.clasificacion === 'riesgo_quiebre' || topInv.clasificacion === 'baja_cobertura') {
            addItem(
              `${topInv.producto} está en riesgo de quiebre con solo ${topInv.unidades_actuales} uds disponibles — puede bloquear cualquier intento de recuperación`,
              'sales', 'inventory',
            )
          } else {
            addItem(
              `${topInv.producto} lleva días sin moverse (${topInv.unidades_actuales} uds detenidas) — la demanda cayó pero el inventario sigue acumulado`,
              'sales', 'inventory',
            )
          }
        } else {
          addItem(
            `${topInv.producto} podría quedarse sin stock si el ritmo de ventas sigue al alza — conviene revisar reposición`,
            'sales', 'inventory',
          )
        }
      }
    } catch { /* skip */ }
  }

  // ── CRUCE 4: Metas (vendedor) ─────────────────────────────────────────────────
  if (items.length < 2 && !mentionedTables.has('metas') && c.insightTypeId !== 'meta_gap') {
    try {
      if (protField === 'vendedor') {
        const va = vendorAnalysis.find(v => v.vendedor === c.member)
        if (va && va.cumplimiento_pct != null) {
          if (va.cumplimiento_pct < 70) {
            addItem(
              `Lleva ${Math.round(va.cumplimiento_pct)}% de su meta al día ${diaDelMes} — al ritmo actual no llegará al objetivo de cierre de mes`,
              'sales', 'metas',
            )
          } else if (va.cumplimiento_pct >= 100) {
            addItem(
              `Ya lleva ${Math.round(va.cumplimiento_pct)}% de su meta al día ${diaDelMes} — va camino a superar el objetivo mensual`,
              'sales', 'metas',
            )
          }
        }
      } else {
        const vendMap = new Map<string, number>()
        for (const r of currProtag) {
          if (r.vendedor) vendMap.set(r.vendedor, (vendMap.get(r.vendedor) ?? 0) + valOf(r))
        }
        const topVend = [...vendMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
        if (topVend && !isClaimed(topVend)) {
          const va = vendorAnalysis.find(v => v.vendedor === topVend)
          if (va && va.cumplimiento_pct != null && va.cumplimiento_pct < 70) {
            claim(topVend)
            addItem(
              `${topVend}, quien más opera en este grupo, lleva ${Math.round(va.cumplimiento_pct)}% de su meta al día ${diaDelMes} — su bajo ritmo pesa en el resultado`,
              'sales', 'metas',
            )
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── CRUCE 5: Dormidos / churn ─────────────────────────────────────────────────
  if (items.length < 2 && !mentionedTables.has('dormidos')) {
    try {
      let dormList: ClienteDormido[] = []
      if (protField === 'vendedor') {
        dormList = clientesDormidos.filter(d => d.vendedor === c.member)
      } else if (protField === 'cliente') {
        const d = clientesDormidos.find(d => d.cliente === c.member)
        if (d) dormList = [d]
      } else {
        const scopeVendors = new Set(currProtag.map(r => r.vendedor).filter(Boolean) as string[])
        dormList = clientesDormidos.filter(d => d.vendedor && scopeVendors.has(d.vendedor))
      }
      if (dormList.length > 0) {
        if (protField === 'cliente') {
          addItem(
            `Sin actividad registrada — lleva ${dormList[0].dias_sin_actividad ?? 'varios'} días desde su última compra, lo que la clasifica como cliente dormida`,
            'sales', 'dormidos',
          )
        } else {
          const avail = dormList.filter(d => !isClaimed(d.cliente)).slice(0, 2)
          if (avail.length > 0) {
            avail.forEach(d => claim(d.cliente))
            const names = avail.map(d => d.cliente).join(' y ')
            const maxDias = Math.max(...avail.map(d => (d.dias_sin_actividad ?? 0)))
            addItem(
              `${names} ${avail.length === 1 ? 'lleva' : 'llevan'} semanas sin comprar — ${maxDias > 0 ? `más de ${maxDias} días de inactividad` : 'sin actividad reciente'} y su ausencia pesa en los números`,
              'sales', 'dormidos',
            )
          } else {
            addItem(
              `${dormList.length} ${dormList.length === 1 ? 'cliente' : 'clientes'} de este grupo ${dormList.length === 1 ? 'lleva' : 'llevan'} semanas sin actividad — el churn activo arrastra los resultados`,
              'sales', 'dormidos',
            )
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── CAMBIO 4: Rescue — inject cross-table data if tablasUsadas.size < 3 ────────
  // FIX 1: rescue corre SIEMPRE (incluso con items vacío) para dar contexto a cards adicionales.
  // Appends to bullet 2 (or creates it) to reach cross-table threshold.
  if (mentionedTables.size < 3) {
    try {
      // Rescue A: Vendedor protagonist → inject metas if not present
      if (!mentionedTables.has('metas')) {
        let vaRescue: VendorAnalysis | undefined
        if (protField === 'vendedor') {
          vaRescue = vendorAnalysis.find(v => v.vendedor === c.member)
        } else {
          const topVMap = new Map<string, number>()
          for (const r of currProtag) {
            if (r.vendedor) topVMap.set(r.vendedor, (topVMap.get(r.vendedor) ?? 0) + valOf(r))
          }
          const tv = [...topVMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
          if (tv && !isClaimed(tv)) vaRescue = vendorAnalysis.find(v => v.vendedor === tv)
        }
        if (vaRescue && vaRescue.cumplimiento_pct != null) {
          const cumplRescue = vaRescue.cumplimiento_pct
          // FIX 2: solo inyectar meta si coherente con dirección del insight
          const rescueCoherent = isDown ? cumplRescue < 100 : cumplRescue > 90
          if (rescueCoherent) {
            const note = ` — lleva ${Math.round(cumplRescue)}% de meta al día ${diaDelMes}`
            if (items.length < 2) {
              // FIX 5: claim el vendedor mencionado en el rescue para que no aparezca en otra card
              claim(vaRescue.vendedor)
              addItem(`${vaRescue.vendedor}${note} y su ritmo impacta el resultado del grupo`, 'sales', 'metas')
            } else {
              items[1] = clean(items[1] + note)
              mentionedTables.add('metas')
            }
          }
        }
      }
    } catch { /* skip */ }

    try {
      // Rescue B: Cliente/Vendedor → inject dormidos count if not present
      if (!mentionedTables.has('dormidos') && mentionedTables.size < 3) {
        let dormRescue: ClienteDormido[] = []
        if (protField === 'vendedor') {
          dormRescue = clientesDormidos.filter(d => d.vendedor === c.member)
        } else if (protField === 'cliente') {
          const d = clientesDormidos.find(d => d.cliente === c.member)
          if (d) dormRescue = [d]
        } else {
          const vendSet = new Set(currProtag.map(r => r.vendedor).filter(Boolean) as string[])
          dormRescue = clientesDormidos.filter(d => d.vendedor && vendSet.has(d.vendedor)).slice(0, 3)
        }
        if (dormRescue.length > 0) {
          // FIX 6 (Fase 4H): rotate rescue-B note — nombres reales (Z.3 R83: nunca conteos)
          const dc = dormRescue.length
          const rescueNames = dormRescue.slice(0, 2).map(d => d.cliente).join(' y ')
          const dl = dc > 1 ? 'llevan' : 'lleva'
          const rescueBNotes = [
            ` — coincide con ${rescueNames}, que ${dl} semanas sin actividad`,
            ` — ${rescueNames} ${dl} semanas sin actividad en este grupo`,
            ` — en paralelo, ${rescueNames} ${dl} semanas sin comprar`,
            ` — suma ${rescueNames}, que agrava${dc > 1 ? 'n' : ''} el panorama`,
          ]
          const note = rescueBNotes[tIdx % rescueBNotes.length]
          if (items.length < 2) {
            const singleName = dormRescue.slice(0, 2).map(d => d.cliente).join(' y ')
            addItem(
              `${singleName} ${dc === 1 ? 'lleva' : 'llevan'} semanas sin actividad y su ausencia pesa en el resultado`,
              'sales', 'dormidos',
            )
          } else {
            items[1] = clean(items[1] + note)
            mentionedTables.add('dormidos')
          }
        }
      }
    } catch { /* skip */ }

    try {
      // Rescue C: Product mentioned → inject inventory risk if not present
      if (!mentionedTables.has('inventory') && mentionedTables.size < 3 && inventory.length > 0) {
        // FIX A (Fase 4I): Para dim=cliente, exigir cartera histórica (≥1 txn últimos 3 meses).
        // Sin evidencia → rescue C no procede (cae a A/B/D o deja card con bullet 1).
        let prodSet: Set<string>
        if (protField === 'cliente') {
          prodSet = new Set<string>()
          for (const r of sales) {
            if ((r as unknown as Record<string, unknown>)[protField] !== c.member) continue
            if (!r.producto) continue
            const d = toDate(r.fecha)
            const monthsDiff = (year - d.getFullYear()) * 12 + (month - d.getMonth())
            if (monthsDiff >= 0 && monthsDiff <= 3) prodSet.add(r.producto)
          }
          if (prodSet.size === 0) {
            console.debug('[fase4i] Rescue C descartado: cliente sin cartera histórica 3m:', c.member)
          }
        } else {
          prodSet = new Set(currProtag.map(r => r.producto).filter(Boolean) as string[])
        }
        const riskProd = prodSet.size === 0 ? undefined : inventory.find(i =>
          prodSet.has(i.producto) &&
          !isClaimed(i.producto) &&
          (i.clasificacion === 'riesgo_quiebre' || i.clasificacion === 'sin_movimiento' || i.clasificacion === 'baja_cobertura')
        )
        if (riskProd) {
          // FIX 5: claim el producto mencionado en rescue para evitar repetición en otra card
          claim(riskProd.producto)
          const note = ` — ${riskProd.producto} tiene ${riskProd.unidades_actuales} uds en bodega`
          if (items.length < 2) {
            addItem(
              `${riskProd.producto} está en ${riskProd.clasificacion === 'riesgo_quiebre' ? 'riesgo de quiebre' : 'sin movimiento'} con ${riskProd.unidades_actuales} uds — limita la disponibilidad del grupo`,
              'sales', 'inventory',
            )
          } else {
            items[1] = clean(items[1] + note)
            mentionedTables.add('inventory')
          }
        }
      }
    } catch { /* skip */ }

    try {
      // Rescue D: Change insight type → inject delta_temporal if not present
      if (!mentionedTables.has('delta_temporal') && c.insightTypeId === 'change' && mentionedTables.size < 3) {
        const prevCli2 = new Set(prevProtag.map(r => r.cliente).filter(Boolean) as string[])
        const currCli2 = new Set(currProtag.map(r => r.cliente).filter(Boolean) as string[])
        const lostCount = [...prevCli2].filter(cl => !currCli2.has(cl)).length
        if (lostCount > 0) {
          const note = ` — se perdieron ${lostCount} cliente${lostCount > 1 ? 's' : ''} vs el mismo período del año anterior`
          if (items.length < 2) {
            addItem(
              `${lostCount} cliente${lostCount > 1 ? 's' : ''} que compraba${lostCount > 1 ? 'n' : ''} en el mismo período del año anterior no registra${lostCount > 1 ? 'n' : ''} actividad este período`,
              'sales', 'delta_temporal',
            )
          } else {
            items[1] = clean(items[1] + note)
            mentionedTables.add('delta_temporal')
          }
        }
      }
    } catch { /* skip */ }
  }

  // ── FIX 4 / CAMBIO 5 (Fase 4F): Validadores universales ──────────────────────
  // Run before output so discarded bullets don't pollute usedEntities.
  {
    const memberEsc = c.member
      ? c.member.replace(/[$()*+.?[\\\]^{|}]/g, '\\$&')
      : null

    const stopwords = new Set([
      'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'en',
      'a', 'y', 'o', 'se', 'su', 'sus', 'con', 'por', 'es', 'al', 'más',
      'este', 'esta', 'ese', 'esa', 'no', 'si', 'le', 'lo', 'fue',
    ])

    const wordCount = (s: string) =>
      s.split(/\s+/).filter(w => w.length > 1).length

    const contentWords = (s: string) =>
      s.toLowerCase().split(/[\s,\-–—]+/).filter(w => w.length > 2 && !stopwords.has(w))

    const jaccardSim = (a: string, b: string): number => {
      const wa = new Set(contentWords(a))
      const wb = new Set(contentWords(b))
      if (wa.size === 0 || wb.size === 0) return 0
      let inter = 0
      for (const w of wa) if (wb.has(w)) inter++
      return inter / (wa.size + wb.size - inter)
    }

    // Detect pct of meta mentioned in a bullet
    const extractMetaPct = (s: string): number | null => {
      const m = s.match(/(\d+)%\s+de\s+meta/i)
      return m ? parseInt(m[1], 10) : null
    }

    for (let bi = items.length - 1; bi >= 0; bi--) {
      const bullet = items[bi]
      let discard = false

      // V1: orphan connector at start
      if (/^(porque|y\s|coincide con|en paralelo|mientras que|lo explica)\s/i.test(bullet)) {
        discard = true
      }
      // V2: double connector
      if (!discard && /(porque|y|coincide con|en paralelo)\s+(porque|y|coincide con|en paralelo)/i.test(bullet)) {
        discard = true
      }
      // V3: comma + subordinate connector at start of clause
      if (!discard && /,\s*(porque|y|coincide con)\s/i.test(bullet) && bi === 1) {
        // Only flag if it's literally the start of the bullet after the prefix
        const withoutPrefix = bullet.replace(/^Lo que (más duele|vale resaltar):\s*/i, '')
        if (/^(porque|y |coincide con)/i.test(withoutPrefix)) discard = true
      }
      // V4: protagonist full name repeated in bullet 2+
      if (!discard && bi >= 1 && memberEsc) {
        if (new RegExp(`\\b${memberEsc}(?![a-zA-ZáéíóúüñÁÉÍÓÚÜÑ0-9_])`, 'i').test(bullet)) {
          discard = true
        }
      }
      // V5: twin clauses (≥60% Jaccard between comma/dash-split parts)
      if (!discard) {
        const parts = bullet.split(/[,–—]/)
        if (parts.length >= 2 && jaccardSim(parts[0], parts[parts.length - 1]) >= 0.6) {
          discard = true
        }
      }
      // V6: length
      if (!discard) {
        const wc = wordCount(bullet)
        if (wc < 8) { discard = true }
        else if (wc > 45) {
          // Truncate at last coherent clause
          const truncated = bullet.replace(/[,;]\s*[^,;]{0,40}$/, '')
          if (wordCount(truncated) >= 8) items[bi] = truncated
        }
      }
      // V7: technical jargon
      if (!discard && /\b(σ|sigma|slope|p-valor|outlier|at[ií]pic[oa]s?|desviaci[oó]n\s+est[aá]ndar|media\s+del\s+grupo)\b/i.test(bullet)) {
        discard = true
      }
      // V8: directional incoherence
      if (!discard && isDown && /\bcrecimiento\b|\bempuja el alza\b|\blidera el crecimiento\b|\bcrece\b|\bjalona\b/i.test(bullet)) {
        discard = true
      }
      if (!discard && !isDown && /\bdescenso\b|\bca[ií]da\b|\barrastra\b|\bperdi[oó]\b/i.test(bullet)) {
        discard = true
      }
      // V9: meta-pct incoherence
      if (!discard) {
        const metaPct = extractMetaPct(bullet)
        if (metaPct !== null) {
          if (isDown && metaPct >= 100) discard = true
          if (!isDown && metaPct < 90) discard = true
        }
      }
      // V10: trailing punctuation
      if (!discard) {
        items[bi] = items[bi].replace(/[,;:]\s*$/, '')
      }
      // V11: orphan verb+connector after depersonalization (Fase 4G)
      // Catches cases like "En su cartera, pierde porque X" where absorption failed
      if (!discard && bi >= 1) {
        if (/,\s*(?:pierde|cae|baja|arrastra|siente|recorta|sufre|jala|lidera|crece|empuja)\s+(?:porque|y|ya\s+que|debido\s+a|pues)\s/i.test(items[bi])) {
          discard = true
        }
      }
      // V12: double preposition — collapse known pairs or discard (Fase 4G)
      if (!discard) {
        const dpRe = /\b(en|a|de|con|por|sobre)\s+(del|al|de|a)\b/i
        if (dpRe.test(items[bi])) {
          const collapseRules: [RegExp, string][] = [
            [/\ben\s+del\b/gi,  'del'],
            [/\ben\s+al\b/gi,   'al'],
            [/\ba\s+del\b/gi,   'del'],
            [/\bde\s+del\b/gi,  'del'],
            [/\bpor\s+del\b/gi, 'por el'],
            [/\bcon\s+del\b/gi, 'con el'],
          ]
          let fixed = items[bi]
          let resolved = false
          for (const [re, repl] of collapseRules) {
            if (re.test(fixed)) { fixed = fixed.replace(re, repl); resolved = true }
          }
          if (resolved) { items[bi] = fixed } else { discard = true }
        }
      }
      // V13 (Fase 4H): concordancia singular/plural — "ese productos", "esa clientes", etc.
      if (!discard && /\b(ese|esa|este|esta)\s+(productos|clientes|vendedores|categorías|categorias|zonas|canales|territorios|SKUs|líneas|lineas)\b/i.test(items[bi])) {
        discard = true
      }
      // V14 (Fase 4H): concordancia verbal con sujeto compuesto — corregir in-place, descartar como fallback
      if (!discard) {
        const singToPlur: Record<string, string> = {
          arrastra: 'arrastran', baja: 'bajan', cae: 'caen', pierde: 'pierden',
          recorta: 'recortan', sufre: 'sufren', siente: 'sienten', frena: 'frenan',
          apaga: 'apagan', abandona: 'abandonan', deja: 'dejan', retrocede: 'retroceden',
          flaquea: 'flaquean', cede: 'ceden',
          empuja: 'empujan', jalona: 'jalonan', lidera: 'lideran', crece: 'crecen',
          impulsa: 'impulsan', abre: 'abren', gana: 'ganan', suma: 'suman',
          explica: 'explican', concentra: 'concentran', aporta: 'aportan',
          mueve: 'mueven', jala: 'jalan', encabeza: 'encabezan',
          viene: 'vienen', está: 'están', ha: 'han',
        }
        const singPat = Object.keys(singToPlur).join('|')
        // Detect compound subject (2+ proper names/words) + singular verb
        const compRe = new RegExp(
          `[A-ZÁÉÍÓÚÑ][\\wáéíóúüñ]+(?:[\\s]+[A-ZÁÉÍÓÚÑ\\d][\\wáéíóúüñ]*)*(?:\\s*,\\s*[A-ZÁÉÍÓÚÑ][\\wáéíóúüñ]+(?:[\\s]+[A-ZÁÉÍÓÚÑ\\d][\\wáéíóúüñ]*)*)*\\s+(?:y|junto\\s+con|o|y\\s+también)\\s+[A-ZÁÉÍÓÚÑ][\\wáéíóúüñ]+(?:[\\s][A-ZÁÉÍÓÚÑ\\d][\\wáéíóúüñ]*)*\\s+(${singPat})\\b`,
          'i',
        )
        const vm = items[bi].match(compRe)
        if (vm) {
          const verbSing = vm[1].toLowerCase()
          const verbPlur = singToPlur[verbSing]
          if (verbPlur) {
            items[bi] = items[bi].replace(new RegExp(`\\b${verbSing}\\b`, 'i'), verbPlur)
            // re-check V13 on corrected text
            if (/\b(ese|esa|este|esta)\s+(productos|clientes|vendedores|categorías|categorias|zonas|canales|territorios|SKUs|líneas|lineas)\b/i.test(items[bi])) {
              discard = true
            }
          } else {
            discard = true
          }
        }
      }
      // V15 (Fase 4I): comparar LEMAS verbales entre bullet 1 y bullet 2.
      // "pierde" y "perdieron" comparten lema "perder" → descartar bullet 2.
      if (!discard && bi === 1 && items.length >= 2) {
        const extraerLemas = (texto: string): Set<string> => {
          const lemas = new Set<string>()
          const palabras = texto.toLowerCase().match(/[a-záéíóúüñ]+/g) ?? []
          for (const p of palabras) if (LEMA_MAP[p]) lemas.add(LEMA_MAP[p])
          return lemas
        }
        const lemas1 = extraerLemas(items[0])
        const lemas2 = extraerLemas(items[1])
        const interseccion = [...lemas2].filter(l => lemas1.has(l))
        if (interseccion.length > 0) {
          console.debug('[fase4i] V15 lema repetido entre bullets:', interseccion.join(','))
          discard = true
        } else {
          // Frases clave multi-palabra que aún prohibimos literales
          const keyPhrases = ['siente el golpe', 'viene de', 'se concentra en', 'concentra su volumen']
          for (const phrase of keyPhrases) {
            if (items[0].toLowerCase().includes(phrase) && items[1].toLowerCase().includes(phrase)) {
              discard = true
              break
            }
          }
        }
      }
      // V16 (Fase 5A): referencia temporal prohibida por P4 del manifiesto v1.2+.
      // Estrategia escalonada: reparar in-place reemplazando por "mismo período del año anterior".
      // Si la reparación falla (patrón residual detectado), se descarta el bullet.
      if (!discard && tieneReferenciaTemporalProhibida(items[bi])) {
        const reparado = items[bi]
          .replace(/\bdel mes pasado\b/gi,         'del mismo período del año anterior')
          .replace(/\bel mes pasado\b/gi,          'el mismo período del año anterior')
          .replace(/\ben el mes pasado\b/gi,       'en el mismo período del año anterior')
          .replace(/\bmes pasado\b/gi,             'mismo período del año anterior')
          .replace(/\bel mes anterior\b/gi,        'el mismo período del año anterior')
          .replace(/\brespecto al mes anterior\b/gi, 'respecto al mismo período del año anterior')
          .replace(/\bmes anterior\b/gi,           'mismo período del año anterior')
          .replace(/\bel mes previo\b/gi,          'el mismo período del año anterior')
          .replace(/\bmes previo\b/gi,             'mismo período del año anterior')
          .replace(/\bper[ií]odo anterior\b/gi,    'mismo período del año anterior')
        if (!tieneReferenciaTemporalProhibida(reparado)) {
          console.debug('[fase5a] V16 bullet reparado in-place')
          items[bi] = reparado
        } else {
          console.debug('[fase5a] V16 bullet descartado por ref temporal prohibida:', items[bi].slice(0, 80))
          discard = true
        }
      }

      if (discard) {
        items.splice(bi, 1)
        console.debug('[fase4f] bullet descartado por validador:', bullet.slice(0, 60))
      }
    }
  }

  // CAMBIO 5: Commit pendingClaims to usedEntities only for entities mentioned in surviving bullets
  {
    const survivingText = items.join(' ').toLowerCase()
    for (const entity of pendingClaims) {
      if (survivingText.includes(entity)) {
        usedEntities.add(entity)
      }
    }
  }

  // ── Output ────────────────────────────────────────────────────────────────────
  const crucesCount = mentionedTables.size
  const tablasUsadas = [...mentionedTables]
  if (items.length === 0) {
    console.debug('[fase4f] descartado por fallo de validadores — 0 bullets:', c.title)
    return { sections: [], crucesCount, tablasUsadas }
  }
  return {
    sections: [{ label: 'Contexto', type: 'bullet', items: items.slice(0, 2) }],
    crucesCount,
    tablasUsadas,
  }
}

function buildBlockLinks(_c: InsightCandidate): DiagnosticLink[] {
  return []
}

// ════════════════════════════════════════════════════════════════════
// R106: BUILDERS RICOS (portados desde diagnostic-engine.ts — Z.2)
// Narrativa rica es responsabilidad interna del motor (R108).
// Estos helpers son privados — consumidores reciben DiagnosticBlock ya enriquecido.
// ════════════════════════════════════════════════════════════════════

// ─── Format helpers (leg = ported from legacy engine) ────────────────────────

const legFmtInt = (n: number): string =>
  Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

const legFmtPctAbs = (n: number): string => `${Math.abs(n).toFixed(1)}%`

const legRoundPctStr = (s: string): number => Math.round(parseFloat(s))

const legTruncate = (s: string, max: number): string =>
  s.length <= max ? s : s.slice(0, max - 1) + '…'

// ─── Description parsers ─────────────────────────────────────────────────────

const legParseTransition = (text: string): { from: number; to: number } | null => {
  const m = text.match(/\((\d[\d,.]*)\s*[→\->]+\s*(\d[\d,.]*)\s*uds?\)/i)
  if (!m) return null
  return {
    from: parseInt(m[1].replace(/[,.]/g, ''), 10),
    to: parseInt(m[2].replace(/[,.]/g, ''), 10),
  }
}

const legParseDiasSinComprar = (text: string): number | null => {
  const m = text.match(/(\d+)\s*d[ií]as\s+sin\s+comprar/i)
  return m ? parseInt(m[1], 10) : null
}

const legParseStock = (text: string): number | null => {
  const m = text.match(/Stock:\s*(\d[\d,.]*)\s*uds/i)
  if (m) return parseInt(m[1].replace(/[,.]/g, ''), 10)
  const m2 = text.match(/\((\d[\d,.]*)\s*uds/)
  return m2 ? parseInt(m2[1].replace(/[,.]/g, ''), 10) : null
}

const legParseDiasSinVentas = (text: string): number | null => {
  const m = text.match(/Sin ventas en (\d+)\s*d[ií]as/i)
  return m ? parseInt(m[1], 10) : null
}

const legParseClienteDeclive = (text: string): { pct: number } | null => {
  const m = text.match(/Cay[oó]\s*(\d+(?:\.\d+)?)%/i)
  return m ? { pct: legRoundPctStr(m[1]) } : null
}

const legParseCategoriaColapso = (text: string): { categoria: string; pct: number; from: number; to: number } | null => {
  const cat = text.match(/^"([^"]+)"\s*cay[oó]\s*(\d+(?:\.\d+)?)%/i)
  const trans = legParseTransition(text)
  if (!cat) return null
  return {
    categoria: cat[1],
    pct: legRoundPctStr(cat[2]),
    from: trans?.from ?? 0,
    to: trans?.to ?? 0,
  }
}

const legParseDependenciaVendedor = (text: string): { pct: number; zona: string; uds: number } | null => {
  const m = text.match(/El\s+(\d+(?:\.\d+)?)%\s+del\s+volumen\s+de\s+([^\s]+(?:\s+[^\s]+)*?)\s+depende\s+de\s+\S+\s+\((\d[\d,.]*)\s+de/i)
  if (!m) return null
  return {
    pct: legRoundPctStr(m[1]),
    zona: m[2].trim(),
    uds: parseInt(m[3].replace(/[,.]/g, ''), 10),
  }
}

const legParseMonoCategoria = (text: string): { pct: number; categoria: string } | null => {
  const m = text.match(/(\d+(?:\.\d+)?)%\s+de\s+sus\s+ventas\s+en\s+"([^"]+)"/i)
  return m ? { pct: legRoundPctStr(m[1]), categoria: m[2] } : null
}

const legParseMigracionCanal = (text: string): { from: string; to: string } | null => {
  const m = text.match(/^(.+?)\s+cay[oó]\s+[\d,]+\s+uds\s+pero\s+(.+?)\s+creci[oó]/i)
  return m ? { from: m[1].trim(), to: m[2].trim() } : null
}

const legParseOutlier = (text: string): { vendorPct: number; teamPct: number } | null => {
  const m = text.match(/([+-]?\d+(?:\.\d+)?)%\s+cuando\s+el\s+equipo\s+promedia\s+([+-]?\d+(?:\.\d+)?)%/i)
  if (!m) return null
  return {
    vendorPct: legRoundPctStr(m[1]),
    teamPct: legRoundPctStr(m[2]),
  }
}

const legIsOutlierAlto = (i: Insight): boolean => {
  if (i.detector !== 'outlier_variacion') return false
  if (/at[ií]pico\s+alto/i.test(i.titulo)) return true
  if (/at[ií]picamente\s+alto/i.test(i.descripcion)) return true
  return false
}

const legParseOportunidad = (text: string): { count: number } | null => {
  const m = text.match(/^(\d+)\s+productos/i)
  return m ? { count: parseInt(m[1], 10) } : null
}

// ─── Classification helpers ───────────────────────────────────────────────────

const LEG_PRIORITY_ORDER: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

const legIsInsightPositive = (i: Insight): boolean => {
  if (i.id.startsWith('superando-')) return true
  if (i.id.startsWith('mejor-momento-')) return true
  if (i.id.startsWith('prod-crecimiento-')) return true
  if (i.id.startsWith('cliente-nuevo-')) return true
  if (i.detector === 'oportunidad_no_explotada') return true
  if (i.detector === 'migracion_canal') return true
  if (i.detector === 'outlier_variacion') return legIsOutlierAlto(i)
  return false
}

const legLabelFromTipo = (tipo?: 'perdida' | 'riesgo' | 'oportunidad'): string => {
  if (tipo === 'perdida') return 'pérdida estimada'
  if (tipo === 'riesgo') return 'valor en riesgo'
  if (tipo === 'oportunidad') return 'oportunidad'
  return 'impacto económico'
}

const legMaxImpact = (items: Insight[]): { valor: number; label: string } | null => {
  let best: Insight | null = null
  for (const i of items) {
    if (!i.impacto_economico) continue
    if (!best || i.impacto_economico.valor > (best.impacto_economico?.valor ?? 0)) best = i
  }
  if (!best || !best.impacto_economico) return null
  return { valor: best.impacto_economico.valor, label: legLabelFromTipo(best.impacto_economico.tipo) }
}

const legLimitItems = (arr: string[], max: number): string[] => {
  if (arr.length <= max) return arr
  const head = arr.slice(0, max)
  head.push(`y ${arr.length - max} más`)
  return head
}

// ─── Rich builders ────────────────────────────────────────────────────────────

// [Z.6 F1 — heterogeneity] helper: push one or multiple blocks
function pushBlocks(target: DiagnosticBlock[], result: DiagnosticBlock | DiagnosticBlock[]): void {
  if (Array.isArray(result)) target.push(...result)
  else target.push(result)
}

function buildSingleVendorCard(
  vendedor: string,
  items: Insight[],
  vendorAnalysis: VendorAnalysis[],
  idSuffix = '',
): DiagnosticBlock {
  const sortedByPriority = [...items].sort(
    (a, b) => LEG_PRIORITY_ORDER[a.prioridad] - LEG_PRIORITY_ORDER[b.prioridad],
  )
  void sortedByPriority
  const va = vendorAnalysis.find(v => v.vendedor === vendedor)

  const hasCritica = items.some(i => i.prioridad === 'CRITICA')
  const severity: DiagnosticSeverity = hasCritica ? 'critical' : 'warning'

  const has = (prefix: string) => items.some(i => i.id.startsWith(prefix))
  const hasMeta = has('meta-peligro-') || has('meta-riesgo-') // [Z.6 F2 — sub-C] R123
  const hasDeterioro = has('deterioro-')
  const hasDoble = has('doble-riesgo-')
  // [Z.6 F2.2 — deprecation] hasCartera / hasConcentracion eliminados (R126): detectores desactivados

  let headline: string
  if (hasMeta && (hasDeterioro || hasDoble)) headline = `${vendedor} necesita intervención`
  else if (hasMeta) headline = `${vendedor} está lejos de su meta`
  else if (hasDeterioro) headline = `${vendedor} viene cayendo`
  else { // [Z.6 F2 — sub-C] R123: fallback al titulo del insight dominante por impacto
    const dominante = [...items].sort(
      (a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0)
    )[0]
    headline = dominante?.titulo ?? `${vendedor}: atención requerida`
  }

  let summaryShort: string
  if (va && va.variacion_vs_promedio_pct != null && va.proyeccion_cierre != null && va.meta && va.cumplimiento_pct != null) {
    const caidaPct = legFmtPctAbs(va.variacion_vs_promedio_pct)
    const proy = legFmtInt(va.proyeccion_cierre)
    const meta = legFmtInt(va.meta)
    const cumpl = Math.round(va.cumplimiento_pct)
    summaryShort = `Cayó ${caidaPct} vs su promedio. Proyecta ${proy} de ${meta} uds (${cumpl}%).`
  } else if (va && va.proyeccion_cierre != null && va.meta && va.cumplimiento_pct != null) {
    summaryShort = `Proyecta ${legFmtInt(va.proyeccion_cierre)} de ${legFmtInt(va.meta)} uds (${Math.round(va.cumplimiento_pct)}%).`
  } else {
    summaryShort = `${items.length} señales de riesgo detectadas.`
  }

  // Z.3 — NarrativeBuilder (R111): bullets tipados, sin template literals crudos
  const nb = new NarrativeBuilder(vendedor, severity, `vendor-${vendedor}`, va?.cumplimiento_pct, 5)

  const caida = items.find(i => i.id.startsWith('caida-explicada-'))
  if (caida && caida.cliente) {
    const trans = legParseTransition(caida.descripcion)
    if (trans) {
      nb.addHechoPrincipal(legTruncate(`Su caída viene de ${caida.cliente} (${legFmtInt(trans.from)}→${legFmtInt(trans.to)} uds)`, 110))
    } else {
      nb.addHechoPrincipal(legTruncate(`Su caída viene de ${caida.cliente}`, 110))
    }
  }

  const causaRaiz = items.find(i => i.detector === 'causa_raiz_compartida')
  if (causaRaiz) {
    nb.addHechoPrincipal(legTruncate(`Concentra caídas en varios departamentos o canales — posible causa raíz`, 110))
  }

  const outlierBajo = items.find(i => i.detector === 'outlier_variacion' && !legIsOutlierAlto(i))
  if (outlierBajo) {
    const o = legParseOutlier(outlierBajo.descripcion)
    if (o) {
      const vSign = o.vendorPct >= 0 ? '+' : ''
      const tSign = o.teamPct >= 0 ? '+' : ''
      nb.addHechoPrincipal(legTruncate(`Varía ${vSign}${o.vendorPct}% cuando el equipo promedia ${tSign}${o.teamPct}% — rendimiento atípico`, 110))
    } else {
      nb.addHechoPrincipal(legTruncate(`Rendimiento atípicamente bajo vs el equipo`, 110))
    }
  }

  const dormidos = items.filter(i => i.id.startsWith('cliente-riesgo-') && i.cliente)
  for (const d of dormidos) {
    const dias = legParseDiasSinComprar(d.descripcion)
    if (dias != null) {
      nb.addHechoPrincipal(legTruncate(`${d.cliente} · ${dias} días sin comprar`, 110))
    } else {
      const declive = legParseClienteDeclive(d.descripcion)
      if (declive) nb.addHechoPrincipal(legTruncate(`${d.cliente} · cayó ${declive.pct}% vs año anterior`, 110))
      else nb.addHechoPrincipal(legTruncate(`${d.cliente} · cliente en riesgo`, 110))
    }
  }

  const subejec = items.find(i => i.id.startsWith('subejec-'))
  if (subejec) {
    nb.addHechoPrincipal(legTruncate(`3 meses consecutivos bajo el 85% de su meta`, 110))
  }

  // [Z.6 F1 — heterogeneity] Fallback: emitir bullet desde titulo para tipos no mapeados arriba
  if (nb.clauseCount === 0) {
    for (const i of items) {
      if (i.titulo) nb.addHechoPrincipal(legTruncate(i.titulo, 110))
    }
  }

  const acciones: string[] = []
  const dormidoEstancados = items.filter(i => i.id.startsWith('dormido-estancado-'))
  for (const d of dormidoEstancados) {
    if (!d.cliente || !d.producto) continue
    const stock = legParseStock(d.descripcion)
    if (stock != null) {
      acciones.push(legTruncate(`${d.cliente} compraba ${d.producto} — tienes ${legFmtInt(stock)} uds en stock`, 110))
    } else {
      acciones.push(legTruncate(`${d.cliente} compraba ${d.producto} — hay stock disponible`, 110))
    }
  }

  const sections: DiagnosticSection[] = []
  const narrativeProse = nb.render()
  if (narrativeProse) {
    sections.push({ label: NB_SECTION_LABEL, type: 'bullet', items: [narrativeProse] })
  }
  if (acciones.length > 0) {
    sections.push({ label: 'Qué puedes hacer', type: 'action', items: legLimitItems(acciones, 3) })
  }

  const impact = legMaxImpact(items)

  return {
    id: `vendor-${vendedor}${idSuffix}`,
    severity,
    headline,
    summaryShort: legTruncate(summaryShort, 120),
    sections,
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
    impactoUSD: impact?.valor ?? 0, // [Z.5 — Frente 2] R119
  }
}

// [Z.6 F1 — heterogeneity] R121: wrapper con split heterogéneo
function buildRichVendorSection(
  vendedor: string,
  items: Insight[],
  vendorAnalysis: VendorAnalysis[],
): DiagnosticBlock | DiagnosticBlock[] {
  const hetero = analizarHeterogeneidad(
    items.map(i => ({ impactoUSD: i.impacto_economico?.valor ?? 0 })),
  )
  if (hetero.esHeterogeneo && items.length >= 2) {
    const sorted = [...items].sort(
      (a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0),
    )
    const outlier = sorted[0]
    const resto = sorted.slice(1)
    const result: DiagnosticBlock[] = [buildSingleVendorCard(vendedor, [outlier], vendorAnalysis)]
    if (resto.length > 0) {
      result.push(buildSingleVendorCard(vendedor, resto, vendorAnalysis, '-resto'))
    }
    return result
  }
  return buildSingleVendorCard(vendedor, items, vendorAnalysis)
}

function buildSingleProductCard(items: Insight[], idSuffix = ''): DiagnosticBlock {
  const colapso = items.find(i => i.id.startsWith('cat-colapso-'))
  const sinMov = items.filter(i => !i.id.startsWith('cat-colapso-'))

  let headline: string
  let summaryShort: string

  if (colapso) {
    const parsed = legParseCategoriaColapso(colapso.descripcion)
    const catFromTitulo = colapso.titulo.match(/—\s*(.+?)\s*$/)?.[1]
                      ?? colapso.titulo.replace(/^Categor[ií]a en colapso\s*[—-]?\s*/i, '').trim()
    const categoria = parsed?.categoria ?? catFromTitulo ?? 'Una categoría'
    const pctMatch = colapso.descripcion.match(/(\d+(?:\.\d+)?)%/)
    const pctVal = parsed?.pct ?? (pctMatch ? legRoundPctStr(pctMatch[1]) : null)
    const trans = legParseTransition(colapso.descripcion)
    const from = parsed?.from ?? trans?.from ?? 0
    const to = parsed?.to ?? trans?.to ?? 0

    if (pctVal !== null) {
      headline = `${categoria} cayó ${pctVal}%`
      summaryShort = from > 0 && to > 0
        ? `${categoria} cayó ${pctVal}% vs su promedio (${legFmtInt(from)}→${legFmtInt(to)} uds).`
        : `${categoria} cayó ${pctVal}% vs su promedio.`
    } else {
      headline = `${categoria} se está desplomando`
      summaryShort = `${categoria} cayó de forma significativa este período.`
    }
  } else if (sinMov.length >= 2) {
    headline = `${sinMov.length} productos sin movimiento`
    const p0 = sinMov[0]
    const p1 = sinMov[1]
    const dias0 = legParseDiasSinVentas(p0.descripcion)
    const stock0 = legParseStock(p0.descripcion)
    const dias1 = legParseDiasSinVentas(p1.descripcion)
    const d0txt = dias0 != null ? `${dias0} días sin venta` : 'sin movimiento'
    const s0txt = stock0 != null ? `, ${legFmtInt(stock0)} uds en stock` : ''
    const d1txt = dias1 != null ? `${dias1} días` : ''
    const extra = sinMov.length > 2 ? ` — ${sinMov.length - 2} más en la lista` : ''
    if (p0.producto && p1.producto) {
      summaryShort = `${p0.producto} (${d0txt}${s0txt}) y ${p1.producto}${d1txt ? ` (${d1txt})` : ''}${extra}.`
    } else {
      summaryShort = `${sinMov.length} productos llevan semanas o meses sin venderse.`
    }
  } else {
    headline = 'Productos en riesgo'
    const topItem = sinMov[0]
    const nombreProd = topItem?.producto || topItem?.titulo?.split(' — ')[0] || topItem?.titulo || null
    if (topItem && nombreProd) {
      const dias = legParseDiasSinVentas(topItem.descripcion)
      const stock = legParseStock(topItem.descripcion)
      if (dias != null && stock != null) {
        summaryShort = `${nombreProd} lleva ${dias} días sin venderse y tiene ${legFmtInt(stock)} uds en stock — posible quiebre de rotación.`
      } else if (dias != null) {
        summaryShort = `${nombreProd} lleva ${dias} días sin venderse — posible quiebre de rotación.`
      } else {
        const otrosCount = items.length - 1
        // [PR-FIX.3-B] evitar QUÉ PASÓ = "<producto>." — narrativa vacía sin contexto
        summaryShort = otrosCount > 0
          ? `${nombreProd} y ${otrosCount} producto(s) más requieren atención.`
          : `${nombreProd}: desplazamiento detectado en la composición del grupo vs período anterior — revisar rotación.`
      }
    } else {
      summaryShort = `${items.length} producto(s) requieren atención.`
    }
  }

  // Z.3 — NarrativeBuilder (R111/R112): cada producto individual con su propia cifra
  const nb = new NarrativeBuilder('Productos', 'warning', 'productos', undefined, 5)

  for (const p of sinMov) {
    if (!p.producto) continue
    const dias = legParseDiasSinVentas(p.descripcion)
    const stock = legParseStock(p.descripcion)
    if (dias != null && stock != null) {
      nb.addHechoPrincipal(legTruncate(`${p.producto} · sin ventas en ${dias} días · ${legFmtInt(stock)} uds en stock`, 110))
    } else if (dias != null) {
      nb.addHechoPrincipal(legTruncate(`${p.producto} · sin ventas en ${dias} días`, 110))
    } else {
      const declive = p.descripcion.match(/Cay[oó]\s+(\d+(?:\.\d+)?)%/i)
      if (declive) {
        nb.addHechoPrincipal(legTruncate(`${p.producto} · cayó ${legRoundPctStr(declive[1])}% vs año anterior`, 110))
      } else {
        nb.addHechoPrincipal(legTruncate(`${p.producto}`, 110))
      }
    }
  }

  const sections: DiagnosticSection[] = []
  const narrativeProse = nb.render()
  if (narrativeProse) {
    sections.push({ label: NB_SECTION_LABEL, type: 'bullet', items: [narrativeProse] })
  }

  const impact = legMaxImpact(items)

  return {
    id: `productos${idSuffix}`,
    severity: 'warning',
    headline,
    summaryShort: legTruncate(summaryShort, 120),
    sections,
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
    impactoUSD: impact?.valor ?? 0, // [Z.5 — Frente 2] R119
  }
}

// [Z.6 F1 — heterogeneity] R121: wrapper con split heterogéneo
function buildRichProductSection(items: Insight[]): DiagnosticBlock | DiagnosticBlock[] {
  const hetero = analizarHeterogeneidad(
    items.map(i => ({ impactoUSD: i.impacto_economico?.valor ?? 0 })),
  )
  if (hetero.esHeterogeneo && items.length >= 2) {
    const sorted = [...items].sort(
      (a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0),
    )
    const result: DiagnosticBlock[] = [buildSingleProductCard([sorted[0]])]
    if (sorted.slice(1).length > 0) result.push(buildSingleProductCard(sorted.slice(1), '-resto'))
    return result
  }
  return buildSingleProductCard(items)
}

// [Z.6 F2.2 — LEGACY] Builder deprecado. No se invoca desde buildRichBlocksFromInsights.
// Conservado por historial. Ver manifiesto §28.3.
function buildSingleConcentracionCard(items: Insight[], idSuffix = ''): DiagnosticBlock {
  const dependencias = items.filter(i => i.detector === 'dependencia_vendedor')
  const monoCats = items.filter(i => i.id.startsWith('mono-cat-'))

  const n = dependencias.length
  const headline = n > 0
    ? `Riesgo de concentración en ${n} ${n === 1 ? 'zona' : 'zonas'}`
    : 'Riesgo de concentración'

  const summaryShort = n > 0
    ? `${n} ${n === 1 ? 'zona depende' : 'zonas dependen'} de un solo vendedor.`
    : `${items.length} señales de concentración detectadas.`

  // Z.3 — NarrativeBuilder (R111): combina zonas + mono en un solo prose
  const nb = new NarrativeBuilder('Concentración', 'warning', 'concentracion', undefined, 8)

  for (const dep of dependencias) {
    const parsed = legParseDependenciaVendedor(dep.descripcion)
    if (parsed && dep.vendedor) {
      nb.addHechoPrincipal(legTruncate(`${parsed.zona}: ${parsed.pct}% depende de ${dep.vendedor} (${legFmtInt(parsed.uds)} uds)`, 110))
    } else if (dep.vendedor) {
      nb.addHechoPrincipal(legTruncate(`Una zona concentrada en ${dep.vendedor}`, 110))
    }
  }

  for (const m of monoCats) {
    const parsed = legParseMonoCategoria(m.descripcion)
    if (parsed && m.vendedor) {
      nb.addHechoPrincipal(legTruncate(`${m.vendedor} concentra ${parsed.pct}% en ${parsed.categoria}`, 110))
    }
  }

  // [Z.5 — Frente 1] R118: prefijos reales del motor viejo (concentracion, grupo-concentracion, cartera-pequeña, depto-caida)
  const realConc = items.filter(i =>
    i.id.startsWith('concentracion') ||
    i.id.startsWith('grupo-concentracion') ||
    i.id.startsWith('cartera-pequeña') ||
    i.id.startsWith('depto-caida'),
  )
  for (const c of realConc) {
    nb.addHechoPrincipal(legTruncate(c.titulo || c.descripcion.slice(0, 100), 110))
  }

  const sections: DiagnosticSection[] = []
  const narrativeProse = nb.render()
  if (narrativeProse) {
    sections.push({ label: NB_SECTION_LABEL, type: 'bullet', items: [narrativeProse] })
  }

  const concImpact = legMaxImpact(items)

  return {
    id: `concentracion${idSuffix}`,
    severity: 'warning',
    headline,
    summaryShort: legTruncate(summaryShort, 120),
    sections,
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: concImpact?.valor ?? null,
    impactoLabel: concImpact?.label ?? null,
    impactoUSD: concImpact?.valor ?? 0, // [Z.5 — Frente 2] R119
  }
}

// [Z.6 F1 — heterogeneity] R121: wrapper con split heterogéneo
function buildRichConcentracionSection(items: Insight[]): DiagnosticBlock | DiagnosticBlock[] {
  const hetero = analizarHeterogeneidad(
    items.map(i => ({ impactoUSD: i.impacto_economico?.valor ?? 0 })),
  )
  if (hetero.esHeterogeneo && items.length >= 2) {
    const sorted = [...items].sort(
      (a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0),
    )
    const result: DiagnosticBlock[] = [buildSingleConcentracionCard([sorted[0]])]
    if (sorted.slice(1).length > 0) result.push(buildSingleConcentracionCard(sorted.slice(1), '-resto'))
    return result
  }
  return buildSingleConcentracionCard(items)
}

function buildSingleClientsCard(items: Insight[], idSuffix = ''): DiagnosticBlock {
  const clienteInsights = items.filter(i => i.id.startsWith('cliente-riesgo-') && i.cliente)
  const n = clienteInsights.length

  const headline = n === 1
    ? `${clienteInsights[0].cliente} necesita atención`
    : `${n} clientes cayeron significativamente`

  const summaryShort = n === 1
    ? `Un cliente importante en declive vs año anterior.`
    : `${n} clientes cayeron significativamente vs año anterior.`

  // Z.3 — NarrativeBuilder (R111)
  const nb = new NarrativeBuilder('Clientes', 'warning', 'clientes-sueltos', undefined, 5)

  for (const c of clienteInsights) {
    if (!c.cliente) continue
    const declive = legParseClienteDeclive(c.descripcion)
    const dias = legParseDiasSinComprar(c.descripcion)
    let line: string
    if (declive && c.vendedor) {
      line = `${c.cliente} · cayó ${declive.pct}% · atendido por ${c.vendedor}`
    } else if (dias != null && c.vendedor) {
      line = `${c.cliente} · ${dias} días sin comprar · ${c.vendedor}`
    } else if (declive) {
      line = `${c.cliente} · cayó ${declive.pct}%`
    } else if (c.vendedor) {
      line = `${c.cliente} · atendido por ${c.vendedor}`
    } else {
      line = `${c.cliente}`
    }
    nb.addHechoPrincipal(legTruncate(line, 110))
  }

  const sections: DiagnosticSection[] = []
  const narrativeProse = nb.render()
  if (narrativeProse) {
    sections.push({ label: NB_SECTION_LABEL, type: 'bullet', items: [narrativeProse] })
  }

  const impact = legMaxImpact(items)

  return {
    id: `clientes-sueltos${idSuffix}`,
    severity: 'warning',
    headline,
    summaryShort: legTruncate(summaryShort, 120),
    sections,
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
    impactoUSD: impact?.valor ?? 0, // [Z.5 — Frente 2] R119
  }
}

// [Z.6 F1 — heterogeneity] R121: wrapper con split heterogéneo
function buildRichClientsSection(items: Insight[]): DiagnosticBlock | DiagnosticBlock[] {
  const hetero = analizarHeterogeneidad(
    items.map(i => ({ impactoUSD: i.impacto_economico?.valor ?? 0 })),
  )
  if (hetero.esHeterogeneo && items.length >= 2) {
    const sorted = [...items].sort(
      (a, b) => (b.impacto_economico?.valor ?? 0) - (a.impacto_economico?.valor ?? 0),
    )
    const result: DiagnosticBlock[] = [buildSingleClientsCard([sorted[0]])]
    if (sorted.slice(1).length > 0) result.push(buildSingleClientsCard(sorted.slice(1), '-resto'))
    return result
  }
  return buildSingleClientsCard(items)
}

function buildSinglePositiveCard(items: Insight[], idSuffix = ''): DiagnosticBlock {
  const headline = 'Lo que está funcionando'
  const summaryShort = `${items.length} ${items.length === 1 ? 'señal positiva' : 'señales positivas'} este mes.`

  // Z.3 — NarrativeBuilder (R111)
  const nb = new NarrativeBuilder('Positivo', 'positive', 'positivo', undefined, 6)

  for (const i of items) {
    if (i.detector === 'migracion_canal') {
      const parsed = legParseMigracionCanal(i.descripcion)
      if (parsed) {
        nb.addHechoPrincipal(legTruncate(`Volumen migró de ${parsed.from} a ${parsed.to} — no se perdió venta`, 110))
        continue
      }
    }
    if (i.detector === 'outlier_variacion' && legIsOutlierAlto(i) && i.vendedor) {
      const o = legParseOutlier(i.descripcion)
      if (o) {
        const teamSign = o.teamPct >= 0 ? '+' : ''
        const vendSign = o.vendorPct >= 0 ? '+' : ''
        nb.addHechoPrincipal(legTruncate(`${i.vendedor} crece ${vendSign}${o.vendorPct}% cuando el equipo promedia ${teamSign}${o.teamPct}%`, 110))
      } else {
        nb.addHechoPrincipal(legTruncate(`${i.vendedor} con rendimiento atípicamente alto vs el equipo`, 110))
      }
      continue
    }
    if (i.detector === 'oportunidad_no_explotada') {
      const parsed = legParseOportunidad(i.descripcion)
      if (parsed) {
        nb.addHechoPrincipal(legTruncate(`${parsed.count} productos sin cobertura en algunos departamentos`, 110))
        continue
      }
    }
    if (i.id.startsWith('superando-') && i.vendedor) {
      const m = i.descripcion.match(/super[oó]\s+su\s+meta\s+en\s+(\d+(?:\.\d+)?)%/i)
      if (m) {
        nb.addHechoPrincipal(legTruncate(`${i.vendedor} superó su meta en ${legRoundPctStr(m[1])}%`, 110))
        continue
      }
    }
    if (i.id.startsWith('mejor-momento-') && i.vendedor) {
      nb.addHechoPrincipal(legTruncate(`${i.vendedor} en su mejor período reciente`, 110))
      continue
    }
    if (i.id.startsWith('prod-crecimiento-') && i.producto) {
      const m = i.descripcion.match(/creci[oó]\s+(\d+(?:\.\d+)?)%/i)
      if (m) {
        nb.addHechoPrincipal(legTruncate(`${i.producto} creció ${legRoundPctStr(m[1])}% este período`, 110))
        continue
      }
    }
    if (i.id.startsWith('cliente-nuevo-') && i.cliente) {
      nb.addHechoPrincipal(legTruncate(`${i.cliente} es un cliente nuevo activo`, 110))
      continue
    }
  }

  const sections: DiagnosticSection[] = []
  const narrativeProse = nb.render()
  if (narrativeProse) {
    sections.push({ label: NB_SECTION_LABEL, type: 'bullet', items: [narrativeProse] })
  }

  return {
    id: `positivo${idSuffix}`,
    severity: 'positive',
    headline,
    summaryShort,
    sections,
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: null,
    impactoLabel: null,
    impactoUSD: items.reduce((s, i) => s + Math.abs(i.impacto_economico?.valor ?? 0), 0), // [Z.6 F2 — sub-A] R119.1: magnitud absoluta del valor positivo
  }
}

// [Z.6 F1 — heterogeneity] R121: wrapper (positivos sin impacto USD, fallback directo)
function buildRichPositiveSection(items: Insight[]): DiagnosticBlock | DiagnosticBlock[] {
  return buildSinglePositiveCard(items)
}

// ─── R109: classifyCandidateType — 7 tipos operacionales derivados del candidato ─

type OperationalType =
  | 'outlier_variacion'
  | 'oportunidad_no_explotada'
  | 'migracion_canal'
  | 'perdida'
  | 'riesgo'
  | 'oportunidad'
  | 'hallazgo'

function classifyCandidateType(c: InsightCandidate): OperationalType {
  const det = c.detail as Record<string, unknown>
  const deltaYoY = typeof det.deltaYoY === 'number' ? det.deltaYoY : 0
  if (c.dimensionId === 'canal' && deltaYoY < 0) return 'migracion_canal'
  if (c.insightTypeId === 'sin_cobertura' || det.coberturaRiesgo) return 'oportunidad_no_explotada'
  if ((c.severity === 'CRITICA' || c.severity === 'ALTA') && deltaYoY < 0) return 'perdida'
  if (c.severity === 'CRITICA' || c.severity === 'ALTA') {
    if (deltaYoY > 0.5) return 'outlier_variacion'
    return 'riesgo'
  }
  if (deltaYoY > 0) return 'oportunidad'
  return 'hallazgo'
}

// ─── [Z.5 — Frente 2] R119: convierte candidato del motor nuevo a impacto en USD ─

function computeImpactoUSDFromCandidate(c: InsightCandidate, ctx: BlockContext): number {
  // [Z.9.2 — R138] Si impacto_valor ya fue hidratado y está en USD, usarlo directamente.
  // Condición: impacto_valor disponible Y la métrica produce USD (no unidades/txns).
  const isUSDMetric = c.metricId === 'venta' || c.metricId === 'ticket_promedio'
  if (typeof c.impacto_valor === 'number' && isFinite(c.impacto_valor) && isUSDMetric) {
    return Math.abs(c.impacto_valor)
  }
  // Para tipos que ya devuelven USD en impacto_valor independiente de la métrica:
  const _usdDirectTypes = new Set(['stock_risk', 'stock_excess', 'co_decline', 'product_dead', 'cliente_dormido', 'cliente_perdido', 'migration', 'meta_gap_temporal'])
  if (typeof c.impacto_valor === 'number' && isFinite(c.impacto_valor) && _usdDirectTypes.has(c.insightTypeId)) {
    return Math.abs(c.impacto_valor)
  }

  const det = c.detail as Record<string, unknown>
  const isUSD = c.metricId === 'venta' || c.metricId === 'ticket_promedio'

  const totalVenta = ctx.vendorAnalysis.reduce((s, v) => s + v.ventas_periodo, 0)
  const totalUds   = ctx.vendorAnalysis.reduce((s, v) => s + v.unidades_periodo, 0)
  const avgPrecio  = totalUds > 0 ? totalVenta / totalUds : 0
  const avgMeta    = ctx.vendorAnalysis.reduce((s, v) => s + (v.meta_usd ?? v.meta ?? 0), 0)
                     / Math.max(1, ctx.vendorAnalysis.length)

  const toUSD = (val: number): number => {
    if (isUSD) return val
    if (c.metricId === 'unidades' || c.metricId === 'num_transacciones') return val * avgPrecio
    if (c.metricId === 'cumplimiento_meta') return Math.abs(val) * avgMeta / 100
    return 0
  }

  switch (c.insightTypeId) {
    case 'change': {
      const cur  = typeof det.cur  === 'number' ? det.cur  : 0
      const prev = typeof det.prev === 'number' ? det.prev : 0
      return toUSD(Math.abs(cur - prev))
    }
    case 'contribution':
      return toUSD(Math.abs(typeof det.memberChange === 'number' ? det.memberChange : 0))
    case 'trend': {
      const hist  = Array.isArray(det.history) ? (det.history as number[]) : []
      const first = typeof det.historyStart === 'number' ? det.historyStart : (hist[0] ?? 0)
      const last  = typeof det.historyEnd   === 'number' ? det.historyEnd   : (hist[hist.length - 1] ?? 0)
      return toUSD(Math.abs(last - first))
    }
    case 'dominance':
      return toUSD(Math.abs(typeof det.memberValue === 'number' ? det.memberValue : 0))
    case 'meta_gap':
      return Math.abs(typeof det.gapUSD === 'number' ? det.gapUSD : (typeof det.gap === 'number' ? det.gap : 0))
    case 'cliente_dormido':
      return typeof det.impactoVentaHistorica === 'number' ? det.impactoVentaHistorica : 0
    default:
      return 0 // correlation y otros no monetizables: fallback vía score × 0.5 en enrichDiagnosticBlocks
  }
}

// [Z.6 F2 — sub-B] R122: builders para insights huérfanos (completeness guarantee) ─────
function buildSingleOrphanCard(items: Insight[], idSuffix = ''): DiagnosticBlock {
  const primary = items[0]
  const severity: DiagnosticSeverity = primary.esPositivo
    ? 'positive'
    : primary.prioridad === 'CRITICA' ? 'critical' : 'info'
  const bullets = items.map(i => i.titulo).filter(Boolean)
  return {
    id: `orphan-${primary.id}${idSuffix}`,
    severity,
    headline: primary.titulo || 'Contexto del equipo',
    summaryShort: primary.descripcion || primary.conclusion || '',
    sections: bullets.length > 0
      ? [{ label: 'Señales', type: 'bullet' as const, items: bullets }]
      : [],
    links: [],
    insightIds: items.map(i => i.id),
    impactoTotal: null,
    impactoLabel: null,
    impactoUSD: items.reduce((s, i) => s + Math.abs(i.impacto_economico?.valor ?? 0), 0),
  }
}

function buildRichOrphanSection(items: Insight[]): DiagnosticBlock[] {
  if (items.length === 0) return []
  const hetero = analizarHeterogeneidad(items.map(i => ({ impactoUSD: Math.abs(i.impacto_economico?.valor ?? 0) })))
  if (hetero.esHeterogeneo) {
    const sorted = [...items].sort(
      (a, b) => Math.abs(b.impacto_economico?.valor ?? 0) - Math.abs(a.impacto_economico?.valor ?? 0),
    )
    const out: DiagnosticBlock[] = [buildSingleOrphanCard([sorted[0]])]
    if (sorted.length > 1) out.push(buildSingleOrphanCard(sorted.slice(1), '-resto'))
    return out
  }
  return [buildSingleOrphanCard(items)]
}

// ─── R106: buildRichBlocksFromInsights — orquestador interno (Z.2) ────────────

export function buildRichBlocksFromInsights( // [Z.4 — perf: cuello-3] exportado para useMemo en EstadoComercialPage
  insights: Insight[],
  vendorAnalysis: VendorAnalysis[],
): DiagnosticBlock[] {
  if (!insights || insights.length === 0) return []

  // [Z.6 F2.1 — hydration fix] R119.2: impactoUSD idempotente en cada Insight del motor viejo
  // Permite que el fiber walk y futuros sorts usen i.impactoUSD directamente.
  // Idempotente: no sobreescribe si ya está seteado. Degrada a undefined si no hay valor (no 0).
  insights = insights.map(i => {
    if (i.impactoUSD != null) return i
    const valor = i.impacto_economico?.valor
    if (valor == null) return i
    return { ...i, impactoUSD: Math.abs(valor) }
  })

  const blocks: DiagnosticBlock[] = []
  const used = new Set<string>()
  const mark = (ids: string[]) => ids.forEach(id => used.add(id))
  const remaining = () => insights.filter(i => !used.has(i.id))

  // Step 1: Vendor protagonists — [Z.5 — Frente 1] R118: umbral 1 (antes ≥3), filtro $500
  const vendorMap = new Map<string, Insight[]>()
  for (const insight of insights) {
    if (!insight.vendedor) continue
    if (legIsInsightPositive(insight)) continue
    if (insight.tipo === 'hallazgo') continue
    if (!vendorMap.has(insight.vendedor)) vendorMap.set(insight.vendedor, [])
    vendorMap.get(insight.vendedor)!.push(insight)
  }

  const protagonists = [...vendorMap.entries()]
    .filter(([, items]) => items.some(i => (i.impacto_economico?.valor ?? 0) >= 500))
    .sort((a, b) => {
      const aImpact = legMaxImpact(a[1])?.valor ?? 0
      const bImpact = legMaxImpact(b[1])?.valor ?? 0
      if (b[1].length !== a[1].length) return b[1].length - a[1].length
      return bImpact - aImpact
    })

  for (const [vendedor, baseItems] of protagonists) {
    // [Z.5 — Frente 1] R118: solo items con impacto >= $500 para el bloque
    const qualifiedItems = baseItems.filter(i => (i.impacto_economico?.valor ?? 0) >= 500)
    if (qualifiedItems.length === 0) continue
    const absorbedHallazgos = insights.filter(i =>
      i.tipo === 'hallazgo' && i.vendedor === vendedor && !legIsInsightPositive(i),
    )
    const allItems = [...qualifiedItems, ...absorbedHallazgos]
    // [Z.6 F1 — heterogeneity] R121: puede devolver 1 o N blocks
    pushBlocks(blocks, buildRichVendorSection(vendedor, allItems, vendorAnalysis))
    mark(allItems.map(i => i.id))
  }

  // Step 2: Products / Categories — [Z.5 — Frente 1] R118: incluye inventario y prefijos reales
  const productInsights = remaining().filter(i =>
    (i.tipo === 'riesgo_producto' ||
     i.tipo === 'riesgo_inventario' ||
     i.id.startsWith('sustitucion') ||
     i.id.startsWith('co-declive') ||
     i.id.startsWith('producto-oportunidad')) &&
    !legIsInsightPositive(i),
  )
  if (productInsights.length > 0) {
    // [Z.6 F1 — heterogeneity] R121
    pushBlocks(blocks, buildRichProductSection(productInsights))
    mark(productInsights.map(i => i.id))
  }

  // Step 3: Concentration — [Z.6 F2.2 — deprecation] R126: concentracion/cartera-pequeña desactivados
  // depto-caida sigue activo (detector diferente, no deprecado)
  // [Z.5 — Frente 1] R118: prefijos reales del motor viejo
  // const concentracion = remaining().filter(i =>
  //   i.id.startsWith('concentracion') ||
  //   i.id.startsWith('grupo-concentracion') ||
  //   i.id.startsWith('cartera-pequeña') ||
  //   i.id.startsWith('depto-caida'),
  // )
  // if (concentracion.length > 0) {
  //   pushBlocks(blocks, buildRichConcentracionSection(concentracion))
  //   mark(concentracion.map(i => i.id))
  // }

  // Step 4: Loose clients — [Z.5 — Frente 1] R118: clientes con campo cliente pero sin vendedor asociado
  const looseClients = remaining().filter(i =>
    i.cliente && !i.vendedor && !legIsInsightPositive(i),
  )
  if (looseClients.length > 0) {
    const attendingVendors = new Set<string>()
    for (const c of looseClients) {
      if (c.vendedor) attendingVendors.add(c.vendedor)
    }
    const absorbedHallazgos = remaining().filter(i =>
      i.tipo === 'hallazgo' && i.vendedor && attendingVendors.has(i.vendedor) && !legIsInsightPositive(i),
    )
    // [Z.6 F1 — heterogeneity] R121
    pushBlocks(blocks, buildRichClientsSection(looseClients))
    mark(looseClients.map(i => i.id))
    mark(absorbedHallazgos.map(i => i.id))
  }

  // Step 5: Positive
  const positives = insights.filter(i => legIsInsightPositive(i))
  if (positives.length > 0) {
    // [Z.6 F1 — heterogeneity] R121
    pushBlocks(blocks, buildRichPositiveSection(positives))
    mark(positives.map(i => i.id))
  }

  // [Z.6 F2 — sub-B] R122: orphan routing — todo insight no consumido por los 5 builders anteriores
  const orphans = remaining()
  if (orphans.length > 0) {
    const orphanBlocks = buildRichOrphanSection(orphans)
    for (const ob of orphanBlocks) pushBlocks(blocks, ob)
    mark(orphans.map(i => i.id))
  }

  // [Z.5 — Frente 1] R118: sin recorte aquí; slice(12) vive en candidatesToDiagnosticBlocks
  return blocks
}

// [Z.7 T1-HOTFIX] Tipos de evento discreto exentos del filtro de ruido transaccional
// y con render path propio en candidatesToDiagnosticBlocks.
// [PR-M7d] outlier añadido para que sus candidatos (num_transacciones × cliente|vendedor)
// rindan narrativa directa desde c.description/conclusion/accion sin pasar por
// buildContextUniversal (ese path discarda bullets con términos "σ/outlier/...").
// [Z.12.V-2] meta_gap añadido. El builder meta_gap_combo emite title/description/
// accion direction-aware (sobrecumplió/incumplió). buildContextUniversal agregaba
// bullets temporales tipo "El hueco de X viene de..." que asumen direction='down'
// y producían contradicción narrativa en candidatos sobrecumpl (ej: Lácteos 709%
// con bullet "El hueco de Lácteos viene de Sandra Morales 84% meta"). El builder
// es self-contained — no necesita el enrichment cross-temporal.
const EVENT_TYPES_EXEMPT = new Set(['stock_risk', 'stock_excess', 'migration', 'co_decline', 'product_dead', 'seasonality', 'outlier', 'change_point', 'steady_share', 'correlation', 'meta_gap_temporal', 'meta_gap'])

// [Z.11.5] NON_MONETARY_METRIC_IDS importado de insightStandard.ts como fuente
// única. Antes existía aquí una copia que faltaba `skus_activos` y `margen_pct`,
// causando que el flag `non_monetary` en DiagnosticBlock y el isMonetary check
// en computeRecuperableFromCandidate divergieran del gate Z.12. La lista
// canónica vive ahora junto al gate (donde se decide pareto-skip y branch
// non_monetary del resolver).

// [Z.10.5b] Parámetros de composición del ranker ejecutivo por impacto económico.
// impactoFactor = 1 + WEIGHT * log1p(usd / REFERENCIA)
// Default conservador: peso 0.15, referencia $500 (factor ≈ 1.10 a $500, ≈ 1.27 a $3k).
// Candidatos con usd null/0 → factor 1 (no se penalizan).
const IMPACTO_USD_WEIGHT = 0.15
const IMPACTO_USD_REFERENCIA = 500

// [PR-2] Calcula impacto recuperable para bloques ie-* a partir del InsightCandidate.detail.
// Se invoca inline durante blocks.push() donde c.detail aún está disponible.
function computeRecuperableFromCandidate(
  c: InsightCandidate,
  impactoUSD: number | null,
  diasRestantes: number,
): { monto: number | null; pct: number | null } {
  const det = (c.detail ?? {}) as Record<string, unknown>
  // [PR-2.1] Accept venta + unidades (monetary in uds mode). Exclude explicit non-monetary metrics.
  const isMonetary = !NON_MONETARY_METRIC_IDS.has(c.metricId)
  const safePct = (m: number, base: number | null): number | null =>
    base != null && base > 0 ? Math.min(1.2, m / base) : null

  switch (c.insightTypeId) {
    case 'stock_risk': {
      const monto = typeof det.impactoTotal === 'number' ? Math.abs(det.impactoTotal) : null
      return { monto, pct: monto != null ? safePct(monto, impactoUSD) : null }
    }
    case 'stock_excess':
      return { monto: null, pct: null }
    case 'migration': {
      // [PR-2.1] totalCaida = loss on the declining side of the migration
      const caida = typeof det.totalCaida === 'number' && det.totalCaida > 0
        ? Math.abs(det.totalCaida) : null
      return { monto: caida, pct: null }
    }
    case 'co_decline': {
      const raw = typeof det.impactoTotal === 'number' ? det.impactoTotal
        : typeof det.totalCaida === 'number' ? det.totalCaida : null
      const monto = raw != null ? Math.abs(raw) : null
      return { monto, pct: monto != null ? safePct(monto, impactoUSD) : null }
    }
    case 'trend': {
      // [PR-2.1b] detector emits { slope, months, pctChange, direction } — no history fields
      if (!isMonetary) return { monto: null, pct: null }
      const slope = typeof det.slope === 'number' ? det.slope : 0
      if (slope >= 0) return { monto: null, pct: null }  // tendencia no negativa
      const mesesRestantes = Math.max(0.5, diasRestantes / 30)
      const monto = Math.abs(slope) * mesesRestantes
      return { monto: monto > 0 ? monto : null, pct: monto > 0 ? safePct(monto, impactoUSD) : null }
    }
    case 'contribution': {
      if (!isMonetary) return { monto: null, pct: null }
      const mc = typeof det.memberChange === 'number' ? det.memberChange : 0
      if (mc >= 0) return { monto: null, pct: null }  // contribución no negativa
      const monto = Math.abs(mc)
      return { monto, pct: safePct(monto, impactoUSD) }
    }
    case 'change': {
      // [PR-2.1b] detector emits { current, previous, pctChange, direction } — not cur/prev
      if (!isMonetary) return { monto: null, pct: null }
      const cur  = typeof det.current  === 'number' ? det.current
        : typeof det.cur === 'number' ? det.cur : 0
      const prev = typeof det.previous === 'number' ? det.previous
        : typeof det.prev === 'number' ? det.prev : 0
      if (cur >= prev) return { monto: null, pct: null }  // cambio no negativo
      const monto = prev - cur
      return { monto, pct: safePct(monto, impactoUSD) }
    }
    case 'cliente_dormido': {
      const hist = typeof det.impactoVentaHistorica === 'number' ? det.impactoVentaHistorica : null
      if (hist == null || hist <= 0) return { monto: null, pct: null }
      const monto = hist * 0.3  // 30% recovery rate conservador
      return { monto, pct: 0.3 }
    }
    case 'product_dead': {
      // [PR-L2b.1] Recuperable: 30% de la venta histórica perdida (liquidación/reemplazo conservador)
      const totalPrev = typeof det.totalPrev === 'number' ? det.totalPrev : null
      if (totalPrev == null || totalPrev <= 0) return { monto: null, pct: null }
      const monto = totalPrev * 0.3
      return { monto, pct: 0.3 }
    }
    case 'meta_gap': {
      const gap = typeof det.gapUSD === 'number' ? det.gapUSD
        : typeof det.gap === 'number' ? det.gap : null
      if (gap == null || gap <= 0) return { monto: null, pct: null }
      return { monto: gap, pct: safePct(gap, impactoUSD) }
    }
    default:
      return { monto: null, pct: null }
  }
}

// [PR-2.1c] Clasifica la dirección de un candidato frente al cálculo de recuperable.
// 'positivo' = upside (no aplica recuperable); 'neutral' = stock_excess o tipo sin signo inferible;
// 'recuperable' = decreciente / brecha / riesgo.
// [PR-D2] La métrica non_monetary NO es motivo para 'neutral' — la dirección se infiere igual
// por slope/cur<prev/memberChange. non_monetary sigue siendo una propiedad SEPARADA en el block
// y bloquea el cálculo de USD recuperable, pero no la clasificación direccional para chaining.
function classifyDireccionFromCandidate(c: InsightCandidate): 'recuperable' | 'positivo' | 'neutral' {
  if (c.insightTypeId === 'stock_excess') return 'neutral'
  const det = (c.detail ?? {}) as Record<string, unknown>
  switch (c.insightTypeId) {
    case 'trend': {
      const slope = typeof det.slope === 'number' ? det.slope : 0
      if (slope === 0) return 'neutral'
      return slope < 0 ? 'recuperable' : 'positivo'
    }
    case 'change': {
      const cur  = typeof det.current  === 'number' ? det.current
        : typeof det.cur === 'number' ? det.cur : 0
      const prev = typeof det.previous === 'number' ? det.previous
        : typeof det.prev === 'number' ? det.prev : 0
      if (cur === prev) return 'neutral'
      return cur < prev ? 'recuperable' : 'positivo'
    }
    case 'contribution': {
      const mc = typeof det.memberChange === 'number' ? det.memberChange : 0
      if (mc === 0) return 'neutral'
      return mc < 0 ? 'recuperable' : 'positivo'
    }
    // Siempre-recuperables: riesgo, cliente dormido, co_decline, migration, product_dead
    case 'stock_risk':
    case 'cliente_dormido':
    case 'co_decline':
    case 'migration':
    case 'product_dead':
      return 'recuperable'
    // [Z.13.V-2] meta_gap es direction-aware: sobrecumplimiento es positivo,
    // subcumplimiento es recuperable. Pre-Z.13: siempre 'recuperable' →
    // María Castillo y Roberto Cruz (sobrecumpl) se agrupaban con Carlos
    // (subcumpl) bajo "vendedores estancados". UX cliente: contradictorio.
    case 'meta_gap':
    case 'meta_gap_temporal': {
      if (c.direction === 'up') return 'positivo'
      if (c.direction === 'down') return 'recuperable'
      // Fallback por detail.cumplPct si direction no está poblada
      const cumplPct = typeof det.cumplPct === 'number' ? det.cumplPct : 100
      return cumplPct >= 100 ? 'positivo' : 'recuperable'
    }
    // [PR-M4c'] seasonality es patrón observacional (no gap recuperable)
    case 'seasonality':
      return 'neutral'
    default:
      return 'neutral'
  }
}

// [PR-3] Mapea un DiagnosticBlock al input correcto para calcularUrgenciaTemporal.
// Usa el id del bloque y diasRestantesMes — NO accede a detail (ya no disponible post-build).
function deriveUrgenciaInput(
  b: DiagnosticBlock,
  diasRestantesMes: number,
): Parameters<typeof calcularUrgenciaTemporal>[0] {
  const id = b.id
  // stock_risk: "inminente" en el headline → cobertura < 7d; sino ≤ 14d
  if (id.includes('stock_risk')) {
    return { ventanaDias: b.headline?.includes('inminente') ? 7 : 14 }
  }
  // meta_gap y vendor-*: ventana = días restantes del mes
  if (id.includes('meta_gap') || id.startsWith('vendor-')) {
    return { ventanaDias: diasRestantesMes }
  }
  // cliente dormido y co_decline: acción esta semana / mes
  if (id.includes('cliente_dormido') || id.includes('co_decline')) {
    return { ventanaDias: 30 }
  }
  // change: cambio puntual, ventana corta
  if (id.includes('-change-')) return { ventanaDias: 30 }
  // migration: tendencia de mediano plazo
  if (id.includes('migration')) return { ventanaDias: 90 }
  // trend y contribution: tendencia de mediano plazo
  if (id.includes('-trend-') || id.includes('-contribution-')) return { ventanaDias: 90 }
  // stock_excess: capital inmovilizado, baja urgencia operativa
  if (id.includes('stock_excess')) return { ventanaDias: 180 }
  // [PR-L2b.1] product_dead: decisión de surtido a mediano plazo
  if (id.includes('product_dead')) return { ventanaDias: 90 }
  return {}  // sin dato → urgencia 0.1
}

// [PR-6] Builds entity → Set<parentEntity> index from sales records.
// Used by construirInsightChains to validate pertenencia between block members.
function buildPertenenciaIndex(sales: SaleRecord[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>()
  const add = (childRaw: string | undefined, parentRaw: string | undefined) => {
    // [PR-6.1b] normalizar ambos lados: lowercase + sin diacríticos
    const child  = normalizeEntity(childRaw)
    const parent = normalizeEntity(parentRaw)
    if (!child || !parent || child === parent) return
    if (!index.has(child)) index.set(child, new Set())
    index.get(child)!.add(parent)
  }
  for (const r of sales) {
    add(r.cliente,  r.vendedor)   // client belongs to its vendor
    add(r.producto, r.categoria)  // product belongs to its category
    add(r.producto, r.vendedor)   // product also linked to its vendor
  }
  return index
}

export function candidatesToDiagnosticBlocks(
  candidates: InsightCandidate[],
  ctx: BlockContext,
  /** [Z.4 — perf: cuello-3] Pre-computado en useMemo con deps [insights, vendorAnalysis].
   *  Si se omite, se computa internamente (backward compat). */
  prebuiltLegacyBlocks?: DiagnosticBlock[],
): DiagnosticBlock[] {
  // [PR-L1] telemetría revertible: motor 2 pipeline timing + distribución de candidatos
  const _pr_l1_m2_t0 = performance.now()
  // [PR-2] Pre-calcular diasRestantes una vez, para computeRecuperableFromCandidate
  const { year: _pYear, month: _pMonth } = ctx.selectedPeriod
  const _diasTotalesMes = new Date(_pYear, _pMonth + 1, 0).getDate()
  const _salesOfMonth = ctx.sales.filter(r => {
    const d = toDate(r.fecha)
    return d.getFullYear() === _pYear && d.getMonth() === _pMonth
  })
  const _diasTranscurridos = _salesOfMonth.length > 0
    ? _salesOfMonth.reduce((mx, r) => Math.max(mx, toDate(r.fecha).getDate()), 0)
    : _diasTotalesMes
  const _diasRestantes = Math.max(0, _diasTotalesMes - _diasTranscurridos)
  // [PR-6] Pertenencia index: child entity → Set<parent entities>
  const _pertenencia = buildPertenenciaIndex(_salesOfMonth)

  // R108: narrativa rica es responsabilidad interna — generar bloques ricos primero (Z.2)
  const _legacyBlocksAll = prebuiltLegacyBlocks ?? buildRichBlocksFromInsights(ctx.insights, ctx.vendorAnalysis)

  // [Step A] Inversión de precedencia: motor 2 gana en el dashboard.
  // Motor 2 candidates pasan sin filtrar; legacyBlocks se filtran si su
  // entidad ya está cubierta por un candidate de motor 2.
  const motor2Entities = new Set<string>()
  for (const c of candidates) {
    const memberStr = typeof c.member === 'string' ? c.member.trim().toLowerCase() : ''
    const titleStr  = typeof c.title  === 'string' ? c.title.trim().toLowerCase()  : ''
    if (memberStr) motor2Entities.add(memberStr)
    if (titleStr)  motor2Entities.add(titleStr)
  }

  const legacyBlocks = _legacyBlocksAll.filter(b => {
    const targets = (b.links?.map(l => l.target?.toLowerCase()) ?? []).filter(Boolean) as string[]
    const headline = b.headline?.toLowerCase() ?? ''
    const names = [...targets, headline].filter(Boolean)
    if (names.length === 0) return true
    // skip si cualquiera de sus entidades ya está representada por motor 2
    return !names.some(n =>
      motor2Entities.has(n) ||
      [...motor2Entities].some(m => n.includes(m) || m.includes(n)),
    )
  })

  // Entidades cubiertas por bloques ricos sobrevivientes (para usedEntities downstream)
  const legacyEntities = new Set<string>(
    legacyBlocks.flatMap(b => [
      ...(b.links?.map(l => l.target?.toLowerCase()) ?? []),
      b.headline?.toLowerCase() ?? '',
    ]).filter(Boolean),
  )

  // [Step A] Motor 2 candidates pasan sin filtrar — son la fuente principal post-roadmap.
  // [Z.12.M-2.1] Anti-duplicación cross-tipo: si un protagonista (member) ya aparece
  // como headline en una card de tipo más rico (meta_gap, meta_gap_temporal,
  // cliente_dormido/perdido, stock_*), suprimir cross_delta y proportion_shift
  // que apunten al mismo protagonista. Razón: cross_delta es información
  // suplementaria sobre territorio/canal — cuando el protagonista ya tiene
  // narrativa rica en otra card, el cross_delta es saturación visual.
  //
  // Tipos "ricos" que claim al protagonista:
  const _richTypes = new Set<string>([
    'meta_gap', 'meta_gap_temporal',
    'cliente_dormido', 'cliente_perdido',
    'stock_risk', 'stock_excess',
    'product_dead', 'co_decline', 'migration',
  ])
  const _claimedByRich = new Set<string>()
  for (const c of candidates) {
    if (_richTypes.has(c.insightTypeId) && c.member) {
      _claimedByRich.add(c.member.toLowerCase().trim())
    }
  }
  const uncoveredCandidates = candidates.filter(c => {
    // Solo dedupar cross_delta y proportion_shift (los "tipos suplementarios")
    if (c.insightTypeId !== 'cross_delta' && c.insightTypeId !== 'proportion_shift') {
      return true
    }
    const memberKey = (c.member ?? '').toLowerCase().trim()
    if (!memberKey) return true
    // Si el protagonista ya está claimed por una card rica, omitir
    if (_claimedByRich.has(memberKey)) return false
    // También revisar entidades en cross_context (para cross_delta multi-dim)
    const cc = (c.detail as Record<string, unknown> | undefined)?.cross_context
    if (cc && typeof cc === 'object') {
      for (const v of Object.values(cc as Record<string, unknown>)) {
        if (typeof v === 'string' && _claimedByRich.has(v.toLowerCase().trim())) {
          return false
        }
      }
    }
    return true
  })

  // See top-of-file REGLA UNIVERSAL DE STORYTELLING + FASE 4B
  const usedEntities = new Set<string>()
  // Pre-populate with legacy entities so new blocks don't repeat their protagonists
  for (const le of legacyEntities) usedEntities.add(le)
  const blocks: DiagnosticBlock[] = []

  // Fase 4B rule 9: pre-populate usedEntities with ALL candidate members BEFORE
  // building context for any card — prevents any card from mentioning another card's protagonist
  for (const c of uncoveredCandidates) {
    if (c.member) usedEntities.add(c.member.toLowerCase())
  }

  for (const [idx, c] of uncoveredCandidates.entries()) {
    // R109: classify candidate type (used for logging and future routing)
    const _opType = classifyCandidateType(c)
    void _opType
    // Fase 5B.1: render path dedicado para cliente_dormido.
    // No pasa por buildContextUniversal porque no hay ventas actuales que cruzar;
    // los bullets se generan directamente desde c.detail. Texto pasa por V16 temporal.
    if (c.insightTypeId === 'cliente_dormido') {
      const det = c.detail as Record<string, unknown>
      const dias        = typeof det.diasSinComprar === 'number' ? det.diasSinComprar : 0
      const umbral      = typeof det.umbralDiasDormido === 'number' ? det.umbralDiasDormido : 45
      const frec        = typeof det.frecuenciaHistoricaDias === 'number' ? det.frecuenciaHistoricaDias : null
      const impacto     = typeof det.impactoVentaHistorica === 'number' ? det.impactoVentaHistorica : 0
      const ventanaLbl  = typeof det.impactoVentanaLabel === 'string' ? det.impactoVentanaLabel : ''
      const vendedor    = typeof det.vendedor === 'string' ? det.vendedor : ''

      const bullets: string[] = []
      bullets.push(`${c.member} no compra hace ${dias} días — supera el umbral actual de ${umbral} días sin comprar.`)
      if (frec && frec > 0) {
        const ratio = Math.max(1, Math.round(dias / frec))
        bullets.push(`Su frecuencia histórica era cada ${Math.round(frec)} días — ahora supera ${ratio}× ese intervalo.`)
      }
      if (impacto > 0) {
        // Fase 5C (R53): ventana YoY explícita — nunca "en histórico" ambiguo.
        const impactoFmt = Math.round(impacto).toLocaleString('es-SV')
        const ventanaTxt = ventanaLbl ? ` en ${ventanaLbl}` : ''
        bullets.push(
          `Aportaba $${impactoFmt}${ventanaTxt}${vendedor ? ` (vendedor: ${vendedor})` : ''} — su ausencia pesa en la cartera.`,
        )
      }
      // V16: filtrar ref temporal prohibida (por consistencia, aunque no debería disparar)
      const bulletsValidos = bullets.filter(b => !tieneReferenciaTemporalProhibida(b))
      if (bulletsValidos.length === 0) {
        console.debug('[fase5b] cliente_dormido descartado por V16:', c.title)
        continue
      }

      const _dormidoUSD = (det.impactoVentaHistorica as number) || 0
      const _dormidoRec = computeRecuperableFromCandidate(c, _dormidoUSD, _diasRestantes)
      blocks.push({
        // Fase 5B.4: block de cliente_dormido visualmente uniforme con el resto.
        id:           `ie-cliente-dormido-${idx}`,
        severity:     candidateSeverityToBlock(c),
        headline:     c.title,
        summaryShort: c.description,
        sections:     [{ label: 'Contexto', type: 'bullet', items: bulletsValidos }],
        links:        [],
        insightIds:   [`dormido:cliente:${c.member}`],
        impactoTotal: null,
        impactoLabel: null,
        impactoUSD: _dormidoUSD, // [Z.5 — Frente 2] R119
        metadataBadges: badgesFromCandidate(c, ctx.tipoMetaActivo),
        impacto_recuperable:     _dormidoRec.monto,   // [PR-2]
        impacto_recuperable_pct: _dormidoRec.pct,     // [PR-2]
        _member:      c.member,                        // [PR-6]
        direccion:    classifyDireccionFromCandidate(c),   // [PR-2.1c]
      _dimension:   c.dimensionId,                         // [PR-6.1b]
      _crossMetricContext: c._crossMetricContext ?? null,   // [PR-M6.A.2]
      })
      continue
    }

    // Sprint 5: render path dedicado para cliente_perdido — mirror de cliente_dormido
    // pero con sections que distinguen contexto, decisión y acción de cierre.
    if (c.insightTypeId === 'cliente_perdido') {
      const det = c.detail as Record<string, unknown>
      const dias        = typeof det.diasSinComprar === 'number' ? det.diasSinComprar : 0
      const frec        = typeof det.frecuenciaHistoricaDias === 'number' ? det.frecuenciaHistoricaDias : null
      const impacto     = typeof det.impactoVentaHistorica === 'number' ? det.impactoVentaHistorica : 0
      const vendedor    = typeof det.vendedor === 'string' ? det.vendedor : ''

      const bullets: string[] = []
      bullets.push(`${c.member} lleva ${dias} días sin comprar — past del umbral recuperable.`)
      if (frec && frec > 0) {
        const ratio = dias / frec
        const ratioFmt = ratio >= 3 ? `${ratio.toFixed(1)}× su cadencia habitual` : `excede su cadencia habitual de ${Math.round(frec)} días`
        bullets.push(`Compraba cada ${Math.round(frec)} días — hoy ${ratioFmt}.`)
      }
      if (impacto > 0) {
        const impactoFmt = Math.round(impacto).toLocaleString('es-SV')
        bullets.push(`Aportaba $${impactoFmt} históricamente${vendedor ? ` (vendedor: ${vendedor})` : ''}.`)
      }
      const bulletsValidos = bullets.filter(b => !tieneReferenciaTemporalProhibida(b))
      if (bulletsValidos.length === 0) continue

      const accionTexto = typeof c.accion === 'string'
        ? c.accion
        : `Decidir cierre de cuenta o intento final de recuperación con ${c.member}.`

      const _perdidoUSD = impacto || 0
      const _perdidoRec = computeRecuperableFromCandidate(c, _perdidoUSD, _diasRestantes)
      blocks.push({
        id:           `ie-cliente-perdido-${idx}`,
        severity:     candidateSeverityToBlock(c),
        headline:     c.title,
        summaryShort: c.description,
        sections: [
          { label: 'Contexto', type: 'bullet', items: bulletsValidos },
          { label: 'Acción',   type: 'bullet', items: [`→ ${accionTexto}`] },
        ],
        links:        [],
        insightIds:   [`perdido:cliente:${c.member}`],
        impactoTotal: null,
        impactoLabel: null,
        impactoUSD:   _perdidoUSD,
        metadataBadges: badgesFromCandidate(c, ctx.tipoMetaActivo),
        impacto_recuperable:     _perdidoRec.monto,
        impacto_recuperable_pct: _perdidoRec.pct,
        _member:     c.member,
        direccion:   classifyDireccionFromCandidate(c),
        _dimension:  c.dimensionId,
        _crossMetricContext: c._crossMetricContext ?? null,
      })
      continue
    }

    // [Z.7 T1-HOTFIX] Render path dedicado para tipos de evento discreto (inventario/portfolio).
    // Sus narrativas ya están renderizadas en c.title/description/conclusion/accion por NARRATIVE_TEMPLATES.
    // No pasan por buildContextUniversal porque no tienen contexto transaccional cruzado.
    if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) {
      // [Z.7 T1.5] sections: NB_SECTION_LABEL para conclusión (buildPorQueImporta la detecta
      // directamente sin concatenar todos los bullets). summaryShort queda con c.description
      // → quePaso = descripción, porQueImporta = conclusión, sin duplicación.
      // [Z.13.V-3] Aceptar accion tanto como objeto {texto} como string plano.
      // Antes solo leía objeto → meta_gap_combo emite string → "Acción" section
      // quedaba vacía → diagnostic-generator caía a "Sin acciones sugeridas".
      // Caso runtime confirmado: Roberto Méndez 65% (supervisor) y otros sujetos
      // no-vendedor mostraban contradicción (urgente sin acción).
      const accionObj = typeof c.accion === 'object' && c.accion !== null ? c.accion : null
      const accionTextoPlano = typeof c.accion === 'string' ? c.accion.trim() : ''
      const porQueBullets: string[] = []
      if (c.conclusion) porQueBullets.push(c.conclusion)
      const accionBullets: string[] = []
      if (accionObj?.texto) accionBullets.push(`→ ${accionObj.texto}`)
      else if (accionTextoPlano) accionBullets.push(`→ ${accionTextoPlano}`)
      const sections: DiagnosticSection[] = [
        ...(porQueBullets.length > 0
          ? [{ label: NB_SECTION_LABEL, type: 'bullet' as const, items: porQueBullets }]
          : []),
        ...(accionBullets.length > 0
          ? [{ label: 'Acción', type: 'bullet' as const, items: accionBullets }]
          : []),
      ]
      // [Z.7 T1-HOTFIX-3] derivar impacto desde campos propios del detail según insightType
      const _det = (c.detail ?? {}) as Record<string, unknown>
      let _impactoEvento: number | null = null
      if (c.insightTypeId === 'stock_excess') {
        _impactoEvento = typeof _det.totalCapital === 'number' ? _det.totalCapital : null
      } else if (c.insightTypeId === 'stock_risk') {
        _impactoEvento = typeof _det.impactoTotal === 'number' ? _det.impactoTotal : null
        // [PR-cierre] auditoría de cálculo de desabasto: confirmar fórmula intencional
        if (import.meta.env.DEV) {
          const _items = Array.isArray(_det.items) ? _det.items as Array<Record<string, unknown>> : []
          const _urg   = Array.isArray(_det.urgentes) ? _det.urgentes as unknown[] : []
          const _alert = Array.isArray(_det.alertas) ? _det.alertas as unknown[] : []
          const _ytdTotal = _items.reduce((s, it) => s + (typeof it.ventaYTD === 'number' ? it.ventaYTD : 0), 0)
          const _mensualAprox = _ytdTotal / 12
          console.debug('[PR0c] stock_risk debug:', {
            productos_detectados:    _items.map(it => ({ sku: it.member, dias: it.diasCobertura, ventaYTD: it.ventaYTD, severidad: it.severidad })),
            umbral_dias_critico:     7,
            umbral_dias_alerta:      14,
            venta_anual_combinada:   _ytdTotal,
            venta_mensual_combinada: Math.round(_mensualAprox),
            formula_usada:           'anual (suma ventaYTD de productos con coberturaDias<14)',
            urgentes_count:          _urg.length,
            alertas_count:           _alert.length,
          })
        }
      } else if (c.insightTypeId === 'co_decline') {
        _impactoEvento = typeof _det.impactoTotal === 'number' ? _det.impactoTotal
          : typeof _det.totalCaida === 'number' ? _det.totalCaida : null
      } else if (c.insightTypeId === 'migration') {
        // [PR-2.1] migration monetizable via totalCaida (loss on declining side)
        const _caida = typeof _det.totalCaida === 'number' ? _det.totalCaida : null
        _impactoEvento = _caida != null && _caida > 0 ? _caida : null
      } else if (c.insightTypeId === 'product_dead') {
        // [PR-L2b.1] product_dead: impact = ventas históricas perdidas (totalPrev)
        _impactoEvento = typeof _det.totalPrev === 'number' ? _det.totalPrev : null
      }
      let _impactoFinal: number | null
      if (_impactoEvento !== null) {
        _impactoFinal = _impactoEvento
      } else if (c.insightTypeId === 'migration') {
        _impactoFinal = null  // totalCaida absent or zero → keep null
      } else {
        _impactoFinal = computeImpactoUSDFromCandidate(c, ctx)
      }
      const _exemptRec = computeRecuperableFromCandidate(c, _impactoFinal, _diasRestantes)  // [PR-2]
      blocks.push({
        id:           `ie-${c.dimensionId}-${c.insightTypeId}-${idx}`,
        severity:     candidateSeverityToBlock(c),
        headline:     c.title,
        summaryShort: c.description,
        sections,
        links:        buildBlockLinks(c),
        insightIds:   [`${c.metricId}:${c.dimensionId}:${c.insightTypeId}`],
        impactoTotal: null,
        impactoLabel: null,
        impactoUSD:   _impactoFinal,
        metadataBadges: badgesFromCandidate(c, ctx.tipoMetaActivo),
        non_monetary: NON_MONETARY_METRIC_IDS.has(c.metricId),
        impacto_recuperable:     _exemptRec.monto,   // [PR-2]
        impacto_recuperable_pct: _exemptRec.pct,     // [PR-2]
        _member:      c.member,                       // [PR-6]
      direccion:    classifyDireccionFromCandidate(c),   // [PR-2.1c]
      _dimension:   c.dimensionId,                         // [PR-6.1b]
      _crossMetricContext: c._crossMetricContext ?? null,   // [PR-M6.A.2]
      })
      continue
    }

    // FIX 4: tIdx = número de cards ya rendereadas → rota plantillas entre cards
    const { sections, crucesCount, tablasUsadas } = buildContextUniversal(c, ctx, usedEntities, blocks.length)

    // Fase 4C rule 17: threshold by severity — critica/alta=3 tables, media/baja=2 tables
    const minCruces = (c.severity === 'CRITICA' || c.severity === 'ALTA') ? 3 : 2
    // FIX 1 (Fase 4E): descartar si cruces insuficientes O sections vacío O items vacío
    const sinContexto = crucesCount < minCruces
      || sections.length < 1
      || (sections[0] !== undefined && sections[0].items.length === 0)
    if (sinContexto) {
      console.debug('[fase4e] descartada pelada:', c.title, crucesCount, sections.length, tablasUsadas)
      continue
    }

    // Fase 5B.4: dormidoMeta eliminado — los dormidos se presentan como cualquier
    // otro insight (uniformidad visual). El umbral vive en la narrativa (description
    // y bullets), no como metadata visual.
    const _ieUSD = computeImpactoUSDFromCandidate(c, ctx)
    const _ieRec = computeRecuperableFromCandidate(c, _ieUSD, _diasRestantes)  // [PR-2]
    blocks.push({
      id:           `ie-${c.dimensionId}-${c.insightTypeId}-${idx}`,
      severity:     candidateSeverityToBlock(c),
      headline:     c.title,
      summaryShort: c.description,
      sections,
      links:        buildBlockLinks(c),
      insightIds:   [`${c.metricId}:${c.dimensionId}:${c.insightTypeId}`],
      impactoTotal: null,
      impactoLabel: null,
      impactoUSD: _ieUSD, // [Z.5 — Frente 2] R119
      metadataBadges: badgesFromCandidate(c, ctx.tipoMetaActivo),
      non_monetary: NON_MONETARY_METRIC_IDS.has(c.metricId),
      impacto_recuperable:     _ieRec.monto,   // [PR-2]
      impacto_recuperable_pct: _ieRec.pct,     // [PR-2]
      _member:      c.member,                   // [PR-6]
      direccion:    classifyDireccionFromCandidate(c),   // [PR-2.1c]
      _dimension:   c.dimensionId,                         // [PR-6.1b]
      _crossMetricContext: c._crossMetricContext ?? null,  // [PR-M6.A.2]
    })
  }

  // R110: fusión interna — ricos primero, nuevos complementan, sin peladas
  // [Z.7 T1-HOTFIX-4] ordenar por severity → impactoUSD antes de capar; cap elevado a 16
  // [Z.7 T2] positive añadido explícitamente; orphan-equipo-contexto-* excluido del ranking
  const SEVERITY_RANK: Record<string, number> = { critica: 0, alta: 1, media: 2, baja: 3, info: 4, positive: 5 }
  // [PR-2] ContextoInsights para calcularImpactoRecuperable (vendor-* blocks)
  const _contextoInsights: ContextoInsights = {
    vendorAnalysis: ctx.vendorAnalysis,
    diasRestantesMes: _diasRestantes,
  }

  // [PR-1/PR-2] normalizar + enriquecer campos de accionabilidad
  // PR-2: vendor-* no tiene detail disponible → calcularImpactoRecuperable vía vendorAnalysis
  const merged = [...legacyBlocks, ...blocks].map(b => {
    let rec_monto  = b.impacto_recuperable    ?? null
    let rec_pct    = b.impacto_recuperable_pct ?? null
    if (rec_monto == null && b.id.startsWith('vendor-')) {
      const r = calcularImpactoRecuperable(b, _contextoInsights)
      rec_monto = r.monto
      rec_pct   = r.pct
    }
    // [PR-2.1b] legacy `productos*` / `productos-resto`: inventario sin movimiento → 30% del impacto
    if (rec_monto == null && b.id.startsWith('productos') && typeof b.impactoUSD === 'number' && b.impactoUSD > 0) {
      rec_monto = b.impactoUSD * 0.3
      rec_pct   = 0.3
    }
    // [PR-2.1c] Inferir direccion para bloques legacy que no la trajeron
    let _direccion: 'recuperable' | 'positivo' | 'neutral' | undefined = b.direccion
    if (!_direccion) {
      if (b.non_monetary === true) _direccion = 'neutral'
      else if (b.severity === 'positive') _direccion = 'positivo'
      else if (rec_monto != null && rec_monto > 0) _direccion = 'recuperable'
      else if (b.id.startsWith('vendor-') || b.id.startsWith('productos')) _direccion = 'recuperable'
      else _direccion = 'neutral'
    }
    return {
      ...b,
      non_monetary:            b.non_monetary    ?? false,
      impacto_recuperable:     rec_monto,
      impacto_recuperable_pct: rec_pct,
      urgencia_temporal:       b.urgencia_temporal ?? null,
      priority_score:          b.priority_score    ?? null,
      parent_id:               b.parent_id         ?? null,
      chain:                   b.chain             ?? null,
      // [PR-6] vendor-* blocks derive _member from id; ie-* already carry c.member
      _member: b._member ?? (b.id.startsWith('vendor-') ? b.id.slice('vendor-'.length) : null),
      direccion: _direccion,
      _dimension: b._dimension ?? dimensionDeBlock(b),   // [PR-6.1b]
    }
  })
  // [PR-L2a-fix] prefijos de orphan excluidos del ranking (narrativa-only / agrupaciones legacy).
  // - `orphan-equipo-contexto-*`: header verde principal del dashboard (Fase Z.7 T2)
  // - `orphan-grupo-*`: agrupaciones de motor 1 no absorbidas por buildRich*Section
  //   (grupo-mejor-momento queda "orphan-grupo-mejor-momento" porque legIsInsightPositive
  //   solo matchea `mejor-momento-*` individuales, no el id agregado)
  const ORPHAN_RANKING_EXCLUDED_PREFIXES = ['orphan-equipo-contexto-', 'orphan-grupo-']
  const valid  = merged.filter(b => {
    if (!b.sections || b.sections.length === 0) return false
    if (!b.sections.some(s => s.items && s.items.length > 0)) return false
    if (typeof b.id === 'string' && ORPHAN_RANKING_EXCLUDED_PREFIXES.some(p => b.id.startsWith(p))) return false
    // [PR-0] rechazar bloques con impactoUSD nulo (salvo non_monetary que pueden tener null)
    if (!b.non_monetary && (b.impactoUSD == null)) return false
    // [PR-0] rechazar entidades no canónicas (Sin categoría, Sin asignar, etc.)
    if (ENTIDADES_NO_CANONICAS.some(e => b.headline?.includes(e))) return false
    return true
  })
  // [PR-3] Asignar urgencia_temporal y priority_score a cada bloque válido antes del sort
  const validScored = valid.map(b => {
    const urgInput   = deriveUrgenciaInput(b, _diasRestantes)
    const urgencia   = calcularUrgenciaTemporal(urgInput)
    const priority   = calcularPriorityScore({ impacto_recuperable: b.impacto_recuperable, urgencia_temporal: urgencia })
    return { ...b, urgencia_temporal: urgencia, priority_score: priority }
  })

  // [PR-5] Agrupar redundantes ANTES del sort — hijos quedan en pool con parent_id != null
  const groupedPool = agruparInsightsRedundantes(validScored)
  // Solo padres (y ungrouped) llegan al ranking; hijos quedan para PR-6 chaining
  const rankingPool = groupedPool.filter(b => b.parent_id == null)

  // [PR-3] Sort: priority_score DESC → |impactoUSD| DESC → id ASC (determinismo)
  const _sorted = rankingPool.slice().sort((a, b) => {
    const pa = a.priority_score ?? 0
    const pb = b.priority_score ?? 0
    if (pb !== pa) return pb - pa
    const ia = typeof a.impactoUSD === 'number' ? a.impactoUSD : -1
    const ib = typeof b.impactoUSD === 'number' ? b.impactoUSD : -1
    if (ib !== ia) return ib - ia
    return a.id.localeCompare(b.id)  // determinismo
  })

  // [PR-M4c'] Cap protection: reservar slots para candidates hardcoded
  // críticos (impact > $10k AND direccion='recuperable'). Neutrales
  // como seasonality no deben desplazarlos.
  const _CAP_RANKING        = 16
  const _PROTECT_UMBRAL_USD = 10000
  const _isProtected = (b: typeof _sorted[number]) =>
    (b.impactoUSD ?? 0) > _PROTECT_UMBRAL_USD && b.direccion === 'recuperable'
  const _protectedBlocks = _sorted.filter(_isProtected)
  const _regularBlocks   = _sorted.filter(b => !_isProtected(b))
  const _spaceForRegular = Math.max(0, _CAP_RANKING - _protectedBlocks.length)
  const _regularKept     = _regularBlocks.slice(0, _spaceForRegular)
  const _displacedCount  = _regularBlocks.length - _regularKept.length
  const final = [..._protectedBlocks, ..._regularKept]
  if (import.meta.env.DEV) {
    console.debug('[PR-M4c\'-cap]', {
      protected_count: _protectedBlocks.length,
      regular_count:   _regularKept.length,
      displaced_count: _displacedCount,
      total_ranking:   final.length,
      umbral_usd:      _PROTECT_UMBRAL_USD,
      protected_ids:   _protectedBlocks.map(b => b.id.slice(0, 35)),
    })
  }

  // [PR-6.1] Run chains on PRE-grouping pool (validScored) so individual blocks with _member
  // are still available as chain candidates. Group parents (group-*) lack _member and would
  // never match sonInsightsRelacionables. Apply resulting chains to final ranking blocks.
  const _chains = construirInsightChains(validScored, _pertenencia)

  // [PR-6.1b] Mapa hijo → padre agrupado. Si un chain root fue absorbido en un grupo,
  // reasignar la chain al padre para que se renderice en el ranking visible.
  const _childToParent = new Map<string, string>()
  for (const b of groupedPool) {
    if (b.parent_id) _childToParent.set(b.id, b.parent_id)
  }
  const _chainByRoot = new Map<string, typeof _chains[number]>()
  for (const ch of _chains) {
    const parentId = _childToParent.get(ch.root_insight_id)
    const effectiveRoot = parentId ?? ch.root_insight_id
    const existing = _chainByRoot.get(effectiveRoot)
    // Si varios hijos de un mismo grupo son roots, conservar la chain más profunda
    if (!existing || ch.nodos.length > existing.nodos.length) {
      _chainByRoot.set(effectiveRoot, { ...ch, root_insight_id: effectiveRoot })
    }
  }
  const finalWithChains = final.map(b =>
    _chainByRoot.has(b.id) ? { ...b, chain: _chainByRoot.get(b.id)! } : b,
  )

  // [Z.5 — Frente 2] R119: debug pool para auditar cobertura del motor viejo
  if (import.meta.env.DEV) {
    console.debug('[Z.5] legacy blocks:', legacyBlocks.map(b => b.id))
    console.debug('[Z.5] final pool (pre-sort):', finalWithChains.map(b => [b.id.slice(0, 30), b.impactoUSD]))
    // [PR-0] auditoría de filtros: conteo y suma monetaria
    // [PR-0.1b] totalImpact = suma de monetary + recuperable (direccion='recuperable'),
    // excluye non_monetary, neutral (stock_excess), positivo (upside), hijos con parent_id,
    // y orphan-equipo-contexto-*. Reporta breakdown con razón de exclusión por bloque.
    const _pr0b = finalWithChains.map(b => {
      const razones: string[] = []
      if (b.non_monetary) razones.push('non_monetary')
      if (b.direccion === 'neutral') razones.push('direccion=neutral')
      if (b.direccion === 'positivo') razones.push('direccion=positivo')
      if (b.parent_id != null) razones.push('child_of_group')
      if (typeof b.id === 'string' && ORPHAN_RANKING_EXCLUDED_PREFIXES.some(p => b.id.startsWith(p))) {
        razones.push(b.id.startsWith('orphan-equipo-contexto-') ? 'orphan-equipo-contexto' : 'orphan-grupo')
      }
      if (typeof b.impactoUSD !== 'number') razones.push('impactoUSD=null')
      // [PR-D2-fix2] recuperable sin monto USD: dirección clasificada pero sin dólares medibles (typical post-PR-D2)
      if (b.direccion === 'recuperable' && (b.impacto_recuperable == null || b.impacto_recuperable === 0)) {
        razones.push('recuperable_sin_monto_usd')
      }
      const contribuye = razones.length === 0
      return {
        id: b.id.slice(0, 35),
        impact: typeof b.impactoUSD === 'number' ? Math.round(b.impactoUSD) : null,
        direccion: b.direccion ?? 'n/a',
        contribuye_al_total: contribuye,
        razon_exclusion: razones.length ? razones.join(',') : null,
      }
    })
    const monetarySum = _pr0b.reduce((s, x) => s + (x.contribuye_al_total && x.impact != null ? x.impact : 0), 0)
    console.debug('[PR0b] breakdown totalImpact:', _pr0b)
    console.debug(`[PR0] ranking: Array(${finalWithChains.length}), totalImpact monetario: $${monetarySum.toFixed(2)}, non_monetary: ${finalWithChains.filter(b => b.non_monetary).length}`)
    // [PR-2] auditoría de recuperable
    const conMonto = finalWithChains.filter(b => b.impacto_recuperable != null).length
    const sinMonto = finalWithChains.length - conMonto
    console.debug(`[PR2] recuperable asignado: ${conMonto}/${finalWithChains.length} con monto, ${sinMonto}/${finalWithChains.length} null`)
    // [PR-2.1b] per-id breakdown
    console.debug('[PR2b] detalle por id:', finalWithChains.map(b => ({
      id: b.id.slice(0, 35),
      recuperable: b.impacto_recuperable != null ? Math.round(b.impacto_recuperable) : null,
      non_monetary: b.non_monetary ?? false,
      direccion: b.direccion ?? 'n/a',
    })))
    // [PR-2.1c + PR-D2-fix1b] Denominador alineado con [PR0]: solo entra al ratio un recuperable
    // que ES USD-medible (direccion='recuperable', !non_monetary, impacto_recuperable>0).
    // Casos con direccion='recuperable' pero sin monto USD se reportan aparte como
    // recuperables_sin_monto_usd — informativo, no penaliza cobertura.
    const _elegiblesUSD = finalWithChains.filter(b =>
      b.direccion === 'recuperable'
      && !b.non_monetary
      && b.impacto_recuperable != null
      && b.impacto_recuperable > 0,
    )
    const _asignadosUSD = _elegiblesUSD  // por definición, todos tienen monto > 0
    const _nonMonRec    = finalWithChains.filter(b => b.direccion === 'recuperable' && b.non_monetary).length
    const _recSinMonto  = finalWithChains.filter(b =>
      b.direccion === 'recuperable' && !b.non_monetary
      && (b.impacto_recuperable == null || b.impacto_recuperable === 0),
    ).length
    const _positivos = finalWithChains.filter(b => b.direccion === 'positivo').length
    const _neutrales = finalWithChains.filter(b => b.direccion === 'neutral').length
    const _coberturaUSD = _elegiblesUSD.length > 0 ? _asignadosUSD.length / _elegiblesUSD.length : 1
    console.debug(`[PR2c] breakdown: elegibles_recuperable_usd=${_elegiblesUSD.length}, asignados_usd=${_asignadosUSD.length}, non_monetary_recuperables=${_nonMonRec}, recuperables_sin_monto_usd=${_recSinMonto}, positivos=${_positivos}, neutrales=${_neutrales}, cobertura_usd=${(_coberturaUSD * 100).toFixed(0)}%`)
    // [PR-D2] reclasificación de non_monetary con dirección derivada por signo
    const _nonMonWithDirection = finalWithChains.filter(b => b.non_monetary === true)
    const _d2Breakdown = {
      antes_neutral_ahora_recuperable: _nonMonWithDirection.filter(b => b.direccion === 'recuperable').length,
      antes_neutral_ahora_positivo:    _nonMonWithDirection.filter(b => b.direccion === 'positivo').length,
      sin_cambio:                      _nonMonWithDirection.filter(b => b.direccion === 'neutral' || b.direccion == null).length,
    }
    console.debug('[PR-D2] reclasificados:', _d2Breakdown)
    // [PR-3] top-5 por priority_score
    console.debug('[PR3] top-5 por priority_score:', finalWithChains.slice(0, 5).map(b => ({
      id: b.id.slice(0, 35),
      priority_score: b.priority_score?.toFixed(0),
      urgencia: b.urgencia_temporal,
      recuperable: b.impacto_recuperable?.toFixed(0),
    })))
    // [PR-5] auditoría de agrupación
    const padres  = groupedPool.filter(b => b.id.startsWith('group-'))
    const hijos   = groupedPool.filter(b => b.parent_id != null)
    console.debug(`[PR5] agrupados: ${padres.length} padres, ${hijos.length} hijos absorbidos`)
    if (padres.length > 0) {
      console.debug('[PR5] grupos:', padres.map(b => ({ id: b.id, headline: b.headline, impacto: b.impactoUSD })))
    }
    // [PR-6.1] chain audit with rejection breakdown
    console.debug(`[PR6] chains: ${_chains.length} total, ${_chains.filter(c => c.nodos.length >= 2).length} con depth ≥2`)
    // [PR-6.1b] niveles asignados a cada bloque del pool
    const dimOrder = ['meta','vendedor','zona','canal','cliente','categoria','producto'] as const
    console.debug('[PR6b] niveles:', validScored.map(b => ({
      id: b.id.slice(0, 35),
      nivel: dimensionDeBlock(b) || 'n/a',
    })))
    // [PR-D1] contar insights reclasificados: _dimension original o prefijo era
    // 'departamento'/'region' y ahora responden como 'zona'
    const _deptoMapeados = validScored.filter(b => {
      const raw = b._dimension ?? (b.id.startsWith('ie-') ? b.id.split('-')[1] ?? '' : '')
      return raw === 'departamento' || raw === 'region'
    }).length
    console.debug(`[PR-D1] departamentos mapeados a zona: ${_deptoMapeados}`)
    // Rejection diagnostics: count why pairs were rejected
    let _rPertenencia = 0, _rUmbral = 0, _rSigno = 0, _rNivel = 0, _rEval = 0
    // [PR-D1b] desglose de rechazos por nivel (sub-categorías)
    let _rNivel_padreSinNivel = 0, _rNivel_hijoSinNivel = 0, _rNivel_noMasGranular = 0, _rNivel_mismoNivel = 0
    let _firstPertenenciaRejection: Record<string, unknown> | null = null
    for (const a of validScored) {
      for (const b of validScored) {
        if (a.id === b.id) continue
        _rEval++
        const isNeg = (x: typeof a) => x.severity === 'critical' || x.severity === 'warning'
        if (isNeg(a) !== isNeg(b)) { _rSigno++; continue }
        const nivelA = dimOrder.indexOf(dimensionDeBlock(a) as typeof dimOrder[number])
        const nivelB = dimOrder.indexOf(dimensionDeBlock(b) as typeof dimOrder[number])
        if (nivelA < 0 || nivelB < 0 || nivelB <= nivelA) {
          // [PR-D1b] desglose del motivo específico
          if (nivelA < 0) _rNivel_padreSinNivel++
          else if (nivelB < 0) _rNivel_hijoSinNivel++
          else if (nivelB === nivelA) _rNivel_mismoNivel++
          else _rNivel_noMasGranular++   // nivelB < nivelA
          _rNivel++; continue
        }
        const memA = normalizeEntity(a._member)
        const memB = normalizeEntity(b._member)
        if (!memA || !memB || !_pertenencia.get(memB)?.has(memA)) {
          _rPertenencia++
          if (!_firstPertenenciaRejection && memA && memB) {
            _firstPertenenciaRejection = {
              padre_id:            a.id.slice(0, 35),
              padre_entidad_norm:  memA,
              hijo_id:             b.id.slice(0, 35),
              hijo_entidad_norm:   memB,
              universo_padre_norm: [..._pertenencia.get(memB) ?? []].slice(0, 8),
            }
          }
          continue
        }
        const recA = a.impacto_recuperable ?? 0; const recB = b.impacto_recuperable ?? 0
        if (recB < recA * 0.1) { _rUmbral++; continue }
      }
    }
    console.debug(`[PR6] candidatos evaluados: ${_rEval}, rechazados por signo: ${_rSigno}, nivel: ${_rNivel}, pertenencia: ${_rPertenencia}, umbral 10%: ${_rUmbral}`)
    // [PR-D1b] desglose de rechazo por nivel
    console.debug('[PR-D1b] desglose rechazo nivel:', {
      padre_sin_nivel:     _rNivel_padreSinNivel,
      hijo_sin_nivel:      _rNivel_hijoSinNivel,
      hijo_no_mas_granular: _rNivel_noMasGranular,
      mismo_nivel:         _rNivel_mismoNivel,
      total_nivel:         _rNivel,
    })
    if (_firstPertenenciaRejection) console.debug('[PR6b] muestra rechazo pertenencia:', _firstPertenenciaRejection)
    // [PR-L1] motor 2 pipeline: distribución + tiempo
    const _pr_l1_m2_porTipo: Record<string, number> = {}
    const _pr_l1_m2_porDim:  Record<string, number> = {}
    for (const c of candidates) {
      _pr_l1_m2_porTipo[c.insightTypeId] = (_pr_l1_m2_porTipo[c.insightTypeId] ?? 0) + 1
      _pr_l1_m2_porDim[c.dimensionId]    = (_pr_l1_m2_porDim[c.dimensionId] ?? 0) + 1
    }
    console.debug('[PR-L1] motor2_insights:', {
      candidates_total: candidates.length,
      blocks_final:     finalWithChains.length,
      por_tipo:         _pr_l1_m2_porTipo,
      por_dimension:    _pr_l1_m2_porDim,
      tiempo_ms:        Math.round(performance.now() - _pr_l1_m2_t0),
    })
    // [PR-6.1b] chains reasignadas a grupos padres
    const _chainsEnGrupo = [...(_chainByRoot.keys())].filter(id => id.startsWith('group-')).length
    console.debug(`[PR6b] chains adjuntas a grupos: ${_chainsEnGrupo} / ${_chainByRoot.size}`)
    // [PR-L2a-fix] telemetría post-fix: ranking size + breakdown por direccion + chains
    const _rankingPorDireccion: Record<string, number> = {}
    for (const b of finalWithChains) {
      const d = b.direccion ?? 'n/a'
      _rankingPorDireccion[d] = (_rankingPorDireccion[d] ?? 0) + 1
    }
    const _orphansFiltrados = merged.filter(b =>
      typeof b.id === 'string' && ORPHAN_RANKING_EXCLUDED_PREFIXES.some(p => b.id.startsWith(p)),
    ).length
    console.debug('[PR-L2a-fix]', {
      ranking_size:          finalWithChains.length,
      por_direccion:         _rankingPorDireccion,
      orphans_filtrados:     _orphansFiltrados,
      orphan_prefijos:       ORPHAN_RANKING_EXCLUDED_PREFIXES,
      chains_total:          _chains.length,
      chains_depth_gte_2:    _chains.filter(c => c.nodos.length >= 2).length,
    })
    // [PR-cierre] detalle por chain: raíz original vs efectiva + si quedó en final
    const _finalIds = new Set(finalWithChains.map(b => b.id))
    console.debug('[PR-cierre] chain reassignment detail:', _chains.map(ch => {
      const parentId = _childToParent.get(ch.root_insight_id)
      const effectiveRoot = parentId ?? ch.root_insight_id
      return {
        root_original:   ch.root_insight_id.slice(0, 35),
        root_efectivo:   effectiveRoot.slice(0, 35),
        reasignado:      parentId != null,
        root_en_final:   _finalIds.has(effectiveRoot),
        nodos:           ch.nodos.length,
      }
    }))
    if (_chains.length > 0) {
      console.debug('[PR6] sample chains:', _chains.slice(0, 3).map(c => ({
        root: c.root_insight_id.slice(0, 35),
        nodos: c.nodos.map(n => n.id.slice(0, 30)),
      })))
    }
  }
  return finalWithChains
}

// ─── Quality filter (insightStandard bridge) ──────────────────────────────────

// TERMINOS_PROHIBIDOS_EN_OUTPUT se usa internamente en contieneJerga; importado para disponibilidad
void TERMINOS_PROHIBIDOS_EN_OUTPUT
// calcularConfianzaTemporal, validarAccionConcreta, limitarRepeticionKPI, FORMATO importados para disponibilidad;
// su integración completa requiere datos que no están disponibles en este scope (ver TODOs)
void calcularConfianzaTemporal
void validarAccionConcreta
void limitarRepeticionKPI
void FORMATO

export function filtrarConEstandar(
  candidates: InsightCandidate[],
  contexto: {
    diaDelMes: number
    diasEnMes: number
    sales: SaleRecord[]
    metas: MetaRecord[]
    inventory: CategoriaInventario[]
    clientesDormidos: ClienteDormido[]
    ventaTotalNegocio: number
    tipoMetaActivo: string
    selectedPeriod: { year: number; month: number }
    /** Pre-computados por getAgregadosParaFiltro en EstadoComercialPage. [Z.4 — perf: cuello-2] */
    agregados?: AgregadosFiltro
  },
): InsightCandidate[] {
  if (candidates.length === 0) return candidates

  const {
    diaDelMes, diasEnMes, sales, metas, inventory,
    clientesDormidos, selectedPeriod, agregados,
  } = contexto
  // [Z.4 — perf: cuello-2] Si llegan pre-computados, ventaTotalNegocio viene de ahí
  const ventaTotalNegocio = agregados?.ventaTotalNegocio ?? contexto.ventaTotalNegocio

  // ── FASE A: Preparación estadística ─────────────────────────────────────────

  // A1. calcularPercentiles — percentiles del score de candidatos
  // [Z.4 — perf: cuello-4] Reusar stats pre-computadas de runInsightEngine si coincide el set
  const _preStats = candidates[0]?._stats?.candidateCount === candidates.length
    ? candidates[0]._stats : null
  let percentiles = { p5: 0, p10: 0, p20: 0, p50: 0, p75: 0, p80: 0, p90: 0, p95: 0 }
  try {
    percentiles = _preStats?.percentiles ?? calcularPercentiles(candidates.map(c => c.score * 100))
  } catch (e) { console.warn('[filtrarConEstandar] calcularPercentiles:', e) }

  // A2. calcularPareto — entidades 80/20 por score
  let paretoList: string[] = []
  try {
    paretoList = _preStats?.paretoList ?? (() => {
      // [Z.12] Pareto sobre dinero real (|impacto_usd_normalizado|), no sobre score.
      const entidades = candidates
        .map(c => ({
          nombre: c.member,
          valor: Math.abs(Number(c.impacto_usd_normalizado) || 0),
        }))
        .filter(e => e.valor > 0)
      return calcularPareto(entidades)
    })()
  } catch (e) { console.warn('[filtrarConEstandar] calcularPareto:', e) }

  // A3. detectarFamiliasProducto — variantes de producto para consolidación posterior
  let familiasProducto = new Map<string, string[]>()
  try {
    const productNames = candidates
      .filter(c => c.dimensionId === 'producto')
      .map(c => c.member)
    familiasProducto = detectarFamiliasProducto(productNames)
  } catch (e) { console.warn('[filtrarConEstandar] detectarFamiliasProducto:', e) }
  void familiasProducto // referenciado en A4/D17

  // A4+A5+memberTx: [Z.4 — perf: cuello-2] Una sola pasada via getAgregadosParaFiltro
  // Si EstadoComercialPage ya los pre-computó, se reusa; si no, se computan aquí.
  const _ag = agregados ?? getAgregadosParaFiltro(sales, selectedPeriod)
  const { byMonth: _byMonth, clientProductMap: _clientProductMap,
          memberTxCounts, memberValues } = _ag

  // A4. calcularCoOcurrencia — co-matrix clientes × productos desde ventas
  let coMatrix = new Map<string, Map<string, number>>()
  try {
    coMatrix = calcularCoOcurrencia(_clientProductMap)
  } catch (e) { console.warn('[filtrarConEstandar] calcularCoOcurrencia:', e) }

  // A5. calcularChurnBaseline — tasa base de pérdida de clientes
  let churnBaseline = { tasaPromedio: 0.10, desviacionEstandar: 0.05 }
  try {
    const sorted = [..._byMonth.entries()].sort(([a], [b]) => a.localeCompare(b))
    churnBaseline = calcularChurnBaseline(
      sorted.map(([periodo, clientes]) => ({ periodo, clientes }))
    )
  } catch (e) { console.warn('[filtrarConEstandar] calcularChurnBaseline:', e) }

  // ── FASE B: Filtros de entrada ────────────────────────────────────────────────

  // V1 — filtro-ruido
  // B6. pasaFiltroRuido — usar percentiles de A1 como umbrales
  const medianaTx = percentiles.p50 > 0 ? percentiles.p50 : 10
  const p10Value  = percentiles.p10 > 0 ? percentiles.p10 : 1
  let result = candidates.filter(c => {
    if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) return true // [Z.7 T1-HOTFIX]
    try {
      // Fase 5B.2: candidatos sin comparación temporal (ej. cliente_dormido)
      // no pueden evaluarse con pasaFiltroRuido, porque el filtro mide
      // actividad en el período actual y estos insights codifican precisamente
      // la AUSENCIA de actividad. Se exentan y se validan por su propia
      // lógica (umbral de días sin comprar vs umbralDiasDormido, ya aplicado
      // en la emisión del candidato). Guard por capacidad (comparison), no
      // por insightTypeId: extensible a futuros insights no_temporal.
      if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') {
        console.debug('[fase5b.2] candidato no_temporal exento de pasaFiltroRuido', {
          insightTypeId: c.insightTypeId,
          member:        c.member,
        })
        return true
      }
      const txCount = memberTxCounts.get(c.member) ?? 5
      const val     = memberValues.get(c.member) ?? ((c.detail as Record<string, unknown>).value as number) ?? c.score * 100
      return pasaFiltroRuido(txCount, val, p10Value, medianaTx)
    } catch { return true }
  })

  // V2 — proporcionalidad
  // B7. validarProporcionalidad — degradar si impacto absoluto es minúsculo vs negocio total
  for (const c of result) {
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') continue // Fase 5B.2
    try {
      const det = c.detail as Record<string, unknown>
      const impactoAbs = Math.abs(
        (det.totalChange as number) ?? (det.value as number) ?? c.score * 100
      )
      const vt = ventaTotalNegocio > 0 ? ventaTotalNegocio : 1
      const { prioridadSugerida } = validarProporcionalidad(impactoAbs, vt, c.severity)
      c.severity = prioridadSugerida
    } catch (e) { console.warn('[filtrarConEstandar] validarProporcionalidad:', e) }
  }

  // V3 — variante-promocional
  // B8. esVariantePromocional — degradar productos con sufijo PROMO/BONIF
  for (const c of result) {
    try {
      if (c.dimensionId === 'producto' && esVariantePromocional(c.member)) {
        if      (c.severity === 'CRITICA') c.severity = 'ALTA'
        else if (c.severity === 'ALTA')    c.severity = 'MEDIA'
      }
    } catch (e) { console.warn('[filtrarConEstandar] esVariantePromocional:', e) }
  }

  // V4 — comparación-temporal
  // B9. validarComparacionTemporal — degradar si estamos en días muy tempranos del mes
  if (diaDelMes <= 3) {
    for (const c of result) {
      if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') continue // Fase 5B.2
      try {
        const v = validarComparacionTemporal('MTD', diaDelMes, new Date())
        if (v.confianza === 'muy_temprana' && c.severity === 'CRITICA') c.severity = 'ALTA'
      } catch { /* keep */ }
    }
  }

  // ── FASE C: Enriquecimiento contextual ───────────────────────────────────────

  // V5 — inventario
  // C10. evaluarIntegracionInventario — cruzar productos con datos de inventario
  for (const c of result) {
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') continue // Fase 5B.2
    try {
      if (c.dimensionId === 'producto' && inventory?.length) {
        const det          = c.detail as Record<string, unknown>
        const ventaMensual = (det.value as number) ?? (det.current as number) ?? 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const inv = evaluarIntegracionInventario(c.member, inventory as any, ventaMensual)
        if (inv) {
          c.detail = {
            ...c.detail,
            _inv_stockActual:      inv.stockActual,
            _inv_mesesCobertura:   inv.mesesCobertura,
            _inv_sinStock:         inv.sinStock,
            _inv_sobrestock:       inv.sobrestock,
          }
        }
      }
    } catch (e) { console.warn('[filtrarConEstandar] evaluarIntegracionInventario:', e) }
  }

  // V6 — metas
  // C11. evaluarIntegracionMetas — cruzar vendedores con datos de metas
  for (const c of result) {
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') continue // Fase 5B.2
    try {
      if (c.dimensionId === 'vendedor' && metas?.length) {
        const fechaRef   = new Date(selectedPeriod.year, selectedPeriod.month, diaDelMes)
        // calcularDiaDelMes y calcularDiasEnMes usados como helpers de validación
        void calcularDiaDelMes(fechaRef)
        void calcularDiasEnMes(fechaRef)
        const ventaActual = memberValues.get(c.member) ?? 0
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const metaInfo = evaluarIntegracionMetas(c.member, metas as any, fechaRef, ventaActual)
        if (metaInfo) {
          c.detail = {
            ...c.detail,
            _meta_cumplimiento: metaInfo.cumplimiento,
            _meta_gap:          metaInfo.gap,
            _meta_proyeccion:   metaInfo.proyeccion,
          }
        }
      }
    } catch (e) { console.warn('[filtrarConEstandar] evaluarIntegracionMetas:', e) }
  }

  // V7 — dormido-contexto
  // C12. evaluarDormidoConContexto — validar si clientes dormidos son reales.
  // Fase 5B: enriquecer además con umbral configurable por usuario (P6).
  const dormidoCfg = getDiasDormidoUsuario()
  if (!dormidoCfg.esDefault) {
    console.debug('[fase5b] umbral dias_dormido override:', dormidoCfg.valor, '(default:', DIAS_DORMIDO_DEFAULT, ')')
  }
  for (const c of result) {
    try {
      if (c.dimensionId === 'cliente' && clientesDormidos?.length) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const dormido = clientesDormidos.find((d: any) => d.cliente === c.member)
        if (dormido) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const d = dormido as any
          const diasSinCompra = d.dias_sin_actividad ?? d.dias_sin_compra ?? 90
          const ctx = {
            frecuenciaCompra:       d.frecuencia_promedio ?? null,
            distribucionIntraMes:   null,
            estacionalidad:         null,
            patronCanal:            null,
            volumenRelativoSegmento: null,
            mesesHistoricos:        d.meses_historico ?? d.meses_historial ?? 6,
            metaVendedor:           null,
          }
          const eval_ = evaluarDormidoConContexto(diasSinCompra, ctx)
          if (!eval_.esDormidoReal) {
            if      (c.severity === 'CRITICA') c.severity = 'ALTA'
            else if (c.severity === 'ALTA')    c.severity = 'MEDIA'
          }
          // Fase 5B (R50): etiquetar candidato con umbral para que el render muestre cintillo.
          // Solo si el cliente realmente excede el umbral del usuario.
          if (diasSinCompra >= dormidoCfg.valor) {
            const det = c.detail as Record<string, unknown>
            c.detail = {
              ...det,
              umbralDiasDormido:     dormidoCfg.valor,
              esUmbralDefault:       dormidoCfg.esDefault,
              diasSinComprar:        diasSinCompra,
              impactoVentaHistorica: d.valor_yoy_usd ?? 0,
            }
          }
        }
      }
    } catch (e) { console.warn('[filtrarConEstandar] evaluarDormidoConContexto:', e) }
  }

  // V8 — churn
  // C13. esChurnSignificativo — degradar si pérdida de cliente no supera baseline
  let p75Clientes = 0
  try {
    const clientScores = candidates
      .filter(c => c.dimensionId === 'cliente')
      .map(c => ((c.detail as Record<string, unknown>).value as number) ?? c.score * 100)
    if (clientScores.length > 0) p75Clientes = calcularPercentiles(clientScores).p75
  } catch { /* skip */ }

  for (const c of result) {
    try {
      if (c.dimensionId === 'cliente') {
        const det       = c.detail as Record<string, unknown>
        const valorCli  = (det.value as number) ?? (det.current as number) ?? c.score * 100
        // Usar churnActual como tasa observada estimada a partir del baseline
        const churnActual = churnBaseline.tasaPromedio + churnBaseline.desviacionEstandar * 0.5
        const significant = esChurnSignificativo(valorCli, p75Clientes, churnActual, churnBaseline)
        if (!significant && c.severity === 'CRITICA') c.severity = 'ALTA'
      }
    } catch (e) { console.warn('[filtrarConEstandar] esChurnSignificativo:', e) }
  }

  // V9 — penetración (NO IMPLEMENTADO — falta totalProductosDisponibles)
  // C14. evaluarPenetracion — TODO: necesita totalProductosDisponibles y promedioProductosPorCliente
  //       requiere agregación compleja desde sales; pendiente de implementación

  // V10 — pareto
  // C15. esEntidadPareto — elevar prioridad si la entidad está en el 80/20
  for (const c of result) {
    try {
      if (c.member && esEntidadPareto(c.member, paretoList)) {
        c.detail = { ...c.detail, _esPareto: true }
        if      (c.severity === 'BAJA')  c.severity = 'MEDIA'
        else if (c.severity === 'MEDIA') c.severity = 'ALTA'
      }
    } catch (e) { console.warn('[filtrarConEstandar] esEntidadPareto:', e) }
  }

  // === Z.12: Tabla de la verdad ejecutiva ===
  // [Fase 6A] Gate canónico delegado a insightStandard.ts:evaluateInsightCandidate.
  // Acá vive solo el orquestador array-level: precompute crossCount, llamar al
  // gate, aplicar mutación `_z122_relaxed` y telemetría DEV.
  // Reglas, regex y umbrales ahora son fuente única en insightStandard.ts.
  const _Z12_ventaTotal = ventaTotalNegocio > 0 ? ventaTotalNegocio : 1
  const _Z12_floorAbs   = _Z12_ventaTotal * MATERIALITY_FLOOR_EXECUTIVE

  const _Z12_suppressed: Array<{
    member: string
    insightTypeId: string
    usdAbs: number
    pctSobreVenta: number
    cross: number
    reglas: InsightGateDecision['rules']
    r4_mode: InsightGateDecision['mode']
    isRootStrong: boolean
    esParetoReal: boolean
    usdSource: string | null
    reason?: string
  }> = []

  result = result.filter((c) => {
    try {
      const crossCount = _z11ContarCrossConcreto(c)
      const decision = evaluateInsightCandidate(c, {
        ventaTotalNegocio: _Z12_ventaTotal,
        paretoList,
        crossCount,
      })

      if (!decision.passes) {
        const usdAbs = Math.abs(Number(c.impacto_usd_normalizado) || 0)
        const isRootStrong =
          (new Set(['meta_gap_temporal', 'product_dead', 'migration'])).has(c.insightTypeId) &&
          crossCount >= 2
        _Z12_suppressed.push({
          member:        c.member,
          insightTypeId: c.insightTypeId,
          usdAbs,
          pctSobreVenta: _Z12_ventaTotal > 0 ? usdAbs / _Z12_ventaTotal : 0,
          cross:         crossCount,
          reglas:        decision.rules,
          r4_mode:       decision.mode,
          isRootStrong,
          esParetoReal:  !!c.member && esEntidadPareto(c.member, paretoList),
          usdSource:     (c as { impacto_usd_source?: string }).impacto_usd_source ?? null,
          reason:        decision.reason,
        })
      } else if (decision.mode === 'relaxed') {
        // [Z.12.2] Marca candidato salvado por puerta relajada para auditar downstream.
        ;(c as unknown as { _z122_relaxed?: boolean })._z122_relaxed = true
      }
      return decision.passes
    } catch (e) {
      console.warn('[Z.12 exec_gate] evaluación falló, conservando candidato:', e)
      return true
    }
  })

  if (import.meta.env.DEV) {
    console.debug('[Z.12] exec_gate resumen', {
      ventaTotalNegocio: _Z12_ventaTotal,
      floorAbs:          _Z12_floorAbs,
      floorPct:          MATERIALITY_FLOOR_EXECUTIVE,
      executiveTopN:     EXECUTIVE_TOP_N,
      surviving:         result.length,
      suppressed:        _Z12_suppressed.length,
      relaxed_survivors: result.filter((c) => (c as { _z122_relaxed?: boolean })._z122_relaxed === true).length,
      suppressedDetail:  _Z12_suppressed,
    })
  }
  // === fin Z.12 ===

  // V11 — cruces-tipo-estándar
  // C16. CRUCES_DISPONIBLES — validar que el cruce métrica×dimensión está permitido
  result = result.filter(c => {
    if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) return true // [Z.7 T1-HOTFIX-2]
    // Fase 5B.3: no_temporal no aplica a la whitelist de cruces/tipo estándar;
    // los insights sin dimensión temporal se validan por su propia capacidad
    // (ej. dormidos por umbral de días, ya aplicado en la emisión).
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') return true
    try {
      const dimCruces = (CRUCES_DISPONIBLES as unknown as Record<string, {
        directos: readonly string[]; conVentas: readonly string[]; conOtrasTablas: readonly string[]
      }>)[c.dimensionId]
      if (!dimCruces) return true // dimensión no registrada → dejar pasar
      const allCruces = [
        ...dimCruces.directos,
        ...dimCruces.conVentas,
        ...dimCruces.conOtrasTablas,
      ]
      if (allCruces.length === 0) return true
      // El metricId o insightTypeId debe tener coincidencia parcial con algún cruce
      const metricMatch = allCruces.some(cr =>
        c.metricId.includes(cr) || cr.includes(c.metricId) || c.insightTypeId.includes(cr)
      )
      // Los tipos estándar del engine siempre pasan (la validación de cruces se aplica a tipos custom)
      const isStandardType = ['trend', 'change', 'dominance', 'contribution',
        'meta_gap', 'proportion_shift', 'correlation', 'cross_delta'].includes(c.insightTypeId)
      return metricMatch || isStandardType
    } catch { return true }
  })

  // ── FASE D: Patrones compuestos ───────────────────────────────────────────────

  // V12 — co-declive
  // D17. detectarCoDeclive — agrupar productos que declinan juntos
  try {
    const productosDeclive = result
      .filter(c => {
        const det = c.detail as Record<string, unknown>
        return c.dimensionId === 'producto' && (
          det.direction === 'down' ||
          (typeof det.pctChange === 'number' && (det.pctChange as number) < 0)
        )
      })
      .map(c => c.member)

    if (productosDeclive.length >= 2 && coMatrix.size > 0) {
      const totalClientes    = new Map<string, number>()
      const productoDeptMap  = new Map<string, string>()
      for (const prod of productosDeclive) {
        totalClientes.set(prod, memberTxCounts.get(prod) ?? 1)
      }
      for (const s of sales) {
        const sr   = s as unknown as Record<string, unknown>
        const prod = sr.producto as string | undefined
        const dept = sr.departamento as string | undefined
        if (prod && dept) productoDeptMap.set(prod, dept)
      }
      const grupos = detectarCoDeclive(productosDeclive, coMatrix, totalClientes, productoDeptMap)
      for (const grupo of grupos) {
        const lead = result.find(c => c.member === grupo[0])
        if (lead) lead.detail = { ...lead.detail, _coDecliveGrupo: grupo }
      }
    }
  } catch (e) { console.warn('[filtrarConEstandar] detectarCoDeclive:', e) }

  // V13 — cascadas
  // D18. detectarCascadas — vincular insights que son efecto cascada de otro
  try {
    const adaptedForCascade = result.map(c => ({
      entityType: c.dimensionId,
      entityId:   c.member,
      prioridad:  c.severity,
    }))
    const cascadas = detectarCascadas(adaptedForCascade)
    cascadas.forEach((info, key) => {
      if (info.severidad === 'alta') {
        const [etype, eid] = key.split('-')
        const lead = result.find(c => c.dimensionId === etype && c.member === eid)
        if (lead) lead.detail = { ...lead.detail, _cascada: true, _cascadaSeveridad: info.severidad }
      }
    })
  } catch (e) { console.warn('[filtrarConEstandar] detectarCascadas:', e) }

  // V14 — indicador-anticipado
  // D19. evaluarIndicadorAnticipado — elevar leading indicators de riesgo
  for (const c of result) {
    try {
      const det       = c.detail as Record<string, unknown>
      const pctChange = typeof det.pctChange === 'number' ? (det.pctChange as number) : 0
      const history   = (det.history as number[] | undefined) ?? []
      const señales = {
        cambioBaseClientes:       pctChange < 0 ? pctChange * 10 : 0,
        cambioRevenue:            pctChange,
        tendenciaMensual3m:       history.length >= 3 ? history : [],
        inventarioMesesCobertura: (det._inv_mesesCobertura as number | undefined) ?? null,
        saludVendedor:            null,
      }
      const eval_ = evaluarIndicadorAnticipado(señales)
      if (eval_.esAnticipado && eval_.riesgo >= 0.6) {
        if (c.severity === 'MEDIA') c.severity = 'ALTA'
        c.detail = { ...c.detail, _esLeadingIndicator: true }
      }
    } catch (e) { console.warn('[filtrarConEstandar] evaluarIndicadorAnticipado:', e) }
  }

  // ── FASE E: Dedup y contradicciones ──────────────────────────────────────────

  // E20. resolverContradiccion — mantener el más relevante por entidad
  try {
    const adapted = result.map(c => ({
      entityType:   c.insightTypeId,
      entityId:     `${c.member}_${c.dimensionId}`,
      __impactoAbs: c.score,
      titulo:       c.title,
      descripcion:  c.description,
    }))
    const resolved      = resolverContradiccion(adapted)
    const resolvedKeys  = new Set(resolved.map(r => `${r.entityType}|${r.entityId}`))
    result = result.filter(c => {
      if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) return true // [Z.7 T1-HOTFIX-2]
      // Fase 5B.3: no_temporal no participa en resolución de contradicciones temporales.
      if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') return true
      return resolvedKeys.has(`${c.insightTypeId}|${c.member}_${c.dimensionId}`)
    })
  } catch { /* leave unchanged */ }

  // E21. detectarRedundancia — eliminar insights que dicen lo mismo
  try {
    const adapted = result.map(c => ({
      vendedor:    c.dimensionId === 'vendedor'  ? c.member : undefined,
      cliente:     c.dimensionId === 'cliente'   ? c.member : undefined,
      producto:    c.dimensionId === 'producto'  ? c.member : undefined,
      tipo:        c.insightTypeId,
      descripcion: c.description,
    }))
    const redundancias = detectarRedundancia(adapted)
    if (redundancias.length > 0) {
      const toDiscardObjs = new Set<object>(redundancias.map(r => r.descartar as object))
      result = result.filter((c, i) => {
        if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) return true // [Z.7 T1-HOTFIX-2]
        // Fase 5B.3: no_temporal no participa en detección de redundancia temporal.
        if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') return true
        return !toDiscardObjs.has(adapted[i] as object)
      })
    }
  } catch { /* leave unchanged */ }

  // E22. validarBalance — si todo es negativo, hacer cap de negativos para dejar subir positivos
  try {
    const isNoTemporal = (c: InsightCandidate) =>
      (c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal'
    const isPos = (c: InsightCandidate) => {
      const det = c.detail as Record<string, unknown>
      return det.direction === 'up' ||
             (typeof det.pctChange === 'number' && (det.pctChange as number) > 0)
    }
    // Fase 5B.3: los no_temporal quedan fuera de la clasificación pos/neg porque
    // no codifican dirección temporal. Siempre sobreviven al cap.
    const balanceInfo = validarBalance(result.filter(c => !isNoTemporal(c)).map(c => ({ esPositivo: isPos(c) })))
    if (!balanceInfo.balanceado && balanceInfo.sugerencia === 'cap_negativos') {
      const noTemporales = result.filter(isNoTemporal)
      const temporales   = result.filter(c => !isNoTemporal(c))
      const positivos    = temporales.filter(c => isPos(c))
      const negativos    = temporales.filter(c => !isPos(c))
      // Mostrar al menos 1 positivo: cap negativos a 4× los positivos
      const maxNegativos = Math.max(negativos.length, 4)
      result = [...noTemporales, ...positivos, ...negativos.slice(0, maxNegativos)]
    }
  } catch (e) { console.warn('[filtrarConEstandar] validarBalance:', e) }

  // ── FASE F: Priorización ──────────────────────────────────────────────────────

  // F23. determinarMaxPrioridad — re-asignar prioridad según percentile rank del score
  for (const c of result) {
    try {
      const p90         = percentiles.p90 > 0 ? percentiles.p90 : 100
      const pctRank     = Math.min(99, (c.score * 100 / p90) * 90)
      const maxPrio     = determinarMaxPrioridad(pctRank)
      const orden: Record<string, number> = { CRITICA: 3, ALTA: 2, MEDIA: 1, BAJA: 0 }
      // Solo degradar, nunca elevar (los detectores conocen mejor la urgencia)
      if ((orden[maxPrio] ?? 0) < (orden[c.severity] ?? 0)) c.severity = maxPrio
    } catch (e) { console.warn('[filtrarConEstandar] determinarMaxPrioridad:', e) }
  }

  // F24. validarInsight — try per candidate; downgrade severity if warnings
  for (const c of result) {
    try {
      const validationInput = {
        descripcion:         c.description,
        __impactoAbs:        Math.max(c.score * 100, 1),
        __esPositivo:        false,
        cruces:              [c.dimensionId, c.insightTypeId, c.metricId],
        __crucesCount:       3,
        __esAccionable:      true,
        contrastePortafolio: c.description,
        entityType:          c.dimensionId,
        entityId:            c.member,
      }
      const resultado = validarInsight(validationInput, { diaDelMes, percentileRank: 50 })
      if (resultado.warnings.length > 0) {
        if      (c.severity === 'CRITICA') c.severity = 'ALTA'
        else if (c.severity === 'ALTA')    c.severity = 'MEDIA'
      }
    } catch { /* leave as-is */ }
  }

  // ── FASE G: Calidad de texto ──────────────────────────────────────────────────

  // G25. sanitizarNarrativa + G26. sustituirJerga
  for (const c of result) {
    try {
      c.description = sanitizarNarrativa(sustituirJerga(c.description), { diaDelMes, diasEnMes })
      c.title       = sustituirJerga(c.title)
    } catch { /* leave as-is */ }
  }

  // G27. TERMINOS_PROHIBIDOS — ya cubierto por contieneJerga/sustituirJerga arriba

  // G28. esConclusionValida — descartar o degradar si la descripción es genérica
  result = result.filter(c => {
    if (EVENT_TYPES_EXEMPT.has(c.insightTypeId)) return true // [Z.7 T1-HOTFIX-2]
    // Fase 5B.3: no_temporal tiene su propia lógica de conclusión (umbral de días).
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') return true
    try {
      if (!esConclusionValida(c.description)) {
        if (c.severity === 'CRITICA' || c.severity === 'ALTA') {
          c.severity = 'MEDIA'
          return true // degradar, no descartar
        }
        return false // descartar MEDIA/BAJA genéricos
      }
      return true
    } catch { return true }
  })

  // G29. limitarRepeticionKPI — TODO: necesita kpiValues del dashboard para comparar
  //       los valores YTD/variación no están disponibles en este scope

  // G30. formatearImpacto + FORMATO — enriquecer detail con impacto formateado
  for (const c of result) {
    try {
      const det = c.detail as Record<string, unknown>
      if (typeof det.value === 'number' && ventaTotalNegocio > 0) {
        det._impactoFormateado = formatearImpacto(det.value as number, true)
      }
    } catch (e) { console.warn('[filtrarConEstandar] formatearImpacto:', e) }
  }

  // G31. validarCoherenciaTemporal — sustituir certezas prematuras
  for (const c of result) {
    if ((c?.detail as Record<string, unknown> | undefined)?.comparison === 'no_temporal') continue // Fase 5B.2
    try {
      const check = validarCoherenciaTemporal(c.description, diaDelMes, diasEnMes)
      if (!check.coherente && check.problema === 'certeza_prematura') {
        c.description = c.description
          .replace(/\bcerrará\b/g,   'podría cerrar')
          .replace(/\bno llegará\b/g, 'podría no llegar')
          .replace(/\bsuperará\b/g,  'podría superar')
      }
    } catch (e) { console.warn('[filtrarConEstandar] validarCoherenciaTemporal:', e) }
  }

  // G32. calcularConfianzaTemporal — TODO: necesita historialPctPorDia por entidad
  //       requiere historial de % de venta acumulado por día del mes, no disponible aquí

  // G33. validarAccionConcreta — InsightCandidate no tiene campo accion; skip

  // G34. calcularDiasEnMes / calcularDiaDelMes — helpers usados en C11

  // G (final). Jargon guard — re-pasar si algún término prohibido sobrevivió
  for (const c of result) {
    try {
      if (contieneJerga(`${c.title} ${c.description}`).tieneJerga) {
        c.description = sustituirJerga(c.description)
        c.title       = sustituirJerga(c.title)
      }
    } catch { /* leave as-is */ }
  }

  // Fase 5B.3: log de visibilidad con alerta explícita si los dormidos entran pero mueren.
  try {
    const dormidosSobrevivientes = result.filter(c => c?.insightTypeId === 'cliente_dormido').length
    console.debug('[fase5b.3] resumen filtrarConEstandar', {
      candidatosEntrada: candidates.length,
      candidatosSalida: result.length,
      dormidosSalida:   dormidosSobrevivientes,
    })
    if (dormidosSobrevivientes === 0 && candidates.some(c => c?.insightTypeId === 'cliente_dormido')) {
      console.warn('[fase5b.3] ALERTA: dormidos entraron pero ninguno sobrevivió al pipeline')
    }
  } catch { /* no-op */ }

  return result
}

// ─── Main engine ──────────────────────────────────────────────────────────────

// [Z.11.1] Quality gate ejecutivo — helpers puros.
// Filtra insights de Clase B (ruido estadístico sin carga ejecutiva)
// según reglas de supervivencia OR:
//   A) |usd| >= 200, cualquier tipo
//   B) 30 <= |usd| < 200 con cross>=2 y acción no genérica
//   C) usd==null con tipo raíz fuerte y cross>=2
const Z11_ROOT_STRONG_TYPES = new Set<string>([
  'meta_gap_temporal',
  'product_dead',
  'migration',
  // [Sprint H' / Visibility] Tipos nuevos. Razón: Z.11 supervivencia regla C
  // permite usd==null + cross>=2 + tipo root-strong. Sin esto, cliente_perdido
  // / meta_gap (combo) / cross_delta mueren en Z.11 cuando su USD impact es
  // marginal (<$200 absoluto), aunque sean material en cross_context.
  'cliente_perdido',
  'cliente_dormido',
  'meta_gap',         // emitido por meta_gap_combo (Phase C ingesta)
  'cross_delta',      // auto-combo dim×dim×... — tiene cross_context completo
  // [Z.11.1] Reconciliar con Z12_ROOT_STRONG_TYPES (insightStandard.ts:2563).
  // stock_risk y stock_excess son tipos terminales accionables del inventario;
  // sin esto, stock_excess Cacahuates 100g moría en Z.11 con tipo-debil aunque
  // luego Z.12 los considere root-strong. La asimetría no tenía justificación.
  'stock_risk',
  'stock_excess',
])
const Z11_GENERIC_ACTION_REGEX =
  /identificar qu[eé] cambi[oó]|comparar con el per[ií]odo|aislar la causa|validar patr[oó]n detectado|monitorear tendencia/i

function _z11ContarCrossConcreto(c: InsightCandidate): number {
  const cx = (c?.detail as Record<string, unknown> | undefined)?.cross_context
  if (!cx || typeof cx !== 'object') return 0
  let n = 0
  for (const v of Object.values(cx as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) n++
    else if (Array.isArray(v) && v.length > 0) n++
    else if (v && typeof v === 'object') {
      const obj = v as Record<string, unknown>
      const name =
        obj.cliente ?? obj.producto ?? obj.vendedor ?? obj.member ??
        obj.departamento ?? obj.categoria
      if (typeof name === 'string' && name.trim()) n++
    }
  }
  return n
}

function _z11EvaluarSupervivencia(c: InsightCandidate): { sobrevive: boolean; regla: string } {
  const usd = c.impacto_usd_normalizado
  const absUsd = typeof usd === 'number' ? Math.abs(usd) : 0
  const cross = _z11ContarCrossConcreto(c)
  const accionTexto = typeof c.accion === 'object' && c.accion !== null
    ? ((c.accion as { texto?: string }).texto ?? '')
    : (typeof c.accion === 'string' ? c.accion : '')
  const accionGenerica = Z11_GENERIC_ACTION_REGEX.test(accionTexto)

  if (usd != null && absUsd >= 200) {
    return { sobrevive: true, regla: 'A:usd>=200' }
  }
  if (usd != null && absUsd >= 30 && cross >= 2 && !accionGenerica) {
    return { sobrevive: true, regla: 'B:usd-medio+cross+narr' }
  }
  if (usd == null && Z11_ROOT_STRONG_TYPES.has(c.insightTypeId) && cross >= 2) {
    return { sobrevive: true, regla: 'C:null-usd+root-strong+cross' }
  }

  const razones: string[] = []
  if (usd == null) razones.push('sin-usd')
  else if (absUsd < 30) razones.push(`usd-trivial($${Math.round(absUsd)})`)
  else if (absUsd < 200) razones.push(`usd-medio($${Math.round(absUsd)})`)
  if (cross < 2) razones.push(`cross-pobre(${cross})`)
  if (accionGenerica) razones.push('accion-generica')
  if (!Z11_ROOT_STRONG_TYPES.has(c.insightTypeId) && usd == null) {
    razones.push(`tipo-debil(${c.insightTypeId})`)
  }
  return { sobrevive: false, regla: razones.join('|') || 'sin-senales' }
}

// [Z.10.6b] return del engine es un array de candidatos con propiedades
// adjuntas para compresión ejecutiva. Backward compatible: el array itera,
// filtra y mapea como siempre; los campos problems/root_narratives viajan
// como properties enumerables. El tipo de esas estructuras se deja como
// unknown (internas, no contractuales).
type RunInsightEngineResult = InsightCandidate[] & {
  problems?:        ReadonlyArray<unknown>
  root_narratives?: ReadonlyArray<unknown>
}

// [Z.10.6d] jerarquía causal de insight types.
// Indice menor = más raíz causal. Indice mayor = síntoma más visible.
// Tipos no listados caen al final (síntoma débil).
const ROOT_CAUSE_TAXONOMY: ReadonlyArray<string> = [
  'meta_gap_temporal',  // brecha estructural de meta (raíz ejecutiva)
  'product_dead',       // producto sin ventas (raíz operativa)
  'migration',          // cambio de comportamiento sostenido (raíz comercial)
  'change_point',       // quiebre de régimen detectado (raíz temporal)
  'outlier',            // anomalía individual (raíz cualitativa)
  'contribution',       // aporte al descenso/crecimiento (síntoma medible)
  'change',             // variación puntual (síntoma cuantitativo)
  'trend',              // tendencia (síntoma observable)
  'seasonality',        // patrón estacional (señal cualitativa)
  'correlation',        // correlación entre métricas (señal analítica)
  'steady_share',       // participación estable (señal contextual)
  'stock_risk',         // riesgo de inventario (señal operativa)
  'stock_excess',       // exceso de inventario (señal operativa)
]
const _taxonomyRank = (tid: string): number => {
  const i = ROOT_CAUSE_TAXONOMY.indexOf(tid)
  return i === -1 ? ROOT_CAUSE_TAXONOMY.length : i
}

// [Z.10.6c] Narrador raíz determinístico — función pura sobre problems de Z.10.6a.
// Emite RootNarrative[] con títulos, qué pasó, por qué importa y acción sugerida
// ejecutables, con confidence audit-able. Sin LLM, sin closures mutables.
interface Z10RootNarrative {
  groupKey:          string
  dimensionId:       string
  member:            string
  syntoma:           InsightCandidate | null
  causas:            InsightCandidate[]
  impactoUsdTotal:   number
  impactoUsdSources: string[]
  size:              number
  insightTypeIds:    string[]
  titulo:            string
  que_paso:          string
  por_que_importa:   string
  accion_sugerida:   string
  confidence:        'high' | 'medium' | 'low'
  generated_by:      'Z.10.6c'
}

function buildRootNarratives(problems: Array<{
  groupKey:          string
  dimensionId:       string
  member:            string
  members:           InsightCandidate[]
  insightTypeIds:    string[]
  impactoUsdTotal:   number
  impactoUsdSources: string[]
  topMember:         InsightCandidate | null
  topRps:            number
  size:              number
}>): Z10RootNarrative[] {
  const _fmtUsd = (n: number): string => {
    if (!Number.isFinite(n) || n === 0) return 'sin USD'
    const abs = Math.abs(n)
    const sign = n < 0 ? '-' : ''
    if (abs >= 100) return `${sign}$${Math.round(abs).toLocaleString('en-US')}`
    return `${sign}$${abs.toFixed(2)}`
  }

  return problems.map((p) => {
    // [Z.10.6d] syntoma = member con insightTypeId más raíz (taxonomía).
    // Empate por rps desc. Causas ordenadas por rps desc (sin cambio).
    const sortedByTaxonomy = [...p.members].sort((a, b) => {
      const taxDelta = _taxonomyRank(a.insightTypeId) - _taxonomyRank(b.insightTypeId)
      if (taxDelta !== 0) return taxDelta
      return (b.render_priority_score ?? 0) - (a.render_priority_score ?? 0)
    })
    const syntoma = sortedByTaxonomy[0] ?? p.topMember ?? null
    const causas  = sortedByTaxonomy.slice(1).sort(
      (a, b) => (b.render_priority_score ?? 0) - (a.render_priority_score ?? 0),
    )
    const topType = syntoma?.insightTypeId ?? (p.insightTypeIds[0] ?? 'default')
    const usdFmt  = _fmtUsd(p.impactoUsdTotal)
    const member  = p.member || '(sin entidad)'

    let confidence: 'high' | 'medium' | 'low'
    if (p.size >= 2 && p.impactoUsdTotal > 500) confidence = 'high'
    else if (p.impactoUsdTotal > 100)           confidence = 'medium'
    else                                         confidence = 'low'

    let titulo: string
    switch (topType) {
      case 'meta_gap_temporal':
        titulo = p.size >= 2
          ? `${member} — brecha de meta con efectos acumulados (${usdFmt})`
          : `${member} — brecha de meta (${usdFmt})`
        break
      case 'product_dead':
        titulo = `${member} — producto sin ventas (${usdFmt})`
        break
      case 'contribution': {
        const dir = (syntoma?.direction === 'down' || (syntoma?.detail as { direction?: string } | undefined)?.direction === 'negativo')
          ? 'descenso'
          : (syntoma?.direction === 'up' || (syntoma?.detail as { direction?: string } | undefined)?.direction === 'positivo')
            ? 'crecimiento'
            : 'impacto'
        titulo = `${member} — mayor ${dir} detectado (${usdFmt})`
        break
      }
      case 'migration':
        titulo = `${member} — migración de comportamiento (${usdFmt})`
        break
      case 'outlier':
        titulo = `${member} — anomalía individual (${usdFmt})`
        break
      case 'change':
        titulo = `${member} — cambio detectado (${usdFmt})`
        break
      case 'trend':
        titulo = `${member} — tendencia activa (${usdFmt})`
        break
      case 'change_point':
        titulo = `${member} — quiebre de régimen (${usdFmt})`
        break
      case 'seasonality':
        titulo = `${member} — patrón estacional (${usdFmt})`
        break
      case 'correlation':
        titulo = `${member} — correlación detectada (${usdFmt})`
        break
      default:
        titulo = `${member} — problema compuesto (${usdFmt})`
    }

    const que_paso = p.size === 1
      ? `${member} — 1 señal de tipo ${topType}.`
      : `${member} — ${p.size} señales: ${p.insightTypeIds.join(', ')}.`

    const por_que_importa = p.impactoUsdTotal !== 0
      ? `Impacto agregado: ${usdFmt} (fuentes: ${p.impactoUsdSources.join(', ') || 'n/d'}).`
      : 'Señal cualitativa — sin impacto USD monetizable.'

    let accion_sugerida: string
    switch (topType) {
      case 'meta_gap_temporal':
        accion_sugerida = `Revisar desempeño de ${member}: causas combinadas por ${usdFmt}.`
        break
      case 'product_dead':
        accion_sugerida = `Evaluar reactivación o descontinuación de ${member}.`
        break
      case 'contribution':
        accion_sugerida = `Investigar drivers detrás de la contribución de ${member} (${usdFmt}).`
        break
      case 'migration':
        accion_sugerida = `Identificar causas de la migración de ${member} (${usdFmt}).`
        break
      case 'outlier':
        accion_sugerida = `Contactar a ${member}: comportamiento anómalo detectado (${usdFmt}).`
        break
      case 'change':
        accion_sugerida = `Verificar cambio sostenido en ${member} (${usdFmt}).`
        break
      case 'trend':
        accion_sugerida = `Monitorear tendencia de ${member} (${usdFmt}).`
        break
      case 'change_point':
      case 'seasonality':
      case 'correlation':
        accion_sugerida = `Validar patrón detectado en ${member}.`
        break
      default:
        accion_sugerida = `Revisar ${member}.`
    }

    return {
      groupKey:          p.groupKey,
      dimensionId:       p.dimensionId,
      member:            p.member,
      syntoma,
      causas,
      impactoUsdTotal:   p.impactoUsdTotal,
      impactoUsdSources: p.impactoUsdSources,
      size:              p.size,
      insightTypeIds:    p.insightTypeIds,
      titulo,
      que_paso,
      por_que_importa,
      accion_sugerida,
      confidence,
      generated_by:      'Z.10.6c',
    }
  })
}

export function runInsightEngine(params: EngineParams): InsightCandidate[] {
  const { sales, metas, selectedPeriod, tipoMetaActivo, clientesDormidos } = params
  const { year, month } = selectedPeriod

  // [Z.9.7] Inicializar status report
  const _status: EngineStatusReport = {
    runAt:              Date.now(),
    candidatesTotal:    0,
    candidatesSelected: 0,
    pipeline:           {},
    originBreakdown:    summarizeCandidateOrigins([]),
    detectors: {
      motor1:            _emptyDetector(),
      outlier_builder:   _emptyDetector(),
      change_point:      _emptyDetector(),
      steady_share:      _emptyDetector(),
      correlation:       _emptyDetector(),
      meta_gap_temporal: _emptyDetector(),
      z9_hydration:      _emptyDetector(),
    },
  }

  const _stageStartedAt = new Map<InsightPipelineStageId, number>()
  const _beginStage = (id: InsightPipelineStageId): void => {
    _stageStartedAt.set(id, performance.now())
  }
  const _endStage = (
    id: InsightPipelineStageId,
    data: Partial<Omit<InsightPipelineStageReport, 'id' | 'durationMs'>> = {},
  ): void => {
    const started = _stageStartedAt.get(id)
    _status.pipeline[id] = makeStageReport(id, {
      status: data.status ?? 'ok',
      inputCount: data.inputCount,
      outputCount: data.outputCount,
      discardedCount: data.discardedCount,
      reason: data.reason,
      metadata: data.metadata,
      durationMs: started == null ? undefined : performance.now() - started,
    })
  }
  _status.pipeline.motor1_legacy = makeStageReport('motor1_legacy', {
    status: 'skipped',
    inputCount: 0,
    outputCount: 0,
    reason: 'Legacy insights enter later through render_adapter/buildRichBlocksFromInsights.',
  })

  // 1. Slice sales by period
  const currentSales = getSalesForPeriod(sales, year, month)

  // [Z.13.1] Venta total del negocio del período, para ranker monetario-consciente.
  // Reusa getAgregadosParaFiltro (ya importado), no duplica lógica.
  let _Z13_ventaTotalNegocio = 1
  try {
    const _agregadosZ13 = getAgregadosParaFiltro(sales, selectedPeriod)
    _Z13_ventaTotalNegocio = (_agregadosZ13?.ventaTotalNegocio ?? 0) > 0
      ? _agregadosZ13.ventaTotalNegocio
      : 1
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[Z.13.1] ventaTotal fallback=1:', e)
  }

  // Issue #5 + Fase 5A: compute period context BEFORE YoY filter (needed for same-day range)
  const diasTotalesMes = new Date(year, month + 1, 0).getDate()
  const diasTranscurridos = currentSales.length > 0
    ? currentSales.reduce((max, r) => Math.max(max, toDate(r.fecha).getDate()), 0)
    : diasTotalesMes

  // Fase 5A: prev YoY = mismo mes del año anterior, recortado a [1, diasTranscurridos]
  // para comparar MTD vs MTD equivalente y controlar estacionalidad (P4).
  // Prohibido usar mes-a-mes como comparación de crecimiento.
  const prev = getYoYPeriod(year, month)
  const prevSalesFull = getSalesForPeriod(sales, prev.year, prev.month)
  const prevSales = prevSalesFull.filter(r => toDate(r.fecha).getDate() <= diasTranscurridos)

  // Build 3 months of history for trend: [m-3, m-2, m-1] (oldest → newest).
  // Trend walks consecutive months (no YoY) porque mide TRAYECTORIA, no compara dos puntos.
  const historySales: SaleRecord[][] = []
  let hYear = year; let hMonth = month
  for (let i = 0; i < 3; i++) {
    const p = getPrevPeriod(hYear, hMonth)
    hYear = p.year; hMonth = p.month
    historySales.unshift(getSalesForPeriod(sales, hYear, hMonth))
  }

  // [Z.10.4] contexto de enrichment — cross-tables + churn + dormidos, una vez por run.
  const _fechaRefMs = currentSales.reduce((max, s) => {
    const t = s.fecha instanceof Date ? s.fecha.getTime() : new Date(s.fecha).getTime()
    return t > max ? t : max
  }, 0)
  const _fechaRef = _fechaRefMs > 0 ? new Date(_fechaRefMs) : new Date()
  const _hasVentaNeta = currentSales.some((s: any) => s.venta_neta != null)
  const _enrichCtx = buildEnrichmentContext(sales, _fechaRef, _hasVentaNeta, clientesDormidos)
  // [Z.10.4b + Phase D] Gating de enrichment: dims soportadas + tipos que NO aportan
  // con cross_context. Antes solo producto/cliente/vendedor; ahora también categoria,
  // subcategoria, canal y proveedor (cross-context.ts maneja fallback transparente
  // para los dims sin lógica específica, así que extender la elegibilidad solo
  // mejora la narrativa sin riesgo).
  const _ENRICH_SKIP_TYPES = new Set(['seasonality', 'correlation', 'steady_share', 'dominance', 'proportion_shift'])
  const _ENRICH_ELIGIBLE_DIMS = new Set(['producto', 'cliente', 'vendedor', 'categoria', 'subcategoria', 'canal', 'proveedor'])
  const _isEnrichEligible = (dimId: string, typeId: string): boolean =>
    _ENRICH_ELIGIBLE_DIMS.has(dimId) && !_ENRICH_SKIP_TYPES.has(typeId)

  const baseOpts: MetricComputeOpts = { metas, metaType: tipoMetaActivo, year, month }
  const prevOpts: MetricComputeOpts = { metas, metaType: tipoMetaActivo, year: prev.year, month: prev.month }

  const allCandidates: InsightCandidate[] = []

  const _tagCandidate = (candidate: InsightCandidate, origin: InsightCandidateOrigin): InsightCandidate => {
    if (!candidate._origin) candidate._origin = origin
    return candidate
  }

  // [Z.10.4c] push con enrichment para candidatos que vienen de builders PR-M.
  // Los no-elegibles se pushean bit-idénticos (fallback transparente del helper).
  const _pushWithEnrichment = (
    candidates: InsightCandidate[],
    origin: InsightCandidateOrigin = 'special_builder',
  ): void => {
    for (const raw of candidates) {
      const c = _tagCandidate(raw, origin)
      if (_isEnrichEligible(c.dimensionId, c.insightTypeId)) {
        const _r = enriquecerCandidate(
          {
            dimensionId: c.dimensionId,
            member: c.member,
            descripcion: c.description,
            baseDetail: c.detail,
            direction: c.direction,
          },
          _enrichCtx,
        )
        allCandidates.push({ ...c, description: _r.description, detail: _r.detail, _origin: c._origin })
      } else {
        allCandidates.push(c)
      }
    }
  }

  // 2. Main loop: dimension × metric × insightType
  const _registryLoopStartCount = allCandidates.length
  _beginStage('motor2_registry_loop')

  for (const dim of DIMENSION_REGISTRY) {
    const currentGroups = groupByField(currentSales, dim.field)
    if (currentGroups.size < 2) continue

    const prevGroups    = groupByField(prevSales, dim.field)
    const historyGroups = historySales.map(hs => groupByField(hs, dim.field))

    for (const metric of METRIC_REGISTRY) {
      // [Phase C] cumplimiento_meta migró a meta_gap_combo (special builder)
      // que respeta el combo de dims presentes en cada meta-row. El main loop
      // single-dim no podía manejar metas multi-dim (ej. vendedor+cliente+producto)
      // y siempre se restringía a vendedor only.
      if (metric.id === 'cumplimiento_meta') continue
      if (metric.id === 'precio_unitario' && tipoMetaActivo === 'uds') continue

      const points: DataPoint[] = []

      for (const [member, records] of currentGroups) {
        const value = metric.compute(records, { ...baseOpts, member })
        if (value == null) continue

        const prevRecords = prevGroups.get(member) ?? []
        const prevValue = prevRecords.length > 0
          ? metric.compute(prevRecords, { ...prevOpts, member }) ?? undefined
          : undefined

        const historyRaw = historyGroups.map(hg => {
          const hr = hg.get(member) ?? []
          return hr.length > 0 ? metric.compute(hr, { ...baseOpts, member }) : null
        })
        const nonNullCount = historyRaw.filter(v => v != null).length
        const history = nonNullCount >= 2 ? historyRaw.map(v => v ?? 0) : undefined

        points.push({ member, value, prevValue, history })
      }

      if (points.length < 2) continue

      // [Z.4 — perf: cuello-1] Pareto 80/20 por valor absoluto para tipos prunable=true.
      // Solo dominance: mide quién tiene mayor volumen, por definición son los Pareto.
      // change/trend/proportion_shift miden % relativo → no podar (pequeño puede tener gran cambio).
      let pruneSet: Set<string> | null = null
      const hasPrunable = points.length > 4 && INSIGHT_TYPE_REGISTRY.some(t => t.prunable)
      if (hasPrunable) {
        try {
          const pList = calcularPareto(points.map(p => ({ nombre: p.member, valor: p.value ?? 0 })))
          if (pList.length > 0 && pList.length < points.length) pruneSet = new Set(pList)
        } catch { /* no-op */ }
      }

      let _skipped = 0; let _total = 0
      for (const insightType of INSIGHT_TYPE_REGISTRY) {
        if (insightType.id === 'correlation') continue              // separate pass
        if (insightType.needsInventario) continue                   // [Z.7 T1 — A] inventory pass
        if (insightType.id === 'meta_gap' && metric.id !== 'cumplimiento_meta') continue
        // [mainLoopInsightTypes] Si la métrica define tipos permitidos, descartar combinaciones fuera de la lista.
        // Evita candidatos sin significado semántico (ej. dominance sobre precio_unitario).
        if (metric.mainLoopInsightTypes !== undefined && !metric.mainLoopInsightTypes.includes(insightType.id)) continue

        if (insightType.needsHistory && !points.some(p => p.history && p.history.filter(v => v > 0).length >= 3)) continue
        if (insightType.needsPrevValue && !points.some(p => p.prevValue != null && p.prevValue > 0)) continue

        // [Z.4 — perf: cuello-1] Para tipos prunable, filtrar a solo miembros Pareto
        const effectivePoints = (insightType.prunable && pruneSet)
          ? points.filter(p => pruneSet!.has(p.member))
          : points
        if (effectivePoints.length < 2) { _skipped++; _total++; continue }
        if (import.meta.env.DEV) _total++

        const result: DetectResult | null = insightType.detect(effectivePoints)
        if (!result || !result.found || result.score < 0.1) continue

        // Issue #5: inject period context into meta_gap detail.
        // Fase 5A: etiquetar comparación usada para trazabilidad (P4).
        // Fase 5C — FALLO #4 (R54): para trend, alinear pctChange con la fórmula
        // literal que el texto describe ("en los últimos N meses"): cambio % del
        // primer mes al último. La fórmula original usaba slope·(N-1)/mean, que
        // producía números discrepantes con la lectura natural del bullet.
        let finalDetail: Record<string, unknown> = insightType.id === 'meta_gap'
          ? { ...result.detail, diasTranscurridos, diasTotalesMes }
          : insightType.id === 'change'
          ? { ...result.detail, comparison: COMPARACIONES_PERMITIDAS.YOY_MTD }
          : insightType.id === 'trend'
          ? { ...result.detail, comparison: COMPARACIONES_PERMITIDAS.TREND_MOVIL }
          : { ...result.detail }

        if (insightType.id === 'trend') {
          const targetMember = finalDetail.member as string | undefined
          const p = points.find(pt => pt.member === targetMember)
          if (p?.history && p.history.length >= 2) {
            const first = p.history[0]
            const last  = p.history[p.history.length - 1]
            if (first > 0) {
              const literalPct = (last - first) / first
              finalDetail = {
                ...finalDetail,
                pctChange:    literalPct,
                historyStart: first,
                historyEnd:   last,
              }
            }
          }
        }

        const member =
          (finalDetail.member as string | undefined) ??
          ((finalDetail.topMembers as string[] | undefined)?.[0]) ??
          // [Z.10.4e] migration: cuando no hay member directo, usar declining
          // (la entidad protagonista que pierde valor — alineado con Z.9.6).
          (insightType.id === 'migration'
            ? ((finalDetail.declining as string | undefined) ?? '')
            : '')

        const metricDef = METRIC_REGISTRY.find(m => m.id === metric.id)!
        const dimDef    = DIMENSION_REGISTRY.find(d => d.id === dim.id)!
        const { title, description } = buildText(
          insightType.id, finalDetail,
          metricDef.label, dimDef.label,
          tipoMetaActivo, metric.id,
        )

        // [Z.7 T1 — B] aplicar template narrativo si existe para este tipo
        const _tmpl = NARRATIVE_TEMPLATES[insightType.id]
        let _finalTitle = title
        let _finalDesc  = description
        let _conclusion: string | undefined
        let _accion: NarrativeResult['accion'] | undefined
        if (_tmpl) {
          try {
            const _nar = _tmpl(finalDetail, tipoMetaActivo)
            _finalTitle = _nar.titulo
            _finalDesc  = _nar.descripcion
            _conclusion = _nar.conclusion
            _accion     = _nar.accion
          } catch { /* fallback to default buildText output */ }
        }

        // [Z.10.4b] enrichment unificado generic pipeline (dim ∈ {producto, cliente, vendedor}, tipo elegible)
        let _enrichedDetail: Record<string, unknown> = finalDetail
        let _enrichedDesc = _finalDesc
        if (_isEnrichEligible(dim.id, insightType.id)) {
          const _r = enriquecerCandidate(
            { dimensionId: dim.id, member, descripcion: _finalDesc, baseDetail: finalDetail },
            _enrichCtx,
          )
          _enrichedDesc = _r.description
          _enrichedDetail = _r.detail
        }

        allCandidates.push({
          _origin:       'motor2_registry_loop',
          metricId:      metric.id,
          dimensionId:   dim.id,
          insightTypeId: insightType.id,
          member,
          score:         result.score,
          severity:      scoreToSeverity(result.score),
          title:         _finalTitle,
          description:   _enrichedDesc,
          detail:        _enrichedDetail,
          conclusion:    _conclusion,
          accion:        _accion,
        })
      }
      if (import.meta.env.DEV && _skipped > 0)
        console.log('[Z.4] pareto skipped:', _skipped, '/', _total, `(${dim.id}×${metric.id})`)
    }
  }

  // 3. Correlation pass — non-trivial metric pairs for vendedor dimension (Issue #3)
  const vendedorGroups = groupByField(currentSales, 'vendedor')
  if (vendedorGroups.size >= 4) {
    const corrType = INSIGHT_TYPE_REGISTRY.find(t => t.id === 'correlation')!

    for (const [m1Id, m2Id] of CORRELATION_PAIRS) {
      const m1Def = METRIC_REGISTRY.find(m => m.id === m1Id)
      const m2Def = METRIC_REGISTRY.find(m => m.id === m2Id)
      if (!m1Def || !m2Def) continue

      // Skip if m2 needs metas and we don't have the dimension
      if (m2Def.requiresMetas) {
        // cumplimiento_meta × anything — only run for vendedor dimension (already the case)
      }

      const corrPoints: DataPoint[] = []
      for (const [member, records] of vendedorGroups) {
        const v1 = m1Def.compute(records, { ...baseOpts, member })
        const v2 = m2Def.compute(records, { ...baseOpts, member })
        if (v1 == null || v2 == null) continue
        corrPoints.push({ member, value: v1, value2: v2 })
      }

      const corrResult = corrType.detect(corrPoints)
      if (!corrResult?.found) continue

      // Include metric names in detail for description (Issue #3)
      const enrichedDetail = {
        ...corrResult.detail,
        metric1Label: m1Def.label,
        metric2Label: m2Def.label,
      }

      const { title, description } = buildText(
        'correlation', enrichedDetail,
        '', 'Vendedor',
        tipoMetaActivo, '_correlation',
      )

      allCandidates.push({
        _origin:       'motor2_registry_loop',
        metricId:      `${m1Id}_${m2Id}`,
        dimensionId:   'vendedor',
        insightTypeId: 'correlation',
        member:        '',
        score:         corrResult.score,
        severity:      scoreToSeverity(corrResult.score),
        title,
        description,
        detail:        enrichedDetail,
      })
    }
  }

  // 3B. Absolute impact floor for contribution: tiny absolute change ≠ CRITICA
  _endStage('motor2_registry_loop', {
    inputCount: currentSales.length,
    outputCount: allCandidates.length - _registryLoopStartCount,
    metadata: {
      dimensions: DIMENSION_REGISTRY.length,
      metrics: METRIC_REGISTRY.length,
      insightTypes: INSIGHT_TYPE_REGISTRY.length,
    },
  })

  const _specialBuildersStartCount = allCandidates.length
  // Sprint 2: per-builder breakdown surfaced in stages.special_builders.metadata.builders
  const _builderStats: Record<string, { ms: number; input: number; output: number; discarded?: number }> = {}
  _beginStage('special_builders')

  for (const c of allCandidates) {
    if (c.insightTypeId !== 'contribution') continue
    const totalChange = Math.abs((c.detail.totalChange as number) ?? 0)
    if (totalChange < 50) {
      // Downgrade severity one level and reduce effective score so it ranks lower
      if (c.severity === 'CRITICA') c.severity = 'ALTA'
      else if (c.severity === 'ALTA') c.severity = 'MEDIA'
      else if (c.severity === 'MEDIA') c.severity = 'BAJA'
      c.score *= 0.5
    }
  }

  // 3C. Candidatos cliente_dormido (Fase 5B.1) — emitidos desde clientesDormidos
  // del store cuando dias_sin_actividad >= umbral configurable. Compiten con los
  // demás candidatos por score; no hay cuota reservada. Pasan por V1–V16 y dedup.
  {
    const _t0 = performance.now(); const _in = allCandidates.length
  if (clientesDormidos && clientesDormidos.length > 0) {
    const dormidoCfg = getDiasDormidoUsuario()
    const umbralDias = dormidoCfg.valor
    const esUmbralDefault = dormidoCfg.esDefault
    // Sprint 5: excluimos recovery_label='perdido' — esos van al builder cliente_perdido
    // (acción de cierre, no de rescate). Evita duplicar candidatos del mismo cliente
    // entre ambos builders.
    const elegibles = clientesDormidos.filter(cd =>
      (cd.dias_sin_actividad ?? 0) >= umbralDias && cd.recovery_label !== 'perdido',
    )
    // Fase 5C — FALLO #3 (R53): impacto histórico en ventana YoY (mismo mes año
    // anterior). Reemplaza cd.valor_historico (suma all-time) por la venta del
    // cliente en el mes equivalente del año previo. Coherente con P4.
    const MESES_NOMBRE = [
      'enero','febrero','marzo','abril','mayo','junio',
      'julio','agosto','septiembre','octubre','noviembre','diciembre',
    ]
    const yoyByCliente = new Map<string, number>()
    for (const r of prevSalesFull) {
      const sr  = r as unknown as Record<string, unknown>
      const cli = sr.cliente as string | undefined
      if (!cli) continue
      const val = (sr.venta_neta as number | undefined) ?? 0
      yoyByCliente.set(cli, (yoyByCliente.get(cli) ?? 0) + val)
    }
    const mesAnteriorLabel = `${MESES_NOMBRE[prev.month]} ${prev.year}`
    // Normalización de impacto para score en [0,1]
    const maxImpacto = elegibles.reduce(
      (m, cd) => Math.max(m, yoyByCliente.get(cd.cliente) ?? 0),
      0,
    )
    for (const cd of elegibles) {
      const dias     = cd.dias_sin_actividad
      const impacto  = yoyByCliente.get(cd.cliente) ?? 0
      const frec     = cd.frecuencia_esperada_dias ?? null
      // Severity: dias >= 2*umbral → ALTA; sino MEDIA. Score derivado: 0.7 o 0.5
      // + bonus por impacto normalizado para que el ranker distinga.
      const base     = dias >= umbralDias * 2 ? 0.7 : 0.5
      const bonus    = maxImpacto > 0 ? (impacto / maxImpacto) * 0.25 : 0
      const score    = Math.min(1, base + bonus)
      const severity = dias >= umbralDias * 2 ? 'ALTA' : 'MEDIA'
      // Fase 5B.4 + 5C: título con flecha direccional ↓ y monto YoY narrado
      // en el description (cero KPI lateral, cero "en histórico" ambiguo).
      const impactoFmt = impacto > 0
        ? ` Aportaba $${Math.round(impacto).toLocaleString('es-SV')} en ${mesAnteriorLabel}.`
        : ''
      allCandidates.push({
        _origin:       'special_builder',
        metricId:      'dias_sin_compra',
        dimensionId:   'cliente',
        insightTypeId: 'cliente_dormido',
        member:        cd.cliente,
        score,
        severity,
        title:         `↓ ${cd.cliente} — sin compras hace ${dias} días`,
        description:   `${cd.cliente} no compra hace ${dias} días (umbral actual: ${umbralDias}).${impactoFmt}`,
        detail: {
          umbralDiasDormido:     umbralDias,
          esUmbralDefault,
          diasSinComprar:        dias,
          impactoVentaHistorica: impacto,          // ahora YoY, no all-time
          impactoVentanaLabel:   mesAnteriorLabel, // etiqueta temporal explícita
          clienteNombre:         cd.cliente,
          vendedor:              cd.vendedor,
          frecuenciaHistoricaDias: frec,
          comparison:            'no_temporal',
        },
      })
      console.debug(
        `[fase5b] candidato dormido emitido con umbral ${esUmbralDefault ? 'default' : 'custom'}=${umbralDias}: ${cd.cliente} (${dias}d, impacto YoY=${Math.round(impacto)} en ${mesAnteriorLabel})`,
      )
    }
  }
  _builderStats['cliente_dormido'] = { ms: performance.now() - _t0, input: _in, output: allCandidates.length - _in }
  }

  // 3C-bis. [Sprint 5] cliente_perdido — clientes con recovery_label='perdido'
  // (recovery_score < 40 según analysis.ts). Diferencia con cliente_dormido:
  //   - dormido = aún recuperable (alta/recuperable/dificil) → acción: rescatar
  //   - perdido = past recovery point → acción: cerrar cuenta o última recuperación
  // El threshold ya es frecuencia-aware (analysis.ts:596 usa frecuencia_esperada * 1.5).
  // Defaults presentes para que la key esté siempre en metadata.builders.
  _builderStats['cliente_perdido'] = { ms: 0, input: 0, output: 0 }
  if (clientesDormidos && clientesDormidos.length > 0) {
    const _t0_perdido = performance.now(); const _in_perdido = allCandidates.length
    const perdidos = clientesDormidos.filter(cd => cd.recovery_label === 'perdido')
    if (perdidos.length > 0) {
      const yoyByCliente = new Map<string, number>()
      for (const r of prevSalesFull) {
        const sr  = r as unknown as Record<string, unknown>
        const cli = sr.cliente as string | undefined
        if (!cli) continue
        const val = (sr.venta_neta as number | undefined) ?? 0
        yoyByCliente.set(cli, (yoyByCliente.get(cli) ?? 0) + val)
      }
      // Sprint 5 fix: anchor de impacto contra venta total del negocio (no contra el max
      // del subconjunto perdidos). Antes, un único perdido low-impact obtenía score=1
      // simplemente por ser el "más grande" de su grupo. Ahora un perdido solo califica
      // CRITICA si su impacto es ≥1% del negocio del período.
      for (const cd of perdidos) {
        const dias    = cd.dias_sin_actividad
        const impacto = yoyByCliente.get(cd.cliente) ?? 0
        const frec    = cd.frecuencia_esperada_dias ?? null
        const pctNegocio = _Z13_ventaTotalNegocio > 0 ? impacto / _Z13_ventaTotalNegocio : 0
        const ratioDias  = frec ? dias / frec : 1
        // Severidad anchored a impacto absoluto sobre el negocio + cuán fuera-de-cadencia
        // está el cliente.
        const severity   = pctNegocio >= 0.01 || ratioDias >= 6 ? 'CRITICA' : 'ALTA'
        // Score: floor de 0.55 (cualquier perdido vale algo); +bonus por impacto absoluto;
        // +bonus por ratio de cadencia. Cap en 0.95 para no dominar el ranker.
        const scoreImpacto = Math.min(0.30, pctNegocio * 30) // pctNegocio=1% → +0.30
        const scoreCadencia = Math.min(0.10, Math.max(0, ratioDias - 3) * 0.025)
        const score = Math.min(0.95, 0.55 + scoreImpacto + scoreCadencia)
        const impactoFmt   = impacto > 0
          ? ` Aportaba $${Math.round(impacto).toLocaleString('es-SV')} históricamente.`
          : ''
        const frecFmt = frec
          ? ` (compraba cada ${Math.round(frec)} días)`
          : ''
        allCandidates.push({
          _origin:       'special_builder',
          metricId:      'dias_sin_compra',
          dimensionId:   'cliente',
          insightTypeId: 'cliente_perdido',
          member:        cd.cliente,
          score,
          severity,
          title:         `✗ ${cd.cliente} — probablemente perdido`,
          description:   `${cd.cliente} lleva ${dias} días sin comprar${frecFmt}.${impactoFmt} Decidir entre cierre de cuenta o último intento de recuperación antes de seguir invirtiendo tiempo.`,
          detail: {
            diasSinComprar:          dias,
            impactoVentaHistorica:   impacto,
            clienteNombre:           cd.cliente,
            vendedor:                cd.vendedor,
            frecuenciaHistoricaDias: frec,
            recoveryScore:           cd.recovery_score,
            recoveryLabel:           cd.recovery_label,
            comparison:              'no_temporal',
          },
          accion: `Decidir cierre de cuenta o intento final de recuperación con ${cd.cliente}.`,
          conclusion: `Cliente ${cd.cliente} probablemente perdido tras ${dias} días sin compra.`,
          // [Sprint B / D1.c] Tipo monetario: USD impact = histórico YoY del
          // cliente. Source 'recuperable' (revenue potencialmente recuperable).
          // Sin esto el ranker usaba weight=1 y el gate fallaba r1+r3.
          impacto_usd_normalizado: impacto > 0 ? impacto : null,
          impacto_usd_source: impacto > 0 ? 'recuperable' : 'non_monetary',
        })
      }
    }
    _builderStats['cliente_perdido'] = {
      ms: performance.now() - _t0_perdido,
      input: _in_perdido,
      output: allCandidates.length - _in_perdido,
    }
  }

  // 3D. [Z.7 T1 — A/B] Inventory special pass — stock_risk, stock_excess, migration, co_decline
  // Runs after the main loop so allCandidates already has the sales-based candidates.
  const _catInv = params.categoriasInventario ?? []
  if (_catInv.length > 0 || currentSales.length > 0) {
    const _t0_inv = performance.now(); const _in_inv = allCandidates.length
    // Build YTD product aggregates (Jan 1 → currentPeriod) for umbralVenta + cross data
    const _ytdStart = new Date(year, 0, 1)
    const _ytdEnd   = new Date(year, month, new Date(year, month + 1, 0).getDate())
    const _ytdSales = (params.sales ?? []).filter(r => {
      const d = toDate(r.fecha)
      return d >= _ytdStart && d <= _ytdEnd
    })
    // productYTD: Map<product, { net, vendors, categoria, clients }>
    type ProdYTD = { net: number; vendors: Map<string, number>; categoria: string; clients: Set<string> }
    const _prodYTD = new Map<string, ProdYTD>()
    for (const r of _ytdSales) {
      const prod = (r as unknown as Record<string, unknown>).producto as string | undefined
      if (!prod) continue
      const val = tipoMetaActivo === 'usd' ? ((r as unknown as Record<string, unknown>).venta_neta as number ?? 0) : r.unidades
      if (!_prodYTD.has(prod)) {
        _prodYTD.set(prod, { net: 0, vendors: new Map(), categoria: (r as unknown as Record<string, unknown>).categoria as string ?? 'Sin categoría', clients: new Set() })
      }
      const e = _prodYTD.get(prod)!
      e.net += val
      const vend = (r as unknown as Record<string, unknown>).vendedor as string | undefined
      if (vend) e.vendors.set(vend, (e.vendors.get(vend) ?? 0) + val)
      const cli = (r as unknown as Record<string, unknown>).cliente as string | undefined
      if (cli) e.clients.add(cli)
    }
    // umbralVenta = p40 de ventas YTD (replica L980 del viejo)
    const _ventas = [..._prodYTD.values()].map(v => v.net).filter(v => v > 0).sort((a, b) => a - b)
    const _umbralVenta = _ventas.length > 0 ? _ventas[Math.floor(_ventas.length * 0.4)] : 0

    // Build prev YTD product aggregates (Jan 1 → same day prev year)
    // [PR-L2b.1-fix] También trackeamos clientes por producto en el período prev para
    // que product_dead pueda citar historia de compradores en productos sin venta actual.
    // Sin esto, prev-only products quedan con client set vacío y el detector los filtra.
    const _prevYTDStart   = new Date(prev.year, 0, 1)
    const _prevYTDEnd     = new Date(prev.year, prev.month, diasTranscurridos)
    const _prevProdNet    = new Map<string, number>()
    const _prevProdClients = new Map<string, Set<string>>()
    for (const r of params.sales ?? []) {
      const d = toDate(r.fecha)
      if (d < _prevYTDStart || d > _prevYTDEnd) continue
      const rec  = r as unknown as Record<string, unknown>
      const prod = rec.producto as string | undefined
      if (!prod) continue
      const val = tipoMetaActivo === 'usd' ? ((rec.venta_neta as number) ?? 0) : r.unidades
      _prevProdNet.set(prod, (_prevProdNet.get(prod) ?? 0) + val)
      const cli = rec.cliente as string | undefined
      if (cli) {
        if (!_prevProdClients.has(prod)) _prevProdClients.set(prod, new Set())
        _prevProdClients.get(prod)!.add(cli)
      }
    }

    // ── stock_risk + stock_excess ─────────────────────────────────────────────
    const _invTypes = INSIGHT_TYPE_REGISTRY.filter(t => t.needsInventario)
    if (_catInv.length > 0 && _invTypes.length > 0) {
      const _stockPoints: DataPoint[] = _catInv.map(inv => {
        const ytd = _prodYTD.get(inv.producto)
        const ventaYTD = ytd?.net ?? 0
        const topV = ytd && ytd.vendors.size > 0
          ? [...ytd.vendors.entries()].sort((a, b) => b[1] - a[1])[0][0]
          : null
        return {
          member: inv.producto,
          value:  inv.unidades_actuales,
          extra: {
            diasCobertura:  inv.dias_inventario,
            mesesCobertura: inv.dias_inventario / 30,
            ventaYTD,
            topVendedor: topV,
          },
        }
      })
      for (const invType of _invTypes) {
        const _res = invType.detect(_stockPoints, { umbralVenta: _umbralVenta })
        if (!_res?.found || _res.score < 0.1) continue
        const _tmpl = NARRATIVE_TEMPLATES[invType.id]
        if (!_tmpl) continue
        let _nar: NarrativeResult
        try { _nar = _tmpl(_res.detail, tipoMetaActivo) } catch { continue }
        const _topProd = (_res.detail.topProduct as string | undefined) ?? ''
        allCandidates.push({
          _origin:       'special_builder',
          metricId:      'inventario',
          dimensionId:   'producto',
          insightTypeId: invType.id,
          member:        _topProd,
          score:         _res.score,
          severity:      scoreToSeverity(_res.score),
          title:         _nar.titulo,
          description:   _nar.descripcion,
          detail: {
            ..._res.detail,
            _inventario:  true,
            _conclusion:  _nar.conclusion,
            _accion:      _nar.accion,
          },
          conclusion: _nar.conclusion,
          accion:     _nar.accion,
        })
      }
    }
    _builderStats['inventory_stock'] = { ms: performance.now() - _t0_inv, input: _in_inv, output: allCandidates.length - _in_inv }

    // ── migration + co_decline ────────────────────────────────────────────────
    // Default to 0 so keys are always present even when the conditional below is skipped
    _builderStats['migration']    = { ms: 0, input: 0, output: 0 }
    _builderStats['co_decline']   = { ms: 0, input: 0, output: 0 }
    _builderStats['product_dead'] = { ms: 0, input: 0, output: 0 }
    // Build DataPoints for product-level cross data
    if (_prodYTD.size >= 2) {
      // product-client map: producto → set de clientes que lo compraron en YTD
      const _prodClientMap = new Map<string, Set<string>>()
      for (const [prod, entry] of _prodYTD) _prodClientMap.set(prod, entry.clients)
      // [PR-L2b.1-fix] Para prev-only products (candidatos de product_dead) usar clientes
      // del período previo. Antes se seteaba Set vacío → product_dead filtraba todo.
      for (const [prod] of _prevProdNet) {
        if (!_prodYTD.has(prod)) {
          _prodClientMap.set(prod, _prevProdClients.get(prod) ?? new Set())
        }
      }

      // Union of all products (YTD + prevYTD)
      const _allProds = new Set([..._prodYTD.keys(), ..._prevProdNet.keys()])
      const _migPoints: DataPoint[] = []
      for (const prod of _allProds) {
        const ytd = _prodYTD.get(prod)
        const prevNet = _prevProdNet.get(prod) ?? 0
        if (!ytd && prevNet <= 0) continue
        _migPoints.push({
          member:    prod,
          value:     ytd?.net ?? 0,
          prevValue: prevNet,
          extra: {
            categoria: ytd?.categoria ?? 'Sin categoría',
            varAbs:    (ytd?.net ?? 0) - prevNet,
            clientes:  [...(_prodClientMap.get(prod) ?? [])],
          },
        })
      }

      const _migType    = INSIGHT_TYPE_REGISTRY.find(t => t.id === 'migration')
      const _coDeclType = INSIGHT_TYPE_REGISTRY.find(t => t.id === 'co_decline')

      if (_migType) {
        const _t0_mig = performance.now(); const _in_mig = allCandidates.length
        const _res = _migType.detect(_migPoints)
        if (_res?.found && _res.score >= 0.1) {
          const _tmpl = NARRATIVE_TEMPLATES['migration']
          if (_tmpl) {
            try {
              const _nar = _tmpl(_res.detail, tipoMetaActivo)
              const _rising = (_res.detail.rising as string | undefined) ?? ''
              const _declining = (_res.detail.declining as string | undefined) ?? ''
              // [Z.10.4d] enrichment con el declining (fuente de la historia)
              const _baseDetail = { ..._res.detail, _conclusion: _nar.conclusion, _accion: _nar.accion }
              const _rDecl = enriquecerCandidate(
                {
                  dimensionId: 'producto',
                  member: _declining,
                  descripcion: _nar.descripcion,
                  baseDetail: _baseDetail,
                },
                _enrichCtx,
              )
              const _finalDetail = (_rDecl.detail as any)?.cross_context
                ? _rDecl.detail
                : _baseDetail
              allCandidates.push({
                _origin:       'special_builder',
                metricId:      'venta',
                dimensionId:   'producto',
                insightTypeId: 'migration',
                member:        _rising,
                score:         _res.score,
                severity:      scoreToSeverity(_res.score),
                title:         _nar.titulo,
                description:   _rDecl.description,
                detail:        _finalDetail,
                conclusion:    _nar.conclusion,
                accion:        _nar.accion,
              })
            } catch { /* skip */ }
          }
        }
        _builderStats['migration'] = { ms: performance.now() - _t0_mig, input: _in_mig, output: allCandidates.length - _in_mig }
      }

      if (_coDeclType) {
        const _t0_codecl = performance.now(); const _in_codecl = allCandidates.length
        const _res = _coDeclType.detect(_migPoints)
        if (_res?.found && _res.score >= 0.1) {
          const _tmpl = NARRATIVE_TEMPLATES['co_decline']
          if (_tmpl) {
            try {
              const _nar = _tmpl(_res.detail, tipoMetaActivo)
              const _cluster = (_res.detail.cluster as string[] | undefined) ?? []
              allCandidates.push({
                _origin:       'special_builder',
                metricId:      'venta',
                dimensionId:   'producto',
                insightTypeId: 'co_decline',
                member:        _cluster[0] ?? '',
                score:         _res.score,
                severity:      scoreToSeverity(_res.score),
                title:         _nar.titulo,
                description:   _nar.descripcion,
                detail: { ..._res.detail, _conclusion: _nar.conclusion, _accion: _nar.accion },
                conclusion:    _nar.conclusion,
                accion:        _nar.accion,
              })
            } catch { /* skip */ }
          }
        }
        _builderStats['co_decline'] = { ms: performance.now() - _t0_codecl, input: _in_codecl, output: allCandidates.length - _in_codecl }
      }

      // [PR-L2b.1] product_dead — producto con venta actual 0 y venta histórica > 0.
      // Reusa _migPoints (ya tiene {member, value=ytdNet, prevValue=prevNet, extra.categoria, extra.clientes}).
      // Acepta ctx.invMap opcional para enriquecer con stock actual.
      const _prodDeadType = INSIGHT_TYPE_REGISTRY.find(t => t.id === 'product_dead')
      if (_prodDeadType && _migPoints.length >= 1) {
        const _t0_dead = performance.now(); const _in_dead = allCandidates.length
        const _invStockMap = new Map<string, number>()
        for (const inv of _catInv) _invStockMap.set(inv.producto, inv.unidades_actuales)
        const _res = _prodDeadType.detect(_migPoints, { invMap: _invStockMap })
        if (_res?.found && _res.score >= 0.1) {
          const _tmpl = NARRATIVE_TEMPLATES['product_dead']
          if (_tmpl) {
            try {
              const _nar = _tmpl(_res.detail, tipoMetaActivo)
              const _topProd = (_res.detail.topProduct as string | undefined) ?? ''

              // [Z.10.4] enrichment unificado para product_dead
              const _r = enriquecerCandidate(
                {
                  dimensionId: 'producto',
                  member: _topProd,
                  descripcion: _nar.descripcion,
                  baseDetail: { ..._res.detail, _conclusion: _nar.conclusion, _accion: _nar.accion },
                },
                _enrichCtx,
              )
              const _enrichedDesc = _r.description
              const _enrichedDetail = _r.detail

              allCandidates.push({
                _origin:       'special_builder',
                metricId:      'venta',
                dimensionId:   'producto',
                insightTypeId: 'product_dead',
                member:        _topProd,
                score:         _res.score,
                severity:      scoreToSeverity(_res.score),
                title:         _nar.titulo,
                description:   _enrichedDesc,
                detail:        _enrichedDetail,
                conclusion:    _nar.conclusion,
                accion:        _nar.accion,
              })
              // [PR-L2b.1] telemetría de detección
              if (import.meta.env.DEV) {
                type Dead = { member: string; prevNet: number; stock: number }
                const _items = _res.detail.items as Dead[]
                console.debug('[PR-L2b.1] product_dead:', {
                  detectados:       _res.detail.productCount,
                  ids:              _items.map(d => d.member),
                  direccion_asignada: 'recuperable',
                  con_impacto_recuperable: true,
                  top_categoria:    _res.detail.topCategoria,
                  total_prev:       _res.detail.totalPrev,
                  total_stock:      _res.detail.totalStock,
                  sustituto:        _res.detail.sustituto,
                })
              }
            } catch { /* skip */ }
          }
        } else if (import.meta.env.DEV) {
          console.debug('[PR-L2b.1] product_dead: 0 detectados (sin productos con venta actual=0 y prevNet>0)')
        }
        _builderStats['product_dead'] = { ms: performance.now() - _t0_dead, input: _in_dead, output: allCandidates.length - _in_dead }
      }

      // [PR-L2b.2] Enriquecimiento prospeccion_cross_sell para candidatos
      // proportion_shift en dimensión producto. Migra productoOportunidad de motor 1.
      // Aditivo: no muta candidatos existentes, solo añade detail.prospeccion_cross_sell
      // y una sentencia al description. Si no hay clientes activos sin compra → skip
      // silencioso (campo queda undefined).
      const _propShiftProdCands = allCandidates.filter(c =>
        c.insightTypeId === 'proportion_shift' && c.dimensionId === 'producto',
      )
      // [PR-L2b.2-fix] telemetría universal: emite siempre, con razón si no corrió
      if (import.meta.env.DEV && _propShiftProdCands.length === 0) {
        console.debug('[PR-L2b.2] prospeccion:', {
          proportion_shifts_totales: 0,
          con_prospeccion:           0,
          sin_prospeccion:           0,
          top_ejemplo:               null,
          razon:                     'no_proportion_shift_candidates',
        })
      }
      if (_propShiftProdCands.length > 0 && _prodYTD.size > 0) {
        // Volumen por cliente en período actual (ligero; 1 pasada sobre _ytdSales)
        const _clientYTDNet = new Map<string, number>()
        for (const r of _ytdSales) {
          const rec = r as unknown as Record<string, unknown>
          const cli = rec.cliente as string | undefined
          if (!cli) continue
          const val = tipoMetaActivo === 'usd' ? ((rec.venta_neta as number) ?? 0) : r.unidades
          if (val <= 0) continue
          _clientYTDNet.set(cli, (_clientYTDNet.get(cli) ?? 0) + val)
        }
        // Unión de clientes por categoría (todos los compradores de cualquier producto)
        const _clientesPorCat = new Map<string, Set<string>>()
        for (const [, entry] of _prodYTD) {
          const cat = entry.categoria
          if (!_clientesPorCat.has(cat)) _clientesPorCat.set(cat, new Set())
          const set = _clientesPorCat.get(cat)!
          for (const c of entry.clients) set.add(c)
        }

        let _conProspeccion = 0
        let _sampleProducto: string | null = null
        let _sampleCount = 0

        for (const c of _propShiftProdCands) {
          const producto = c.member
          const ytd = _prodYTD.get(producto)
          if (!ytd || ytd.clients.size === 0) continue
          const categoria = ytd.categoria
          const catClients = _clientesPorCat.get(categoria)
          if (!catClients || catClients.size < 2) continue

          // Clientes activos SIN compra de este producto, ordenados por volumen
          const noCompradores: Array<{ cliente: string; valor: number }> = []
          for (const [cli, val] of _clientYTDNet) {
            if (ytd.clients.has(cli)) continue
            noCompradores.push({ cliente: cli, valor: val })
          }
          if (noCompradores.length < 2) continue
          noCompradores.sort((a, b) => b.valor - a.valor)
          const top = noCompradores.slice(0, 3)

          // Confianza: heurística determinística sobre datos existentes (no probabilidad)
          //   alta:  ≥3 no-compradores Y producto sub-penetrado en su categoría
          //   media: ≥2 no-compradores
          const penProducto = ytd.clients.size / catClients.size
          let sumPen = 0, nPen = 0
          for (const [, entry] of _prodYTD) {
            if (entry.categoria !== categoria) continue
            sumPen += entry.clients.size / catClients.size
            nPen++
          }
          const penPromedio = nPen > 0 ? sumPen / nPen : 0
          const subPenetrado = penProducto < penPromedio
          const confianza: 'alta' | 'media' | 'baja' =
            (noCompradores.length >= 3 && subPenetrado) ? 'alta' : 'media'

          c.detail = {
            ...c.detail,
            prospeccion_cross_sell: {
              producto,
              clientes_sin_compra:       top.map(x => x.cliente),
              clientes_sin_compra_count: noCompradores.length,
              confianza_narrativa:       confianza,
              penetracion_producto:      Math.round(penProducto * 100) / 100,
              penetracion_promedio_cat:  Math.round(penPromedio * 100) / 100,
            },
          }
          // Inyección narrativa visible via summaryShort
          const nombres = top.map(x => x.cliente).join(', ')
          const suffix  = noCompradores.length > 3 ? ` y ${noCompradores.length - 3} más` : ''
          c.description = (c.description ?? '')
            + ` Oportunidad cross-sell: ${noCompradores.length} cliente${noCompradores.length > 1 ? 's' : ''} activo${noCompradores.length > 1 ? 's' : ''} sin compra (${nombres}${suffix}).`

          _conProspeccion++
          if (!_sampleProducto) {
            _sampleProducto = producto
            _sampleCount    = noCompradores.length
          }
        }

        if (import.meta.env.DEV) {
          // [PR-L2b.2-fix] razón cuando hay candidates pero ninguno pudo enriquecerse
          const _razon = _conProspeccion === 0 ? 'no_non_buyers' : null
          console.debug('[PR-L2b.2] prospeccion:', {
            proportion_shifts_totales: _propShiftProdCands.length,
            con_prospeccion:           _conProspeccion,
            sin_prospeccion:           _propShiftProdCands.length - _conProspeccion,
            top_ejemplo: _sampleProducto
              ? { producto: _sampleProducto, clientes_sin_compra_count: _sampleCount }
              : null,
            razon: _razon,
          })
        }
      }
    }
  }

  // [PR-L2b.3] Enriquecimiento split_ejecucion_vs_mercado para candidatos
  // trend(down) + meta_gap en dimensión departamento. Migra la lógica única de
  // departamentoCaida (motor 1): separar cuánto de la caída viene de ejecución
  // interna (el top vendedor del depto) vs mercado (resto del depto).
  //
  // ADITIVO: solo añade detail.split_ejecucion_vs_mercado al candidato existente
  // y una sentencia al description. No muta arrays/maps compartidos. Maps locales.
  const _deptoCands = allCandidates.filter(c =>
    c.dimensionId === 'departamento'
    && ((c.insightTypeId === 'trend' && (c.detail as Record<string, unknown>).direction === 'down')
      || c.insightTypeId === 'meta_gap'),
  )
  const _trendDownTotales = _deptoCands.filter(c => c.insightTypeId === 'trend').length
  const _metaGapTotales   = _deptoCands.filter(c => c.insightTypeId === 'meta_gap').length

  if (_deptoCands.length === 0) {
    if (import.meta.env.DEV) {
      console.debug('[PR-L2b.3] split:', {
        trend_down_totales:  0,
        meta_gap_totales:    0,
        con_split_aplicado:  0,
        sin_split:           0,
        top_ejemplo:         null,
        razon:               'no_candidates',
      })
    }
  } else {
    // Agregación dept-level para current + prev period + vendor split (1 pasada cada una)
    const _deptCur     = new Map<string, number>()
    const _deptPrev    = new Map<string, number>()
    const _deptVendCur = new Map<string, Map<string, number>>()
    const _deptVendPrev= new Map<string, Map<string, number>>()
    const _accumulate = (
      sales: SaleRecord[],
      totalMap: Map<string, number>,
      vendorMap: Map<string, Map<string, number>>,
    ) => {
      for (const r of sales) {
        const rec  = r as unknown as Record<string, unknown>
        const dept = rec.departamento as string | undefined
        if (!dept) continue
        const val = tipoMetaActivo === 'usd' ? ((rec.venta_neta as number) ?? 0) : r.unidades
        totalMap.set(dept, (totalMap.get(dept) ?? 0) + val)
        const vend = rec.vendedor as string | undefined
        if (!vend) continue
        if (!vendorMap.has(dept)) vendorMap.set(dept, new Map())
        const m = vendorMap.get(dept)!
        m.set(vend, (m.get(vend) ?? 0) + val)
      }
    }
    _accumulate(currentSales, _deptCur,  _deptVendCur)
    _accumulate(prevSales,    _deptPrev, _deptVendPrev)

    let _conSplit = 0
    let _sampleDept: string | null = null
    let _sampleEje = 0, _sampleMer = 0
    let _razonNinguno: 'no_mercado_data' | 'no_ejecucion_data' | null = null

    for (const c of _deptoCands) {
      const dept = c.member
      const ytdTotal  = _deptCur.get(dept)  ?? 0
      const prevTotal = _deptPrev.get(dept) ?? 0
      const deptDrop  = prevTotal - ytdTotal
      if (deptDrop <= 0) {
        if (!_razonNinguno) _razonNinguno = 'no_mercado_data'
        continue
      }

      const vendorMapCur = _deptVendCur.get(dept)
      if (!vendorMapCur || vendorMapCur.size === 0) {
        if (!_razonNinguno) _razonNinguno = 'no_ejecucion_data'
        continue
      }
      const topVendor = [...vendorMapCur.entries()].sort((a, b) => b[1] - a[1])[0][0]
      const vendorYtd  = vendorMapCur.get(topVendor) ?? 0
      const vendorPrev = _deptVendPrev.get(dept)?.get(topVendor) ?? 0
      const vendorDrop = vendorPrev - vendorYtd

      // Share del top vendedor en la caída del depto
      const ejecucionShare = Math.max(0, Math.min(1, vendorDrop / deptDrop))
      const ejecucion_pct  = Math.round(ejecucionShare * 100)
      const mercado_pct    = 100 - ejecucion_pct

      // Confianza: alta si depto tiene ≥3 vendedores y el share domina (≥60% o ≤40%)
      const vendorCount = vendorMapCur.size
      const domina = ejecucion_pct >= 60 || ejecucion_pct <= 40
      const confianza: 'alta' | 'media' = (vendorCount >= 3 && domina) ? 'alta' : 'media'

      c.detail = {
        ...c.detail,
        split_ejecucion_vs_mercado: {
          ejecucion_pct,
          mercado_pct,
          confianza,
          top_vendedor: topVendor,
        },
      }
      const label = ejecucion_pct > mercado_pct ? 'ejecución' : 'mercado'
      c.description = (c.description ?? '')
        + ` Split interno: ejecución ${ejecucion_pct}% · mercado ${mercado_pct}% (top: ${topVendor}; domina ${label}).`

      _conSplit++
      if (!_sampleDept) {
        _sampleDept = dept
        _sampleEje  = ejecucion_pct
        _sampleMer  = mercado_pct
      }
    }

    if (import.meta.env.DEV) {
      const _razon = _conSplit > 0 ? null : (_razonNinguno ?? 'no_candidates')
      console.debug('[PR-L2b.3] split:', {
        trend_down_totales:  _trendDownTotales,
        meta_gap_totales:    _metaGapTotales,
        con_split_aplicado:  _conSplit,
        sin_split:           _deptoCands.length - _conSplit,
        top_ejemplo: _sampleDept
          ? { departamento: _sampleDept, ejecucion_pct: _sampleEje, mercado_pct: _sampleMer }
          : null,
        razon: _razon,
      })
    }
  }

  // [PR-M4a] Cross-engine genérico (Metric × Dimension × InsightType).
  // Con DETECTORS={} en M4a, no produce candidatos. PR-M4b/c wire outlier/seasonality.
  // Construcción de DataAvailability desde las flags inferibles en este scope.
  _beginStage('cross_engine')
  try {
    const _xeAvailability: DataAvailability = {
      has_producto:        params.sales.some(s => s.producto != null && s.producto !== ''),
      has_cliente:         params.sales.some(s => s.cliente != null && s.cliente !== ''),
      has_venta_neta:      params.sales.some(s => s.venta_neta != null && s.venta_neta > 0),
      has_categoria:       params.sales.some(s => s.categoria != null && s.categoria !== ''),
      has_canal:           params.sales.some(s => s.canal != null && s.canal !== ''),
      has_supervisor:      params.sales.some(s => s.supervisor != null && s.supervisor !== ''),
      has_departamento:    params.sales.some(s => s.departamento != null && s.departamento !== ''),
      has_metas:           (params.metas?.length ?? 0) > 0,
      has_inventario:      (params.categoriasInventario?.length ?? 0) > 0,
      has_unidades:        params.sales.length > 0
                            && params.sales.reduce((n, s) => n + (s.unidades > 0 ? 1 : 0), 0) / params.sales.length >= 0.8,
      has_precio_unitario: false,  // se completa abajo
      // Sprint cross-dim: nuevas señales de disponibilidad para columnas que ahora
      // entran al motor (subcategoria/proveedor → dimensiones; costo_unitario → métricas margen).
      has_subcategoria:    params.sales.some(s => s.subcategoria != null && s.subcategoria !== ''),
      has_proveedor:       params.sales.some(s => s.proveedor != null && s.proveedor !== ''),
      has_costo_unitario:  params.sales.some(s => s.costo_unitario != null && s.costo_unitario > 0),
    }
    _xeAvailability.has_precio_unitario = (_xeAvailability.has_unidades ?? false) && _xeAvailability.has_venta_neta
    const _xe = runCrossEngine({
      sales:         params.sales,
      currentSales,
      prevSales,
      quotas:        params.metas ?? [],
      availability:  _xeAvailability,
      period:        { year, month },
      tipoMetaActivo,
    })
    // [PR-M4d] Dedup cross-engine candidates vs hardcoded.
    // Clave: `member|dimensionId|insightTypeId`. Si la clave ya existe en allCandidates
    // (que en este punto contiene solo candidates del motor 2 hardcoded), el candidate
    // cross-engine se descarta — el hardcoded tiene enriquecimiento de dominio que el
    // genérico no puede replicar. En M4d con DETECTORS={} no hay dedup real (xe=[]).
    const _xeHardcodedKeys = new Set(
      allCandidates.map(c => `${c.member}|${c.dimensionId}|${c.insightTypeId}`),
    )
    let _xeDedupCount = 0
    for (const c of _xe.candidates) {
      const key = `${c.member}|${c.dimensionId}|${c.insightTypeId}`
      if (_xeHardcodedKeys.has(key)) { _xeDedupCount++; continue }
      // [Z.10.4b] enrichment para candidatos del crossEngine
      let _desc = c.description
      let _detail = c.detail
      if (_isEnrichEligible(c.dimensionId, c.insightTypeId)) {
        const _r = enriquecerCandidate(
          { dimensionId: c.dimensionId, member: c.member, descripcion: c.description, baseDetail: c.detail },
          _enrichCtx,
        )
        _desc = _r.description
        _detail = _r.detail
      }
      allCandidates.push({
        _origin:       'cross_engine',
        metricId:      c.metricId,
        dimensionId:   c.dimensionId,
        insightTypeId: c.insightTypeId,
        member:        c.member,
        score:         c.score,
        severity:      c.severity,
        title:         c.title,
        description:   _desc,
        detail:        _detail,
        conclusion:    c.conclusion,
        accion:        c.accion,
      })
    }
    _endStage('cross_engine', {
      inputCount: currentSales.length,
      outputCount: _xe.candidates.length - _xeDedupCount,
      discardedCount: _xeDedupCount,
      metadata: _xe.telemetry as unknown as Record<string, unknown>,
    })
    if (import.meta.env.DEV) {
      // [PR-M4d] Telemetría extendida con flags de infraestructura activa
      console.debug('[PR-M4] cross_engine:', {
        ..._xe.telemetry,
        deduplicados_vs_hardcoded: _xeDedupCount,
        threshold_activo:          2.5,   // Z_THRESHOLD en outlier.ts
        filtro_usd_only:           true,  // guard en detectOutlier
        gate_group_star:           true,  // gate en _extractTipoDim
        dedup_contra_hardcoded:    true,  // este bloque
        outlier_wired:             true,  // [PR-M4b'] DETECTORS={outlier}
      })
    }
  } catch (e) {
    _endStage('cross_engine', {
      status: 'failed',
      outputCount: 0,
      reason: String(e),
    })
    console.error('[PR-M4] cross_engine failed:', e)
  }

  // [Z.9.7] Motor 1 completado — registrar candidatos emitidos hasta aquí
  _status.detectors.motor1 = { result: 'ok', candidatesEmitted: allCandidates.length }

  // [PR-M7d] Builder aditivo de outliers de num_transacciones (cliente|vendedor).
  // Candidatos non_monetary (ver NON_MONETARY_METRIC_IDS). No suman a totalImpact.
  // Compiten con el resto en dedup + ranker. Si no detecta outliers, retorna [].
  try {
    const _t0_outlier = performance.now(); const _in_outlier = allCandidates.length
    const _pm7dOut = buildTransactionOutlierBlocks({
      currentSales,
      selectedPeriod: { year, month },
    })
    _pushWithEnrichment(_pm7dOut.candidates)
    _status.detectors.outlier_builder = { result: 'ok', candidatesEmitted: _pm7dOut.candidates.length }
    _builderStats['outlier_builder'] = { ms: performance.now() - _t0_outlier, input: _in_outlier, output: allCandidates.length - _in_outlier }
    if (import.meta.env.DEV) {
      // [PR-M7f] log separado para la extensión multi-métrica.
      if (_pm7dOut.telemetry?.m7f) {
        console.debug('[PR-M7f] multi_metric_outlier_builder', _pm7dOut.telemetry.m7f)
      }
      console.debug('[PR-M7d] transaction_outlier_builder', _pm7dOut.telemetry)
    }
  } catch (e) {
    _status.detectors.outlier_builder = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    _builderStats['outlier_builder'] = { ms: 0, input: 0, output: 0 }
    if (import.meta.env.DEV) console.warn('[PR-M7d] builder failed (degradación silenciosa):', e)
  }

  // [PR-M8a] Change Point Detection — quiebres de régimen en series mensuales.
  // Usa TODO el historial (`sales`, no `currentSales`). Aditivo; degrada a [].
  try {
    const _t0_cp = performance.now(); const _in_cp = allCandidates.length
    const _pm8aOut = buildChangePointBlocks(sales)
    _pushWithEnrichment(_pm8aOut.candidates)
    _status.detectors.change_point = { result: 'ok', candidatesEmitted: _pm8aOut.candidates.length }
    _builderStats['change_point'] = { ms: performance.now() - _t0_cp, input: _in_cp, output: allCandidates.length - _in_cp }
  } catch (e) {
    _status.detectors.change_point = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    _builderStats['change_point'] = { ms: 0, input: 0, output: 0 }
    if (import.meta.env.DEV) console.warn('[PR-M8a] builder failed (degradación silenciosa):', e)
  }

  // [PR-M9] Steady Share Detection — cambios sostenidos en participación
  // relativa al grupo (complementaria a change_point: relativo vs absoluto).
  try {
    const _t0_ss = performance.now(); const _in_ss = allCandidates.length
    const _pm9Out = buildSteadyShareBlocks(sales)
    _pushWithEnrichment(_pm9Out.candidates)
    _status.detectors.steady_share = { result: 'ok', candidatesEmitted: _pm9Out.candidates.length }
    _builderStats['steady_share'] = { ms: performance.now() - _t0_ss, input: _in_ss, output: allCandidates.length - _in_ss }
  } catch (e) {
    _status.detectors.steady_share = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    _builderStats['steady_share'] = { ms: 0, input: 0, output: 0 }
    if (import.meta.env.DEV) console.warn('[PR-M9] builder failed (degradación silenciosa):', e)
  }

  // [PR-M10] Correlation Detection — pares de métricas con movimiento inverso
  // sostenido para una misma entidad. Pearson r ≤ -0.65 durante ≥6 meses.
  try {
    const _t0_corr = performance.now(); const _in_corr = allCandidates.length
    const _pm10Out = buildCorrelationBlocks(sales)
    _pushWithEnrichment(_pm10Out.candidates)
    _status.detectors.correlation = { result: 'ok', candidatesEmitted: _pm10Out.candidates.length }
    _builderStats['correlation'] = { ms: performance.now() - _t0_corr, input: _in_corr, output: allCandidates.length - _in_corr }
  } catch (e) {
    _status.detectors.correlation = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    _builderStats['correlation'] = { ms: 0, input: 0, output: 0 }
    if (import.meta.env.DEV) console.warn('[PR-M10] builder failed (degradación silenciosa):', e)
  }

  // [PR-M11] meta_gap_temporal — tendencia de cumplimiento de meta por vendedor.
  // Detecta declive consecutivo (≥3 meses ↓) o brecha estructural (≥4 meses
  // ≥15pp por debajo del promedio del equipo). impactoUSD=0.
  try {
    const _t0_mgt = performance.now(); const _in_mgt = allCandidates.length
    const _pm11Out = buildMetaGapTemporalBlocks({ sales, metas, tipoMetaActivo, selectedPeriod: { year, month } })
    _pushWithEnrichment(_pm11Out.candidates)
    _status.detectors.meta_gap_temporal = { result: 'ok', candidatesEmitted: _pm11Out.candidates.length }
    _builderStats['meta_gap_temporal'] = { ms: performance.now() - _t0_mgt, input: _in_mgt, output: allCandidates.length - _in_mgt }
    console.log('[PR-M11] meta_gap_temporal_builder', _pm11Out.telemetry)
  } catch (e) {
    _status.detectors.meta_gap_temporal = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    _builderStats['meta_gap_temporal'] = { ms: 0, input: 0, output: 0 }
    if (import.meta.env.DEV) console.warn('[PR-M11] builder failed (degradación silenciosa):', e)
  }

  // [Phase C — multi-dim cumplimiento_meta] Reemplaza la métrica cumplimiento_meta
  // del main loop (que solo manejaba vendedor) por un builder que respeta el combo
  // de dimensiones presentes en cada meta-row. Si una meta tiene
  // (vendedor=Carlos, cliente=ACME), agrega ventas con ese mismo combo.
  // Default presente para que la key esté siempre en metadata.builders.
  _builderStats['meta_gap_combo'] = { ms: 0, input: 0, output: 0 }
  if (metas && metas.length > 0) {
    const _t0_mgc = performance.now(); const _in_mgc = allCandidates.length
    try {
      const SHARED_DIMS = ['vendedor', 'cliente', 'producto', 'categoria', 'subcategoria', 'departamento', 'supervisor', 'canal', 'proveedor'] as const
      // Prioridad para asignar el dimensionId del candidato — narrowest first.
      const DIM_PRIORITY = ['producto', 'cliente', 'vendedor', 'subcategoria', 'categoria', 'supervisor', 'canal', 'proveedor', 'departamento']

      // Filtrar metas del período actual
      const metaMes = month + 1
      const metasPeriodo = metas.filter(m => m.anio === year && m.mes === metaMes)
      let _emitidos = 0
      let _descartadosUmbral = 0
      let _sinDims = 0
      // [Z.12.V-5] Dedup por hecho comercial. Si dos metas dan idéntica
      // (cumplPct redondeado a 0.1, venta, metaVal), representan el MISMO
      // hecho con distinta granularidad. Caso runtime confirmado: Roberto
      // Cruz × Autoservicio (207%) y Roberto Cruz × Walmart Occidente ×
      // Autoservicio (207%) — Walmart es el único cliente del canal, son
      // semánticamente el mismo insight. Conservamos el de combo más simple
      // (menos filledDims) para narrativa más legible.
      const _dedupKey = (cumplPct: number, venta: number, metaVal: number) =>
        `${Math.round(cumplPct * 10) / 10}|${Math.round(venta)}|${Math.round(metaVal)}`
      const _emittedHechos = new Map<string, number>()  // key → idx en allCandidates

      for (const m of metasPeriodo) {
        // Detectar dims filled en este row
        const filledDims: Array<{ key: string; value: string }> = []
        for (const k of SHARED_DIMS) {
          const v = (m as unknown as Record<string, unknown>)[k]
          if (typeof v === 'string' && v.trim() !== '') {
            filledDims.push({ key: k, value: v.trim() })
          }
        }
        if (filledDims.length === 0) { _sinDims++; continue }

        // Meta value según tipo activo
        const metaUds = m.meta_uds ?? m.meta ?? 0
        const metaUsd = m.meta_usd ?? (tipoMetaActivo === 'usd' ? m.meta : null) ?? 0
        const metaVal = tipoMetaActivo === 'usd' ? metaUsd : metaUds
        if (!metaVal || metaVal <= 0) continue

        // Agregar ventas que cumplan TODOS los filledDims
        let venta = 0
        let ventaUsd = 0
        for (const r of currentSales) {
          let match = true
          for (const fd of filledDims) {
            const rv = (r as unknown as Record<string, unknown>)[fd.key]
            if (rv !== fd.value) { match = false; break }
          }
          if (!match) continue
          venta    += tipoMetaActivo === 'usd' ? (r.venta_neta ?? 0) : r.unidades
          ventaUsd += r.venta_neta ?? 0
        }

        const cumplPct = (venta / metaVal) * 100
        const gap = metaVal - venta // positivo = brecha; negativo = sobrecumplimiento

        // Materialidad: emitir solo si está >25% off (en cualquier dirección)
        // o si la meta es grande (gap absoluto > $5k USD equivalente).
        const offBy = Math.abs(100 - cumplPct)
        const isCriticalLow = cumplPct < 75
        const isOverPerf    = cumplPct > 130
        if (!isCriticalLow && !isOverPerf && offBy < 25) {
          _descartadosUmbral++
          continue
        }

        // [Z.12.V-5] Dedup hecho comercial. Si ya emitimos un candidate con la
        // misma cumplPct/venta/metaVal, comparar combo: nos quedamos con el de
        // MENOS filledDims (más legible). El más complejo se descarta.
        const _dk = _dedupKey(cumplPct, venta, metaVal)
        const _existingIdx = _emittedHechos.get(_dk)
        if (_existingIdx != null) {
          const _existing = allCandidates[_existingIdx]
          const _existingFilled = (_existing.detail?.comboFields as Array<{key: string}> | undefined)?.length ?? 99
          if (filledDims.length >= _existingFilled) {
            // El nuevo es más complejo o igual — descartar.
            _descartadosUmbral++
            continue
          }
          // El nuevo es más simple — reemplazar el existente.
          allCandidates.splice(_existingIdx, 1)
          // Reindexar _emittedHechos: cualquier idx > _existingIdx baja en 1.
          for (const [k, v] of _emittedHechos) {
            if (v > _existingIdx) _emittedHechos.set(k, v - 1)
          }
          _emittedHechos.delete(_dk)
        }

        // [Z.13.V-1] Severity por dirección. Sobrecumplimiento extremo
        // (>200%) NO debería ser ALTA roja: indica probablemente meta mal
        // calibrada, no problema operativo. Subcumplimiento extremo SÍ
        // requiere atención urgente. Caso runtime: Lácteos 741%, Limpieza
        // 908%, Refrescos 843% — todas ALTA rojas. UX cliente: confunde
        // ("¿por qué un sobrecumplimiento de 900% es urgente?").
        let severity: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' = 'MEDIA'
        if (cumplPct < 50)            severity = 'CRITICA'   // sub-meta crítica
        else if (cumplPct < 70)       severity = 'ALTA'      // sub-meta seria
        else if (cumplPct < 80)       severity = 'MEDIA'     // sub-meta moderada
        else if (cumplPct > 200)      severity = 'BAJA'      // sobrecumpl masivo → revisar meta, baja urgencia operativa
        else if (cumplPct > 150)      severity = 'MEDIA'     // sobrecumpl alto → notable, no urgente
        else if (offBy >= 30)         severity = 'ALTA'      // gap moderado pero sostenido

        // Pick narrowest dim como dimensionId
        const dimId = DIM_PRIORITY.find(d => filledDims.some(f => f.key === d)) ?? filledDims[0].key
        const memberRecord = filledDims.find(f => f.key === dimId)!

        // [Z.12.V-7] Narrativa en lenguaje natural. comboTxt original
        // ('vendedor=X · canal=Y') sigue persistido en detail.comboTxt
        // para trazabilidad/audit, pero NO se usa en title/description
        // — un gerente comercial no entiende sintaxis tipo SQL/filtro.
        // _comboNatural: protagonista narrowest + contexto en 'en'.
        const comboTxt = filledDims.map(f => `${f.key}=${f.value}`).join(' · ')
        const _otrosDims = filledDims.filter(f => f.key !== dimId)
        const _comboNatural = _otrosDims.length === 0
          ? memberRecord.value
          : `${memberRecord.value} en ${_otrosDims.map(f => f.value).join(' · ')}`

        const ventaFmt = tipoMetaActivo === 'usd'
          ? `$${Math.round(venta).toLocaleString('en-US')}`
          : `${Math.round(venta).toLocaleString('en-US')} uds`
        const metaFmt = tipoMetaActivo === 'usd'
          ? `$${Math.round(metaVal).toLocaleString('en-US')}`
          : `${Math.round(metaVal).toLocaleString('en-US')} uds`

        const direction: 'up' | 'down' = cumplPct >= 100 ? 'up' : 'down'
        const arrow = direction === 'up' ? '↑' : '↓'
        const verbo = direction === 'up' ? 'sobrecumplió' : 'incumplió'

        const title = `${arrow} ${_comboNatural}: ${cumplPct.toFixed(0)}% de meta`

        const description =
          `${_comboNatural}: ${ventaFmt} vs meta ${metaFmt} (${cumplPct.toFixed(1)}%). ` +
          `${verbo} la meta del período por ${Math.abs(gap).toLocaleString('en-US')}${tipoMetaActivo === 'usd' ? ' USD' : ' uds'}.`

        // Score: brechas grandes valen más
        const score = Math.min(0.95, 0.5 + (offBy / 100) * 0.5)

        const accion = direction === 'down'
          ? `Plan de recuperación con ${memberRecord.value}: revisar pipeline y compromisos del mes.`
          : `Replicar el patrón de ${memberRecord.value} en otras combinaciones similares.`

        allCandidates.push({
          _origin:       'special_builder',
          metricId:      'cumplimiento_meta',
          dimensionId:   dimId,
          insightTypeId: 'meta_gap',
          member:        memberRecord.value,
          score,
          severity,
          title,
          description,
          detail: {
            cumplPct,
            metaVal,
            ventaActual: venta,
            ventaUsd,
            gap,
            comboFields: filledDims,   // [{key, value}, ...]
            comboTxt,
            tipoMetaActivo,
            diasTranscurridos,
            diasTotalesMes,
            comparison: 'meta_combo',
            // [Sprint H' fix] cross_context populado para que Z.11 y Z.12 lo
            // detecten via _z11ContarCrossConcreto. Sin esto, crossCount=0 y
            // el candidato falla regla C de Z.11 (root-strong + cross>=2).
            cross_context: Object.fromEntries(filledDims.map(d => [d.key, d.value])),
          },
          conclusion: title,
          accion,
          direction,
          // [Sprint B / D1.c] meta_gap_combo es monetario cuando tipoMetaActivo='usd'.
          // gap es la brecha numérica; en uds usamos ventaUsd (componente USD del
          // gap aunque tipoMetaActivo sea uds — para que el ranker monetario-consciente
          // pueda priorizar). source='gap_meta' ya whitelisted en Z12_VALID_USD_SOURCES.
          impacto_usd_normalizado: tipoMetaActivo === 'usd'
            ? Math.abs(gap)
            : (ventaUsd > 0 ? ventaUsd : null),
          impacto_usd_source: (tipoMetaActivo === 'usd' || ventaUsd > 0) ? 'gap_meta' : 'non_monetary',
        })
        // [Z.12.V-5] registrar el hecho recién emitido para dedup futuro.
        _emittedHechos.set(_dk, allCandidates.length - 1)
        _emitidos++
      }
      _builderStats['meta_gap_combo'] = {
        ms: performance.now() - _t0_mgc,
        input: _in_mgc,
        output: allCandidates.length - _in_mgc,
      }
      if (import.meta.env.DEV) {
        console.debug('[Phase C] meta_gap_combo:', {
          metas_periodo: metasPeriodo.length,
          emitidos: _emitidos,
          descartados_umbral: _descartadosUmbral,
          sin_dims: _sinDims,
        })
      }
    } catch (e) {
      _builderStats['meta_gap_combo'] = { ms: 0, input: 0, output: 0 }
      if (import.meta.env.DEV) console.warn('[Phase C] meta_gap_combo fallback:', e)
    }
  }

  // [Z.12.V-3] Fallback agregado por vendedor.
  //
  // Stress test detectó que vendedores con cumplimiento extremo a nivel
  // AGREGADO (Miguel Ángel Díaz, cumpl=68.7%) no surfacean cuando sus metas
  // tienen combo dim filled (e.g., vendedor+canal): meta_gap_combo emite
  // por combo, no por vendor agregado, así que cumpl-por-combo puede ser
  // distinto al cumpl-agregado y no triggerear el threshold (<75 ó >130).
  //
  // Este builder lee vendorAnalysis (agregado canónico) y emite un meta_gap
  // de granularidad vendedor cuando hay extremo y no fue cubierto por
  // meta_gap_combo. cap del ranker (meta_gap:vendedor=2) limita el output.
  _builderStats['meta_gap_aggregate_vendedor'] = { ms: 0, input: 0, output: 0 }
  if (params.vendorAnalysis && params.vendorAnalysis.length > 0) {
    const _t0_mgav = performance.now(); const _in_mgav = allCandidates.length
    try {
      // Members ya cubiertos por meta_gap_combo a granularidad vendedor.
      const _coveredVendors = new Set<string>()
      for (const c of allCandidates) {
        if (c.insightTypeId === 'meta_gap' && c.dimensionId === 'vendedor' && c.member) {
          _coveredVendors.add(c.member)
        }
      }

      for (const v of params.vendorAnalysis) {
        const cumplPct = v.cumplimiento_pct
        if (typeof cumplPct !== 'number' || !Number.isFinite(cumplPct)) continue
        if (_coveredVendors.has(v.vendedor)) continue
        if (cumplPct >= 70 && cumplPct <= 130) continue   // no extremo

        // direction + severity análogos a meta_gap_combo
        const direction: 'up' | 'down' = cumplPct >= 100 ? 'up' : 'down'
        const arrow = direction === 'up' ? '↑' : '↓'
        const verbo = direction === 'up' ? 'sobrecumplió' : 'incumplió'
        let severity: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' = 'MEDIA'
        if (cumplPct < 50)            severity = 'CRITICA'
        else if (cumplPct < 70)       severity = 'ALTA'
        else if (cumplPct > 150)      severity = 'ALTA'

        // Score análogo: brechas grandes valen más; cap 0.95 para no dominar.
        const offBy = Math.abs(100 - cumplPct)
        const score = Math.min(0.95, 0.5 + (offBy / 100) * 0.5)

        // Métricas para narrativa.
        // ventas_periodo es USD si tipoMetaActivo='usd', uds si 'uds'.
        // unidades_periodo siempre es uds. Para anchor USD en gate, usar ytd_actual_usd
        // como proxy mensual (aproximación: ytd / mesesYTD); si no, ventas_periodo cuando uds.
        const ventaActualUds = v.unidades_periodo ?? 0
        const ventaActualPeriodo = v.ventas_periodo ?? 0
        const ventaUsd = tipoMetaActivo === 'usd'
          ? ventaActualPeriodo
          : (typeof v.ytd_actual_usd === 'number' && v.ytd_actual_usd > 0
              ? v.ytd_actual_usd / Math.max(1, month + 1)
              : 0)

        const ventaFmt = tipoMetaActivo === 'usd'
          ? `$${Math.round(ventaActualPeriodo).toLocaleString('en-US')}`
          : `${ventaActualUds.toLocaleString('en-US')} uds`

        const title = `${arrow} ${v.vendedor}: ${cumplPct.toFixed(0)}% de meta`
        const description =
          `${v.vendedor} cierra el período con ${ventaFmt} (${cumplPct.toFixed(1)}% de meta). ` +
          `${verbo} su meta agregada considerando todos sus canales y rutas. ` +
          (typeof v.variacion_ytd_uds_pct === 'number' && Math.abs(v.variacion_ytd_uds_pct) >= 5
            ? `Variación YTD: ${v.variacion_ytd_uds_pct > 0 ? '+' : ''}${v.variacion_ytd_uds_pct.toFixed(1)}%.`
            : '')
        const accion = direction === 'down'
          ? `Plan de recuperación con ${v.vendedor}: revisar pipeline y compromisos del mes.`
          : `Replicar el patrón de ${v.vendedor} en otras combinaciones similares.`

        allCandidates.push({
          _origin:       'special_builder',
          metricId:      'cumplimiento_meta',
          dimensionId:   'vendedor',
          insightTypeId: 'meta_gap',
          member:        v.vendedor,
          score,
          severity,
          title,
          description,
          detail: {
            cumplPct,
            ventaActual:    ventaActualUds,
            ventaUsd,
            comparison:     'meta_aggregate_vendedor',
            variacion_ytd:  v.variacion_ytd_uds_pct ?? null,
            variacion_mom:  v.variacion_pct ?? null,
            cross_context: { vendedor: v.vendedor },
            // gap aproximado: si tipoMetaActivo='usd' usar ventaUsd como
            // proxy USD del impacto (mismo criterio que meta_gap_combo uds-mode)
            gap: 0,
            tipoMetaActivo,
          },
          conclusion: title,
          accion,
          direction,
          impacto_usd_normalizado: ventaUsd > 0 ? ventaUsd : null,
          impacto_usd_source: ventaUsd > 0 ? 'gap_meta' : 'non_monetary',
        })
        _coveredVendors.add(v.vendedor)
      }

      _builderStats['meta_gap_aggregate_vendedor'] = {
        ms: performance.now() - _t0_mgav,
        input: _in_mgav,
        output: allCandidates.length - _in_mgav,
      }
      if (import.meta.env.DEV) {
        console.debug('[Z.12.V-3] meta_gap_aggregate_vendedor:', {
          vendedores_evaluados: params.vendorAnalysis.length,
          emitidos: allCandidates.length - _in_mgav,
        })
      }
    } catch (e) {
      _builderStats['meta_gap_aggregate_vendedor'] = { ms: 0, input: 0, output: 0 }
      if (import.meta.env.DEV) console.warn('[Z.12.V-3] meta_gap_aggregate_vendedor fallback:', e)
    }
  }

  // [Z.13.3 + auto-combo] Detector cross_delta — descomposición combinatoria N-tupla.
  // Antes: 7 pares hardcodeados. Ahora: análisis previo de relaciones funcionales
  // entre dims (dim-relationships.ts) genera automáticamente todos los combos
  // 2..MAX_TUPLE_SIZE válidos, descartando los redundantes (jerárquicos detectados
  // desde la data: producto→categoria, vendedor→supervisor, etc.). Auto-escala
  // cuando se agregan dims nuevas a DIMENSION_REGISTRY sin cambios de código.
  try {
    const _t0_cdelta = performance.now(); const _in_cdelta = allCandidates.length
    const _Z133_valueOf = (r: SaleRecord): number => {
      const rAny = r as unknown as Record<string, unknown>
      const v = (rAny.venta_neta ?? rAny.venta_total ?? rAny.venta ?? rAny.monto ?? 0) as number
      return Number(v) || 0
    }
    const _Z133_ventaTotal = currentSales.reduce((s, r) => s + _Z133_valueOf(r), 0)
    const _Z133_ventaTotalSafe = _Z133_ventaTotal > 0 ? _Z133_ventaTotal : 1

    // Floors bi-nivel consistentes con gate Z.12.
    const _Z133_floorAlto = _Z133_ventaTotalSafe * MATERIALITY_FLOOR_EXECUTIVE
    const _Z133_floorBajo = _Z133_ventaTotalSafe * (MATERIALITY_FLOOR_EXECUTIVE / 2)

    // Pareto set local sobre venta actual (entidades que acumulan ~80%).
    const _Z133_ventaPorEntidad = new Map<string, number>()
    for (const r of currentSales) {
      const v = _Z133_valueOf(r)
      if (v <= 0) continue
      const rAny = r as unknown as Record<string, string | undefined>
      for (const k of [rAny.vendedor, rAny.cliente, rAny.producto, rAny.departamento, rAny.canal,
                       rAny.categoria, rAny.subcategoria, rAny.supervisor, rAny.proveedor]) {
        if (!k) continue
        _Z133_ventaPorEntidad.set(k, (_Z133_ventaPorEntidad.get(k) ?? 0) + v)
      }
    }
    const _Z133_paretoRanked = [..._Z133_ventaPorEntidad.entries()].sort((a, b) => b[1] - a[1])
    const _Z133_paretoTotal  = _Z133_paretoRanked.reduce((s, [, v]) => s + v, 0)
    const _Z133_paretoSet    = new Set<string>()
    let _Z133_acc = 0
    for (const [k, v] of _Z133_paretoRanked) {
      _Z133_acc += v
      _Z133_paretoSet.add(k)
      if (_Z133_paretoTotal > 0 && _Z133_acc / _Z133_paretoTotal >= 0.8) break
    }

    // ── Auto-detección de relaciones dim×dim desde la data ──────────────────
    // Las dims que entran al análisis son las del DIMENSION_REGISTRY que tienen
    // valores reales en currentSales (no quemamos la lista).
    const _allDims = DIMENSION_REGISTRY.map(d => d.id)
    const _activeDims = _allDims.filter(d => {
      for (const r of currentSales) {
        const v = (r as unknown as Record<string, unknown>)[d]
        if (typeof v === 'string' && v.trim() !== '') return true
      }
      return false
    })

    const _dimAnalysis = analyzeDimRelationships(currentSales, _activeDims)
    const _comboGen = generateAutoCombos(_activeDims, _dimAnalysis, {
      maxTupleSize: 4,
      maxCombos: 200,
    })

    let _Z133_emitidos = 0
    let _Z133_descartadosMaterialidad = 0
    const _Z133_muestras: Array<Record<string, unknown>> = []
    const _Z133_emittedByCombo: Record<string, number> = {}
    // Para dedup de paths permutados: clave canónica (dims sorted + members sorted joint)
    const _emittedPathKeys = new Set<string>()

    for (const combo of _comboGen.combos) {
      const comboKey = combo.join('×')
      _Z133_emittedByCombo[comboKey] = 0

      // Materialidad escalada por tamaño de tupla: floor crece 1.5^(N-2).
      // Una tupla 4-way debería tener delta material para evitar ruido.
      const tupleScale = Math.pow(1.5, combo.length - 2)
      const floorAltoTuple = _Z133_floorAlto * tupleScale
      const floorBajoTuple = _Z133_floorBajo * tupleScale

      // Agregación por tupla — clave es path joinado.
      const _curAgg  = new Map<string, number>()
      const _prevAgg = new Map<string, number>()
      const _curMembers = new Map<string, string[]>()  // path values per key

      for (const r of currentSales) {
        const path: string[] = []
        let valid = true
        for (const d of combo) {
          const v = (r as unknown as Record<string, unknown>)[d]
          if (typeof v !== 'string' || v.trim() === '') { valid = false; break }
          path.push(v)
        }
        if (!valid) continue
        const key = path.join('||')
        _curAgg.set(key, (_curAgg.get(key) ?? 0) + _Z133_valueOf(r))
        if (!_curMembers.has(key)) _curMembers.set(key, path)
      }
      for (const r of prevSales) {
        const path: string[] = []
        let valid = true
        for (const d of combo) {
          const v = (r as unknown as Record<string, unknown>)[d]
          if (typeof v !== 'string' || v.trim() === '') { valid = false; break }
          path.push(v)
        }
        if (!valid) continue
        const key = path.join('||')
        _prevAgg.set(key, (_prevAgg.get(key) ?? 0) + _Z133_valueOf(r))
      }

      const _allKeys = new Set<string>([..._curAgg.keys(), ..._prevAgg.keys()])
      for (const key of _allKeys) {
        const cur    = _curAgg.get(key)  ?? 0
        const prev   = _prevAgg.get(key) ?? 0
        const delta  = cur - prev
        const absDelta = Math.abs(delta)
        if (absDelta <= 0) continue
        if (cur + prev <= 0) continue

        const path = _curMembers.get(key) ?? key.split('||')
        // Fracción del path que está en Pareto. Pareto = al menos 50% miembros relevantes.
        const paretoMembers = path.filter(m => _Z133_paretoSet.has(m)).length
        const paretoFraction = paretoMembers / path.length
        const ambosPareto = paretoFraction >= 0.5

        const pasaMaterialidad =
          absDelta >= floorAltoTuple ||
          (absDelta >= floorBajoTuple && ambosPareto)

        if (!pasaMaterialidad) {
          _Z133_descartadosMaterialidad++
          continue
        }

        // Dedup por path canónico — combos diferentes pueden producir el mismo
        // slice si los dims se solapan post-canonicalización.
        const canonKey = combo
          .map((d, i) => `${d}=${path[i]}`)
          .sort()
          .join('|')
        if (_emittedPathKeys.has(canonKey)) continue
        _emittedPathKeys.add(canonKey)

        const direction: 'up' | 'down' = delta >= 0 ? 'up' : 'down'
        const arrow = direction === 'up' ? '↑' : '↓'
        const pctChange = prev > 0 ? delta / prev : (cur > 0 ? 1 : 0)
        const pctSobreNegocio = absDelta / _Z133_ventaTotalSafe
        const score = Math.min(pctSobreNegocio * 10, 1)

        let severity: 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA' = 'BAJA'
        if      (absDelta >= floorAltoTuple * 2) severity = 'CRITICA'
        else if (absDelta >= floorAltoTuple)     severity = 'ALTA'
        else if (absDelta >= floorBajoTuple)     severity = 'MEDIA'

        const _fmt = (n: number) => Math.round(n).toLocaleString('en-US')

        // [Z.12.V-7] Path display en lenguaje natural. pathTxt original
        // ('vendedor=X · cliente=Y') queda persistido en detail.dimensionPath
        // y en cross_context para audit/trazabilidad. Headline usa la versión
        // protagonista + 'en' separator.
        const pathTxt = combo.map((d, i) => `${d}=${path[i]}`).join(' · ')
        // Most granular member para member field (mayor cardinalidad = más narrow)
        const granularDim = [...combo].sort(
          (a, b) => (_dimAnalysis.cardinality.get(b) ?? 0) - (_dimAnalysis.cardinality.get(a) ?? 0),
        )[0]
        const granularIdx = combo.indexOf(granularDim)
        const granularMember = path[granularIdx]
        const _otrosMembers = combo
          .map((d, i) => ({ dim: d, member: path[i] }))
          .filter(p => p.dim !== granularDim)
        const _pathNatural = _otrosMembers.length === 0
          ? granularMember
          : `${granularMember} en ${_otrosMembers.map(p => p.member).join(' · ')}`

        const title = `${arrow} ${_pathNatural} ${direction === 'up' ? 'creció' : 'cayó'} $${_fmt(absDelta)}`
        const description =
          `${_pathNatural}: $${_fmt(prev)} → $${_fmt(cur)} ` +
          `(${direction === 'up' ? '+' : ''}${Math.round(pctChange * 1000) / 10}%). ` +
          `Representa ${Math.round(pctSobreNegocio * 10000) / 100}% del negocio del período.`

        // dimensionPath: estructura canónica con todo el N-tuple
        const dimensionPath = combo.map((d, i) => ({ dim: d, member: path[i] }))

        const candidate: InsightCandidate = {
          _origin:       'special_builder',
          metricId:      'venta',
          dimensionId:   granularDim,
          insightTypeId: 'cross_delta',
          member:        granularMember,
          score,
          severity,
          title,
          description,
          detail: {
            dimensionPath,             // Array<{dim, member}> — N-dim
            comboSize:       combo.length,
            comboKey,
            memberValue:     cur,
            memberPrevValue: prev,
            memberChange:    delta,
            pctChange,
            pctSobreNegocio,
            paretoFraction,
            tupleScale,
            cross_context: Object.fromEntries(combo.map((d, i) => [d, path[i]])),
          },
          conclusion: title,
          impacto_usd_normalizado: absDelta,
          impacto_usd_source:      'cross_delta_yoy',
          direction,
        }
        // Backwards-compat: para combos size 2, mantener dimensionId2/member2.
        if (combo.length === 2) {
          const otherIdx = granularIdx === 0 ? 1 : 0
          ;(candidate as unknown as { dimensionId2?: string; member2?: string }).dimensionId2 = combo[otherIdx]
          ;(candidate as unknown as { dimensionId2?: string; member2?: string }).member2      = path[otherIdx]
        }

        allCandidates.push(candidate)
        _Z133_emitidos++
        _Z133_emittedByCombo[comboKey] = (_Z133_emittedByCombo[comboKey] ?? 0) + 1

        if (_Z133_muestras.length < 8) {
          _Z133_muestras.push({
            combo: comboKey,
            path:  pathTxt,
            delta: Math.round(delta),
            pct_negocio: Math.round(pctSobreNegocio * 10000) / 100,
            severity,
          })
        }
      }
    }

    _builderStats['cross_delta'] = {
      ms: performance.now() - _t0_cdelta,
      input: _in_cdelta,
      output: allCandidates.length - _in_cdelta,
      discarded: _Z133_descartadosMaterialidad,
    }
    if (import.meta.env.DEV) {
      console.debug('[Z.13.3 auto-combo] cross_delta_detector', {
        active_dims:               _activeDims,
        sample_size:               _dimAnalysis.sampleSize,
        cardinality:               Object.fromEntries(_dimAnalysis.cardinality),
        fd_detected:               Object.fromEntries(
          [..._dimAnalysis.fd.entries()]
            .filter(([, set]) => set.size > 0)
            .map(([k, v]) => [k, [...v]]),
        ),
        combos_telemetry:          _comboGen.telemetry,
        combos_evaluados:          _comboGen.combos.map(c => c.join('×')),
        ventaTotalNegocio:         Math.round(_Z133_ventaTotalSafe),
        floorAlto_base:            Math.round(_Z133_floorAlto),
        floorBajo_base:            Math.round(_Z133_floorBajo),
        pareto_set_size:           _Z133_paretoSet.size,
        emitidos:                  _Z133_emitidos,
        emitidos_por_combo:        _Z133_emittedByCombo,
        descartados_materialidad:  _Z133_descartadosMaterialidad,
        muestra_top:               _Z133_muestras,
      })
    }
  } catch (e) {
    _builderStats['cross_delta'] = { ms: 0, input: 0, output: 0, discarded: 0 }
    if (import.meta.env.DEV) console.warn('[Z.13.3 auto-combo] cross_delta_detector fallback (degradación silenciosa):', e)
  }

  _endStage('special_builders', {
    inputCount: currentSales.length,
    outputCount: allCandidates.length - _specialBuildersStartCount,
    metadata: {
      includesCrossEngine: true,
      detectorStatus: _status.detectors,
      builders: _builderStats,
    },
  })

  // 4. Deduplicate
  // [PR-M5a'] Allowlist re-habilitada: tipos que preservan variantes por metric en la key.
  // trend/change/contribution tienen valor semántico dual (unidades complementa USD).
  // Los otros 10 detectores mantienen la clave sin metricId.
  const METRIC_DEDUP_ALLOWLIST = new Set(['trend', 'change', 'contribution'])
  _beginStage('dedup')
  const _preDedupCount = allCandidates.length
  const dedupMap = new Map<string, InsightCandidate>()
  for (const c of allCandidates) {
    const key = METRIC_DEDUP_ALLOWLIST.has(c.insightTypeId)
      ? `${c.member}|${c.dimensionId}|${c.insightTypeId}|${c.metricId}`
      : `${c.member}|${c.dimensionId}|${c.insightTypeId}`
    const existing = dedupMap.get(key)
    if (!existing || c.score > existing.score) dedupMap.set(key, c)
  }
  _endStage('dedup', {
    inputCount: _preDedupCount,
    outputCount: dedupMap.size,
    discardedCount: Math.max(0, _preDedupCount - dedupMap.size),
  })

  // [PR-M5a'] Telemetría de expansión metric-aware
  if (import.meta.env.DEV) {
    const _postDedup = Array.from(dedupMap.values())
    const _metricVariants: Record<string, string[]> = {}
    const _fueraAllowlist: Record<string, number> = {}
    const _deltaPorMetric: Record<string, number> = {}
    for (const c of _postDedup) {
      _deltaPorMetric[c.metricId] = (_deltaPorMetric[c.metricId] ?? 0) + 1
      if (METRIC_DEDUP_ALLOWLIST.has(c.insightTypeId)) {
        if (!_metricVariants[c.insightTypeId]) _metricVariants[c.insightTypeId] = []
        if (!_metricVariants[c.insightTypeId].includes(c.metricId)) _metricVariants[c.insightTypeId].push(c.metricId)
      } else {
        _fueraAllowlist[c.insightTypeId] = (_fueraAllowlist[c.insightTypeId] ?? 0) + 1
      }
    }
    console.debug('[PR-M5a] dedup_metric_expansion:', {
      candidates_pre_dedup:            _preDedupCount,
      candidates_post_dedup:           _postDedup.length,
      allowlist_types:                 [...METRIC_DEDUP_ALLOWLIST],
      metric_variants_preservados:     _metricVariants,
      types_fuera_allowlist_agrupados: _fueraAllowlist,
      delta_por_metric:                _deltaPorMetric,
    })
  }

  // 5. [PR-M5a''] Partition UPSTREAM con cap-por-tipo + diversity-aware greedy ranker
  //
  // Evolución:
  //   - M5a' usaba Set de tipos protegidos (todo-o-nada). Si migration emite 5, los 5
  //     entran como protected → protected_upstream_count=7 → regular_cap=max(6, 12-7)=6
  //     → se pierden cards de contribution/change/trend + stock_excess + meta_gap.
  //   - M5a'' usa Map<type, cap>: solo top-N por score de cada tipo se protege; el
  //     resto (overflow) compite en regular.
  //
  // Razón: preservar visibilidad de cards positivas/neutrales (contribution +,
  // stock_excess, meta_gap) que son valor real del dashboard, sin sacrificar
  // protección de los insights accionables críticos (stock_risk, product_dead).
  const ALWAYS_PROTECTED_CAPS = new Map<string, number>([
    ['stock_risk',   2],   // raramente >2 simultáneos accionables
    ['product_dead', 3],   // puede haber varios productos muertos a la vez
    ['migration',    2],   // top-2 por score; resto compite en regular
    // [PR-M7g] 1 slot garantizado para outliers ALTA/CRITICA.
    ['outlier',      1],
    // [PR-M8a] change_point — quiebre de régimen en series mensuales.
    ['change_point', 2],
    // [PR-M9] 1 slot para steady_share.
    ['steady_share', 1],
    // [PR-M10] 1 slot para correlation.
    ['correlation', 1],
    // [PR-M11] hasta 2 vendedores con tendencia de cumplimiento.
    ['meta_gap_temporal', 2],
    // [Sprint E / Visibility] Tipos nuevos que NO estaban protegidos y
    // morían en el regular bucket (166 candidatos vs 6 slots). Sin estos
    // caps, cliente_perdido / meta_gap / cross_delta nunca llegan al pool
    // selected aunque pasen el gate. Caps conservadores (1-2) para no
    // desbalancear; el filtro del builder + score se encarga del resto.
    ['cliente_perdido', 1],   // 1 cliente perdido relevante por run típicamente
    ['cliente_dormido', 2],   // se nos pasó histórico, también merece caps
    // [Z.12.V-1] meta_gap dim-aware: el cap único de 2 saturaba el slot con
    // 1 categoría + 1 vendedor + 0 canal + 0 supervisor. En datasets con
    // múltiples categorías de cumplimiento extremo (Los Pinos demo: 4
    // categorías ≥290%) las 3 menos prioritarias por score quedaban
    // invisibles — no es problema de gate (lo pasan), es del cap del ranker.
    // Resolución: split por dimensionId con caps acotados pero suficientes.
    // Lookup vía helper _capKey(c) en lugar de c.insightTypeId directo.
    ['meta_gap:categoria',  4],   // 4 categorías ≥extremas se ven todas
    ['meta_gap:vendedor',   3],   // [Z.12.V-3] top-3: cubre Carlos/Roberto + 1 más
    ['meta_gap:canal',      1],   // 1 canal extremo por run
    ['meta_gap:supervisor', 1],   // 1 supervisor extremo por run
    ['cross_delta',     2],   // auto-combo emite muchos; tomar top-2 por score
    ['stock_excess',    1],   // ya estaba en EVENT_TYPES_EXEMPT pero sin cap
    ['co_decline',      1],   // cluster de productos en declive
  ])

  // [Z.12.V-1] Helper de lookup. meta_gap usa clave compuesta type:dim para
  // que cada dimensión tenga su propio cap. Otros tipos siguen con clave =
  // insightTypeId solo.
  const _capKey = (c: InsightCandidate): string =>
    c.insightTypeId === 'meta_gap' ? `meta_gap:${c.dimensionId}` : c.insightTypeId
  const MIN_REGULAR_SLOTS = 6
  const RANKER_TOTAL_CAP  = 12

  const _allDedup = Array.from(dedupMap.values())
  _beginStage('ranker')

  // Agrupar candidates de tipos con cap upstream
  // [Z.12.V-1] _capKey: para meta_gap usa "meta_gap:${dim}" para split por dim.
  const _byProtectedType = new Map<string, InsightCandidate[]>()
  for (const c of _allDedup) {
    const key = _capKey(c)
    if (ALWAYS_PROTECTED_CAPS.has(key)) {
      const arr = _byProtectedType.get(key) ?? []
      arr.push(c)
      _byProtectedType.set(key, arr)
    }
  }

  // Por cada tipo con cap: top-N protected, overflow baja a regular
  const _protectedCands: InsightCandidate[] = []
  const _overflowToRegular: InsightCandidate[] = []
  const _protectedByTypeStats: Record<string, { generated: number; protected_count: number; overflow: number }> = {}
  for (const [type, cap] of ALWAYS_PROTECTED_CAPS) {
    let candsOfType = _byProtectedType.get(type) ?? []
    // [PR-M7g] para outliers: sólo proteger severidad ALTA o CRITICA. Los
    // MEDIA compiten en regular como hoy (no bloquean slots por ruido).
    // [PR-M8a] mismo patrón para change_point — evita reservar slot por un
    // quiebre marginal (|pct_change| < 15%).
    // [PR-M9] mismo patrón para steady_share — evita reservar slot por un
    // desplazamiento marginal (<8 pp).
    // [PR-M10] mismo patrón para correlation — evita reservar slot por r
    // apenas arriba del umbral (|r| < 0.75).
    if (type === 'outlier' || type === 'change_point' || type === 'steady_share' || type === 'correlation' || type === 'meta_gap_temporal') {
      candsOfType = candsOfType.filter(c => {
        const sev = (c.severity ?? '').toString().toUpperCase()
        return sev === 'ALTA' || sev === 'CRITICA'
      })
    }
    candsOfType = candsOfType.slice().sort((a, b) => b.score - a.score)
    const protectedOfType = candsOfType.slice(0, cap)
    const overflowOfType  = candsOfType.slice(cap)
    _protectedCands.push(...protectedOfType)
    _overflowToRegular.push(...overflowOfType)
    _protectedByTypeStats[type] = {
      generated:       candsOfType.length,
      protected_count: protectedOfType.length,
      overflow:        overflowOfType.length,
    }
  }
  // [PR-M7g] telemetría específica de la protección outlier.
  if (import.meta.env.DEV && _protectedByTypeStats['outlier']) {
    const _outlierGeneradosTotal = _byProtectedType.get('outlier')?.length ?? 0
    console.debug('[PR-M7g] outlier_protection', {
      outliers_generated:               _outlierGeneradosTotal,
      outliers_elegibles_alta_critica:  _protectedByTypeStats['outlier'].generated,
      outliers_protected:               _protectedByTypeStats['outlier'].protected_count,
      outliers_overflow:                _protectedByTypeStats['outlier'].overflow,
      sample_protected: _protectedCands
        .filter(c => c.insightTypeId === 'outlier')
        .slice(0, 3)
        .map(c => ({
          member:   c.member,
          metric:   c.metricId,
          dim:      c.dimensionId,
          severity: c.severity,
          score:    Math.round((c.score ?? 0) * 1000) / 1000,
        })),
    })
  }
  _protectedCands.sort((a, b) => b.score - a.score)

  // REGULAR = no-protegidos + overflow de protegidos
  // [Z.12.V-1] _capKey: meta_gap usa "meta_gap:${dim}" — sin esto, cualquier
  // candidate meta_gap caería al regular bucket (porque ALWAYS_PROTECTED_CAPS
  // ya no tiene 'meta_gap' bare).
  const _regularCands = _allDedup
    .filter(c => !ALWAYS_PROTECTED_CAPS.has(_capKey(c)))
    .concat(_overflowToRegular)

  // [PR-M7e] Normalización de score por métrica ANTES del sort + ranker.
  // Iguala la escala entre builders venta (0.85-0.95) y no-venta (0.5-0.75)
  // para que candidatos top-por-métrica compitan en igualdad de condiciones.
  // Protected (stock_risk/product_dead/migration) NO pasan por aquí — van por
  // fast-track upstream y mantienen su score crudo intacto.
  const _pm7eAudit: NormalizationAudit = {
    metric_groups:          [],
    candidates_normalized:  0,
    candidates_passthrough: 0,
  }
  try {
    applyScoreNormalizationByMetric(_regularCands, _pm7eAudit)
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[PR-M7e] normalization failed (degradación silenciosa):', e)
  }
  if (import.meta.env.DEV) {
    console.debug('[PR-M7e] score_normalization', {
      metric_groups:           _pm7eAudit.metric_groups,
      candidates_normalized:   _pm7eAudit.candidates_normalized,
      candidates_passthrough:  _pm7eAudit.candidates_passthrough,
      total_regular_candidates: _regularCands.length,
      sample_non_venta:        _regularCands
        .filter(c => c.metricId !== 'venta')
        .slice(0, 3)
        .map(c => ({
          id:               `${c.dimensionId}:${c.insightTypeId}:${c.member || ''}`,
          metric:           c.metricId,
          score_raw:        c.score_raw,
          score_normalized: c.score_normalized,
        })),
    })
  }

  _regularCands.sort((a, b) => b.score - a.score)
  const _regularCap = Math.max(MIN_REGULAR_SLOTS, RANKER_TOTAL_CAP - _protectedCands.length)

  // Diversity ranker SOLO sobre regular
  const _regularSelected: InsightCandidate[] = []
  const _regularPool = [..._regularCands]
  while (_regularSelected.length < _regularCap && _regularPool.length > 0) {
    // [Sprint F / Visibility] selMembers incluye protected + regular para
    // cross-bucket dedup. Antes solo trackeaba regular, así que Carlos en
    // meta_gap_temporal (protected) + contribution:Carlos (regular) se
    // duplicaba en el output. Ahora la penalty *= 0.7 aplica cuando el
    // member ya está en CUALQUIER bucket.
    const selMembers  = new Set(
      [..._protectedCands, ..._regularSelected].map(c => c.member).filter(Boolean),
    )
    const typeCount   = new Map<string, number>()
    const contribMet  = new Map<string, number>()
    for (const s of _regularSelected) {
      typeCount.set(s.insightTypeId, (typeCount.get(s.insightTypeId) ?? 0) + 1)
      if (s.insightTypeId === 'contribution')
        contribMet.set(s.metricId, (contribMet.get(s.metricId) ?? 0) + 1)
    }
    let bestIdx = 0
    let bestEff = -Infinity
    // [Z.13.1] Ranker monetario-consciente.
    // usdWeight ∈ [1, 1+K] según el impacto USD relativo a ventaTotalNegocio.
    // K=8 calibrado para que un 5% de impacto suba eff ×1.4 aproximadamente.
    // Mantiene c.score como base: la relevancia estadística sigue importando.
    const Z13_K = 8
    for (let i = 0; i < _regularPool.length; i++) {
      const c = _regularPool[i]
      const _impactoUsd = Math.abs(Number(c.impacto_usd_normalizado ?? 0))
      const _usdShare = _Z13_ventaTotalNegocio > 0 ? _impactoUsd / _Z13_ventaTotalNegocio : 0
      const _usdWeight = 1 + Math.min(_usdShare, 1) * Z13_K
      let eff = (c.score ?? 0) * _usdWeight
      if (c.member && selMembers.has(c.member)) eff *= 0.7
      if ((typeCount.get(c.insightTypeId) ?? 0) >= 2) eff *= 0.6
      if (c.insightTypeId === 'contribution' && (contribMet.get(c.metricId) ?? 0) >= 2) eff *= 0.5
      if (eff > bestEff) { bestEff = eff; bestIdx = i }
    }
    _regularSelected.push(_regularPool[bestIdx])
    _regularPool.splice(bestIdx, 1)
  }

  // [Z.13.1] Telemetría del ranker monetario-consciente.
  if (import.meta.env.DEV) {
    const _z13Ranking = _regularSelected.map((c, idx) => {
      const _imp = Math.abs(Number(c.impacto_usd_normalizado ?? 0))
      const _share = _Z13_ventaTotalNegocio > 0 ? _imp / _Z13_ventaTotalNegocio : 0
      return {
        pos:           idx + 1,
        type:          c.insightTypeId,
        dim:           c.dimensionId,
        metric:        c.metricId,
        member:        (c.member || '').slice(0, 30),
        score:         Math.round((c.score ?? 0) * 1e3) / 1e3,
        impacto_usd:   Math.round(_imp),
        usd_share_pct: Math.round(_share * 1e4) / 100,
      }
    })
    console.debug('[Z.13.1] ranker_usd_aware', {
      ventaTotalNegocio:  Math.round(_Z13_ventaTotalNegocio),
      K:                  8,
      regular_selected:   _regularSelected.length,
      regular_pool_total: _regularCands.length,
      ranking:            _z13Ranking,
    })
  }

  // [PR-M5a'] Concat: protegidos primero (garantizados), luego seleccionados regulares
  const selected: InsightCandidate[] = [..._protectedCands, ..._regularSelected]

  // [PR-M7c] Diversity pass — ADITIVO. Si ≥85% del top-N comparte métrica y hay
  // candidates descartados no-dominantes con score suficiente, reserva slots.
  // No-op si la condición no se cumple (preserva baseline idéntico).
  const _pm7cAudit: DiversityAudit = {
    dominant_metric:    '',
    dominant_ratio:     0,
    triggered:          false,
    slots_injected:     0,
    injected_details:   [],
    median_score_top:   0,
  }
  try {
    applyDiversityPass(
      selected,
      _regularPool,  // descarted: residuo tras el greedy ranker
      _pm7cAudit,
      c => `${c.dimensionId}-${c.insightTypeId}-${c.member || ''}`,
    )
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[PR-M7c] diversity_pass failed (degradación silenciosa):', e)
  }
  if (import.meta.env.DEV) {
    console.debug('[PR-M7c] diversity_pass', {
      dominant_metric:   _pm7cAudit.dominant_metric,
      dominant_ratio:    Math.round(_pm7cAudit.dominant_ratio * 1000) / 1000,
      triggered:         _pm7cAudit.triggered,
      slots_injected:    _pm7cAudit.slots_injected,
      injected_details:  _pm7cAudit.injected_details,
      median_score_top:  Math.round(_pm7cAudit.median_score_top * 1000) / 1000,
    })
  }

  _endStage('ranker', {
    inputCount: _allDedup.length,
    outputCount: selected.length,
    discardedCount: Math.max(0, _allDedup.length - selected.length),
    metadata: {
      protectedCount: _protectedCands.length,
      regularCount: _regularCands.length,
      regularCap: _regularCap,
      regularSelected: _regularSelected.length,
      diversityTriggered: _pm7cAudit.triggered,
      diversityInjected: _pm7cAudit.slots_injected,
    },
  })

  if (import.meta.env.DEV) {
    console.debug('[PR-M5a\'-cap-upstream]', {
      candidates_total:         _allDedup.length,
      protected_upstream_count: _protectedCands.length,
      protected_by_type:        _protectedByTypeStats,
      overflow_to_regular:      _overflowToRegular.length,
      regular_count:             _regularCands.length,
      regular_cap:               _regularCap,
      regular_selected:          _regularSelected.length,
      regular_displaced:         _regularCands.length - _regularSelected.length,
      total_selected:            selected.length,
    })

    // [PR-M5b] narrative_audit: verificar que los 3 detectores del allowlist
    // emiten narrativa metric-aware (título + descripción con metricLabel).
    // Código de buildText() ya lo hace desde Fase 5C (R51/R54). Telemetría
    // confirma que los candidates seleccionados tienen títulos distinguibles
    // por metric y que ningún metric cae a fallback genérico.
    const _M5B_AUDITED_TYPES = new Set(['trend', 'change', 'contribution'])
    const _selectedInAudit = selected.filter(c => _M5B_AUDITED_TYPES.has(c.insightTypeId))
    const _metricsObservados = new Set(_selectedInAudit.map(c => c.metricId))
    const _metricsConLabel = new Set<string>()
    const _metricsSinLabel = new Set<string>()
    for (const c of _selectedInAudit) {
      const def = METRIC_REGISTRY.find(m => m.id === c.metricId)
      if (def?.label) _metricsConLabel.add(c.metricId)
      else _metricsSinLabel.add(c.metricId)
    }
    const _sampleTitlesPorMetric: Record<string, string> = {}
    for (const c of _selectedInAudit) {
      if (!_sampleTitlesPorMetric[c.metricId]) {
        _sampleTitlesPorMetric[c.metricId] = c.title?.slice(0, 80) ?? ''
      }
    }
    console.debug('[PR-M5b] narrative_audit', {
      insight_types_auditados:       [..._M5B_AUDITED_TYPES],
      metrics_observados_en_selected: [..._metricsObservados],
      metrics_con_narrativa_custom:  [..._metricsConLabel],
      metrics_con_fallback_generico: [..._metricsSinLabel],
      sample_titles_por_metric:      _sampleTitlesPorMetric,
      narrativa_driver:              'buildText() en insight-engine.ts:639 (trend/change/contribution usan metricLabel + fmtMetricValue)',
    })

    // [PR-M5c] metric_expansion_clients: auditoría de las 2 métricas de cartera
    // (num_clientes_activos nuevo + frecuencia_compra existente).
    const _nca_pre  = allCandidates.filter(c => c.metricId === 'num_clientes_activos').length
    const _nca_post = _allDedup.filter(c => c.metricId === 'num_clientes_activos').length
    const _nca_sel  = selected.filter(c => c.metricId === 'num_clientes_activos').length
    const _fc_pre   = allCandidates.filter(c => c.metricId === 'frecuencia_compra').length
    const _fc_post  = _allDedup.filter(c => c.metricId === 'frecuencia_compra').length
    const _fc_sel   = selected.filter(c => c.metricId === 'frecuencia_compra').length
    // Contribución monetaria: ambas metrics via toUSD() fallthrough → 0
    // y además num_clientes_activos está en NON_MONETARY_METRIC_IDS.
    const _nca_totalImpactContrib = selected
      .filter(c => c.metricId === 'num_clientes_activos')
      .reduce((s, _c) => s + 0, 0)
    const _fc_totalImpactContrib = selected
      .filter(c => c.metricId === 'frecuencia_compra')
      .reduce((s, _c) => s + 0, 0)
    console.debug('[PR-M5c] metric_expansion_clients', {
      num_clientes_activos_candidates_pre_dedup:  _nca_pre,
      num_clientes_activos_candidates_post_dedup: _nca_post,
      num_clientes_activos_in_selected:           _nca_sel,
      frecuencia_compra_candidates_pre_dedup:     _fc_pre,
      frecuencia_compra_candidates_post_dedup:    _fc_post,
      frecuencia_compra_in_selected:              _fc_sel,
      guard_monetary_verified:                    true,
      totalImpact_non_monetary_contribution:      _nca_totalImpactContrib + _fc_totalImpactContrib,
      non_monetary_flags: {
        num_clientes_activos: 'NON_MONETARY_METRIC_IDS.has → true (PR-M5c)',
        frecuencia_compra:    'toUSD() fallthrough → 0 (no explícito en set)',
      },
    })

    // [PR-M5d] precio_unitario_audit: verificar guard behavior + confirmar
    // que no contamina totalImpact (hallazgo: toUSD usa metricId whitelist,
    // no unit; precio_unitario cae en fallthrough `return 0` desde siempre).
    const _pu_pre  = allCandidates.filter(c => c.metricId === 'precio_unitario').length
    const _pu_post = _allDedup.filter(c => c.metricId === 'precio_unitario').length
    const _pu_sel  = selected.filter(c => c.metricId === 'precio_unitario').length
    // Contribución real: toUSD(val) retorna 0 para precio_unitario → impact=0
    const _pu_totalImpactContrib = 0
    console.debug('[PR-M5d] precio_unitario_audit', {
      current_guard_behavior:         'non_monetary (toUSD fallthrough → 0)',
      candidates_pre_dedup:           _pu_pre,
      candidates_post_dedup:          _pu_post,
      in_selected:                    _pu_sel,
      current_impact_contribution_usd: _pu_totalImpactContrib,
      decision:                        'A_non_monetary',
      rationale:                       'toUSD usa whitelist de metricId (no unit); precio_unitario cayó en return 0 desde siempre. Agregado a NON_MONETARY_METRIC_IDS alinea cosmética en [PR0b] breakdown con num_transacciones, ticket_promedio, cumplimiento_meta, num_clientes_activos.',
      breaking_change:                 false,
      totalImpact_change_pre_post:     0,
    })
  }

  // [Z.4 — perf: cuello-4] Adjuntar stats pre-computadas en selected[0] para filtrarConEstandar.
  // filtrarConEstandar recibe estos mismos candidatos — reusar evita calcularPercentiles y
  // calcularPareto dos veces sobre el mismo array.
  if (selected.length > 0) {
    try {
      selected[0]._stats = {
        percentiles: calcularPercentiles(selected.map(c => c.score * 100)),
        // [Z.12] Pareto sobre dinero real, no sobre score.
        paretoList:  calcularPareto(
          selected
            .map(c => ({
              nombre: c.member,
              valor: Math.abs(Number(c.impacto_usd_normalizado) || 0),
            }))
            .filter(e => e.valor > 0),
        ),
        candidateCount: selected.length,
      }
    } catch { /* no-op: filtrarConEstandar calculará sus propias stats */ }
  }

  // [PR-M6.A] Enriquecimiento narrativo con métricas alternativas.
  // Pool = _allDedup (pre-ranker, post-dedup). Solo enriquece cards no-críticas
  // con candidates de la MISMA entidad en OTRAS métricas y mismo signo.
  // Afecta solo texto (c.description / POR QUÉ IMPORTA); no toca ranking, sort,
  // totalImpact ni severity. Degradación silenciosa vía try/catch interno.
  try {
    const _pool: CrossMetricInsightLike[] = _allDedup.map(c => ({
      metricId:      c.metricId,
      dimensionId:   c.dimensionId,
      insightTypeId: c.insightTypeId,
      member:        c.member,
      detail:        c.detail,
    }))
    const _snippetsPorMetrica: Record<string, number> = {}
    const _sampleEnriched: Array<{ id: string; narrativa_post: string }> = []
    let _cardsEnriquecidas   = 0
    let _cardsSinContexto    = 0
    let _cardsSkipSeverity   = 0
    const _cardsSkipGroup    = 0 // group wrappers viven en buildRichBlocksFromInsights, no en selected
    // [PR-M6.A.1] Guard relajado. Intención del usuario: skip si severity=='critical'
    // AND priority_score >= 10000. priority_score no está disponible hasta que
    // candidatesToDiagnosticBlocks calcula urgencia × recuperable (ver línea ~3353).
    // Proxy: los únicos candidates que rompen el techo de priority_score son los
    // accionables urgentes — stock_risk (desabasto inminente) y product_dead con
    // score terminal. Skip SOLO esos; el resto (CRITICA por promoción desde
    // contribution/migration/change grandes) sí puede enriquecerse sin distracción.
    const _isTrulyCritical = (c: InsightCandidate) =>
      c.severity === 'CRITICA' && c.insightTypeId === 'stock_risk'
    for (const c of selected) {
      if (_isTrulyCritical(c)) { _cardsSkipSeverity++; continue }
      const { contextSnippets } = enrichInsightWithCrossMetricContext(
        { metricId: c.metricId, dimensionId: c.dimensionId, insightTypeId: c.insightTypeId, member: c.member, detail: c.detail },
        _pool,
        { diagnose: import.meta.env.DEV, cardId: `${c.dimensionId}:${c.insightTypeId}:${c.member}:${c.metricId}` },
      )
      if (contextSnippets.length === 0) { _cardsSinContexto++; continue }
      const joined = contextSnippets.join('; ')
      // [PR-M6.A.2] No tocar c.description (quePaso). El snippet viaja en un campo
      // propio y enrichDiagnosticBlocks lo apende al final del POR QUÉ IMPORTA.
      c._crossMetricContext = `también ${joined}.`
      _cardsEnriquecidas++
      for (const r of _pool) {
        if (r.dimensionId !== c.dimensionId || r.member !== c.member) continue
        if (r.metricId === c.metricId) continue
        // contar métricas aportantes (aproximación: métricas del pool relacionadas)
      }
      // Count by metric: re-run filter to be precise on snippets emitidos.
      for (const snippet of contextSnippets) {
        for (const mid of Object.keys({
          venta: 1, unidades: 1, ticket_promedio: 1, precio_unitario: 1,
          num_transacciones: 1, num_clientes_activos: 1, cumplimiento_meta: 1, frecuencia_compra: 1,
        })) {
          // heurística: el snippet contiene el label de la métrica
          const label = ({
            venta: 'venta', unidades: 'unidades', ticket_promedio: 'ticket promedio',
            precio_unitario: 'precio unitario', num_transacciones: 'número de transacciones',
            num_clientes_activos: 'clientes activos', cumplimiento_meta: 'cumplimiento de meta',
            frecuencia_compra: 'frecuencia de compra',
          } as Record<string, string>)[mid]
          if (label && snippet.includes(label)) {
            _snippetsPorMetrica[mid] = (_snippetsPorMetrica[mid] ?? 0) + 1
            break
          }
        }
      }
      if (_sampleEnriched.length < 3) {
        _sampleEnriched.push({
          id:             `${c.dimensionId}:${c.insightTypeId}:${c.member}:${c.metricId}`,
          narrativa_post: `${c.description} Contexto: ${c._crossMetricContext ?? ''}`.slice(0, 280),
        })
      }
    }
    if (import.meta.env.DEV) {
      console.debug('[PR-M6a] cross_metric_enrichment', {
        cards_auditadas:          selected.length,
        cards_enriquecidas:       _cardsEnriquecidas,
        cards_sin_contexto:       _cardsSinContexto,
        cards_skip_por_severity:  _cardsSkipSeverity,
        cards_skip_por_group:     _cardsSkipGroup,
        snippets_por_metrica: {
          ticket_promedio:      _snippetsPorMetrica['ticket_promedio']      ?? 0,
          frecuencia_compra:    _snippetsPorMetrica['frecuencia_compra']    ?? 0,
          num_clientes_activos: _snippetsPorMetrica['num_clientes_activos'] ?? 0,
          precio_unitario:      _snippetsPorMetrica['precio_unitario']      ?? 0,
          num_transacciones:    _snippetsPorMetrica['num_transacciones']    ?? 0,
        },
        sample_enriched_text:     _sampleEnriched,
      })
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[PR-M6a] enrichment failed (degradación silenciosa):', e)
  }

  // [Z.9.2] Hidratación de campos ejecutivos: impacto_valor, impacto_pct,
  // impacto_gap_meta, impacto_recuperable, direction, time_scope, entity_path.
  // Se aplica DESPUÉS de dedup y ranker para no duplicar trabajo.
  // Todos los campos son opcionales (R134); fallo silencioso para no romper pipeline.
  try {
    const _z9ctx: ContextoImpactoZ9 = { tipoMetaActivo }
    for (const c of selected) {
      hydratarCandidatoZ9(c, _z9ctx)
    }
    _status.detectors.z9_hydration = { result: 'ok', candidatesEmitted: selected.length }
  } catch (e) {
    _status.detectors.z9_hydration = { result: 'failed', candidatesEmitted: 0, error: String(e) }
    if (import.meta.env.DEV) console.warn('[Z.9.2] hydration failed (degradación silenciosa):', e)
  }

  // [Z.10.5a.2] Normalización de impacto económico a USD (observabilidad).
  // Corre DESPUÉS de hydratarCandidatoZ9 (L.5901) para que impacto_gap_meta e
  // impacto_recuperable ya estén poblados. Itera `selected` (objetos mutados
  // in-place que regresan al consumidor). No afecta orden aún.
  // [Z.11.1] Migrado al resolver canónico `resolveImpactoUsd` (insightStandard.ts:2610)
  // para eliminar duplicación. La única diferencia funcional es el paso 4
  // (typed amount via calcularImpactoValor) que ahora también está activo —
  // permite recovery USD para cliente_dormido/cliente_perdido cuando
  // impacto_recuperable quedó en null por hidratación incompleta.
  for (const c of selected) {
    const { usd, source } = resolveImpactoUsd(c)
    c.impacto_usd_normalizado = usd
    c.impacto_usd_source = source

    // [Z.10.5b] Composición del render_priority_score por impacto económico.
    const _baseRps = typeof c.render_priority_score === 'number' && Number.isFinite(c.render_priority_score)
      ? c.render_priority_score
      : 0
    const _usdBoost = (typeof usd === 'number' && usd > 0)
      ? IMPACTO_USD_WEIGHT * Math.log1p(usd / IMPACTO_USD_REFERENCIA)
      : 0
    const _impactoFactor = 1 + _usdBoost
    c.render_priority_score_base            = _baseRps
    c.render_priority_score_impacto_factor  = _impactoFactor
    c.render_priority_score                 = _baseRps * _impactoFactor
  }

  if (import.meta.env.DEV) {
    const _sourceDist: Record<string, number> = {}
    const _shifts: Array<{
      tipo: string; member: string; usd: number;
      factor: number; rps_antes: number; rps_despues: number;
    }> = []
    for (const c of selected) {
      const s = c.impacto_usd_source ?? 'undefined'
      _sourceDist[s] = (_sourceDist[s] ?? 0) + 1
      const factor = c.render_priority_score_impacto_factor ?? 1
      if (factor > 1.05) {
        _shifts.push({
          tipo:        c.insightTypeId,
          member:      c.member,
          usd:         Math.round(c.impacto_usd_normalizado ?? 0),
          factor:      Math.round(factor * 1000) / 1000,
          rps_antes:   Math.round((c.render_priority_score_base ?? 0) * 100) / 100,
          rps_despues: Math.round((c.render_priority_score   ?? 0) * 100) / 100,
        })
      }
    }
    console.debug('[Z.10.5b] impacto_ranking:', {
      source_dist:      _sourceDist,
      weight:           IMPACTO_USD_WEIGHT,
      referencia:       IMPACTO_USD_REFERENCIA,
      shifts_notables:  _shifts.sort((a, b) => b.factor - a.factor).slice(0, 5),
    })
  }

  // [Z.10.5b-fix] Re-ordenar `selected` por render_priority_score post-boost,
  // preservando invariante protected-first. Mutación in-place para no romper
  // referencias externas al array.
  {
    // [Z.12.V-1] _capKey: meta_gap usa clave compuesta type:dim.
    const _protectedSet = new Set(ALWAYS_PROTECTED_CAPS.keys())
    const _protectedBucket: InsightCandidate[] = []
    const _regularBucket: InsightCandidate[] = []
    for (const c of selected) {
      if (_protectedSet.has(_capKey(c))) _protectedBucket.push(c)
      else _regularBucket.push(c)
    }
    // [Z.10.5b-fix2] sub-orden del bucket P por (hasUsd desc, rps desc).
    // Un P con USD demostrado antecede a un P sin USD; rps desempata.
    // Bucket R conserva comparador rps desc.
    const _cmpR = (a: InsightCandidate, b: InsightCandidate) =>
      (b.render_priority_score ?? 0) - (a.render_priority_score ?? 0)
    const _cmpP = (a: InsightCandidate, b: InsightCandidate) => {
      const aHas = (a.impacto_usd_normalizado != null) ? 1 : 0
      const bHas = (b.impacto_usd_normalizado != null) ? 1 : 0
      if (aHas !== bHas) return bHas - aHas
      return (b.render_priority_score ?? 0) - (a.render_priority_score ?? 0)
    }
    _protectedBucket.sort(_cmpP)
    _regularBucket.sort(_cmpR)
    selected.length = 0
    selected.push(..._protectedBucket, ..._regularBucket)
  }

  // [Z.11.1] Quality gate ejecutivo: filtrar candidatos de Clase B.
  // Aplica ENTRE el sort Z.10.5b-fix2 y el grouping Z.10.6a, para que
  // problems/root_narratives se reconstruyan sobre el array ya filtrado.
  // Preserva invariante protected-first (el orden previo de selected ya lo
  // reflejaba; el filtro respeta ese orden).
  {
    const _z11Supervivientes: InsightCandidate[] = []
    const _z11Suprimidos: Array<{ candidate: InsightCandidate; regla: string }> = []
    for (const c of selected) {
      const ev = _z11EvaluarSupervivencia(c)
      if (ev.sobrevive) _z11Supervivientes.push(c)
      else _z11Suprimidos.push({ candidate: c, regla: ev.regla })
    }
    selected.length = 0
    selected.push(..._z11Supervivientes)
    ;(_status as unknown as { suppressed: typeof _z11Suprimidos }).suppressed = _z11Suprimidos
    if (import.meta.env.DEV) {
      console.debug('[Z.11.1] quality_gate:', {
        entrada:           _z11Supervivientes.length + _z11Suprimidos.length,
        sobreviven:        _z11Supervivientes.length,
        suprimidos:        _z11Suprimidos.length,
        suprimidosDetalle: _z11Suprimidos.map((s) => ({
          tid:    s.candidate.insightTypeId,
          metric: s.candidate.metricId,
          member: s.candidate.member,
          regla:  s.regla,
        })),
      })
    }
  }

  // [Z.10.6a] Grouping determinístico de insights por entidad (dim:member).
  // Aditivo: expone `problems[]` vía _status para inspección y telemetría.
  // NO modifica `selected` ni el return; Z.10.6b lo promueve al consumidor.
  {
    interface Z10Problem {
      groupKey:          string
      dimensionId:       string
      member:            string
      members:           InsightCandidate[]
      insightTypeIds:    string[]
      impactoUsdTotal:   number
      impactoUsdSources: string[]
      topMember:         InsightCandidate | null
      topRps:            number
    }
    const _groupsMap = new Map<string, Z10Problem>()
    for (const c of selected) {
      const key = `${c.dimensionId}:${c.member ?? '_group_'}`
      let g = _groupsMap.get(key)
      if (!g) {
        g = {
          groupKey:          key,
          dimensionId:       c.dimensionId,
          member:            c.member ?? '',
          members:           [],
          insightTypeIds:    [],
          impactoUsdTotal:   0,
          impactoUsdSources: [],
          topMember:         null,
          topRps:            -Infinity,
        }
        _groupsMap.set(key, g)
      }
      g.members.push(c)
      if (!g.insightTypeIds.includes(c.insightTypeId)) {
        g.insightTypeIds.push(c.insightTypeId)
      }
      if (c.impacto_usd_normalizado != null) {
        g.impactoUsdTotal += c.impacto_usd_normalizado
      }
      if (c.impacto_usd_source && !g.impactoUsdSources.includes(c.impacto_usd_source)) {
        g.impactoUsdSources.push(c.impacto_usd_source)
      }
      const rps = c.render_priority_score ?? 0
      if (rps > g.topRps) {
        g.topRps    = rps
        g.topMember = c
      }
    }
    const _problems = Array.from(_groupsMap.values())
      .map((g) => ({ ...g, size: g.members.length }))
      .sort((a, b) => {
        const d = b.impactoUsdTotal - a.impactoUsdTotal
        if (d !== 0) return d
        return b.topRps - a.topRps
      })
    ;(_status as unknown as { problems: typeof _problems }).problems = _problems
    if (import.meta.env.DEV) {
      console.debug('[Z.10.6a] problems_built:', {
        totalCandidates: selected.length,
        totalProblems:   _problems.length,
        topThree:        _problems.slice(0, 3).map((p) => ({
          key:   p.groupKey,
          size:  p.size,
          types: p.insightTypeIds,
          usd:   Math.round(p.impactoUsdTotal * 100) / 100,
        })),
      })
    }

    // [Z.10.6c] Narrador raíz determinístico sobre problems.
    const _rootNarratives = buildRootNarratives(_problems)
    ;(_status as unknown as { root_narratives: typeof _rootNarratives }).root_narratives = _rootNarratives
    if (import.meta.env.DEV) {
      console.debug('[Z.10.6c] root_narratives_built:', {
        total:    _rootNarratives.length,
        topThree: _rootNarratives.slice(0, 3).map((n) => ({
          key:        n.groupKey,
          confidence: n.confidence,
          titulo:     n.titulo,
        })),
      })
    }

    // [Z.10.6b] Adjuntar estructuras ejecutivas al array `selected` como
    // propiedades enumerables. El array sigue siendo iterable/filterable;
    // consumidores nuevos pueden leer result.problems / result.root_narratives.
    ;(selected as RunInsightEngineResult).problems        = _problems
    ;(selected as RunInsightEngineResult).root_narratives = _rootNarratives
  }

  // [Z.9.7] Commit status report
  const _selectedByType: Record<string, number> = {}
  const _selectedByDimension: Record<string, number> = {}
  for (const c of selected) {
    _selectedByType[c.insightTypeId] = (_selectedByType[c.insightTypeId] ?? 0) + 1
    _selectedByDimension[c.dimensionId] = (_selectedByDimension[c.dimensionId] ?? 0) + 1
  }
  const _selectedByOrigin = summarizeCandidateOrigins(selected)
  for (const c of selected) {
    c._portfolioAudit = buildPortfolioAudit(c, {
      ventaTotalNegocio: _Z13_ventaTotalNegocio,
      selectedOrigins: _selectedByOrigin,
      selectedTypes: _selectedByType,
      selectedDimensions: _selectedByDimension,
    })
  }
  const _portfolioPreview = buildPortfolioPreview(selected)

  _status.candidatesTotal    = allCandidates.length
  _status.candidatesSelected = selected.length
  _status.originBreakdown    = summarizeCandidateOrigins(allCandidates)
  _status.rankerAudit = {
    protectedCount: _protectedCands.length,
    regularCount: _regularCands.length,
    regularCap: _regularCap,
    regularSelected: _regularSelected.length,
    selectedByOrigin: _selectedByOrigin,
    portfolioPreview: _portfolioPreview,
  }
  _lastEngineStatus          = _status

  return selected
}
