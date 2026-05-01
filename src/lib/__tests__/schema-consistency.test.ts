import { describe, expect, it } from 'vitest'
import { buildSaleIndex } from '../analysis'
import { detectDataAvailability, parseInventoryFile, parseMetasFile } from '../fileParser'
import { findMetaDimsMissingFromSales, selectSalesForMetasValidation } from '../uploadValidation'
import type { SaleRecord } from '../../types'

function csvFile(contents: string, name: string): File {
  return new File([contents], name, { type: 'text/csv' })
}

describe('schema consistency', () => {
  it('preserva proveedor al parsear metas', async () => {
    const result = await parseMetasFile(csvFile(
      'mes_periodo,proveedor,meta\n2026-03,SIGMA,1200\n',
      'metas.csv',
    ))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]).toMatchObject({
      mes: 3,
      anio: 2026,
      proveedor: 'SIGMA',
      meta: 1200,
    })
    expect(result.columns).toContain('proveedor')
  })

  it('acepta metas con mes y anio separados si tienen una dimension', async () => {
    const result = await parseMetasFile(csvFile(
      'mes,anio,vendedor,meta\n3,2026,ANA,1200\n',
      'metas.csv',
    ))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]).toMatchObject({ mes: 3, anio: 2026, vendedor: 'ANA' })
  })

  it('rechaza metas sin dimension estructural', async () => {
    const result = await parseMetasFile(csvFile(
      'mes_periodo,meta\n2026-03,1200\n',
      'metas.csv',
    ))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('metas without dimensions should fail')
    const error = (result as Extract<typeof result, { success: false }>).error
    expect(error.code).toBe('MISSING_REQUIRED')
    if (error.code === 'MISSING_REQUIRED') {
      expect(error.missing.some((m) => m.includes('vendedor'))).toBe(true)
    }
  })

  it('requiere fecha en inventario', async () => {
    const result = await parseInventoryFile(csvFile(
      'producto,unidades,categoria\nACEITE CORONA 1L,20,ALIMENTOS\n',
      'inventario.csv',
    ))

    expect(result.success).toBe(false)
    if (result.success) throw new Error('inventory without fecha should fail')
    const error = (result as Extract<typeof result, { success: false }>).error
    expect(error.code).toBe('MISSING_REQUIRED')
    if (error.code === 'MISSING_REQUIRED') {
      expect(error.missing).toContain('fecha')
    }
  })

  it('acepta inventario con fecha y dimensiones nuevas', async () => {
    const result = await parseInventoryFile(csvFile(
      'fecha,producto,unidades,subcategoria,proveedor\n2026-03-15,ACEITE CORONA 1L,20,ACEITES,SIGMA\n',
      'inventario.csv',
    ))

    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]).toMatchObject({
      producto: 'ACEITE CORONA 1L',
      unidades: 20,
      subcategoria: 'ACEITES',
      proveedor: 'SIGMA',
    })
    expect(result.data[0].fecha).toBeInstanceOf(Date)
  })

  it('propaga disponibilidad de proveedor, subcategoria y costo', () => {
    const sales: SaleRecord[] = [
      {
        fecha: new Date(2026, 2, 15),
        vendedor: 'ANA',
        unidades: 10,
        producto: 'ACEITE CORONA 1L',
        venta_neta: 100,
        subcategoria: 'ACEITES',
        proveedor: 'SIGMA',
        costo_unitario: 4,
      },
    ]

    expect(detectDataAvailability(sales)).toMatchObject({
      has_subcategoria: true,
      has_proveedor: true,
      has_costo_unitario: true,
    })

    const index = buildSaleIndex(sales)
    expect(index.has_subcategoria).toBe(true)
    expect(index.has_proveedor).toBe(true)
    expect(index.has_costo_unitario).toBe(true)
  })

  it('valida metas contra ventas cargadas en el wizard antes que contra el store', () => {
    const wizardSales = [{ vendedor: 'ANA', proveedor: 'SIGMA' }]
    const existingSales = [{ vendedor: 'ANA' }]
    const salesForValidation = selectSalesForMetasValidation(wizardSales, existingSales)

    expect(salesForValidation).toBe(wizardSales)
    expect(findMetaDimsMissingFromSales(
      [{ vendedor: 'ANA', proveedor: 'SIGMA' }],
      salesForValidation,
    )).toEqual([])
  })
})

