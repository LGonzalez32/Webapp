import type {
  ChatMessage,
  ChatContext as BaseChatContext,
  SaleRecord,
  CategoriaInventario,
} from '../types'

// ─── Contexto extendido con datos crudos ──────────────────────────────────────

export interface ChatContext extends BaseChatContext {
  sales: SaleRecord[]
  activeEntityHint?: string
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const MONTHS_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

// ─── Helpers de período ───────────────────────────────────────────────────────

// Los parsers pueden devolver strings en lugar de Date; esta función lo normaliza
function toDate(d: Date | string | unknown): Date {
  if (d instanceof Date) return d
  return new Date(d as string)
}

function isPeriodSale(sale: SaleRecord, year: number, month: number): boolean {
  const d = toDate(sale.fecha)
  return d.getFullYear() === year && d.getMonth() === month
}

function isHistoricalSale(sale: SaleRecord, year: number, month: number): boolean {
  const d = toDate(sale.fecha)
  const startDate = new Date(year, month - 3, 1)
  const endDate = new Date(year, month, 1)
  return d >= startDate && d < endDate
}

// ─── Helper 1: Top clientes por vendedor en el período ───────────────────────

interface ClienteSummary {
  cliente: string
  unidades: number
  venta_neta: number
}

function topClientesPorVendedor(
  sales: SaleRecord[],
  vendedor: string,
  period: { year: number; month: number }
): ClienteSummary[] {
  const map = new Map<string, ClienteSummary>()
  for (const s of sales) {
    if (s.vendedor !== vendedor || !s.cliente) continue
    if (!isPeriodSale(s, period.year, period.month)) continue
    const prev = map.get(s.cliente) ?? { cliente: s.cliente, unidades: 0, venta_neta: 0 }
    map.set(s.cliente, {
      cliente: s.cliente,
      unidades: prev.unidades + s.unidades,
      venta_neta: prev.venta_neta + (s.venta_neta ?? 0),
    })
  }
  return Array.from(map.values()).sort((a, b) => b.unidades - a.unidades).slice(0, 3)
}

// ─── Helper 2: Productos ausentes del vendedor en el período ─────────────────

interface ProductoAusente {
  producto: string
  diasSinVenta: number
}

function productosAusentesDelVendedor(
  sales: SaleRecord[],
  vendedor: string,
  period: { year: number; month: number },
  fechaReferencia: Date
): ProductoAusente[] {
  const productosActuales = new Set<string>()
  for (const s of sales) {
    if (s.vendedor !== vendedor || !s.producto) continue
    if (isPeriodSale(s, period.year, period.month)) productosActuales.add(s.producto)
  }

  const lastSaleByProduct = new Map<string, Date>()
  for (const s of sales) {
    if (s.vendedor !== vendedor || !s.producto) continue
    if (productosActuales.has(s.producto)) continue
    if (!isHistoricalSale(s, period.year, period.month)) continue
    const prev = lastSaleByProduct.get(s.producto)
    const fd = toDate(s.fecha)
    if (!prev || fd > prev) lastSaleByProduct.set(s.producto, fd)
  }

  return Array.from(lastSaleByProduct.entries())
    .map(([producto, fecha]) => ({
      producto,
      diasSinVenta: Math.floor((fechaReferencia.getTime() - fecha.getTime()) / 86_400_000),
    }))
    .sort((a, b) => a.diasSinVenta - b.diasSinVenta)
}

// ─── Helper 3: Canal principal de un vendedor ─────────────────────────────────

function canalPrincipalVendedor(sales: SaleRecord[], vendedor: string): string | null {
  const canalCount = new Map<string, number>()
  for (const s of sales) {
    if (s.vendedor !== vendedor || !s.canal) continue
    canalCount.set(s.canal, (canalCount.get(s.canal) ?? 0) + 1)
  }
  if (canalCount.size === 0) return null
  return Array.from(canalCount.entries()).sort((a, b) => b[1] - a[1])[0][0]
}

// ─── Helper 4: Cruce inventario × vendedor × canal ────────────────────────────

interface CruceInventario {
  producto: string
  diasInventario: number
  clasificacion: string
  vendedores: { vendedor: string; diasSinVender: number }[]
  canalPrincipal: string | null
}

function crucInventarioVendedor(
  sales: SaleRecord[],
  categoriasInventario: CategoriaInventario[],
  fechaReferencia: Date
): CruceInventario[] {
  const lentos = categoriasInventario.filter(
    (c) => c.clasificacion === 'lento_movimiento' || c.clasificacion === 'sin_movimiento'
  )

  const result: CruceInventario[] = []

  for (const cat of lentos) {
    const ventasProducto = sales.filter((s) => s.producto === cat.producto)
    if (ventasProducto.length === 0) continue

    const lastSaleByVendedor = new Map<string, Date>()
    for (const s of ventasProducto) {
      const fd = toDate(s.fecha)
      const prev = lastSaleByVendedor.get(s.vendedor)
      if (!prev || fd > prev) lastSaleByVendedor.set(s.vendedor, fd)
    }

    const canalCount = new Map<string, number>()
    for (const s of ventasProducto) {
      if (s.canal) canalCount.set(s.canal, (canalCount.get(s.canal) ?? 0) + 1)
    }
    const canalPrincipal = canalCount.size > 0
      ? Array.from(canalCount.entries()).sort((a, b) => b[1] - a[1])[0][0]
      : null

    result.push({
      producto: cat.producto,
      diasInventario: cat.dias_inventario,
      clasificacion: cat.clasificacion,
      vendedores: Array.from(lastSaleByVendedor.entries())
        .map(([v, fecha]) => ({
          vendedor: v,
          diasSinVender: Math.floor((fechaReferencia.getTime() - fecha.getTime()) / 86_400_000),
        }))
        .sort((a, b) => a.diasSinVender - b.diasSinVender)
        .slice(0, 4),
      canalPrincipal,
    })
  }

  return result.slice(0, 3)
}

// ─── buildSystemPrompt ────────────────────────────────────────────────────────

// ~4 chars per token; leave ~20K tokens for conversation + completion
const MAX_PROMPT_CHARS = 320_000

function buildSystemPrompt(ctx: ChatContext): string {
  const {
    configuracion, selectedPeriod, vendorAnalysis, teamStats, insights,
    clientesDormidos, concentracionRiesgo, categoriasInventario,
    dataAvailability, sales,
  } = ctx

  const fechaReferencia = sales.length > 0
    ? new Date(Math.max(...sales.map(s => toDate(s.fecha).getTime())))
    : new Date()

  const mes = MONTHS_ES[selectedPeriod.month] ?? String(selectedPeriod.month + 1)
  const año = selectedPeriod.year
  const mon = configuracion.moneda

  // Priorizar vendedores críticos en el detalle; limitar a 20 para no exceder contexto
  const RISK_ORDER: Record<string, number> = { critico: 0, riesgo: 1, ok: 2, superando: 3 }
  const sortedVendors = [...vendorAnalysis].sort(
    (a, b) => (RISK_ORDER[a.riesgo] ?? 9) - (RISK_ORDER[b.riesgo] ?? 9)
  )
  const detailVendors = sortedVendors.slice(0, 20)
  const skippedVendors = sortedVendors.slice(20)

  let p = `Eres el copiloto comercial de ${configuracion.empresa}.
Responde siempre en español.
Tienes acceso completo a los datos reales del negocio.
Usa nombres reales siempre. Nunca uses placeholders como [NOMBRE] o [CLIENTE].

REGLAS DE RESPUESTA — NO NEGOCIABLES:
- Sin introducciones ("Claro", "Por supuesto", "Entendido")
- Sin cierres ("Espero que ayude", "¿Necesitas más?")
- Máximo 80 palabras salvo análisis explícito (máx 150)
- Formato: dato concreto → acción específica → impacto
- Tono: gerente experimentado. Directo. Sin suavizar.
- Números siempre: %, días, unidades, montos

════════════════════
PERÍODO ANALIZADO: ${mes} ${año}
════════════════════

EQUIPO — RESUMEN:
Total vendedores: ${vendorAnalysis.length}
Variación YTD: ${teamStats?.variacion_ytd_equipo != null ? teamStats.variacion_ytd_equipo.toFixed(1) + '%' : 'N/A'}
Total unidades período: ${teamStats?.total_unidades?.toLocaleString() ?? 'N/A'}
Variación vs período anterior: ${teamStats?.variacion_pct != null ? teamStats.variacion_pct.toFixed(1) + '%' : 'N/A'}${dataAvailability.has_venta_neta && teamStats?.total_ventas ? `\nVenta neta total período: ${teamStats.total_ventas.toLocaleString()} ${mon}` : ''}`

  // ─── Detalle por vendedor ─────────────────────────────────────────────────
  p += '\n\n════════════════════\nDETALLE POR VENDEDOR\n════════════════════'

  for (const v of detailVendors) {
    p += `\n\nVENDEDOR: ${v.vendedor}`
    p += `\nEstado: ${v.riesgo.toUpperCase()} | Unidades: ${v.ventas_periodo}`
    if (v.variacion_pct != null) p += `\nVariación vs período anterior: ${v.variacion_pct.toFixed(1)}%`
    if (v.ytd_actual != null) {
      p += `\nYTD actual: ${v.ytd_actual} | YTD anterior: ${v.ytd_anterior ?? 'N/A'}`
      if (v.variacion_ytd_pct != null) p += ` | Var YTD: ${v.variacion_ytd_pct.toFixed(1)}%`
    }
    if (v.meta != null) {
      p += `\nMeta: ${v.meta} | Cumplimiento: ${v.cumplimiento_pct?.toFixed(1) ?? 'N/A'}%`
      if (v.proyeccion_cierre != null) p += ` | Proyección cierre: ${v.proyeccion_cierre}`
    }
    if (v.ritmo_necesario != null) p += `\nRitmo necesario/día: ${v.ritmo_necesario}`
    p += `\nSemanas bajo promedio: ${v.semanas_bajo_promedio}`

    // Clientes dormidos de este vendedor
    if (dataAvailability.has_cliente) {
      const dormidos = clientesDormidos.filter((c) => c.vendedor === v.vendedor)
      if (dormidos.length > 0) {
        p += `\nClientes dormidos (${dormidos.length}):`
        for (const c of dormidos.slice(0, 2)) {
          p += `\n  - ${c.cliente} | ${c.dias_sin_actividad} días sin comprar`
          if (dataAvailability.has_venta_neta && c.valor_historico) {
            p += ` | Valor hist: ${c.valor_historico.toLocaleString()} ${mon}`
          }
          p += ` | Recovery: ${c.recovery_score}/100 (${c.recovery_label}) — ${c.recovery_explicacion}`
        }
      }

      const topClientes = topClientesPorVendedor(sales, v.vendedor, selectedPeriod)
      if (topClientes.length > 0) {
        p += `\nTop clientes activos:`
        for (const c of topClientes) {
          p += `\n  - ${c.cliente}: ${c.unidades} uds`
          if (dataAvailability.has_venta_neta && c.venta_neta > 0) {
            p += ` / ${c.venta_neta.toLocaleString()} ${mon}`
          }
        }
      }
    }

    // Productos ausentes
    if (dataAvailability.has_producto) {
      const ausentes = productosAusentesDelVendedor(sales, v.vendedor, selectedPeriod, fechaReferencia)
      if (ausentes.length > 0) {
        p += `\nProductos que dejó de vender este período:`
        for (const a of ausentes.slice(0, 2)) {
          p += `\n  - ${a.producto}: última venta hace ${a.diasSinVenta} días`
        }
      }
    }

    // Canal principal
    if (dataAvailability.has_canal) {
      const canal = canalPrincipalVendedor(sales, v.vendedor)
      if (canal) p += `\nCanal principal: ${canal}`
    }

    p += '\n' + '─'.repeat(40)
  }

  // ─── Alertas ─────────────────────────────────────────────────────────────
  // ─── Vendedores sin detalle (resumen compacto) ────────────────────────────
  if (skippedVendors.length > 0) {
    p += `\n\nOTROS VENDEDORES (${skippedVendors.length}, sin detalle):`
    for (const v of skippedVendors) {
      p += `\n- ${v.vendedor}: ${v.ventas_periodo} uds | ${v.riesgo}`
      if (v.cumplimiento_pct != null) p += ` | Meta ${v.cumplimiento_pct.toFixed(0)}%`
    }
  }

  p += `\n\n════════════════════\nALERTAS ACTIVAS (${insights.length} total)\n════════════════════`
  for (const ins of insights.slice(0, 5)) {
    p += `\n[${ins.prioridad}] ${ins.titulo}: ${ins.descripcion}`
    if (ins.impacto_economico) {
      p += `\n  Impacto: ${ins.impacto_economico.valor.toLocaleString()} ${mon}`
    }
  }

  // ─── Inventario ───────────────────────────────────────────────────────────
  if (dataAvailability.has_inventario) {
    p += '\n\n════════════════════\nINVENTARIO\n════════════════════'

    const quiebre = categoriasInventario.filter((c) => c.clasificacion === 'riesgo_quiebre')
    const baja = categoriasInventario.filter((c) => c.clasificacion === 'baja_cobertura')
    const lento = categoriasInventario.filter((c) => c.clasificacion === 'lento_movimiento')
    const sinMov = categoriasInventario.filter((c) => c.clasificacion === 'sin_movimiento')

    if (quiebre.length > 0) {
      p += `\n\nRIESGO QUIEBRE (${quiebre.length} productos):`
      for (const prod of quiebre) {
        p += `\n- ${prod.producto}: ${prod.unidades_actuales} uds | ${prod.dias_inventario} días | PM3: ${prod.pm3} uds/mes`
      }
    }
    if (baja.length > 0) {
      p += `\n\nBAJA COBERTURA (${baja.length} productos):`
      for (const prod of baja) {
        p += `\n- ${prod.producto}: ${prod.unidades_actuales} uds | ${prod.dias_inventario} días`
      }
    }
    if (lento.length > 0) {
      p += `\n\nLENTO MOVIMIENTO (${lento.length}): ${lento.map((x) => x.producto).join(', ')}`
    }
    if (sinMov.length > 0) {
      p += `\n\nSIN MOVIMIENTO (${sinMov.length}): ${sinMov.map((x) => x.producto).join(', ')}`
    }

    // Cruce inventario × vendedor
    if (dataAvailability.has_producto && sales.length > 0) {
      const cruces = crucInventarioVendedor(sales, categoriasInventario, fechaReferencia)
      if (cruces.length > 0) {
        p += '\n\n════════════════════\nCRUCE INVENTARIO × VENDEDOR × CANAL\n════════════════════'
        for (const c of cruces) {
          p += `\n\n${c.producto} (${c.diasInventario} días stock | ${c.clasificacion}):`
          p += `\n  Vendedores con historial:`
          for (const vv of c.vendedores) {
            p += `\n  - ${vv.vendedor}: hace ${vv.diasSinVender} días`
          }
          if (c.canalPrincipal) p += `\n  Canal con más movimiento: ${c.canalPrincipal}`
        }
      }
    }
  }

  // ─── Concentración clientes ───────────────────────────────────────────────
  if (dataAvailability.has_cliente && concentracionRiesgo.length > 0) {
    p += '\n\n════════════════════\nCLIENTES CONCENTRACIÓN\n════════════════════'
    for (const c of concentracionRiesgo.slice(0, 5)) {
      p += `\n- ${c.cliente}: ${c.pct_del_total.toFixed(1)}% del total`
      p += `\n  Vendedor: ${c.vendedores_involucrados.join(', ')}`
      if (dataAvailability.has_venta_neta && c.ventas_absolutas > 0) {
        p += `\n  Valor período: ${c.ventas_absolutas.toLocaleString()} ${mon}`
      }
    }
  }

  // ─── Reglas de profundidad navegable ─────────────────────────────────────
  p += `\n\n════════════════════\nREGLAS DE RESPUESTA ADICIONALES\n════════════════════
FORMATO DE RESPUESTA — sigue EXACTAMENTE este patrón:

### Título del problema o tema
- Dato concreto con nombre real y número
- Dato concreto con impacto en unidades o ${mon}
- **El dato más importante en negrita**

### Siguiente sección
- bullet con dato
- bullet con dato

[SEGUIMIENTO]
- ¿Pregunta específica 1?
- ¿Pregunta específica 2?
- ¿Pregunta específica 3?
[/SEGUIMIENTO]

PROHIBIDO:
- Escribir "PROBLEMA 1 —" o "PUNTO 1 —" o "SITUACIÓN GENERAL" como encabezado
- Párrafos largos sin bullets
- Texto corrido cuando hay múltiples items
- Más de 4 bullets por sección
- Encabezados en MAYÚSCULAS SIN ### delante

Para actor específico (vendedor/cliente): usa tabla markdown:
| Campo | Valor |
|-------|-------|
| Nombre | dato |

Para impactos económicos: **negrita** ej: **Impacto: 17,347 ${mon}**`

  if (ctx.activeEntityHint) {
    p += `\n\n${ctx.activeEntityHint}`
  }

  const result = p.trim()
  if (result.length > MAX_PROMPT_CHARS) {
    return result.slice(0, MAX_PROMPT_CHARS) + '\n\n[DATOS ADICIONALES OMITIDOS POR LÍMITE DE CONTEXTO]'
  }
  return result
}

// ─── parseFollowUps ───────────────────────────────────────────────────────────

export function parseFollowUps(content: string): {
  cleanContent: string
  followUps: string[]
} {
  const match = content.match(/\[SEGUIMIENTO\]([\s\S]*?)\[\/SEGUIMIENTO\]/)
  if (!match) return { cleanContent: content, followUps: [] }

  const followUps = match[1]
    .split('\n')
    .map(l => l.replace(/^[-•*]\s*/, '').trim())
    .filter(Boolean)

  const cleanContent = content
    .replace(/\[SEGUIMIENTO\][\s\S]*?\[\/SEGUIMIENTO\]/, '')
    .trim()

  return { cleanContent, followUps }
}

// ─── Backend base URL ─────────────────────────────────────────────────────────

const BASE_URL = (import.meta.env.VITE_FORECAST_API_URL as string | undefined) ?? 'http://localhost:8000'

async function callBackendChat(payload: Record<string, unknown>): Promise<string> {
  let response: Response
  try {
    response = await fetch(`${BASE_URL}/api/v1/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('API_ERROR')
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({ detail: 'API_ERROR' }))
    const code = (err as { detail?: string }).detail ?? 'API_ERROR'
    if (['CONFIG_MISSING', 'INVALID_KEY', 'RATE_LIMIT', 'API_ERROR'].includes(code)) {
      throw new Error(code)
    }
    throw new Error('API_ERROR')
  }

  const data = await response.json()
  return (data as { content: string }).content
}

// ─── sendDeepAnalysis ─────────────────────────────────────────────────────────

export async function sendDeepAnalysis(context: ChatContext): Promise<string> {
  const systemPrompt = buildSystemPrompt(context)

  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content:
        'Genera un diagnóstico completo del período actual usando ### para cada sección y bullets (-) para los datos. PROHIBIDO usar MAYÚSCULAS como encabezado sin ### delante.\n\n' +
        '### Situación general\n' +
        '[2-3 bullets con los números más importantes]\n\n' +
        '### Causa raíz de los problemas\n' +
        '[bullets con qué está causando los problemas, datos específicos]\n\n' +
        '### Top 3 vendedores a intervenir hoy\n' +
        '[un bullet por vendedor: nombre, problema, acción concreta]\n\n' +
        '### Top 3 clientes en riesgo de perder\n' +
        '[un bullet por cliente: nombre, días inactivo, valor, acción]\n\n' +
        '### Oportunidades inmediatas\n' +
        '[2-3 bullets con oportunidades concretas y nombres reales]\n\n' +
        '### Proyección si no se actúa\n' +
        '[bullets con qué pasa si no se hace nada esta semana]\n\n' +
        'Usa solo datos reales. Sin introducciones. Sin conclusiones genéricas.',
    },
  ]

  return callBackendChat({ messages, model: 'deepseek-reasoner', max_tokens: 2048 })
}

// ─── sendChatMessage ──────────────────────────────────────────────────────────

export async function sendChatMessage(
  messages: ChatMessage[],
  ctx: ChatContext
): Promise<string> {
  const systemPrompt = buildSystemPrompt(ctx)
  const recentMessages = messages.slice(-10)

  const apiMessages = [
    { role: 'system', content: systemPrompt },
    ...recentMessages.map((m) => ({ role: m.role, content: m.content })),
  ]

  return callBackendChat({
    messages: apiMessages,
    model: 'deepseek-chat',
    max_tokens: 1024,
    temperature: 0.3,
    top_p: 0.9,
    frequency_penalty: 0.1,
  })
}
