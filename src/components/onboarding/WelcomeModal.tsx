import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Upload, BarChart3, Sparkles, Users, Package } from 'lucide-react'
import { useAppStore } from '../../store/appStore'
import { getDemoData, DEMO_EMPRESA } from '../../lib/demoData'

const STORAGE_KEY = 'salesflow_onboarding_completed'

export function useShowWelcome() {
  return !localStorage.getItem(STORAGE_KEY)
}

export function markWelcomeDone() {
  localStorage.setItem(STORAGE_KEY, 'true')
}

interface Step {
  icon: typeof Upload
  title: string
  text: string
  sub?: string
}

const STEPS: Step[] = [
  {
    icon: Upload,
    title: 'Bienvenido a SalesFlow',
    text: 'SalesFlow detecta riesgos en tu negocio automaticamente. Solo necesitas tu archivo de ventas — arrastra tu Excel o CSV de cualquier formato de ventas.',
    sub: 'No tienes un archivo a mano? Usa nuestros datos de ejemplo para explorar.',
  },
  {
    icon: BarChart3,
    title: 'Tu estado comercial en un vistazo',
    text: 'Detectamos automaticamente que vendedores estan fallando, que clientes se estan perdiendo, y que productos no se mueven.',
  },
  {
    icon: Users,
    title: 'Clientes y vendedores bajo la lupa',
    text: 'Identifica clientes dormidos con probabilidad de recuperacion, analiza la concentracion de riesgo y haz click en cualquier nombre para ver su perfil completo.',
  },
  {
    icon: Package,
    title: 'Rotacion de inventario inteligente',
    text: 'Visualiza productos en riesgo de quiebre, sin movimiento y con baja cobertura. La IA analiza cada producto y te dice que hacer.',
  },
  {
    icon: Sparkles,
    title: 'Preguntale a la IA que hacer hoy',
    text: 'Cada dia, SalesFlow te dice las 3 acciones mas importantes para tu negocio. Sin graficas complicadas — solo decisiones claras.',
  },
]

export default function WelcomeModal({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState(0)
  const navigate = useNavigate()
  const { setSales, setMetas, setInventory, setConfiguracion, setDataSource } = useAppStore()

  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1
  const isFirst = step === 0

  const handleClose = () => {
    markWelcomeDone()
    onClose()
  }

  const handleUpload = () => {
    markWelcomeDone()
    onClose()
    navigate('/cargar')
  }

  const handleDemo = () => {
    const { sales, metas, inventory } = getDemoData()
    setSales(sales)
    setMetas(metas)
    setInventory(inventory)
    setConfiguracion({ empresa: DEMO_EMPRESA })
    setDataSource('demo')
    markWelcomeDone()
    onClose()
    navigate('/dashboard')
  }

  const handleNext = () => {
    if (isLast) {
      handleClose()
    } else {
      setStep(s => s + 1)
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-8 shadow-2xl"
        style={{
          background: 'var(--sf-card)',
          border: '1px solid var(--sf-border)',
        }}
      >
        {/* Skip */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 text-xs font-medium transition-colors hover:opacity-80"
          style={{ color: 'var(--sf-t5)' }}
        >
          Saltar tour
        </button>

        {/* Icon */}
        <div className="flex justify-center mb-6">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}
          >
            <Icon className="w-7 h-7" style={{ color: 'var(--sf-green)' }} />
          </div>
        </div>

        {/* Content */}
        <div className="text-center space-y-3 mb-8">
          <h2
            className="text-xl font-bold"
            style={{ color: 'var(--sf-t1)' }}
          >
            {current.title}
          </h2>
          <p
            className="text-sm leading-relaxed max-w-sm mx-auto"
            style={{ color: 'var(--sf-t3)' }}
          >
            {current.text}
          </p>

          {/* Step highlights */}
          {step === 1 && (
            <div className="flex justify-center gap-3 pt-2">
              {['Resumen', 'Alertas', 'Dimensiones'].map(label => (
                <span key={label} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--sf-inset)', color: 'var(--sf-t2)', border: '1px solid var(--sf-border)' }}>
                  {label}
                </span>
              ))}
            </div>
          )}
          {step === 2 && (
            <div className="flex justify-center gap-3 pt-2">
              {['Dormidos', 'Top Clientes', 'Concentracion'].map(label => (
                <span key={label} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--sf-inset)', color: 'var(--sf-t2)', border: '1px solid var(--sf-border)' }}>
                  {label}
                </span>
              ))}
            </div>
          )}
          {step === 3 && (
            <div className="flex justify-center gap-3 pt-2">
              {['Quiebre', 'Sin movimiento', 'Cobertura'].map(label => (
                <span key={label} className="px-3 py-1.5 rounded-lg text-xs font-semibold" style={{ background: 'var(--sf-inset)', color: 'var(--sf-t2)', border: '1px solid var(--sf-border)' }}>
                  {label}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* CTAs */}
        <div className="space-y-3">
          {isFirst ? (
            <>
              <button
                onClick={handleUpload}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-colors hover:opacity-90"
                style={{ background: 'var(--sf-green)', color: '#fff' }}
              >
                Subir mi archivo
              </button>
              <button
                onClick={handleDemo}
                className="w-full py-2.5 rounded-xl text-sm font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--sf-green)' }}
              >
                Usar datos de ejemplo
              </button>
              <button
                onClick={handleNext}
                className="w-full py-2 text-xs font-medium transition-colors hover:opacity-80"
                style={{ color: 'var(--sf-t5)' }}
              >
                Saltar por ahora
              </button>
            </>
          ) : (
            <div className="flex gap-3">
              <button
                onClick={() => setStep(s => s - 1)}
                className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-colors hover:opacity-80"
                style={{ borderColor: 'var(--sf-border)', color: 'var(--sf-t3)' }}
              >
                Anterior
              </button>
              <button
                onClick={handleNext}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors hover:opacity-90"
                style={{ background: 'var(--sf-green)', color: '#fff' }}
              >
                {isLast ? 'Empezar' : 'Siguiente'}
              </button>
            </div>
          )}
        </div>

        {/* Dots */}
        <div className="flex justify-center gap-2 mt-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className="w-2 h-2 rounded-full transition-all"
              style={{
                background: i === step ? 'var(--sf-green)' : 'var(--sf-border)',
                transform: i === step ? 'scale(1.25)' : 'scale(1)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
