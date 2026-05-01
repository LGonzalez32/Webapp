import { describe, it, expect } from 'vitest'
import { pickEmpresaName } from '../../src/lib/useEmpresaName'

describe('pickEmpresaName', () => {
  it('returns org.name when org exists (configuracion ignored)', () => {
    expect(pickEmpresaName('Ferretería El Tornillo S.A. de C.V.', 'Los Pinos S.A.'))
      .toBe('Ferretería El Tornillo S.A. de C.V.')
  })

  it('returns configuracion.empresa fallback when org is null', () => {
    expect(pickEmpresaName(null, 'Mi Negocio')).toBe('Mi Negocio')
    expect(pickEmpresaName(undefined, 'Mi Negocio')).toBe('Mi Negocio')
  })

  it('returns "Mi Empresa" default when both are empty/null', () => {
    expect(pickEmpresaName(null, null)).toBe('Mi Empresa')
    expect(pickEmpresaName(undefined, undefined)).toBe('Mi Empresa')
    expect(pickEmpresaName('', '')).toBe('Mi Empresa')
    expect(pickEmpresaName('   ', '   ')).toBe('Mi Empresa')
  })

  it('falls back when org name is whitespace-only', () => {
    expect(pickEmpresaName('   ', 'Mi Negocio')).toBe('Mi Negocio')
  })
})
