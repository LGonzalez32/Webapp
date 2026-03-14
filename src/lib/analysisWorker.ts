import { buildSaleIndex, computeCommercialAnalysis, computeCategoriasInventario } from './analysis'
import { generateInsights } from './insightEngine'
import type { SaleRecord, MetaRecord, InventoryItem, Configuracion } from '../types'

interface WorkerInput {
  sales: SaleRecord[]
  metas: MetaRecord[]
  inventory: InventoryItem[]
  selectedPeriod: { year: number; month: number }
  configuracion: Configuracion
}

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { sales, metas, inventory, selectedPeriod, configuracion } = event.data

  const post = (message: string) =>
    (self as unknown as Worker).postMessage({ type: 'progress', message })

  // buildSaleIndex hace un solo pass y detecta columnas al mismo tiempo
  post('Indexando registros...')
  const index = buildSaleIndex(sales)

  const dataAvailability = {
    has_producto: index.has_producto,
    has_cliente: index.has_cliente,
    has_venta_neta: index.has_venta_neta,
    has_categoria: index.has_categoria,
    has_canal: index.has_canal,
    has_metas: metas.length > 0,
    has_inventario: inventory.length > 0,
  }

  post('Calculando vendedores...')
  const { vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo } =
    computeCommercialAnalysis(sales, metas, inventory, selectedPeriod, configuracion, index)

  let categoriasInventario = null
  if (dataAvailability.has_inventario) {
    post('Analizando inventario...')
    categoriasInventario = computeCategoriasInventario(
      sales, inventory, selectedPeriod, configuracion, index
    )
  }

  post('Generando insights...')
  const insights = generateInsights(
    vendorAnalysis, teamStats, sales, metas,
    clientesDormidos, concentracionRiesgo,
    dataAvailability, configuracion, selectedPeriod, index,
  )

  ;(self as unknown as Worker).postMessage({
    type: 'result',
    vendorAnalysis,
    teamStats,
    clientesDormidos,
    concentracionRiesgo,
    categoriasInventario,
    insights,
    dataAvailability,
  })
}
