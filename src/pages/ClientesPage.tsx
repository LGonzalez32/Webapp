import React, { useMemo, useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { Users, ChevronUp, ChevronDown } from 'lucide-react'
import type { ClienteDormido } from '../types'
import { callAI } from '../lib/chatService'


function formatDays(d: number): string {
  if (d >= 30) return `${Math.floor(d / 30)}m ${d % 30}d`
  return `${d}d`
}

type ParetoCliente = {
  nombre: string; totalUnidades: number; totalVenta: number
  vendedor: string; varPct: number | null; cumulativePct: number; peso: number
}

type SortKey = 'prioridad' | 'dias_sin_actividad' | 'valor_historico' | 'compras_historicas' | 'vendedor' | 'cliente'
type SortDir = 'asc' | 'desc'

const RECOVERY_CONFIG = {
  alta:        { label: 'Alta',        cls: 'bg-[#00B894]/10 text-[#00B894]' },
  recuperable: { label: 'Recuperable', cls: 'bg-blue-500/10 text-blue-400' },
  dificil:     { label: 'Difícil',     cls: 'bg-yellow-500/10 text-yellow-400' },
  perdido:     { label: 'Perdido',     cls: 'bg-red-500/10 text-red-400' },
}

export default function ClientesPage() {
  useAnalysis()
  const navigate = useNavigate()
  const {
    clientesDormidos,
    sales,
    selectedPeriod,
    dataAvailability,
    configuracion,
    setChatContextCliente,
  } = useAppStore()

  const [sortKey, setSortKey] = useState<SortKey>('prioridad')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [tab, setTab] = useState<'dormidos' | 'pareto' | 'riesgo'>('dormidos')
  const [filterVendedor, setFilterVendedor] = useState<string>('all')
  const [expandedClienteId, setExpandedClienteId] = useState<string | null>(null)
  const [analysisMap, setAnalysisMap] = useState<Record<string, { loading: boolean; text: string | null }>>({})

  const handleAnalyzeCliente = useCallback(async (c: ClienteDormido) => {
    const id = c.cliente
    setAnalysisMap(prev => ({ ...prev, [id]: { loading: true, text: null } }))
    setExpandedClienteId(id)

    const systemPrompt =
      `Eres un analista comercial de una distribuidora.\n` +
      `Responde SIEMPRE en este formato exacto, sin introducción ni cierre:\n\n` +
      `📊 RESUMEN: [Una oración de máximo 15 palabras con el hallazgo principal]\n\n` +
      `🔺 CRECIMIENTO:\n- [Dato positivo sobre este cliente si existe — máximo 2 bullets]\n\n` +
      `🔻 CAÍDA:\n- [Dato sobre la inactividad o pérdida — máximo 2 bullets]\n\n` +
      `💡 HALLAZGO: [Un dato concreto no obvio — con números específicos]\n\n` +
      `Reglas:\n` +
      `- Máximo 120 palabras en total\n` +
      `- Cada bullet debe tener un número concreto (%, unidades, días, USD)\n` +
      `- Si una sección no aplica, omítela\n` +
      `- NUNCA hagas preguntas al usuario\n` +
      `- NUNCA des instrucciones operativas\n` +
      `- Responde en español`

    const userPrompt =
      `Cliente: ${c.cliente}\n` +
      `Vendedor asignado: ${c.vendedor}\n` +
      `Días inactivo: ${c.dias_sin_actividad}\n` +
      `Compras históricas: ${c.compras_historicas} unidades\n` +
      `Valor histórico: ${configuracion.moneda} ${c.valor_historico.toLocaleString()}\n` +
      `Score de recuperación: ${c.recovery_score}/100 (${c.recovery_label})\n` +
      `Explicación: ${c.recovery_explicacion}\n` +
      (c.frecuencia_esperada_dias ? `Frecuencia esperada: cada ${c.frecuencia_esperada_dias} días\n` : '')

    try {
      const json = await callAI(
        [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
        { model: 'deepseek-chat', max_tokens: 300, temperature: 0.3 },
      )
      setAnalysisMap(prev => ({ ...prev, [id]: { loading: false, text: json.choices?.[0]?.message?.content ?? 'Sin respuesta' } }))
    } catch (err) {
      setAnalysisMap(prev => ({ ...prev, [id]: { loading: false, text: `Error: ${err instanceof Error ? err.message : 'Error al conectar.'}` } }))
    }
  }, [configuracion])

  const vendedores = useMemo(
    () => [...new Set(clientesDormidos.map(c => c.vendedor))].sort(),
    [clientesDormidos],
  )

  const paretoClientes = useMemo(() => {
    if (!sales.length) return []
    const { year, month } = selectedPeriod
    const hasVenta = dataAvailability.has_venta_neta

    const ytdCur = sales.filter(r => r.cliente && r.fecha.getFullYear() === year && r.fecha.getMonth() + 1 <= month)
    const ytdPrev = sales.filter(r => r.cliente && r.fecha.getFullYear() === year - 1 && r.fecha.getMonth() + 1 <= month)

    const map = new Map<string, { totalUnidades: number; totalVenta: number; vendedor: string }>()
    for (const r of ytdCur) {
      const k = r.cliente!
      const e = map.get(k) ?? { totalUnidades: 0, totalVenta: 0, vendedor: r.vendedor }
      map.set(k, { totalUnidades: e.totalUnidades + r.unidades, totalVenta: e.totalVenta + (r.venta_neta ?? 0), vendedor: e.vendedor })
    }

    const prevMap = new Map<string, number>()
    for (const r of ytdPrev) {
      const k = r.cliente!
      prevMap.set(k, (prevMap.get(k) ?? 0) + (hasVenta ? (r.venta_neta ?? 0) : r.unidades))
    }

    const metric = (v: { totalVenta: number; totalUnidades: number }) => hasVenta ? v.totalVenta : v.totalUnidades
    const sorted = [...map.entries()].sort((a, b) => metric(b[1]) - metric(a[1])).slice(0, 20)
    const grandTotal = sorted.reduce((s, [, v]) => s + metric(v), 0)

    let cumSum = 0
    return sorted.map(([nombre, v]) => {
      const cur = metric(v)
      const prev = prevMap.get(nombre) ?? 0
      const varPct = prev > 0 ? ((cur - prev) / prev) * 100 : null
      cumSum += cur
      const cumulativePct = grandTotal > 0 ? (cumSum / grandTotal) * 100 : 0
      const peso = grandTotal > 0 ? (cur / grandTotal) * 100 : 0
      return { nombre, totalUnidades: v.totalUnidades, totalVenta: v.totalVenta, vendedor: v.vendedor, varPct, cumulativePct, peso }
    })
  }, [sales, selectedPeriod, dataAvailability.has_venta_neta])

  const riesgoTemprano = useMemo(() => {
    if (!sales.length) return []
    const withCliente = sales.filter(r => r.cliente)
    if (!withCliente.length) return []

    const fechaRef = new Date(Math.max(...withCliente.map(r => r.fecha.getTime())))
    const sixMonthsAgo = new Date(fechaRef)
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const dormidosSet = new Set(clientesDormidos.map(c => c.cliente))

    const clientMap = new Map<string, { dates: Date[]; vendedor: string; totalValue: number }>()
    for (const r of withCliente.filter(r => r.fecha >= sixMonthsAgo)) {
      const k = r.cliente!
      const e = clientMap.get(k)
      if (e) { e.dates.push(r.fecha); e.totalValue += r.venta_neta ?? r.unidades }
      else clientMap.set(k, { dates: [r.fecha], vendedor: r.vendedor, totalValue: r.venta_neta ?? r.unidades })
    }

    type RiesgoItem = { nombre: string; vendedor: string; lastPurchase: Date; avgDays: number; daysSince: number; atraso: number; signal: 'en riesgo' | 'desacelerando'; valorHistorico: number }
    const results: RiesgoItem[] = []

    for (const [nombre, data] of clientMap) {
      if (dormidosSet.has(nombre)) continue
      const sortedDates = [...data.dates].sort((a, b) => a.getTime() - b.getTime())
      if (sortedDates.length < 2) continue
      const gaps: number[] = []
      for (let i = 1; i < sortedDates.length; i++) {
        gaps.push((sortedDates[i].getTime() - sortedDates[i - 1].getTime()) / 86400000)
      }
      const avgDays = gaps.reduce((s, g) => s + g, 0) / gaps.length
      if (avgDays < 1) continue
      const lastPurchase = sortedDates[sortedDates.length - 1]
      const daysSince = (fechaRef.getTime() - lastPurchase.getTime()) / 86400000
      let signal: 'en riesgo' | 'desacelerando' | null = null
      if (daysSince > avgDays * 2) signal = 'en riesgo'
      else if (daysSince > avgDays * 1.5) signal = 'desacelerando'
      if (!signal) continue
      results.push({ nombre, vendedor: data.vendedor, lastPurchase, avgDays, daysSince: Math.round(daysSince), atraso: Math.round(daysSince - avgDays), signal, valorHistorico: data.totalValue })
    }

    return results.sort((a, b) => {
      if (a.signal !== b.signal) return a.signal === 'en riesgo' ? -1 : 1
      return b.valorHistorico - a.valorHistorico
    })
  }, [sales, clientesDormidos])

  if (!dataAvailability.has_cliente) {
    navigate('/dashboard')
    return null
  }

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ChevronDown className="w-3 h-3 opacity-20" />
    return sortDir === 'desc'
      ? <ChevronDown className="w-3 h-3 text-[#00B894]" />
      : <ChevronUp className="w-3 h-3 text-[#00B894]" />
  }

  const filtered = filterVendedor === 'all'
    ? clientesDormidos
    : clientesDormidos.filter(c => c.vendedor === filterVendedor)

  const sorted = [...filtered].sort((a, b) => {
    const mul = sortDir === 'desc' ? -1 : 1
    if (sortKey === 'prioridad') return mul * (a.recovery_score - b.recovery_score)
    if (sortKey === 'dias_sin_actividad') return mul * (a.dias_sin_actividad - b.dias_sin_actividad)
    if (sortKey === 'valor_historico') return mul * (a.valor_historico - b.valor_historico)
    if (sortKey === 'compras_historicas') return mul * (a.compras_historicas - b.compras_historicas)
    if (sortKey === 'vendedor') return mul * a.vendedor.localeCompare(b.vendedor)
    return mul * a.cliente.localeCompare(b.cliente)
  })

  const totalValorEnRiesgo = clientesDormidos.reduce((a, c) => a + c.valor_historico, 0)
  const moneda = configuracion.moneda

  return (
    <div className="max-w-5xl mx-auto space-y-6 pb-20 animate-in fade-in duration-700">
      {/* Header + inline badges */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 600, margin: 0 }}>Clientes</h1>
          <p style={{ fontSize: '12px', color: 'var(--sf-t4)', margin: '3px 0 0' }}>Clientes dormidos, pareto y señales tempranas de riesgo</p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(226,75,74,0.15)', color: '#E24B4A', border: '1px solid rgba(226,75,74,0.25)' }}>
            {clientesDormidos.length} dormidos
          </span>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,159,39,0.15)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)' }}>
            {moneda} {totalValorEnRiesgo >= 1000 ? `${(totalValorEnRiesgo / 1000).toFixed(1)}k` : totalValorEnRiesgo.toLocaleString(undefined, { maximumFractionDigits: 0 })} en riesgo
          </span>
          <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: 'rgba(239,159,39,0.15)', color: '#EF9F27', border: '1px solid rgba(239,159,39,0.25)' }}>
            {riesgoTemprano.length} riesgo temprano
          </span>
          {paretoClientes.length > 0 && (() => {
            const topPeso = paretoClientes[0].peso
            const isAlta = topPeso > 15
            return (
              <span style={{ padding: '4px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 500, background: isAlta ? 'rgba(226,75,74,0.15)' : 'rgba(239,159,39,0.15)', color: isAlta ? '#E24B4A' : '#EF9F27', border: `1px solid ${isAlta ? 'rgba(226,75,74,0.25)' : 'rgba(239,159,39,0.25)'}` }}>
                {topPeso.toFixed(1)}% top cliente
              </span>
            )
          })()}
        </div>
      </div>

      {/* Card: tabs + table */}
      <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: '12px', padding: '16px', marginTop: '16px' }}>

      {/* Tabs + filtro vendedor */}
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <div style={{ display: 'inline-flex', background: 'var(--sf-inset)', borderRadius: '8px', padding: '3px', gap: '2px' }}>
          {([
            { key: 'dormidos', label: `Dormidos (${clientesDormidos.length})` },
            { key: 'pareto',   label: 'Top Clientes' },
            { key: 'riesgo',   label: 'Riesgo Temprano' },
          ] as const).map(({ key: t, label }) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '5px 14px',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 500,
                background: tab === t ? 'rgba(29,158,117,0.15)' : 'transparent',
                color: tab === t ? '#1D9E75' : 'var(--sf-t3)',
                border: tab === t ? '1px solid rgba(29,158,117,0.25)' : '1px solid transparent',
                cursor: 'pointer',
                transition: 'all 150ms',
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'dormidos' && vendedores.length > 1 && (
          <select
            value={filterVendedor}
            onChange={e => setFilterVendedor(e.target.value)}
            className="px-3 py-2 bg-[var(--sf-card)] border border-[var(--sf-border)] rounded-lg text-xs text-[var(--sf-t1)] focus:outline-none focus:border-[#1D9E75]/50"
          >
            <option value="all">Todos los vendedores</option>
            {vendedores.map(v => <option key={v} value={v}>{v}</option>)}
          </select>
        )}
      </div>

      {/* Clientes dormidos table */}
      {tab === 'dormidos' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {sorted.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">
                {filterVendedor === 'all' ? 'Sin clientes dormidos' : `Sin clientes dormidos para ${filterVendedor}`}
              </p>
              <p className="text-xs mt-1">Todos los clientes han comprado recientemente</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['cliente', 'Cliente'],
                      ['vendedor', 'Vendedor'],
                      ['dias_sin_actividad', 'Inactivo'],
                      ['compras_historicas', 'Compras'],
                      ['valor_historico', 'Valor hist.'],
                      ['prioridad', 'Recuperación'],
                    ] as [SortKey, string][]).map(([k, label], i) => (
                      <th
                        key={k}
                        onClick={() => handleSort(k)}
                        style={{
                          padding: '10px 16px',
                          fontSize: '11px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          color: 'var(--sf-t3)',
                          fontWeight: 500,
                          textAlign: i > 1 ? 'right' : 'left',
                          borderLeft: i === 0 ? '3px solid #1D9E75' : undefined,
                          cursor: 'pointer',
                          userSelect: 'none',
                        }}
                      >
                        <span className="flex items-center gap-1" style={{ justifyContent: i > 1 ? 'flex-end' : 'flex-start' }}>
                          {label}
                          <SortIcon k={k as SortKey} />
                        </span>
                      </th>
                    ))}
                    <th style={{ padding: '8px 16px', width: '120px', minWidth: '120px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((c, i) => {
                    const score = c.recovery_score
                    const analysis = analysisMap[c.cliente]
                    const isExpanded = expandedClienteId === c.cliente
                    return (
                      <React.Fragment key={i}>
                      <tr
                        style={{ borderBottom: isExpanded ? 'none' : '1px solid var(--sf-border)', transition: 'background 120ms' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <td style={{ padding: '10px 16px' }}>
                          <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)' }}>{c.cliente}</div>
                          <div style={{ fontSize: '11px', color: 'var(--sf-t4)', marginTop: '1px', maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={c.recovery_explicacion}>
                            {c.recovery_explicacion}
                          </div>
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                        <td
                          style={{
                            padding: '10px 12px',
                            fontWeight: 600,
                            fontVariantNumeric: 'tabular-nums',
                            textAlign: 'right',
                            color: c.dias_sin_actividad >= 90 ? '#E24B4A' : c.dias_sin_actividad >= 60 ? '#EF9F27' : 'var(--sf-t2)',
                          }}
                        >
                          {formatDays(c.dias_sin_actividad)}
                        </td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t3)', fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>{c.compras_historicas}</td>
                        <td style={{ padding: '10px 12px', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums', textAlign: 'right' }}>
                          {moneda} {c.valor_historico >= 1000
                            ? `${(c.valor_historico / 1000).toFixed(1)}k`
                            : c.valor_historico.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                        </td>
                        <td style={{ padding: '10px 12px' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '4px' }}>
                            <span style={{
                              fontSize: '10px', padding: '2px 7px', borderRadius: '3px', fontWeight: 600,
                              background: score > 60 ? 'rgba(29,158,117,0.15)' : score > 40 ? 'rgba(239,159,39,0.15)' : 'rgba(226,75,74,0.15)',
                              color: score > 60 ? '#1D9E75' : score > 40 ? '#EF9F27' : '#E24B4A',
                            }}>
                              {score > 60 ? 'Recuperable' : score > 40 ? 'Difícil' : 'Perdido'}
                            </span>
                            <div style={{ width: '80px', height: '3px', background: 'var(--sf-inset)', borderRadius: '2px' }}>
                              <div style={{
                                width: `${score}%`, height: '100%', borderRadius: '2px',
                                background: score > 60 ? '#1D9E75' : score > 40 ? '#EF9F27' : '#E24B4A',
                              }} />
                            </div>
                            <span style={{ fontSize: '10px', color: 'var(--sf-t4)' }}>{score}/100</span>
                          </div>
                        </td>
                        <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation()
                              handleAnalyzeCliente(c)
                            }}
                            disabled={analysis?.loading}
                            title="Analizar con IA"
                            style={{
                              background: 'rgba(29,158,117,0.12)',
                              border: '1px solid rgba(29,158,117,0.35)',
                              borderRadius: '8px',
                              padding: '6px 12px',
                              cursor: analysis?.loading ? 'wait' : 'pointer',
                              fontSize: '12px',
                              fontWeight: 500,
                              color: '#1D9E75',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '5px',
                              whiteSpace: 'nowrap',
                              transition: 'all 150ms',
                              marginLeft: 'auto',
                              opacity: analysis?.loading ? 0.6 : 1,
                            }}
                            onMouseEnter={e => {
                              if (!analysis?.loading) {
                                e.currentTarget.style.background = 'rgba(29,158,117,0.22)'
                                e.currentTarget.style.borderColor = 'rgba(29,158,117,0.6)'
                              }
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = 'rgba(29,158,117,0.12)'
                              e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)'
                            }}
                          >
                            {analysis?.loading ? (
                              <>
                                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                </svg>
                                Analizando…
                              </>
                            ) : analysis?.text ? (
                              <>
                                <span style={{ fontSize: '13px' }}>✦</span>
                                Regenerar
                              </>
                            ) : (
                              <>
                                <span style={{ fontSize: '13px' }}>✦</span>
                                Analizar
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                      {/* Inline analysis panel */}
                      {isExpanded && (analysis?.loading || analysis?.text) && (
                        <tr>
                          <td colSpan={7} style={{ padding: 0, borderBottom: '1px solid var(--sf-border)' }}>
                            <div style={{ padding: '16px 24px', background: 'var(--sf-inset)', borderTop: '1px solid var(--sf-border)' }}>
                              {analysis.loading ? (
                                <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--sf-t4)' }}>
                                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                                  </svg>
                                  Analizando cliente…
                                </div>
                              ) : analysis.text ? (
                                <>
                                  <div className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: 'var(--sf-t3)' }}>
                                    {analysis.text}
                                  </div>
                                  <button
                                    onClick={() => {
                                      const displayMessage = `Profundizar: cliente ${c.cliente} (${c.dias_sin_actividad} días inactivo)`
                                      const fullContext = [
                                        `Profundizar sobre cliente dormido: ${c.cliente}`,
                                        `Vendedor: ${c.vendedor}`,
                                        `Días inactivo: ${c.dias_sin_actividad}`,
                                        `Valor histórico: ${moneda} ${c.valor_historico.toLocaleString()}`,
                                        `Recovery: ${c.recovery_score}/100 (${c.recovery_label})`,
                                        analysis.text ? `\nAnálisis previo:\n${analysis.text}` : '',
                                        ``,
                                        `Con base en este análisis, profundiza: ¿por qué se durmió este cliente, qué productos compraba, hay patrón con otros clientes dormidos del mismo vendedor?`
                                      ].filter(Boolean).join('\n')
                                      navigate('/chat', { state: { prefill: fullContext, displayPrefill: displayMessage } })
                                    }}
                                    style={{
                                      marginTop: '12px',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: '6px',
                                      padding: '6px 14px',
                                      borderRadius: '8px',
                                      border: '1px solid rgba(29,158,117,0.35)',
                                      background: 'rgba(29,158,117,0.08)',
                                      color: '#1D9E75',
                                      fontSize: '12px',
                                      fontWeight: 600,
                                      cursor: 'pointer',
                                      transition: 'all 150ms',
                                    }}
                                    onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
                                    onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                                  >
                                    + Profundizar
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      )}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              {filtered.length !== clientesDormidos.length && (
                <p className="px-5 py-2 text-[10px] text-[var(--sf-t4)] border-t border-[var(--sf-border)]">
                  Mostrando {filtered.length} de {clientesDormidos.length} clientes dormidos
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Pareto table */}
      {tab === 'pareto' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {paretoClientes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">Sin datos de clientes</p>
              <p className="text-xs mt-1">Carga un archivo con columna de cliente para ver el pareto</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['Cliente', 'left'],
                      ['Vendedor', 'left'],
                      ['Unidades', 'right'],
                      ['Venta Neta', 'right'],
                      ['VAR% YoY', 'right'],
                      ['Peso acum.', 'right'],
                    ] as [string, string][]).map(([h, align], i) => (
                      <th key={h} style={{
                        padding: '10px 12px',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--sf-t3)',
                        fontWeight: 500,
                        textAlign: align as 'left' | 'right',
                        borderLeft: i === 0 ? '3px solid #1D9E75' : undefined,
                        paddingLeft: i === 0 ? '16px' : undefined,
                      }}>{h}</th>
                    ))}
                    <th style={{ padding: '8px 16px', width: '120px', minWidth: '120px', textAlign: 'right' }} />
                  </tr>
                </thead>
                <tbody>
                  {(() => {
                    const rows: React.ReactNode[] = []
                    let shown50 = false
                    let shown80 = false
                    paretoClientes.forEach((c, idx) => {
                      const prevPct = idx > 0 ? paretoClientes[idx - 1].cumulativePct : 0
                      if (!shown50 && c.cumulativePct >= 50 && prevPct < 50) {
                        shown50 = true
                        rows.push(
                          <tr key="div50">
                            <td colSpan={7} style={{ padding: '2px 12px', borderTop: '1px dashed rgba(29,158,117,0.3)' }}>
                              <span style={{ fontSize: '10px', color: '#1D9E75', opacity: 0.6 }}>— 50% del volumen total</span>
                            </td>
                          </tr>
                        )
                      }
                      if (!shown80 && c.cumulativePct >= 80 && prevPct < 80) {
                        shown80 = true
                        rows.push(
                          <tr key="div80">
                            <td colSpan={7} style={{ padding: '2px 12px', borderTop: '1px dashed rgba(239,159,39,0.3)' }}>
                              <span style={{ fontSize: '10px', color: '#EF9F27', opacity: 0.6 }}>— 80% del volumen total</span>
                            </td>
                          </tr>
                        )
                      }
                      rows.push(
                        <tr
                          key={idx}
                          style={{ borderBottom: '1px solid var(--sf-border)', transition: 'background 120ms' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <td style={{ padding: '9px 16px' }}>
                            <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)' }}>{c.nombre}</div>
                          </td>
                          <td style={{ padding: '9px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t2)', fontVariantNumeric: 'tabular-nums' }}>
                            {c.totalUnidades.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                            {dataAvailability.has_venta_neta
                              ? `${moneda} ${c.totalVenta >= 1000 ? `${(c.totalVenta / 1000).toFixed(1)}k` : c.totalVenta.toLocaleString(undefined, { maximumFractionDigits: 0 })}`
                              : '—'}
                          </td>
                          <td style={{ padding: '9px 12px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600,
                            color: c.varPct == null ? 'var(--sf-t4)' : c.varPct >= 0 ? '#1D9E75' : '#E24B4A' }}>
                            {c.varPct == null ? '—' : `${c.varPct >= 0 ? '+' : ''}${c.varPct.toFixed(1)}%`}
                          </td>
                          <td style={{ textAlign: 'right', padding: '9px 12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '8px' }}>
                              <div style={{ width: '60px', height: '3px', background: 'var(--sf-inset)', borderRadius: '2px' }}>
                                <div style={{ width: `${Math.min(c.cumulativePct, 100)}%`, height: '100%', borderRadius: '2px',
                                  background: c.cumulativePct <= 50 ? '#1D9E75' : c.cumulativePct <= 80 ? '#EF9F27' : '#E24B4A' }} />
                              </div>
                              <span style={{ fontSize: '11px', color: 'var(--sf-t3)', minWidth: '36px', textAlign: 'right' }}>{c.cumulativePct.toFixed(1)}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '9px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => {
                                setChatContextCliente({ tipo: 'top', nombre: c.nombre, vendedor: c.vendedor, totalUnidades: c.totalUnidades, totalVenta: c.totalVenta, varPct: c.varPct, cumulativePct: c.cumulativePct })
                                navigate('/chat?cliente=' + encodeURIComponent(c.nombre))
                              }}
                              title="Analizar con IA"
                              style={{
                                background: 'rgba(29,158,117,0.12)',
                                border: '1px solid rgba(29,158,117,0.35)',
                                borderRadius: '8px',
                                padding: '6px 12px',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 500,
                                color: '#1D9E75',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '5px',
                                whiteSpace: 'nowrap',
                                transition: 'all 150ms',
                                marginLeft: 'auto',
                              }}
                              onMouseEnter={e => {
                                e.currentTarget.style.background = 'rgba(29,158,117,0.22)'
                                e.currentTarget.style.borderColor = 'rgba(29,158,117,0.6)'
                              }}
                              onMouseLeave={e => {
                                e.currentTarget.style.background = 'rgba(29,158,117,0.12)'
                                e.currentTarget.style.borderColor = 'rgba(29,158,117,0.35)'
                              }}
                            >
                              <span style={{ fontSize: '13px' }}>✦</span>
                              Analizar
                            </button>
                          </td>
                        </tr>
                      )
                    })
                    return rows
                  })()}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Riesgo Temprano table */}
      {tab === 'riesgo' && (
        <div style={{ overflow: 'hidden', marginTop: '12px' }}>
          {riesgoTemprano.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-[var(--sf-t4)]">
              <Users className="w-10 h-10 mb-3 opacity-30" />
              <p className="font-bold text-sm">Sin señales de riesgo temprano</p>
              <p className="text-xs mt-1">Todos los clientes activos compran dentro de su frecuencia normal</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
                    {([
                      ['Cliente', 'left'],
                      ['Vendedor', 'left'],
                      ['Últ. compra', 'right'],
                      ['Frec. normal', 'right'],
                      ['Atraso', 'right'],
                      ['Señal', 'center'],
                      ['Valor hist.', 'right'],
                    ] as [string, string][]).map(([h, align], i) => (
                      <th key={h} style={{
                        padding: '10px 12px',
                        fontSize: '11px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.06em',
                        color: 'var(--sf-t3)',
                        fontWeight: 500,
                        textAlign: align as 'left' | 'right' | 'center',
                        borderLeft: i === 0 ? '3px solid #EF9F27' : undefined,
                        paddingLeft: i === 0 ? '16px' : undefined,
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {riesgoTemprano.map((c, i) => (
                    <tr
                      key={i}
                      style={{ borderBottom: '1px solid var(--sf-border)', transition: 'background 120ms' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--sf-hover)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    >
                      <td style={{ padding: '9px 16px' }}>
                        <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--sf-t1)' }}>{c.nombre}</div>
                      </td>
                      <td style={{ padding: '9px 12px', color: 'var(--sf-t3)', fontSize: '12px' }}>{c.vendedor}</td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t3)', fontVariantNumeric: 'tabular-nums' }}>
                        {c.lastPurchase.toLocaleDateString('es-MX', { day: '2-digit', month: 'short' })}
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t3)' }}>
                        cada {Math.round(c.avgDays)}d
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                        color: c.signal === 'en riesgo' ? '#E24B4A' : '#EF9F27' }}>
                        +{c.atraso}d
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'center' }}>
                        <span style={{
                          fontSize: '10px', padding: '2px 8px', borderRadius: '3px', fontWeight: 600,
                          background: c.signal === 'en riesgo' ? 'rgba(226,75,74,0.15)' : 'rgba(239,159,39,0.15)',
                          color: c.signal === 'en riesgo' ? '#E24B4A' : '#EF9F27',
                          border: `1px solid ${c.signal === 'en riesgo' ? 'rgba(226,75,74,0.25)' : 'rgba(239,159,39,0.25)'}`,
                        }}>
                          {c.signal === 'en riesgo' ? 'En riesgo' : 'Desacelerando'}
                        </span>
                      </td>
                      <td style={{ padding: '9px 12px', textAlign: 'right', color: 'var(--sf-t1)', fontWeight: 500, fontVariantNumeric: 'tabular-nums' }}>
                        {moneda} {c.valorHistorico >= 1000
                          ? `${(c.valorHistorico / 1000).toFixed(1)}k`
                          : c.valorHistorico.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      </div>{/* end card */}
    </div>
  )
}
