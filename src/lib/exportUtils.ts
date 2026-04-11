import type { Insight, TeamStats, VendorAnalysis, ClienteDormido } from '../types'
import type { AlertStatusRecord } from '../store/alertStatusStore'
import { getAlertKey } from './alertKey'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

function fmt(n: number): string {
  return new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n: number): string {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`
}

export interface ShareTextParams {
  empresa: string
  moneda: string
  selectedPeriod: { year: number; month: number }
  teamStats: TeamStats | null
  insights: Insight[]
  vendorAnalysis: VendorAnalysis[]
  clientesDormidos: ClienteDormido[]
  alertStatuses: Record<string, AlertStatusRecord>
}

/** Genera los bullets del resumen ejecutivo a partir de datos del store */
function buildResumenBullets(
  teamStats: TeamStats,
  vendorAnalysis: VendorAnalysis[],
  clientesDormidos: ClienteDormido[],
): string[] {
  const bullets: string[] = []

  // Bullet 1 — ritmo del mes vs histórico
  const uds  = teamStats.total_unidades
  const dias = teamStats.dias_transcurridos
  const vPct = teamStats.variacion_pct
  if (vPct != null) {
    const abs = Math.abs(vPct).toFixed(0)
    if (vPct > 10)        bullets.push(`El mes va ${abs}% por encima del ritmo histórico (${fmt(uds)} uds al día ${dias}).`)
    else if (vPct < -10)  bullets.push(`El mes va ${abs}% por debajo del ritmo histórico (${fmt(uds)} uds al día ${dias}).`)
    else                   bullets.push(`El mes avanza en línea con el ritmo histórico (${fmt(uds)} uds al día ${dias}).`)
  } else if (uds > 0) {
    bullets.push(`Acumulado al día ${dias}: ${fmt(uds)} uds.`)
  }

  // Bullet 2 — vendedores críticos
  const nTotal    = vendorAnalysis.length
  const nCriticos = vendorAnalysis.filter(v => v.riesgo === 'critico').length
  if (nCriticos > 0) {
    const pct = Math.round((nCriticos / nTotal) * 100)
    bullets.push(`🔴 ${nCriticos} de ${nTotal} vendedores (${pct}%) presentan riesgo crítico.`)
  }

  // Bullet 3 — clientes dormidos
  if (clientesDormidos.length > 0) {
    const recuperables = clientesDormidos.filter(
      c => c.recovery_label === 'alta' || c.recovery_label === 'recuperable'
    ).length
    if (recuperables > 0) {
      bullets.push(`🔴 ${clientesDormidos.length} clientes sin actividad — ${recuperables} con alta probabilidad de reactivación.`)
    } else {
      bullets.push(`🔴 ${clientesDormidos.length} clientes sin actividad en el período actual.`)
    }
  }

  return bullets
}

/**
 * Genera el texto plano formateado para compartir por WhatsApp/email.
 */
export function buildShareText({
  empresa,
  moneda,
  selectedPeriod,
  teamStats,
  insights,
  vendorAnalysis,
  clientesDormidos,
  alertStatuses,
}: ShareTextParams): string {
  const mes  = MESES[selectedPeriod.month]
  const año  = selectedPeriod.year
  const dias = teamStats?.dias_transcurridos ?? 0
  const diasTotales = teamStats?.dias_totales ?? 30

  const lines: string[] = []

  lines.push(`📊 Estado Comercial — ${empresa}`)
  lines.push(`${mes} ${año} | Día ${dias} de ${diasTotales}`)
  lines.push('')

  // Resumen ejecutivo (bullets del estado del mes)
  if (teamStats) {
    const bullets = buildResumenBullets(teamStats, vendorAnalysis, clientesDormidos)
    bullets.forEach(b => lines.push(b))
    if (bullets.length > 0) lines.push('')
  }

  // KPIs del equipo
  if (teamStats) {
    const kpis: string[] = []

    if (teamStats.ytd_actual_equipo != null) {
      const varPct = teamStats.variacion_ytd_equipo != null
        ? ` (${fmtPct(teamStats.variacion_ytd_equipo)} vs año anterior)`
        : ''
      kpis.push(`YTD: ${fmt(teamStats.ytd_actual_equipo)} uds${varPct}`)
    }

    if (teamStats.proyeccion_equipo != null) {
      kpis.push(`Proyección cierre: ${moneda}${fmt(teamStats.proyeccion_equipo)}`)
    }

    if (teamStats.cumplimiento_equipo != null) {
      kpis.push(`Meta equipo: ${teamStats.cumplimiento_equipo.toFixed(0)}%`)
    }

    if (teamStats.mejor_vendedor) {
      kpis.push(`Mejor vendedor: ${teamStats.mejor_vendedor}`)
    }

    if (teamStats.vendedor_critico) {
      kpis.push(`Vendedor crítico: ${teamStats.vendedor_critico}`)
    }

    if (kpis.length > 0) {
      lines.push('📈 KPIs:')
      kpis.forEach(k => lines.push(`   • ${k}`))
      lines.push('')
    }
  }

  // Top 5 alertas pendientes
  const pendingInsights = insights
    .filter(i => (alertStatuses[getAlertKey(i)]?.status ?? 'pending') === 'pending')
    .slice(0, 5)

  if (pendingInsights.length > 0) {
    lines.push('⚠️ Top alertas pendientes:')
    pendingInsights.forEach((i, n) => lines.push(`   ${n + 1}. ${i.titulo}`))
  } else {
    lines.push('✅ Sin alertas pendientes')
  }

  lines.push('')
  lines.push('— Generado por SalesFlow')

  return lines.join('\n')
}

/**
 * Copia texto al portapapeles con fallback a execCommand.
 * Devuelve true si tuvo éxito.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Fallback para navegadores sin permisos de clipboard
    try {
      const el = document.createElement('textarea')
      el.value = text
      el.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0'
      document.body.appendChild(el)
      el.focus()
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
      return true
    } catch {
      return false
    }
  }
}
