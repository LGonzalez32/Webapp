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
import { runInsightEngine, filtrarConEstandar } from './insight-engine'
import { getAgregadosParaFiltro } from './domain-aggregations'
import { candidatesToInsights } from './insightAdapter'
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

    // [Step B] Phase 2 rerun usa motor 2 + adapter (motor 1 deprecado del flujo de store).
    const _pr_l1_p2_t0 = performance.now()
    const _candidatesP2 = runInsightEngine({
      sales:              _phase1.sales,
      metas:              _phase1.metas,
      vendorAnalysis:     enrichedVendors,
      categoriaAnalysis:  _phase1.categoriaAnalysis ?? [],
      canalAnalysis:      _phase1.canalAnalysis ?? [],
      supervisorAnalysis: _phase1.supervisorAnalysis ?? [],
      concentracionRiesgo: _phase1.concentracionRiesgo,
      clientesDormidos:   _phase1.clientesDormidos,
      categoriasInventario: _phase1.categoriasInventario ?? [],
      selectedPeriod:     _phase1.selectedPeriod,
      tipoMetaActivo:     (_phase1.configuracion as { tipoMetaActivo?: 'uds' | 'usd' }).tipoMetaActivo ?? 'usd',
    })
    const _agregadosP2 = getAgregadosParaFiltro(_phase1.sales, _phase1.selectedPeriod)
    const _diaDelMesP2 = (() => {
      const fechas = _phase1.sales
        .map(s => new Date(s.fecha))
        .filter(d => d.getFullYear() === _phase1!.selectedPeriod.year && d.getMonth() === _phase1!.selectedPeriod.month)
      if (fechas.length === 0) return new Date(_phase1!.selectedPeriod.year, _phase1!.selectedPeriod.month + 1, 0).getDate()
      return Math.max(...fechas.map(d => d.getDate()))
    })()
    const _diasEnMesP2 = new Date(_phase1.selectedPeriod.year, _phase1.selectedPeriod.month + 1, 0).getDate()
    const _filteredP2 = filtrarConEstandar(_candidatesP2, {
      diaDelMes:        _diaDelMesP2,
      diasEnMes:        _diasEnMesP2,
      sales:            _phase1.sales,
      metas:            _phase1.metas,
      inventory:        _phase1.categoriasInventario ?? [],
      clientesDormidos: _phase1.clientesDormidos,
      ventaTotalNegocio: _agregadosP2.ventaTotalNegocio,
      tipoMetaActivo:   (_phase1.configuracion as { tipoMetaActivo?: 'uds' | 'usd' }).tipoMetaActivo ?? 'usd',
      selectedPeriod:   _phase1.selectedPeriod,
      agregados:        _agregadosP2,
    })
    const insights = candidatesToInsights(_filteredP2)
    console.debug(`[Step B] motor2_phase2_rerun_ms: ${Math.round(performance.now() - _pr_l1_p2_t0)}, insights=${insights.length}`)

    ;(self as unknown as Worker).postMessage({
      type: 'enriched',
      vendorAnalysis: enrichedVendors,
      teamStats: enrichedTeam,
      insights,
      // [Z.11.4] Single source of truth: page-side consume estos candidates
      // del store en lugar de re-correr runInsightEngine + filtrarConEstandar.
      filteredCandidates: _filteredP2,
    })
    _phase1 = null
    return
  }

  // ── Phase 1 — initial analysis ────────────────────────────────────────────
  const { sales, metas, inventory, selectedPeriod, configuracion, tipoMetaActivo } = event.data as WorkerInput
  const _analysisWorkerT0 = performance.now()

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
    // [schema-cleanup] flags de las columnas opcionales nuevas que la UI gatea.
    has_subcategoria:    index.has_subcategoria,
    has_proveedor:       index.has_proveedor,
    has_costo_unitario:  index.has_costo_unitario,
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
  // [Step B — total migration] Motor 2 (runInsightEngine + filtrarConEstandar) +
  // adapter `candidatesToInsights` reemplaza a motor 1 como fuente de `store.insights`.
  // Motor 1 (`insightEngine.ts → generateInsights`) sigue intacto pero ya no es invocado.
  const _step_b_t0 = performance.now()
  const _tipoMetaWorker = (configuracion as { tipoMetaActivo?: 'uds' | 'usd' }).tipoMetaActivo ?? tipoMetaActivo ?? 'usd'
  const _candidates = runInsightEngine({
    sales,
    metas,
    vendorAnalysis,
    categoriaAnalysis:  categoriaAnalysis ?? [],
    canalAnalysis:      canalAnalysis ?? [],
    supervisorAnalysis: supervisorAnalysis ?? [],
    concentracionRiesgo,
    clientesDormidos,
    categoriasInventario: categoriasInventario ?? [],
    selectedPeriod,
    tipoMetaActivo:     _tipoMetaWorker,
  })
  const _agregados = getAgregadosParaFiltro(sales, selectedPeriod)
  const _filtered = filtrarConEstandar(_candidates, {
    diaDelMes:        diasTranscurridos,
    diasEnMes:        diasTotales,
    sales,
    metas,
    inventory:        categoriasInventario ?? [],
    clientesDormidos,
    ventaTotalNegocio: _agregados.ventaTotalNegocio,
    tipoMetaActivo:   _tipoMetaWorker,
    selectedPeriod,
    agregados:        _agregados,
  })
  const insights = candidatesToInsights(_filtered)
  const _step_b_ms = performance.now() - _step_b_t0
  const _porTipo: Record<string, number> = {}
  const _porDim: Record<string, number> = {}
  for (const c of _filtered) {
    _porTipo[c.insightTypeId] = (_porTipo[c.insightTypeId] ?? 0) + 1
    _porDim[c.dimensionId] = (_porDim[c.dimensionId] ?? 0) + 1
  }
  console.debug('[Step B] motor2_insights:', {
    candidates_raw:    _candidates.length,
    candidates_filtered: _filtered.length,
    insights_adapted:  insights.length,
    por_tipo:          _porTipo,
    por_dimension:     _porDim,
    tiempo_ms:         Math.round(_step_b_ms),
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
    // [Z.11.4] Single source of truth: page-side consume estos candidates
    // del store directamente (post-Ticket 2.4.4 selectedMonths removido).
    filteredCandidates: _filtered,
    dataAvailability,
    clienteSummaries: aggregated.clienteSummaries,
    productoSummaries: aggregated.productoSummaries,
    departamentoSummaries: aggregated.departamentoSummaries,
    mesesDisponibles: aggregated.mesesDisponibles,
    canalesDisponibles: aggregated.canalesDisponibles,
    monthlyTotals: aggregated.monthlyTotals,
    monthlyTotalsSameDay: aggregated.monthlyTotalsSameDay,
    fechaRefISO: aggregated.fechaRefISO,
    runtimeTelemetry: {
      id: 'analysis_worker',
      status: 'ok',
      durationMs: Math.round(performance.now() - _analysisWorkerT0),
      inputCount: sales.length,
      outputCount: insights.length,
      metadata: {
        metas: metas.length,
        inventory: inventory.length,
        vendors: vendorAnalysis.length,
        clientesDormidos: clientesDormidos.length,
        categoriasInventario: categoriasInventario?.length ?? 0,
        supervisorAnalysis: supervisorAnalysis?.length ?? 0,
        categoriaAnalysis: categoriaAnalysis?.length ?? 0,
        canalAnalysis: canalAnalysis?.length ?? 0,
        motor2EngineMs: Math.round(_step_b_ms),
      },
    },
  })
}
