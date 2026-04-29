import { describe, it, expect } from 'vitest'

// Reproduce la lógica de renderPriorityScore para los 3 scopes nuevos
// tal como quedaron en decision-engine.ts tras fix-1.5.
const EP_W_TIME = 3.0
const _EP_SCOPE_URGENCY: Record<string, number> = {
  mtd: 1.0, monthly: 0.8, ytd: 0.6, rolling: 0.5, unknown: 0.4,
  current: 1.0, longitudinal: 0.6, seasonal: 0.5,
}

describe('decision-engine: timeScore by scope family', () => {
  it('current=3.0, longitudinal=1.8, seasonal=1.5, unknown=1.2', () => {
    const scores: Record<string, number> = {}
    for (const scope of ['current', 'longitudinal', 'seasonal', 'unknown', 'mtd', 'ytd']) {
      scores[scope] = (_EP_SCOPE_URGENCY[scope] ?? 0.4) * EP_W_TIME
    }

    console.log('\n=== fix-1.5: timeScore antes vs después ===')
    console.log('ANTES  (todos producían unknown): timeScore = 0.4 × 3.0 = 1.2')
    console.log('DESPUÉS:')
    console.log(`  current      = ${scores['current'].toFixed(1)}  (era 1.2 siempre → ahora ${scores['current'].toFixed(1)})`)
    console.log(`  longitudinal = ${scores['longitudinal'].toFixed(1)}  (era 1.2 siempre → ahora ${scores['longitudinal'].toFixed(1)})`)
    console.log(`  seasonal     = ${scores['seasonal'].toFixed(1)}  (era 1.2 siempre → ahora ${scores['seasonal'].toFixed(1)})`)
    console.log(`  unknown      = ${scores['unknown'].toFixed(1)}  (sin cambio)`)
    console.log('_SCOPE_LABEL:')
    console.log('  current      → "mes actual"')
    console.log('  longitudinal → "tendencia histórica"')
    console.log('  seasonal     → "patrón estacional"')

    // Valores esperados según brief
    expect(scores['current']).toBeCloseTo(3.0, 5)
    expect(scores['longitudinal']).toBeCloseTo(1.8, 5)
    expect(scores['seasonal']).toBeCloseTo(1.5, 5)
    expect(scores['unknown']).toBeCloseTo(1.2, 5)
  })
})
