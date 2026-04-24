// ─── DATOS CRUDOS ────────────────────────────────────────────────────────────

export interface SaleRecord {
  fecha: Date
  vendedor: string
  unidades: number
  producto?: string
  cliente?: string
  venta_neta?: number
  categoria?: string
  proveedor?: string
  canal?: string
  departamento?: string
  supervisor?: string
  codigo_producto?: string
  codigo_cliente?: string
  // [PR-M1] Clave canónica de cliente derivada por el parser:
  //   codigo_cliente?.trim() || nombre_cliente?.trim().toUpperCase() || null
  // Útil para agregaciones cuando conviven códigos y nombres entre filas.
  clientKey?: string | null
}

export interface MetaRecord {
  mes: number           // 1-12
  anio: number
  meta_uds?: number     // meta en unidades
  meta_usd?: number     // meta en USD (venta neta)
  /** @deprecated — use meta_uds/meta_usd. Kept for migration compatibility */
  meta?: number
  /** @deprecated — use meta_uds/meta_usd */
  tipo_meta?: 'unidades' | 'venta_neta'
  vendedor?:     string
  cliente?:      string
  producto?:     string
  categoria?:    string
  departamento?: string
  supervisor?:   string
  canal?:        string
}

export interface InventoryItem {
  producto: string
  unidades: number
  categoria?: string
  proveedor?: string
}

// ─── DISPONIBILIDAD DE DATOS ──────────────────────────────────────────────────

export interface DataAvailability {
  has_producto: boolean
  has_cliente: boolean
  has_venta_neta: boolean
  has_categoria: boolean
  has_canal: boolean
  has_supervisor: boolean
  has_departamento: boolean
  has_metas: boolean
  has_inventario: boolean
  // [PR-M1] Flags para ingesta dual (métrica global configurable).
  //   has_unidades:        ≥80% filas con unidades>0 (gate de métrica "unidades")
  //   has_precio_unitario: has_unidades && has_venta_neta (derivable)
  has_unidades?: boolean
  has_precio_unitario?: boolean
}

// ─── ANÁLISIS POR VENDEDOR ────────────────────────────────────────────────────

export type RiesgoVendedor = 'critico' | 'riesgo' | 'ok' | 'superando'

export interface VendorAnalysis {
  vendedor: string
  ventas_periodo: number
  unidades_periodo: number
  ventas_mes_anterior: number
  variacion_pct: number | null
  meta?: number
  meta_uds?: number | null
  meta_usd?: number | null
  cumplimiento_pct?: number
  proyeccion_cierre?: number
  ritmo_diario?: number
  ritmo_necesario?: number
  ticket_promedio?: number
  clientes_activos?: number
  semanas_bajo_promedio: number
  promedio_semanal_historico?: number
  promedio_3m?: number
  variacion_vs_promedio_pct?: number | null
  periodos_base_promedio?: number
  riesgo: RiesgoVendedor
  // ── YTD ──
  // Sufijo _uds = unidades · Sufijo _usd = dinero (Venta Neta).
  // Prohibido campos "ytd_actual" sin unidad explícita (ver manifiesto R55).
  ytd_actual_uds?: number
  ytd_anterior_uds?: number
  variacion_ytd_uds_pct?: number | null
  ytd_actual_usd?: number
  ytd_anterior_usd?: number
  variacion_ytd_usd_pct?: number | null
  // ── Enriquecimiento del motor ──
  top_clientes_periodo: Array<{ cliente: string; unidades: number; venta_neta: number | null }> | null
  productos_ausentes: Array<{ producto: string; dias_sin_venta: number; ultimo_periodo: string }> | null
  canal_principal: string | null
  filtro_meta?: { canal: string | null; departamento: string | null; producto: string | null } | null
  productos_lentos_con_historial: Array<{ producto: string; clasificacion_inventario: string; vendedor_vendio_antes: boolean; dias_sin_vender: number }> | null
}

// ─── ESTADÍSTICAS DEL EQUIPO ──────────────────────────────────────────────────

export interface TeamStats {
  total_ventas: number
  total_unidades: number
  variacion_pct: number | null
  meta_equipo?: number
  meta_equipo_total?: number | null
  cumplimiento_equipo?: number
  proyeccion_equipo?: number
  mejor_vendedor: string
  vendedor_critico?: string
  clientes_dormidos_count: number
  productos_sin_movimiento_count: number
  riesgos_concentracion_count: number
  dias_transcurridos: number
  dias_totales: number
  dias_restantes: number
  ytd_actual_equipo_uds?: number
  ytd_anterior_equipo_uds?: number
  variacion_ytd_equipo_uds_pct?: number | null
  meta_cerrada_total?: number
  venta_cerrada_total?: number
  cumplimiento_cerrado?: number
  meses_cerrados?: number[]
}

// ─── INSIGHTS ─────────────────────────────────────────────────────────────────

