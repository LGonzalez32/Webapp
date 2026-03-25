import type { SaleRecord } from '../types'

const API_BASE_URL = import.meta.env.VITE_FORECAST_API_URL || 'http://localhost:8000'

interface MonthlyPoint {
  month: number
  value: number | null
}

interface ForecastPoint {
  month: number
  value: number
  lower_bound: number | null
  upper_bound: number | null
}

interface SalesForecastResult {
  year: number
  metric: 'units' | 'revenue'
  vendedor: string
  model_used: string
  actual_monthly: MonthlyPoint[]
  forecast_monthly: ForecastPoint[]
  prior_year_monthly: MonthlyPoint[]
  meta_monthly: MonthlyPoint[]
  ytd_actual: number
  ytd_prior_year: number
  best_month: number | null
  best_month_value: number
  projected_year_total: number
  trend_pct: number
  generated_at: string | null
}

interface SalesForecastResponse {
  success: boolean
  forecast: SalesForecastResult | null
  error: string | null
  message: string | null
}

interface SeriesDataPoint {
  month: number
  value: number | null
}

interface AnnualKPIs {
  ytd: number
  ytd_prior_year: number
  vs_prior_year_pct: number | null
  best_month: MonthlyPoint | null
  projected_year_total: number
}

interface AnnualSeries {
  actual_current_year: SeriesDataPoint[]
  prior_year: SeriesDataPoint[]
  forecast: SeriesDataPoint[]
  meta: SeriesDataPoint[]
}

interface AnnualPerformanceResponse {
  success: boolean
  year: number
  metric: string
  seller: string
  kpis: AnnualKPIs
  series: AnnualSeries
  model_used: string | null
  error: string | null
}

interface GenerateForecastResponse {
  success: boolean
  forecast_id: string | null
  year: number
  vendedor: string
  metric_type: string
  status: string
  message: string | null
  error: string | null
}

class ForecastAPIError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ForecastAPIError'
  }
}

async function fetchJSON<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  })
  
  if (!response.ok) {
    throw new ForecastAPIError(response.status, `HTTP ${response.status}: ${response.statusText}`)
  }
  
  return response.json()
}

export async function syncSalesData(sales: SaleRecord[]): Promise<{ success: boolean; message?: string; error?: string }> {
  try {
    const normalized = sales.map(s => ({
      fecha: s.fecha instanceof Date ? s.fecha.toISOString().split('T')[0] : s.fecha,
      vendedor: s.vendedor,
      unidades: s.unidades,
      venta_neta: s.venta_neta ?? 0,
      producto: s.producto,
      cliente: s.cliente,
    }))
    
    const result = await fetchJSON<{ success: boolean; message?: string; error?: string }>(
      `${API_BASE_URL}/api/v1/forecast/sync-data`,
      {
        method: 'POST',
        body: JSON.stringify({ sales: normalized }),
      }
    )
    
    return result
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error sincronizando datos'
    return { success: false, error: message }
  }
}

export async function generateForecast(
  year: number,
  vendedor: string,
  metric: 'units' | 'revenue',
  horizonMonths: number = 12
): Promise<GenerateForecastResponse> {
  try {
    return await fetchJSON<GenerateForecastResponse>(
      `${API_BASE_URL}/api/v1/forecast/generate`,
      {
        method: 'POST',
        body: JSON.stringify({
          year,
          vendedor,
          metric_type: metric,
          horizon_months: horizonMonths,
        }),
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error generando forecast'
    return {
      success: false,
      forecast_id: null,
      year,
      vendedor,
      metric_type: metric,
      status: 'error',
      message: null,
      error: message,
    }
  }
}

export async function getAnnualPerformance(
  year: number,
  vendedor: string,
  metric: 'units' | 'revenue',
  dimension: 'vendedor' | 'producto' | 'cliente' | 'canal' = 'vendedor',
  dimensionValue: string = 'all'
): Promise<AnnualPerformanceResponse> {
  try {
    return await fetchJSON<AnnualPerformanceResponse>(
      `${API_BASE_URL}/api/v1/forecast/performance`,
      {
        method: 'POST',
        body: JSON.stringify({
          year,
          vendedor,
          metric,
          dimension,
          dimension_value: dimensionValue,
        }),
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error obteniendo rendimiento anual'
    return {
      success: false,
      year,
      metric,
      seller: vendedor,
      kpis: {
        ytd: 0,
        ytd_prior_year: 0,
        vs_prior_year_pct: null,
        best_month: null,
        projected_year_total: 0,
      },
      series: {
        actual_current_year: [],
        prior_year: [],
        forecast: [],
        meta: [],
      },
      model_used: null,
      error: message,
    }
  }
}

export async function getStoredForecast(
  year: number,
  vendedor: string,
  metric: 'units' | 'revenue'
): Promise<SalesForecastResponse> {
  try {
    return await fetchJSON<SalesForecastResponse>(
      `${API_BASE_URL}/api/v1/forecast/${year}/${encodeURIComponent(vendedor)}/${metric}`
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error obteniendo forecast'
    return {
      success: false,
      forecast: null,
      error: message,
      message: null,
    }
  }
}

export async function getProjectionsFromBackend(
  year: number,
  vendedores: string[],
  metric: 'units' | 'revenue',
  dimension: 'vendedor' | 'producto' | 'cliente' | 'canal' = 'vendedor'
): Promise<Map<string, number>> {
  const results = new Map<string, number>()
  const targets = [...vendedores, 'all']

  const settled = await Promise.allSettled(
    targets.map(v => getAnnualPerformance(year, 'all', metric, dimension, v))
  )

  settled.forEach((result, i) => {
    if (result.status === 'fulfilled') {
      const projected = result.value?.kpis?.projected_year_total
      if (projected != null) {
        results.set(targets[i], projected)
      }
    }
  })

  return results
}

export type {
  SalesForecastResult,
  AnnualPerformanceResponse,
  AnnualKPIs,
  AnnualSeries,
  SeriesDataPoint,
  MonthlyPoint,
  ForecastPoint,
}
