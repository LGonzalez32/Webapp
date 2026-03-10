import { FileValidationResult, ValidationIssue } from '../types';

// Column aliases for flexible matching
const INV_COLS = {
  Producto: ['producto', 'product', 'sku', 'nombre', 'name', 'item', 'descripcion', 'description'],
  Stock: ['stock', 'cantidad', 'quantity', 'qty', 'existencias', 'inventario'],
  Categoria: ['categoria', 'category', 'cat', 'grupo', 'group', 'tipo', 'type'],
  Proveedor: ['proveedor', 'supplier', 'provider', 'vendor', 'suplidor'],
  Costo: ['costo', 'cost', 'precio', 'price', 'valor', 'value', 'unitcost', 'unit_cost'],
};

const SALES_COLS = {
  Fecha: ['fecha', 'date', 'periodo', 'period', 'mes', 'month', 'fecha_venta', 'sale_date'],
  Producto: ['producto', 'product', 'sku', 'nombre', 'name', 'item', 'descripcion'],
  Unidades: ['unidades', 'units', 'cantidad', 'quantity', 'qty', 'ventas', 'sales', 'sold'],
};

const LT_COLS = {
  supplier: ['proveedor', 'supplier', 'provider', 'vendor', 'suplidor'],
  leadTimeDays: ['leadtime', 'lead_time', 'dias', 'days', 'plazo', 'tiempo_entrega', 'delivery_days', 'tiempoentrega'],
};

function matchColumn(header: string, aliases: string[]): boolean {
  const norm = header.toLowerCase().replace(/[\s_\-\.]/g, '');
  return aliases.some(a => norm === a.replace(/[\s_\-\.]/g, ''));
}

function detectMapping(headers: string[], colDef: Record<string, string[]>): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const [canonical, aliases] of Object.entries(colDef)) {
    const found = headers.find(h => matchColumn(h, aliases));
    mapping[canonical] = found ?? null;
  }
  return mapping;
}

export function validateInventoryData(rows: any[]): FileValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (rows.length === 0) {
    return {
      isValid: false,
      errors: [{
        type: 'error',
        code: 'EMPTY_FILE',
        message: 'El archivo está vacío o no se pudo leer. Verifica que: (1) los datos estén en la primera hoja del Excel, (2) los encabezados estén en la fila 1, (3) el archivo no esté protegido con contraseña.'
      }],
      warnings: [],
      rowCount: 0,
      validRowCount: 0,
      detectedColumns: [],
    };
  }

  const headers = Object.keys(rows[0]);
  const foundList = headers.length > 0 ? ` Columnas encontradas en tu archivo: "${headers.join('", "')}".` : '';
  const mapping = detectMapping(headers, INV_COLS);
  const detectedColumns = Object.entries(mapping).filter(([, v]) => v !== null).map(([k]) => k);

  // Required columns
  if (!mapping.Producto) errors.push({ type: 'error', code: 'MISSING_COL_PRODUCTO', message: `No se encontró la columna de Producto/SKU.${foundList} Se aceptan nombres como: Producto, SKU, Nombre, Item, Descripcion.` });
  if (!mapping.Stock) errors.push({ type: 'error', code: 'MISSING_COL_STOCK', message: `No se encontró la columna de Stock.${foundList} Se aceptan nombres como: Stock, Cantidad, Qty, Existencias, Inventario.` });

  if (errors.length > 0) {
    return { isValid: false, errors, warnings, rowCount: rows.length, validRowCount: 0, detectedColumns };
  }

  // Optional columns warnings
  if (!mapping.Categoria) warnings.push({ type: 'warning', code: 'MISSING_COL_CATEGORIA', message: 'Columna Categoria no encontrada — se usará "Sin categoría". Para activarla, agrega una columna llamada Categoria, Category o Grupo.' });
  if (!mapping.Proveedor) warnings.push({ type: 'warning', code: 'MISSING_COL_PROVEEDOR', message: 'Columna Proveedor no encontrada — se usará "Sin proveedor". Para activarla, agrega una columna llamada Proveedor, Supplier o Vendor.' });
  if (!mapping.Costo) warnings.push({ type: 'warning', code: 'MISSING_COL_COSTO', message: 'Columna Costo no encontrada — se usará 0. Para activarla, agrega una columna llamada Costo, Precio o Cost.' });

  let validRowCount = 0;
  const missingProductRows: number[] = [];
  const invalidStockRows: number[] = [];
  const negativeStockRows: number[] = [];
  const zeroCostRows: number[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2; // 1-indexed + header
    const producto = mapping.Producto ? row[mapping.Producto] : null;
    const stock = mapping.Stock ? row[mapping.Stock] : null;
    const costo = mapping.Costo ? row[mapping.Costo] : null;

    let rowOk = true;
    if (!producto || String(producto).trim() === '') { missingProductRows.push(rowNum); rowOk = false; }
    if (stock === null || stock === undefined || isNaN(Number(stock))) { invalidStockRows.push(rowNum); rowOk = false; }
    else if (Number(stock) < 0) { negativeStockRows.push(rowNum); }
    if (costo !== null && costo !== undefined && Number(costo) === 0) zeroCostRows.push(rowNum);

    if (rowOk) validRowCount++;
  });

  if (missingProductRows.length > 0) errors.push({ type: 'error', code: 'MISSING_PRODUCT_NAME', message: `${missingProductRows.length} fila(s) sin nombre de producto. Revisa que ninguna celda de la columna Producto esté vacía.`, rows: missingProductRows.slice(0, 5), count: missingProductRows.length });
  if (invalidStockRows.length > 0) errors.push({ type: 'error', code: 'INVALID_STOCK', message: `${invalidStockRows.length} fila(s) con stock inválido o no numérico. Verifica que la columna de Stock solo contenga números (sin texto, sin símbolos como "$" o "%").`, rows: invalidStockRows.slice(0, 5), count: invalidStockRows.length });
  if (negativeStockRows.length > 0) warnings.push({ type: 'warning', code: 'NEGATIVE_STOCK', message: `${negativeStockRows.length} fila(s) con stock negativo — se tratarán como 0.`, rows: negativeStockRows.slice(0, 5), count: negativeStockRows.length });
  if (zeroCostRows.length > 0) warnings.push({ type: 'warning', code: 'ZERO_COST', message: `${zeroCostRows.length} producto(s) con costo = 0. Esto afectará los cálculos de inversión. Revisa si falta capturar el costo unitario.`, rows: zeroCostRows.slice(0, 5), count: zeroCostRows.length });

  return {
    isValid: errors.length === 0 && validRowCount > 0,
    errors,
    warnings,
    rowCount: rows.length,
    validRowCount,
    detectedColumns,
  };
}

