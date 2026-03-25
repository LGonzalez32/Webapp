import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { SaleRecord, MetaRecord, InventoryItem, DataAvailability, ParseError, ParseResult, DiscardedRow } from '../types'

// ─── NORMALIZACIÓN ───────────────────────────────────────────────────────────

export function normalizeStr(s: string): string {
  return s
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

// ─── ALIASES DE COLUMNAS ─────────────────────────────────────────────────────

export const SALES_MAPPINGS: Record<string, string[]> = {
  fecha: ['date', 'Date', 'Fecha', 'fecha_venta', 'sale_date', 'FECHA', 'Fecha_Venta'],
  vendedor: [
    'vendor', 'Vendedor', 'salesperson', 'rep', 'representante', 'VENDEDOR',
    'Salesperson', 'agente', 'Agente', 'ejecutivo', 'Ejecutivo', 'vendedor',
    'seller', 'Seller',
  ],
  unidades: [
    'units', 'Units', 'cantidad', 'qty', 'Unidades', 'amount', 'Amount',
    'UNIDADES', 'CANTIDAD', 'QTY', 'unidades',
  ],
  producto: [
    'product', 'Product', 'Producto', 'sku', 'SKU', 'PRODUCTO', 'item', 'Item',
    'articulo', 'Articulo', 'producto',
  ],
  cliente: [
    'client', 'Client', 'Cliente', 'customer', 'Customer', 'CLIENTE',
    'razon_social', 'cuenta', 'Cuenta', 'cliente',
  ],
  venta_neta: [
    'monto', 'Monto', 'venta', 'Venta', 'revenue', 'Revenue', 'importe',
    'Importe', 'total', 'Total', 'MONTO', 'venta_neta', 'net_sales',
  ],
  categoria: [
    'category', 'Category', 'Categoria', 'linea', 'Linea', 'CATEGORIA',
    'familia', 'Familia', 'grupo', 'Grupo', 'categoria',
  ],
  proveedor: [
    'supplier', 'Supplier', 'Proveedor', 'vendor', 'PROVEEDOR', 'proveedor',
  ],
  canal: [
    'canal', 'Canal', 'canal_venta', 'Canal_Venta', 'channel', 'Channel',
    'canal de ventas', 'CANAL',
  ],
  departamento: [
    'departamento', 'Departamento', 'DEPARTAMENTO',
    'dept', 'Dept', 'zona', 'Zona', 'ZONA',
    'region', 'Region', 'REGION', 'area', 'Area',
  ],
  supervisor: [
    'supervisor', 'Supervisor', 'SUPERVISOR',
    'nombre_supervisor', 'Nombre Supervisor',
    'jefe', 'Jefe', 'gerente', 'Gerente',
    'manager', 'Manager',
  ],
  codigo_producto: [
    'codigo_producto', 'Codigo Producto', 'CODIGO_PRODUCTO', 'cod_producto',
    'SKU', 'sku', 'item_code', 'ItemCode',
    'product_code', 'ProductCode', 'codigo',
    'Codigo', 'CODIGO', 'cod', 'Cod',
  ],
  codigo_cliente: [
    'codigo_cliente', 'Codigo Cliente', 'CODIGO_CLIENTE', 'cod_cliente',
    'customer_code', 'CustomerCode', 'client_code', 'account_code',
    'cuenta', 'Cuenta', 'CUENTA', 'id_cliente', 'ID_Cliente',
  ],
}

export const META_MAPPINGS: Record<string, string[]> = {
  // Period — combined (YYYY-MM) or month-only value
  mes_periodo: [
    'mes_periodo', 'periodo', 'Periodo', 'period', 'Period', 'fecha', 'FECHA',
    'month_year', 'mes/año', 'mes_año',
    'mes', 'Mes', 'MES', 'month', 'Month', 'MONTH',
  ],
  // Separate year column
  anio: [
    'año', 'anio', 'year', 'AÑO', 'ANIO', 'YEAR', 'Año', 'Year', 'aaaa', 'yr', 'Yr',
  ],
  // Meta value
  meta: [
    'meta', 'Meta', 'META', 'target', 'Target', 'budget', 'Budget',
    'objetivo', 'Objetivo', 'goal', 'Goal', 'cuota', 'Cuota',
    'meta_unidades', 'meta_units', 'unidades_meta',
    'meta_venta_neta', 'meta_venta', 'meta_revenue', 'meta_monto', 'meta_importe',
  ],
  // Optional dimensions
  vendedor: [
    'vendor', 'Vendedor', 'salesperson', 'rep', 'representante', 'VENDEDOR',
    'Salesperson', 'agente', 'Agente', 'ejecutivo', 'Ejecutivo', 'vendedor',
    'seller', 'Seller',
  ],
  cliente: [
    'client', 'Client', 'Cliente', 'customer', 'Customer', 'CLIENTE',
    'razon_social', 'cuenta', 'Cuenta', 'cliente',
  ],
  producto: [
    'product', 'Product', 'Producto', 'sku', 'SKU', 'PRODUCTO', 'item', 'Item',
    'articulo', 'Articulo', 'producto',
  ],
  categoria: [
    'category', 'Category', 'Categoria', 'linea', 'Linea', 'CATEGORIA',
    'familia', 'Familia', 'grupo', 'Grupo', 'categoria',
  ],
  departamento: [
    'departamento', 'Departamento', 'DEPARTAMENTO',
    'dept', 'Dept', 'zona', 'Zona', 'region', 'Region', 'area', 'Area',
  ],
  supervisor: [
    'supervisor', 'Supervisor', 'SUPERVISOR',
    'jefe', 'Jefe', 'gerente', 'Gerente', 'manager', 'Manager',
  ],
  canal: [
    'canal', 'Canal', 'canal_venta', 'Canal_Venta', 'channel', 'Channel', 'CANAL',
  ],
}

// ─── HELPERS PARA METAS ──────────────────────────────────────────────────────

export const MONTH_NAMES: Record<string, number> = {
  enero: 1, january: 1, jan: 1, ene: 1,
  febrero: 2, february: 2, feb: 2,
  marzo: 3, march: 3, mar: 3,
  abril: 4, april: 4, apr: 4, abr: 4,
  mayo: 5, may: 5,
  junio: 6, june: 6, jun: 6,
  julio: 7, july: 7, jul: 7,
  agosto: 8, august: 8, aug: 8, ago: 8,
  septiembre: 9, september: 9, sep: 9, sept: 9,
  octubre: 10, october: 10, oct: 10,
  noviembre: 11, november: 11, nov: 11,
  diciembre: 12, december: 12, dec: 12, dic: 12,
}

export function parseMonthNum(val: unknown): number | null {
  if (val === null || val === undefined) return null
  const n = Number(val)
  if (!isNaN(n) && n >= 1 && n <= 12) return Math.round(n)
  return MONTH_NAMES[normalizeStr(String(val))] ?? null
}

export function detectTipoMeta(rawHeaders: string[]): 'unidades' | 'venta_neta' {
  const metaHeader = rawHeaders.find((h) =>
    META_MAPPINGS.meta.some((a) => normalizeStr(a) === normalizeStr(h))
  )
  if (!metaHeader) return 'unidades'
  const norm = normalizeStr(metaHeader)
  if (['venta', 'revenue', 'importe', 'monto', 'neta'].some((kw) => norm.includes(kw))) {
    return 'venta_neta'
  }
  return 'unidades'
}

export const INVENTORY_MAPPINGS: Record<string, string[]> = {
  producto: ['Producto', 'producto', 'SKU', 'sku', 'Nombre', 'nombre', 'Product', 'product', 'item', 'Item'],
  unidades: ['Stock', 'stock', 'Unidades', 'unidades', 'Stock Actual', 'Cantidad', 'Qty', 'units', 'Units'],
  categoria: ['Categoria', 'categoria', 'Categoría', 'Category', 'category', 'Tipo'],
  proveedor: ['Proveedor', 'proveedor', 'Supplier', 'Vendor', 'supplier'],
}

// ─── SCHEMAS ZOD ─────────────────────────────────────────────────────────────

export const saleSchema = z.object({
  fecha: z.coerce.date(),
  vendedor: z.string().min(1),
  unidades: z.number(),
  producto: z.string().optional(),
  cliente: z.string().optional(),
  venta_neta: z.number().optional(),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  canal: z.string().optional(),
  departamento: z.string().optional(),
  supervisor: z.string().optional(),
  codigo_producto: z.string().optional(),
  codigo_cliente: z.string().optional(),
})

// metaSchema omitted — parseMetasFile validates manually for multi-dim support

export const inventorySchema = z.object({
  producto: z.string().min(1),
  unidades: z.number().min(0),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
})

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function mapRow(row: Record<string, unknown>, mappings: Record<string, string[]>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  const keys = Object.keys(row)

  for (const [target, sources] of Object.entries(mappings)) {
    const sourceKey = keys.find((k) =>
      sources.some((s) => normalizeStr(s) === normalizeStr(k))
    )
    if (sourceKey !== undefined) {
      let val = row[sourceKey]
      if (['unidades', 'venta_neta', 'meta'].includes(target)) {
        const parsed = parseFloat(String(val).replace(/,/g, ''))
        val = isNaN(parsed) ? undefined : parsed
      }
      if (target === 'mes_periodo' && val) {
        // Normalizar a YYYY-MM
        const s = String(val).trim()
        // Si viene como "2024-01" ya está bien
        // Si viene como "01/2024" o "2024/01" normalizar
        const isoMatch = s.match(/^(\d{4})-(\d{1,2})/)
        const slashMM = s.match(/^(\d{1,2})\/(\d{4})/)
        const slashYY = s.match(/^(\d{4})\/(\d{1,2})/)
        if (isoMatch) val = `${isoMatch[1]}-${isoMatch[2].padStart(2, '0')}`
        else if (slashMM) val = `${slashMM[2]}-${slashMM[1].padStart(2, '0')}`
        else if (slashYY) val = `${slashYY[1]}-${slashYY[2].padStart(2, '0')}`
        // Si es fecha completa, extraer YYYY-MM
        else {
          const d = new Date(s)
          if (!isNaN(d.getTime())) {
            val = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
          }
        }
      }
      if (val !== undefined && val !== null && val !== '') {
        mapped[target] = val
      }
    }
  }
  return mapped
}

// ─── LECTOR CON DETECCIÓN DE ERRORES ─────────────────────────────────────────

type RawFileResult = {
  rows: Record<string, unknown>[]
  rawHeaders: string[]
  sheetName?: string
}

export const RECOGNIZED_SHEET_NAMES = ['ventas', 'metas', 'inventario', 'sales', 'data', 'hoja1', 'sheet1']

async function readFileDataWithMeta(file: File): Promise<RawFileResult | ParseError> {
  const ext = file.name.split('.').pop()?.toLowerCase()

  if (!ext || !['csv', 'xlsx', 'xls'].includes(ext)) {
    return { code: 'FORMAT_NOT_SUPPORTED', message: 'Formato no compatible. Usa .xlsx, .xls o .csv' }
  }

  if (ext === 'csv') {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data as Record<string, unknown>[]
          const rawHeaders = (results.meta.fields ?? []) as string[]
          const ENCODING_PATTERN = /[ÃÂ¿Â·Ã©Ã±Ã¡Ã­Ã³Ãº]/
          const badHeaders = rawHeaders.filter(h => ENCODING_PATTERN.test(h))
          const firstRowValues = Object.values(rows[0] ?? {}).map(String)
          if (badHeaders.length > 0 || firstRowValues.some(v => ENCODING_PATTERN.test(v))) {
            resolve({
              code: 'ENCODING_ISSUE',
              sample: badHeaders.slice(0, 3),
              message:
                'El archivo tiene problemas de codificación de texto ' +
                '(caracteres especiales como tildes o ñ mal interpretados). ' +
                'Para corregirlo: en Excel, guarda como ' +
                '"CSV UTF-8 (delimitado por comas)" en lugar de "CSV".',
            })
            return
          }
          resolve({ rows, rawHeaders })
        },
        error: (err) => {
          resolve({ code: 'UNKNOWN', message: `Error al leer el CSV: ${err.message}` })
        },
      })
    })
  }

  // xlsx / xls
  try {
    const buffer = await file.arrayBuffer()
    const workbook = XLSX.read(buffer, { cellDates: true })
    const ENCODING_PATTERN = /[ÃÂ¿Â·Ã©Ã±Ã¡Ã­Ã³Ãº]/

    let rows: Record<string, unknown>[]
    let resolvedSheet: string

    if (workbook.SheetNames.length > 1) {
      const recognized = workbook.SheetNames.find(n =>
        RECOGNIZED_SHEET_NAMES.includes(n.toLowerCase().trim())
      )
      if (!recognized) {
        return {
          code: 'MULTIPLE_SHEETS',
          sheets: workbook.SheetNames,
          message: `El archivo tiene ${workbook.SheetNames.length} pestañas: ${workbook.SheetNames.join(', ')}. No sabemos cuál usar. Deja solo una pestaña o nómbrala "ventas", "metas" o "inventario".`,
        }
      }
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[recognized]) as Record<string, unknown>[]
      resolvedSheet = recognized
    } else {
      resolvedSheet = workbook.SheetNames[0]
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[resolvedSheet]) as Record<string, unknown>[]
    }

    const rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
    const badHeaders = rawHeaders.filter(h => ENCODING_PATTERN.test(h))
    const firstRowValues = Object.values(rows[0] ?? {}).map(String)
    if (badHeaders.length > 0 || firstRowValues.some(v => ENCODING_PATTERN.test(v))) {
      return {
        code: 'ENCODING_ISSUE',
        sample: badHeaders.slice(0, 3),
        message:
          'El archivo tiene problemas de codificación de texto ' +
          '(caracteres especiales como tildes o ñ mal interpretados). ' +
          'Para corregirlo: en Excel, guarda como ' +
          '"CSV UTF-8 (delimitado por comas)" en lugar de "CSV".',
      }
    }

    return { rows, rawHeaders, sheetName: resolvedSheet }
  } catch (err: unknown) {
    const msg = ((err as { message?: string })?.message ?? '').toLowerCase()
    const isProtected =
      msg.includes('password') ||
      msg.includes('protected') ||
      msg.includes('encrypted')
    return {
      code: 'FILE_PROTECTED_OR_CORRUPT',
      message: isProtected
        ? 'El archivo está protegido con contraseña. ' +
          'Quita la contraseña en Excel antes de subirlo: ' +
          'Revisar → Proteger libro → Quitar protección.'
        : 'No se pudo leer el archivo. Puede estar corrupto ' +
          'o en un formato no compatible. ' +
          'Intenta guardarlo de nuevo como .xlsx o .csv.',
    }
  }
}