// ─── Sprint B — TableDefinition.fields integrity ────────────────────────────
// Garantiza que el catálogo enriquecido (fields) sea consistente con
// roles/obligatoriedad/mappings. Si alguien agrega un campo a uno solo de
// los lados, el test falla con mensaje útil.
describe('Sprint B — TABLE_REGISTRY.fields integrity', () => {
  it('cada key en roles.{date,metrics,dimensions,attributes} existe como field', async () => {
    const { TABLE_REGISTRY, rolesConsistentWithFields } = await import('../fileParser')
    for (const [tableId, def] of Object.entries(TABLE_REGISTRY)) {
      const result = rolesConsistentWithFields(def.fields, def.roles)
      expect(result, `tabla ${tableId}`).toEqual({ ok: true })
    }
  })

  it('cada field tiene un mapping declarado (parser puede reconocerlo)', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    for (const [tableId, def] of Object.entries(TABLE_REGISTRY)) {
      for (const fieldKey of Object.keys(def.fields)) {
        expect(
          def.mappings[fieldKey],
          `tabla ${tableId} field ${fieldKey} sin mapping`,
        ).toBeDefined()
      }
    }
  })

  it('campos en obligatoriedad.requireAllOf existen como fields', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    for (const [tableId, def] of Object.entries(TABLE_REGISTRY)) {
      const required = def.obligatoriedad?.requireAllOf ?? []
      for (const k of required) {
        expect(
          def.fields[k],
          `tabla ${tableId} requireAllOf incluye '${k}' que no es field`,
        ).toBeDefined()
      }
    }
  })

  it('campos requireAllOf están marcados nullable=false', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    for (const [tableId, def] of Object.entries(TABLE_REGISTRY)) {
      const required = def.obligatoriedad?.requireAllOf ?? []
      for (const k of required) {
        expect(
          def.fields[k]?.nullable,
          `tabla ${tableId} field '${k}' obligatorio pero nullable=true`,
        ).toBe(false)
      }
    }
  })

  it('isUserUpload + displayOrder presentes en todas las tablas', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    const orders = new Set<number>()
    for (const [tableId, def] of Object.entries(TABLE_REGISTRY)) {
      expect(typeof def.isUserUpload, `tabla ${tableId}`).toBe('boolean')
      expect(typeof def.displayOrder, `tabla ${tableId}`).toBe('number')
      orders.add(def.displayOrder)
    }
    // displayOrder único entre user-upload tables
    const userTables = Object.values(TABLE_REGISTRY).filter(t => t.isUserUpload)
    const userOrders = userTables.map(t => t.displayOrder)
    expect(new Set(userOrders).size, 'displayOrder duplicado entre user-upload tables').toBe(userOrders.length)
  })

  it('helper fieldsByRole devuelve keys ordenadas por displayOrder', async () => {
    const { TABLE_REGISTRY, fieldsByRole } = await import('../fileParser')
    const dims = fieldsByRole(TABLE_REGISTRY.sales.fields, 'dimension')
    // Esperamos que vendedor venga antes que proveedor (displayOrder asc)
    const idxVend = dims.indexOf('vendedor')
    const idxProv = dims.indexOf('proveedor')
    expect(idxVend).toBeGreaterThan(-1)
    expect(idxProv).toBeGreaterThan(-1)
    expect(idxVend).toBeLessThan(idxProv)
  })
})

