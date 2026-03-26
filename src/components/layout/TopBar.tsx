import { useLocation } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { ChevronLeft, ChevronRight, Sun, Moon } from 'lucide-react'

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

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

// Rutas donde el selector de período no aplica
const HIDE_PERIOD_SELECTOR = new Set(['/departamentos'])

export default function TopBar() {
  const location = useLocation()
  const { selectedPeriod, setSelectedPeriod, isProcessed, dataSource, configuracion, setConfiguracion } = useAppStore()
  const tema = configuracion.tema
  const toggleTema = () => setConfiguracion({ tema: tema === 'dark' ? 'light' : 'dark' })

  const page = PAGE_TITLES[location.pathname] ?? { title: 'SalesFlow', sub: 'Monitor de Riesgo Comercial' }

  const { year, month } = selectedPeriod

  const goPrev = () => {
    if (month === 0) setSelectedPeriod({ year: year - 1, month: 11 })
    else setSelectedPeriod({ year, month: month - 1 })
  }

  const goNext = () => {
    const now = new Date()
    const nextM = month === 11 ? 0 : month + 1
    const nextY = month === 11 ? year + 1 : year
    if (nextY > now.getFullYear() || (nextY === now.getFullYear() && nextM > now.getMonth())) return
    setSelectedPeriod({ year: nextY, month: nextM })
  }

  const isCurrentMonth = (() => {
    const now = new Date()
    return year === now.getFullYear() && month === now.getMonth()
  })()

  return (
    <header className="h-14 border-b border-zinc-800 bg-zinc-950/70 backdrop-blur-md flex items-center justify-between px-6 sticky top-0 z-30">
      <div>
        <h1 className="text-sm font-bold text-zinc-100 leading-tight">{page.title}</h1>
        <p className="text-[11px] text-zinc-600">{page.sub}</p>
      </div>

      <div className="flex items-center gap-2">
      {dataSource === 'demo' && (
        <span
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '3px 10px', borderRadius: 6,
            fontSize: 11, fontWeight: 500,
            background: 'rgba(245,158,11,0.08)',
            color: '#d97706',
            border: '1px solid rgba(245,158,11,0.15)',
          }}
        >
          Datos demo
        </span>
      )}
      <button
        onClick={toggleTema}
        className="p-2 rounded-lg hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
        title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
      >
        {tema === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
      </button>

      {isProcessed && !HIDE_PERIOD_SELECTOR.has(location.pathname) && (
        <div className="flex items-center gap-1 bg-zinc-900 border border-zinc-800 rounded-lg px-1 py-1">
          <button
            onClick={goPrev}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="px-2 text-xs font-bold text-zinc-300 min-w-[80px] text-center">
            {MESES[month]} {year}
          </span>
          <button
            onClick={goNext}
            disabled={isCurrentMonth}
            className="p-1 rounded hover:bg-zinc-800 text-zinc-500 hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
      </div>
    </header>
  )
}