function detectMappedColumns(
  mappedRows: Record<string, unknown>[],
  allTargetKeys: string[]
): string[] {
  return allTargetKeys.filter(k => mappedRows.some(r => k in r))
}

// (legacy — usado solo por parseRawFile)
async function readFileData(file: File): Promise<Record<string, unknown>[]> {
  const ext = file.name.split('.').pop()?.toLowerCase()
  if (ext === 'csv') {
    return new Promise((resolve) => {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => resolve(results.data as Record<string, unknown>[]),
      })
    })
  } else if (['xlsx', 'xls'].includes(ext || '')) {
    const data = await file.arrayBuffer()
    const workbook = XLSX.read(data, { cellDates: true })
    const ws = workbook.Sheets[workbook.SheetNames[0]]
    return XLSX.utils.sheet_to_json(ws) as Record<string, unknown>[]
  }
  return []
}

// ─── TRADUCCIÓN DE ERRORES ZOD ───────────────────────────────────────────────

function zodErrorToSpanish(mapped: Record<string, unknown>, issues: z.ZodIssue[]): string {
  const parts: string[] = []
  for (const issue of issues) {
    const field = issue.path[0] as string | undefined
    if (!field) continue
    const value = mapped[field]
    const issueAny = issue as any
    if (issue.code === 'invalid_type' && issueAny.received === 'undefined') {
      parts.push(`Falta el campo obligatorio '${field}'`)
    } else if (issueAny.code === 'invalid_date') {
      parts.push(`La fecha '${value}' no es una fecha válida`)
    } else if (issue.code === 'invalid_type' && issue.expected === 'number') {
      parts.push(`El campo '${field}' tiene el valor '${value}' que no es un número`)
    } else if (issue.code === 'too_small' && issueAny.type === 'string') {
      parts.push(`El campo '${field}' está vacío`)
    } else if (issue.code === 'too_small' && issueAny.type === 'number') {
      parts.push(`El campo '${field}' tiene el valor '${value}' que es negativo`)
    } else {
      parts.push(`El campo '${field}' es inválido (valor: '${String(value ?? '')}')`)
    }
  }
  return parts.length > 0 ? parts.join('; ') : 'Fila inválida'
}

