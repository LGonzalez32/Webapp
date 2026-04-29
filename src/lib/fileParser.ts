import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { z } from 'zod'
import type { SaleRecord, MetaRecord, InventoryItem, DataAvailability, ParseError, ParseResult, DiscardedRow } from '../types'
import { emitIngestSummary } from './ingestTelemetry'

// ─── NORMALIZACIÓN ───────────────────────────────────────────────────────────

export function normalizeStr(s: unknown): string {
  // [Z.P1.5] defensivo: nunca crashear con null/undefined/number/bool
  if (s === null || s === undefined) return ''
  let str = typeof s === 'string' ? s : String(s)
  // Quitar acentos ANTES de lowercase para mantener mapeo 1-1
  str = str.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  // [Z.P1.7] separar camelCase/PascalCase ANTES de lowercase: "OrderDate" \u2192 "Order Date"
  str = str.replace(/([a-z])([A-Z])/g, '$1 $2')
  str = str.toLowerCase().trim()
  // [Z.P1.7] quitar puntos: "f.venta" \u2192 "fventa", "F.Venta" \u2192 "fventa"
  str = str.replace(/\./g, '')
  // [Z.P1.3] colapsar underscores, guiones y espacios m\u00faltiples a un \u00fanico espacio
  str = str.replace(/[_\-\s]+/g, ' ')
  return str.trim()
}

// [Z.P2.1] Normalizador num\u00e9rico robusto: soporta formato US, europeo/latino, par\u00e9ntesis contables, moneda y espacios.
export function parseNumericCell(val: unknown): number | null {
  if (val === null || val === undefined || val === '') return null
  if (typeof val === 'number' && !isNaN(val)) return val
  let s = String(val).trim()
  if (s === '' || s === '-') return null

  // Par\u00e9ntesis contables: (1234.56) => -1234.56
  let negative = false
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1).trim()
  }

  // Quitar s\u00edmbolos de moneda comunes y c\u00f3digos ISO
  s = s.replace(/[$\u20ac\u00a3\u00a5\u20a1\u20b2\u20b4\u20b5\u20a6\u20aa\u20ab\u20b1\u20a9\u20ad\u20a8]/g, '')
  s = s.replace(/\b(USD|EUR|MXN|COP|CLP|ARS|PEN|BRL|GTQ|HNL|NIO|CRC|PAB|DOP|SVC|BOB|UYU|PYG|VES)\b/gi, '')

  // Quitar espacios normales y no-separables (nbsp, narrow nbsp, thin space)
  s = s.replace(/[\s\u00a0\u202f\u2009]/g, '')
  if (s === '') return null

  const hasDot = s.includes('.')
  const hasComma = s.includes(',')
  if (hasDot && hasComma) {
    const lastDot = s.lastIndexOf('.')
    const lastComma = s.lastIndexOf(',')
    if (lastComma > lastDot) {
      // Europeo: '.' miles, ',' decimal \u2192 "1.234,56"
      s = s.replace(/\./g, '').replace(',', '.')
    } else {
      // US: ',' miles, '.' decimal \u2192 "1,234.56"
      s = s.replace(/,/g, '')
    }
  } else if (hasComma && !hasDot) {
    const m = s.match(/^-?\d{1,3}(,\d{3})+$/)
    if (m) {
      s = s.replace(/,/g, '')
    } else {
      s = s.replace(',', '.')
    }
  } else if (hasDot && !hasComma) {
    const dotCount = (s.match(/\./g) || []).length
    if (dotCount > 1) {
      // "1.234.567" \u2192 miles europeos
      s = s.replace(/\./g, '')
    }
    // dotCount === 1: mantener como decimal US (caso ambiguo "1.234")
  }

  s = s.replace(/[^\d.\-eE+]/g, '')
  if (s === '' || s === '-' || s === '.') return null

  const n = parseFloat(s)
  if (isNaN(n) || !isFinite(n)) return null
  return negative ? -n : n
}

// [Z.P1.7] Decodificador de texto con fallback CP1252/latin1 cuando UTF-8 da mojibake.
export function smartDecodeText(buffer: ArrayBuffer): string {
  const utf8 = new TextDecoder('utf-8').decode(buffer)
  const mojibakeRe = /�|Ã[©¡³±¨¼½²]/g
  const utf8BadCount = (utf8.match(mojibakeRe) || []).length
  if (utf8BadCount === 0) return utf8
  try {
    const cp1252 = new TextDecoder('windows-1252').decode(buffer)
    const cp1252BadCount = (cp1252.match(mojibakeRe) || []).length
    if (cp1252BadCount < utf8BadCount) return cp1252
  } catch {
    // windows-1252 puede no estar en todos los navegadores; caer al UTF-8 original
  }
  return utf8
}

// ─── ALIASES DE COLUMNAS ─────────────────────────────────────────────────────

/**
 * ─────────────────────────────────────────────────────────────
 * CONTRATO DE EXTENSIBILIDAD (leer antes de agregar columnas o tablas)
 * ─────────────────────────────────────────────────────────────
 * Para AGREGAR UNA COLUMNA nueva a una tabla existente:
 *   1) Agregar alias en el *_MAPPINGS correspondiente.
 *   2) Agregar el campo en el *Schema (siempre .optional() salvo
 *      obligatoriedad expresa).
 *   3) Si es dimensional, agregar la key en
 *      TABLE_REGISTRY[tabla].roles.dimensions.
 *   4) Si es métrica, agregarla en TABLE_REGISTRY[tabla].roles.metrics.
 *   5) NO hace falta tocar el worker: consume TABLE_REGISTRY.
 *
 * Para AGREGAR UNA TABLA nueva (ej: "devoluciones"):
 *   1) Crear sus MAPPINGS, schema y entrada en TABLE_REGISTRY.
 *   2) Exponer un parseXFile() (puede reusar mapRow + detectIgnoredColumns).
 * ─────────────────────────────────────────────────────────────
 */
export type ColumnRole = 'date' | 'metric' | 'dimension' | 'attribute' | 'ignored'
// Para agregar una tabla nueva: extender este union, agregar
// MAPPINGS + FIELDS + schema + entry en TABLE_REGISTRY. El resto del sistema
// (wizard, plantilla XLSX, dim disponibilidad, validación cross-table) se
// adapta automáticamente desde el registry.
export type TableId = 'sales' | 'metas' | 'inventory'

// [Sprint B] Re-export de tipos shared para que consumers existentes que
// importan desde fileParser.ts no rompan al migrar.
export type { FieldDefinition, ValueType, FieldRole, CrossTableRule } from './registry-types'
export { fieldsByRole, rolesConsistentWithFields, type InferRecord } from './registry-types'

import type { FieldDefinition as _FieldDefinition, CrossTableRule as _CrossTableRule } from './registry-types'

export interface TableDefinition {
  id: TableId
  label: string
  // [Sprint B] Metadata para UI y wizard. Sprint C los consumirá.
  uploadLabel: string
  description: string
  templateSheetName: string
  /** Si true, aparece en el wizard de carga. False = tabla derivada/interna. */
  isUserUpload: boolean
  /** Orden del paso del wizard (asc). */
  displayOrder: number
  /**
   * [Sprint D] Slug usado como `UploadStep.id` en el wizard. Hoy difiere del
   * `id` canónico (ej. id='sales' / wizardStepId='ventas'). Sprint futuro
   * puede unificarlos.
   */
  wizardStepId: string
  /** [Sprint D] Si el paso es obligatorio en el wizard. */
  wizardRequired: boolean
  /** Catálogo canónico de campos con metadata enriquecida (fuente de verdad). */
  fields: Record<string, _FieldDefinition>
  // ── existentes ───────────────────────────────────────────────────────────
  mappings: Record<string, readonly string[]>
  roles: {
    date: readonly string[]
    metrics: readonly string[]
    dimensions: readonly string[]
    attributes: readonly string[]
  }
  obligatoriedad: null | {
    requireAllOf?: readonly string[]
    requireAnyOf?: readonly (readonly string[])[]
    requireOneOfSets?: readonly (readonly string[])[]
  }
  /** [Sprint E] Reglas cross-table declarativas. Vacío por defecto. */
  relations?: readonly _CrossTableRule[]
  /**
   * [Sprint F.2] Schema zod para validar filas. Si está presente,
   * `parseFileForTable` lo usa para validar cada row.
   * Tipo unknown para evitar dependencias circulares con tipos zod
   * específicos por tabla.
   */
  schema?: unknown
  /**
   * [Sprint F.2] Hook opcional de post-procesamiento por fila. Recibe la
   * fila ya validada por schema y devuelve la fila final (puede agregar
   * campos derivados). Ejemplo: sales agrega `clientKey` derivado.
   */
  postProcessRow?: (row: Record<string, unknown>) => Record<string, unknown>
  /**
   * [Sprint F.2] Si true, esta tabla usa un parser custom (no se puede
   * generalizar con el flujo estándar de parseFileForTable). Hoy aplica
   * solo a `metas` por la decomposición mes_periodo↔mes+anio.
   */
  hasCustomParser?: boolean
}

// [Z.P1.9.2] Aliases que representan "costo total de línea" (cantidad × costo unitario).
// Se aceptan como columna de costo pero en mapRow se dividen por unidades para
// obtener el costo_unitario real. Transparente para el cliente: la UI solo habla
// de "costo" y aceptamos cualquier nombre razonable.
export const COSTO_UNITARIO_ALIASES_TOTAL_DE_LINEA: readonly string[] = [
  'costo_total', 'Costo Total', 'costototal', 'CostoTotal',
  'Costo_Total', 'COSTO TOTAL', 'COSTO_TOTAL',
  'costo_ventas', 'Costo Ventas', 'Costo de Ventas',
  'COSTO DE VENTAS', 'costo_de_ventas', 'costodeventas',
  'cogs', 'COGS', 'Cogs',
  'cost_of_sales', 'Cost of Sales', 'costofsales', 'COST_OF_SALES',
  'costo_linea', 'Costo Linea', 'Costo Línea', 'costo_línea',
  'costo_total_linea', 'Costo Total Línea', 'Costo Total Linea',
  'total_cost', 'Total Cost', 'TotalCost', 'totalcost', 'TOTAL_COST',
]

