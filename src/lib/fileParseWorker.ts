// fileParseWorker.ts — Web Worker para parsing de archivos pesados (300K-900K filas)
// Corre XLSX.read, sheet_to_json, mapRow y validación Zod fuera del hilo principal,
// reportando progreso granular para que el usuario nunca vea "La página no responde".

import * as XLSX from 'xlsx'
import Papa from 'papaparse'
import {
  SALES_MAPPINGS,
  META_MAPPINGS,
  INVENTORY_MAPPINGS,
  saleSchema,
  inventorySchema,
  mapRow,
  detectMappedColumns,
  zodErrorToSpanish,
  detectTipoMeta,
  parseMonthNum,
  RECOGNIZED_SHEET_NAMES,
} from './fileParser'

interface ParseWorkerInput {
  type: 'sales' | 'metas' | 'inventory'
  buffer: ArrayBuffer
  fileName: string
}

interface ProgressMessage {
  type: 'progress'
  phase: 'reading' | 'parsing' | 'validating' | 'done'
  percent: number
  detail: string
}

interface ResultMessage {
  type: 'result'
  success: boolean
  data?: unknown[]
  columns?: string[]
  sheetName?: string
  discardedRows?: unknown[]
  error?: unknown
  tipoMeta?: 'unidades' | 'venta_neta'
}

const ENCODING_PATTERN = /[\u00C3\u00C2\u00BF\u00B7\u00E9\u00F1\u00E1\u00ED\u00F3\u00FA]/