// ─── PARSERS PÚBLICOS ─────────────────────────────────────────────────────────

export async function parseSalesFile(file: File): Promise<ParseResult<SaleRecord>> {
  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  const mappedRows = rows.map(row => mapRow(row, SALES_MAPPINGS))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(SALES_MAPPINGS))

  if (foundKeys.length === 0) {
    const preview = rawHeaders.slice(0, 8).join(', ') + (rawHeaders.length > 8 ? '…' : '')
    return {
      success: false,
      error: {
        code: 'NO_VALID_COLUMNS',
        found: rawHeaders,
        message: `No se encontraron columnas reconocibles. Detectadas: ${preview}. Asegúrate de que los encabezados estén en la primera fila.`,
      },
    }
  }

  const missing = ['fecha', 'vendedor', 'unidades'].filter(c => !foundKeys.includes(c))
  if (missing.length > 0) {
    return {
      success: false,
      error: { code: 'MISSING_REQUIRED', missing, found: foundKeys, message: `Faltan columnas obligatorias: ${missing.join(', ')}. Se detectaron: ${foundKeys.join(', ')}.` },
    }
  }

  // Verificar que los valores de fecha sean reconocibles
  const fechaValues = mappedRows.slice(0, 10).map(r => r.fecha).filter(Boolean)
  const validDates = fechaValues.filter(f => {
    if (f instanceof Date) return !isNaN(f.getTime()) && f.getFullYear() > 2000
    // Excel serial numbers (XLS) are numbers in range ~36526–73050 (year 2000–2100)
    const num = typeof f === 'number' ? f : NaN
    if (!isNaN(num)) return num > 36526 && num < 73050
    const d = new Date(f as string)
    return !isNaN(d.getTime()) && d.getFullYear() > 2000
  })
  if (fechaValues.length > 0 && validDates.length / fechaValues.length < 0.5) {
    return {
      success: false,
      error: {
        code: 'INVALID_DATES',
        sample: fechaValues.slice(0, 3).map(String),
        message:
          'Las fechas no tienen un formato reconocible. ' +
          `Ejemplos encontrados: ${fechaValues.slice(0, 3).map(String).join(', ')}. ` +
          'Usa el formato YYYY-MM-DD (ej: 2026-03-15) ' +
          'o DD/MM/YYYY (ej: 15/03/2026).',
      },
    }
  }

  const data: SaleRecord[] = []
  const discardedRows: DiscardedRow[] = []
  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const r = saleSchema.safeParse(mapped)
    if (r.success) {
      data.push(r.data as SaleRecord)
    } else {
      discardedRows.push({
        rowNumber: i + 2,
        rawData: Object.fromEntries(Object.entries(rows[i]).map(([k, v]) => [k, String(v ?? '')])),
        reason: zodErrorToSpanish(mapped, r.error.issues),
      })
    }
  }

  if (data.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'Columnas encontradas pero ninguna fila pudo procesarse. Verifica que las fechas estén en formato YYYY-MM-DD y que unidades sea un número.' } }
  }

  return { success: true, data, columns: foundKeys, sheetName, discardedRows: discardedRows.length > 0 ? discardedRows : undefined }
}

