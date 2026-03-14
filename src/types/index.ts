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
}

export interface MetaRecord {
  mes_periodo: string // formato "YYYY-MM"
  vendedor: string
  meta: number
  canal?: string
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
  has_metas: boolean
  has_inventario: boolean
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
  ytd_actual?: number
  ytd_anterior?: number
  variacion_ytd_pct?: number | null
}

// ─── ESTADÍSTICAS DEL EQUIPO ──────────────────────────────────────────────────

export interface TeamStats {
  total_ventas: number
  total_unidades: number
  variacion_pct: number | null
  meta_equipo?: number
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
  ytd_actual_equipo?: number
  ytd_anterior_equipo?: number
  variacion_ytd_equipo?: number | null
}

// ─── INSIGHTS ─────────────────────────────────────────────────────────────────

export type InsightTipo =
  | 'riesgo_vendedor'
  | 'riesgo_cliente'
  | 'riesgo_producto'
  | 'riesgo_meta'
  | 'cruzado'

export type InsightPrioridad = 'CRITICA' | 'ALTA' | 'MEDIA' | 'BAJA'

export interface Insight {
  id: string
  tipo: InsightTipo
  prioridad: InsightPrioridad
  emoji: string
  titulo: string
  descripcion: string
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
}

// ─── CLIENTES DORMIDOS ────────────────────────────────────────────────────────

export interface ClienteDormido {
  cliente: string
  vendedor: string
  ultima_compra: Date
  dias_sin_actividad: number
  valor_historico: number
  compras_historicas: number
  recovery_score: number
  recovery_label: 'alta' | 'recuperable' | 'dificil' | 'perdido'
  recovery_explicacion: string
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
  kpis: ForecastKPIs
  series: {
    actual_current_year: SeriesDataPoint[]
    prior_year: SeriesDataPoint[]
    forecast: SeriesDataPoint[]
    meta: SeriesDataPoint[]
  }
}

// ─── UPLOAD / SESIÓN ──────────────────────────────────────────────────────────

export interface UploadStep {
  id: 'ventas' | 'metas' | 'inventario'
  label: string
  description: string
  required: boolean
  status: 'pending' | 'loaded' | 'error' | 'skipped'
  file?: File
  parsedData?: any[]
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
  timestamp: Date
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
  deepseek_api_key?: string
}

// ─── MULTI-TENANT ─────────────────────────────────────────────────────────────

export interface Organization {
  id: string
  name: string
  owner_id: string
  created_at: string
}

export type OrgRole = 'owner' | 'editor' | 'viewer'

export interface OrgMember {
  id: string
  org_id: string
  user_id: string
  role: OrgRole
  joined_at: string
}

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
