import { describe, it, expect } from 'vitest'
import {
  detectTipoMeta,
  isAmbiguousMetaHeader,
  AMBIGUOUS_META_HEADERS,
  parseMetasFile,
} from '../../src/lib/fileParser'

function csvFile(content: string, name = 'metas.csv'): File {
  return new File([content], name, { type: 'text/csv' })
}

describe('detectTipoMeta — backward compat sin override', () => {
  it('default a unidades para header genérico "Meta"', () => {
    expect(detectTipoMeta(['Meta', 'mes', 'anio'])).toBe('unidades')
  })
  it('detecta venta_neta cuando el header lo declara explícito', () => {
    expect(detectTipoMeta(['meta_usd', 'mes', 'anio'])).toBe('venta_neta')
  })
})

describe('isAmbiguousMetaHeader', () => {
  it('reporta ambiguous=true para "Meta"', () => {
    const r = isAmbiguousMetaHeader(['Meta', 'mes', 'anio'])
    expect(r.ambiguous).toBe(true)
    expect(r.matchedHeader).toBe('Meta')
  })

  it('reporta ambiguous=false cuando hay header inequívoco "meta_usd"', () => {
    const r = isAmbiguousMetaHeader(['meta_usd', 'mes', 'anio'])
    expect(r.ambiguous).toBe(false)
    expect(r.matchedHeader).toBeNull()
  })

  it('prioriza header inequívoco si coexisten ambos', () => {
    // Caso raro pero posible: dos columnas que matchean META_MAPPINGS.meta,
    // una ambigua y una clara. La clara gana.
    const r = isAmbiguousMetaHeader(['Meta', 'meta_usd', 'mes', 'anio'])
    expect(r.ambiguous).toBe(false)
    expect(r.matchedHeader).toBeNull()
  })

  it('no marca ambiguous si no hay ningún header de meta', () => {
    const r = isAmbiguousMetaHeader(['vendedor', 'mes', 'anio'])
    expect(r.ambiguous).toBe(false)
    expect(r.matchedHeader).toBeNull()
  })

  it('AMBIGUOUS_META_HEADERS contiene los aliases documentados', () => {
    for (const alias of ['Meta', 'Cuota', 'Presupuesto', 'objetivo', 'Budget']) {
      expect(AMBIGUOUS_META_HEADERS).toContain(alias)
    }
  })
})

describe('parseMetasFile con forceTipoMeta', () => {
  const csv = [
    'Meta,vendedor,mes,anio',
    '1000,Ana López,1,2025',
    '2500,Bruno García,2,2025',
  ].join('\n')

  it('sin override: header "Meta" cae al default unidades (backward compat)', async () => {
    const r = await parseMetasFile(csvFile(csv))
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.length).toBe(2)
    for (const rec of r.data) {
      expect(rec.tipo_meta).toBe('unidades')
      expect(rec.meta_uds).toBeGreaterThan(0)
      expect(rec.meta_usd).toBeUndefined()
    }
  })

  it('con forceTipoMeta="venta_neta": ignora detectTipoMeta y usa USD', async () => {
    const r = await parseMetasFile(csvFile(csv), { forceTipoMeta: 'venta_neta' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data.length).toBe(2)
    for (const rec of r.data) {
      expect(rec.tipo_meta).toBe('venta_neta')
      expect(rec.meta_usd).toBeGreaterThan(0)
      expect(rec.meta_uds).toBeUndefined()
    }
  })

  it('con forceTipoMeta="unidades" sobre header explícito meta_usd: override gana', async () => {
    const csvUsd = [
      'meta_usd,vendedor,mes,anio',
      '1000,Ana López,1,2025',
    ].join('\n')
    const r = await parseMetasFile(csvFile(csvUsd), { forceTipoMeta: 'unidades' })
    expect(r.success).toBe(true)
    if (!r.success) return
    expect(r.data[0].tipo_meta).toBe('unidades')
    expect(r.data[0].meta_uds).toBeGreaterThan(0)
    expect(r.data[0].meta_usd).toBeUndefined()
  })
})