export async function parseMetasFile(file: File): Promise<ParseResult<MetaRecord>> {
  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  const tipo_meta = detectTipoMeta(rawHeaders)
  const mappedRows = rows.map((row) => mapRow(row, META_MAPPINGS))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(META_MAPPINGS))

  if (foundKeys.length === 0) {
    const preview = rawHeaders.slice(0, 8).join(', ') + (rawHeaders.length > 8 ? '…' : '')
    return {
      success: false,
      error: {
        code: 'NO_VALID_COLUMNS',
        found: rawHeaders,
        message: `No se encontraron columnas reconocibles. Detectadas: ${preview}. Asegúrate de que los encabezados estén en la primera fila.`,
      },
    }
  }

  if (!foundKeys.includes('mes_periodo') && !foundKeys.includes('meta')) {
    const preview = rawHeaders.slice(0, 8).join(', ') + (rawHeaders.length > 8 ? '…' : '')
    return {
      success: false,
      error: {
        code: 'MISSING_REQUIRED',
        missing: ['periodo (mes_periodo, o columna mes + año)', 'meta'],
        found: foundKeys,
        message: `Faltan columnas obligatorias de período y meta. Detectadas: ${preview}.`,
      },
    }
  }
  if (!foundKeys.includes('mes_periodo')) {
    return {
      success: false,
      error: {
        code: 'MISSING_REQUIRED',
        missing: ['periodo (mes_periodo, mes, o period)'],
        found: foundKeys,
        message: `No se encontró columna de período. Se aceptan: mes_periodo (YYYY-MM), mes + año separados, periodo, period, fecha.`,
      },
    }
  }
  if (!foundKeys.includes('meta')) {
    return {
      success: false,
      error: {
        code: 'MISSING_REQUIRED',
        missing: ['meta'],
        found: foundKeys,
        message: `No se encontró columna de meta/objetivo. Se aceptan: meta, target, budget, objetivo, cuota.`,
      },
    }
  }

  const data: MetaRecord[] = []
  const discardedRows: DiscardedRow[] = []

  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const rawRow = rows[i]

    // ── Resolver mes y anio ───────────────────────────────────────────────
    let mes: number | null = null
    let anio: number | null = null

    if (mapped.mes_periodo !== undefined) {
      const s = String(mapped.mes_periodo).trim()
      const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
      if (isoMatch) {
        anio = parseInt(isoMatch[1])
        mes = parseInt(isoMatch[2])
      } else {
        // Try as month number / name
        const parsedMes = parseMonthNum(mapped.mes_periodo)
        if (parsedMes !== null) {
          mes = parsedMes
          // Need year from separate anio column
          if (mapped.anio !== undefined) {
            const n = Number(mapped.anio)
            if (!isNaN(n) && n >= 2000 && n <= 2100) anio = n
          }
        } else {
          // Try as full date string
          const d = new Date(s)
          if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
            anio = d.getFullYear()
            mes = d.getMonth() + 1
          }
        }
      }
    }

    // Separate anio column always overrides if found and mes came from month-only
    if (anio === null && mapped.anio !== undefined) {
      const n = Number(mapped.anio)
      if (!isNaN(n) && n >= 2000 && n <= 2100) anio = n
    }

    // ── Validate ──────────────────────────────────────────────────────────
    const meta = typeof mapped.meta === 'number' && !isNaN(mapped.meta) ? mapped.meta : null

    if (!mes || !anio || meta === null) {
      const reasons: string[] = []
      if (!mes)        reasons.push('no se pudo determinar el mes')
      if (!anio)       reasons.push('no se pudo determinar el año')
      if (meta === null) reasons.push(`el campo 'meta' tiene el valor '${String(mapped.meta ?? '')}' que no es un número`)
      discardedRows.push({
        rowNumber: i + 2,
        rawData: Object.fromEntries(Object.entries(rawRow).map(([k, v]) => [k, String(v ?? '')])),
        reason: reasons.join('; '),
      })
      continue
    }

    const record: MetaRecord = {
      mes, anio, meta, tipo_meta,
      ...(mapped.vendedor     !== undefined ? { vendedor:     String(mapped.vendedor)     } : {}),
      ...(mapped.cliente      !== undefined ? { cliente:      String(mapped.cliente)      } : {}),
      ...(mapped.producto     !== undefined ? { producto:     String(mapped.producto)     } : {}),
      ...(mapped.categoria    !== undefined ? { categoria:    String(mapped.categoria)    } : {}),
      ...(mapped.departamento !== undefined ? { departamento: String(mapped.departamento) } : {}),
      ...(mapped.supervisor   !== undefined ? { supervisor:   String(mapped.supervisor)   } : {}),
      ...(mapped.canal        !== undefined ? { canal:        String(mapped.canal)        } : {}),
    }
    data.push(record)
  }

  if (data.length === 0) {
    return {
      success: false,
      error: {
        code: 'EMPTY_FILE',
        message: 'Columnas encontradas pero ninguna fila pudo procesarse. Verifica que meta sea un número y el período esté en formato YYYY-MM (ej: 2024-01) o como mes numérico (1-12) + columna de año.',
      },
    }
  }

  return {
    success: true,
    data,
    columns: foundKeys.filter((k) => k !== 'mes_periodo' && k !== 'anio').concat(['mes', 'anio']),
    sheetName,
    discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
  }
}

