import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'

export function pickEmpresaName(
  orgName: string | null | undefined,
  fallback: string | null | undefined,
): string {
  const trimmedOrg = (orgName ?? '').trim()
  if (trimmedOrg !== '') return trimmedOrg
  const trimmedFallback = (fallback ?? '').trim()
  if (trimmedFallback !== '') return trimmedFallback
  return 'Mi Empresa'
}

export function useEmpresaName(): string {
  const orgName = useOrgStore((s) => s.org?.name)
  const fallback = useAppStore((s) => s.configuracion.empresa)
  return pickEmpresaName(orgName, fallback)
}
