import { describe, it, expect } from 'vitest'
import { getDemoData } from '../../src/lib/demoData'

describe('team meta alignment: header total equals sum of vendor rows', () => {
  it('teamMeta === sum(draft) and vendedoresActivos === 8', () => {
    const { sales, metas } = getDemoData()
    const today = new Date()
    const Y = today.getFullYear(), M = today.getMonth() + 1

    // --- ANTES (lógica original) ---
    const vendedoresActivosAntes = [...new Set(sales.map(s => s.vendedor).filter(Boolean))].sort()
    const teamMetaAntes = metas
      .filter(m => m.anio === Y && m.mes === M && m.vendedor)
      .reduce((a, m) => a + (m.meta_uds ?? m.meta ?? 0), 0)
    const draftSumAntes = vendedoresActivosAntes.reduce((sum, v) => {
      const first = metas.find(m => m.vendedor === v && m.mes === M && m.anio === Y)
      return sum + (first?.meta_uds ?? first?.meta ?? 0)
    }, 0)

    // --- DESPUÉS (lógica nueva) ---
    const vendedoresActivosDespues = [
      ...new Set(metas.filter(m => m.anio === Y && m.vendedor).map(m => m.vendedor!))
    ].sort()
    const teamMetaDespues = metas
      .filter(m => m.anio === Y && m.mes === M && m.vendedor && !m.canal && !m.categoria && !m.cliente)
      .reduce((a, m) => a + (m.meta_uds ?? m.meta ?? 0), 0)
    const draftSumDespues = vendedoresActivosDespues.reduce((sum, v) => {
      const first = metas.find(m => m.vendedor === v && m.mes === M && m.anio === Y)
      return sum + (first?.meta_uds ?? first?.meta ?? 0)
    }, 0)

    const ventasMes = sales.filter(s => {
      const d = new Date(s.fecha)
      return d.getFullYear() === Y && d.getMonth() === M - 1
    })
    const realTot = ventasMes.reduce((a, s) => a + s.unidades, 0)
    const equipoPctAntes  = teamMetaAntes  > 0 ? (realTot / teamMetaAntes  * 100).toFixed(1) + '%' : 'N/A'
    const equipoPctDespues = teamMetaDespues > 0 ? (realTot / teamMetaDespues * 100).toFixed(1) + '%' : 'N/A'

    console.log('\n=== fix-1.2 verification ===')
    console.log(`Período: ${Y}-${String(M).padStart(2, '0')}`)
    console.log(`real ventas mes: ${realTot}`)
    console.log()
    console.log('(a) Filas vendedor en tabla editar:')
    console.log(`    ANTES   ${vendedoresActivosAntes.length} → [${vendedoresActivosAntes.join(', ')}]`)
    console.log(`    DESPUÉS ${vendedoresActivosDespues.length} → [${vendedoresActivosDespues.join(', ')}]`)
    console.log()
    console.log('(b) Header "Progreso del equipo" META:')
    console.log(`    ANTES   teamMeta=${teamMetaAntes} pct=${equipoPctAntes}`)
    console.log(`    DESPUÉS teamMeta=${teamMetaDespues} pct=${equipoPctDespues}`)
    console.log()
    console.log('(c) Suma total fila Equipo en tabla editar (mes activo):')
    console.log(`    ANTES   ${draftSumAntes}`)
    console.log(`    DESPUÉS ${draftSumDespues}`)
    console.log()
    console.log(`(d) Header == Tabla? ANTES=${teamMetaAntes === draftSumAntes} DESPUÉS=${teamMetaDespues === draftSumDespues}`)

    // Asserts
    expect(vendedoresActivosDespues.length).toBeGreaterThanOrEqual(vendedoresActivosAntes.length)
    expect(teamMetaDespues).toBe(draftSumDespues)  // header debe coincidir con tabla
    expect(vendedoresActivosDespues.length).toBe(8)
  })
})