self.onmessage = (event: MessageEvent<ParseWorkerInput>) => {
  const { type, buffer, fileName } = event.data
  const post = (msg: ProgressMessage | ResultMessage) =>
    (self as unknown as Worker).postMessage(msg)

  try {
    const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

    if (!['csv', 'xlsx', 'xls'].includes(ext)) {
      post({
        type: 'result',
        success: false,
        error: { code: 'FORMAT_NOT_SUPPORTED', message: 'Formato no compatible. Usa .xlsx, .xls o .csv' },
      })
      return
    }

    // ── Paso 1: Leer archivo ─────────────────────────────────────────────────
    post({ type: 'progress', phase: 'reading', percent: 5, detail: 'Leyendo archivo...' })

    let rows: Record<string, unknown>[] = []
    let rawHeaders: string[] = []
    let sheetName: string | undefined

    if (ext === 'csv') {
      let text = new TextDecoder('utf-8').decode(buffer)
      let results = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
      rows = results.data
      rawHeaders = (results.meta.fields ?? []) as string[]

      const badHeaders = rawHeaders.filter((h) => ENCODING_PATTERN.test(h))
      if (badHeaders.length > 0) {
        // Reintentar con latin1
        text = new TextDecoder('latin1').decode(buffer)
        results = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
        rows = results.data
        rawHeaders = (results.meta.fields ?? []) as string[]
      }
    } else {
      post({ type: 'progress', phase: 'reading', percent: 10, detail: 'Descomprimiendo Excel...' })
      const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

      post({ type: 'progress', phase: 'parsing', percent: 30, detail: 'Convirtiendo filas...' })

      if (workbook.SheetNames.length > 1) {
        const recognized = workbook.SheetNames.find((n) =>
          RECOGNIZED_SHEET_NAMES.includes(n.toLowerCase().trim())
        )
        if (!recognized) {
          post({
            type: 'result',
            success: false,
            error: {
              code: 'MULTIPLE_SHEETS',
              sheets: workbook.SheetNames,
              message: `El archivo tiene ${workbook.SheetNames.length} pestañas: ${workbook.SheetNames.join(', ')}. No sabemos cuál usar. Deja solo una pestaña o nómbrala "ventas", "metas" o "inventario".`,
            },
          })
          return
        }
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[recognized]) as Record<string, unknown>[]
        sheetName = recognized
      } else {
        sheetName = workbook.SheetNames[0]
        rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]) as Record<string, unknown>[]
      }
      rawHeaders = rows.length > 0 ? Object.keys(rows[0]) : []
    }

    if (rows.length === 0) {
      post({
        type: 'result',
        success: false,
        error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' },
      })
      return
    }

    // Validar encoding (igual que readFileDataWithMeta original)
    const badHeaders = rawHeaders.filter((h) => ENCODING_PATTERN.test(h))
    const firstRowValues = Object.values(rows[0] ?? {}).map(String)
    if (badHeaders.length > 0 || firstRowValues.some((v) => ENCODING_PATTERN.test(v))) {
      post({
        type: 'result',
        success: false,
        error: {
          code: 'ENCODING_ISSUE',
          sample: badHeaders.slice(0, 3),
          message:
            'El archivo tiene problemas de codificación de texto ' +
            '(caracteres especiales como tildes o ñ mal interpretados). ' +
            'Para corregirlo: en Excel, guarda como ' +
            '"CSV UTF-8 (delimitado por comas)" en lugar de "CSV".',
        },
      })
      return
    }

    post({
      type: 'progress',
      phase: 'parsing',
      percent: 45,
      detail: `${rows.length.toLocaleString('es')} filas detectadas...`,
    })

    // ── Paso 2: Mapping en chunks ───────────────────────────────────────────
    const MAPPINGS =
      type === 'sales' ? SALES_MAPPINGS : type === 'metas' ? META_MAPPINGS : INVENTORY_MAPPINGS

    post({ type: 'progress', phase: 'validating', percent: 50, detail: 'Mapeando columnas...' })

    const CHUNK = 50000
    const mappedRows: Record<string, unknown>[] = new Array(rows.length)
    for (let i = 0; i < rows.length; i += CHUNK) {
      const end = Math.min(i + CHUNK, rows.length)
      for (let j = i; j < end; j++) {
        mappedRows[j] = mapRow(rows[j], MAPPINGS)
      }
      const pct = 50 + Math.round((end / rows.length) * 20)
      post({
        type: 'progress',
        phase: 'validating',
        percent: Math.min(pct, 70),
        detail: `Mapeando... ${Math.round((end / rows.length) * 100)}%`,
      })
    }

    const foundKeys = detectMappedColumns(mappedRows, Object.keys(MAPPINGS))

    if (foundKeys.length === 0) {
      const preview = rawHeaders.slice(0, 8).join(', ') + (rawHeaders.length > 8 ? '…' : '')
      post({
        type: 'result',
        success: false,
        error: {
          code: 'NO_VALID_COLUMNS',
          found: rawHeaders,
          message: `No se encontraron columnas reconocibles. Detectadas: ${preview}. Asegúrate de que los encabezados estén en la primera fila.`,
        },
      })
      return
    }

    if (type === 'sales') {
      const missing = ['fecha', 'vendedor', 'unidades'].filter((c) => !foundKeys.includes(c))
      if (missing.length > 0) {
        post({
          type: 'result',
          success: false,
          error: {
            code: 'MISSING_REQUIRED',
            missing,
            found: foundKeys,
            message: `Faltan columnas obligatorias: ${missing.join(', ')}. Se detectaron: ${foundKeys.join(', ')}.`,
          },
        })
        return
      }

      // Verificar que las fechas sean reconocibles
      const fechaValues = mappedRows.slice(0, 10).map((r) => r.fecha).filter(Boolean)
      const validDates = fechaValues.filter((f) => {
        if (f instanceof Date) return !isNaN(f.getTime()) && f.getFullYear() > 2000
        const num = typeof f === 'number' ? f : NaN
        if (!isNaN(num)) return num > 36526 && num < 73050
        const d = new Date(f as string)
        return !isNaN(d.getTime()) && d.getFullYear() > 2000
      })
      if (fechaValues.length > 0 && validDates.length / fechaValues.length < 0.5) {
        post({
          type: 'result',
          success: false,
          error: {
            code: 'INVALID_DATES',
            sample: fechaValues.slice(0, 3).map(String),
            message:
              'Las fechas no tienen un formato reconocible. ' +
              `Ejemplos encontrados: ${fechaValues.slice(0, 3).map(String).join(', ')}. ` +
              'Usa el formato YYYY-MM-DD (ej: 2026-03-15) o DD/MM/YYYY (ej: 15/03/2026).',
          },
        })
        return
      }
    }

    if (type === 'inventory') {
      const missing = ['producto', 'unidades'].filter((c) => !foundKeys.includes(c))
      if (missing.length > 0) {
        post({
          type: 'result',
          success: false,
          error: {
            code: 'MISSING_REQUIRED',
            missing,
            found: foundKeys,
            message: `Faltan columnas obligatorias: ${missing.join(', ')}. Se detectaron: ${foundKeys.join(', ')}.`,
          },
        })
        return
      }
    }

    if (type === 'metas') {
      if (!foundKeys.includes('mes_periodo')) {
        post({
          type: 'result',
          success: false,
          error: {
            code: 'MISSING_REQUIRED',
            missing: ['periodo (mes_periodo, mes, o period)'],
            found: foundKeys,
            message:
              'No se encontró columna de período. Se aceptan: mes_periodo (YYYY-MM), mes + año separados, periodo, period, fecha.',
          },
        })
        return
      }
      if (!foundKeys.includes('meta')) {
        post({
          type: 'result',
          success: false,
          error: {
            code: 'MISSING_REQUIRED',
            missing: ['meta'],
            found: foundKeys,
            message: 'No se encontró columna de meta/objetivo. Se aceptan: meta, target, budget, objetivo, cuota.',
          },
        })
        return
      }
    }

    // ── Paso 3: Validación en chunks ─────────────────────────────────────────
    post({ type: 'progress', phase: 'validating', percent: 72, detail: 'Validando datos...' })

    const data: unknown[] = []
    const discardedRows: unknown[] = []

    if (type === 'sales' || type === 'inventory') {
      const schema = type === 'sales' ? saleSchema : inventorySchema
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, mappedRows.length)
        for (let j = i; j < end; j++) {
          const mapped = mappedRows[j]
          const r = schema.safeParse(mapped)
          if (r.success) {
            data.push(r.data)
          } else {
            discardedRows.push({
              rowNumber: j + 2,
              rawData: Object.fromEntries(
                Object.entries(rows[j]).map(([k, v]) => [k, String(v ?? '')])
              ),
              reason: zodErrorToSpanish(mapped, r.error.issues),
            })
          }
        }
        const pct = 72 + Math.round((end / mappedRows.length) * 25)
        post({
          type: 'progress',
          phase: 'validating',
          percent: Math.min(pct, 97),
          detail: `Validando... ${Math.round((end / mappedRows.length) * 100)}%`,
        })
      }
    } else {
      // metas — validación manual con multi-dim (igual que parseMetasFile)
      const tipo_meta = detectTipoMeta(rawHeaders)
      for (let i = 0; i < mappedRows.length; i += CHUNK) {
        const end = Math.min(i + CHUNK, mappedRows.length)
        for (let j = i; j < end; j++) {
          const mapped = mappedRows[j]
          const rawRow = rows[j]

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

          if (!mes || !anio || meta === null) {
            const reasons: string[] = []
            if (!mes) reasons.push('no se pudo determinar el mes')
            if (!anio) reasons.push('no se pudo determinar el año')
            if (meta === null)
              reasons.push(
                `el campo 'meta' tiene el valor '${String(mapped.meta ?? '')}' que no es un número`
              )
            discardedRows.push({
              rowNumber: j + 2,
              rawData: Object.fromEntries(Object.entries(rawRow).map(([k, v]) => [k, String(v ?? '')])),
              reason: reasons.join('; '),
            })
            continue
          }

          const record: Record<string, unknown> = {
            mes,
            anio,
            ...(tipo_meta === 'venta_neta' ? { meta_usd: meta } : { meta_uds: meta }),
            meta,
            tipo_meta,
            ...(mapped.vendedor !== undefined ? { vendedor: String(mapped.vendedor) } : {}),
            ...(mapped.cliente !== undefined ? { cliente: String(mapped.cliente) } : {}),
            ...(mapped.producto !== undefined ? { producto: String(mapped.producto) } : {}),
            ...(mapped.categoria !== undefined ? { categoria: String(mapped.categoria) } : {}),
            ...(mapped.departamento !== undefined ? { departamento: String(mapped.departamento) } : {}),
            ...(mapped.supervisor !== undefined ? { supervisor: String(mapped.supervisor) } : {}),
            ...(mapped.canal !== undefined ? { canal: String(mapped.canal) } : {}),
          }
          data.push(record)
        }
        const pct = 72 + Math.round((end / mappedRows.length) * 25)
        post({
          type: 'progress',
          phase: 'validating',
          percent: Math.min(pct, 97),
          detail: `Validando... ${Math.round((end / mappedRows.length) * 100)}%`,
        })
      }
    }

    if (data.length === 0) {
      post({
        type: 'result',
        success: false,
        error: {
          code: 'EMPTY_FILE',
          message:
            'Columnas encontradas pero ninguna fila pudo procesarse. Verifica el formato de los datos.',
        },
      })
      return
    }

    let tipoMeta: 'unidades' | 'venta_neta' | undefined
    let columns = foundKeys
    if (type === 'metas') {
      tipoMeta = detectTipoMeta(rawHeaders)
      columns = foundKeys.filter((k) => k !== 'mes_periodo' && k !== 'anio').concat(['mes', 'anio'])
    }

    post({
      type: 'progress',
      phase: 'done',
      percent: 100,
      detail: `${data.length.toLocaleString('es')} registros listos`,
    })

    post({
      type: 'result',
      success: true,
      data,
      columns,
      sheetName,
      discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
      tipoMeta,
    })
  } catch (err: unknown) {
    const msg = ((err as { message?: string })?.message ?? '').toLowerCase()
    const isProtected =
      msg.includes('password') || msg.includes('protected') || msg.includes('encrypted')
    post({
      type: 'result',
      success: false,
      error: {
        code: isProtected ? 'FILE_PROTECTED_OR_CORRUPT' : 'PARSE_ERROR',
        message: isProtected
          ? 'El archivo está protegido con contraseña. Quita la contraseña en Excel antes de subirlo: Revisar → Proteger libro → Quitar protección.'
          : `No se pudo leer el archivo: ${String((err as Error)?.message ?? err)}`,
      },
    })
  }
}
