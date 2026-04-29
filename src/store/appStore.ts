import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { saveDraft as wizardSaveDraft, loadDraft as wizardLoadDraft, clearDraft as wizardClearDraft, flushPendingSaves as wizardFlushPending } from '../lib/wizardCache'
import type {
  ClienteSummary,
  ProductoSummary,
  DepartamentoSummary,
} from '../lib/analysis'
import type {
  SaleRecord,
  MetaRecord,
  InventoryItem,
  VendorAnalysis,
  TeamStats,
  Insight,
  ClienteDormido,
  ConcentracionRiesgo,
  DataAvailability,
  Configuracion,
  CategoriaInventario,
  InventarioPorCategoria,
  ForecastData,
  SupervisorAnalysis,
  CategoriaAnalysis,
  CanalAnalysis,
  ChatClienteContext,
  ChatMessage,
} from '../types'
import type { InsightCandidate } from '../lib/insight-engine'

const DEFAULT_CONFIG: Configuracion = {
  empresa: 'Mi Empresa',
  moneda: '$',
  dias_dormido_threshold: 30,
  semanas_racha_threshold: 3,
  pct_concentracion_threshold: 50,
  umbral_riesgo_quiebre: 7,
  umbral_baja_cobertura: 20,
  umbral_normal: 60,
  tema: 'dark',
  metricaGlobal: 'usd',
  giro: '',
  giro_custom: '',
}

const DEFAULT_AVAILABILITY: DataAvailability = {
  has_producto: false,
  has_cliente: false,
  has_venta_neta: false,
  has_categoria: false,
  has_canal: false,
  has_supervisor: false,
  has_departamento: false,
  has_metas: false,
  has_inventario: false,
  has_unidades: false,
  has_precio_unitario: false,
  has_subcategoria: false,
  has_proveedor: false,
  has_costo_unitario: false,
}

interface AppState {
  // Datos crudos
  sales: SaleRecord[]
  metas: MetaRecord[]
  inventory: InventoryItem[]

  // Resultados del análisis
  vendorAnalysis: VendorAnalysis[]
  teamStats: TeamStats | null
  insights: Insight[]
  // [Z.11.4] Single source of truth: motor 2 candidates post Z.11+Z.12 emitidos
  // por analysisWorker. Page-side los consume directamente cuando selectedMonths
  // es null. NO se persisten (objetos grandes con _stats internos).
  filteredCandidates: InsightCandidate[]
  clientesDormidos: ClienteDormido[]
  concentracionRiesgo: ConcentracionRiesgo[]
  categoriasInventario: CategoriaInventario[]
  categoriasInventarioPorCategoria: InventarioPorCategoria[]
  supervisorAnalysis:  SupervisorAnalysis[]
  categoriaAnalysis:   CategoriaAnalysis[]
  canalAnalysis:       CanalAnalysis[]
  dataAvailability: DataAvailability

  // Resúmenes agregados pre-computados (off-thread). NO se persisten.
  clienteSummaries: ClienteSummary[]
  productoSummaries: ProductoSummary[]
  departamentoSummaries: DepartamentoSummary[]
  mesesDisponibles: number[]
  canalesDisponibles: string[]
  monthlyTotals: Record<string, { uds: number; neta: number }>
  monthlyTotalsSameDay: Record<string, { uds: number; neta: number }>
  fechaRefISO: string | null

  // Contexto temporal para chat (no persistido)
  chatContextVendedor: VendorAnalysis | null
  chatContextCliente: ChatClienteContext | null
  chatMessages: ChatMessage[]

  // Forecast del backend
  forecastData: ForecastData | null
  forecastLoading: boolean        // useAnalysis: enriquecimiento proyeccion_cierre
  forecastChartLoading: boolean   // RendimientoPage: series mensuales para el gráfico

  // Control de UI
  isProcessed: boolean
  isLoading: boolean
  loadingMessage: string
  orgId: string
  dataSource: 'none' | 'demo' | 'real'
  selectedPeriod: { year: number; month: number }
  selectedMonths: { year: number; month: number }[] | null
  tipoMetaActivo: 'uds' | 'usd'

  // Comparativa de períodos
  comparisonEnabled: boolean
  comparisonPeriod: { year: number; month: number } | null