// ─── Sprint C — UI helpers derivados del registry ───────────────────────────
describe('Sprint C — registry-ui helpers', () => {
  it('getUiHeaders devuelve headers con req correcto y orden estable', async () => {
    const { getUiHeaders } = await import('../registry-ui')
    const ventas = getUiHeaders('sales')

    // fecha es required, vendedor no
    const fecha = ventas.find(h => h.col === 'fecha')
    const vend = ventas.find(h => h.col === 'vendedor')
    expect(fecha?.req).toBe(true)
    expect(vend?.req).toBe(false)

    // Orden por displayOrder: fecha(1) antes de vendedor(4) antes de proveedor(12)
    const idxFecha = ventas.findIndex(h => h.col === 'fecha')
    const idxVend = ventas.findIndex(h => h.col === 'vendedor')
    const idxProv = ventas.findIndex(h => h.col === 'proveedor')
    expect(idxFecha).toBeLessThan(idxVend)
    expect(idxVend).toBeLessThan(idxProv)
  })

  it('getTemplateHeaderRow + getTemplateExampleRow tienen mismo length', async () => {
    const { getTemplateHeaderRow, getTemplateExampleRow } = await import('../registry-ui')
    for (const id of ['sales', 'metas', 'inventory'] as const) {
      const headers = getTemplateHeaderRow(id)
      const example = getTemplateExampleRow(id)
      expect(headers.length, `tabla ${id}`).toBe(example.length)
      expect(headers.length).toBeGreaterThan(0)
    }
  })

  it('getAllDateFieldKeys incluye fecha y mes_periodo (no codigo_*)', async () => {
    const { getAllDateFieldKeys } = await import('../registry-ui')
    const keys = getAllDateFieldKeys()
    expect(keys).toContain('fecha')
    expect(keys).toContain('mes_periodo')
    // No deben aparecer columnas no-fecha
    expect(keys).not.toContain('vendedor')
    expect(keys).not.toContain('producto')
  })

  it('getUserUploadTables devuelve todas las tablas user-upload ordenadas', async () => {
    const { getUserUploadTables } = await import('../registry-ui')
    const tables = getUserUploadTables()
    // Test no hardcodea el conteo — verifica orden y primera/última.
    // Si en el futuro se agrega una tabla con isUserUpload=true, este test sigue.
    expect(tables.length).toBeGreaterThanOrEqual(3)
    const orders = tables.map(t => t.def.displayOrder)
    expect(orders).toEqual([...orders].sort((a, b) => a - b))
    expect(tables[0].id).toBe('sales')
    // displayOrder 1 = sales
    expect(tables[0].def.displayOrder).toBe(1)
  })

  it('contexto template excluye alternativas (mes/anio en metas)', async () => {
    const { getUiHeaders, getTemplateHeaderRow, getPreviewExampleRow } = await import('../registry-ui')
    // Metas: en TEMPLATE solo va mes_periodo (canónico)
    const tplHeaders = getTemplateHeaderRow('metas')
    expect(tplHeaders).toContain('mes_periodo')
    expect(tplHeaders).not.toContain('mes')
    expect(tplHeaders).not.toContain('anio')
    // Metas: en PREVIEW van las 3 (informa al usuario que el parser acepta ambas)
    const prevHeaders = getUiHeaders('metas', 'preview').map(h => h.col)
    expect(prevHeaders).toContain('mes_periodo')
    expect(prevHeaders).toContain('mes')
    expect(prevHeaders).toContain('anio')
    // Length de preview row debe match headers de preview
    const prevRow = getPreviewExampleRow('metas')
    expect(prevRow.length).toBe(prevHeaders.length)
  })
})

