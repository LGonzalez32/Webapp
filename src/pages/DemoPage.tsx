import { useEffect, useState } from 'react'
import { Outlet, useLocation, useNavigate, Link } from 'react-router-dom'
import Sidebar from '../components/layout/Sidebar'
import TopBar from '../components/layout/TopBar'
import { Toaster } from 'sonner'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { getDemoData, DEMO_EMPRESA } from '../lib/demoData'
import { ArrowRight } from 'lucide-react'

function DemoBanner() {
  return (
    <div
      className="flex items-center justify-center gap-3 px-4 py-2 text-xs font-medium shrink-0"
      style={{ background: 'rgba(245,158,11,0.12)', color: '#d97706', borderBottom: '1px solid rgba(245,158,11,0.2)' }}
    >
      <span>Estás viendo una demo con datos de ejemplo</span>
      <Link
        to="/login?mode=register"
        className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-[11px] font-semibold text-white transition-opacity hover:opacity-90"
        style={{ background: '#10b981' }}
      >
        Regístrate gratis para analizar tus datos
        <ArrowRight className="w-3 h-3" />
      </Link>
    </div>
  )
}

export default function DemoPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sales, setSales, setMetas, setInventory, setDataSource, setConfiguracion, configuracion } = useAppStore()
  const tema = configuracion.tema
  const empresa = configuracion.empresa
  const [loaded, setLoaded] = useState(false)

  // Load demo data on mount
  useEffect(() => {
    if (loaded) return
    const { sales: demoSales, metas, inventory } = getDemoData()
    setSales(demoSales)
    setMetas(metas)
    setInventory(inventory)
    setConfiguracion({ empresa: DEMO_EMPRESA })
    setDataSource('demo')
    setLoaded(true)
  }, [loaded, setSales, setMetas, setInventory, setConfiguracion, setDataSource])

  // Trigger analysis
  useAnalysis()

  // Apply theme
  useEffect(() => {
    if (tema === 'dark') {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [tema])

  // Redirect /demo to /demo/dashboard
  useEffect(() => {
    if (location.pathname === '/demo') {
      navigate('/demo/dashboard', { replace: true })
    }
  }, [location.pathname, navigate])

  if (!loaded || sales.length === 0) {
    return (
      <div className="flex items-center justify-center h-screen" style={{ background: '#09090b' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#00D68F] mx-auto mb-3" />
          <p className="text-sm text-zinc-400">Cargando demo...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-screen overflow-hidden selection:bg-[#00D68F]/25" style={{ background: 'var(--sf-sidebar)' }}>
      <Toaster position="top-right" theme={tema} richColors />
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-zinc-950 text-zinc-200">
        <DemoBanner />
        <TopBar />
        <main className="flex-1 overflow-y-auto p-4 md:p-8" data-print-empresa={empresa || 'SalesFlow'}>
          <div key={location.pathname} className="animate-in fade-in duration-200 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  )
}