export function validateSalesData(rows: any[]): FileValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (rows.length === 0) {
    return {
      isValid: false,
      errors: [{
        type: 'error',
        code: 'EMPTY_FILE',
        message: 'El archivo está vacío o no se pudo leer. Verifica que: (1) los datos estén en la primera hoja del Excel, (2) los encabezados estén en la fila 1, (3) el archivo no esté protegido con contraseña. Descarga la plantilla para ver el formato exacto esperado.'
      }],
      warnings: [],
      rowCount: 0,
      validRowCount: 0,
      detectedColumns: [],
    };
  }

  const headers = Object.keys(rows[0]);
  const foundList = headers.length > 0 ? ` Columnas encontradas en tu archivo: "${headers.join('", "')}".` : '';
  const mapping = detectMapping(headers, SALES_COLS);
  const detectedColumns = Object.entries(mapping).filter(([, v]) => v !== null).map(([k]) => k);

  if (!mapping.Fecha) errors.push({ type: 'error', code: 'MISSING_COL_FECHA', message: `No se encontró la columna de Fecha.${foundList} Se aceptan nombres como: Fecha, Date, Mes, Periodo, Fecha_Venta. Las fechas deben estar en formato YYYY-MM-DD (ej: 2024-01-01) o YYYY-MM.` });
  if (!mapping.Producto) errors.push({ type: 'error', code: 'MISSING_COL_PRODUCTO', message: `No se encontró la columna de Producto.${foundList} Se aceptan nombres como: Producto, SKU, Nombre, Item.` });
  if (!mapping.Unidades) errors.push({ type: 'error', code: 'MISSING_COL_UNIDADES', message: `No se encontró la columna de Unidades vendidas.${foundList} Se aceptan nombres como: Unidades, Units, Cantidad, Qty, Ventas, Sold.` });

  if (errors.length > 0) {
    return { isValid: false, errors, warnings, rowCount: rows.length, validRowCount: 0, detectedColumns };
  }

  let validRowCount = 0;
  const invalidDateRows: number[] = [];
  const invalidUnitsRows: number[] = [];
  const negativeUnitsRows: number[] = [];

  const dates: Date[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const fecha = mapping.Fecha ? row[mapping.Fecha] : null;
    const unidades = mapping.Unidades ? row[mapping.Unidades] : null;

    let rowOk = true;
    const d = new Date(fecha);
    if (!fecha || isNaN(d.getTime())) { invalidDateRows.push(rowNum); rowOk = false; }
    else dates.push(d);
    if (unidades === null || unidades === undefined || isNaN(Number(unidades))) { invalidUnitsRows.push(rowNum); rowOk = false; }
    else if (Number(unidades) < 0) negativeUnitsRows.push(rowNum);

    if (rowOk) validRowCount++;
  });

  if (invalidDateRows.length > 0) errors.push({ type: 'error', code: 'INVALID_DATE', message: `${invalidDateRows.length} fila(s) con fecha inválida. Formato requerido: YYYY-MM-DD (ej: 2024-01-01). Si el archivo es Excel, asegúrate de que las celdas de fecha estén en formato "Texto" o "Fecha corta" — Excel a veces guarda fechas como números seriales.`, rows: invalidDateRows.slice(0, 5), count: invalidDateRows.length });
  if (invalidUnitsRows.length > 0) errors.push({ type: 'error', code: 'INVALID_UNITS', message: `${invalidUnitsRows.length} fila(s) con unidades inválidas o no numéricas. Verifica que la columna de Unidades solo contenga números enteros (sin texto, sin símbolos).`, rows: invalidUnitsRows.slice(0, 5), count: invalidUnitsRows.length });
  if (negativeUnitsRows.length > 0) warnings.push({ type: 'warning', code: 'NEGATIVE_UNITS', message: `${negativeUnitsRows.length} fila(s) con unidades negativas (posibles devoluciones). Se incluirán tal cual en el historial.`, rows: negativeUnitsRows.slice(0, 5), count: negativeUnitsRows.length });

  // Check history depth
  if (dates.length > 0) {
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const monthsDiff = (maxDate.getFullYear() - minDate.getFullYear()) * 12 + (maxDate.getMonth() - minDate.getMonth());
    if (monthsDiff < 3) warnings.push({ type: 'warning', code: 'SHORT_HISTORY', message: `Historial de solo ${monthsDiff} mes(es). Se recomienda mínimo 6 meses de datos para obtener un forecast confiable.` });
    if (monthsDiff >= 6 && monthsDiff < 12) warnings.push({ type: 'warning', code: 'MEDIUM_HISTORY', message: `${monthsDiff} meses de historial detectados. Con 12 meses o más se activan los modelos SARIMA/Ensemble de mayor precisión.` });
  }

  return {
    isValid: errors.length === 0 && validRowCount > 0,
    errors,
    warnings,
    rowCount: rows.length,
    validRowCount,
    detectedColumns,
  };
}

