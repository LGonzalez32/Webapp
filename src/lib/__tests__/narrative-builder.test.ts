/**
 * narrative-builder.test.ts — Z.3 invariant tests
 * Verifican que NarrativeBuilder cumple sus invariantes por construcción.
 */

import { describe, it, expect } from 'vitest'
import {
  NarrativeBuilder,
  fmtSignedDelta,
  validateProductoContraTopList,
  joinSentences,
  NB_SECTION_LABEL,
} from '../narrative-builder'

// ── T1: fmtSignedDelta — signo derivado de Math.sign(n) ───────────────────────

describe('fmtSignedDelta', () => {
  it('retorna formato negativo para n < 0', () => {
    const result = fmtSignedDelta(-0.5)
    expect(result).toMatch(/^−/)
    expect(result).toBe('−0.5%')
  })

  it('retorna formato positivo para n > 0', () => {
    const result = fmtSignedDelta(0.5)
    expect(result).toMatch(/^\+/)
    expect(result).toBe('+0.5%')
  })

  it('retorna sin signo para n = 0', () => {
    expect(fmtSignedDelta(0)).toBe('0.0%')
  })

  it('usa un dígito decimal consistentemente', () => {
    expect(fmtSignedDelta(10)).toBe('+10.0%')
    expect(fmtSignedDelta(-46.5)).toBe('−46.5%')
  })
})

// ── T2: validateProductoContraTopList ─────────────────────────────────────────

describe('validateProductoContraTopList', () => {
  const topList = [
    { nombre: 'Jugo Naranja 1L' },
    { nombre: 'Mantequilla 225g' },
  ]

  it('devuelve null para producto desconocido', () => {
    expect(validateProductoContraTopList('Producto Inexistente', topList)).toBeNull()
  })

  it('devuelve objeto tipado con validadoContraTop: true para producto válido', () => {
    const result = validateProductoContraTopList('Jugo Naranja 1L', topList)
    expect(result).not.toBeNull()
    expect(result!.validadoContraTop).toBe(true)
    expect(result!.nombre).toBe('Jugo Naranja 1L')
  })

  it('matching es case-insensitive', () => {
    const result = validateProductoContraTopList('jugo naranja 1l', topList)
    expect(result).not.toBeNull()
    expect(result!.validadoContraTop).toBe(true)
  })

  it('devuelve null para lista vacía', () => {
    expect(validateProductoContraTopList('Jugo Naranja 1L', [])).toBeNull()
  })
})

// ── T3: NarrativeBuilder.render() — composición correcta ──────────────────────

describe('NarrativeBuilder.render()', () => {
  it('devuelve "" con 0 cláusulas', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    expect(nb.render()).toBe('')
  })

  it('devuelve el texto directo con 1 cláusula', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addHechoPrincipal('Carlos cayó −46.5%')
    expect(nb.render()).toBe('Carlos cayó −46.5%')
  })

  it('con 2 cláusulas une con conector y lowercase de la segunda', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addHechoPrincipal('Primera cláusula con mayúscula')
    nb.addHechoPrincipal('Segunda cláusula con mayúscula')
    const result = nb.render()
    // Debe iniciar con la primera cláusula seguida de ". "
    expect(result).toMatch(/^Primera cláusula con mayúscula\. /)
    // La segunda debe ir en minúscula
    expect(result).toMatch(/segunda cláusula con mayúscula$/)
    // Debe haber un conector entre ellas
    const connectors = ['Además, ', 'En paralelo, ', 'También, ', 'Suma a esto que ']
    const hasConnector = connectors.some(c => result.includes(c))
    expect(hasConnector).toBe(true)
  })

  it('con 3 cláusulas usa "Además, " para la tercera', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addHechoPrincipal('Primera')
    nb.addHechoPrincipal('Segunda')
    nb.addHechoPrincipal('Tercera')
    const result = nb.render()
    // La tercera siempre usa "Además, "
    expect(result).toMatch(/\. Además, tercera$/)
  })

  it('dedup: no agrega la misma cláusula dos veces', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addHechoPrincipal('Cláusula duplicada')
    nb.addHechoPrincipal('Cláusula duplicada')
    expect(nb.clauseCount).toBe(1)
  })

  it('maxClauses limita el número de cláusulas', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block', undefined, 2)
    nb.addHechoPrincipal('Una')
    nb.addHechoPrincipal('Dos')
    nb.addHechoPrincipal('Tres')  // excede maxClauses
    expect(nb.clauseCount).toBe(2)
  })
})

// ── T4: addAdvertenciaStock — formato de stock garantizado ────────────────────

describe('NarrativeBuilder.addAdvertenciaStock()', () => {
  it('produce "solo N días de cobertura" para riesgo_quiebre', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addAdvertenciaStock('Jugo Naranja 1L', 'riesgo_quiebre', 6, 1000)
    expect(nb.render()).toMatch(/tiene solo 6 días de cobertura \(1,000 uds\)/)
    expect(nb.render()).toMatch(/hay que reabastecer/)
  })

  it('produce "días de inventario parado" para lento_movimiento', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addAdvertenciaStock('Mantequilla 225g', 'lento_movimiento', 105, 270)
    expect(nb.render()).toMatch(/lleva 105 días de inventario parado \(270 uds\)/)
    expect(nb.render()).toMatch(/urge rotar/)
  })
})

// ── T5: addAdvertenciaDormido — siempre nombres reales ────────────────────────

describe('NarrativeBuilder.addAdvertenciaDormido()', () => {
  it('un cliente: usa nombre y días', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addAdvertenciaDormido(['Supermercado López'], 48)
    expect(nb.render()).toBe('Supermercado López lleva 48 días sin comprar')
  })

  it('dos clientes: usa ambos nombres', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addAdvertenciaDormido(['Super Selectos Norte', 'Abarrotería El Sol'])
    expect(nb.render()).toBe('Super Selectos Norte y Abarrotería El Sol llevan varias semanas sin comprar')
  })

  it('lista vacía: no agrega nada', () => {
    const nb = new NarrativeBuilder('Test', 'warning', 'test-block')
    nb.addAdvertenciaDormido([])
    expect(nb.clauseCount).toBe(0)
    expect(nb.render()).toBe('')
  })
})

// ── T6: NB_SECTION_LABEL constante ────────────────────────────────────────────

describe('NB_SECTION_LABEL', () => {
  it('es el string centinela correcto', () => {
    expect(NB_SECTION_LABEL).toBe('__nb__')
  })
})

// ── T7: joinSentences ─────────────────────────────────────────────────────────

describe('joinSentences', () => {
  it('filtra cadenas vacías', () => {
    expect(joinSentences(['A', '', 'B'])).toBe('A. B')
  })

  it('acepta separador personalizado', () => {
    expect(joinSentences(['A', 'B'], ' — ')).toBe('A — B')
  })

  it('una sola cadena: sin separador', () => {
    expect(joinSentences(['Solo'])).toBe('Solo')
  })
})
