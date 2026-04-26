import { useEffect, useRef } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { useAppStore } from '../store/appStore'
import { getProjectionsFromBackend } from './forecastApi'
import { recordAnalysisWorkerStageReport } from './insight-engine'
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
    setClienteSummaries,
    setProductoSummaries,
    setDepartamentoSummaries,
    setMesesDisponibles,
    setCanalesDisponibles,
    setMonthlyTotals,
    setMonthlyTotalsSameDay,
    setFechaRefISO,
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
    setClienteSummaries: s.setClienteSummaries,
    setProductoSummaries: s.setProductoSummaries,
    setDepartamentoSummaries: s.setDepartamentoSummaries,
    setMesesDisponibles: s.setMesesDisponibles,
    setCanalesDisponibles: s.setCanalesDisponibles,
    setMonthlyTotals: s.setMonthlyTotals,
    setMonthlyTotalsSameDay: s.setMonthlyTotalsSameDay,
    setFechaRefISO: s.setFechaRefISO,
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
          runtimeTelemetry?: Parameters<typeof recordAnalysisWorkerStageReport>[0]
        }

        if (data.runtimeTelemetry) recordAnalysisWorkerStageReport(data.runtimeTelemetry)
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
        if (data.clienteSummaries) setClienteSummaries(data.clienteSummaries)
        if (data.productoSummaries) setProductoSummaries(data.productoSummaries)
        if (data.departamentoSummaries) setDepartamentoSummaries(data.departamentoSummaries)
        if (data.mesesDisponibles) setMesesDisponibles(data.mesesDisponibles)
        if (data.canalesDisponibles) setCanalesDisponibles(data.canalesDisponibles)
        if (data.monthlyTotals) setMonthlyTotals(data.monthlyTotals)
        if (data.monthlyTotalsSameDay) setMonthlyTotalsSameDay(data.monthlyTotalsSameDay)
        if (data.fechaRefISO) setFechaRefISO(data.fechaRefISO)
        setInsights(insights)
        setIsProcessed(true)
        setIsLoading(false)
        setLoadingMessage('')

        // Forecast backend desactivado — el endpoint /forecast/* requiere
        // numpy/pandas que no están instalados en Render. Las proyecciones
        // lineales calculadas localmente son suficientes por ahora.
        // Pendiente: reconectar cuando el backend tenga forecast habilitado.
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
