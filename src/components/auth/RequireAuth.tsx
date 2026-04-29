import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../../store/authStore'
import { useOrgStore } from '../../store/orgStore'

/** Pages visible by default when allowed_pages is null */
const DEFAULTS: Record<string, string[]> = {
  viewer: ['/dashboard', '/vendedores', '/metas', '/clientes', '/rotacion',
    '/departamentos', '/rendimiento', '/chat', '/configuracion'],
  editor: ['/dashboard', '/vendedores', '/metas', '/clientes', '/rotacion',
    '/departamentos', '/rendimiento', '/chat', '/cargar', '/configuracion'],
  admin: ['/dashboard', '/vendedores', '/metas', '/clientes', '/rotacion',
    '/departamentos', '/rendimiento', '/chat', '/cargar', '/configuracion'],
}

function isPageAllowed(path: string, role: string | null, allowedPages: string[] | null): boolean {
  // Owner can access everything
  if (!role || role === 'owner') return true
  // /organizacion is owner-only
  if (path === '/organizacion') return false
  // Explicit allowed_pages
  if (allowedPages) return allowedPages.includes(path)
  // Default per role
  const defaults = DEFAULTS[role]
  return defaults ? defaults.includes(path) : true
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuthStore()
  const location = useLocation()
  const currentRole = useOrgStore(s => s.currentRole)
  const allowedPages = useOrgStore(s => s.allowedPages)

  // E2E test bypass: solo en builds DEV, requiere ?e2e_bypass=1 en la URL.
  // Evita auth-mock complejo para tests que solo verifican flujos de UI no-auth.
  // En builds de producción import.meta.env.DEV es false → branch muerto.
  if (import.meta.env.DEV && new URLSearchParams(location.search).get('e2e_bypass') === '1') {
    return <>{children}</>
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b' }}>
        <p style={{ color: '#71717a', fontSize: '14px' }}>Cargando...</p>
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />

  // Route protection — only for app routes (not /onboarding, /app, etc.)
  const appRoutes = ['/dashboard', '/vendedores', '/metas', '/clientes', '/rotacion',
    '/departamentos', '/rendimiento', '/chat', '/cargar', '/organizacion', '/configuracion']
  const path = location.pathname
  if (appRoutes.includes(path) && !isPageAllowed(path, currentRole, allowedPages)) {
    return <Navigate to="/dashboard" replace />
  }

  return <>{children}</>
}
