import type { Insight, VendorAnalysis } from '../types'

// ─────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────

export type DiagnosticSeverity = 'critical' | 'warning' | 'info' | 'positive'

export interface DiagnosticLink {
  label: string
  target: string
  type: 'vendedor' | 'cliente' | 'producto' | 'categoria'
}

export interface DiagnosticSection {
  label: string
  type: 'bullet' | 'action'
  items: string[]
}

export interface DiagnosticBlock {
  id: string
  severity: DiagnosticSeverity
  headline: string
  summaryShort: string
  sections: DiagnosticSection[]
  links: DiagnosticLink[]
  insightIds: string[]
  impactoTotal: number | null
  impactoLabel: string | null
}

// ─────────────────────────────────────────────────────────────────────
// Format helpers
// ─────────────────────────────────────────────────────────────────────

// Manual comma grouping — guarantees "2,531" / "3,967" regardless of locale/ICU
const fmtInt = (n: number): string => {
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

const fmtPct = (n: number): string => `${Math.round(Math.abs(n))}%`

const fmtMoney = (n: number): string => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`
  return `$${Math.round(n)}`
}

// Round a percentage extracted from a string (e.g. "28.5") to integer
const roundPctStr = (s: string): number => Math.round(parseFloat(s))

const truncate = (s: string, max: number): string => s.length <= max ? s : s.slice(0, max - 1) + '…'

// ─────────────────────────────────────────────────────────────────────
// Descripcion parsers — extract structured data from insightEngine outputs
// ─────────────────────────────────────────────────────────────────────

const parseTransition = (text: string): { from: number; to: number } | null => {
  // Matches "(646 → 187 uds)" or "(100 -> 25 uds)" or "(500→275 uds)"
  const m = text.match(/\((\d[\d,.]*)\s*[→\->]+\s*(\d[\d,.]*)\s*uds?\)/i)
  if (!m) return null
  return {
    from: parseInt(m[1].replace(/[,.]/g, ''), 10),
    to: parseInt(m[2].replace(/[,.]/g, ''), 10),
  }
}

const parseDiasSinComprar = (text: string): number | null => {
  const m = text.match(/(\d+)\s*d[ií]as\s+sin\s+comprar/i)
  return m ? parseInt(m[1], 10) : null
}

const parseStock = (text: string): number | null => {
  // "Stock: 150 uds" or "(150 uds, 30d sin rotación)"
  const m = text.match(/Stock:\s*(\d[\d,.]*)\s*uds/i)
  if (m) return parseInt(m[1].replace(/[,.]/g, ''), 10)
  // Fallback: first "(N uds" pattern
  const m2 = text.match(/\((\d[\d,.]*)\s*uds/)
  return m2 ? parseInt(m2[1].replace(/[,.]/g, ''), 10) : null
}

const parseDiasSinVentas = (text: string): number | null => {
  const m = text.match(/Sin ventas en (\d+)\s*d[ií]as/i)
  return m ? parseInt(m[1], 10) : null
}

const parseClienteDeclive = (text: string): { pct: number } | null => {
  // "ClienteX · Cayó 35.2% vs ..."
  const m = text.match(/Cay[oó]\s*(\d+(?:\.\d+)?)%/i)
  return m ? { pct: roundPctStr(m[1]) } : null
}

const parseCategoriaColapso = (text: string): { categoria: string; pct: number; from: number; to: number } | null => {
  // '"Snacks" cayó 42.5% vs su promedio histórico (948 → 548 uds)'
  const cat = text.match(/^"([^"]+)"\s*cay[oó]\s*(\d+(?:\.\d+)?)%/i)
  const trans = parseTransition(text)
  if (!cat) return null
  return {
    categoria: cat[1],
    pct: roundPctStr(cat[2]),
    from: trans?.from ?? 0,
    to: trans?.to ?? 0,
  }
}

const parseDependenciaVendedor = (text: string): { pct: number; zona: string; uds: number } | null => {
  // "El 65.0% del volumen de ChannelX depende de Vendedor1 (300 de 462 uds) — ..."
  const m = text.match(/El\s+(\d+(?:\.\d+)?)%\s+del\s+volumen\s+de\s+([^\s]+(?:\s+[^\s]+)*?)\s+depende\s+de\s+\S+\s+\((\d[\d,.]*)\s+de/i)
  if (!m) return null
  return {
    pct: roundPctStr(m[1]),
    zona: m[2].trim(),
    uds: parseInt(m[3].replace(/[,.]/g, ''), 10),
  }
}

const parseMonoCategoria = (text: string): { pct: number; categoria: string } | null => {
  // 'Vendedor1 genera el 90.0% de sus ventas en "Electronics".'
  const m = text.match(/(\d+(?:\.\d+)?)%\s+de\s+sus\s+ventas\s+en\s+"([^"]+)"/i)
  return m ? { pct: roundPctStr(m[1]), categoria: m[2] } : null
}

const parseMigracionCanal = (text: string): { from: string; to: string } | null => {
  // "Mostrador cayó 150 uds pero Visita directa creció 130 — ..."
  const m = text.match(/^(.+?)\s+cay[oó]\s+[\d,]+\s+uds\s+pero\s+(.+?)\s+creci[oó]/i)
  return m ? { from: m[1].trim(), to: m[2].trim() } : null
}

const parseOutlier = (text: string): { vendorPct: number; teamPct: number } | null => {
  // "Vendedor1 crece +35.2% cuando el equipo promedia -5.1% — ..."
  const m = text.match(/([+-]?\d+(?:\.\d+)?)%\s+cuando\s+el\s+equipo\s+promedia\s+([+-]?\d+(?:\.\d+)?)%/i)
  if (!m) return null
  return {
    vendorPct: roundPctStr(m[1]),
    teamPct: roundPctStr(m[2]),
  }
}

// Outlier "alto" detection — check titulo first (most reliable), descripcion fallback
const isOutlierAlto = (i: Insight): boolean => {
  if (i.detector !== 'outlier_variacion') return false
  if (/at[ií]pico\s+alto/i.test(i.titulo)) return true
  if (/at[ií]picamente\s+alto/i.test(i.descripcion)) return true
  return false
}

const parseOportunidad = (text: string): { count: number } | null => {
  // "5 productos tienen ventas a nivel general pero 0 cobertura en algunos departamentos..."
  const m = text.match(/^(\d+)\s+productos/i)
  return m ? { count: parseInt(m[1], 10) } : null
}

// ─────────────────────────────────────────────────────────────────────
// Insight classification helpers
// ─────────────────────────────────────────────────────────────────────

const PRIORITY_ORDER: Record<string, number> = { CRITICA: 0, ALTA: 1, MEDIA: 2, BAJA: 3 }

const isPositive = (i: Insight): boolean => {
  if (i.id.startsWith('superando-')) return true
  if (i.id.startsWith('mejor-momento-')) return true
  if (i.id.startsWith('prod-crecimiento-')) return true
  if (i.id.startsWith('cliente-nuevo-')) return true
  if (i.detector === 'oportunidad_no_explotada') return true
  if (i.detector === 'migracion_canal') return true
  if (i.detector === 'outlier_variacion') return isOutlierAlto(i)
  return false
}

const labelFromTipo = (tipo?: 'perdida' | 'riesgo' | 'oportunidad'): string => {
  if (tipo === 'perdida') return 'pérdida estimada'
  if (tipo === 'riesgo') return 'valor en riesgo'
  if (tipo === 'oportunidad') return 'oportunidad'
  return 'impacto económico'
}

const maxImpact = (items: Insight[]): { valor: number; label: string } | null => {
  let best: Insight | null = null
  for (const i of items) {
    if (!i.impacto_economico) continue
    if (!best || i.impacto_economico.valor > (best.impacto_economico?.valor ?? 0)) best = i
  }
  if (!best || !best.impacto_economico) return null
  return { valor: best.impacto_economico.valor, label: labelFromTipo(best.impacto_economico.tipo) }
}

const limitItems = (arr: string[], max: number): string[] => {
  if (arr.length <= max) return arr
  const head = arr.slice(0, max)
  const remaining = arr.length - max
  head.push(`y ${remaining} más`)
  return head
}

// ─────────────────────────────────────────────────────────────────────
// Block builders
// ─────────────────────────────────────────────────────────────────────

const buildVendorBlock = (
  vendedor: string,
  items: Insight[],
  vendorAnalysis: VendorAnalysis[] | undefined,
): DiagnosticBlock => {
  const sortedByPriority = [...items].sort(
    (a, b) => PRIORITY_ORDER[a.prioridad] - PRIORITY_ORDER[b.prioridad],
  )
  const va = vendorAnalysis?.find(v => v.vendedor === vendedor)

  const hasCritica = items.some(i => i.prioridad === 'CRITICA')
  const severity: DiagnosticSeverity = hasCritica ? 'critical' : 'warning'

  const has = (prefix: string) => items.some(i => i.id.startsWith(prefix))
  const hasMeta = has('meta-peligro-')
  const hasDeterioro = has('deterioro-')
  const hasDoble = has('doble-riesgo-')

  let headline: string
  if (hasMeta && (hasDeterioro || hasDoble)) headline = `${vendedor} necesita intervención`
  else if (hasMeta) headline = `${vendedor} está lejos de su meta`
  else if (hasDeterioro) headline = `${vendedor} viene cayendo`
  else headline = `${vendedor} bajo presión`

  // ── summaryShort: build from VendorAnalysis ─────────────────────
  let summaryShort: string
  if (va && va.variacion_vs_promedio_pct != null && va.proyeccion_cierre != null && va.meta && va.cumplimiento_pct != null) {
    const caidaPct = fmtPct(va.variacion_vs_promedio_pct)
    const proy = fmtInt(va.proyeccion_cierre)
    const meta = fmtInt(va.meta)
    const cumpl = Math.round(va.cumplimiento_pct)
    summaryShort = `Cayó ${caidaPct} vs su promedio. Proyecta ${proy} de ${meta} uds (${cumpl}%).`
  } else if (va && va.proyeccion_cierre != null && va.meta && va.cumplimiento_pct != null) {
    summaryShort = `Proyecta ${fmtInt(va.proyeccion_cierre)} de ${fmtInt(va.meta)} uds (${Math.round(va.cumplimiento_pct)}%).`
  } else {
    summaryShort = `${items.length} señales de riesgo detectadas.`
  }

  // ── ¿Por qué? section ──────────────────────────────────────────
  const porque: string[] = []
  const seen = new Set<string>()
  const pushUnique = (text: string) => {
    if (text && !seen.has(text)) {
      seen.add(text)
      porque.push(truncate(text, 110))
    }
  }

  // 1. Caída explicada — top cliente que justifica la caída
  const caida = items.find(i => i.id.startsWith('caida-explicada-'))
  if (caida && caida.cliente) {
    const trans = parseTransition(caida.descripcion)
    if (trans) {
      pushUnique(`Su caída viene de ${caida.cliente} (${fmtInt(trans.from)}→${fmtInt(trans.to)} uds)`)
    } else {
      pushUnique(`Su caída viene de ${caida.cliente}`)
    }
  }

  // 2. Causa raíz compartida (hallazgo absorbido)
  const causaRaiz = items.find(i => i.detector === 'causa_raiz_compartida')
  if (causaRaiz) {
    pushUnique(`Concentra caídas en varios departamentos o canales — posible causa raíz`)
  }

  // 3. Outlier bajo (hallazgo absorbido)
  const outlierBajo = items.find(i => i.detector === 'outlier_variacion' && !isOutlierAlto(i))
  if (outlierBajo) {
    const o = parseOutlier(outlierBajo.descripcion)
    if (o) {
      const vSign = o.vendorPct >= 0 ? '+' : ''
      const tSign = o.teamPct >= 0 ? '+' : ''
      pushUnique(`Varía ${vSign}${o.vendorPct}% cuando el equipo promedia ${tSign}${o.teamPct}% — rendimiento atípico`)
    } else {
      pushUnique(`Rendimiento atípicamente bajo vs el equipo`)
    }
  }

  // 4. Clientes dormidos del vendedor
  const dormidos = items.filter(i => i.id.startsWith('cliente-riesgo-') && i.cliente)
  for (const d of dormidos) {
    const dias = parseDiasSinComprar(d.descripcion)
    if (dias != null) {
      pushUnique(`${d.cliente} · ${dias} días sin comprar`)
    } else {
      const declive = parseClienteDeclive(d.descripcion)
      if (declive) pushUnique(`${d.cliente} · cayó ${declive.pct}% vs año anterior`)
      else pushUnique(`${d.cliente} · cliente en riesgo`)
    }
  }

  // 5. Sub-ejecución (patrón consecutivo)
  const subejec = items.find(i => i.id.startsWith('subejec-'))
  if (subejec) {
    pushUnique(`3 meses consecutivos bajo el 85% de su meta`)
  }

  // ── Qué puedes hacer — dormido + inventario estancado ──────────
  const acciones: string[] = []
  const dormidoEstancados = items.filter(i => i.id.startsWith('dormido-estancado-'))
  for (const d of dormidoEstancados) {
    if (!d.cliente || !d.producto) continue
    const stock = parseStock(d.descripcion)
    if (stock != null) {
      acciones.push(truncate(`${d.cliente} compraba ${d.producto} — tienes ${fmtInt(stock)} uds en stock`, 110))
    } else {
      acciones.push(truncate(`${d.cliente} compraba ${d.producto} — hay stock disponible`, 110))
    }
  }

  const sections: DiagnosticSection[] = []
  if (porque.length > 0) {
    sections.push({ label: '¿Por qué?', type: 'bullet', items: limitItems(porque, 5) })
  }
  if (acciones.length > 0) {
    sections.push({ label: 'Qué puedes hacer', type: 'action', items: limitItems(acciones, 3) })
  }

  // ── Links ──────────────────────────────────────────────────────
  const targets = new Set<string>()
  const links: DiagnosticLink[] = [{ label: `${vendedor} →`, target: vendedor, type: 'vendedor' }]
  targets.add(vendedor)
  // Top cliente from ¿Por qué? — first one mentioned
  for (const i of [...sortedByPriority]) {
    if (i.cliente && !targets.has(i.cliente)) {
      targets.add(i.cliente)
      links.push({ label: `${i.cliente} →`, target: i.cliente, type: 'cliente' })
      if (links.length >= 3) break
    }
  }

  const impact = maxImpact(items)

  return {
    id: `vendor-${vendedor}`,
    severity,
    headline,
    summaryShort: truncate(summaryShort, 120),
    sections,
    links,
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
  }
}

const buildProductBlock = (items: Insight[]): DiagnosticBlock => {
  const colapso = items.find(i => i.id.startsWith('cat-colapso-'))
  const sinMov = items.filter(i => i.id.startsWith('prod-riesgo-'))

  let headline: string
  let summaryShort: string

  if (colapso) {
    const parsed = parseCategoriaColapso(colapso.descripcion)
    // Fallback: extract category name from titulo "Categoría en colapso — Snacks"
    const catFromTitulo = colapso.titulo.match(/—\s*(.+?)\s*$/)?.[1]
                      ?? colapso.titulo.replace(/^Categor[ií]a en colapso\s*[—-]?\s*/i, '').trim()
    const categoria = parsed?.categoria ?? catFromTitulo ?? 'Una categoría'
    // Fallback for percentage: extract any X.Y% from the first sentence
    const pctMatch = colapso.descripcion.match(/(\d+(?:\.\d+)?)%/)
    const pctVal = parsed?.pct ?? (pctMatch ? roundPctStr(pctMatch[1]) : null)
    // Fallback for transition
    const trans = parseTransition(colapso.descripcion)
    const from = parsed?.from ?? trans?.from ?? 0
    const to = parsed?.to ?? trans?.to ?? 0

    if (pctVal !== null) {
      headline = `${categoria} cayó ${pctVal}%`
      if (from > 0 && to > 0) {
        summaryShort = `${categoria} cayó ${pctVal}% vs su promedio (${fmtInt(from)}→${fmtInt(to)} uds).`
      } else {
        summaryShort = `${categoria} cayó ${pctVal}% vs su promedio.`
      }
    } else {
      headline = `${categoria} se está desplomando`
      summaryShort = `${categoria} cayó de forma significativa este período.`
    }
  } else if (sinMov.length >= 2) {
    headline = `${sinMov.length} productos sin movimiento`
    summaryShort = `${sinMov.length} productos llevan semanas o meses sin venderse.`
  } else {
    headline = 'Productos en riesgo'
    summaryShort = `${items.length} productos requieren atención.`
  }

  // ── Productos afectados section ────────────────────────────────
  const productosBullets: string[] = []
  for (const p of sinMov) {
    if (!p.producto) continue
    const dias = parseDiasSinVentas(p.descripcion)
    const stock = parseStock(p.descripcion)
    if (dias != null && stock != null) {
      productosBullets.push(truncate(`${p.producto} · sin ventas en ${dias} días · ${fmtInt(stock)} uds en stock`, 110))
    } else if (dias != null) {
      productosBullets.push(truncate(`${p.producto} · sin ventas en ${dias} días`, 110))
    } else {
      // Caída
      const declive = p.descripcion.match(/Cay[oó]\s+(\d+(?:\.\d+)?)%/i)
      if (declive) {
        productosBullets.push(truncate(`${p.producto} · cayó ${roundPctStr(declive[1])}% vs año anterior`, 110))
      } else {
        productosBullets.push(truncate(`${p.producto}`, 110))
      }
    }
  }

  const sections: DiagnosticSection[] = []
  if (productosBullets.length > 0) {
    sections.push({ label: 'Productos afectados', type: 'bullet', items: limitItems(productosBullets, 5) })
  }

  // Links
  const links: DiagnosticLink[] = []
  const productSet = new Set<string>()
  for (const i of items) {
    if (i.producto && !productSet.has(i.producto)) {
      productSet.add(i.producto)
      links.push({ label: `${i.producto} →`, target: i.producto, type: 'producto' })
      if (links.length >= 3) break
    }
  }
  if (links.length === 0) {
    links.push({ label: 'Ver rotación →', target: '', type: 'producto' })
  }

  const impact = maxImpact(items)

  return {
    id: 'productos',
    severity: 'warning',
    headline,
    summaryShort: truncate(summaryShort, 120),
    sections,
    links,
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
  }
}

const buildConcentracionBlock = (items: Insight[]): DiagnosticBlock => {
  const dependencias = items.filter(i => i.detector === 'dependencia_vendedor')
  const monoCats = items.filter(i => i.id.startsWith('mono-cat-'))

  const n = dependencias.length
  const headline = n > 0
    ? `Riesgo de concentración en ${n} ${n === 1 ? 'zona' : 'zonas'}`
    : 'Riesgo de concentración'

  const summaryShort = n > 0
    ? `${n} ${n === 1 ? 'zona depende' : 'zonas dependen'} de un solo vendedor.`
    : `${items.length} señales de concentración detectadas.`

  // ── Zonas section ──────────────────────────────────────────────
  const zonasBullets: string[] = []
  for (const dep of dependencias) {
    const parsed = parseDependenciaVendedor(dep.descripcion)
    if (parsed && dep.vendedor) {
      zonasBullets.push(truncate(`${parsed.zona}: ${parsed.pct}% depende de ${dep.vendedor} (${fmtInt(parsed.uds)} uds)`, 110))
    } else if (dep.vendedor) {
      zonasBullets.push(truncate(`Una zona concentrada en ${dep.vendedor}`, 110))
    }
  }

  // ── Mono-categoria section ─────────────────────────────────────
  const monoBullets: string[] = []
  for (const m of monoCats) {
    const parsed = parseMonoCategoria(m.descripcion)
    if (parsed && m.vendedor) {
      monoBullets.push(truncate(`${m.vendedor} concentra ${parsed.pct}% en ${parsed.categoria}`, 110))
    }
  }

  const sections: DiagnosticSection[] = []
  if (zonasBullets.length > 0) {
    sections.push({ label: 'Zonas', type: 'bullet', items: limitItems(zonasBullets, 5) })
  }
  if (monoBullets.length > 0) {
    sections.push({ label: 'Además', type: 'bullet', items: limitItems(monoBullets, 3) })
  }

  // Links
  const links: DiagnosticLink[] = []
  const vendorSet = new Set<string>()
  for (const i of items) {
    if (i.vendedor && !vendorSet.has(i.vendedor)) {
      vendorSet.add(i.vendedor)
      links.push({ label: `${i.vendedor} →`, target: i.vendedor, type: 'vendedor' })
      if (links.length >= 4) break
    }
  }

  return {
    id: 'concentracion',
    severity: 'warning',
    headline,
    summaryShort: truncate(summaryShort, 120),
    sections,
    links,
    insightIds: items.map(i => i.id),
    impactoTotal: null,
    impactoLabel: null,
  }
}

const buildClientsBlock = (items: Insight[]): DiagnosticBlock => {
  // Only the actual cliente-riesgo insights — hallazgos are absorbed silently
  const clienteInsights = items.filter(i => i.id.startsWith('cliente-riesgo-') && i.cliente)
  const n = clienteInsights.length

  const headline = n === 1
    ? `${clienteInsights[0].cliente} necesita atención`
    : `${n} clientes cayeron significativamente`

  const summaryShort = n === 1
    ? `Un cliente importante en declive vs año anterior.`
    : `${n} clientes cayeron significativamente vs año anterior.`

  // ── Detalles section ───────────────────────────────────────────
  const detallesBullets: string[] = []
  for (const c of clienteInsights) {
    if (!c.cliente) continue
    const declive = parseClienteDeclive(c.descripcion)
    const dias = parseDiasSinComprar(c.descripcion)
    let line: string
    if (declive && c.vendedor) {
      line = `${c.cliente} · cayó ${declive.pct}% · atendido por ${c.vendedor}`
    } else if (dias != null && c.vendedor) {
      line = `${c.cliente} · ${dias} días sin comprar · ${c.vendedor}`
    } else if (declive) {
      line = `${c.cliente} · cayó ${declive.pct}%`
    } else if (c.vendedor) {
      line = `${c.cliente} · atendido por ${c.vendedor}`
    } else {
      line = `${c.cliente}`
    }
    detallesBullets.push(truncate(line, 110))
  }

  const sections: DiagnosticSection[] = []
  if (detallesBullets.length > 0) {
    sections.push({ label: 'Detalles', type: 'bullet', items: limitItems(detallesBullets, 5) })
  }

  // Links
  const links: DiagnosticLink[] = []
  const set = new Set<string>()
  for (const i of clienteInsights) {
    if (i.cliente && !set.has(i.cliente)) {
      set.add(i.cliente)
      links.push({ label: `${i.cliente} →`, target: i.cliente, type: 'cliente' })
      if (links.length >= 4) break
    }
  }

  const impact = maxImpact(items)

  return {
    id: 'clientes-sueltos',
    severity: 'warning',
    headline,
    summaryShort: truncate(summaryShort, 120),
    sections,
    links,
    insightIds: items.map(i => i.id),
    impactoTotal: impact?.valor ?? null,
    impactoLabel: impact?.label ?? null,
  }
}

const buildPositiveBlock = (items: Insight[]): DiagnosticBlock => {
  const headline = 'Lo que está funcionando'
  const summaryShort = `${items.length} ${items.length === 1 ? 'señal positiva' : 'señales positivas'} este mes.`

  const bullets: string[] = []
  for (const i of items) {
    if (i.detector === 'migracion_canal') {
      const parsed = parseMigracionCanal(i.descripcion)
      if (parsed) {
        bullets.push(truncate(`Volumen migró de ${parsed.from} a ${parsed.to} — no se perdió venta`, 110))
        continue
      }
    }
    if (i.detector === 'outlier_variacion' && isOutlierAlto(i) && i.vendedor) {
      const o = parseOutlier(i.descripcion)
      if (o) {
        const teamSign = o.teamPct >= 0 ? '+' : ''
        const vendSign = o.vendorPct >= 0 ? '+' : ''
        bullets.push(truncate(`${i.vendedor} crece ${vendSign}${o.vendorPct}% cuando el equipo promedia ${teamSign}${o.teamPct}%`, 110))
      } else {
        bullets.push(truncate(`${i.vendedor} con rendimiento atípicamente alto vs el equipo`, 110))
      }
      continue
    }
    if (i.detector === 'oportunidad_no_explotada') {
      const parsed = parseOportunidad(i.descripcion)
      if (parsed) {
        bullets.push(truncate(`${parsed.count} productos sin cobertura en algunos departamentos`, 110))
        continue
      }
    }
    if (i.id.startsWith('superando-') && i.vendedor) {
      const m = i.descripcion.match(/super[oó]\s+su\s+meta\s+en\s+(\d+(?:\.\d+)?)%/i)
      if (m) {
        bullets.push(truncate(`${i.vendedor} superó su meta en ${roundPctStr(m[1])}%`, 110))
        continue
      }
    }
    if (i.id.startsWith('mejor-momento-') && i.vendedor) {
      bullets.push(truncate(`${i.vendedor} en su mejor período reciente`, 110))
      continue
    }
    if (i.id.startsWith('prod-crecimiento-') && i.producto) {
      const m = i.descripcion.match(/creci[oó]\s+(\d+(?:\.\d+)?)%/i)
      if (m) {
        bullets.push(truncate(`${i.producto} creció ${roundPctStr(m[1])}% este período`, 110))
        continue
      }
    }
    if (i.id.startsWith('cliente-nuevo-') && i.cliente) {
      bullets.push(truncate(`${i.cliente} es un cliente nuevo activo`, 110))
      continue
    }
  }

  // Links: positive vendors
  const links: DiagnosticLink[] = []
  const vSet = new Set<string>()
  for (const i of items) {
    if (i.vendedor && !vSet.has(i.vendedor)) {
      vSet.add(i.vendedor)
      links.push({ label: `${i.vendedor} →`, target: i.vendedor, type: 'vendedor' })
      if (links.length >= 3) break
    }
  }

  return {
    id: 'positivo',
    severity: 'positive',
    headline,
    summaryShort,
    sections: bullets.length > 0
      ? [{ label: 'Hallazgos', type: 'bullet', items: limitItems(bullets, 6) }]
      : [],
    links,
    insightIds: items.map(i => i.id),
    impactoTotal: null,
    impactoLabel: null,
  }
}

// ─────────────────────────────────────────────────────────────────────
// Main entry point
// ─────────────────────────────────────────────────────────────────────

export function buildDiagnostic(
  insights: Insight[],
  vendorAnalysis?: VendorAnalysis[],
): DiagnosticBlock[] {
  if (!insights || insights.length === 0) return []

  const blocks: DiagnosticBlock[] = []
  const used = new Set<string>()
  const mark = (ids: string[]) => ids.forEach(id => used.add(id))
  const remaining = () => insights.filter(i => !used.has(i.id))

  // ── Step 1: Vendor protagonists ────────────────────────────────
  // Group non-positive, non-hallazgo insights by vendor
  const vendorMap = new Map<string, Insight[]>()
  for (const insight of insights) {
    if (!insight.vendedor) continue
    if (isPositive(insight)) continue
    if (insight.tipo === 'hallazgo') continue
    if (!vendorMap.has(insight.vendedor)) vendorMap.set(insight.vendedor, [])
    vendorMap.get(insight.vendedor)!.push(insight)
  }

  // Identify protagonists (3+ non-hallazgo insights)
  const protagonists = [...vendorMap.entries()]
    .filter(([, items]) => items.length >= 3)
    .sort((a, b) => {
      const aImpact = maxImpact(a[1])?.valor ?? 0
      const bImpact = maxImpact(b[1])?.valor ?? 0
      if (b[1].length !== a[1].length) return b[1].length - a[1].length
      return bImpact - aImpact
    })

  // For each protagonist, ALSO absorb their hallazgo insights
  for (const [vendedor, baseItems] of protagonists) {
    const absorbedHallazgos = insights.filter(i =>
      i.tipo === 'hallazgo' && i.vendedor === vendedor && !isPositive(i),
    )
    const allItems = [...baseItems, ...absorbedHallazgos]
    blocks.push(buildVendorBlock(vendedor, allItems, vendorAnalysis))
    mark(allItems.map(i => i.id))
  }

  // ── Step 2: Products / Categories ──────────────────────────────
  const productInsights = remaining().filter(i =>
    i.tipo === 'riesgo_producto' && !isPositive(i),
  )
  if (productInsights.length > 0) {
    blocks.push(buildProductBlock(productInsights))
    mark(productInsights.map(i => i.id))
  }

  // ── Step 3: Concentración (dependencia + mono-cat) ─────────────
  const concentracion = remaining().filter(i =>
    i.detector === 'dependencia_vendedor' || i.id.startsWith('mono-cat-'),
  )
  if (concentracion.length > 0) {
    blocks.push(buildConcentracionBlock(concentracion))
    mark(concentracion.map(i => i.id))
  }

  // ── Step 4: Loose clients ──────────────────────────────────────
  const looseClients = remaining().filter(i =>
    (i.tipo === 'riesgo_cliente' || i.id.startsWith('cliente-riesgo-')) && !isPositive(i),
  )
  if (looseClients.length > 0) {
    // Collect vendors that attend these clients
    const attendingVendors = new Set<string>()
    for (const c of looseClients) {
      if (c.vendedor) attendingVendors.add(c.vendedor)
    }
    // Absorb hallazgos for these vendors silently (don't display, just consume)
    const absorbedHallazgos = remaining().filter(i =>
      i.tipo === 'hallazgo' && i.vendedor && attendingVendors.has(i.vendedor) && !isPositive(i),
    )
    blocks.push(buildClientsBlock(looseClients))
    mark(looseClients.map(i => i.id))
    mark(absorbedHallazgos.map(i => i.id))
  }

  // ── Step 5: Positive block ─────────────────────────────────────
  const positives = insights.filter(i => isPositive(i))
  if (positives.length > 0) {
    blocks.push(buildPositiveBlock(positives))
    mark(positives.map(i => i.id))
  }

  // Cap at 6 blocks
  if (blocks.length > 6) return blocks.slice(0, 6)
  return blocks
}