  // [B1] Borrador del wizard de carga (in-memory, no persistido).
  // Sobrevive a navegaciones intra-app entre sidebar/dashboard/upload así que
  // un usuario que sube un archivo y navega antes de "Analizar ventas" no
  // pierde el archivo al volver a /cargar. Se limpia en doAnalyze() y
  // resetAll().
  wizardDraft: null | {
    ventas?: SaleRecord[]
    metas?: MetaRecord[]
    inventario?: InventoryItem[]
    detectedCols?: Record<string, string[]>
    ignoredColumns?: Record<string, string[]>
    discardedRows?: Record<string, unknown[]>
    dateAmbiguity?: Record<string, { convention: string; evidence: string; ambiguous: boolean }>
    warnings?: Record<string, Array<{ code: string; message: string; field?: string }>>
    mapping?: Record<string, Record<string, string>>
    files?: Record<string, File>
    currentStep?: number
    stepStatus?: Record<string, 'pending' | 'loaded' | 'skipped' | 'error'>
  }

  // Configuración
  configuracion: Configuracion

  // Actions — datos crudos
  setSales: (data: SaleRecord[]) => void
  setMetas: (data: MetaRecord[]) => void
  setInventory: (data: InventoryItem[]) => void

  // Actions — resultados
  setVendorAnalysis: (data: VendorAnalysis[]) => void
  setTeamStats: (data: TeamStats | null) => void
  setInsights: (data: Insight[]) => void
  setFilteredCandidates: (data: InsightCandidate[]) => void
  setClientesDormidos: (data: ClienteDormido[]) => void
  setConcentracionRiesgo: (data: ConcentracionRiesgo[]) => void
  setCategoriasInventario:  (data: CategoriaInventario[]) => void
  setCategoriasInventarioPorCategoria: (data: InventarioPorCategoria[]) => void
  setSupervisorAnalysis:    (data: SupervisorAnalysis[]) => void
  setCategoriaAnalysis:     (data: CategoriaAnalysis[]) => void
  setCanalAnalysis:         (data: CanalAnalysis[]) => void
  setDataAvailability: (data: DataAvailability) => void
  setClienteSummaries:      (data: ClienteSummary[]) => void
  setProductoSummaries:     (data: ProductoSummary[]) => void
  setDepartamentoSummaries: (data: DepartamentoSummary[]) => void
  setMesesDisponibles:      (data: number[]) => void
  setCanalesDisponibles:    (data: string[]) => void
  setMonthlyTotals:         (data: Record<string, { uds: number; neta: number }>) => void
  setMonthlyTotalsSameDay:  (data: Record<string, { uds: number; neta: number }>) => void
  setFechaRefISO:           (data: string | null) => void

  // Actions — control
  setIsProcessed: (val: boolean) => void
  setIsLoading: (val: boolean) => void
  setLoadingMessage: (msg: string) => void
  setDataSource: (source: 'none' | 'demo' | 'real') => void
  setSelectedPeriod: (period: { year: number; month: number }) => void
  setSelectedMonths: (months: { year: number; month: number }[] | null) => void
  setTipoMetaActivo: (tipo: 'uds' | 'usd') => void
  setConfiguracion: (config: Partial<Configuracion>) => void
  setChatContextVendedor: (v: VendorAnalysis | null) => void
  setChatContextCliente: (c: ChatClienteContext | null) => void
  setChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void
  setForecastData: (data: ForecastData | null) => void
  setForecastLoading: (loading: boolean) => void
  setForecastChartLoading: (loading: boolean) => void

  // Comparativa
  toggleComparison: () => void
  setComparisonPeriod: (period: { year: number; month: number } | null) => void

  // [B1] Borrador del wizard de carga
  setWizardDraft: (draft: AppState['wizardDraft']) => void
  clearWizardDraft: () => Promise<void>
  hydrateWizardDraftFromCache: () => Promise<void>

  resetAll: () => void
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      // Estado inicial
      sales: [],
      metas: [],
      inventory: [],
      vendorAnalysis: [],
      teamStats: null,
      insights: [],
      filteredCandidates: [],
      clientesDormidos: [],
      concentracionRiesgo: [],
      categoriasInventario: [],
      categoriasInventarioPorCategoria: [],
      supervisorAnalysis:  [],
      categoriaAnalysis:   [],
      canalAnalysis:       [],
      dataAvailability: DEFAULT_AVAILABILITY,
      clienteSummaries: [],
      productoSummaries: [],
      departamentoSummaries: [],
      mesesDisponibles: [],
      canalesDisponibles: [],
      monthlyTotals: {},
      monthlyTotalsSameDay: {},
      fechaRefISO: null,
      chatContextVendedor: null,
      chatContextCliente: null,
      chatMessages: [],
      wizardDraft: null,
      forecastData: null,
      forecastLoading: false,
      forecastChartLoading: false,
      isProcessed: false,
      isLoading: false,
      loadingMessage: '',
      orgId: '',
      dataSource: 'none',
      comparisonEnabled: false,
      comparisonPeriod: null,
      selectedPeriod: {
        year: new Date().getFullYear(),
        month: new Date().getMonth(), // 0-indexed
      },
      selectedMonths: null,
      configuracion: DEFAULT_CONFIG,
      tipoMetaActivo: 'uds',

