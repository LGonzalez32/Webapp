import { useMemo, useState, useRef, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { useAlertStatusStore } from '../../store/alertStatusStore'
import { getAlertKey } from '../../lib/alertKey'
import { Sun, Moon } from 'lucide-react'

const PAGE_TITLES: Record<string, { title: string; sub: string }> = {
  '/cargar':        { title: 'Cargar Datos',        sub: 'Sube tus ventas y activa el monitor comercial' },
  '/dashboard':     { title: 'Estado Comercial',    sub: 'Alertas, semáforo de riesgo y KPIs del equipo' },
  '/vendedores':    { title: 'Vendedores',          sub: 'Desempeño individual y alertas por vendedor' },
  '/rendimiento':   { title: 'Rendimiento Anual',   sub: 'Comparativa año actual vs año anterior' },
  '/clientes':      { title: 'Clientes',            sub: 'Clientes dormidos y concentración de riesgo' },
  '/metas':         { title: 'Metas de Ventas',     sub: 'Progreso vs objetivo por vendedor' },
  '/chat':          { title: 'Asistente IA',        sub: 'Consulta tus datos en lenguaje natural' },
  '/configuracion': { title: 'Configuración',       sub: 'Empresa, moneda y umbrales de análisis' },
  '/departamentos': { title: 'Departamentos',       sub: 'Mapa de calor de ventas YTD por departamento' },
}

export default function TopBar() {
  const location  = useLocation()
  const navigate  = useNavigate()
  const { dataSource, configuracion, setConfiguracion, insights } = useAppStore()
  const alertStatuses = useAlertStatusStore(s => s.alertStatuses)
  const tema = configuracion.tema
  const isDashboard = location.pathname === '/dashboard'

  const toggleTema = () => setConfiguracion({ tema: tema === 'dark' ? 'light' : 'dark' })

  const pendingCount = useMemo(() =>
    insights.filter(i => (alertStatuses[getAlertKey(i)]?.status ?? 'pending') === 'pending').length,
  [insights, alertStatuses])

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
        {pendingCount > 0 && isDashboard && (
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 10, fontWeight: 600,
            color: '#ef4444',
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.2)',
            padding: '2px 7px', borderRadius: 5,
          }}>
            {pendingCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {dataSource === 'demo' && (
          <div className="relative">
            <button
              onClick={() => { handleDemoBadgeInteract(); navigate('/cargar') }}
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
              Datos demo{demoHover ? ' →' : ''}
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
                Estás viendo datos de ejemplo. <strong>Haz clic para subir tus datos reales.</strong>
              </div>
            )}
          </div>
        )}

        <button
          onClick={() => {
            const targetState = {
              prefill: '¿Qué debo hacer hoy?',
              systemOverride: 'El usuario quiere saber las 3 acciones prioritarias para hoy. Responde con exactamente 3 acciones concretas en formato numerado. Cada acción debe incluir: el nombre real de la persona o área responsable, la acción específica en máximo 10 palabras, y debajo "Por qué hoy:" con la razón en máximo 10 palabras. Sin introducción ni conclusión, solo los 3 items.',
            }
            if (location.pathname === '/chat') {
              window.dispatchEvent(new CustomEvent('sf-header-action', { detail: targetState }))
            } else {
              navigate('/chat', { state: targetState })
            }
          }}
          className="sf-no-print bg-[var(--sf-green)] hover:opacity-90 font-semibold text-xs px-3 py-1.5 rounded-lg transition-opacity"
          style={{ color: tema === 'dark' ? '#020C18' : '#fff' }}
        >
          <span className="hidden md:inline">✦ ¿Qué hago hoy?</span>
          <span className="md:hidden">✦ Hoy</span>
        </button>
        <button
          onClick={toggleTema}
          className={iconBtnClass}
          title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
          {tema === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>
      </div>
    </header>
  )
}
