/**
 * lib/periods.ts — fuente única de cálculo de períodos y rangos temporales.
 *
 * Cumple regla del CONTEXT.md: "Funciones de fecha solo en lib/periods.ts.
 * Prohibido calcular fechas inline."
 *
 * Reglas de negocio que esta lib codifica:
 *  - Año natural únicamente (no fiscal).
 *  - "Hoy" = max(sales.fecha) — calculado por getFechaReferencia, no new Date().
 *  - YTD/MTD parcial vs período anterior se truncan al MISMO día del rango actual.
 *  - Año bisiesto: 29-feb se clampea a 28-feb cuando el año destino no es bisiesto.
 *
 * Sin dependencias externas — solo Date nativo.
 */

// ─── Tipos ────────────────────────────────────────────────────────

/**
 * Rango temporal [start, end] inclusivo. Ambas fechas son Date nativos.
 * Por convención: start = 00:00:00.000 del primer día; end = 23:59:59.999 del último día.
 */
export interface Range {
  start: Date
  end: Date
}

/**
 * Selección mensual del usuario. monthStart y monthEnd son índices 0-11 (enero=0).
 * year es año natural (2026, no fiscal).
 */
export interface MonthSelection {
  year: number
  monthStart: number // 0-11
  monthEnd: number // 0-11, >= monthStart
}

// ─── Helpers privados (NO exportar) ───────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0)
}

function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999)
}

function lastDayOfMonth(year: number, month: number): number {
  // Trick: día 0 del mes siguiente = último día del mes actual
  return new Date(year, month + 1, 0).getDate()
}

function isValidMonthIndex(m: number): boolean {
  return Number.isInteger(m) && m >= 0 && m <= 11
}

// ─── Primitiva 1: fecha de referencia ─────────────────────────────

/**
 * Devuelve la fecha más reciente de un set de ventas.
 * Si sales está vacío, devuelve null. El consumer decide qué hacer
 * (fallback a new Date(), error, mostrar empty state, etc.).
 *
 * Centraliza el cálculo que hoy duplican ClientePanel:97, VendedorPanel:554/921
 * y analysis.ts:87-95.
 *
 * @param sales array de objetos con campo .fecha (Date o ISO string).
 * @returns Date más reciente, o null si sales está vacío.
 */
export function getFechaReferencia(sales: Array<{ fecha: Date | string }>): Date | null {
  if (sales.length === 0) return null
  let max = -Infinity
  let maxDate: Date | null = null
  for (const s of sales) {
    const d = s.fecha instanceof Date ? s.fecha : new Date(s.fecha)
    const t = d.getTime()
    if (Number.isNaN(t)) continue
    if (t > max) {
      max = t
      maxDate = d
    }
  }
  return maxDate
}

// ─── Primitiva 2: rango YTD default ───────────────────────────────

/**
 * Construye el rango YTD por default desde fechaRef.
 * - start = 1-ene del año de fechaRef a 00:00:00.000
 * - end   = fechaRef truncado a 23:59:59.999 del mismo día
 *
 * Caso de uso: pantalla recién abierta sin selección del usuario.
 *
 * @example
 * fechaRef = 2026-04-20T15:30:00 → { start: 2026-01-01T00:00:00.000, end: 2026-04-20T23:59:59.999 }
 */
export function buildDefaultYtdRange(fechaRef: Date): Range {
  const year = fechaRef.getFullYear()
  return {
    start: new Date(year, 0, 1, 0, 0, 0, 0),
    end: endOfDay(fechaRef),
  }
}

// ─── Primitiva 3: rango mensual desde selección de usuario ────────

/**
 * Construye el rango calendario para una selección de meses, aplicando
 * truncamiento solo si el rango incluye fechaRef.
 *
 * Reglas:
 * - Si fechaRef > calendarEnd (ej: usuario eligió ene-feb 2026 con fechaRef=20-abr-2026):
 *   Rango cerrado completo: 1-ene a último día de feb a 23:59:59.999.
 * - Si calendarStart <= fechaRef <= calendarEnd (ej: usuario eligió ene-abr 2026 con fechaRef=20-abr-2026):
 *   end = fechaRef truncado a 23:59:59.999 (mes en curso, parcial).
 * - Si fechaRef < calendarStart (ej: usuario eligió may-jun 2026 con fechaRef=20-abr-2026):
 *   Devuelve el rango completo igualmente. El consumer decide si advertir "sin datos".
 *   No truncamos a fechaRef porque romperíamos la promesa "el usuario ve lo que pidió".
 *
 * @throws Error si monthEnd < monthStart o si meses están fuera de [0,11].
 */