// ─── Sprint D — Wizard derivado del registry ────────────────────────────────
describe('Sprint D — wizard steps derivados', () => {
  it('getInitialWizardSteps devuelve un paso por tabla user-upload, ordenado', async () => {
    const { getInitialWizardSteps } = await import('../registry-ui')
    const steps = getInitialWizardSteps()

    // Sprint F: ya no hardcodeamos el length. El sistema auto-genera pasos
    // desde el registry; agregar tablas al registry agrega pasos sin tocar tests.
    expect(steps.length).toBeGreaterThanOrEqual(3)
    expect(steps[0].id).toBe('ventas')
    // sales es la única requerida
    expect(steps[0].required).toBe(true)
    // todas tienen status, label y description
    for (const s of steps) {
      expect(s.status).toBe('pending')
      expect(s.label.length).toBeGreaterThan(0)
      expect(s.description.length).toBeGreaterThan(0)
      expect(s.id.length).toBeGreaterThan(0)
    }
    // Pasos en orden ascending por displayOrder (no validamos ids específicos
    // más allá del primero, para que el test escale).
  })

  it('getStepIdToTableIdMap mapea wizard slug a TableId canónico', async () => {
    const { getStepIdToTableIdMap } = await import('../registry-ui')
    const map = getStepIdToTableIdMap()

    // Mappings canónicos que deben estar presentes
    expect(map['ventas']).toBe('sales')
    expect(map['metas']).toBe('metas')
    expect(map['inventario']).toBe('inventory')
    // El conteo refleja el registry, no un literal — escala con tablas futuras
    expect(Object.keys(map).length).toBeGreaterThanOrEqual(3)
  })

  it('cada wizardStepId es único entre tablas user-upload', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    const userTables = Object.values(TABLE_REGISTRY).filter(t => t.isUserUpload)
    const slugs = userTables.map(t => t.wizardStepId)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('wizardRequired refleja la criticidad: sales true, otras false', async () => {
    const { TABLE_REGISTRY } = await import('../fileParser')
    expect(TABLE_REGISTRY.sales.wizardRequired).toBe(true)
    expect(TABLE_REGISTRY.metas.wizardRequired).toBe(false)
    expect(TABLE_REGISTRY.inventory.wizardRequired).toBe(false)
  })
})

// ─── Sprint E — Cross-table rules dispatcher ────────────────────────────────
describe('Sprint E — cross-table rules dispatcher', () => {
  it('dim_consistency detecta dim presente en source ausente en target', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'dim_consistency',
        sourceTable: 'metas',
        targetTable: 'sales',
        severity: 'error',
      },
      {
        metas: [{ vendedor: 'Carlos', cliente: 'ACME', meta: 1000 }],
        sales: [{ vendedor: 'Carlos', fecha: '2026-01-01', unidades: 10 }],
        // sales no tiene cliente → debe fallar
      },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_DIM_MISSING')
    expect(issues[0].details?.missingFromTarget).toEqual(['cliente'])
  })

  it('dim_consistency con requireTargetLoaded bloquea si target vacío', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'dim_consistency',
        sourceTable: 'metas',
        targetTable: 'sales',
        severity: 'error',
        requireTargetLoaded: true,
      },
      { metas: [{ vendedor: 'X', meta: 100 }], sales: [] },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_TARGET_NOT_LOADED')
  })

  it('membership detecta valores de source ausentes en target', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'membership',
        sourceTable: 'inventory',
        sourceField: 'producto',
        targetTable: 'sales',
        targetField: 'producto',
        severity: 'warning',
      },
      {
        inventory: [
          { producto: 'Yogurt', unidades: 50 },
          { producto: 'ProductoFantasma', unidades: 10 },
        ],
        sales: [{ producto: 'Yogurt', unidades: 5 }],
      },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_MEMBERSHIP_VIOLATION')
    expect(issues[0].details?.orphans).toEqual(['ProductoFantasma'])
  })

  it('range_overlap mode=within detecta source fuera de rango target', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'range_overlap',
        sourceTable: 'metas',
        sourceField: 'mes_periodo',
        targetTable: 'sales',
        targetField: 'fecha',
        severity: 'warning',
        mode: 'within',
      },
      {
        // metas: enero 2026 a junio 2026
        metas: [{ mes_periodo: '2026-01-01' }, { mes_periodo: '2026-06-30' }],
        // sales: solo febrero a marzo 2026 → metas se extiende fuera
        sales: [{ fecha: '2026-02-01' }, { fecha: '2026-03-15' }],
      },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_RANGE_OUT_OF_BOUNDS')
  })

  it('range_overlap mode=intersect pasa si hay solapamiento', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'range_overlap',
        sourceTable: 'metas',
        sourceField: 'mes_periodo',
        targetTable: 'sales',
        targetField: 'fecha',
        severity: 'warning',
        mode: 'intersect',
      },
      {
        // metas extends beyond sales pero hay solapamiento (febrero-marzo)
        metas: [{ mes_periodo: '2026-01-01' }, { mes_periodo: '2026-06-30' }],
        sales: [{ fecha: '2026-02-01' }, { fecha: '2026-03-15' }],
      },
    )
    expect(issues.length).toBe(0)
  })

  it('range_overlap mode=intersect detecta ranges disjuntos', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    const issues = evaluateCrossTableRule(
      {
        type: 'range_overlap',
        sourceTable: 'metas',
        sourceField: 'mes_periodo',
        targetTable: 'sales',
        targetField: 'fecha',
        severity: 'warning',
        mode: 'intersect',
      },
      {
        metas: [{ mes_periodo: '2025-01-01' }, { mes_periodo: '2025-06-30' }],
        sales: [{ fecha: '2026-02-01' }, { fecha: '2026-03-15' }],
      },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_RANGE_NO_OVERLAP')
  })

  it('custom validator delega a la función registrada', async () => {
    const { evaluateCrossTableRule, registerCrossTableValidator, _resetCustomValidators } =
      await import('../uploadValidation')
    _resetCustomValidators()
    registerCrossTableValidator('test_high_volume', (rule, data) => {
      const total = (data.sales ?? []).reduce(
        (s, r) => s + (typeof r.unidades === 'number' ? r.unidades : 0),
        0,
      )
      const threshold = (rule.params?.threshold as number) ?? 0
      if (total > threshold) {
        return [{ rule, severity: rule.severity, code: 'TEST_HIGH_VOLUME', message: `Total ${total}` }]
      }
      return []
    })
    const issues = evaluateCrossTableRule(
      { type: 'custom', name: 'test_high_volume', severity: 'warning', params: { threshold: 50 } },
      { sales: [{ unidades: 30 }, { unidades: 25 }] },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('TEST_HIGH_VOLUME')
  })

  it('custom validator no encontrado emite warning sin crashear', async () => {
    const { evaluateCrossTableRule, _resetCustomValidators } = await import('../uploadValidation')
    _resetCustomValidators()
    const issues = evaluateCrossTableRule(
      { type: 'custom', name: 'no_existe', severity: 'error' },
      { sales: [] },
    )
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_CUSTOM_VALIDATOR_NOT_FOUND')
  })

  it('evaluateAllRulesForTable corre todas las reglas declaradas en TABLE_REGISTRY', async () => {
    const { evaluateAllRulesForTable } = await import('../uploadValidation')
    // metas tiene 1 regla declarada (dim_consistency contra sales).
    // Sin sales cargadas → debe disparar TARGET_NOT_LOADED.
    const issues = evaluateAllRulesForTable('metas', {
      metas: [{ vendedor: 'X', meta: 100 }],
      sales: [],
    })
    expect(issues.length).toBe(1)
    expect(issues[0].code).toBe('CROSS_TABLE_TARGET_NOT_LOADED')
  })

  it('compat shim findMetaDimsMissingFromSales sigue funcionando con dispatcher', async () => {
    const { findMetaDimsMissingFromSales } = await import('../uploadValidation')
    const missing = findMetaDimsMissingFromSales(
      [{ vendedor: 'Carlos', cliente: 'ACME', meta: 1000 }],
      [{ vendedor: 'Carlos', fecha: '2026-01-01', unidades: 10 }],
    )
    expect(missing).toEqual(['cliente'])
  })

  it('dim_consistency con source vacío no dispara error aunque requireTargetLoaded', async () => {
    const { evaluateCrossTableRule } = await import('../uploadValidation')
    // Edge case: usuario abre el wizard, ninguna tabla cargada. La regla
    // metas→sales con requireTargetLoaded NO debe disparar si metas también
    // está vacía (no hay nada que validar todavía).
    const issues = evaluateCrossTableRule(
      {
        type: 'dim_consistency',
        sourceTable: 'metas',
        targetTable: 'sales',
        severity: 'error',
        requireTargetLoaded: true,
      },
      { metas: [], sales: [] },
    )
    expect(issues.length).toBe(0)
  })
})

