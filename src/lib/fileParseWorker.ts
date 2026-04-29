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
  detectIgnoredColumns,
  detectDateConvention,
  parseDateWithConvention,
  getDimensionKeys,
  buildObligatoriedadParseError,
  buildEffectiveMappings,
  computeMappingTrace,
  normalizeStr,
  smartDecodeText,
  zodErrorToSpanish,
  detectTipoMeta,
  parseMonthNum,
  RECOGNIZED_SHEET_NAMES,
} from './fileParser'

interface ParseWorkerInput {
  type: 'sales' | 'metas' | 'inventory'
  buffer: ArrayBuffer
  fileName: string
  /** [Z.P1.10.b.1] Override del mapeo automático. Solo aplica para type='sales'. */
  override?: import('../types').MappingOverride
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
  ignoredColumns?: string[]
  dateAmbiguity?: { convention: 'dmy' | 'mdy' | 'ymd' | 'unknown'; evidence: string; ambiguous: boolean }
  warnings?: Array<{ code: string; message: string; field?: string }>
  /** [Z.P1.10.b.1] Trace de mapeo (canónico → header crudo). Solo en type='sales'. */
  mapping?: Record<string, string>
  error?: unknown
  tipoMeta?: 'unidades' | 'venta_neta'
}

const ENCODING_PATTERN = /[\u00C3\u00C2\u00BF\u00B7\u00E9\u00F1\u00E1\u00ED\u00F3\u00FA]/

