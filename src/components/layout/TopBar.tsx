import { useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { Sun, Moon, DollarSign, Hash } from 'lucide-react'

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/cargar':        { title: 'Cargar Datos',        sub: 'Paso 1 · Datos de ventas' },
  '/dashboard':     { title: 'Estado Comercial',    sub: 'Alertas, semáforo de riesgo y KPIs del equipo' },
  '/vendedores':    { title: 'Vendedores',          sub: 'Desempeño individual y alertas por vendedor' },
  '/rendimiento':   { title: 'Rendimiento Anual',   sub: 'Comparativa año actual vs año anterior' },
  '/clientes':      { title: 'Clientes',            sub: 'Clientes dormidos y concentración de riesgo' },
  '/metas':         { title: 'Metas de Ventas',     sub: 'Progreso vs objetivo por vendedor' },
  '/chat':          { title: 'Asistente Virtual',    sub: 'Consulta tus datos en lenguaje natural' },
  '/configuracion': { title: 'Configuración',       sub: 'Empresa, moneda y umbrales de análisis' },
  '/departamentos': { title: 'Departamentos',       sub: 'Mapa de calor de ventas YTD por departamento' },
}

export default function TopBar() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { dataSource, configuracion, setConfiguracion, dataAvailability, setTipoMetaActivo } = useAppStore()
  const tema = configuracion.tema
  const metricaGlobal = configuracion.metricaGlobal ?? 'usd'

  const toggleTema = () => setConfiguracion({ tema: tema === 'dark' ? 'light' : 'dark' })
  const setMetricaGlobal = (m: 'usd' | 'uds') => { setConfiguracion({ metricaGlobal: m }); setTipoMetaActivo(m) }

  // Demo badge state
  const [demoHover, setDemoHover] = useState(false)
  const [demoPulse, setDemoPulse] = useState(() => {
    try { return !localStorage.getItem('sf_demo_badge_seen') } catch { return false }
  })
  const pulseCount = useRef(0)

  useEffect(() => {
    if (!demoPulse) return
    const timer = setTimeout(() => {
      pulseCount.current++
      if (pulseCount.current >= 4) setDemoPulse(false)
    }, 3000)
    return () => clearTimeout(timer)
  }, [demoPulse])

  const handleDemoBadgeInteract = () => {
    setDemoPulse(false)
    try { localStorage.setItem('sf_demo_badge_seen', 'true') } catch { /* */ }
  }

  const page = PAGE_TITLES[location.pathname] ?? { title: 'SalesFlow', sub: 'Inteligencia Comercial' }

  const iconBtnClass = "sf-no-print p-2 rounded-lg hover:bg-[var(--sf-hover)] text-[var(--sf-t4)] hover:text-[var(--sf-t1)] transition-colors"

  return (
    <header className="sf-topbar h-14 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md flex items-center justify-between pl-16 pr-6 md:px-6 sticky top-0 z-30">
      <div className="flex items-center gap-2">
        <div>
          <h1 className="text-sm font-bold text-zinc-100 leading-tight">{page.title}</h1>
          <p className="text-[11px]" style={{ color: 'var(--sf-t5)' }}>{page.sub}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        {dataSource === 'demo' && !location.pathname.startsWith('/demo') && (
          <div className="relative">
            <button
              onClick={() => {
                handleDemoBadgeInteract()
                const isDemo = location.pathname.startsWith('/demo')
                if (isDemo) {
                  navigate('/login?mode=register')
                } else {
                  navigate('/cargar')
                }
              }}
              onMouseEnter={() => { setDemoHover(true); handleDemoBadgeInteract() }}
              onMouseLeave={() => setDemoHover(false)}
              className="sf-no-print cursor-pointer transition-colors"
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                padding: '3px 10px', borderRadius: 6,
                fontSize: 11, fontWeight: 500,
                background: demoHover ? 'rgba(245,158,11,0.15)' : 'rgba(245,158,11,0.08)',
                color: '#d97706',
                border: '1px solid rgba(245,158,11,0.15)',
              }}
            >
              {location.pathname.startsWith('/demo') ? 'Demo' : 'Datos demo'}{demoHover ? ' →' : ''}
            </button>
            {demoPulse && (
              <span
                className="absolute inset-0 rounded-md animate-ping pointer-events-none"
                style={{ border: '2px solid rgba(245,158,11,0.4)', opacity: 0.3 }}
              />
            )}
            {demoHover && (
              <div
                className="absolute top-full left-1/2 mt-2 -translate-x-1/2 z-50 rounded-lg shadow-lg px-3 py-2 text-xs leading-relaxed transition-opacity duration-150"
                style={{
                  width: 200,
                  background: tema === 'dark' ? 'var(--sf-card)' : '#18181b',
                  color: tema === 'dark' ? 'var(--sf-t2)' : '#fff',
                  border: '1px solid var(--sf-border)',
                }}
              >
                <div
                  className="absolute left-1/2 -translate-x-1/2 -top-1 w-2 h-2 rotate-45"
                  style={{ background: tema === 'dark' ? 'var(--sf-card)' : '#18181b' }}
                />
                {location.pathname.startsWith('/demo')
                  ? <>Estás viendo una demo. <strong>Regístrate para analizar tus datos.</strong></>
                  : <>Estás viendo datos de ejemplo. <strong>Haz clic para subir tus datos reales.</strong></>
                }
              </div>
            )}
          </div>
        )}

        {/* [Ω.1.2] Ocultar "¿Qué hago hoy?" en /cargar mientras no haya
            datos cargados: el botón pide insights y sin datos no hay nada
            que recomendar. */}
        {!(location.pathname === '/cargar' && dataSource === 'none') && (
          <button
            onClick={() => {
              const isDemo = location.pathname.startsWith('/demo')
              const chatPath = isDemo ? '/demo/chat' : '/chat'
              const targetState = {
                prefill: '¿Qué debo hacer hoy?',
                systemOverride: 'El usuario quiere saber las 3 acciones prioritarias para hoy. Responde con exactamente 3 acciones concretas en formato numerado. Cada acción debe incluir: el nombre real de la persona o área responsable, la acción específica en máximo 10 palabras, y debajo "Por qué hoy:" con la razón en máximo 10 palabras. Sin introducción ni conclusión, solo los 3 items.',
              }
              if (location.pathname === '/chat' || location.pathname === '/demo/chat') {
                window.dispatchEvent(new CustomEvent('sf-header-action', { detail: targetState }))
              } else {
                navigate(chatPath, { state: targetState })
              }
            }}
            className="sf-no-print bg-[var(--sf-green)] hover:opacity-90 font-semibold text-xs px-3 py-1.5 rounded-lg transition-opacity"
            style={{ color: tema === 'dark' ? '#020C18' : '#fff' }}
          >
            <span className="hidden md:inline">✦ ¿Qué hago hoy?</span>
            <span className="md:hidden">✦ Hoy</span>
          </button>
        )}
        {/* Currency toggle — only when venta_neta data is available */}
        {dataAvailability.has_venta_neta && (
          <div
            className="sf-no-print relative flex items-center rounded-full p-0.5"
            style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}
          >
            {/* sliding indicator */}
            <div
              className="absolute top-0.5 bottom-0.5 rounded-full transition-all duration-200"
              style={{
                width: 'calc(50% - 2px)',
                left: metricaGlobal === 'usd' ? 2 : 'calc(50%)',
                background: tema === 'dark' ? '#475569' : 'var(--sf-card)',
                boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
              }}
            />
            <button
              onClick={() => setMetricaGlobal('usd')}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer z-10"
              style={{ color: metricaGlobal === 'usd' ? 'var(--sf-t1)' : 'var(--sf-t5)' }}
              title="Mostrar en moneda"
            >
              <DollarSign className="w-3.5 h-3.5" style={{ color: metricaGlobal === 'usd' ? '#10b981' : 'inherit' }} />
              <span className="hidden sm:inline">USD</span>
            </button>
            <button
              onClick={() => setMetricaGlobal('uds')}
              className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer z-10"
              style={{ color: metricaGlobal === 'uds' ? 'var(--sf-t1)' : 'var(--sf-t5)' }}
              title="Mostrar en unidades"
            >
              <Hash className="w-3.5 h-3.5" style={{ color: metricaGlobal === 'uds' ? '#3b82f6' : 'inherit' }} />
              <span className="hidden sm:inline">Uds</span>
            </button>
          </div>
        )}

        {/* Theme toggle */}
        <div
          className="sf-no-print relative flex items-center rounded-full p-0.5"
          style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}
        >
          {/* sliding indicator */}
          <div
            className="absolute top-0.5 bottom-0.5 rounded-full transition-all duration-200"
            style={{
              width: 'calc(50% - 2px)',
              left: tema === 'light' ? 2 : 'calc(50%)',
              background: tema === 'dark' ? '#475569' : 'var(--sf-card)',
              boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
            }}
          />
          <button
            onClick={() => tema !== 'light' && toggleTema()}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer z-10"
            style={{ color: tema === 'light' ? 'var(--sf-t1)' : 'var(--sf-t5)' }}
            title="Modo claro"
          >
            <Sun className="w-3.5 h-3.5" style={{ color: tema === 'light' ? '#d97706' : 'inherit' }} />
            <span className="hidden sm:inline">Claro</span>
          </button>
          <button
            onClick={() => tema !== 'dark' && toggleTema()}
            className="relative flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors duration-150 cursor-pointer z-10"
            style={{ color: tema === 'dark' ? '#e2e8f0' : 'var(--sf-t5)' }}
            title="Modo oscuro"
          >
            <Moon className="w-3.5 h-3.5" style={{ color: tema === 'dark' ? '#a78bfa' : 'inherit' }} />
            <span className="hidden sm:inline">Oscuro</span>
          </button>
        </div>
      </div>
    </header>
  )
}
