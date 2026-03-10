import { useEffect, useRef } from 'react'
import { useAppStore } from '../store/appStore'
import { computeCommercialAnalysis, computeCategoriasInventario } from './analysis'
import { generateInsights } from './insightEngine'
import { detectDataAvailability } from './fileParser'

export function useAnalysis() {
  const {
    sales,
    metas,
    inventory,
    isProcessed,
    isLoading,
    selectedPeriod,
    configuracion,
    setVendorAnalysis,
    setTeamStats,
    setInsights,
    setClientesDormidos,
    setConcentracionRiesgo,
    setCategoriasInventario,
    setDataAvailability,
    setIsProcessed,
    setIsLoading,
    setLoadingMessage,
  } = useAppStore()

  const runningRef = useRef(false)

  useEffect(() => {
    if (sales.length === 0 || isProcessed || runningRef.current) return

    runningRef.current = true
    setIsLoading(true)

    const totalVendors = new Set(sales.map((s) => s.vendedor)).size
    setLoadingMessage(`Agrupando ${sales.length.toLocaleString()} registros · ${totalVendors} vendedores...`)

    const timer = setTimeout(() => {
      try {
        setLoadingMessage(`Detectando columnas disponibles...`)

        const detected = detectDataAvailability(sales)
        const availability = {
          ...detected,
          has_metas: metas.length > 0,
          has_inventario: inventory.length > 0,
        }
        setDataAvailability(availability)

        setLoadingMessage(`Analizando ${totalVendors} vendedores · ${sales.length.toLocaleString()} registros...`)

        const { vendorAnalysis, teamStats, clientesDormidos, concentracionRiesgo } =
          computeCommercialAnalysis(sales, metas, inventory, selectedPeriod, configuracion)

        setVendorAnalysis(vendorAnalysis)
        setTeamStats(teamStats)
        setClientesDormidos(clientesDormidos)
        setConcentracionRiesgo(concentracionRiesgo)

        if (availability.has_inventario) {
          setLoadingMessage(`Evaluando ${inventory.length} productos en inventario...`)
          const categoriasInventario = computeCategoriasInventario(
            sales, inventory, selectedPeriod, configuracion
          )
          setCategoriasInventario(categoriasInventario)
        }

        setLoadingMessage(`Generando ${totalVendors} análisis individuales · buscando insights...`)

        const insights = generateInsights(
          vendorAnalysis,
          teamStats,
          sales,
          metas,
          clientesDormidos,
          concentracionRiesgo,
          availability,
          configuracion,
          selectedPeriod,
        )
        setInsights(insights)

        setLoadingMessage('')
        setIsProcessed(true)
      } catch (err) {
        console.error('[useAnalysis] Error durante el análisis:', err)
        setLoadingMessage('')
      } finally {
        setIsLoading(false)
        runningRef.current = false
      }
    }, 50)

    return () => {
      clearTimeout(timer)
      runningRef.current = false
    }
  }, [sales, metas, inventory, isProcessed, selectedPeriod, configuracion]) // eslint-disable-line

  return { isLoading: isLoading && !isProcessed }
}
