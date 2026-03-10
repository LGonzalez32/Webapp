import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { SaleRecord, MetaRecord, InventoryItem, DataAvailability } from '../types'

// ─── ALIASES DE COLUMNAS ─────────────────────────────────────────────────────

const SALES_MAPPINGS: Record<string, string[]> = {
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
}

const META_MAPPINGS: Record<string, string[]> = {
  mes_periodo: [
    'month', 'Month', 'mes', 'Mes', 'periodo', 'Periodo', 'period', 'Period',
    'fecha', 'MONTH', 'MES', 'mes_periodo',
  ],
  vendedor: [
    'vendor', 'Vendedor', 'salesperson', 'rep', 'representante', 'VENDEDOR',
    'Salesperson', 'agente', 'Agente', 'ejecutivo', 'Ejecutivo', 'vendedor',
    'seller', 'Seller',
  ],
  meta: [
    'target', 'Target', 'budget', 'Budget', 'objetivo', 'Objetivo', 'goal',
    'Goal', 'Meta', 'META', 'cuota', 'Cuota', 'meta',
  ],
  canal: [
    'canal', 'Canal', 'canal_venta', 'Canal_Venta', 'channel', 'Channel', 'CANAL',
  ],
}

const INVENTORY_MAPPINGS: Record<string, string[]> = {
  producto: ['Producto', 'producto', 'SKU', 'sku', 'Nombre', 'nombre', 'Product', 'product', 'item', 'Item'],
  unidades: ['Stock', 'stock', 'Unidades', 'unidades', 'Stock Actual', 'Cantidad', 'Qty', 'units', 'Units'],
  categoria: ['Categoria', 'categoria', 'Categoría', 'Category', 'category', 'Tipo'],
  proveedor: ['Proveedor', 'proveedor', 'Supplier', 'Vendor', 'supplier'],
}

// ─── SCHEMAS ZOD ─────────────────────────────────────────────────────────────

const saleSchema = z.object({
  fecha: z.coerce.date(),
  vendedor: z.string().min(1),
  unidades: z.number().min(0),
  producto: z.string().optional(),
  cliente: z.string().optional(),
  venta_neta: z.number().optional(),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
  canal: z.string().optional(),
})

const metaSchema = z.object({
  mes_periodo: z.string().min(1),
  vendedor: z.string().min(1),
  meta: z.number().min(0),
  canal: z.string().optional(),
})

const inventorySchema = z.object({
  producto: z.string().min(1),
  unidades: z.number().min(0),
  categoria: z.string().optional(),
  proveedor: z.string().optional(),
})

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>, mappings: Record<string, string[]>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  const keys = Object.keys(row)

  for (const [target, sources] of Object.entries(mappings)) {
    const sourceKey = keys.find((k) =>
      sources.some((s) => s.toLowerCase() === k.toLowerCase().trim())
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

// ─── PARSERS PÚBLICOS ─────────────────────────────────────────────────────────

export async function parseSalesFile(
  file: File
): Promise<{ data: SaleRecord[]; skippedCount: number }> {
  const rawData = await readFileData(file)
  const data: SaleRecord[] = []
  let skippedCount = 0

  for (const row of rawData) {
    const mapped = mapRow(row, SALES_MAPPINGS)
    const result = saleSchema.safeParse(mapped)
    if (result.success) {
      data.push(result.data as SaleRecord)
    } else {
      skippedCount++
    }
  }

  return { data, skippedCount }
}

export async function parseMetasFile(
  file: File
): Promise<{ data: MetaRecord[]; skippedCount: number }> {
  const rawData = await readFileData(file)
  const data: MetaRecord[] = []
  let skippedCount = 0

  for (const row of rawData) {
    const mapped = mapRow(row, META_MAPPINGS)
    const result = metaSchema.safeParse(mapped)
    if (result.success) {
      data.push(result.data as MetaRecord)
    } else {
      skippedCount++
    }
  }

  return { data, skippedCount }
}

export async function parseInventoryFile(
  file: File
): Promise<{ data: InventoryItem[]; skippedCount: number }> {
  const rawData = await readFileData(file)
  const data: InventoryItem[] = []
  let skippedCount = 0

  for (const row of rawData) {
    const mapped = mapRow(row, INVENTORY_MAPPINGS)
    const result = inventorySchema.safeParse(mapped)
    if (result.success) {
      data.push(result.data as InventoryItem)
    } else {
      skippedCount++
    }
  }

  return { data, skippedCount }
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
  }
}
