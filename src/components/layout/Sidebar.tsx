import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Users, TrendingUp, UserCheck, Target,
  Bot, Upload, Settings, Menu, X as CloseIcon, Zap, RotateCcw, LogOut, Map, Building2,
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

  const handleLogout = async () => {
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
      '/departamentos', '/rendimiento', '/chat']
    if (currentRole === 'admin') return new Set([...base, '/cargar', '/configuracion'])
    if (currentRole === 'editor') return new Set([...base, '/cargar'])
    return new Set(base) // viewer
  }

  const visiblePages = getVisiblePages()
  const canSee = (href: string) => visiblePages.has('*') || visiblePages.has(href)

  const ALL_PRINCIPAL: NavItem[] = [
    { label: 'Estado Comercial', href: '/dashboard', icon: AlertTriangle },
    { label: 'Vendedores',       href: '/vendedores', icon: Users },
    { label: 'Metas',            href: '/metas',      icon: Target },
  ]

  const ALL_ANALISIS: NavItem[] = [
    { label: 'Clientes',        href: '/clientes',    icon: UserCheck },
    { label: 'Rotación',        href: '/rotacion',    icon: RotateCcw },
    { label: 'Departamentos',   href: '/departamentos', icon: Map },
    { label: 'Rendimiento Anual', href: '/rendimiento', icon: TrendingUp },
  ]

  const ALL_HERRAMIENTAS: NavItem[] = [
    { label: 'Chat IA',        href: '/chat',          icon: Bot },
    { label: 'Cargar datos',   href: '/cargar',        icon: Upload },
    ...(isOwner ? [{ label: 'Organización', href: '/organizacion', icon: Building2 }] : []),
    { label: 'Configuración',  href: '/configuracion', icon: Settings },
  ]

  const PRINCIPAL = ALL_PRINCIPAL.filter(i => canSee(i.href))
  const ANALISIS = ALL_ANALISIS.filter(i => canSee(i.href))
  const HERRAMIENTAS = ALL_HERRAMIENTAS.filter(i => canSee(i.href))

  const NavLink: import('react').FC<{ item: NavItem }> = ({ item }) => {
    const active = location.pathname === item.href
    return (
      <Link
        to={item.href}
        onClick={() => setIsOpen(false)}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all',
          active
            ? 'font-bold'
            : 'hover:bg-[var(--sf-hover)]'
        )}
        style={active
          ? { background: 'var(--sf-green-bg)', color: 'var(--sf-green)' }
          : { color: 'var(--sf-t4)' }
        }
      >
        <item.icon className="w-4 h-4 shrink-0" style={{ color: active ? 'var(--sf-green)' : 'var(--sf-t4)' }} />
        {item.label}
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6" style={{ borderBottom: '1px solid var(--sf-border-subtle)' }}>
        <Link to="/dashboard" className="flex items-center gap-2.5" onClick={() => setIsOpen(false)}>
          <div className="w-8 h-8 bg-[#00D68F] rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-white dark:text-[#020C18]" />
          </div>
          <div>
            <span className="text-lg font-black text-[#00D68F] tracking-tight">SalesFlow</span>
            {(org?.name ?? configuracion.empresa) && (
              <p className="text-[10px] font-medium leading-tight truncate max-w-[140px]" style={{ color: 'var(--sf-t6)' }}>
                {org?.name ?? configuracion.empresa}
              </p>
            )}
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Principal */}
        <div className="space-y-0.5">
          <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Principal</p>
          {PRINCIPAL.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        {/* Análisis */}
        <div className="space-y-0.5">
          <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Análisis</p>
          {ANALISIS.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        {/* Herramientas */}
        <div className="space-y-0.5">
          <p className="px-4 text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>Herramientas</p>
          {HERRAMIENTAS.map((item) => <NavLink key={item.href} item={item} />)}
        </div>
      </nav>

      {/* Footer — usuario + logout */}
      <div className="px-4 py-4 space-y-3" style={{ borderTop: '1px solid var(--sf-border-subtle)' }}>
        {user?.email && (
          <div className="px-1 space-y-1">
            <p className="text-[11px] font-medium truncate" style={{ color: 'var(--sf-t6)' }} title={user.email}>
              {user.email}
            </p>
            <span className={`inline-block text-[9px] font-semibold px-1.5 py-0.5 rounded ${
              (currentRole ?? 'owner') === 'owner'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
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
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-4 py-2 rounded-lg text-sm hover:text-red-400 transition-all cursor-pointer"
          style={{ color: 'var(--sf-t5)' }}
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
        <div className="flex items-center px-1">
          <p className="text-[10px]" style={{ color: 'var(--sf-t8)' }}>v2.0 · SalesFlow</p>
        </div>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="sf-sidebar hidden md:flex flex-col w-60 shrink-0 h-screen sticky top-0" style={{ background: 'var(--sf-sidebar)', borderRight: '1px solid var(--sf-border-subtle)' }}>
        <SidebarContent />
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
