// R107: tipos del contrato de salida del motor de diagnóstico.
// Fuente única — importar desde aquí, no desde diagnostic-engine.

// [Z.9.3a] Cadena causal sobre DiagnosticBlock[] — renombrado del placeholder original
// (era InsightChain con { root_insight_id, nodos }). Renombrado para liberar
// 'InsightChain' para el nuevo shape de Z.9.3 (sobre InsightCandidate).
export interface DiagnosticBlockChain {
  root_insight_id: string
  nodos: DiagnosticBlock[]
}

// [Z.9.3] Placeholder para el nuevo InsightChain sobre InsightCandidate.
// Tipos completos declarados en Z.9.3 (decision-engine.ts).
// Se mantiene aquí para que DiagnosticBlock.chain pueda tiparlo.
export interface InsightChainNode {
  candidateId: string
  level: number
  relationType: "root" | "cause" | "subcause" | "support"
  children: InsightChainNode[]
}

export interface InsightChain {
  chainId: string
  rootCandidateId: string
  rootProblemKey: string
  totalImpactValue: number | null
  nodes: InsightChainNode[]
  depth: number
  width: number
}

export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface DiagnosticLink {
  label: string
  target: string
  type: 'vendedor' | 'cliente' | 'producto' | 'categoria'
}

export interface DiagnosticSection {
  label: string
  type: 'bullet' | 'action'
  items: string[]
}

export interface DiagnosticBlock {
  id: string
  severity: DiagnosticSeverity
  headline: string
  summaryShort: string
  sections: DiagnosticSection[]
  links: DiagnosticLink[]
  insightIds: string[]
  impactoTotal: number | null
  impactoLabel: string | null
  // [Z.5 — Frente 2] R119: impacto económico canónico en USD. 0 si no monetizable directamente.
  impactoUSD: number
  // R65: badges visibles de métrica y ventana (e.g. ['USD', 'YTD'] or ['Uds', 'Mes actual'])
  metadataBadges?: string[]
  // Fase 5B.4: `dormidoMeta` retirado — los dormidos se presentan como cualquier
  // otro insight (uniformidad visual). El umbral vive en la narrativa, no en metadata.
  // [PR-0] Métrica no monetaria (txns, ticket prom, %): se muestra en ranking pero no suma a totalImpact.
  non_monetary?: boolean
  // [PR-1] Campos de accionabilidad — calculados en PR-2/PR-3, inicializados en null.
  impacto_recuperable?: number | null
  impacto_recuperable_pct?: number | null   // [0, 1]
  urgencia_temporal?: number | null         // [0, 1]
  priority_score?: number | null
  // [PR-1] Agrupación (PR-5) y chaining (PR-6).
  parent_id?: string | null
  chain?: DiagnosticBlockChain | null     // Z.9.3a: renombrado de InsightChain
  // [PR-6] Entidad canónica del bloque — usada en matching de pertenencia. Prefijo _ = interno.
  _member?: string | null
  // [PR-2.1c] Dirección del insight frente a recuperable:
  //  - 'recuperable': impact negativo (caída/brecha) — aplica calcularImpactoRecuperable
  //  - 'positivo':    impact positivo (upside) — no aplica recuperable
  //  - 'neutral':     non_monetary / stock_excess / info sin dirección clara
  direccion?: 'recuperable' | 'positivo' | 'neutral'
  // [PR-6.1b] Dimensión canónica del bloque (vendedor/cliente/categoria/producto/meta)
  // para alineación de niveles en el chaining — prioritaria sobre parsing del id.
  _dimension?: string
  // [PR-M6.A.2] Contexto cruzado de métricas alternativas — apendado al final del
  // POR QUÉ IMPORTA en enrichDiagnosticBlocks (diagnostic-actions.ts). Formato:
  // "también aumentó su ticket promedio (+8.1%); aumentaron sus unidades (+12.4%)".
  _crossMetricContext?: string | null
}
