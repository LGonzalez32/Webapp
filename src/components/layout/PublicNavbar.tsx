import type { MouseEvent } from 'react'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Zap, Menu, X } from 'lucide-react'
import { useAuthStore } from '../../store/authStore'

export default function PublicNavbar() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()
  const session = useAuthStore((s) => s.session)

  const links = [
    { label: 'Inicio', href: '/' },
    { label: 'Funciones', href: '/#funciones' },
    { label: 'Precios', href: '/#precios' },
  ]

  const isActive = (href: string) => location.pathname === href

  return (
    <nav
      className="sticky top-0 z-40 border-b"
      style={{
        background: '#f8f9fc',
        borderColor: '#e2e6ef',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0">
            <div className="w-8 h-8 bg-[#00D68F] rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white dark:text-[#020C18]" />
            </div>
            <span className="text-lg font-black text-[#00D68F] tracking-tight">SalesFlow</span>
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            {links.map((l) => {
              const isAnchor = l.href.includes('#')
              if (isAnchor) {
                const scrollToSection = (e: MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault()
                  if (location.pathname === '/') {
                    const id = l.href.split('#')[1]
                    const el = document.getElementById(id)
                    if (el) {
                      const top = el.getBoundingClientRect().top + window.scrollY - 80
                      window.scrollTo({ top, behavior: 'smooth' })
                    }
                  } else {
                    window.location.href = l.href
                  }
                }
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={scrollToSection}
                    className="text-sm font-medium transition-colors cursor-pointer"
                    style={{ color: '#64748b' }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = '#1a1816')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = '#64748b')}
                  >
                    {l.label}
                  </a>
                )
              }
              return (
                <Link
                  key={l.href}
                  to={l.href}
                  className="text-sm font-medium transition-colors"
                  style={{
                    color: isActive(l.href) ? '#059669' : '#64748b',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#1a1816')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = isActive(l.href) ? '#059669' : '#64748b')}
                >
                  {l.label}
                </Link>
              )
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden md:flex items-center gap-3">
            {session ? (
              <Link
                to="/dashboard"
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                style={{ background: '#00D68F' }}
              >
                Ir al dashboard
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                  style={{ color: 'var(--sf-t2, #374151)' }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--sf-t1, #1a1816)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--sf-t2, #374151)')}
                >
                  Iniciar sesión
                </Link>
                <Link
                  to="/login"
                  state={{ mode: 'register' }}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#00D68F' }}
                >
                  Registrarse
                </Link>
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            className="md:hidden p-2 rounded-lg"
            onClick={() => setMobileOpen(!mobileOpen)}
            style={{ color: 'var(--sf-t2, #374151)' }}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div
          className="md:hidden border-t"
          style={{
            background: '#ffffff',
            borderColor: 'var(--sf-border, #e2e6ef)',
          }}
        >
          <div className="px-4 py-4 space-y-3">
            {links.map((l) => {
              const isAnchor = l.href.includes('#')
              if (isAnchor) {
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    onClick={(e) => {
                      setMobileOpen(false)
                      if (location.pathname === '/') {
                        e.preventDefault()
                        const id = l.href.split('#')[1]
                        const el = document.getElementById(id)
                        if (el) {
                          const top = el.getBoundingClientRect().top + window.scrollY - 80
                          window.scrollTo({ top, behavior: 'smooth' })
                        }
                      }
                    }}
                    className="block text-sm font-medium py-2"
                    style={{ color: '#374151' }}
                  >
                    {l.label}
                  </a>
                )
              }
              return (
                <Link
                  key={l.href}
                  to={l.href}
                  onClick={() => setMobileOpen(false)}
                  className="block text-sm font-medium py-2"
                  style={{
                    color: isActive(l.href) ? '#059669' : '#374151',
                  }}
                >
                  {l.label}
                </Link>
              )
            })}
            <div className="pt-3 border-t space-y-2" style={{ borderColor: 'var(--sf-border, #e2e6ef)' }}>
              {session ? (
                <Link
                  to="/dashboard"
                  onClick={() => setMobileOpen(false)}
                  className="block w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                  style={{ background: '#00D68F' }}
                >
                  Ir al dashboard
                </Link>
              ) : (
                <>
                  <Link
                    to="/login"
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center px-4 py-2.5 rounded-lg text-sm font-medium border"
                    style={{ color: 'var(--sf-t2, #374151)', borderColor: 'var(--sf-border, #e2e6ef)' }}
                  >
                    Iniciar sesión
                  </Link>
                  <Link
                    to="/login"
                    state={{ mode: 'register' }}
                    onClick={() => setMobileOpen(false)}
                    className="block w-full text-center px-4 py-2.5 rounded-lg text-sm font-semibold text-white"
                    style={{ background: '#00D68F' }}
                  >
                    Registrarse
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </nav>
  )
}