export async function parseInventoryFile(file: File): Promise<ParseResult<InventoryItem>> {
  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  const mappedRows = rows.map(row => mapRow(row, INVENTORY_MAPPINGS))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(INVENTORY_MAPPINGS))

  if (foundKeys.length === 0) {
    const preview = rawHeaders.slice(0, 8).join(', ') + (rawHeaders.length > 8 ? '…' : '')
    return {
      success: false,
      error: {
        code: 'NO_VALID_COLUMNS',
        found: rawHeaders,
        message: `No se encontraron columnas reconocibles. Detectadas: ${preview}. Asegúrate de que los encabezados estén en la primera fila.`,
      },
    }
  }

  const missing = ['producto', 'unidades'].filter(c => !foundKeys.includes(c))
  if (missing.length > 0) {
    return {
      success: false,
      error: { code: 'MISSING_REQUIRED', missing, found: foundKeys, message: `Faltan columnas obligatorias: ${missing.join(', ')}. Se detectaron: ${foundKeys.join(', ')}.` },
    }
  }

  const data: InventoryItem[] = []
  const discardedRows: DiscardedRow[] = []
  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const r = inventorySchema.safeParse(mapped)
    if (r.success) {
      data.push(r.data as InventoryItem)
    } else {
      discardedRows.push({
        rowNumber: i + 2,
        rawData: Object.fromEntries(Object.entries(rows[i]).map(([k, v]) => [k, String(v ?? '')])),
        reason: zodErrorToSpanish(mapped, r.error.issues),
      })
    }
  }

  if (data.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'Columnas encontradas pero ninguna fila pudo procesarse. Verifica que unidades sea un número.' } }
  }

  return { success: true, data, columns: foundKeys, sheetName, discardedRows: discardedRows.length > 0 ? discardedRows : undefined }
}

export async function parseRawFile(file: File): Promise<Record<string, unknown>[]> {
  return readFileData(file)
}

// ─── DETECTAR DISPONIBILIDAD DE DATOS ────────────────────────────────────────

export function detectDataAvailability(sales: SaleRecord[]): Omit<DataAvailability, 'has_metas' | 'has_inventario'> {
  return {
    has_producto: sales.some((s) => s.producto != null && s.producto !== ''),
    has_cliente: sales.some((s) => s.cliente != null && s.cliente !== ''),
    has_venta_neta: sales.some((s) => s.venta_neta != null && s.venta_neta > 0),
    has_categoria: sales.some((s) => s.categoria != null && s.categoria !== ''),
    has_canal: sales.some((s) => s.canal != null && s.canal !== ''),
    has_supervisor: sales.some((s) => s.supervisor != null && s.supervisor !== ''),
  }
}
