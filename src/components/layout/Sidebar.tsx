import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Users, TrendingUp, UserCheck, Target,
  Bot, Upload, Settings, Menu, X as CloseIcon, Zap, RotateCcw, LogOut, Map, Building2, PanelLeftClose, PanelLeft,
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { useAppStore } from '../../store/appStore'
import { useAuthStore } from '../../store/authStore'
import { useOrgStore } from '../../store/orgStore'
import { supabase } from '../../lib/supabaseClient'

interface NavItem {
  label: string
  href: string
  icon: ComponentType<{ className?: string }>
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { configuracion, resetAll } = useAppStore()
  const { user } = useAuthStore()
  const org = useOrgStore(s => s.org)
  const currentRole = useOrgStore(s => s.currentRole)
  const [isOpen, setIsOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('sf_sidebar_collapsed') === 'true' } catch { return false }
  })
  const toggleCollapse = () => {
    setCollapsed((prev: boolean) => {
      const next = !prev
      try { localStorage.setItem('sf_sidebar_collapsed', String(next)) } catch { /* */ }
      return next
    })
  }
  const isDemo = location.pathname.startsWith('/demo')
  const prefix = isDemo ? '/demo' : ''

  const handleLogout = async () => {
    if (isDemo) { navigate('/'); return }
    await supabase.auth.signOut()
    resetAll()
    navigate('/login')
  }

  const allowedPages = useOrgStore(s => s.allowedPages)
  const isOwner = currentRole === 'owner'

  // Determine which pages this user can see
  const getVisiblePages = (): Set<string> => {
    // Owner sees everything
    if (isOwner || !currentRole) return new Set(['*'])
    // Explicit allowed_pages array
    if (allowedPages) return new Set(allowedPages)
    // Defaults per role (null allowed_pages)
    const base = ['/dashboard', '/vendedores', '/metas', '/clientes', '/rotacion',
      '/departamentos', '/rendimiento', '/chat', '/configuracion']
    if (currentRole === 'admin') return new Set([...base, '/cargar'])
    if (currentRole === 'editor') return new Set([...base, '/cargar'])
    return new Set(base) // viewer
  }

  const visiblePages = getVisiblePages()
  const canSee = (href: string) => visiblePages.has('*') || visiblePages.has(href)

  const ALL_PRINCIPAL: NavItem[] = [
    { label: 'Estado Comercial', href: `${prefix}/dashboard`, icon: AlertTriangle },
    { label: 'Vendedores',       href: `${prefix}/vendedores`, icon: Users },
    { label: 'Metas',            href: `${prefix}/metas`,      icon: Target },
  ]

  const ALL_ANALISIS: NavItem[] = [
    { label: 'Clientes',        href: `${prefix}/clientes`,    icon: UserCheck },
    { label: 'Rotación',        href: `${prefix}/rotacion`,    icon: RotateCcw },
    { label: 'Departamentos',   href: `${prefix}/departamentos`, icon: Map },
    { label: 'Rendimiento Anual', href: `${prefix}/rendimiento`, icon: TrendingUp },
  ]

  const ALL_HERRAMIENTAS: NavItem[] = [
    { label: 'Asistente Virtual', href: `${prefix}/chat`,          icon: Bot },
    ...(!isDemo ? [{ label: 'Cargar datos',   href: '/cargar',        icon: Upload }] : []),
    ...(!isDemo && isOwner ? [{ label: 'Organización', href: '/organizacion', icon: Building2 }] : []),
    { label: 'Configuración',  href: `${prefix}/configuracion`, icon: Settings },
  ]

  const PRINCIPAL = ALL_PRINCIPAL.filter(i => canSee(i.href))
  const ANALISIS = ALL_ANALISIS.filter(i => canSee(i.href))
  const HERRAMIENTAS = ALL_HERRAMIENTAS.filter(i => canSee(i.href))

  const NavLink = ({ item, mini = false }: { item: NavItem; mini?: boolean; key?: string }) => {
    const active = location.pathname === item.href
    return (
      <Link
        to={item.href}
        onClick={() => setIsOpen(false)}
        title={mini ? item.label : undefined}
        className={cn(
          'flex items-center rounded-lg text-sm font-medium transition-all',
          mini ? 'justify-center p-2.5' : 'gap-3 px-4 py-2.5',
          active ? 'font-semibold' : 'hover:bg-[var(--sf-hover)]'
        )}
        // [Z.P1.11.b/V2] Active = fondo warm muted + texto t1. Antes estaba todo
        // verde (fondo + texto + icono), sobrecargando el acento de marca.
        // Ahora el verde queda como acento sutil solo en el icono.
        style={active
          ? { background: 'var(--sf-green-bg)', color: 'var(--sf-green)', boxShadow: 'inset 3px 0 0 var(--sf-green)' }
          : { color: 'var(--sf-t4)' }
        }
      >
        <item.icon className="w-4 h-4 shrink-0" style={{ color: active ? 'var(--sf-green)' : 'var(--sf-t4)' }} />
        {!mini && item.label}
      </Link>
    )
  }

  const SidebarContent = ({ mini = false }: { mini?: boolean }) => (
    <div className="flex flex-col h-full">
      {/* Logo + collapse toggle */}
      <div className={cn('flex items-center', mini ? 'justify-center px-2 py-4' : 'justify-between px-5 py-5')} style={{ borderBottom: '1px solid var(--sf-border-subtle)' }}>
        {mini ? (
          <button
            onClick={toggleCollapse}
            className="hidden md:flex w-8 h-8 items-center justify-center rounded p-1 transition-colors cursor-pointer"
            style={{ color: 'var(--sf-t5)' }}
            title="Expandir menú"
          >
            <PanelLeft className="w-[18px] h-[18px]" />
          </button>
        ) : (
          <>
            <Link to={`${prefix}/dashboard`} className="flex items-center gap-2 min-w-0" onClick={() => setIsOpen(false)}>
              {/* [Z.P1.11.b/V2] Logo: ⚡ verde como ícono pequeño sin caja sólida.
                  Texto SalesFlow en t1 700 (no font-black 900 verde). El verde queda
                  como acento sutil del ícono, no como bloque cromático dominante. */}
              <Zap className="w-5 h-5 shrink-0 text-[var(--sf-green)]" />
              <div className="min-w-0">
                <span className="text-lg font-bold tracking-tight" style={{ color: 'var(--sf-t1)' }}>SalesFlow</span>
                {(org?.name ?? configuracion.empresa) && (
                  <p className="text-[10px] font-medium leading-tight truncate max-w-[140px]" style={{ color: 'var(--sf-t6)' }}>
                    {org?.name ?? configuracion.empresa}
                  </p>
                )}
              </div>
            </Link>
            {!isOpen && (
              <button
                onClick={toggleCollapse}
                className="hidden md:flex items-center justify-center rounded p-1 transition-colors cursor-pointer shrink-0"
                style={{ color: 'var(--sf-t5)' }}
                title="Colapsar menú"
              >
                <PanelLeftClose className="w-[18px] h-[18px]" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Nav */}
      <nav className={cn('flex-1 overflow-y-auto py-4 space-y-6', mini ? 'px-1.5' : 'px-3')}>
        {/* Principal */}
        <div className="space-y-0.5">
          {!mini && <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Principal</p>}
          {PRINCIPAL.map((item) => <NavLink key={item.href} item={item} mini={mini} />)}
        </div>

        {/* Análisis */}
        <div className="space-y-0.5">
          {!mini && <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Análisis</p>}
          {ANALISIS.map((item) => <NavLink key={item.href} item={item} mini={mini} />)}
        </div>

        {/* Herramientas */}
        <div className="space-y-0.5">
          {!mini && <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Herramientas</p>}
          {HERRAMIENTAS.map((item) => <NavLink key={item.href} item={item} mini={mini} />)}
        </div>
      </nav>

      {/* Footer — usuario + logout */}
      <div className={cn('py-4 space-y-3', mini ? 'px-2' : 'px-4')} style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
        {!mini && (isDemo ? (
          <div className="px-1 space-y-1">
            <p className="text-[11px] font-medium" style={{ color: 'var(--sf-t6)' }}>Modo demo</p>
            <span className="inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30">
              Datos de ejemplo
            </span>
          </div>
        ) : user?.email ? (
          <div className="px-1 space-y-1">
            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--sf-t6)' }} title={user.email}>
              {user.email}
            </p>
            {/* [Z.P1.11.b/V2] Badge owner pasa de verde (ornamental, redundante con
                CTA + estados) a warm neutro. Admin/editor/viewer mantienen sus
                acentos semánticos: cada rol distinguible sin saturar verde. */}
            <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded ${
              (currentRole ?? 'owner') === 'owner'
                ? 'bg-[var(--sf-hover)] text-[var(--sf-t2)] border border-[var(--sf-border)]'
                : currentRole === 'admin'
                  ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                  : currentRole === 'editor'
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                    : 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30'
            }`}>
              {(currentRole ?? 'owner') === 'owner' ? 'Propietario'
                : currentRole === 'admin' ? 'Admin'
                : currentRole === 'editor' ? 'Editor' : 'Visor'}
            </span>
          </div>
        ) : null)}
        <button
          onClick={handleLogout}
          title={mini ? (isDemo ? 'Salir de la demo' : 'Cerrar sesión') : undefined}
          className={cn('flex items-center w-full rounded-lg text-sm hover:text-red-400 transition-all cursor-pointer', mini ? 'justify-center p-2.5' : 'gap-2.5 px-4 py-2')}
          style={{ color: 'var(--sf-t5)' }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          {!mini && (isDemo ? 'Salir de la demo' : 'Cerrar sesión')}
        </button>
        {!mini && (
          <div className="flex items-center px-1">
            <p className="text-[10px]" style={{ color: 'var(--sf-t8)' }}>v2.0 · SalesFlow</p>
          </div>
        )}
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside
        className={cn('sf-sidebar hidden md:flex flex-col shrink-0 h-screen sticky top-0 transition-all duration-200', collapsed ? 'w-[60px]' : 'w-60')}
        style={{ background: 'var(--sf-sidebar)', borderRight: '1px solid var(--sf-border-subtle)' }}
      >
        <SidebarContent mini={collapsed} />
      </aside>

      {/* Mobile hamburger */}
      <div className="sf-sidebar md:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 rounded-xl flex items-center justify-center shadow-lg"
          style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border-subtle)', color: 'var(--sf-t5)' }}
        >
          {isOpen ? <CloseIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer + backdrop */}
      <div
        className={cn(
          'md:hidden fixed inset-0 bg-black/60 z-40 transition-opacity duration-250',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setIsOpen(false)}
      />
      <aside
        className={cn(
          'md:hidden fixed inset-y-0 left-0 w-64 z-50 flex flex-col shadow-2xl transition-transform duration-250 ease-out',
          isOpen ? 'translate-x-0' : '-translate-x-full'
        )}
        style={{ background: 'var(--sf-sidebar)', borderRight: '1px solid var(--sf-border-subtle)' }}
      >
        <SidebarContent />
      </aside>
    </>
  )
}