// ─── parseFileForTable — sales y metas (genérico) ───────────────────────────
// La tabla 'precios' del Sprint F.2 fue eliminada (decisión de producto).
// Estos tests validan que el parser genérico sigue funcionando para las
// 3 tablas reales del sistema.
describe('parseFileForTable — flujo genérico', () => {
  it('parseFileForTable("sales") aplica postProcessRow con clientKey', async () => {
    const { parseFileForTable } = await import('../fileParser')
    const csv = 'fecha,vendedor,unidades,cliente\n2026-01-01,Carlos,10,Acme S.A.\n'
    const file = new File([csv], 'ventas.csv', { type: 'text/csv' })
    const result = await parseFileForTable('sales', file)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]).toMatchObject({ clientKey: 'ACME S.A.' })
  })

  it('parseFileForTable("metas") delega a parseMetasFile (hasCustomParser)', async () => {
    const { parseFileForTable } = await import('../fileParser')
    const csv = 'mes_periodo,vendedor,meta\n2026-03,ANA,1200\n'
    const file = new File([csv], 'metas.csv', { type: 'text/csv' })
    const result = await parseFileForTable('metas', file)
    expect(result.success).toBe(true)
    if (!result.success) return
    expect(result.data[0]).toMatchObject({ mes: 3, anio: 2026, vendedor: 'ANA', meta: 1200 })
  })

  it('parseFileForTable("inventory") rechaza filas sin columnas obligatorias', async () => {
    const { parseFileForTable } = await import('../fileParser')
    // Falta unidades (obligatorio)
    const csv = 'fecha,producto,categoria\n2026-01-01,Yogurt,Lácteos\n'
    const file = new File([csv], 'inventario.csv', { type: 'text/csv' })
    const result = await parseFileForTable('inventory', file)
    expect(result.success).toBe(false)
    const failure = result as Extract<typeof result, { success: false }>
    expect(failure.error.code).toBe('MISSING_REQUIRED')
  })
})

