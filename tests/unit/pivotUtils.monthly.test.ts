import { describe, it, expect } from 'vitest'
import { buildMonthlyPivotTree, type MonthlyPivotNode } from '../../src/utils/pivotUtils'
import type { SaleRecord } from '../../src/types'

// [Ticket 3.E.3] Tests del builder buildMonthlyPivotTree.

function mk(year: number, month: number, day: number, vendedor: string, canal: string, neta = 100): SaleRecord {
  return {
    fecha: new Date(year, month, day, 12, 0, 0, 0),
    vendedor,
    cliente: 'C1',
    producto: 'P1',
    canal,
    unidades: neta,
    venta_neta: neta,
  } as SaleRecord
}

describe('buildMonthlyPivotTree', () => {
  it('sales vacíos + monthColumns vacío → []', () => {
    const tree = buildMonthlyPivotTree([], ['canal'], [], 'venta_neta', 'root', 0)
    expect(tree).toEqual([])
  })

  it('sales vacíos + monthColumns no vacío → [] (no genera fila Total con ceros)', () => {
    const tree = buildMonthlyPivotTree([], ['canal'], ['2024-01', '2024-02'], 'venta_neta', 'root', 0)
    expect(tree).toEqual([])
  })

  it('1 dim canal, 2 sales en meses distintos → 1 fila root con valuesByCol correctos', () => {
    const sales = [
      mk(2024, 0, 5, 'V1', 'DIRECTO', 100),
      mk(2024, 1, 5, 'V1', 'DIRECTO', 200),
    ]
    const tree = buildMonthlyPivotTree(sales, ['canal'], ['2024-01', '2024-02'], 'venta_neta', 'root', 0)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('DIRECTO')
    expect(tree[0].dim).toBe('canal')
    expect(tree[0].valuesByCol).toEqual([100, 200])
    expect(tree[0].total).toBe(300)
    expect(tree[0].children).toEqual([])
    // ID format compatible con expandedKeys compartido
    expect(tree[0].id).toBe('root::DIRECTO')
  })

  it('2 dims [canal, vendedor]: rollup parent = sum children', () => {
    const sales = [
      mk(2024, 0, 5, 'V1', 'DIRECTO', 100),
      mk(2024, 0, 5, 'V2', 'DIRECTO', 50),
      mk(2024, 1, 5, 'V1', 'DIRECTO', 200),
    ]
    const tree = buildMonthlyPivotTree(sales, ['canal', 'vendedor'], ['2024-01', '2024-02'], 'venta_neta', 'root', 0)
    expect(tree).toHaveLength(1)
    const parent = tree[0]
    expect(parent.label).toBe('DIRECTO')
    expect(parent.children.length).toBe(2)
    // Rollup: parent.valuesByCol[i] = sum(children[*].valuesByCol[i])
    for (let i = 0; i < parent.valuesByCol.length; i++) {
      const childSum = parent.children.reduce((acc, c) => acc + c.valuesByCol[i], 0)
      expect(parent.valuesByCol[i]).toBe(childSum)
    }
    // Rollup total
    const childTotalSum = parent.children.reduce((acc, c) => acc + c.total, 0)
    expect(parent.total).toBe(childTotalSum)
    expect(parent.total).toBe(350)
    // Child IDs siguen patrón
    const childIds = parent.children.map(c => c.id).sort()
    expect(childIds).toEqual(['root::DIRECTO::V1', 'root::DIRECTO::V2'])
  })

  it('dims=[] (sin dimensiones) → fila única label "Total" con agregado', () => {
    const sales = [
      mk(2024, 0, 5, 'V1', 'DIRECTO', 100),
      mk(2024, 1, 5, 'V2', 'TIENDA', 200),
    ]
    const tree = buildMonthlyPivotTree(sales, [], ['2024-01', '2024-02'], 'venta_neta', 'root', 0)
    expect(tree).toHaveLength(1)
    expect(tree[0].label).toBe('Total')
    expect(tree[0].dim).toBe('total')
    expect(tree[0].valuesByCol).toEqual([100, 200])
    expect(tree[0].total).toBe(300)
    expect(tree[0].id).toBe('root::__total__')
  })

  it('sales con fecha fuera de monthColumns son ignorados (no rompen builder)', () => {
    const sales = [
      mk(2024, 0, 5, 'V1', 'DIRECTO', 100),  // dentro
      mk(2025, 5, 5, 'V1', 'DIRECTO', 999),  // fuera del rango monthColumns
    ]
    const tree = buildMonthlyPivotTree(sales, ['canal'], ['2024-01', '2024-02'], 'venta_neta', 'root', 0)
    expect(tree).toHaveLength(1)
    // Solo el sale de 2024-01 contribuye a valuesByCol
    expect(tree[0].valuesByCol).toEqual([100, 0])
    // Pero `total` SÍ incluye sales fuera del rango (es suma de valuesByCol).
    // Como el sale 2025-05 no entró en ningún col, su valor no aparece en total.
    expect(tree[0].total).toBe(100)
  })

  it('métrica unidades suma .unidades en lugar de .venta_neta', () => {
    const sales: SaleRecord[] = [
      { ...mk(2024, 0, 5, 'V1', 'DIRECTO'), unidades: 7, venta_neta: 100 } as SaleRecord,
      { ...mk(2024, 0, 10, 'V1', 'DIRECTO'), unidades: 3, venta_neta: 50 } as SaleRecord,
    ]
    const tree: MonthlyPivotNode[] = buildMonthlyPivotTree(sales, ['canal'], ['2024-01'], 'unidades', 'root', 0)
    expect(tree[0].valuesByCol[0]).toBe(10) // 7 + 3
    expect(tree[0].total).toBe(10)
  })
})
