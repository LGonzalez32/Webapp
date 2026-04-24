import {
  buildSaleIndex,
  computeCommercialAnalysis,
  computeCategoriasInventario,
  computeCategoriasInventarioPorCategoria,
  analyzeSupervisor,
  analyzeCategoria,
  analyzeCanal,
  buildAggregatedSummaries,
} from './analysis'
import { generateInsights } from './insightEngine'
import type {
  SaleRecord, MetaRecord, InventoryItem, Configuracion,
  VendorAnalysis, TeamStats, ClienteDormido, ConcentracionRiesgo,
  CategoriaInventario, SupervisorAnalysis, CategoriaAnalysis, CanalAnalysis,
  DataAvailability,
} from '../types'

interface WorkerInput {
  sales: SaleRecord[]
  metas: MetaRecord[]
  inventory: InventoryItem[]
  selectedPeriod: { year: number; month: number }
  configuracion: Configuracion
  tipoMetaActivo?: 'uds' | 'usd'
}

interface EnrichInput {
  type: 'enrich'
  projections: Record<string, number>
}

// Module-level state kept between Phase 1 (initial analysis) and Phase 2 (enrichment)
interface Phase1State {
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats
  clientesDormidos: ClienteDormido[]
  concentracionRiesgo: ConcentracionRiesgo[]
  categoriasInventario: CategoriaInventario[] | null
  supervisorAnalysis: SupervisorAnalysis[] | null
  categoriaAnalysis: CategoriaAnalysis[] | null
  canalAnalysis: CanalAnalysis[] | null
  sales: SaleRecord[]
  metas: MetaRecord[]
  dataAvailability: DataAvailability
  configuracion: Configuracion
  selectedPeriod: { year: number; month: number }
}

let _phase1: Phase1State | null = null