// ─── Cross-table validation activa en producción ────────────────────────────
// Issue #2 del audit: las relations declaradas en TABLE_REGISTRY no se
// invocaban desde UI. Ahora UploadPage corre evaluateAllRulesForTable
// después de cada parse. Estos tests validan el contrato: las relations
// emiten issues con el código correcto y data válida.
describe('cross-table relations activas', () => {
  it('inventory.relations dispara membership warning para productos huérfanos', async () => {
    const { evaluateAllRulesForTable } = await import('../uploadValidation')
    const issues = evaluateAllRulesForTable('inventory', {
      inventory: [
        { fecha: new Date('2026-01-01'), producto: 'Yogurt', unidades: 10 },
        { fecha: new Date('2026-01-01'), producto: 'ProductoNoVendido', unidades: 5 },
      ],
      sales: [
        { fecha: new Date('2026-01-15'), producto: 'Yogurt', unidades: 3, vendedor: 'X' },
      ],
    })
    const orphan = issues.find(i => i.code === 'CROSS_TABLE_MEMBERSHIP_VIOLATION')
    expect(orphan).toBeDefined()
    expect(orphan?.severity).toBe('warning')
    expect((orphan?.details?.orphans as string[])).toContain('ProductoNoVendido')
  })

  it('metas.relations sigue bloqueando (error severity) cuando dim falta en sales', async () => {
    const { evaluateAllRulesForTable } = await import('../uploadValidation')
    const issues = evaluateAllRulesForTable('metas', {
      metas: [{ vendedor: 'Carlos', cliente: 'ACME', meta: 1000, mes: 3, anio: 2026 }],
      sales: [{ vendedor: 'Carlos', fecha: new Date('2026-03-01'), unidades: 5 }],
    })
    const dimMissing = issues.find(i => i.code === 'CROSS_TABLE_DIM_MISSING')
    expect(dimMissing).toBeDefined()
    expect(dimMissing?.severity).toBe('error')
    expect((dimMissing?.details?.missingFromTarget as string[])).toContain('cliente')
  })

  it('dataset bien-formado: ninguna regla emite issue', async () => {
    const { evaluateAllRulesForTable } = await import('../uploadValidation')
    const sales = [
      { fecha: new Date('2026-01-01'), vendedor: 'Carlos', producto: 'Yogurt', unidades: 5 },
    ]
    expect(evaluateAllRulesForTable('inventory', {
      inventory: [{ fecha: new Date('2026-01-01'), producto: 'Yogurt', unidades: 10 }],
      sales,
    })).toHaveLength(0)
    expect(evaluateAllRulesForTable('metas', {
      metas: [{ vendedor: 'Carlos', meta: 1000, mes: 1, anio: 2026 }],
      sales,
    })).toHaveLength(0)
  })
})