export function validateLeadTimeData(rows: any[]): FileValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];

  if (rows.length === 0) {
    return {
      isValid: false,
      errors: [{
        type: 'error',
        code: 'EMPTY_FILE',
        message: 'El archivo de lead times está vacío o no se pudo leer. Debe tener al menos una fila por proveedor con su tiempo de entrega en días.'
      }],
      warnings: [],
      rowCount: 0,
      validRowCount: 0,
      detectedColumns: [],
    };
  }

  const headers = Object.keys(rows[0]);
  const foundList = headers.length > 0 ? ` Columnas encontradas en tu archivo: "${headers.join('", "')}".` : '';
  const mapping = detectMapping(headers, LT_COLS);
  const detectedColumns = Object.entries(mapping).filter(([, v]) => v !== null).map(([k]) => k);

  if (!mapping.supplier) errors.push({ type: 'error', code: 'MISSING_COL_PROVEEDOR', message: `No se encontró la columna de Proveedor.${foundList} Se aceptan nombres como: Proveedor, Supplier, Vendor.` });
  if (!mapping.leadTimeDays) errors.push({ type: 'error', code: 'MISSING_COL_LEADTIME', message: `No se encontró la columna de Lead Time (días de entrega).${foundList} Se aceptan nombres como: LeadTime, Lead_Time, Dias, Days, Plazo, Tiempo_Entrega.` });

  if (errors.length > 0) {
    return { isValid: false, errors, warnings, rowCount: rows.length, validRowCount: 0, detectedColumns };
  }

  let validRowCount = 0;
  const invalidRows: number[] = [];
  const highLeadTimeRows: number[] = [];

  rows.forEach((row, i) => {
    const rowNum = i + 2;
    const days = mapping.leadTimeDays ? row[mapping.leadTimeDays] : null;
    if (days === null || days === undefined || isNaN(Number(days)) || Number(days) < 0) {
      invalidRows.push(rowNum);
    } else {
      validRowCount++;
      if (Number(days) > 30) highLeadTimeRows.push(rowNum);
    }
  });

  if (invalidRows.length > 0) errors.push({ type: 'error', code: 'INVALID_DAYS', message: `${invalidRows.length} fila(s) con días de entrega inválidos. El valor debe ser un número entero positivo (ej: 7 para una semana).`, rows: invalidRows.slice(0, 5), count: invalidRows.length });
  if (highLeadTimeRows.length > 0) warnings.push({ type: 'warning', code: 'HIGH_LEAD_TIME', message: `${highLeadTimeRows.length} proveedor(es) con lead time mayor a 30 días. Verifica que el valor sea correcto y no sea, por ejemplo, semanas en lugar de días.`, rows: highLeadTimeRows.slice(0, 5), count: highLeadTimeRows.length });

  return {
    isValid: errors.length === 0 && validRowCount > 0,
    errors,
    warnings,
    rowCount: rows.length,
    validRowCount,
    detectedColumns,
  };
}