self.onmessage = (event: MessageEvent<WorkerInput | EnrichInput>) => {
  // ── Phase 2 — apply backend projections, re-run generateInsights off-thread ──
  if ((event.data as EnrichInput).type === 'enrich') {
    if (!_phase1) return
    const { projections: projObj } = event.data as EnrichInput
    const projections = new Map<string, number>(Object.entries(projObj))

    const enrichedVendors = _phase1.vendorAnalysis.map(v => {
      const bp = projections.get(v.vendedor)
      if (bp == null || bp === 0) return v
      return { ...v, proyeccion_cierre: bp }
    })

    const equipoProjection = projections.get('all')
    const enrichedTeam = equipoProjection != null && equipoProjection > 0
      ? { ..._phase1.teamStats, proyeccion_equipo: equipoProjection }
      : _phase1.teamStats

    // [PR-L1] telemetría fase 2 (rerun con proyecciones)
    const _pr_l1_p2_t0 = performance.now()
    const insights = generateInsights(
      enrichedVendors,
      enrichedTeam,
      _phase1.sales,
      _phase1.metas,
      _phase1.dataAvailability,
      _phase1.configuracion,
      _phase1.clientesDormidos,
      _phase1.concentracionRiesgo,
      _phase1.categoriasInventario ?? [],
      _phase1.supervisorAnalysis ?? [],
      _phase1.categoriaAnalysis ?? [],
      _phase1.canalAnalysis ?? [],
      _phase1.selectedPeriod,
    )
    console.debug(`[PR-L1] motor1_phase2_rerun_ms: ${Math.round(performance.now() - _pr_l1_p2_t0)}, insights=${insights.length}`)

    ;(self as unknown as Worker).postMessage({
      type: 'enriched',
      vendorAnalysis: enrichedVendors,
      teamStats: enrichedTeam,
      insights,
    })
    _phase1 = null
    return
  }

  // ── Phase 1 — initial analysis ────────────────────────────────────────────
  const { sales, metas, inventory, selectedPeriod, configuracion, tipoMetaActivo } = event.data as WorkerInput

  const post = (message: string) =>
    (self as unknown as Worker).postMessage({ type: 'progress', message })

  // buildSaleIndex hace un solo pass y detecta columnas al mismo tiempo
  post('Indexando registros...')
  const index = buildSaleIndex(sales)

  const dataAvailability = {
    has_producto:   index.has_producto,
    has_cliente:    index.has_cliente,
    has_venta_neta: index.has_venta_neta,
    has_categoria:  index.has_categoria,
    has_canal:      index.has_canal,
    has_supervisor: index.has_supervisor,
    has_departamento: index.has_departamento,
    has_metas:      metas.length > 0,
    has_inventario: inventory.length > 0,
    // [PR-M1] flags para ingesta dual
    has_unidades:        index.has_unidades,
    has_precio_unitario: index.has_precio_unitario,
  }

  // Compute day range for partial-month comparisons
  const fechaRef = index.fechaReferencia.getTime() > 0 ? index.fechaReferencia : new Date()
  const isCurrentMonth = fechaRef.getFullYear() === selectedPeriod.year && fechaRef.getMonth() === selectedPeriod.month
  const diasTotales = new Date(selectedPeriod.year, selectedPeriod.month + 1, 0).getDate()
  const diasTranscurridos = isCurrentMonth ? fechaRef.getDate() : diasTotales

  post('Calculando vendedores...')
  const { vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo } =
    computeCommercialAnalysis(sales, metas, inventory, selectedPeriod, configuracion, index, tipoMetaActivo)

  let categoriasInventario = null
  let categoriasInventarioPorCategoria = null
  if (dataAvailability.has_inventario) {
    post('Analizando inventario...')
    categoriasInventario = computeCategoriasInventario(
      sales, inventory, selectedPeriod, configuracion, index
    )
    if (dataAvailability.has_categoria) {
      post('Agrupando inventario por categoría...')
      categoriasInventarioPorCategoria = computeCategoriasInventarioPorCategoria(
        categoriasInventario, configuracion
      )
    }
  }

  let supervisorAnalysis = null
  if (dataAvailability.has_supervisor) {
    post('Analizando supervisores...')
    supervisorAnalysis = analyzeSupervisor(vendorAnalysis, metas, selectedPeriod, index)
  }

  let categoriaAnalysis = null
  if (dataAvailability.has_categoria) {
    post('Analizando categorías...')
    categoriaAnalysis = analyzeCategoria(metas, selectedPeriod, index, diasTranscurridos, diasTotales)
  }

  let canalAnalysis = null
  if (dataAvailability.has_canal) {
    post('Analizando canales...')
    canalAnalysis = analyzeCanal(selectedPeriod, index, diasTranscurridos, diasTotales)
  }

  post('Agregando resúmenes para páginas...')
  const aggregated = buildAggregatedSummaries(
    sales,
    selectedPeriod,
    clientesDormidos,
    concentracionRiesgo,
    categoriasInventario ?? [],
    dataAvailability,
  )

  post('Generando insights...')
  // [PR-L1] telemetría revertible: medir costo + distribución de motor 1
  const _pr_l1_t0 = performance.now()
  const insights = generateInsights(
    vendorAnalysis, teamStats, sales, metas,
    dataAvailability, configuracion,
    clientesDormidos, concentracionRiesgo,
    categoriasInventario ?? [],
    supervisorAnalysis ?? [],
    categoriaAnalysis ?? [],
    canalAnalysis ?? [],
    selectedPeriod,
  )
  const _pr_l1_motor1_ms = performance.now() - _pr_l1_t0
  // [PR-L1] distribución por tipo/dimensión + sample de IDs para cruzar con render
  const _porTipo: Record<string, number> = {}
  const _porDim: Record<string, number> = {}
  for (const i of insights) {
    const tipo = (i as { tipo?: string }).tipo ?? 'unknown'
    _porTipo[tipo] = (_porTipo[tipo] ?? 0) + 1
    // Inferir dimensión por campos presentes (motor 1 no la declara explícita)
    const rec = i as unknown as Record<string, unknown>
    const dim = rec.vendedor ? 'vendedor'
      : rec.producto ? 'producto'
      : rec.cliente ? 'cliente'
      : rec.departamento ? 'departamento'
      : rec.canal ? 'canal'
      : rec.categoria ? 'categoria'
      : 'equipo'
    _porDim[dim] = (_porDim[dim] ?? 0) + 1
  }
  console.debug('[PR-L1] motor1_insights:', {
    total:         insights.length,
    por_tipo:      _porTipo,
    por_dimension: _porDim,
    tiempo_ms:     Math.round(_pr_l1_motor1_ms),
  })

  // Persist state so Phase 2 (enrich) can reuse it without re-running analysis
  _phase1 = {
    vendorAnalysis,
    teamStats,
    clientesDormidos,
    concentracionRiesgo,
    categoriasInventario,
    supervisorAnalysis,
    categoriaAnalysis,
    canalAnalysis,
    sales,
    metas,
    dataAvailability,
    configuracion,
    selectedPeriod,
  }

  ;(self as unknown as Worker).postMessage({
    type: 'result',
    vendorAnalysis,
    teamStats,
    clientesDormidos,
    concentracionRiesgo,
    categoriasInventario,
    categoriasInventarioPorCategoria,
    supervisorAnalysis,
    categoriaAnalysis,
    canalAnalysis,
    insights,
    dataAvailability,
    clienteSummaries: aggregated.clienteSummaries,
    productoSummaries: aggregated.productoSummaries,
    departamentoSummaries: aggregated.departamentoSummaries,
    mesesDisponibles: aggregated.mesesDisponibles,
    canalesDisponibles: aggregated.canalesDisponibles,
    monthlyTotals: aggregated.monthlyTotals,
    monthlyTotalsSameDay: aggregated.monthlyTotalsSameDay,
    fechaRefISO: aggregated.fechaRefISO,
  })
}
