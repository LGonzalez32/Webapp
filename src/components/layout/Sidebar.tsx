import { useState } from 'react'
import type { ComponentType } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  AlertTriangle, Users, TrendingUp, UserCheck, Target,
  Bot, Upload, Settings, Menu, X as CloseIcon, Zap, RotateCcw, LogOut, Building2,
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
  condition?: boolean
}

export default function Sidebar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { dataAvailability, configuracion, isProcessed, resetAll } = useAppStore()
  const { user } = useAuthStore()
  const org = useOrgStore(s => s.org)
  const [isOpen, setIsOpen] = useState(false)

  const handleLogout = async () => {
    await supabase.auth.signOut()
    resetAll()
    navigate('/login')
  }

  const PRINCIPAL: NavItem[] = [
    { label: 'Estado Comercial', href: '/dashboard', icon: AlertTriangle },
    { label: 'Vendedores',       href: '/vendedores', icon: Users },
    { label: 'Rendimiento Anual',href: '/rendimiento', icon: TrendingUp },
  ]

  const ANALISIS: NavItem[] = [
    { label: 'Clientes',  href: '/clientes',  icon: UserCheck,  condition: dataAvailability.has_cliente },
    { label: 'Rotación',  href: '/rotacion',  icon: RotateCcw,  condition: dataAvailability.has_inventario },
    { label: 'Metas',     href: '/metas',     icon: Target,     condition: dataAvailability.has_metas },
  ].filter((i) => i.condition !== false)

  const HERRAMIENTAS: NavItem[] = [
    { label: 'Chat IA',        href: '/chat',          icon: Bot },
    { label: 'Cargar datos',   href: '/cargar',        icon: Upload },
    { label: 'Organización',   href: '/organizacion',  icon: Building2 },
    { label: 'Configuración',  href: '/configuracion', icon: Settings },
  ]

  const NavLink: import('react').FC<{ item: NavItem }> = ({ item }) => {
    const active = location.pathname === item.href
    return (
      <Link
        to={item.href}
        onClick={() => setIsOpen(false)}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all',
          active
            ? 'bg-[#00B894]/15 text-[#00B894] font-bold'
            : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
        )}
      >
        <item.icon className={cn('w-4 h-4 shrink-0', active ? 'text-[#00B894]' : 'text-zinc-500')} />
        {item.label}
      </Link>
    )
  }

  const SidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-6 border-b border-zinc-800">
        <Link to="/" className="flex items-center gap-2.5" onClick={() => setIsOpen(false)}>
          <div className="w-8 h-8 bg-[#00B894] rounded-lg flex items-center justify-center shrink-0">
            <Zap className="w-4 h-4 text-black" />
          </div>
          <div>
            <span className="text-lg font-black text-[#00B894] tracking-tight">SalesFlow</span>
            {(org?.name ?? configuracion.empresa) && (
              <p className="text-[10px] text-zinc-600 font-medium leading-tight truncate max-w-[140px]">
                {org?.name ?? configuracion.empresa}
              </p>
            )}
          </div>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
        {/* Principal */}
        <div className="space-y-1">
          <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-zinc-700 mb-2">Principal</p>
          {PRINCIPAL.map((item) => <NavLink key={item.href} item={item} />)}
        </div>

        {/* Análisis — solo si hay datos */}
        {isProcessed && ANALISIS.length > 0 && (
          <div className="space-y-1">
            <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-zinc-700 mb-2">Análisis</p>
            {ANALISIS.map((item) => <NavLink key={item.href} item={item} />)}
          </div>
        )}

        {/* Herramientas */}
        <div className="space-y-1">
          <p className="px-4 text-[9px] font-bold uppercase tracking-widest text-zinc-700 mb-2">Herramientas</p>
          {HERRAMIENTAS.map((item) => <NavLink key={item.href} item={item} />)}
        </div>
      </nav>

      {/* Footer — usuario + logout */}
      <div className="px-4 py-4 border-t border-zinc-800 space-y-3">
        {user?.email && (
          <p className="px-1 text-[11px] text-zinc-600 font-medium truncate" title={user.email}>
            {user.email}
          </p>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-2.5 w-full px-4 py-2 rounded-xl text-sm text-zinc-500 hover:text-red-400 hover:bg-zinc-900 transition-all"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Cerrar sesión
        </button>
        <p className="px-1 text-[10px] text-zinc-800">v2.0 · SalesFlow</p>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop */}
      <aside className="hidden lg:flex flex-col w-60 shrink-0 bg-zinc-950 border-r border-zinc-800 h-screen sticky top-0">
        <SidebarContent />
      </aside>

      {/* Mobile hamburger */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-10 h-10 bg-zinc-900 border border-zinc-800 rounded-xl flex items-center justify-center text-zinc-400 hover:text-zinc-200 shadow-lg"
        >
          {isOpen ? <CloseIcon className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile drawer */}
      {isOpen && (
        <>
          <div className="lg:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setIsOpen(false)} />
          <aside className="lg:hidden fixed inset-y-0 left-0 w-64 bg-zinc-950 border-r border-zinc-800 z-50 flex flex-col shadow-2xl">
            <SidebarContent />
          </aside>
        </>
      )}
    </>
  )
}