self.onmessage = (event: MessageEvent<ParseWorkerInput>) => {
  const { type, buffer, fileName, override } = event.data
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
      // [Z.P1.7.2] Usar smartDecodeText (fallback CP1252 si UTF-8 da mojibake)
      const text = smartDecodeText(buffer)
      const results = Papa.parse<Record<string, unknown>>(text, { header: true, skipEmptyLines: true })
      rows = results.data
      rawHeaders = (results.meta.fields ?? []) as string[]
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

    // [Z.P1.7.2] Encoding validation relajado: smartDecodeText ya escogió el mejor decode
    // para CSV. Solo bloqueamos XLSX (path distinto, XLSX.read no usa smartDecodeText).
    if (ext !== 'csv') {
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
    }

    post({
      type: 'progress',
      phase: 'parsing',
      percent: 45,
      detail: `${rows.length.toLocaleString('es')} filas detectadas...`,
    })

    // ── Paso 2: Mapping en chunks ───────────────────────────────────────────
    // [Z.P1.10.b.1] Para sales con override, se construyen mappings efectivos
    // (forzados/ignorados según override + warnings de overrides inválidos).
    let overrideWarnings: Array<{ code: string; message: string; field?: string }> = []
    let MAPPINGS: Record<string, string[]>
    if (type === 'sales') {
      const built = buildEffectiveMappings(SALES_MAPPINGS, override ?? {}, rawHeaders)
      MAPPINGS = built.mappings
      overrideWarnings = built.warnings
    } else if (type === 'metas') {
      MAPPINGS = META_MAPPINGS
    } else {
      MAPPINGS = INVENTORY_MAPPINGS
    }

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
    const ignoredColumns = detectIgnoredColumns(rawHeaders, MAPPINGS)

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

    let dateConv: ReturnType<typeof detectDateConvention> | undefined
    // [Z.P1.10.b.1] Sembrar con warnings de overrides inválidos (OVERRIDE_HEADER_NOT_FOUND)
    const salesWarnings: Array<{ code: string; message: string; field?: string }> = type === 'sales' ? [...overrideWarnings] : []

    if (type === 'sales') {
      // [Z.P1.1] Nueva regla: solo fecha obligatoria; al menos 1 entre {unidades, venta_neta}; al menos 1 dimensión.
      const requiredError = buildObligatoriedadParseError('sales', foundKeys, ignoredColumns)
      if (requiredError) {
        post({ type: 'result', success: false, error: requiredError })
        return
      }

      // [Z.P2.1] Detectar convención de fecha y reparsear filas
      const fechaSample = mappedRows.slice(0, 50).map((r) => r.fecha).filter((f) => f !== undefined && f !== null)
      dateConv = detectDateConvention(fechaSample)
      const fechaValues = mappedRows.slice(0, 10).map((r) => r.fecha).filter(Boolean)
      const validDates = fechaValues
        .map((f) => parseDateWithConvention(f, dateConv!.convention))
        .filter((d): d is Date => d !== null && d.getFullYear() > 2000)
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
      if (dateConv.convention !== 'unknown') {
        for (const row of mappedRows) {
          if (row.fecha !== undefined && row.fecha !== null && !(row.fecha instanceof Date)) {
            const parsed = parseDateWithConvention(row.fecha, dateConv.convention)
            if (parsed) row.fecha = parsed
          }
        }
      }

      // [Z.P1.9.2] costo_unitario requiere columna producto
      if (foundKeys.includes('costo_unitario') && !foundKeys.includes('producto')) {
        const headerOriginal =
          rawHeaders.find((h) =>
            (MAPPINGS.costo_unitario ?? []).some((a) => normalizeStr(a) === normalizeStr(h))
          ) ?? 'costo'
        salesWarnings.push({
          code: 'COSTO_SIN_PRODUCTO',
          field: 'costo_unitario',
          message: `Detectamos la columna "${headerOriginal}" pero falta la columna producto. El análisis de margen requiere ambas; ignoramos la columna de costo.`,
        })
        for (const row of mappedRows) {
          delete row.costo_unitario
        }
        const idx = foundKeys.indexOf('costo_unitario')
        if (idx >= 0) foundKeys.splice(idx, 1)
      }
    }

    if (type === 'inventory') {
      const requiredError = buildObligatoriedadParseError('inventory', foundKeys, ignoredColumns)
      if (requiredError) {
        post({ type: 'result', success: false, error: requiredError })
        return
      }
    }

    if (type === 'metas') {
      // [Z.P1.3] Aceptar mes_periodo O mes como fuente de período
      const requiredError = buildObligatoriedadParseError('metas', foundKeys, ignoredColumns)
      if (requiredError) {
        post({ type: 'result', success: false, error: requiredError })
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

          // [Z.P1.3] Columna `mes` numérica aislada
          if (mes === null && mapped.mes !== undefined) {
            mes = parseMonthNum(mapped.mes)
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
          }
          for (const key of getDimensionKeys('metas')) {
            if (mapped[key] !== undefined) record[key] = String(mapped[key])
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
      columns = Array.from(new Set(foundKeys.filter((k) => k !== 'mes_periodo' && k !== 'anio' && k !== 'mes').concat(['mes', 'anio'])))
    }

    post({
      type: 'progress',
      phase: 'done',
      percent: 100,
      detail: `${data.length.toLocaleString('es')} ${data.length === 1 ? 'registro listo' : 'registros listos'}`,
    })

    post({
      type: 'result',
      success: true,
      data,
      columns,
      sheetName,
      discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
      ignoredColumns: ignoredColumns.length > 0 ? ignoredColumns : undefined,
      // [P2] Emitir siempre que la convención sea dmy/mdy (no solo cuando
      // ambiguous=true). Antes el caso `12/13/2026` con secondOver12 fijaba
      // mdy con ambiguous=false → no warning → usuario no veía la asunción.
      // El flag `ambiguous` se pasa para que la UI diferencie el copy entre
      // "ambiguo (asumimos X)" vs "detectamos formato X".
      dateAmbiguity: dateConv && (dateConv.convention === 'dmy' || dateConv.convention === 'mdy')
        ? { convention: dateConv.convention, evidence: dateConv.evidence, ambiguous: dateConv.ambiguous }
        : undefined,
      warnings: salesWarnings.length > 0 ? salesWarnings : undefined,
      // [P4] Trace de mapeo para los 3 tipos. Antes solo se emitía para sales;
      // el panel "Mapeo detectado" lo necesita también en metas/inventario.
      mapping: computeMappingTrace(rawHeaders, MAPPINGS),
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