export type InsightTipo =
  | 'riesgo_vendedor'
  | 'riesgo_cliente'
  | 'riesgo_producto'
  | 'riesgo_inventario'
  | 'riesgo_meta'
  | 'riesgo_equipo'
  | 'cruzado'
  | 'hallazgo'

export type InsightPrioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'

export interface Insight {
  id: string
  tipo: InsightTipo
  prioridad: InsightPrioridad
  emoji: string
  titulo: string
  descripcion: string
  fuente?: 'supervisor'
  vendedor?: string
  cliente?: string
  producto?: string
  valor_numerico?: number
  accion_sugerida?: string
  impacto_economico?: {
    valor: number
    descripcion: string
    tipo: 'perdida' | 'riesgo' | 'oportunidad'
  }
  detector?: string
  trend?: 'improving' | 'worsening' | 'stable'
  // ── v1.1 (insightStandard.ts) — campos opcionales nuevos ──
  conclusion?: string
  accion?: { texto: string; entidades: string[]; respaldo: string; ejecutableEn: string }
  contrastePortafolio?: string
  cruces?: string[]
  metaContext?: { metaMes: number; cumplimiento: number; gap: number; proyeccion: number; tipoMeta: string }
  inventarioContext?: { stock: number; mesesCobertura: number; alerta: string }
  esPositivo?: boolean
  esAccionable?: boolean
  señalesConvergentes?: number
  impactoUSD?: number // [Z.6 F2.1 — hydration fix] R119.2: hidratado en buildRichBlocksFromInsights
}

// ─── CLIENTES DORMIDOS ────────────────────────────────────────────────────────

export interface ClienteDormido {
  cliente: string
  vendedor: string
  ultima_compra: Date
  dias_sin_actividad: number
  valor_yoy_usd: number
  transacciones_yoy: number
  recovery_score: number
  recovery_label: 'alta' | 'recuperable' | 'dificil' | 'perdido'
  recovery_explicacion: string
  frecuencia_esperada_dias: number | null
  threshold_usado: number
}

// ─── CONCENTRACIÓN DE RIESGO ──────────────────────────────────────────────────

export interface ConcentracionRiesgo {
  cliente: string
  pct_del_total: number
  vendedores_involucrados: string[]
  ventas_absolutas: number
}

// ─── FORECAST DESDE BACKEND ───────────────────────────────────────────────────

export interface SeriesDataPoint {
  month: number
  value: number | null
}

export interface ForecastKPIs {
  ytd: number
  ytd_prior_year: number
  vs_prior_year_pct: number | null
  best_month: { month: number; value: number } | null
  projected_year_total: number
}

export interface ForecastData {
  year: number
  metric: 'units' | 'revenue'
  seller: string
  model_used?: string | null
  kpis: ForecastKPIs
  series: {
    actual_current_year: SeriesDataPoint[]
    prior_year: SeriesDataPoint[]
    forecast: SeriesDataPoint[]
    meta: SeriesDataPoint[]
  }
}

// ─── PARSE ERRORS ─────────────────────────────────────────────────────────────

export type ParseError =
  | { code: 'FORMAT_NOT_SUPPORTED'; message: string }
  | { code: 'MULTIPLE_SHEETS'; sheets: string[]; message: string }
  | { code: 'NO_VALID_COLUMNS'; found: string[]; message: string }
  | { code: 'MISSING_REQUIRED'; missing: string[]; found: string[]; message: string }
  | { code: 'EMPTY_FILE'; message: string }
  | { code: 'INVALID_DATES'; sample: string[]; message: string }
  | { code: 'FILE_PROTECTED_OR_CORRUPT'; message: string }
  | { code: 'ENCODING_ISSUE'; sample: string[]; message: string }
  | { code: 'UNKNOWN'; message: string }

export interface DiscardedRow {
  rowNumber: number
  rawData: Record<string, string>
  reason: string
}

export type ParseResult<T> =
  | { success: true; data: T[]; columns: string[]; sheetName?: string; discardedRows?: DiscardedRow[] }
  | { success: false; error: ParseError }

// ─── UPLOAD / SESIÓN ──────────────────────────────────────────────────────────

export interface UploadStep {
  id: 'ventas' | 'metas' | 'inventario'
  label: string
  description: string
  required: boolean
  status: 'pending' | 'loaded' | 'error' | 'skipped'
  file?: File
  parsedData?: any[]
  parseError?: ParseError
}

export interface ValidationIssue {
  type: 'error' | 'warning'
  code: string
  message: string
  rows?: number[]
  count?: number
}

export interface FileValidationResult {
  isValid: boolean
  errors: ValidationIssue[]
  warnings: ValidationIssue[]
  rowCount: number
  validRowCount: number
  detectedColumns: string[]
}

// ─── CHAT ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  displayContent?: string
  source?: string
  timestamp: Date
  navegacion?: { ruta: string; label: string }
  isDeepAnalysis?: boolean
  isError?: boolean
  errorKey?: string
  followUps?: string[]
  chart?: { type: string; title: string; data: { label: string; value: number; target?: number; status?: string }[]; color?: string } | null
  charts?: { type: string; title: string; data: { label: string; value: number; target?: number; status?: string }[]; color?: string }[]
}

