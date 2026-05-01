import { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDemoPath } from '../lib/useDemoPath'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { salesInPeriod, periodKey } from '../lib/analysis'
import {
  getVentasNetaPeriodo,
  getMatrizHistoricaVendedorMes,
  getSupervisorMap,
  getListaSupervisores,
  getMetaMes,
  type MatrizVendedorMesEntry,
} from '../lib/domain-aggregations'
import { Target, TrendingUp, TrendingDown, Upload, PenLine, ChevronDown, BarChart2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { callAI } from '../lib/chatService'
import AnalysisDrawer from '../components/ui/AnalysisDrawer'
import { parseMetasFile } from '../lib/fileParser'
import MetasPivotPanel from '../components/MetasPivotPanel'
import { SFSelect } from '../components/ui/SFSelect'
import type { MetaRecord } from '../types'

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function CumplimientoBadge({ pct }: { pct: number | null }) {
  if (pct === null) return <span className="text-zinc-600 text-[10px]">—</span>
  const color =
    pct >= 100 ? 'text-[#00B894] bg-[#00B894]/10' :
      pct >= 80 ? 'text-yellow-400 bg-yellow-400/10' : 'text-red-400 bg-red-400/10'
  return (
    <span className={cn('px-2 py-0.5 rounded text-[10px] font-black', color)}>
      {pct.toFixed(0)}%
    </span>
  )
}

export default function MetasPage() {
  useAnalysis()
  const navigate = useNavigate()
  const dp = useDemoPath()
  const { sales, metas, dataAvailability, selectedPeriod, configuracion, vendorAnalysis, isProcessed, setMetas, tipoMetaActivo, setTipoMetaActivo } = useAppStore()

  useEffect(() => {
    if (isProcessed && !dataAvailability.has_metas && !sales.length) navigate(dp('/dashboard'))
  }, [isProcessed, dataAvailability.has_metas, sales.length, navigate])

  const currentYear = selectedPeriod.year
  const currentMonth = selectedPeriod.month
  const moneda = configuracion.moneda
  const [metaAnalysisMap, setMetaAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null }>>({})
  const [expandedMetaVendedor, setExpandedMetaVendedor] = useState<string | null>(null)

  // ── Input mode (manual / excel) ─────────────────────────────────────────
  const [inputMode, setInputMode] = useState<'manual' | 'excel' | null>(null)
  const [manualDraft, setManualDraft] = useState<Record<string, Record<number, { meta_uds?: number; meta_usd?: number }>>>({}) // vendedor → mes → {meta_uds, meta_usd}
  const [excelError, setExcelError] = useState<string | null>(null)
  const [excelLoading, setExcelLoading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // [fix-1.2] vendedoresActivos deriva de metas (no de ventas): incluye vendedores
  // con meta asignada aunque no tengan ventas en el período seleccionado.
  const vendedoresActivos = useMemo(() => {
    const s = new Set(
      metas.filter(m => m.anio === currentYear && m.vendedor).map(m => m.vendedor!)
    )
    return Array.from(s).sort()
  }, [metas, currentYear])

  // ── Dimension breakdown (C2) ──────────────────────────────────────────────
  type DimView = 'vendedor' | 'canal' | 'categoria'
  const [dimView, setDimView] = useState<DimView>('vendedor')

  const dimValues = useMemo(() => {
    if (dimView === 'vendedor') return vendedoresActivos
    if (dimView === 'canal') {
      const s = new Set(sales.map(s => s.canal).filter((c): c is string => Boolean(c)))
      return Array.from(s).sort()
    }
    const s = new Set(sales.map(s => s.categoria).filter((c): c is string => Boolean(c)))
    return Array.from(s).sort()
  }, [dimView, vendedoresActivos, sales])

  const dimRows = useMemo(() => {
    const getMetaVal = (m: MetaRecord) => tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)
    const getSalesVal = (arr: typeof sales) => tipoMetaActivo === 'usd'
      ? arr.reduce((a, s) => a + (s.venta_neta ?? 0), 0)
      : arr.reduce((a, s) => a + s.unidades, 0)

    const matchesDim = (val: string) => (m: MetaRecord | typeof sales[0], isDim: 'meta' | 'sale') => {
      if (isDim === 'meta') {
        const mr = m as MetaRecord
        if (dimView === 'vendedor') return mr.vendedor === val && !mr.canal && !mr.categoria && !mr.cliente
        if (dimView === 'canal') return mr.canal === val && !mr.vendedor && !mr.categoria && !mr.cliente
        return mr.categoria === val && !mr.vendedor && !mr.canal && !mr.cliente
      }
      const sr = m as typeof sales[0]
      if (dimView === 'vendedor') return sr.vendedor === val
      if (dimView === 'canal') return sr.canal === val
      return sr.categoria === val
    }

    return dimValues.map(val => {
      const matchMeta = matchesDim(val)
      const matchSale = matchesDim(val)

      const metasMes = metas.filter(m => m.anio === currentYear && m.mes === currentMonth + 1 && matchMeta(m, 'meta'))
      const metaMes = metasMes.reduce((a, m) => a + getMetaVal(m), 0)
      const salesMes = salesInPeriod(sales, currentYear, currentMonth).filter(s => matchSale(s, 'sale'))
      const realMes = getSalesVal(salesMes)
      const pctMes = metaMes > 0 ? (realMes / metaMes) * 100 : null

      const metasYTD = metas.filter(m => m.anio === currentYear && m.mes >= 1 && m.mes <= currentMonth + 1 && matchMeta(m, 'meta'))
      const metaYTD = metasYTD.reduce((a, m) => a + getMetaVal(m), 0)
      const salesYTD = sales.filter(s => {
        const d = new Date(s.fecha)
        return d.getFullYear() === currentYear && d.getMonth() <= currentMonth && matchSale(s, 'sale')
      })
      const realYTD = getSalesVal(salesYTD)
      const pctYTD = metaYTD > 0 ? (realYTD / metaYTD) * 100 : null

      return { val, metaMes, realMes, pctMes, metaYTD, realYTD, pctYTD }
    })
  }, [dimValues, dimView, metas, sales, currentYear, currentMonth, tipoMetaActivo])

  const buildDraft = useCallback(() => {
    const draft: Record<string, Record<number, { meta_uds?: number; meta_usd?: number }>> = {}
    for (const v of vendedoresActivos) {
      draft[v] = {}
      for (let mes = 1; mes <= 12; mes++) {
        const existing = metas.find(m => m.vendedor === v && m.mes === mes && m.anio === currentYear)
        draft[v][mes] = {
          meta_uds: existing?.meta_uds ?? existing?.meta ?? 0,
          meta_usd: existing?.meta_usd ?? 0,
        }
      }
    }
    return draft
  }, [vendedoresActivos, metas, currentYear])

  const handleManualSave = useCallback(() => {
    const vendedorSet = new Set(vendedoresActivos)
    const nuevasMetas: MetaRecord[] = [...metas.filter(m => !(m.anio === currentYear && m.vendedor && vendedorSet.has(m.vendedor) && !m.cliente && !m.producto))]
    vendedoresActivos.forEach(v => {
      for (let mes = 1; mes <= 12; mes++) {
        const cell = manualDraft[v]?.[mes]
        if (!cell) continue
        const uds = cell.meta_uds ?? 0
        const usd = cell.meta_usd ?? 0
        if (uds > 0 || usd > 0) {
          nuevasMetas.push({
            mes, anio: currentYear, vendedor: v,
            ...(uds > 0 ? { meta_uds: uds, meta: uds, tipo_meta: 'unidades' as const } : {}),
            ...(usd > 0 ? { meta_usd: usd } : {}),
          })
        }
      }
    })
    setMetas(nuevasMetas)
    setInputMode(null)
    setManualDraft({})
  }, [manualDraft, vendedoresActivos, metas, currentYear, setMetas])

  const initManualDraft = useCallback(() => {
    setManualDraft(buildDraft())
  }, [buildDraft])

  const handleExcelFile = useCallback(async (file: File) => {
    setExcelLoading(true)
    setExcelError(null)
    const result = await parseMetasFile(file)
    setExcelLoading(false)
    if (!result.success) {
      const err = result as { success: false; error: { message: string } }
      setExcelError(err.error?.message ?? 'Error al parsear el archivo')
      return
    }
    const parsedMetas = result.data
    const draft = buildDraft()
    for (const row of parsedMetas) {
      if (row.vendedor && row.anio === currentYear && draft[row.vendedor]) {
        const cell = draft[row.vendedor][row.mes] ?? { meta_uds: 0, meta_usd: 0 }
        if (row.meta_usd) cell.meta_usd = row.meta_usd
        if (row.meta_uds) cell.meta_uds = row.meta_uds
        else if (row.meta) cell.meta_uds = row.meta
        draft[row.vendedor][row.mes] = cell
      }
    }
    setManualDraft(draft)
    setInputMode('manual')
    setExcelError(null)
  }, [currentYear, buildDraft])

  // R103: derivación local — día máximo con datos del período activo, usado para UI "en curso" y prompts IA
  const maxDayInPeriod = useMemo(() => {
    const periodSales = sales.filter(s => {
      const d = new Date(s.fecha)
      return d.getFullYear() === currentYear && d.getMonth() === currentMonth
    })
    if (periodSales.length === 0) return 0
    return periodSales.reduce((max, s) => Math.max(max, new Date(s.fecha).getDate()), 0)
  }, [sales, currentYear, currentMonth])
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate()

  const handleAnalyzeMetaVendedor = useCallback(async (vendor: string, pct: number | null, realVal: number, metaVal: number | null) => {
    setExpandedMetaVendedor(vendor)
    setMetaAnalysisMap(prev => ({ ...prev, [vendor]: { loading: true, text: null } }))

    const va = vendorAnalysis.find(v => v.vendedor === vendor)
    const systemPrompt = `Eres un analista comercial de ${configuracion.empresa}.
Responde en este formato exacto:

📊 RESUMEN: [Hallazgo principal en máximo 15 palabras]

📈 CUMPLIMIENTO:
- [Estado actual vs meta — máximo 2 bullets con números]

⚠️ RIESGO:
- [Riesgo de no cumplir o factor clave — máximo 2 bullets]

💡 ACCIÓN: [Una acción concreta para mejorar cumplimiento]

Reglas: máximo 100 palabras, cada bullet con número concreto, sin instrucciones operativas, moneda: ${moneda}, español.`

    const userPrompt = [
      `Vendedor: ${vendor}`,
      `Cumplimiento: ${pct != null ? `${pct.toFixed(1)}%` : 'N/A'}`,
      `Real: ${realVal.toLocaleString()} uds | Meta: ${metaVal?.toLocaleString() ?? 'N/A'} uds`,
      va?.variacion_ytd_usd_pct != null ? `Variación YTD (dinero): ${va.variacion_ytd_usd_pct.toFixed(1)}%` : '',
      va?.variacion_ytd_uds_pct != null ? `Variación YTD (uds): ${va.variacion_ytd_uds_pct.toFixed(1)}%` : '',
      va ? `Estado: ${va.riesgo.toUpperCase()}` : '',
      `Día ${maxDayInPeriod} de ${daysInMonth} del mes`,
    ].filter(Boolean).join('\n')

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 250, temperature: 0.3 },
      )
      setMetaAnalysisMap(prev => ({ ...prev, [vendor]: { loading: false, text: json.choices?.[0]?.message?.content ?? 'Sin respuesta' } }))
    } catch {
      setMetaAnalysisMap(prev => ({ ...prev, [vendor]: { loading: false, text: 'No se pudo conectar con el asistente IA.' } }))
    }
  }, [configuracion, vendorAnalysis, moneda, maxDayInPeriod, daysInMonth])

  // R103: lookup UI — vendors desde metas (no desde ventas crudas), para renderizar filas de la tabla
  const vendors = useMemo(() => {
    const s = new Set(metas.map((m) => m.vendedor).filter(v => v && v.trim() !== ''))
    return Array.from(s).sort()
  }, [metas])

  // R103: derivación local — últimos 6 meses como labels para encabezados de tabla (UI)
  const histMonths = useMemo(() => {
    const months: { year: number; month: number; label: string }[] = []
    for (let i = 5; i >= 0; i--) {
      let m = currentMonth - i
      let y = currentYear
      while (m < 0) { m += 12; y-- }
      months.push({ year: y, month: m, label: `${MESES_SHORT[m]} ${y !== currentYear ? y : ''}`.trim() })
    }
    return months
  }, [currentYear, currentMonth])

  // R102/Z.1.b: migrado a domain-aggregations.getMatrizHistoricaVendedorMes
  const matrix = useMemo<MatrizVendedorMesEntry[]>(
    () => getMatrizHistoricaVendedorMes(
      sales, metas, vendors, histMonths, vendorAnalysis, currentYear, currentMonth, tipoMetaActivo,
    ),
    [vendors, histMonths, metas, sales, vendorAnalysis, currentYear, currentMonth, tipoMetaActivo],
  )

  // getMetaMes: filtro canónico single-dim desde domain-aggregations (B2).
  const teamMeta = getMetaMes(metas, currentYear, currentMonth, tipoMetaActivo)

  // R103: derivación local — periodSales es una slice de ventas para el mes activo; se usa también en teamRealUds
  const periodSales = useMemo(() => salesInPeriod(sales, currentYear, currentMonth), [sales, currentYear, currentMonth])

  const teamRealUds = periodSales.reduce((a, s) => a + s.unidades, 0)
  // R102/Z.1.b: migrado a domain-aggregations.getVentasNetaPeriodo (R104: teamRealNeto reutilizado por MetasPage y futuras páginas)
  const teamRealNeto = useMemo(
    () => getVentasNetaPeriodo(sales, currentYear, currentMonth),
    [sales, currentYear, currentMonth],
  )
  const teamReal = tipoMetaActivo === 'usd' ? teamRealNeto : teamRealUds

  const teamPct = teamMeta > 0 ? (teamReal / teamMeta) * 100 : null
  const showUSD = tipoMetaActivo === 'usd'

  // R102/Z.1.b: migrado a domain-aggregations.getSupervisorMap (R104: reutilizado por MetasPage y VendedoresPage en Z.2)
  const supervisorMap = useMemo(() => getSupervisorMap(sales), [sales])
  // R102/Z.1.b: migrado a domain-aggregations.getListaSupervisores (R104: derivación canónica de supervisorMap)
  const supervisores = useMemo(() => getListaSupervisores(supervisorMap), [supervisorMap])
  const hasSupervisores = supervisores.length > 0

  // Projection helpers
  const teamProyectado = maxDayInPeriod > 0 && teamMeta > 0 ? Math.round((teamReal / maxDayInPeriod) * daysInMonth) : 0
  const pctProyectado = teamMeta > 0 ? Math.round((teamProyectado / teamMeta) * 100) : 0
  const pctRitmo = maxDayInPeriod > 0 ? Math.round((maxDayInPeriod / daysInMonth) * 100) : 0

  const fmtVal = (v: number) => tipoMetaActivo === 'usd' ? `${moneda}${v.toLocaleString()}` : `${v.toLocaleString()} uds`

  if (!dataAvailability.has_metas && !sales.length) return null

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-3xl font-bold tracking-tight" style={{ color: 'var(--sf-t1)' }}>Metas de Ventas</h1>
          <p className="mt-1" style={{ color: 'var(--sf-t4)' }}>Progreso vs objetivo por vendedor</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { if (inputMode === 'manual') { setInputMode(null); setManualDraft({}) } else { setInputMode('manual'); initManualDraft() } }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ background: inputMode === 'manual' ? 'rgba(16,185,129,0.15)' : 'transparent', color: inputMode === 'manual' ? '#10b981' : 'var(--sf-t2)', border: `1px solid ${inputMode === 'manual' ? 'rgba(16,185,129,0.3)' : 'var(--sf-border)'}` }}
          >
            <PenLine className="w-3.5 h-3.5" />
            Editar metas
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${inputMode === 'manual' ? 'rotate-180' : ''}`} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{ color: 'var(--sf-t3)', border: '1px solid var(--sf-border)' }}
          >
            <Upload className="w-3.5 h-3.5" />
            Importar Excel
          </button>
          <input ref={fileInputRef} type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleExcelFile(f); e.target.value = '' }} />
          {excelLoading && <span className="text-xs" style={{ color: 'var(--sf-t4)' }}>Procesando…</span>}
          {excelError && <span className="text-xs text-red-400">{excelError}</span>}
          {dataAvailability.has_venta_neta && (
            <div className="flex items-center gap-1 rounded-lg p-1" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
              <button
                onClick={() => setTipoMetaActivo('uds')}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={tipoMetaActivo === 'uds' ? { background: 'rgba(16,185,129,0.2)', color: '#10b981' } : { color: 'var(--sf-t3)' }}
              ># Uds</button>
              <button
                onClick={() => setTipoMetaActivo('usd')}
                className="px-3 py-1 rounded-md text-sm font-medium transition-colors"
                style={tipoMetaActivo === 'usd' ? { background: 'rgba(16,185,129,0.2)', color: '#10b981' } : { color: 'var(--sf-t3)' }}
              >$ USD</button>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--sf-t4)' }}>
            <Target className="w-4 h-4 text-[#00B894]" />
            <span>{MESES_SHORT[currentMonth]} {currentYear}</span>
          </div>
        </div>
      </div>

      {/* ── Panel de entrada manual — tabla spreadsheet ──────────────────── */}
      {inputMode === 'manual' && (
        <div style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)', borderRadius: 12, padding: 20 }}>
          <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--sf-t3)' }}>
            Metas del año
          </p>
          <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--sf-border)' }}>
            <table className="w-full text-sm" style={{ borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--sf-border)' }}>
                  <th className="sticky left-0 z-10 px-4 py-2 text-left text-xs font-semibold uppercase tracking-wide" style={{ background: 'var(--sf-card)', color: 'var(--sf-t3)', minWidth: 160 }}>
                    Vendedor
                  </th>
                  {MESES_SHORT.map((name, i) => {
                    const mes = i + 1
                    const isCurrent = mes === currentMonth + 1
                    return (
                      <th key={mes} className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide" style={{ minWidth: 80, color: isCurrent ? '#10b981' : 'var(--sf-t3)', background: isCurrent ? 'rgba(16,185,129,0.05)' : undefined }}>
                        <div>{name}</div>
                        <div className="text-[10px] font-normal opacity-60">{tipoMetaActivo === 'usd' ? 'USD' : 'Uds'}</div>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {vendedoresActivos.map(v => (
                  <tr key={v} style={{ borderBottom: '0.5px solid var(--sf-border)' }}>
                    <td className="sticky left-0 z-10 px-4 py-1.5 font-medium whitespace-nowrap" style={{ background: 'var(--sf-card)', color: 'var(--sf-t1)' }}>
                      {v}
                    </td>
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                      const isCurrent = mes === currentMonth + 1
                      const cell = manualDraft[v]?.[mes]
                      const cellVal = tipoMetaActivo === 'usd' ? (cell?.meta_usd ?? 0) : (cell?.meta_uds ?? 0)
                      return (
                        <td key={mes} className="px-1 py-0.5" style={{ background: isCurrent ? 'rgba(16,185,129,0.05)' : undefined }}>
                          <input
                            type="number"
                            value={cellVal || ''}
                            onChange={e => {
                              const val = e.target.value === '' ? 0 : parseFloat(e.target.value)
                              const field = tipoMetaActivo === 'usd' ? 'meta_usd' : 'meta_uds'
                              setManualDraft(prev => ({
                                ...prev,
                                [v]: { ...prev[v], [mes]: { ...prev[v]?.[mes], [field]: val } },
                              }))
                            }}
                            placeholder={tipoMetaActivo === 'usd' ? '0.00' : '0'}
                            className="w-full bg-transparent text-right text-sm px-1.5 py-1 rounded border border-transparent hover:border-[var(--sf-border)] focus:border-emerald-500/50 focus:outline-none focus:bg-[var(--sf-card)] tabular-nums [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                            style={{ color: 'var(--sf-t1)' }}
                          />
                        </td>
                      )
                    })}
                  </tr>
                ))}
                <tr style={{ borderTop: '2px solid var(--sf-border)' }}>
                  <td className="sticky left-0 z-10 px-4 py-2 text-xs font-semibold uppercase" style={{ background: 'var(--sf-card)', color: 'var(--sf-t2)' }}>
                    Equipo
                  </td>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map(mes => {
                    const total = vendedoresActivos.reduce((sum, v) => {
                      const cell = manualDraft[v]?.[mes]
                      return sum + (tipoMetaActivo === 'usd' ? (cell?.meta_usd ?? 0) : (cell?.meta_uds ?? 0))
                    }, 0)
                    const isCurrent = mes === currentMonth + 1
                    return (
                      <td key={mes} className="px-2 py-2 text-right text-sm tabular-nums font-semibold" style={{ color: isCurrent ? '#10b981' : 'var(--sf-t2)', background: isCurrent ? 'rgba(16,185,129,0.05)' : undefined }}>
                        {total > 0 ? total.toLocaleString() : ''}
                      </td>
                    )
                  })}
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-end gap-3 mt-4">
            <button
              onClick={() => { setInputMode(null); setManualDraft({}) }}
              className="px-4 py-2 rounded-lg text-[13px] transition-colors"
              style={{ background: 'var(--sf-inset)', color: 'var(--sf-t4)', border: '1px solid var(--sf-border)' }}
            >
              Cancelar
            </button>
            <button
              onClick={handleManualSave}
              className="px-4 py-2 rounded-lg text-[13px] font-bold hover:opacity-90 transition-opacity"
              style={{ background: '#00B894', color: '#020C18' }}
            >
              Guardar metas
            </button>
          </div>
        </div>
      )}

      {/* ── Contenido principal (solo cuando hay metas cargadas) ────────── */}
      {!dataAvailability.has_metas && (
        <div className="rounded-2xl p-10 flex flex-col items-center gap-3" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <Target className="w-8 h-8" style={{ color: 'var(--sf-t5)' }} />
          <p className="text-[14px]" style={{ color: 'var(--sf-t4)' }}>No hay metas cargadas. Usa los botones de arriba para ingresarlas.</p>
        </div>
      )}

      {dataAvailability.has_metas && <>
      {/* Team progress card */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
        <p className="text-xs font-semibold uppercase tracking-wide mb-4" style={{ color: 'var(--sf-t4)' }}>
          Progreso del Equipo — {MESES_SHORT[currentMonth]}
        </p>
        {/* Three KPIs */}
        <div className="flex items-start gap-6 mb-4 flex-wrap">
          <div>
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--sf-t4)' }}>Vendido</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--sf-t1)' }}>{fmtVal(teamReal)}</p>
            <p className="text-xs" style={{ color: 'var(--sf-t4)' }}>{teamPct !== null ? `${teamPct.toFixed(1)}% de la meta` : '—'}</p>
          </div>
          <div className="w-px h-10 self-center" style={{ background: 'var(--sf-border)' }} />
          <div>
            <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--sf-t4)' }}>Meta</p>
            <p className="text-2xl font-bold" style={{ color: 'var(--sf-t2)' }}>{fmtVal(teamMeta)}</p>
            <p className="text-xs" style={{ color: 'var(--sf-t4)' }}>Día {maxDayInPeriod} de {daysInMonth}</p>
          </div>
          {maxDayInPeriod > 0 && teamMeta > 0 && (<>
            <div className="w-px h-10 self-center" style={{ background: 'var(--sf-border)' }} />
            <div>
              <p className="text-xs uppercase tracking-wide mb-0.5" style={{ color: 'var(--sf-t4)' }}>Proyección cierre</p>
              <p className={`text-2xl font-bold ${pctProyectado >= 100 ? 'text-emerald-400' : pctProyectado >= 80 ? 'text-yellow-400' : 'text-red-400'}`}>
                {fmtVal(teamProyectado)}
              </p>
              <p className="text-xs" style={{ color: 'var(--sf-t4)' }}>{pctProyectado}% de la meta</p>
            </div>
          </>)}
        </div>
        {/* Composite bar */}
        <div className="relative">
          <div className="h-2.5 rounded-full overflow-visible relative" style={{ background: 'var(--sf-border)' }}>
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
              style={{
                width: `${Math.min(teamPct ?? 0, 100)}%`,
                backgroundColor: pctProyectado >= 100 ? '#10b981' : pctProyectado >= 80 ? '#f59e0b' : '#ef4444',
              }}
            />
            {maxDayInPeriod > 0 && teamMeta > 0 && pctProyectado < 100 && (
              <div
                className="absolute rounded-full opacity-60"
                style={{ left: `${Math.min(pctProyectado, 100)}%`, top: -3, bottom: -3, width: 2, background: 'var(--sf-t3)' }}
              />
            )}
          </div>
          {maxDayInPeriod > 0 && teamMeta > 0 && (
            <div className="flex justify-between mt-1.5 text-[11px]" style={{ color: 'var(--sf-t4)' }}>
              <span>Día {maxDayInPeriod} de {daysInMonth} — ritmo {pctRitmo}%</span>
              <span>Al ritmo actual → {pctProyectado}% de meta</span>
            </div>
          )}
        </div>
      </div>

      {/* Analyze with AI */}
      <button
        onClick={() => navigate(dp('/chat'), {
          state: {
            prefill: `Analiza el cumplimiento de metas del equipo. Progreso actual: ${teamReal.toLocaleString()} de ${teamMeta.toLocaleString()} (${teamPct !== null ? teamPct.toFixed(1) : '?'}%). ¿Quién está en riesgo de no cumplir y qué acciones recomiendas?`,
            displayPrefill: `✦ Analizar cumplimiento con IA`,
            source: 'Metas',
          },
        })}
        style={{
          width: '100%',
          padding: '10px 20px',
          border: '1px solid #10B981',
          borderRadius: '10px',
          background: 'transparent',
          color: '#10B981',
          fontSize: '14px',
          fontWeight: 500,
          cursor: 'pointer',
          transition: 'all 0.2s ease',
        }}
        onMouseEnter={e => (e.currentTarget.style.background = 'rgba(16,185,129,0.05)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        ✦ Analizar cumplimiento con IA →
      </button>

      {/* ── Breakdown por dimensión (mes actual) ─────────────────────────────
          SFSelect elige la dimensión; la tabla muestra meta mes / real mes /
          % cumplimiento / meta YTD / real YTD por cada valor de esa dimensión. */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
        <div className="px-6 py-4 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--sf-border)' }}>
          <div className="flex items-center gap-2">
            <BarChart2 className="w-4 h-4" style={{ color: 'var(--sf-t4)' }} />
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>
              Cumplimiento — {MESES_SHORT[currentMonth]} {currentYear}
            </p>
          </div>
          <SFSelect
            value={dimView}
            onChange={e => setDimView(e.target.value as DimView)}
          >
            <option value="vendedor">Por vendedor</option>
            {dataAvailability.has_canal && <option value="canal">Por canal</option>}
            {dataAvailability.has_categoria && <option value="categoria">Por categoría</option>}
          </SFSelect>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--sf-border)' }}>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>
                  {dimView === 'vendedor' ? 'Vendedor' : dimView === 'canal' ? 'Canal' : 'Categoría'}
                </th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Meta mes</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Real mes</th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>% Mes</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Meta YTD</th>
                <th className="text-right px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Real YTD</th>
                <th className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>% YTD</th>
              </tr>
            </thead>
            <tbody>
              {dimRows.map(row => (
                <tr key={row.val} style={{ borderBottom: '0.5px solid var(--sf-border)' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--sf-t1)' }}>{row.val}</td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--sf-t3)' }}>
                    {row.metaMes > 0 ? fmtVal(row.metaMes) : <span style={{ color: 'var(--sf-t5)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--sf-t1)' }}>
                    {fmtVal(row.realMes)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CumplimientoBadge pct={row.pctMes} />
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--sf-t3)' }}>
                    {row.metaYTD > 0 ? fmtVal(row.metaYTD) : <span style={{ color: 'var(--sf-t5)' }}>—</span>}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--sf-t1)' }}>
                    {fmtVal(row.realYTD)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <CumplimientoBadge pct={row.pctYTD} />
                  </td>
                </tr>
              ))}
              {dimRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-6 text-center text-xs" style={{ color: 'var(--sf-t5)' }}>
                    Sin datos para esta dimensión
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Multi-dim pivot — mismo UX que "Analiza tus ventas" en Rendimiento.
          Filtrado a YTD (Ene → fin del mes actual). Muestra Venta YTD, Meta YTD,
          Var, Var%, Peso% y barra de cumplimiento por combo de dimensiones.
          Reemplaza la antigua sección "Cumplimiento individual" (más rico). */}
      <MetasPivotPanel
        metas={metas}
        sales={sales}
        tipoMetaActivo={tipoMetaActivo}
        moneda={moneda}
        currentYear={currentYear}
        currentMonth={currentMonth}
      />

      {/* "Cumplimiento individual" cards eliminado — ahora vive dentro del pivot
          (que muestra cumplimiento + barra cuando se agrupa por Vendedor con
          Var/Var%/Peso% adicionales). El histórico mensual sigue abajo. */}

      {/* Historical table — last 6 months */}
      <div className="rounded-2xl overflow-hidden" style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
        <div className="px-6 py-4" style={{ borderBottom: '1px solid var(--sf-border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>
            Histórico de cumplimiento — últimos 6 meses
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ borderBottom: '1px solid var(--sf-border)' }}>
                <th className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>
                  Vendedor
                </th>
                {histMonths.map(({ label, year, month }) => (
                  <th
                    key={`${year}-${month}`}
                    className="text-center px-4 py-3 text-[10px] font-semibold uppercase tracking-wide"
                    style={{ color: year === currentYear && month === currentMonth ? '#10b981' : 'var(--sf-t4)' }}
                  >
                    {label}
                    {year === currentYear && month === currentMonth && maxDayInPeriod > 0 && (
                      <span className="block text-[8px] opacity-50 font-normal normal-case tracking-normal mt-0.5">
                        Día {maxDayInPeriod}/{daysInMonth}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map(({ vendor, monthData }) => (
                <tr key={vendor} style={{ borderBottom: '0.5px solid var(--sf-border)' }}>
                  <td className="px-5 py-3 font-medium" style={{ color: 'var(--sf-t1)' }}>{vendor}</td>
                  {monthData.map((m, i) => (
                    <td key={i} className="px-4 py-3 text-center" style={m.isCurrent ? { background: 'rgba(16,185,129,0.05)' } : undefined}>
                      {m.metaVal === null ? (
                        <span style={{ color: 'var(--sf-t5)' }}>—</span>
                      ) : (
                        <div className="flex flex-col items-center gap-0.5">
                          <CumplimientoBadge pct={m.pct} />
                          <span className="text-[9px]" style={{ color: 'var(--sf-t5)' }}>
                            {m.realVal.toLocaleString()}
                            {m.isCurrent && <span className="text-[8px] ml-0.5">⏳</span>}
                          </span>
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              ))}

              {/* Team totals row */}
              <tr style={{ borderTop: '2px solid var(--sf-border)' }}>
                <td className="px-5 py-3 text-[10px] font-semibold uppercase tracking-wider" style={{ color: 'var(--sf-t3)' }}>
                  Equipo
                </td>
                {histMonths.map(({ year, month }) => {
                  const key = periodKey(year, month)
                  // [fix-1.6] denominador EQUIPO = solo metas single-dim (vendedor sin otras dimensiones),
                  // igual que teamMeta del header (fix-1.2). Sin este filtro, metas multi-dim
                  // inflan el denominador y deprimen el % a 35–45%.
                  const metaTot = metas.filter((m) => m.anio === year && m.mes === month + 1 && m.vendedor && !m.canal && !m.categoria && !m.cliente).reduce((a, m) => a + (tipoMetaActivo === 'usd' ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)), 0)
                  const ps = salesInPeriod(sales, year, month)
                  const realTot = tipoMetaActivo === 'usd' ? ps.reduce((a, s) => a + (s.venta_neta ?? 0), 0) : ps.reduce((a, s) => a + s.unidades, 0)
                  const pct = metaTot > 0 ? (realTot / metaTot) * 100 : null
                  const isCurr = year === currentYear && month === currentMonth
                  return (
                    <td key={key} className="px-4 py-3 text-center" style={isCurr ? { background: 'rgba(16,185,129,0.05)' } : undefined}>
                      <CumplimientoBadge pct={pct} />
                    </td>
                  )
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Drawer for individual meta analysis */}
      {(() => {
        const va = expandedMetaVendedor ? vendorAnalysis.find(v => v.vendedor === expandedMetaVendedor) : null
        const analysis = expandedMetaVendedor ? metaAnalysisMap[expandedMetaVendedor] : null
        const isOpen = !!expandedMetaVendedor && !!analysis?.text && !analysis?.loading
        const curr = expandedMetaVendedor ? matrix.find(m => m.vendor === expandedMetaVendedor)?.monthData.at(-1) : null

        return (
          <AnalysisDrawer
            isOpen={isOpen}
            onClose={() => setExpandedMetaVendedor(null)}
            title={expandedMetaVendedor ?? ''}
            subtitle={curr?.pct != null ? `${curr.pct.toFixed(0)}% de meta` : undefined}
            badges={va ? [{
              label: va.riesgo.toUpperCase(),
              color: va.riesgo === 'critico' ? '#ef4444' : va.riesgo === 'riesgo' ? '#eab308' : va.riesgo === 'superando' ? '#22c55e' : '#71717a',
              bg: va.riesgo === 'critico' ? 'rgba(239,68,68,0.12)' : va.riesgo === 'riesgo' ? 'rgba(234,179,8,0.12)' : va.riesgo === 'superando' ? 'rgba(34,197,94,0.12)' : 'rgba(113,113,122,0.12)',
            }] : []}
            analysisText={analysis?.text ?? null}
            onDeepen={expandedMetaVendedor && analysis?.text ? () => {
              navigate(dp('/chat'), { state: {
                prefill: `Profundizar sobre cumplimiento de meta de ${expandedMetaVendedor}: ${curr?.realVal?.toLocaleString() ?? '?'} de ${curr?.metaVal?.toLocaleString() ?? '?'} uds (${curr?.pct?.toFixed(1) ?? '?'}%). ${analysis.text}`,
                displayPrefill: `Profundizar: meta de ${expandedMetaVendedor}`,
                source: 'Metas',
              }})
            } : undefined}
          />
        )
      })()}
      </>}
    </div>
  )
}
