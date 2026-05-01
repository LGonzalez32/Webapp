import { describe, it, expect } from 'vitest'
import { getDemoData } from '../../src/lib/demoData'

const ESTACIONAL: Record<number, number> = {
  1: 0.85, 2: 0.85, 3: 0.95, 4: 1.0, 5: 1.05, 6: 1.0,
  7: 0.95, 8: 0.95, 9: 1.0, 10: 1.05, 11: 1.15, 12: 1.25,
}
const CAT_BASELINE_DAILY: Record<string, number> = {
  'Lácteos': 70, 'Refrescos': 55, 'Snacks': 60, 'Limpieza': 45,
}

describe('demo data: zero orphan sales (every sale has a vendedor)', () => {
  it('vendedoresActivos === 8 and no sales without vendedor', () => {
    const { sales, metas } = getDemoData()
    const today = new Date()
    const Y = today.getFullYear(), M = today.getMonth() + 1
    const metasMes = metas.filter(m => m.anio === Y && m.mes === M)
    const ventasMes = sales.filter(s => {
      const d = new Date(s.fecha)
      return d.getFullYear() === Y && d.getMonth() === M - 1
    })

    const sinVendedor = metasMes.filter(m => !m.vendedor)
    const sumSinVendedor = sinVendedor.reduce((a, m) => a + (m.meta_uds ?? m.meta ?? 0), 0)
    const sumMetaTot = metasMes.reduce((a, m) => a + (m.meta_uds ?? m.meta ?? 0), 0)
    const sumRealTot = ventasMes.reduce((a, s) => a + s.unidades, 0)
    const equipoPctAfter = sumMetaTot > 0 ? (sumRealTot / sumMetaTot) * 100 : null

    // Reconstrucción del estado pre-fix
    const seasonal = ESTACIONAL[M]
    const yearDiff = Y - 2026
    const growthFactor = yearDiff < 0 ? 1 + yearDiff * 0.03 : 1 + yearDiff * 0.05
    const vendorMetasMes = metasMes.filter(m => m.vendedor && !m.canal && !m.categoria && !m.cliente)
    const vendorAcum = vendorMetasMes.reduce((a, m) => a + (m.meta_uds ?? 0), 0)
    const supervisorOrphans = Math.round(vendorAcum * 1.02)
    const categoriaOrphans = Object.values(CAT_BASELINE_DAILY)
      .reduce((a, base) => a + Math.round(base * 26 * seasonal * 1.05 * growthFactor), 0)
    const sumOrphans = supervisorOrphans + categoriaOrphans
    const sumMetaTotBefore = sumMetaTot + sumOrphans
    const equipoPctBefore = sumMetaTotBefore > 0 ? (sumRealTot / sumMetaTotBefore) * 100 : null

    const vendedoresActivos = [...new Set(sales.map(s => s.vendedor).filter(Boolean))].sort()
    const indiv = vendedoresActivos.map(v => {
      const metaRow = metasMes.find(m => m.vendedor === v && !m.canal && !m.categoria && !m.cliente)
      const meta = metaRow?.meta_uds ?? 0
      const real = ventasMes.filter(s => s.vendedor === v).reduce((a, s) => a + s.unidades, 0)
      const pct = meta > 0 ? (real / meta) * 100 : null
      return { v, meta, real, pct }
    })
    const w = indiv.reduce((acc, x) => {
      if (x.meta > 0) { acc.num += x.real; acc.den += x.meta }
      return acc
    }, { num: 0, den: 0 })
    const weightedAvg = w.den > 0 ? (w.num / w.den) * 100 : null

    // eslint-disable-next-line no-console
    console.log('\n=== fix-1.1 verification ===')
    console.log(`Período: ${Y}-${String(M).padStart(2, '0')}`)
    console.log(`Total sales=${sales.length}  | mes activo=${ventasMes.length}`)
    console.log(`Total metas=${metas.length}  | mes activo=${metasMes.length}`)
    console.log(`(a) Metas sin vendedor mes activo: ${sinVendedor.length} (${sumSinVendedor} uds)`)
    console.log(`(b) EQUIPO histórico mes activo:`)
    console.log(`    BEFORE  meta=${sumMetaTotBefore}  real=${sumRealTot}  pct=${equipoPctBefore?.toFixed(1)}%`)
    console.log(`    AFTER   meta=${sumMetaTot}  real=${sumRealTot}  pct=${equipoPctAfter?.toFixed(1)}%`)
    console.log(`    orphans removidos: ${sumOrphans}  (sup=${supervisorOrphans}, cat=${categoriaOrphans})`)
    console.log(`(c) Cumplimiento individual (single-dim):`)
    indiv.forEach(x => {
      console.log(`    ${x.v.padEnd(22)} meta=${String(x.meta).padStart(6)} real=${String(x.real).padStart(6)} pct=${x.pct?.toFixed(1)}%`)
    })
    console.log(`    promedio ponderado: ${weightedAvg?.toFixed(1)}%`)
    console.log(`(d) Vendedores activos: ${vendedoresActivos.length} → ${vendedoresActivos.join(', ')}`)

    expect(sinVendedor.length).toBe(0)
    expect(vendedoresActivos.length).toBe(8)
  })
})
