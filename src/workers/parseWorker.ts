import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import {
  mapRow,
  SALES_MAPPINGS,
  META_MAPPINGS,
  INVENTORY_MAPPINGS,
  RECOGNIZED_SHEET_NAMES,
  saleSchema,
  inventorySchema,
  detectTipoMeta,
  parseMonthNum,
} from '../lib/fileParser'

type ParseType = 'ventas' | 'metas' | 'inventario'

interface ParseJob {
  type: ParseType
  buffer: ArrayBuffer
  filename: string
}

interface ParseSuccess {
  ok: true
  data: unknown[]
}

interface ParseFailure {
  ok: false
  error: string
}

function getRows(buffer: ArrayBuffer, filename: string): Record<string, unknown>[] {
  const ext = filename.split('.').pop()?.toLowerCase()

  if (ext === 'csv') {
    const text = new TextDecoder().decode(buffer)
    const result = Papa.parse<Record<string, unknown>>(text, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
    })
    return result.data
  }

  // xlsx / xls — the main freeze culprit, now off main thread
  const workbook = XLSX.read(buffer, { cellDates: true })

  let sheetName: string
  if (workbook.SheetNames.length > 1) {
    const recognized = workbook.SheetNames.find(n =>
      RECOGNIZED_SHEET_NAMES.includes(n.toLowerCase().trim())
    )
    sheetName = recognized ?? workbook.SheetNames[0]
  } else {
    sheetName = workbook.SheetNames[0]
  }

  return XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets[sheetName], {
    defval: null,
  })
}

function parseVentas(rows: Record<string, unknown>[]): unknown[] {
  const parsed: unknown[] = []
  for (const row of rows) {
    const mapped = mapRow(row, SALES_MAPPINGS)
    const result = saleSchema.safeParse(mapped)
    if (result.success) parsed.push(result.data)
  }
  return parsed
}

function parseMetas(rows: Record<string, unknown>[]): unknown[] {
  const rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
  const tipo_meta = detectTipoMeta(rawHeaders)
  const parsed: unknown[] = []

  for (const row of rows) {
    const mapped = mapRow(row, META_MAPPINGS)

    let mes: number | null = null
    let anio: number | null = null

    if (mapped.mes_periodo !== undefined) {
      const s = String(mapped.mes_periodo).trim()
      const isoMatch = s.match(/^(\d{4})-(\d{1,2})$/)
      if (isoMatch) {
        anio = parseInt(isoMatch[1])
        mes = parseInt(isoMatch[2])
      } else {
        const parsedMes = parseMonthNum(mapped.mes_periodo)
        if (parsedMes !== null) {
          mes = parsedMes
          if (mapped.anio !== undefined) {
            const n = Number(mapped.anio)
            if (!isNaN(n) && n >= 2000 && n <= 2100) anio = n
          }
        } else {
          const d = new Date(s)
          if (!isNaN(d.getTime()) && d.getFullYear() > 2000) {
            anio = d.getFullYear()
            mes = d.getMonth() + 1
          }
        }
      }
    }

    if (anio === null && mapped.anio !== undefined) {
      const n = Number(mapped.anio)
      if (!isNaN(n) && n >= 2000 && n <= 2100) anio = n
    }

    const meta =
      typeof mapped.meta === 'number' && !isNaN(mapped.meta) ? mapped.meta : null

    if (!mes || !anio || meta === null) continue

    const record: Record<string, unknown> = { mes, anio, meta, tipo_meta }
    for (const key of ['vendedor', 'cliente', 'producto', 'categoria', 'departamento', 'supervisor', 'canal']) {
      if (mapped[key] !== undefined) record[key] = String(mapped[key])
    }
    parsed.push(record)
  }

  return parsed
}

function parseInventario(rows: Record<string, unknown>[]): unknown[] {
  const parsed: unknown[] = []
  for (const row of rows) {
    const mapped = mapRow(row, INVENTORY_MAPPINGS)
    const result = inventorySchema.safeParse(mapped)
    if (result.success) parsed.push(result.data)
  }
  return parsed
}

self.onmessage = (e: MessageEvent<ParseJob>) => {
  const { type, buffer, filename } = e.data
  try {
    const rows = getRows(buffer, filename)

    let data: unknown[]
    if (type === 'ventas') data = parseVentas(rows)
    else if (type === 'metas') data = parseMetas(rows)
    else data = parseInventario(rows)

    const response: ParseSuccess = { ok: true, data }
    self.postMessage(response)
  } catch (err) {
    const response: ParseFailure = { ok: false, error: String(err) }
    self.postMessage(response)
  }
}