      // Actions
      setSales: (sales) => set({ sales }),
      setMetas: (metas) => set({ metas }),
      setInventory: (inventory) => set({ inventory }),

      setVendorAnalysis: (vendorAnalysis) => set({ vendorAnalysis }),
      setTeamStats: (teamStats) => set({ teamStats }),
      setInsights: (insights) => set({ insights }),
      setFilteredCandidates: (filteredCandidates) => set({ filteredCandidates }),
      setClientesDormidos: (clientesDormidos) => set({ clientesDormidos }),
      setConcentracionRiesgo: (concentracionRiesgo) => set({ concentracionRiesgo }),
      setCategoriasInventario:  (categoriasInventario)  => set({ categoriasInventario }),
      setCategoriasInventarioPorCategoria: (categoriasInventarioPorCategoria) => set({ categoriasInventarioPorCategoria }),
      setSupervisorAnalysis:    (supervisorAnalysis)    => set({ supervisorAnalysis }),
      setCategoriaAnalysis:     (categoriaAnalysis)     => set({ categoriaAnalysis }),
      setCanalAnalysis:         (canalAnalysis)         => set({ canalAnalysis }),
      setDataAvailability: (dataAvailability) => set({ dataAvailability }),
      setClienteSummaries:      (clienteSummaries)      => set({ clienteSummaries }),
      setProductoSummaries:     (productoSummaries)     => set({ productoSummaries }),
      setDepartamentoSummaries: (departamentoSummaries) => set({ departamentoSummaries }),
      setMesesDisponibles:      (mesesDisponibles)      => set({ mesesDisponibles }),
      setCanalesDisponibles:    (canalesDisponibles)    => set({ canalesDisponibles }),
      setMonthlyTotals:         (monthlyTotals)         => set({ monthlyTotals }),
      setMonthlyTotalsSameDay:  (monthlyTotalsSameDay)  => set({ monthlyTotalsSameDay }),
      setFechaRefISO: (fechaRefISO) => set((state) => {
        const updates: any = { fechaRefISO }
        // Si selectedMonths es null, actualizar selectedPeriod a la nueva fecha de referencia
        if (state.selectedMonths === null && fechaRefISO) {
          const fechaRef = new Date(fechaRefISO)
          updates.selectedPeriod = { year: fechaRef.getFullYear(), month: fechaRef.getMonth() }
        }
        return updates
      }),