// ─── INVENTARIO ANALÍTICO ─────────────────────────────────────────────────────

export type ClasificacionInventario =
  | 'riesgo_quiebre'
  | 'baja_cobertura'
  | 'normal'
  | 'lento_movimiento'
  | 'sin_movimiento'

export interface CategoriaInventario {
  producto: string
  categoria: string
  unidades_actuales: number
  pm3: number
  dias_inventario: number
  clasificacion: ClasificacionInventario
  ultimo_movimiento?: Date
}

// ─── INVENTARIO AGRUPADO POR CATEGORÍA ───────────────────────────────────────

export interface InventarioPorCategoria {
  categoria: string
  productos_total: number
  unidades_totales: number
  pm3_total: number
  dias_inventario_promedio: number
  capital_inmovilizado_pct: number
  productos_quiebre: number
  productos_baja_cobertura: number
  productos_lento: number
  productos_sin_movimiento: number
  clasificacion_categoria: 'critica' | 'riesgo' | 'normal' | 'sobrestock'
}

// ─── ANÁLISIS POR SUPERVISOR ──────────────────────────────────────────────────

export interface SupervisorAnalysis {
  supervisor: string
  vendedores: string[]
  ventas_periodo: number
  meta_zona: number | null
  cumplimiento_pct: number | null
  proyeccion_cierre: number
  variacion_pct: number
  vendedores_criticos: number
  vendedores_riesgo: number
  vendedores_ok: number
  vendedores_superando: number
  riesgo_zona: 'critico' | 'riesgo' | 'ok' | 'superando'
  ytd_actual_uds: number
  ytd_anterior_uds: number
}

// ─── ANÁLISIS POR CATEGORÍA ───────────────────────────────────────────────────

export interface CategoriaAnalysis {
  categoria: string
  ventas_periodo: number
  ventas_anterior: number
  variacion_pct: number
  pm3: number
  variacion_vs_pm3: number
  meta_categoria: number | null
  cumplimiento_pct: number | null
  top_vendedores: string[]
  top_clientes: string[]
  tendencia: 'crecimiento' | 'estable' | 'caida' | 'colapso' | 'sin_datos'
  participacion_pct: number
}

// ─── ANÁLISIS POR CANAL ───────────────────────────────────────────────────────

export interface CanalAnalysis {
  canal: string
  ventas_periodo: number
  ventas_anterior: number
  variacion_pct: number
  pm3: number
  participacion_pct: number
  top_vendedor: string | null
  top_cliente: string | null
  activo_periodo: boolean
  activo_anterior: boolean
  tendencia: 'crecimiento' | 'estable' | 'caida' | 'desaparecido'
}

// ─── CONFIGURACIÓN ────────────────────────────────────────────────────────────

export interface Configuracion {
  empresa: string
  moneda: string
  dias_dormido_threshold: number
  semanas_racha_threshold: number
  pct_concentracion_threshold: number
  umbral_riesgo_quiebre: number
  umbral_baja_cobertura: number
  umbral_normal: number
  tema: 'dark' | 'light'
  metricaGlobal: 'usd' | 'uds'
  giro: string
  giro_custom: string
}

// ─── MULTI-TENANT ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  owner_id: string
  created_at: string
  allow_open_join?: boolean
}

export type OrgRole = 'owner' | 'admin' | 'editor' | 'viewer'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  joined_at: string
  allowed_pages?: string[] | null
}

/** @deprecated No usado en el flujo actual. El join se hace via link abierto (allow_open_join). */
export interface OrgInvitation {
  id: string
  org_id: string
  email: string
  role: OrgRole
  token: string
  accepted_at: string | null
  expires_at: string
  created_at: string
}

// ─── CHAT CONTEXT CLIENTE (puente ClientesPage → ChatPage) ───────────────────

export type ChatClienteContext =
  | {
      tipo: 'dormido'
      cliente: string
      vendedor: string
      dias_sin_actividad: number
      transacciones_yoy: number
      valor_yoy_usd: number
      recovery_score: number
      recovery_explicacion: string
      frecuencia_esperada_dias: number | null
    }
  | {
      tipo: 'top'
      nombre: string
      vendedor: string
      totalUnidades: number
      totalVenta: number
      varPct: number | null
      cumulativePct: number
    }

// ─── CHAT CONTEXT (para IA) ───────────────────────────────────────────────────

export interface ChatContext {
  configuracion: Configuracion
  selectedPeriod: { year: number; month: number }
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats | null
  insights: Insight[]
  clientesDormidos: ClienteDormido[]
  concentracionRiesgo: ConcentracionRiesgo[]
  categoriasInventario: CategoriaInventario[]
  dataAvailability: DataAvailability
}
