import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store/appStore'
import { getProjectionsFromBackend } from './forecastApi'
import type { VendorAnalysis } from '../types'

export function useAnalysis() {
  const runningRef = useRef(false)
  const workerRef = useRef<Worker | null>(null)

  const {
    sales,
    metas,
    inventory,
    isProcessed,
    selectedPeriod,
    configuracion,
    tipoMetaActivo,
    setVendorAnalysis,
    setTeamStats,
    setClientesDormidos,
    setConcentracionRiesgo,
    setCategoriasInventario,
    setCategoriasInventarioPorCategoria,
    setSupervisorAnalysis,
    setCategoriaAnalysis,
    setCanalAnalysis,
    setInsights,
    setDataAvailability,
    setIsProcessed,
    setIsLoading,
    setLoadingMessage,
    setForecastLoading,
    supervisorAnalysis,
    categoriaAnalysis,
    canalAnalysis,
    categoriasInventario,
  } = useAppStore(useShallow(s => ({
    sales: s.sales,
    metas: s.metas,
    inventory: s.inventory,
    isProcessed: s.isProcessed,
    selectedPeriod: s.selectedPeriod,
    configuracion: s.configuracion,
    tipoMetaActivo: s.tipoMetaActivo,
    setVendorAnalysis: s.setVendorAnalysis,
    setTeamStats: s.setTeamStats,
    setClientesDormidos: s.setClientesDormidos,
    setConcentracionRiesgo: s.setConcentracionRiesgo,
    setCategoriasInventario: s.setCategoriasInventario,
    setCategoriasInventarioPorCategoria: s.setCategoriasInventarioPorCategoria,
    setSupervisorAnalysis: s.setSupervisorAnalysis,
    setCategoriaAnalysis: s.setCategoriaAnalysis,
    setCanalAnalysis: s.setCanalAnalysis,
    setInsights: s.setInsights,
    setDataAvailability: s.setDataAvailability,
    setIsProcessed: s.setIsProcessed,
    setIsLoading: s.setIsLoading,
    setLoadingMessage: s.setLoadingMessage,
    setForecastLoading: s.setForecastLoading,
    supervisorAnalysis: s.supervisorAnalysis,
    categoriaAnalysis: s.categoriaAnalysis,
    canalAnalysis: s.canalAnalysis,
    categoriasInventario: s.categoriasInventario,
  })))

  useEffect(() => {
    if (sales.length === 0 || isProcessed || runningRef.current) return
    runningRef.current = true

    // Terminate any previous worker
    workerRef.current?.terminate()

    const worker = new Worker(
      new URL('./analysisWorker.ts', import.meta.url),
      { type: 'module' }
    )
    workerRef.current = worker

    setIsLoading(true)
    setLoadingMessage('Iniciando análisis...')

    worker.onmessage = async (event) => {
      const data = event.data

      if (data.type === 'progress') {
        setLoadingMessage(data.message)
        return
      }

      if (data.type === 'result') {
        const {
          vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo,
          categoriasInventario, categoriasInventarioPorCategoria,
          supervisorAnalysis, categoriaAnalysis, canalAnalysis,
          insights, dataAvailability,
        } = data as {
          vendorAnalysis: Parameters<typeof setVendorAnalysis>[0]
          teamStats: Parameters<typeof setTeamStats>[0]
          clientesDormidos: Parameters<typeof setClientesDormidos>[0]
          concentracionRiesgo: Parameters<typeof setConcentracionRiesgo>[0]
          categoriasInventario: Parameters<typeof setCategoriasInventario>[0] | null
          categoriasInventarioPorCategoria: Parameters<typeof setCategoriasInventarioPorCategoria>[0] | null
          supervisorAnalysis: Parameters<typeof setSupervisorAnalysis>[0] | null
          categoriaAnalysis: Parameters<typeof setCategoriaAnalysis>[0] | null
          canalAnalysis: Parameters<typeof setCanalAnalysis>[0] | null
          insights: Parameters<typeof setInsights>[0]
          dataAvailability: Parameters<typeof setDataAvailability>[0]
        }

        setDataAvailability(dataAvailability)
        setVendorAnalysis(vendorAnalysis)
        setTeamStats(teamStats)
        setClientesDormidos(clientesDormidos)
        setConcentracionRiesgo(concentracionRiesgo)
        if (categoriasInventario)  setCategoriasInventario(categoriasInventario)
        if (categoriasInventarioPorCategoria) setCategoriasInventarioPorCategoria(categoriasInventarioPorCategoria)
        if (supervisorAnalysis)    setSupervisorAnalysis(supervisorAnalysis)
        if (categoriaAnalysis)     setCategoriaAnalysis(categoriaAnalysis)
        if (canalAnalysis)         setCanalAnalysis(canalAnalysis)
        setInsights(insights)
        setIsProcessed(true)
        setIsLoading(false)
        setLoadingMessage('')

        // Fetch projections — non-blocking; if found, delegate enrichment to worker
        const metric = dataAvailability.has_venta_neta ? 'revenue' : 'units'
        const vendedores = vendorAnalysis.map((v: { vendedor: string }) => v.vendedor)
        setForecastLoading(true)
        try {
          const projections = await getProjectionsFromBackend(
            selectedPeriod.year, vendedores, metric, 'vendedor',
          )
          if (projections.size > 0 && workerRef.current) {
            // Send projections to worker — generateInsights re-runs off-thread
            workerRef.current.postMessage({
              type: 'enrich',
              projections: Object.fromEntries(projections),
            })
            return  // worker stays alive; waits for type: 'enriched'
          }
        } catch {
          // Backend not available — keep linear projections
        }
        // No projections or error: clean up now
        setForecastLoading(false)
        worker.terminate()
        workerRef.current = null
        runningRef.current = false
        return
      }

      if (data.type === 'enriched') {
        setVendorAnalysis(data.vendorAnalysis as VendorAnalysis[])
        setTeamStats(data.teamStats)
        setInsights(data.insights)
        setForecastLoading(false)
        worker.terminate()
        workerRef.current = null
        runningRef.current = false
      }
    }

    worker.onerror = (err) => {
      setIsLoading(false)
      setLoadingMessage('')
      runningRef.current = false
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ sales, metas, inventory, selectedPeriod, configuracion, tipoMetaActivo })

    return () => {
      worker.terminate()
      workerRef.current = null
      runningRef.current = false
    }
  }, [sales, metas, inventory, isProcessed, selectedPeriod, configuracion, tipoMetaActivo]) // eslint-disable-line
}