      setDataSource: (dataSource) => set({ dataSource }),
      setIsProcessed: (isProcessed) => set({ isProcessed }),
      setLoadingMessage: (loadingMessage) => set({ loadingMessage }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedPeriod: (selectedPeriod) => set({ selectedPeriod, isProcessed: false }),
      setSelectedMonths: (months) => {
        if (months && months.length > 0) {
          const latest = months.reduce((a, b) => (a.year > b.year || (a.year === b.year && a.month > b.month)) ? a : b)
          set({ selectedMonths: months, selectedPeriod: latest })
        } else {
          set((state) => {
            // Cuando es null, mantener selectedPeriod en la fecha de referencia más reciente (fechaRefISO)
            if (state.fechaRefISO) {
              const fechaRef = new Date(state.fechaRefISO)
              return {
                selectedMonths: null,
                selectedPeriod: { year: fechaRef.getFullYear(), month: fechaRef.getMonth() }
              }
            }
            // Fallback: mes más reciente de monthlyTotals
            const keys = Object.keys(state.monthlyTotals)
            if (keys.length > 0) {
              const latestKey = keys.sort((a, b) => b.localeCompare(a))[0]
              const [y, m] = latestKey.split('-').map(Number)
              return { selectedMonths: null, selectedPeriod: { year: y, month: m } }
            }
            return { selectedMonths: null }
          })
        }
      },
      setTipoMetaActivo: (tipoMetaActivo) => set({ tipoMetaActivo, isProcessed: false }),
      setConfiguracion: (config) =>
        set((state) => ({
          configuracion: { ...state.configuracion, ...config },
        })),
      setChatContextVendedor: (chatContextVendedor) => set({ chatContextVendedor }),
      setChatContextCliente: (chatContextCliente) => set({ chatContextCliente }),
      setChatMessages: (chatMessages) => set({ chatMessages }),
      addChatMessage: (message) => set((state) => ({ chatMessages: [...state.chatMessages, message] })),
      clearChatMessages: () => set({ chatMessages: [] }),
      setForecastData: (forecastData) => set({ forecastData }),
      setForecastLoading: (forecastLoading) => set({ forecastLoading }),
      setForecastChartLoading: (forecastChartLoading) => set({ forecastChartLoading }),

      toggleComparison: () => set((state) => ({
        comparisonEnabled: !state.comparisonEnabled,
        comparisonPeriod: !state.comparisonEnabled
          ? (() => {
              const y = state.selectedPeriod.year
              const m = state.selectedPeriod.month
              return m === 0 ? { year: y - 1, month: 11 } : { year: y, month: m - 1 }
            })()
          : null,
      })),
      setComparisonPeriod: (comparisonPeriod) => set({ comparisonPeriod }),

      // [B1] Borrador del wizard
      setWizardDraft: (wizardDraft) => {
        set({ wizardDraft })
        if (wizardDraft) {
          // debounced 500ms internamente; saturar es seguro
          void wizardSaveDraft(wizardDraft).catch(() => { /* graceful */ })
        }
      },
      clearWizardDraft: async () => {
        // Flush antes de set/clear para evitar race "save-after-clear"
        try { await wizardFlushPending() } catch { /* graceful */ }
        set({ wizardDraft: null })
        try { await wizardClearDraft() } catch { /* graceful */ }
      },
      hydrateWizardDraftFromCache: async () => {
        try {
          const cached = await wizardLoadDraft()
          if (!cached) return
          const current = (useAppStore.getState() as AppState).wizardDraft
          // No sobrescribir si la memoria ya tiene draft útil
          const memoryHasDraft = current && (
            (current.ventas?.length ?? 0) > 0 ||
            (current.metas?.length ?? 0) > 0 ||
            (current.inventario?.length ?? 0) > 0 ||
            (current.currentStep ?? 0) > 0
          )
          if (memoryHasDraft) return
          set({ wizardDraft: cached as AppState['wizardDraft'] })
        } catch { /* graceful */ }
      },

      resetAll: () => {
        localStorage.removeItem('salesflow-storage')
        set({
          sales: [],
          metas: [],
          inventory: [],
          chatMessages: [],
          chatContextVendedor: null,
          chatContextCliente: null,
          vendorAnalysis: [],
          teamStats: null,
          insights: [],
          filteredCandidates: [],
          clientesDormidos: [],
          concentracionRiesgo: [],
          categoriasInventario: [],
          categoriasInventarioPorCategoria: [],
          supervisorAnalysis:  [],
          categoriaAnalysis:   [],
          canalAnalysis:       [],
          dataAvailability: DEFAULT_AVAILABILITY,
          clienteSummaries: [],
          productoSummaries: [],
          departamentoSummaries: [],
          mesesDisponibles: [],
          canalesDisponibles: [],
          monthlyTotals: {},
          monthlyTotalsSameDay: {},
          fechaRefISO: null,
          forecastData: null,
          forecastLoading: false,
          forecastChartLoading: false,
          dataSource: 'none',
          comparisonEnabled: false,
          comparisonPeriod: null,
          wizardDraft: null,
          isProcessed: false,
          isLoading: false,
          selectedPeriod: {
            year: new Date().getFullYear(),
            month: new Date().getMonth(),
          },
        })
      },
    }),
    {
      name: 'salesflow-storage',
      version: 9,
      migrate: (persistedState: any) => {
        // v8: remove deepseek_api_key from persisted config (now handled by backend proxy)
        // v9: migrate moneda 'USD' → '$' for display consistency
        const { deepseek_api_key: _, ...cleanConfig } = persistedState?.configuracion ?? {}
        if (cleanConfig.moneda === 'USD') cleanConfig.moneda = '$'
        return {
        selectedPeriod: persistedState?.selectedPeriod ?? {
          year: new Date().getFullYear(),
          month: new Date().getMonth(),
        },
        configuracion: {
          ...DEFAULT_CONFIG,
          ...cleanConfig,
        },
        orgId: persistedState?.orgId ?? '',
        dataSource: persistedState?.dataSource ?? 'none',
      } as any
      },
      // sales/metas/inventory NO se persisten: son muy grandes para localStorage
      // y bloquean el hilo principal al serializarse. Se restauran via IndexedDB o getDemoData().
      partialize: (state) => ({
        selectedPeriod: state.selectedPeriod,
        configuracion: state.configuracion,
        orgId: state.orgId,
        dataSource: state.dataSource,
        tipoMetaActivo: state.tipoMetaActivo,
      }) as any,
    }
  )
)

// ── Hydration hook: esperar a que Zustand rehidrate localStorage ──
import { useState, useEffect } from 'react'

export function useStoreHydrated() {
  const [hydrated, setHydrated] = useState(useAppStore.persist.hasHydrated())
  useEffect(() => {
    const unsub = useAppStore.persist.onFinishHydration(() => setHydrated(true))
    return unsub
  }, [])
  return hydrated
}
