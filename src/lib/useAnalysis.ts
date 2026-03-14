import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { getProjectionsFromBackend } from './forecastApi'
import { generateInsights } from './insightEngine'

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
    setVendorAnalysis,
    setTeamStats,
    setClientesDormidos,
    setConcentracionRiesgo,
    setCategoriasInventario,
    setInsights,
    setDataAvailability,
    setIsProcessed,
    setIsLoading,
    setLoadingMessage,
    setForecastLoading,
  } = useAppStore()

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
          categoriasInventario, insights, dataAvailability,
        } = data

        setDataAvailability(dataAvailability)
        setVendorAnalysis(vendorAnalysis)
        setTeamStats(teamStats)
        setClientesDormidos(clientesDormidos)
        setConcentracionRiesgo(concentracionRiesgo)
        if (categoriasInventario) setCategoriasInventario(categoriasInventario)
        setInsights(insights)

        // Publish initial results immediately
        setIsProcessed(true)
        setIsLoading(false)
        setLoadingMessage('')

        // Enrich projections from backend (background, non-blocking)
        const metric = dataAvailability.has_venta_neta ? 'revenue' : 'units'
        const vendedores = vendorAnalysis.map((v: { vendedor: string }) => v.vendedor)
        setForecastLoading(true)
        try {
          const projections = await getProjectionsFromBackend(
            selectedPeriod.year, vendedores, metric, 'vendedor',
          )
          if (projections.size > 0) {
            const enrichedVendors = vendorAnalysis.map((v: { vendedor: string; proyeccion_cierre?: number }) => {
              const bp = projections.get(v.vendedor)
              return bp != null ? { ...v, proyeccion_cierre: bp } : v
            })
            const equipoProjection = projections.get('all')
            const enrichedTeam = equipoProjection != null
              ? { ...teamStats, proyeccion_equipo: equipoProjection }
              : teamStats
            setVendorAnalysis(enrichedVendors)
            setTeamStats(enrichedTeam)

            // Regenerar insights con proyecciones reales del backend
            const refreshedInsights = generateInsights(
              enrichedVendors,
              enrichedTeam,
              sales,
              metas,
              clientesDormidos,
              concentracionRiesgo,
              dataAvailability,
              configuracion,
              selectedPeriod,
            )
            setInsights(refreshedInsights)
          }
        } catch {
          // Backend not available — keep linear projections
        } finally {
          setForecastLoading(false)
        }

        worker.terminate()
        workerRef.current = null
        runningRef.current = false
      }
    }

    worker.onerror = (err) => {
      console.error('Analysis worker error:', err)
      setIsLoading(false)
      setLoadingMessage('')
      runningRef.current = false
      worker.terminate()
      workerRef.current = null
    }

    worker.postMessage({ sales, metas, inventory, selectedPeriod, configuracion })

    return () => {
      worker.terminate()
    }
  }, [sales, metas, inventory, isProcessed, selectedPeriod, configuracion]) // eslint-disable-line
}