// ─── Sprint D — Pareto-skip para no-monetarios ──────────────────────────────
describe('Sprint D — gate r2 Pareto-skip non-monetary', () => {
  const baseCtx = { ventaTotalNegocio: 100000, paretoList: ['Carlos'], crossCount: 0 }

  it('candidato monetario sobre member no-Pareto sigue fallando r2', async () => {
    const { evaluateInsightCandidate } = await import('../insightStandard')
    const decision = evaluateInsightCandidate(
      {
        insightTypeId: 'change',
        member: 'Pedro',  // NO está en paretoList
        title: 'Pedro cayó 30% YoY este mes',
        description: 'Pedro pasó de $5000 a $3500 en venta neta del período actual.',
        accion: { texto: 'Revisar pipeline de Pedro' },
        metricId: 'venta',
        impacto_usd_normalizado: 1500,
        impacto_usd_source: 'detail_monto',
      },
      baseCtx,
    )
    expect(decision.passes).toBe(false)
    expect(decision.failedRules).toContain('pareto')
  })

  it('candidato no-monetario (skus_activos) sobre member no-Pareto pasa r2', async () => {
    const { evaluateInsightCandidate } = await import('../insightStandard')
    const decision = evaluateInsightCandidate(
      {
        insightTypeId: 'change',
        member: 'Pedro',  // NO está en paretoList USD
        title: 'Pedro vende menos SKUs distintos este mes',
        description: 'Pedro pasó de vender 12 SKUs activos a solo 5 este período.',
        accion: { texto: 'Revisar catálogo trabajado por Pedro' },
        metricId: 'skus_activos',         // ← métrica no-monetaria
        impacto_usd_normalizado: null,
        impacto_usd_source: 'non_monetary',
      },
      baseCtx,
    )
    // r2 (Pareto) ya no falla — se skipea por non_monetary
    expect(decision.rules.pareto).toBe(true)
  })

  it('candidato con source=non_monetary explícito pasa r2 aunque metricId sea monetario', async () => {
    const { evaluateInsightCandidate } = await import('../insightStandard')
    const decision = evaluateInsightCandidate(
      {
        insightTypeId: 'change',
        member: 'Pedro',
        title: 'Insight estructural sobre Pedro',
        description: 'Pedro tiene un patrón estructural relevante.',
        metricId: 'venta',
        impacto_usd_source: 'non_monetary',  // ← marker explícito
      },
      baseCtx,
    )
    expect(decision.rules.pareto).toBe(true)
  })

  it('Z12_NON_MONETARY_METRIC_IDS incluye skus_activos y margen_pct', async () => {
    // Smoke test: añadiste a la lista? (alineación con NON_MONETARY_METRIC_IDS de insight-engine)
    const { evaluateInsightCandidate } = await import('../insightStandard')
    for (const metricId of ['skus_activos', 'margen_pct', 'frecuencia_compra']) {
      const d = evaluateInsightCandidate(
        {
          insightTypeId: 'change',
          member: 'NoPareto',
          title: 'Test material',
          description: 'Test description suficientemente larga para pasar r4.',
          accion: { texto: 'Acción concreta' },
          metricId,
        },
        baseCtx,
      )
      expect(d.rules.pareto, `metric ${metricId} debería skipear pareto`).toBe(true)
    }
  })
})