export function buildMonthlyRange(selection: MonthSelection, fechaRef: Date): Range {
  if (!isValidMonthIndex(selection.monthStart)) {
    throw new Error(`monthStart fuera de rango [0,11]: ${selection.monthStart}`)
  }
  if (!isValidMonthIndex(selection.monthEnd)) {
    throw new Error(`monthEnd fuera de rango [0,11]: ${selection.monthEnd}`)
  }
  if (selection.monthEnd < selection.monthStart) {
    throw new Error(`monthEnd (${selection.monthEnd}) < monthStart (${selection.monthStart})`)
  }

  const calendarStart = new Date(selection.year, selection.monthStart, 1, 0, 0, 0, 0)
  const lastDay = lastDayOfMonth(selection.year, selection.monthEnd)
  const calendarEnd = new Date(selection.year, selection.monthEnd, lastDay, 23, 59, 59, 999)

  // Si fechaRef cae dentro del rango calendario, truncar end a fechaRef.
  if (fechaRef >= calendarStart && fechaRef <= calendarEnd) {
    return { start: calendarStart, end: endOfDay(fechaRef) }
  }
  // Si fechaRef está fuera (antes o después del rango), devolver completo.
  return { start: calendarStart, end: calendarEnd }
}

// ─── Primitiva 4: rango comparativo año-sobre-año ─────────────────

/**
 * Devuelve el mismo rango calendario del año anterior.
 * Preserva mes, día y hora del start y end. Solo resta 1 al año.
 *
 * Edge case 29-feb: si start o end caen en 29-feb de año bisiesto y el año
 * anterior NO es bisiesto, se clampea a 28-feb (mismas hh:mm:ss.SSS).
 *
 * @example
 * { start: 2026-01-01T00:00:00, end: 2026-04-20T23:59:59.999 }
 *   → { start: 2025-01-01T00:00:00, end: 2025-04-20T23:59:59.999 }
 */
export function buildComparisonRangeYoY(range: Range): Range {
  const shiftYear = (d: Date): Date => {
    const targetYear = d.getFullYear() - 1
    const month = d.getMonth()
    let day = d.getDate()
    // Clamp 29-feb cuando el año destino no es bisiesto
    if (month === 1 && day === 29) {
      const lastDay = lastDayOfMonth(targetYear, 1) // 28 en años no bisiestos
      day = Math.min(day, lastDay)
    }
    return new Date(
      targetYear,
      month,
      day,
      d.getHours(),
      d.getMinutes(),
      d.getSeconds(),
      d.getMilliseconds(),
    )
  }
  return {
    start: shiftYear(range.start),
    end: shiftYear(range.end),
  }
}

// ─── Primitiva 5: trunca rango a fechaRef si lo excede ────────────

/**
 * Si end del rango cae en el mismo día calendario o posterior a fechaRef,
 * lo normaliza a endOfDay(fechaRef). Si end es de un día anterior, no cambia.
 *
 * Esto cubre 3 casos:
 *  - end posterior (otro día) → trunca hacia atrás a fin del día de fechaRef.
 *  - end mismo día, hora < fechaRef → clampea hacia adelante a 23:59:59.999
 *    (canonicaliza "include all of fechaRef's day").
 *  - end día anterior → sin cambios.
 *
 * No modifica start, incluso si start > fechaRef (caso raro; el consumer decide).
 *
 * Caso de uso: usuario pide rango que se extiende más allá de los datos disponibles.
 * Ej: usuario elige ene-may 2026 con fechaRef=20-abr-2026 → trunca a ene 1 - abr 20.
 */
// ─── Primitiva 6: label legible de un rango mensual ───────────────

const MESES_LARGO = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const MESES_CORTO = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/**
 * Formatea un rango mensual como label legible.
 * - Mes único: "Junio 2026"
 * - Rango: "Mar–Jun 2026" (guion corto U+2013)
 * - opts.short=true en rango: "Mar–Jun '26"
 *
 * @throws Error si meses fuera de [0,11] o monthEnd < monthStart.
 */
export function formatPeriodLabel(
  year: number,
  monthStart: number,
  monthEnd: number,
  opts?: { short?: boolean },
): string {
  if (!isValidMonthIndex(monthStart)) {
    throw new Error(`monthStart fuera de rango [0,11]: ${monthStart}`)
  }
  if (!isValidMonthIndex(monthEnd)) {
    throw new Error(`monthEnd fuera de rango [0,11]: ${monthEnd}`)
  }
  if (monthEnd < monthStart) {
    throw new Error(`monthEnd (${monthEnd}) < monthStart (${monthStart})`)
  }
  if (monthStart === monthEnd) {
    return `${MESES_LARGO[monthStart]} ${year}`
  }
  const yearLabel = opts?.short ? `'${String(year).slice(-2)}` : String(year)
  return `${MESES_CORTO[monthStart]}–${MESES_CORTO[monthEnd]} ${yearLabel}`
}

export function truncateRangeToData(range: Range, fechaRef: Date): Range {
  const endDay = startOfDay(range.end).getTime()
  const refDay = startOfDay(fechaRef).getTime()
  if (endDay < refDay) {
    return range
  }
  return {
    start: range.start,
    end: endOfDay(fechaRef),
  }
}
