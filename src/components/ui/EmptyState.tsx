import { Upload, Sparkles } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppStore } from '../../store/appStore'
import { getDemoData, DEMO_EMPRESA } from '../../lib/demoData'

export default function EmptyState() {
  const navigate = useNavigate()
  const { setSales, setMetas, setInventory, setConfiguracion, setDataSource } = useAppStore()

  const handleLoadDemo = () => {
    const { sales, metas, inventory } = getDemoData()
    setSales(sales)
    setMetas(metas)
    setInventory(inventory)
    setConfiguracion({ empresa: DEMO_EMPRESA })
    setDataSource('demo')
    navigate('/dashboard')
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="w-20 h-20 rounded-2xl flex items-center justify-center" style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}>
        <Upload className="w-10 h-10" style={{ color: 'var(--sf-green)' }} />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold tracking-tight" style={{ color: 'var(--sf-t1)' }}>
          Aún no tienes datos
        </h2>
        <p className="max-w-sm mx-auto" style={{ color: 'var(--sf-t4)' }}>
          Sube tu primer archivo de ventas para empezar a analizar tu equipo comercial.
        </p>
      </div>
      <div className="flex flex-col sm:flex-row items-center gap-3">
        <Link
          to="/cargar"
          className="inline-flex items-center gap-2 px-8 py-3 rounded-xl font-bold text-white transition-opacity hover:opacity-90"
          style={{ background: '#00D68F' }}
        >
          <Upload className="w-4 h-4" />
          Subir archivo
        </Link>
        <button
          onClick={handleLoadDemo}
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors cursor-pointer"
          style={{ color: 'var(--sf-t3)', border: '1px solid var(--sf-border)' }}
        >
          <Sparkles className="w-4 h-4" />
          Probar con datos de ejemplo
        </button>
      </div>
    </div>
  )
}