export function isAliasTotalDeLinea(headerRaw: string): boolean {
  const norm = normalizeStr(headerRaw)
  return COSTO_UNITARIO_ALIASES_TOTAL_DE_LINEA.some(a => normalizeStr(a) === norm)
}

export const SALES_MAPPINGS: Record<string, string[]> = {
  fecha: [
    'date', 'Date', 'Fecha', 'fecha_venta', 'sale_date', 'FECHA', 'Fecha_Venta',
    // [Z.P1.7]
    'f.venta', 'F.Venta', 'f venta', 'F Venta', 'Fecha Venta', 'FECHA VENTA',
    'fechaventa', 'FechaVenta',
    'dia', 'Dia', 'DIA', 'día', 'Día',
    'order_date', 'Order Date', 'ORDER DATE', 'orderdate', 'OrderDate',
    'sale date', 'SALE DATE', 'purchase_date', 'Purchase Date', 'purchasedate',
    'fecha_operacion', 'Fecha Operacion', 'fecha_documento', 'Fecha Documento',
    'fecha_emision', 'Fecha Emision', 'periodo_venta',
    // [Z.P1.8]
    'F.Emision', 'F.Emisión', 'f.emision', 'f emision', 'F Emision',
    'fecha_factura', 'Fecha_Factura', 'Fecha Factura', 'FECHA FACTURA', 'fechafactura',
    'fecha_pedido', 'Fecha Pedido', 'Fecha de Pedido', 'fecha de pedido',
    'Fecha de Venta', 'fecha de venta', 'FECHA DE VENTA',
    'FECHA DOCUMENTO', 'fechadocumento',
    'fecha_doc', 'Fecha Doc', 'FechaDoc',
    'transaction_date', 'Transaction Date', 'TRANSACTION DATE', 'transactiondate', 'TransactionDate',
    'purchase-date', 'PurchaseDate',
    'order-date',
  ],
  vendedor: [
    'vendor', 'Vendedor', 'salesperson', 'rep', 'representante', 'VENDEDOR',
    'Salesperson', 'agente', 'Agente', 'ejecutivo', 'Ejecutivo', 'vendedor',
    'seller', 'Seller',
    // [Z.P1.7]
    'nombre_vendedor', 'Nombre Vendedor', 'NOMBRE VENDEDOR', 'nombrevendedor',
    'asesor', 'Asesor', 'ASESOR',
    'salesman', 'Salesman', 'sales_rep', 'Sales Rep', 'salesrep',
    // [Z.P1.7.1] feminizado (equipos de mujeres)
    'vendedora', 'Vendedora', 'VENDEDORA',
    // [Z.P1.7.1] cod_vend / codigo_vendedor / id_vendedor REMOVIDOS:
    //   son códigos, no nombres. No deben capturar el slot 'vendedor'.
    // [Z.P1.8]
    'team_member', 'Team Member', 'TEAM MEMBER', 'teammember',
  ],
  unidades: [
    // [Z.P1.8] 'amount/Amount/AMOUNT' MOVIDOS a venta_neta (uso corporativo
    // moderno los usa para dinero, no cantidades).
    'units', 'Units', 'cantidad', 'qty', 'Unidades',
    'UNIDADES', 'CANTIDAD', 'QTY', 'unidades',
    // [PR-M1] sinónimos adicionales para distribución/mayoreo con perecederos
    'piezas', 'Piezas', 'PIEZAS', 'cajas', 'Cajas', 'CAJAS',
    'volumen', 'Volumen', 'VOLUMEN',
    // [Z.P1.7]
    'unidades_vendidas', 'Unidades Vendidas', 'UNIDADES VENDIDAS',
    'unidadesvendidas', 'UnidadesVendidas',
    'cantidad_vendida', 'Cantidad Vendida', 'CANTIDAD VENDIDA',
    'qty_sold', 'Qty Sold', 'quantity', 'Quantity', 'QUANTITY',
    'quantitysold', 'qtysold',
    'nro_unidades', 'Nro Unidades', 'num_unidades', 'Num Unidades',
    'volumen_vendido', 'Volumen Vendido',
  ],
  producto: [
    // [Z.P1.7] SKU/sku REMOVIDOS (pertenecen solo a codigo_producto)
    'product', 'Product', 'Producto', 'PRODUCTO', 'item', 'Item',
    'articulo', 'Articulo', 'producto',
    'nombre_producto', 'Nombre Producto', 'NOMBRE PRODUCTO', 'nombreproducto',
    'product_name', 'Product Name', 'ProductName', 'productname',
    'descripcion_producto', 'Descripcion Producto', 'Descripción Producto',
    'desc_producto', 'Desc Producto',
    // [Z.P1.8]
    'line_item_name', 'line-item-name', 'Line Item Name', 'lineitemname', 'LineItemName',
    'nombre_del_producto', 'Nombre del Producto', 'NOMBRE DEL PRODUCTO',
    'item-name', 'item_name', 'Item Name', 'ItemName',
    'product_title', 'Product Title', 'ProductTitle',
    // [Z.P1.8] "Descripcion" sola — última prioridad: ERPs que usan descripción
    // genérica como nombre de producto cuando no hay columna 'producto' explícita.
    'descripcion', 'Descripcion', 'Descripción', 'DESCRIPCION', 'descripción',
  ],
  cliente: [
    'client', 'Client', 'Cliente', 'customer', 'Customer', 'CLIENTE',
    'razon_social', 'cuenta', 'Cuenta', 'cliente',
    // [Z.P1.7]
    'nombre_cliente', 'Nombre Cliente', 'NOMBRE CLIENTE', 'nombrecliente',
    'customer_name', 'Customer Name', 'CustomerName', 'customername',
    'client_name', 'Client Name',
    'Razon Social', 'razón_social', 'Razón Social', 'RAZON SOCIAL',
    // [Z.P1.8]
    'buyer_name', 'buyer-name', 'Buyer Name', 'BUYER NAME', 'buyername',
    'comprador', 'Comprador', 'COMPRADOR',
    'cuenta_cliente', 'Cuenta Cliente',
  ],
  venta_neta: [
    'monto', 'Monto', 'venta', 'Venta', 'revenue', 'Revenue', 'importe',
    'Importe', 'total', 'Total', 'MONTO', 'venta_neta', 'net_sales',
    // [PR-M1] sinónimo adicional
    'ventas', 'Ventas', 'VENTAS',
    // [Z.P1.7]
    'total_venta', 'Total Venta', 'TOTAL VENTA', 'totalventa', 'TotalVenta',
    'monto_total', 'Monto Total', 'MONTO TOTAL', 'montototal',
    'monto_neto', 'Monto Neto', 'MONTO NETO', 'montoneto',
    'venta_usd', 'Venta USD', 'venta_mxn', 'Venta MXN', 'venta_bs', 'Venta Bs',
    'importe_total', 'Importe Total', 'IMPORTE TOTAL',
    'importe_bs', 'Importe Bs', 'importe_usd', 'Importe USD',
    'revenue_total', 'Revenue Total', 'net_revenue', 'Net Revenue',
    'facturacion', 'Facturacion', 'Facturación', 'FACTURACION',
    'ingreso', 'Ingreso', 'ingresos', 'Ingresos', 'ventanet', 'VentaNet',
    // [Z.P1.8] amount/Amount/AMOUNT y TOTAL movidos aquí desde unidades
    'amount', 'Amount', 'AMOUNT', 'TOTAL',
    // [Z.P1.8]
    'total_pedido', 'Total Pedido', 'TOTAL PEDIDO', 'totalpedido',
    'order_total', 'Order Total', 'OrderTotal', 'ordertotal',
    'valor_total', 'Valor Total', 'VALOR TOTAL',
    'Net Sales', 'NET SALES', 'netsales',
    'sales_amount', 'Sales Amount', 'salesamount',
    'order_amount', 'Order Amount', 'orderamount',
    'monto_bs', 'Monto Bs', 'MONTO BS',
    'monto_usd', 'Monto USD', 'MONTO USD',
    'monto_clp', 'Monto CLP', 'MONTO CLP',
    'monto_mxn', 'Monto MXN',
    'monto_pen', 'Monto PEN',
    'total_clp', 'Total CLP', 'total_mxn', 'Total MXN',
    'total_s/.', 'Total S/.', 'total_pen',
    'ingreso_bs', 'Ingreso Bs', 'INGRESO BS',
    'item-price', 'item_price', 'Item Price', 'ItemPrice', 'itemprice',
    'unit_price', 'Unit Price', 'UnitPrice',
    'precio_total', 'Precio Total', 'PRECIO TOTAL',
    'price', 'Price', 'PRICE',
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
  subcategoria: [
    'subcategoria', 'Subcategoria', 'Subcategoría', 'subcategoría',
    'SUBCATEGORIA', 'SUBCATEGORÍA',
    'subcategory', 'Subcategory', 'SUBCATEGORY',
    'sub_categoria', 'Sub_Categoria', 'sub-categoria',
    'sub_linea', 'Sub_Linea', 'sublinea', 'Sublinea',
  ],
  costo_unitario: [
    // Unitario directo
    'costo_unitario', 'Costo Unitario', 'Costo_Unitario',
    'COSTO_UNITARIO', 'COSTO UNITARIO',
    'costo', 'Costo', 'COSTO',
    'cost', 'Cost', 'COST',
    'unit_cost', 'Unit Cost', 'UnitCost', 'unitcost',
    'cost_per_unit', 'Cost Per Unit', 'costperunit',
    'precio_costo', 'Precio Costo', 'PrecioCosto',
    'costo_producto', 'Costo Producto',
    'precio_unitario_costo', 'Precio Unitario Costo',
    'precio_unit', 'Precio Unit', 'PRECIO_UNIT', 'PRECIO UNIT',
    'precio_unitario', 'Precio Unitario', 'PRECIO UNITARIO',
    // [Z.P1.9.2] Totales de línea — se aceptan y se DERIVAN silenciosamente
    // dividiendo por unidades. Ver COSTO_UNITARIO_ALIASES_TOTAL_DE_LINEA.
    ...COSTO_UNITARIO_ALIASES_TOTAL_DE_LINEA,
  ],
}

export const META_MAPPINGS: Record<string, string[]> = {
  // Period — combined (YYYY-MM)
  mes_periodo: [
    'mes_periodo', 'periodo', 'Periodo', 'period', 'Period', 'fecha', 'FECHA',
    'month_year', 'mes/año', 'mes_año',
    // [Z.P1.7]
    'Mes Año', 'mes_anio', 'Mes Anio', 'Month Year',
    'anio_mes', 'Año Mes', 'Año-Mes', 'year_month',
  ],
  // [Z.P1.3] Month number column (1-12), separado de mes_periodo
  mes: [
    'mes', 'Mes', 'MES', 'month', 'Month', 'MONTH',
    'mes_num', 'numero_mes',
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
    // [Z.P1.7]
    'cuota_mensual', 'Cuota Mensual', 'meta_mes', 'Meta Mes',
    'objetivo_mes', 'Objetivo Mes', 'presupuesto', 'Presupuesto', 'PRESUPUESTO',
    'budget_mensual', 'Budget Mensual', 'target_usd', 'Target USD',
    'meta_usd', 'Meta USD',
    // [Z.P1.7.1] meta por moneda
    'meta_bs', 'Meta Bs', 'meta_mxn', 'Meta MXN',
    'meta_cop', 'Meta COP', 'meta_ars', 'Meta ARS', 'meta_clp', 'Meta CLP',
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
  subcategoria: [
    'subcategoria', 'Subcategoria', 'Subcategoría', 'subcategoría',
    'SUBCATEGORIA', 'SUBCATEGORÍA',
    'subcategory', 'Subcategory', 'SUBCATEGORY',
    'sub_categoria', 'Sub_Categoria', 'sub-categoria',
    'sub_linea', 'Sub_Linea', 'sublinea', 'Sublinea',
  ],
  departamento: [
    'departamento', 'Departamento', 'DEPARTAMENTO',
    'dept', 'Dept', 'zona', 'Zona', 'region', 'Region', 'area', 'Area',
  ],
  supervisor: [
    'supervisor', 'Supervisor', 'SUPERVISOR',
    'nombre_supervisor', 'Nombre Supervisor', 'Nombre_Supervisor',
    'jefe', 'Jefe', 'gerente', 'Gerente', 'manager', 'Manager',
  ],
  canal: [
    'canal', 'Canal', 'canal_venta', 'Canal_Venta', 'channel', 'Channel', 'CANAL',
  ],
  proveedor: [
    'proveedor', 'Proveedor', 'PROVEEDOR', 'supplier', 'Supplier', 'vendor',
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
  if (val === null || val === undefined || val === '') return null
  const n = Number(val)
  // [Z.P2.1] Requerir entero; rechazar fraccionarios silenciosos
  if (!isNaN(n) && Number.isInteger(n) && n >= 1 && n <= 12) return n
  return MONTH_NAMES[normalizeStr(String(val))] ?? null
}

export function detectTipoMeta(rawHeaders: string[]): 'unidades' | 'venta_neta' {
  const metaHeader = rawHeaders.find((h) =>
    META_MAPPINGS.meta.some((a) => normalizeStr(a) === normalizeStr(h))
  )
  if (!metaHeader) return 'unidades'
  const norm = normalizeStr(metaHeader)
  // [1.6.1] Lista alineada con isUnambiguousMetaHeader. Antes solo
  // matcheaba {venta, revenue, importe, monto, neta} — headers como
  // "meta_usd" o "Meta MXN" caían a default 'unidades' silenciosamente.
  const usdKeywords = ['venta', 'revenue', 'importe', 'monto', 'neta', 'usd', 'bs', 'mxn', 'cop', 'ars', 'clp']
  if (usdKeywords.some((kw) => norm.includes(kw))) {
    return 'venta_neta'
  }
  return 'unidades'
}

// [1.6.1] Headers genéricos que matchean META_MAPPINGS.meta pero NO contienen
// keyword que desambigüe USD vs unidades. detectTipoMeta cae al default
// 'unidades' silenciosamente — el cliente real con "Meta" o "Cuota" piensa
// USD y queda mal etiquetado. UploadPage debe interceptar este caso y
// preguntar antes de confirmar el parse (commit 1.6.2).
export const AMBIGUOUS_META_HEADERS: readonly string[] = [
  'meta', 'Meta', 'META',
  'target', 'Target',
  'budget', 'Budget',
  'objetivo', 'Objetivo',
  'goal', 'Goal',
  'cuota', 'Cuota',
  'cuota_mensual', 'meta_mes', 'objetivo_mes',
  'presupuesto', 'Presupuesto',
  'budget_mensual',
]

const AMBIGUOUS_META_HEADERS_NORM = new Set(
  AMBIGUOUS_META_HEADERS.map((h) => normalizeStr(h))
)

function isUnambiguousMetaHeader(headerNorm: string): boolean {
  // Header inequívoco si contiene keyword USD/uds que rompe la ambigüedad.
  const usd = ['venta', 'revenue', 'importe', 'monto', 'neta', 'usd', 'bs', 'mxn', 'cop', 'ars', 'clp']
  const uds = ['unidades', 'units']
  return usd.some((kw) => headerNorm.includes(kw)) || uds.some((kw) => headerNorm.includes(kw))
}

/**
 * [1.6.1] Inspecciona los headers crudos y reporta si la columna meta
 * detectada es ambigua (no podemos decidir USD vs uds por el nombre).
 *
 * Si coexisten un header inequívoco (ej. `meta_usd`) y uno ambiguo
 * (ej. `Meta`), prioriza el inequívoco — `ambiguous=false`.
 */
export function isAmbiguousMetaHeader(rawHeaders: string[]): {
  ambiguous: boolean
  matchedHeader: string | null
} {
  let ambiguousCandidate: string | null = null
  for (const h of rawHeaders) {
    const norm = normalizeStr(h)
    if (!META_MAPPINGS.meta.some((a) => normalizeStr(a) === norm)) continue
    if (isUnambiguousMetaHeader(norm)) {
      // Header inequívoco encontrado: cancela cualquier ambigüedad previa.
      return { ambiguous: false, matchedHeader: null }
    }
    if (AMBIGUOUS_META_HEADERS_NORM.has(norm) && ambiguousCandidate === null) {
      ambiguousCandidate = h
    }
  }
  return ambiguousCandidate !== null
    ? { ambiguous: true, matchedHeader: ambiguousCandidate }
    : { ambiguous: false, matchedHeader: null }
}

export const INVENTORY_MAPPINGS: Record<string, string[]> = {
  producto: [
    'Producto', 'producto', 'Nombre', 'nombre', 'Product', 'product', 'item', 'Item', 'articulo', 'Articulo',
    // [Z.P1.7]
    'nombre_producto', 'Nombre Producto', 'product_name', 'Product Name',
  ],
  unidades: [
    'Stock', 'stock', 'Unidades', 'unidades', 'Stock Actual', 'Cantidad', 'Qty', 'units', 'Units',
    // [Z.P1.7]
    'existencia', 'Existencia', 'EXISTENCIA', 'existencias', 'Existencias',
    'inventario', 'Inventario', 'INVENTARIO', 'on_hand', 'On Hand',
    'disponible', 'Disponible',
  ],
  categoria: ['Categoria', 'categoria', 'Categoría', 'Category', 'category', 'Tipo'],
  subcategoria: [
    'subcategoria', 'Subcategoria', 'Subcategoría', 'subcategoría',
    'SUBCATEGORIA', 'SUBCATEGORÍA',
    'subcategory', 'Subcategory', 'SUBCATEGORY',
    'sub_categoria', 'Sub_Categoria', 'sub-categoria',
    'sub_linea', 'Sub_Linea', 'sublinea', 'Sublinea',
  ],
  proveedor: ['Proveedor', 'proveedor', 'Supplier', 'Vendor', 'supplier'],
  fecha: [
    'fecha', 'Fecha', 'FECHA', 'date', 'Date', 'DATE',
    'fecha_corte', 'Fecha Corte', 'FechaCorte',
    'fecha_inventario', 'Fecha Inventario', 'fecha_snapshot',
    'snapshot_date', 'Snapshot Date', 'as_of', 'As Of',
  ],
}

// ─── SCHEMAS ZOD ─────────────────────────────────────────────────────────────

export const saleSchema = z.object({
  fecha: z.coerce.date(),
  vendedor: z.string().optional(),
  unidades: z.number().optional(),
  producto: z.string().optional(),
  cliente: z.string().optional(),
  venta_neta: z.number().optional(),
  categoria: z.string().optional(),
  subcategoria: z.string().optional(),
  proveedor: z.string().optional(),
  canal: z.string().optional(),
  departamento: z.string().optional(),
  supervisor: z.string().optional(),
  costo_unitario: z.number().optional(),
}).refine(
  (d) => d.unidades !== undefined || d.venta_neta !== undefined,
  { message: "Al menos 'unidades' o 'venta_neta' debe estar presente", path: ['unidades'] }
)

// metaSchema omitted — parseMetasFile validates manually for multi-dim support

export const inventorySchema = z.object({
  fecha: z.coerce.date(),
  producto: z.string().min(1),
  unidades: z.number().min(0),
  categoria: z.string().optional(),
  subcategoria: z.string().optional(),
  proveedor: z.string().optional(),
}).refine(
  // [schema-cleanup] Inventario requiere al menos una columna opcional además
  // de los obligatorios (fecha, producto, unidades). Evita uploads "vacíos"
  // que solo declaran stock sin contexto analizable.
  d => d.categoria !== undefined || d.subcategoria !== undefined || d.proveedor !== undefined,
  { message: 'Se requiere al menos una columna opcional (categoria, subcategoria o proveedor).', path: ['categoria'] },
)

/**
 * Schema zod para metas. Cerrado ADITIVAMENTE: parseMetasFile sigue aplicando
 * su lógica actual (mes_periodo OR mes+anio, conversión de nombres de mes).
 * metaSchema se expone para consumidores futuros (validación opcional, tests,
 * UI de preview) y para el registry. No se invoca desde parseMetasFile en este
 * paso para no cambiar la UX de validación actual.
 */
export const metaSchema = z.object({
  mes_periodo: z.union([z.string(), z.number(), z.date()]).optional(),
  mes: z.union([z.string(), z.number()]).optional(),
  anio: z.union([z.string(), z.number()]).optional(),
  meta: z.number().optional(),
  vendedor: z.string().optional(),
  cliente: z.string().optional(),
  producto: z.string().optional(),
  categoria: z.string().optional(),
  subcategoria: z.string().optional(),
  departamento: z.string().optional(),
  supervisor: z.string().optional(),
  canal: z.string().optional(),
  proveedor: z.string().optional(),
})

// ─── TABLE REGISTRY (fuente única de verdad de roles por tabla) ──────────────

// [Sprint B] Helper para construir FieldDefinition con defaults sensatos.
function _f(
  key: string,
  label: string,
  role: 'date' | 'metric' | 'dimension' | 'attribute',
  valueType: 'string' | 'number' | 'date' | 'boolean',
  nullable: boolean,
  displayOrder: number,
  extras: { example?: string | number; description?: string; requirementGroup?: string; visibleInTemplate?: boolean; visibleInPreview?: boolean } = {},
): _FieldDefinition {
  return {
    key, label, role, valueType, nullable, displayOrder,
    example: extras.example,
    description: extras.description,
    requirementGroup: extras.requirementGroup,
    visibleInTemplate: extras.visibleInTemplate ?? true,
    visibleInPreview: extras.visibleInPreview ?? true,
  }
}

const SALES_FIELDS: Record<string, _FieldDefinition> = {
  fecha:           _f('fecha',           'Fecha',           'date',      'date',   false,  1, { example: '2026-03-01', description: 'Fecha de la transacción' }),
  unidades:        _f('unidades',        'Unidades',        'metric',    'number', true,   2, { example: 24, description: 'Cantidad vendida', requirementGroup: 'metric_pair' }),
  venta_neta:      _f('venta_neta',      'Venta neta',      'metric',    'number', true,   3, { example: 142.80, description: 'Monto de la venta', requirementGroup: 'metric_pair' }),
  vendedor:        _f('vendedor',        'Vendedor',        'dimension', 'string', true,   4, { example: 'ANA MARIA LOPEZ' }),
  cliente:         _f('cliente',         'Cliente',         'dimension', 'string', true,   5, { example: 'SUPER SELECTOS S.A.' }),
  producto:        _f('producto',        'Producto',        'dimension', 'string', true,   6, { example: 'ACEITE CORONA 1L' }),
  categoria:       _f('categoria',       'Categoría',       'dimension', 'string', true,   7, { example: 'ALIMENTOS' }),
  subcategoria:    _f('subcategoria',    'Subcategoría',    'dimension', 'string', true,   8, { example: 'ACEITES' }),
  canal:           _f('canal',           'Canal',           'dimension', 'string', true,   9, { example: 'RUTEO' }),
  departamento:    _f('departamento',    'Departamento',    'dimension', 'string', true,  10, { example: 'CENTRAL' }),
  supervisor:      _f('supervisor',      'Supervisor',      'dimension', 'string', true,  11, { example: 'CARLOS HERNANDEZ' }),
  proveedor:       _f('proveedor',       'Proveedor',       'dimension', 'string', true,  12, { example: 'SIGMA' }),
  costo_unitario:  _f('costo_unitario',  'Costo unitario',  'metric',    'number', true,  13, { example: 4.25, description: 'Costo del producto por unidad' }),
}

const META_FIELDS: Record<string, _FieldDefinition> = {
  // mes_periodo es la forma canónica para la plantilla; mes/anio son alternativas
  // que el parser acepta pero se ocultan de la plantilla XLSX para no confundir.
  // En preview de la UI sí se muestran todas (visibleInPreview default true).
  mes_periodo:  _f('mes_periodo',  'Periodo (mes-año)', 'date',      'string', true,   1, { example: '2026-03', description: 'Período en formato YYYY-MM', requirementGroup: 'period' }),
  mes:          _f('mes',          'Mes',               'date',      'number', true,   2, { example: 3, description: 'Mes 1-12 (combinable con año)', requirementGroup: 'period', visibleInTemplate: false }),
  anio:         _f('anio',         'Año',               'date',      'number', true,   3, { example: 2026, description: 'Año (combinable con mes)', requirementGroup: 'period', visibleInTemplate: false }),
  meta:         _f('meta',         'Meta',              'metric',    'number', false,  4, { example: 800, description: 'Valor objetivo del período' }),
  vendedor:     _f('vendedor',     'Vendedor',          'dimension', 'string', true,   5, { example: 'ANA MARIA LOPEZ' }),
  cliente:      _f('cliente',      'Cliente',           'dimension', 'string', true,   6, { example: 'SUPER SELECTOS S.A.' }),
  producto:     _f('producto',     'Producto',          'dimension', 'string', true,   7, { example: 'ACEITE CORONA 1L' }),
  categoria:    _f('categoria',    'Categoría',         'dimension', 'string', true,   8, { example: 'ALIMENTOS' }),
  subcategoria: _f('subcategoria', 'Subcategoría',      'dimension', 'string', true,   9, { example: 'ACEITES' }),
  departamento: _f('departamento', 'Departamento',      'dimension', 'string', true,  10, { example: 'CENTRAL' }),
  supervisor:   _f('supervisor',   'Supervisor',        'dimension', 'string', true,  11, { example: 'CARLOS HERNANDEZ' }),
  canal:        _f('canal',        'Canal',             'dimension', 'string', true,  12, { example: 'MAYOREO' }),
  proveedor:    _f('proveedor',    'Proveedor',         'dimension', 'string', true,  13, { example: 'SIGMA' }),
}

const INVENTORY_FIELDS: Record<string, _FieldDefinition> = {
  fecha:        _f('fecha',        'Fecha snapshot', 'date',      'date',   false,  1, { example: '2026-03-15', description: 'Fecha del corte de inventario' }),
  producto:     _f('producto',     'Producto',       'dimension', 'string', false,  2, { example: 'ACEITE CORONA 1L' }),
  unidades:     _f('unidades',     'Unidades',       'metric',    'number', false,  3, { example: 145, description: 'Stock actual disponible' }),
  categoria:    _f('categoria',    'Categoría',      'dimension', 'string', true,   4, { example: 'ALIMENTOS' }),
  subcategoria: _f('subcategoria', 'Subcategoría',   'dimension', 'string', true,   5, { example: 'ACEITES' }),
  proveedor:    _f('proveedor',    'Proveedor',      'dimension', 'string', true,   6, { example: 'SIGMA' }),
}

export const TABLE_REGISTRY: Readonly<Record<TableId, TableDefinition>> = {
  sales: {
    id: 'sales',
    label: 'Ventas',
    uploadLabel: 'Datos de Ventas',
    description: 'Sube tu historial de ventas. Solo necesito tres cosas: la fecha, cuánto vendiste (en unidades ó en dólares) y algo para agrupar (vendedor, cliente, producto…).',
    templateSheetName: 'Ventas',
    isUserUpload: true,
    displayOrder: 1,
    wizardStepId: 'ventas',
    wizardRequired: true,
    schema: saleSchema as unknown,
    postProcessRow: (row) => {
      // [Sprint F.2] clientKey = cliente.trim().toUpperCase() — único post-proc.
      const nombre = typeof row.cliente === 'string' ? row.cliente.trim() : ''
      return { ...row, clientKey: nombre !== '' ? nombre.toUpperCase() : null }
    },
    fields: SALES_FIELDS,
    mappings: SALES_MAPPINGS,
    roles: {
      date: ['fecha'],
      metrics: ['unidades', 'venta_neta', 'costo_unitario'],
      dimensions: [
        'vendedor', 'producto', 'cliente',
        'categoria', 'subcategoria',
        'canal', 'departamento',
        'supervisor', 'proveedor',
      ],
      attributes: [],
    },
    obligatoriedad: {
      requireAllOf: ['fecha'],
      requireAnyOf: [
        ['unidades', 'venta_neta'],
        ['vendedor', 'producto', 'cliente', 'categoria',
         'subcategoria', 'canal', 'departamento', 'supervisor',
         'proveedor'],
      ],
    },
  },
  metas: {
    id: 'metas',
    label: 'Metas',
    uploadLabel: 'Metas de Ventas',
    description: 'Opcional. Sube tus metas por vendedor, cliente, producto o categoría. Con metas activas se habilita el semáforo de cumplimiento y proyecciones vs. objetivo.',
    templateSheetName: 'Metas',
    isUserUpload: true,
    displayOrder: 2,
    wizardStepId: 'metas',
    wizardRequired: false,
    // [Sprint F.2] metas tiene parser custom por la lógica mes_periodo↔mes+anio
    // y detección automática de tipo_meta. parseFileForTable delega a parseMetasFile.
    hasCustomParser: true,
    fields: META_FIELDS,
    // [Sprint E] Cross-table rules declarativas. Hoy: metas requieren que las
    // dimensiones presentes existan también en ventas. Cuando se agreguen
    // membership o range_overlap, agregarlas a este array.
    relations: [
      {
        type: 'dim_consistency',
        sourceTable: 'metas',
        targetTable: 'sales',
        severity: 'error',
        requireTargetLoaded: true,
      },
    ],
    mappings: META_MAPPINGS,
    roles: {
      date: ['mes_periodo', 'mes', 'anio'],
      metrics: ['meta'],
      dimensions: [
        'vendedor', 'cliente', 'producto',
        'categoria', 'subcategoria',
        'departamento', 'supervisor', 'canal',
        'proveedor',
      ],
      attributes: [],
    },
    obligatoriedad: {
      requireAllOf: ['meta'],
      requireOneOfSets: [
        ['mes_periodo'],
        ['mes', 'anio'],
      ],
      requireAnyOf: [
        ['vendedor', 'cliente', 'producto', 'categoria',
         'subcategoria', 'departamento', 'supervisor', 'canal', 'proveedor'],
      ],
    },
  },
  inventory: {
    id: 'inventory',
    label: 'Inventario',
    uploadLabel: 'Inventario Actual',
    description: 'Opcional. Conecta tu stock por fecha de corte con tus ventas para detectar riesgos de ruptura antes de que ocurran.',
    templateSheetName: 'Inventario',
    isUserUpload: true,
    displayOrder: 3,
    wizardStepId: 'inventario',
    wizardRequired: false,
    fields: INVENTORY_FIELDS,
    schema: inventorySchema as unknown,
    mappings: INVENTORY_MAPPINGS,
    roles: {
      date: ['fecha'],
      metrics: ['unidades'],
      dimensions: ['producto', 'categoria', 'subcategoria', 'proveedor'],
      attributes: [],
    },
    obligatoriedad: {
      requireAllOf: ['fecha', 'producto', 'unidades'],
      requireAnyOf: [
        ['categoria', 'subcategoria', 'proveedor'],
      ],
    },
    // [Sprint F] inventario.producto debe existir en sales.producto.
    relations: [
      {
        type: 'membership',
        sourceTable: 'inventory',
        sourceField: 'producto',
        targetTable: 'sales',
        targetField: 'producto',
        severity: 'warning',
      },
    ],
  },
} as const

/** Devuelve claves dimensionales registradas. Fuente única de verdad. */
export function getDimensionKeys(tableId: TableId): readonly string[] {
  return TABLE_REGISTRY[tableId].roles.dimensions
}

/** Devuelve claves métricas registradas. */
export function getMetricKeys(tableId: TableId): readonly string[] {
  return TABLE_REGISTRY[tableId].roles.metrics
}

/**
 * Valida obligatoriedad declarativa. Devuelve null si OK o detalle del fallo.
 */
export function checkObligatoriedad(
  tableId: TableId,
  foundKeys: readonly string[],
): null | { missingAll: string[]; missingAny: string[][]; missingOneOfSets: string[][] } {
  const rule = TABLE_REGISTRY[tableId].obligatoriedad
  if (!rule) return null
  const missingAll = (rule.requireAllOf ?? []).filter((k) => !foundKeys.includes(k))
  const missingAny: string[][] = []
  for (const group of rule.requireAnyOf ?? []) {
    if (!group.some((k) => foundKeys.includes(k))) missingAny.push([...group])
  }
  const oneOfSets = rule.requireOneOfSets ?? []
  const missingOneOfSets: string[][] =
    oneOfSets.length > 0 && !oneOfSets.some((set) => set.every((k) => foundKeys.includes(k)))
      ? oneOfSets.map((set) => [...set])
      : []
  if (missingAll.length === 0 && missingAny.length === 0 && missingOneOfSets.length === 0) return null
  return { missingAll, missingAny, missingOneOfSets }
}

export function buildObligatoriedadParseError(
  tableId: TableId,
  foundKeys: readonly string[],
  unrecognizedHeaders: string[] = [],
): ParseError | null {
  const result = checkObligatoriedad(tableId, foundKeys)
  if (!result) return null

  const def = TABLE_REGISTRY[tableId]
  const missing = [
    ...result.missingAll,
    ...result.missingAny.map((group) => `al menos uno de: ${group.join(', ')}`),
    ...(result.missingOneOfSets.length > 0
      ? [result.missingOneOfSets.map((set) => set.join(' + ')).join(' o ')]
      : []),
  ]
  const suggestionKeys = Array.from(new Set([
    ...result.missingAll,
    ...result.missingAny.flat(),
    ...result.missingOneOfSets.flat(),
  ]))

  return {
    code: 'MISSING_REQUIRED',
    missing,
    found: [...foundKeys],
    unrecognizedHeaders,
    suggestions: buildMissingSuggestions(
      suggestionKeys,
      unrecognizedHeaders,
      def.mappings as Record<string, string[]>,
    ),
    message: `Faltan columnas requeridas para ${def.label}: ${missing.join('; ')}. Se detectaron: ${foundKeys.length > 0 ? foundKeys.join(', ') : 'ninguna'}.`,
  }
}

// Telemetría DEV: detecta inconsistencias registry ↔ schema/mappings al cargar.
if (import.meta.env.DEV) {
  // Extrae shape de un schema posiblemente envuelto en .refine (ZodEffects)
  const extractShape = (schema: unknown): string[] => {
    const s = schema as { shape?: Record<string, unknown>; _def?: { schema?: { shape?: Record<string, unknown> }; innerType?: { shape?: Record<string, unknown> } } }
    if (s?.shape) return Object.keys(s.shape)
    if (s?._def?.schema?.shape) return Object.keys(s._def.schema.shape)
    if (s?._def?.innerType?.shape) return Object.keys(s._def.innerType.shape)
    return []
  }
  const schemaKeys: Record<TableId, string[]> = {
    sales: extractShape(saleSchema),
    metas: extractShape(metaSchema),
    inventory: extractShape(inventorySchema),
  }
  for (const tid of Object.keys(TABLE_REGISTRY) as TableId[]) {
    const def = TABLE_REGISTRY[tid]
    const allRoleKeys = [
      ...def.roles.date, ...def.roles.metrics,
      ...def.roles.dimensions, ...def.roles.attributes,
    ]
    const mappingKeys = Object.keys(def.mappings)
    const keys = schemaKeys[tid]
    // Si no se pudo extraer el shape, no emitir falsos positivos.
    if (keys.length > 0) {
      const missingInSchema = allRoleKeys.filter((k) => !keys.includes(k))
      if (missingInSchema.length > 0) {
        // eslint-disable-next-line no-console
        console.warn(`[TABLE_REGISTRY] tabla "${tid}" tiene roles sin respaldo en schema:`, missingInSchema)
      }
    }
    const missingInMappings = allRoleKeys.filter((k) => !mappingKeys.includes(k))
    if (missingInMappings.length > 0) {
      // eslint-disable-next-line no-console
      console.warn(`[TABLE_REGISTRY] tabla "${tid}" tiene roles sin respaldo en mappings:`, missingInMappings)
    }
  }
}

// ─── HELPERS ──────────────────────────────────────────────────────────────────

export function mapRow(row: Record<string, unknown>, mappings: Record<string, string[]>): Record<string, unknown> {
  const mapped: Record<string, unknown> = {}
  const keys = Object.keys(row)
  let costoUnitarioSourceHeader: string | undefined

  for (const [target, sources] of Object.entries(mappings)) {
    const sourceKey = keys.find((k) =>
      sources.some((s) => normalizeStr(s) === normalizeStr(k))
    )
    if (sourceKey !== undefined) {
      let val = row[sourceKey]
      if (['unidades', 'venta_neta', 'meta', 'costo_unitario'].includes(target)) {
        val = parseNumericCell(val)
      }
      if (target === 'costo_unitario') costoUnitarioSourceHeader = sourceKey
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

  // [Z.P1.9.2] Derivación silenciosa: si la columna que matcheó costo_unitario
  // es un alias de "total de línea" (Costo de Ventas, COGS, Costo Línea...),
  // dividir por unidades para obtener el costo unitario real. Si no hay unidades,
  // no podemos derivar y descartamos el valor (queda como no disponible).
  if (
    mapped.costo_unitario != null &&
    costoUnitarioSourceHeader &&
    isAliasTotalDeLinea(costoUnitarioSourceHeader)
  ) {
    const u = mapped.unidades
    if (typeof u === 'number' && u > 0) {
      mapped.costo_unitario = (mapped.costo_unitario as number) / u
    } else {
      delete mapped.costo_unitario
    }
  }

  return mapped
}

/**
 * [Z.P1.10.b.1] Calcula el "trace" de mapeo: qué header crudo del archivo se asignó
 * a cada campo canónico. Útil para mostrar al usuario en MappingReview qué columna
 * de su archivo terminó como qué campo del modelo.
 */
export function computeMappingTrace(
  rawHeaders: string[],
  mappings: Record<string, string[]>
): Record<string, string> {
  const trace: Record<string, string> = {}
  for (const [target, sources] of Object.entries(mappings)) {
    const matched = rawHeaders.find((h) =>
      sources.some((s) => normalizeStr(s) === normalizeStr(h))
    )
    if (matched) trace[target] = matched
  }
  return trace
}

/**
 * [Z.P1.10.b.1] Construye los mappings efectivos a partir de los mappings base
 * (SALES_MAPPINGS) y un override del usuario. También valida los overrides contra
 * los headers crudos del archivo y emite warnings para overrides que apuntan a
 * headers inexistentes (en cuyo caso cae a la detección automática).
 *
 * Semántica del override:
 * - `string` → forzar: ese header se usa como el campo canónico, ignorando aliases.
 * - `null` → ignorar: ese campo canónico se descarta del mapeo aunque sería detectable.
 * - `undefined` / ausente → auto: usar la lista completa de aliases (comportamiento normal).
 */
export function buildEffectiveMappings(
  base: Record<string, string[]>,
  override: import('../types').MappingOverride,
  rawHeaders: string[]
): {
  mappings: Record<string, string[]>
  warnings: Array<{ code: string; message: string; field?: string }>
} {
  const result: Record<string, string[]> = {}
  const warnings: Array<{ code: string; message: string; field?: string }> = []
  const headerSet = new Set(rawHeaders.map((h) => normalizeStr(h)))

  for (const [target, defaultSources] of Object.entries(base)) {
    const ov = (override as Record<string, string | null | undefined>)[target]
    if (ov === null) {
      // Skip — explicitly ignore this canonical field
      continue
    }
    if (typeof ov === 'string') {
      if (headerSet.has(normalizeStr(ov))) {
        result[target] = [ov]
      } else {
        // Header del override no existe en el archivo → warning + fallback a auto-detect
        warnings.push({
          code: 'OVERRIDE_HEADER_NOT_FOUND',
          field: target,
          message: `Override pidió usar la columna "${ov}" como ${target}, pero no existe en el archivo. Usando detección automática.`,
        })
        result[target] = defaultSources
      }
    } else {
      result[target] = defaultSources
    }
  }
  return { mappings: result, warnings }
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
    // [Z.P1.7] Leer como ArrayBuffer y decodificar con fallback CP1252 si UTF-8 da mojibake
    const buffer = await file.arrayBuffer()
    const text = smartDecodeText(buffer)
    return new Promise((resolve) => {
      Papa.parse<Record<string, unknown>>(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          const rows = results.data
          const rawHeaders = (results.meta.fields ?? []) as string[]
          // [Z.P1.7.1] smartDecodeText ya eligió el mejor decode. No bloquear por mojibake
          // residual en esta rama — seguir parseando. El usuario notará visualmente en el preview
          // si hay garbling y podrá resubir con el encoding correcto.
          resolve({ rows, rawHeaders })
        },
        error: (err: Error) => {
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

export function detectMappedColumns(
  mappedRows: Record<string, unknown>[],
  allTargetKeys: string[]
): string[] {
  return allTargetKeys.filter(k => mappedRows.some(r => k in r))
}

// [Z.P1.7] Similitud simple entre dos strings normalizados (para sugerencias de mapeo).
export function similarity(a: string, b: string): number {
  const na = normalizeStr(a)
  const nb = normalizeStr(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.includes(nb) || nb.includes(na)) return 0.8
  const ta = new Set(na.split(' ').filter(Boolean))
  const tb = new Set(nb.split(' ').filter(Boolean))
  if (ta.size === 0 || tb.size === 0) return 0
  const inter = [...ta].filter((x) => tb.has(x)).length
  const union = new Set([...ta, ...tb]).size
  return union === 0 ? 0 : inter / union
}

// [Z.P1.7] Para cada key faltante, encontrar los top-3 headers no reconocidos más similares.
// [Z.P1.7.1] Si ningún header tiene similitud > 0, devolver los primeros 2 unrecognized como
// candidatos débiles para que la UI siempre pueda ofrecer una propuesta al usuario.
export function buildMissingSuggestions(
  missingKeys: string[],
  unrecognizedHeaders: string[],
  mappings: Record<string, string[]>,
): Array<{ missingKey: string; candidateHeaders: string[]; acceptedAliases: string[] }> {
  const out: Array<{ missingKey: string; candidateHeaders: string[]; acceptedAliases: string[] }> = []
  for (const key of missingKeys) {
    const aliases = mappings[key] ?? []
    const scored: Array<{ header: string; score: number }> = []
    for (const h of unrecognizedHeaders) {
      let best = 0
      for (const a of aliases) {
        const s = similarity(h, a)
        if (s > best) best = s
      }
      scored.push({ header: h, score: best })
    }
    scored.sort((x, y) => y.score - x.score)
    const withScore = scored.filter((x) => x.score > 0)
    const candidateHeaders = withScore.length > 0
      ? withScore.slice(0, 3).map((x) => x.header)
      : scored.slice(0, 2).map((x) => x.header)
    out.push({
      missingKey: key,
      candidateHeaders,
      acceptedAliases: aliases.slice(0, 5),
    })
  }
  return out
}

export function detectIgnoredColumns(
  rawHeaders: string[],
  mappings: Record<string, string[]>
): string[] {
  if (!Array.isArray(rawHeaders) || rawHeaders.length === 0) return []
  const allAliasesNormalized = new Set<string>()
  for (const aliases of Object.values(mappings)) {
    for (const a of aliases) allAliasesNormalized.add(normalizeStr(a))
  }
  const ignored: string[] = []
  for (const h of rawHeaders) {
    if (h === undefined || h === null || String(h).trim() === '') continue
    if (!allAliasesNormalized.has(normalizeStr(String(h)))) {
      ignored.push(String(h))
    }
  }
  return ignored
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

export function zodErrorToSpanish(mapped: Record<string, unknown>, issues: z.ZodIssue[]): string {
  const parts: string[] = []
  for (const issue of issues) {
    const field = issue.path[0] as string | undefined
    const issueAny = issue as any
    // [Z.P2.1] Los .refine() emiten code 'custom' con el mensaje original
    if (issueAny.code === 'custom') {
      parts.push(issue.message || 'Validación personalizada falló')
      continue
    }
    if (!field) continue
    const value = mapped[field]
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

// ─── DETECCIÓN DE CONVENCIÓN DE FECHA ────────────────────────────────────────

// [Z.P2.1] Detecta convención de fecha string cuando es separada por '/' o '-' y el formato es ambiguo.
export function detectDateConvention(samples: unknown[]): {
  convention: 'dmy' | 'mdy' | 'ymd' | 'unknown'
  ambiguous: boolean
  evidence: string
} {
  const strSamples = samples
    .map((s) => (s instanceof Date ? '' : String(s ?? '').trim()))
    .filter((s) => s.length > 0)
  if (strSamples.length === 0) return { convention: 'unknown', ambiguous: false, evidence: 'sin muestras string' }

  if (strSamples.every((s) => /^\d{4}-\d{1,2}-\d{1,2}/.test(s))) {
    return { convention: 'ymd', ambiguous: false, evidence: 'formato ISO YYYY-MM-DD' }
  }

  const pairs: Array<[number, number]> = []
  for (const s of strSamples) {
    const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-]\d{2,4}/)
    if (m) pairs.push([parseInt(m[1], 10), parseInt(m[2], 10)])
  }
  if (pairs.length === 0) return { convention: 'unknown', ambiguous: false, evidence: 'sin patrón reconocible' }

  const firstOver12 = pairs.some(([a]) => a > 12)
  const secondOver12 = pairs.some(([, b]) => b > 12)

  if (firstOver12 && !secondOver12) return { convention: 'dmy', ambiguous: false, evidence: 'primer componente > 12 en algunas filas' }
  if (!firstOver12 && secondOver12) return { convention: 'mdy', ambiguous: false, evidence: 'segundo componente > 12 en algunas filas' }
  if (firstOver12 && secondOver12) return { convention: 'unknown', ambiguous: true, evidence: 'ambos componentes superan 12: fechas inválidas' }
  return { convention: 'dmy', ambiguous: true, evidence: 'ambos componentes ≤ 12 en todas las filas (asumiendo DMY por defecto)' }
}

// [Z.P2.1] Parsea una fecha con convención conocida
export function parseDateWithConvention(val: unknown, convention: string): Date | null {
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val
  if (val === null || val === undefined) return null
  const s = String(val).trim()
  if (s === '') return null

  // [Z.P1.5/BUG-3] Tolerar "MDY", "DMY", "ISO", "YMD" en mayúsculas.
  const conv = typeof convention === 'string' ? convention.toLowerCase() : convention

  // Excel serial number
  const num = Number(s)
  if (!isNaN(num) && num > 36526 && num < 73050) {
    const excelEpoch = new Date(Date.UTC(1899, 11, 30))
    return new Date(excelEpoch.getTime() + num * 86400000)
  }

  // ISO: YYYY-MM-DD con validación round-trip (anti-BUG-1)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const month = parseInt(iso[2], 10)
    const day = parseInt(iso[3], 10)
    const d2 = new Date(y, month - 1, day)
    if (
      isNaN(d2.getTime()) ||
      d2.getFullYear() !== y ||
      d2.getMonth() !== month - 1 ||
      d2.getDate() !== day
    ) {
      return null
    }
    return d2
  }

  // DMY/MDY: dd/mm/yyyy o mm/dd/yyyy con validación round-trip
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
  if (m) {
    const a = parseInt(m[1], 10)
    const b = parseInt(m[2], 10)
    let y = parseInt(m[3], 10)
    if (y < 100) y += 2000
    let day: number, month: number
    if (conv === 'mdy') { month = a; day = b }
    else { day = a; month = b }
    const d2 = new Date(y, month - 1, day)
    if (isNaN(d2.getTime()) || d2.getFullYear() !== y || d2.getMonth() !== month - 1 || d2.getDate() !== day) return null
    return d2
  }

  // [Z.P1.8] Fallback: delegar a parseDateCell (maneja "Mes-AA", "Enero 2026",
  // "1-Mar-2026", ISO, DD/MM, etc. con round-trip y nombres de mes ES/EN).
  return parseDateCell(s)
}

// [Z.P1.8] Parser robusto de fecha que entiende formatos corporativos comunes:
//   "Mar-26", "Ene-26", "Enero 2026", "1-Mar-2026", "2026-03", "15/03/2026"
// Retorna null si no puede interpretar.
export function parseDateCell(raw: unknown): Date | null {
  if (raw === null || raw === undefined) return null
  if (raw instanceof Date) return isNaN(raw.getTime()) ? null : raw
  const s = String(raw).trim()
  if (!s) return null

  const nameRe = '[A-Za-zñÑáéíóúÁÉÍÓÚ\\.]{3,12}'

  // 1) "Mes-AA" / "Mes AA" / "Mes.AA" (Ene-26, Mar 26, Dic.26)
  const mYY = s.match(new RegExp('^(' + nameRe + ')[\\s\\-\\/\\.]+(\\d{2}|\\d{4})$'))
  if (mYY) {
    const m = parseMonthNum(mYY[1].replace(/\.$/, ''))
    if (m) {
      let y = parseInt(mYY[2], 10)
      if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y
      return new Date(y, m - 1, 1)
    }
  }

  // 2) "AAAA-MM" / "AAAA/MM" (año-mes sin día)
  const yMonth = s.match(/^(\d{4})[\-\/](\d{1,2})$/)
  if (yMonth) {
    const y = parseInt(yMonth[1], 10)
    const m = parseInt(yMonth[2], 10)
    if (m >= 1 && m <= 12) return new Date(y, m - 1, 1)
  }

  // 3) "Mes AAAA" ("Enero 2026", "March 2026")
  const mYYYY = s.match(new RegExp('^(' + nameRe + ')[\\s\\-\\/]+(\\d{4})$'))
  if (mYYYY) {
    const m = parseMonthNum(mYYYY[1].replace(/\.$/, ''))
    if (m) return new Date(parseInt(mYYYY[2], 10), m - 1, 1)
  }

  // 4) "D-Mes-AAAA" / "D Mes AAAA" ("1-Mar-2026", "15 Enero 2026")
  const dMY = s.match(new RegExp('^(\\d{1,2})[\\s\\-\\/]+(' + nameRe + ')[\\s\\-\\/]+(\\d{2,4})$'))
  if (dMY) {
    const m = parseMonthNum(dMY[2].replace(/\.$/, ''))
    if (m) {
      let y = parseInt(dMY[3], 10)
      if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y
      const d = parseInt(dMY[1], 10)
      const dt = new Date(y, m - 1, d)
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
    }
  }

  // 5) ISO AAAA-MM-DD (con round-trip)
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = parseInt(iso[1], 10)
    const m = parseInt(iso[2], 10)
    const d = parseInt(iso[3], 10)
    const dt = new Date(y, m - 1, d)
    if (!isNaN(dt.getTime()) && dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
  }

  // 6) DD/MM/AAAA default LATAM; si p1>12 y p2<=12 voltear a MM/DD
  const ddmm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/)
  if (ddmm) {
    let d = parseInt(ddmm[1], 10)
    let m = parseInt(ddmm[2], 10)
    let y = parseInt(ddmm[3], 10)
    if (y < 100) y = y >= 70 ? 1900 + y : 2000 + y
    if (m > 12 && d <= 12) { const t = d; d = m; m = t }
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const dt = new Date(y, m - 1, d)
      if (dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d) return dt
    }
  }

  // 7) Fallback: Date nativo (anglo "Mar 15 2026" etc.)
  const native = new Date(s)
  return isNaN(native.getTime()) ? null : native
}

// ─── PARSERS PÚBLICOS ─────────────────────────────────────────────────────────

/**
 * [Z.P1.10.b.1] Wrapper público sin override — comportamiento idéntico al histórico.
 * Delega a parseSalesFileWithOverride con override vacío para compartir un solo código.
 */
export async function parseSalesFile(file: File): Promise<ParseResult<SaleRecord>> {
  return parseSalesFileWithOverride(file, {})
}

/**
 * [Z.P1.10.b.1] Variante del parser que acepta un override del mapeo automático.
 *
 * - `override.fecha = 'COL_X'` → fuerza fecha ← COL_X
 * - `override.vendedor = null` → ignora explícitamente vendedor
 * - `override.xxx = undefined` (o key ausente) → detección automática
 *
 * Si un override apunta a un header que no existe en el archivo, se emite un warning
 * `OVERRIDE_HEADER_NOT_FOUND` y se cae a la detección automática para ese campo.
 *
 * El resto del pipeline (validación de obligatoriedad, derivación silenciosa de costo,
 * regla COSTO_SIN_PRODUCTO, validación zod, telemetría) opera idéntico al path sin
 * override.
 */
export async function parseSalesFileWithOverride(
  file: File,
  override: import('../types').MappingOverride
): Promise<ParseResult<SaleRecord>> {
  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  // [Z.P1.10.b.1] Construir mappings efectivos respetando override (si hay).
  const { mappings: effectiveMappings, warnings: overrideWarnings } =
    buildEffectiveMappings(SALES_MAPPINGS, override, rawHeaders)

  const mappedRows = rows.map((row) => mapRow(row, effectiveMappings))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(effectiveMappings))
  const ignoredColumns = detectIgnoredColumns(rawHeaders, effectiveMappings)
  if (import.meta.env.DEV && ignoredColumns.length > 0) {
    console.debug('[Z.ignored] sales', { count: ignoredColumns.length, columns: ignoredColumns })
  }

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

  // [Z.P1.1] Nueva regla: solo fecha obligatoria; al menos 1 entre {unidades, venta_neta}; al menos 1 dimensión.
  const requiredError = buildObligatoriedadParseError('sales', foundKeys, ignoredColumns)
  if (requiredError) {
    if (import.meta.env.DEV) {
      console.debug('[PR-M1] ingest_summary', {
        filas_total: 0,
        razon: 'excel_rechazado_por_columnas_requeridas',
        missing: requiredError.code === 'MISSING_REQUIRED' ? requiredError.missing : [],
      })
    }
    return { success: false, error: requiredError }
  }

  // [Z.P1.9.2] Regla: costo_unitario solo es válido con columna producto.
  // Si hay costo pero no producto, se descarta y emitimos warning.
  const warnings: Array<{ code: string; message: string; field?: string }> = [...overrideWarnings]
  if (foundKeys.includes('costo_unitario') && !foundKeys.includes('producto')) {
    // Recuperar el header original que matcheó (en mappings efectivos, no SALES_MAPPINGS)
    const costoSources = effectiveMappings.costo_unitario ?? []
    const headerOriginal =
      rawHeaders.find((h) =>
        costoSources.some((a) => normalizeStr(a) === normalizeStr(h))
      ) ?? 'costo'
    warnings.push({
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

  // [Z.P2.1] Detectar convención de fecha (sample hasta 50) y reparsear filas con ella
  const fechaSample = mappedRows.slice(0, 50).map((r) => r.fecha).filter((f) => f !== undefined && f !== null)
  const dateConv = detectDateConvention(fechaSample)
  if (import.meta.env.DEV) {
    console.debug('[Z.P2.1] date_convention', dateConv)
  }
  const fechaValues = mappedRows.slice(0, 10).map((r) => r.fecha).filter(Boolean)
  const validDates = fechaValues
    .map((f) => parseDateWithConvention(f, dateConv.convention))
    .filter((d): d is Date => d !== null && d.getFullYear() > 2000)

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

  // [Z.P2.1] Reparsear fechas no-Date con la convención detectada para homogenizar
  if (dateConv.convention !== 'unknown') {
    for (const row of mappedRows) {
      if (row.fecha !== undefined && row.fecha !== null && !(row.fecha instanceof Date)) {
        const parsed = parseDateWithConvention(row.fecha, dateConv.convention)
        if (parsed) row.fecha = parsed
      }
    }
  }

  const data: SaleRecord[] = []
  const discardedRows: DiscardedRow[] = []
  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const r = saleSchema.safeParse(mapped)
    if (r.success) {
      // clientKey = nombre_cliente?.trim().toUpperCase() || null
      // (codigo_cliente fue eliminado del schema; clientKey ahora es solo
      // canonicalización por nombre).
      const rec = r.data as SaleRecord
      const nombre = typeof rec.cliente === 'string' ? rec.cliente.trim() : ''
      rec.clientKey = nombre !== '' ? nombre.toUpperCase() : null
      data.push(rec)
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

  // [PR-M1] telemetría de ingesta dual — emisor centralizado (fuente única)
  emitIngestSummary(data)

  // [Z.P1.10.b.1] Trace de mapeo: qué header crudo se asignó a qué campo canónico
  const mapping = computeMappingTrace(rawHeaders, effectiveMappings) as Partial<Record<import('../types').CanonicalField, string>>

  return {
    success: true,
    data,
    columns: foundKeys,
    sheetName,
    discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
    ignoredColumns: ignoredColumns.length > 0 ? ignoredColumns : undefined,
    // [P2] Emitir siempre que convención sea dmy/mdy. Ver fileParseWorker.ts.
    dateAmbiguity: (dateConv.convention === 'dmy' || dateConv.convention === 'mdy')
      ? { convention: dateConv.convention, evidence: dateConv.evidence, ambiguous: dateConv.ambiguous }
      : undefined,
    warnings: warnings.length > 0 ? warnings : undefined,
    mapping,
  }
}

export async function parseMetasFile(
  file: File,
  options?: { forceTipoMeta?: 'unidades' | 'venta_neta' },
): Promise<ParseResult<MetaRecord>> {
  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  // [1.6.1] Override del usuario tras modal de desambiguación tiene prioridad
  // sobre el auto-detect basado en header.
  const tipo_meta = options?.forceTipoMeta ?? detectTipoMeta(rawHeaders)
  const mappedRows = rows.map((row) => mapRow(row, META_MAPPINGS))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(META_MAPPINGS))
  const ignoredColumns = detectIgnoredColumns(rawHeaders, META_MAPPINGS)
  if (import.meta.env.DEV && ignoredColumns.length > 0) {
    console.debug('[Z.ignored] metas', { count: ignoredColumns.length, columns: ignoredColumns })
  }

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

  // [Z.P1.3] Aceptar mes_periodo O mes como fuente de período
  const requiredError = buildObligatoriedadParseError('metas', foundKeys, ignoredColumns)
  if (requiredError) return { success: false, error: requiredError }

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

    // [Z.P1.3] Nueva rama: columna `mes` numérica aislada (sin mes_periodo o si falló)
    if (mes === null && mapped.mes !== undefined) {
      mes = parseMonthNum(mapped.mes)
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
      mes, anio,
      ...(tipo_meta === 'venta_neta' ? { meta_usd: meta } : { meta_uds: meta }),
      meta, tipo_meta, // keep for backward compat
    }
    for (const key of getDimensionKeys('metas')) {
      if (mapped[key] !== undefined) (record as unknown as Record<string, unknown>)[key] = String(mapped[key])
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
    columns: Array.from(new Set(foundKeys.filter((k) => k !== 'mes_periodo' && k !== 'anio' && k !== 'mes').concat(['mes', 'anio']))),
    sheetName,
    discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
    ignoredColumns: ignoredColumns.length > 0 ? ignoredColumns : undefined,
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
  const ignoredColumns = detectIgnoredColumns(rawHeaders, INVENTORY_MAPPINGS)
  if (import.meta.env.DEV && ignoredColumns.length > 0) {
    console.debug('[Z.ignored] inventory', { count: ignoredColumns.length, columns: ignoredColumns })
  }

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

  // [schema-cleanup] inventario ahora requiere fecha (snapshot date) además de
  // producto y unidades — alineado con TABLE_REGISTRY.inventory.obligatoriedad.
  const requiredError = buildObligatoriedadParseError('inventory', foundKeys, ignoredColumns)
  if (requiredError) return { success: false, error: requiredError }

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

  return {
    success: true,
    data,
    columns: foundKeys,
    sheetName,
    discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
    ignoredColumns: ignoredColumns.length > 0 ? ignoredColumns : undefined,
  }
}

/**
 * [Sprint F.2] Parser genérico para cualquier tabla declarada en TABLE_REGISTRY.
 * Usa los `mappings`, `obligatoriedad`, `schema` y opcional `postProcessRow`
 * de la entrada del registry. Reemplaza el patrón parseSalesFile/parseMetasFile/
 * parseInventoryFile per-tabla, excepto cuando `hasCustomParser=true` (caso
 * `metas` con su decomposición mes_periodo↔mes+anio): en ese caso delega.
 *
 * Agregar tabla nueva = solo declarar entrada en TABLE_REGISTRY con
 * `mappings`, `schema` y opcional `postProcessRow`. Sin escribir parseXFile.
 */
export async function parseFileForTable<T = Record<string, unknown>>(
  tableId: TableId,
  file: File,
): Promise<ParseResult<T>> {
  const def = TABLE_REGISTRY[tableId]
  if (!def) {
    return {
      success: false,
      error: { code: 'UNKNOWN', message: `Tabla '${tableId}' no está declarada en TABLE_REGISTRY.` },
    }
  }

  // Tablas con parser custom (metas) delegan al parser específico.
  if (def.hasCustomParser) {
    if (tableId === 'metas') return parseMetasFile(file) as unknown as ParseResult<T>
    return {
      success: false,
      error: { code: 'UNKNOWN', message: `Tabla '${tableId}' marca hasCustomParser pero no hay parser registrado.` },
    }
  }

  const raw = await readFileDataWithMeta(file)
  if ('code' in raw) return { success: false, error: raw as ParseError }

  const { rows, rawHeaders, sheetName } = raw
  if (rows.length === 0) {
    return { success: false, error: { code: 'EMPTY_FILE', message: 'El archivo no contiene filas de datos.' } }
  }

  // Cast: `as const` hace mappings readonly, pero mapRow/detectIgnoredColumns
  // esperan Record<string, string[]>. Sin mutación efectiva acá.
  const mappings = def.mappings as Record<string, string[]>
  // Coerción type-aware desde el registry: cualquier field con valueType='number'
  // se intenta parsear como número, sin necesitar lista hardcoded en mapRow.
  // Esto hace que agregar 'precio' (o cualquier nuevo field numérico) funcione
  // automáticamente sin modificar mapRow.
  const numericFields = Object.values(def.fields)
    .filter((f) => f.valueType === 'number')
    .map((f) => f.key)
  const coerceTypes = (mapped: Record<string, unknown>): Record<string, unknown> => {
    for (const k of numericFields) {
      if (typeof mapped[k] === 'string') {
        const n = parseNumericCell(mapped[k])
        if (n !== null) mapped[k] = n
      }
    }
    return mapped
  }
  const mappedRows = rows.map((row) => coerceTypes(mapRow(row, mappings)))
  const foundKeys = detectMappedColumns(mappedRows, Object.keys(mappings))
  const ignoredColumns = detectIgnoredColumns(rawHeaders, mappings)
  if (import.meta.env.DEV && ignoredColumns.length > 0) {
    console.debug(`[Z.ignored] ${tableId}`, { count: ignoredColumns.length, columns: ignoredColumns })
  }

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

  // Obligatoriedad declarativa desde el registry — funciona para cualquier tabla.
  const requiredError = buildObligatoriedadParseError(tableId, foundKeys, ignoredColumns)
  if (requiredError) return { success: false, error: requiredError }

  if (!def.schema) {
    return {
      success: false,
      error: { code: 'UNKNOWN', message: `Tabla '${tableId}' no tiene schema declarado.` },
    }
  }
  const schema = def.schema as { safeParse: (input: unknown) => { success: boolean; data?: unknown; error?: { issues: unknown[] } } }

  const data: T[] = []
  const discardedRows: DiscardedRow[] = []
  for (let i = 0; i < mappedRows.length; i++) {
    const mapped = mappedRows[i]
    const result = schema.safeParse(mapped)
    if (result.success) {
      const validated = result.data as Record<string, unknown>
      const final = def.postProcessRow ? def.postProcessRow(validated) : validated
      data.push(final as T)
    } else {
      discardedRows.push({
        rowNumber: i + 2,
        rawData: Object.fromEntries(Object.entries(rows[i]).map(([k, v]) => [k, String(v ?? '')])),
        reason: zodErrorToSpanish(mapped, (result.error?.issues ?? []) as never),
      })
    }
  }

  if (data.length === 0) {
    return {
      success: false,
      error: { code: 'EMPTY_FILE', message: 'Columnas encontradas pero ninguna fila pudo procesarse. Verifica que los tipos coincidan.' },
    }
  }

  return {
    success: true,
    data,
    columns: foundKeys,
    sheetName,
    discardedRows: discardedRows.length > 0 ? discardedRows : undefined,
    ignoredColumns: ignoredColumns.length > 0 ? ignoredColumns : undefined,
  }
}

export async function parseRawFile(file: File): Promise<Record<string, unknown>[]> {
  return readFileData(file)
}

// ─── PARSERS EN WEB WORKER (no bloquean el hilo principal) ───────────────────
// Usados por UploadPage para archivos grandes (300K-900K filas).
// Reportan progreso granular vía onProgress.

type ParseProgress = (percent: number, detail: string) => void

function runParseWorker<T>(
  type: 'sales' | 'metas' | 'inventory',
  file: File,
  onProgress: ParseProgress,
  override?: import('../types').MappingOverride,
): Promise<ParseResult<T>> {
  return new Promise(async (resolve) => {
    onProgress(0, 'Leyendo archivo...')
    let buffer: ArrayBuffer
    try {
      buffer = await file.arrayBuffer()
    } catch (err) {
      resolve({ success: false, error: { code: 'UNKNOWN', message: `No se pudo leer el archivo: ${String((err as Error)?.message ?? err)}` } })
      return
    }

    const worker = new Worker(
      new URL('./fileParseWorker.ts', import.meta.url),
      { type: 'module' },
    )

    let settled = false
    const finish = (r: ParseResult<T>) => {
      if (settled) return
      settled = true
      worker.terminate()
      resolve(r)
    }

    worker.onmessage = (event) => {
      const msg = event.data as
        | { type: 'progress'; percent: number; detail: string }
        | { type: 'result'; success: boolean; data?: unknown[]; columns?: string[]; sheetName?: string; discardedRows?: DiscardedRow[]; ignoredColumns?: string[]; dateAmbiguity?: { convention: 'dmy' | 'mdy' | 'ymd' | 'unknown'; evidence: string; ambiguous: boolean }; warnings?: Array<{ code: string; message: string; field?: string }>; mapping?: Record<string, string>; error?: ParseError; tipoMeta?: string }
      if (msg.type === 'progress') {
        onProgress(msg.percent, msg.detail)
        return
      }
      if (msg.type === 'result') {
        if (msg.success) {
          finish({
            success: true,
            data: msg.data as T[],
            columns: msg.columns as string[],
            sheetName: msg.sheetName,
            discardedRows: msg.discardedRows,
            ignoredColumns: msg.ignoredColumns,
            dateAmbiguity: msg.dateAmbiguity,
            warnings: msg.warnings,
            mapping: msg.mapping as Partial<Record<import('../types').CanonicalField, string>> | undefined,
          })
        } else {
          finish({ success: false, error: msg.error as ParseError })
        }
      }
    }

    worker.onerror = (err) => {
      finish({
        success: false,
        error: { code: 'UNKNOWN', message: `Error en el Worker: ${err.message ?? 'desconocido'}` },
      })
    }

    // Transferir el buffer (zero-copy, no structured clone)
    worker.postMessage({ type, buffer, fileName: file.name, override }, [buffer])
  })
}

export function parseSalesFileInWorker(
  file: File,
  onProgress: ParseProgress,
  override?: import('../types').MappingOverride,
): Promise<ParseResult<SaleRecord>> {
  return runParseWorker<SaleRecord>('sales', file, onProgress, override)
}

export function parseMetasFileInWorker(
  file: File,
  onProgress: ParseProgress,
): Promise<ParseResult<MetaRecord>> {
  return runParseWorker<MetaRecord>('metas', file, onProgress)
}

export function parseInventoryFileInWorker(
  file: File,
  onProgress: ParseProgress,
): Promise<ParseResult<InventoryItem>> {
  return runParseWorker<InventoryItem>('inventory', file, onProgress)
}

// ─── DETECTAR DISPONIBILIDAD DE DATOS ────────────────────────────────────────

export function detectDataAvailability(sales: SaleRecord[]): Omit<DataAvailability, 'has_metas' | 'has_inventario'> {
  const total = sales.length
  // [PR-M1] has_unidades: ≥80% filas con unidades>0 (métrica obligatoria del negocio)
  const conUnidades = sales.reduce((n, s) => n + (s.unidades > 0 ? 1 : 0), 0)
  const has_unidades   = total > 0 && conUnidades / total >= 0.8
  const has_venta_neta = sales.some((s) => s.venta_neta != null && s.venta_neta > 0)
  return {
    has_producto: sales.some((s) => s.producto != null && s.producto !== ''),
    has_cliente: sales.some((s) => s.cliente != null && s.cliente !== ''),
    has_venta_neta,
    has_categoria: sales.some((s) => s.categoria != null && s.categoria !== ''),
    has_canal: sales.some((s) => s.canal != null && s.canal !== ''),
    has_supervisor: sales.some((s) => s.supervisor != null && s.supervisor !== ''),
    has_departamento: sales.some((s) => s.departamento != null && s.departamento !== ''),
    has_unidades,
    has_precio_unitario: has_unidades && has_venta_neta,
    // [schema-cleanup] flags de columnas opcionales nuevas.
    has_subcategoria: sales.some((s) => s.subcategoria != null && s.subcategoria !== ''),
    has_proveedor: sales.some((s) => s.proveedor != null && s.proveedor !== ''),
    has_costo_unitario: sales.some((s) => s.costo_unitario != null && s.costo_unitario > 0),
  }
}
