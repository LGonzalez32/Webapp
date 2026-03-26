import { create } from 'zustand'
import { persist } from 'zustand/middleware'
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

const DEFAULT_CONFIG: Configuracion = {
  empresa: 'Mi Empresa',
  moneda: 'USD',
  dias_dormido_threshold: 30,
  semanas_racha_threshold: 3,
  pct_concentracion_threshold: 50,
  umbral_riesgo_quiebre: 7,
  umbral_baja_cobertura: 20,
  umbral_normal: 60,
  tema: 'dark',
}

const DEFAULT_AVAILABILITY: DataAvailability = {
  has_producto: false,
  has_cliente: false,
  has_venta_neta: false,
  has_categoria: false,
  has_canal: false,
  has_supervisor: false,
  has_metas: false,
  has_inventario: false,
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
  clientesDormidos: ClienteDormido[]
  concentracionRiesgo: ConcentracionRiesgo[]
  categoriasInventario: CategoriaInventario[]
  categoriasInventarioPorCategoria: InventarioPorCategoria[]
  supervisorAnalysis:  SupervisorAnalysis[]
  categoriaAnalysis:   CategoriaAnalysis[]
  canalAnalysis:       CanalAnalysis[]
  dataAvailability: DataAvailability

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
  selectedPeriod: { year: number; month: number }

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
  setClientesDormidos: (data: ClienteDormido[]) => void
  setConcentracionRiesgo: (data: ConcentracionRiesgo[]) => void
  setCategoriasInventario:  (data: CategoriaInventario[]) => void
  setCategoriasInventarioPorCategoria: (data: InventarioPorCategoria[]) => void
  setSupervisorAnalysis:    (data: SupervisorAnalysis[]) => void
  setCategoriaAnalysis:     (data: CategoriaAnalysis[]) => void
  setCanalAnalysis:         (data: CanalAnalysis[]) => void
  setDataAvailability: (data: DataAvailability) => void

  // Actions — control
  setIsProcessed: (val: boolean) => void
  setIsLoading: (val: boolean) => void
  setLoadingMessage: (msg: string) => void
  setSelectedPeriod: (period: { year: number; month: number }) => void
  setConfiguracion: (config: Partial<Configuracion>) => void
  setChatContextVendedor: (v: VendorAnalysis | null) => void
  setChatContextCliente: (c: ChatClienteContext | null) => void
  setChatMessages: (messages: ChatMessage[]) => void
  addChatMessage: (message: ChatMessage) => void
  clearChatMessages: () => void
  setForecastData: (data: ForecastData | null) => void
  setForecastLoading: (loading: boolean) => void
  setForecastChartLoading: (loading: boolean) => void

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
      clientesDormidos: [],
      concentracionRiesgo: [],
      categoriasInventario: [],
      categoriasInventarioPorCategoria: [],
      supervisorAnalysis:  [],
      categoriaAnalysis:   [],
      canalAnalysis:       [],
      dataAvailability: DEFAULT_AVAILABILITY,
      chatContextVendedor: null,
      chatContextCliente: null,
      chatMessages: [],
      forecastData: null,
      forecastLoading: false,
      forecastChartLoading: false,
      isProcessed: false,
      isLoading: false,
      loadingMessage: '',
      orgId: '',
      selectedPeriod: {
        year: new Date().getFullYear(),
        month: new Date().getMonth(), // 0-indexed
      },
      configuracion: DEFAULT_CONFIG,

      // Actions
      setSales: (sales) => set({ sales }),
      setMetas: (metas) => set({ metas }),
      setInventory: (inventory) => set({ inventory }),

      setVendorAnalysis: (vendorAnalysis) => set({ vendorAnalysis }),
      setTeamStats: (teamStats) => set({ teamStats }),
      setInsights: (insights) => set({ insights }),
      setClientesDormidos: (clientesDormidos) => set({ clientesDormidos }),
      setConcentracionRiesgo: (concentracionRiesgo) => set({ concentracionRiesgo }),
      setCategoriasInventario:  (categoriasInventario)  => set({ categoriasInventario }),
      setCategoriasInventarioPorCategoria: (categoriasInventarioPorCategoria) => set({ categoriasInventarioPorCategoria }),
      setSupervisorAnalysis:    (supervisorAnalysis)    => set({ supervisorAnalysis }),
      setCategoriaAnalysis:     (categoriaAnalysis)     => set({ categoriaAnalysis }),
      setCanalAnalysis:         (canalAnalysis)         => set({ canalAnalysis }),
      setDataAvailability: (dataAvailability) => set({ dataAvailability }),

      setIsProcessed: (isProcessed) => set({ isProcessed }),
      setLoadingMessage: (loadingMessage) => set({ loadingMessage }),
      setIsLoading: (isLoading) => set({ isLoading }),
      setSelectedPeriod: (selectedPeriod) => set({ selectedPeriod, isProcessed: false }),
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

      resetAll: () => {
        localStorage.removeItem('salesflow-storage')
        set({
          sales: [],
          metas: [],
          inventory: [],
          chatMessages: [],
          vendorAnalysis: [],
          teamStats: null,
          insights: [],
          clientesDormidos: [],
          concentracionRiesgo: [],
          categoriasInventario: [],
          categoriasInventarioPorCategoria: [],
          supervisorAnalysis:  [],
          categoriaAnalysis:   [],
          canalAnalysis:       [],
          dataAvailability: DEFAULT_AVAILABILITY,
          forecastData: null,
          forecastLoading: false,
          forecastChartLoading: false,
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
      version: 5,
      migrate: (persistedState: any) => ({
        selectedPeriod: persistedState?.selectedPeriod ?? {
          year: new Date().getFullYear(),
          month: new Date().getMonth(),
        },
        configuracion: {
          ...DEFAULT_CONFIG,
        },
        orgId: persistedState?.orgId ?? '',
      }) as any,
      // sales/metas/inventory NO se persisten: son muy grandes para localStorage
      // y bloquean el hilo principal al serializarse. El usuario vuelve a subir el archivo.
      partialize: (state) => ({
        selectedPeriod: state.selectedPeriod,
        configuracion: state.configuracion,
        orgId: state.orgId,
      }) as any,
    }
  )
)
