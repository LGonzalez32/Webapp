import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, ChevronDown, ArrowRight } from 'lucide-react'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

// ⚠️ IMPORTANTE: Reemplazar con tu número de WhatsApp Business real
const WHATSAPP_NUMBER = '+50499999999'
const ENTERPRISE_WA = `https://wa.me/${WHATSAPP_NUMBER.replace('+', '')}?text=Hola,%20me%20interesa%20el%20plan%20Empresa%20de%20SalesFlow`

interface Plan {
  name: string
  monthlyPrice: string
  annualPrice: string
  desc: string
  features: string[]
  cta: string
  ctaHref: string
  ctaExternal?: boolean
  highlighted?: boolean
}

const PLANS: Plan[] = [
  {
    name: 'Esencial',
    monthlyPrice: '$19',
    annualPrice: '$15',
    desc: 'Para gerentes que quieren empezar con datos reales',
    features: [
      '1 usuario',
      'Hasta 10,000 registros por archivo',
      'Los 22 patrones de riesgo (alertas sin indicador de tendencia)',
      'Chat IA (25 consultas por mes)',
      'Exportar PDF',
      'Solo el mes en curso (sin historial)',
      'Soporte por email',
    ],
    cta: 'Probar 14 días gratis',
    ctaHref: '/login',
  },
  {
    name: 'Profesional',
    monthlyPrice: '$49',
    annualPrice: '$39',
    desc: 'Para equipos comerciales que necesitan visibilidad completa',
    features: [
      'Hasta 5 usuarios',
      'Registros ilimitados',
      'Los 22 patrones de riesgo CON indicadores de tendencia (↘ → ↗)',
      'Chat IA ilimitado',
      'Comparativa vs período anterior',
      'Notas colaborativas en alertas',
      'Exportar PDF con branding',
      'Historial de 18 meses',
      'Soporte prioritario por WhatsApp',
    ],
    cta: 'Probar 14 días gratis',
    ctaHref: '/login',
    highlighted: true,
  },
  {
    name: 'Empresa',
    monthlyPrice: 'Personalizado',
    annualPrice: 'Personalizado',
    desc: 'Para empresas con equipos grandes',
    features: [
      'Usuarios ilimitados',
      'Todo lo de Profesional',
      'Dashboard de supervisores',
      'Roles y permisos (gerente, vendedor, supervisor)',
      'Onboarding personalizado',
      'SLA y soporte dedicado',
    ],
    cta: 'Contactar ventas',
    ctaHref: ENTERPRISE_WA,
    ctaExternal: true,
  },
]

const COMPARE_FEATURES = [
  { label: 'Usuarios', esencial: '1', profesional: 'Hasta 5', empresa: 'Ilimitados' },
  { label: 'Registros', esencial: '10,000', profesional: 'Ilimitados', empresa: 'Ilimitados' },
  { label: 'Patrones de riesgo', esencial: '22 patrones', profesional: '22 patrones', empresa: '22 patrones' },
  { label: 'Tendencias (↘→↗)', esencial: '—', profesional: '✓', empresa: '✓' },
  { label: 'Comparativa períodos', esencial: '—', profesional: '✓', empresa: '✓' },
  { label: 'Chat IA', esencial: '25/mes', profesional: 'Ilimitado', empresa: 'Ilimitado' },
  { label: 'Notas en alertas', esencial: '—', profesional: '✓', empresa: '✓' },
  { label: 'Exportar PDF', esencial: '✓', profesional: '✓ + branding', empresa: '✓ + branding' },
  { label: 'Historial', esencial: 'Mes en curso', profesional: '18 meses', empresa: '18 meses' },
  { label: 'Soporte', esencial: 'Email', profesional: 'WhatsApp', empresa: 'Dedicado' },
  { label: 'Roles y permisos', esencial: '—', profesional: '—', empresa: '✓' },
  { label: 'Dashboard supervisores', esencial: '—', profesional: '—', empresa: '✓' },
]

const FAQS = [
  {
    q: '¿Puedo cambiar de plan después?',
    a: 'Sí, puedes subir o bajar de plan en cualquier momento. Los cambios se aplican al inicio del siguiente ciclo de facturación.',
  },
  {
    q: '¿Necesito tarjeta para empezar?',
    a: 'No. Todos los planes incluyen 14 días de prueba gratis sin tarjeta de crédito.',
  },
  {
    q: '¿Qué formatos de archivo aceptan?',
    a: 'Excel (.xlsx, .xls) y CSV. Compatible con cualquier formato de exportación.',
  },
  {
    q: '¿Mis datos están seguros?',
    a: 'Tus archivos se procesan en tu navegador y no se almacenan en nuestros servidores. Solo se guardan los resultados del análisis.',
  },
  {
    q: '¿Puedo compartir el acceso con mi equipo?',
    a: 'Sí. El plan Profesional permite hasta 5 usuarios y el plan Empresa incluye usuarios ilimitados con roles diferenciados.',
  },
]

const LOCAL_CURRENCIES: { code: string; rate: number; symbol: string }[] = [
  { code: 'USD', rate: 1, symbol: '$' },
  { code: 'MXN', rate: 20, symbol: '$' },
  { code: 'COP', rate: 4200, symbol: '$' },
  { code: 'GTQ', rate: 7.8, symbol: 'Q' },
  { code: 'HNL', rate: 25, symbol: 'L' },
  { code: 'CRC', rate: 510, symbol: '₡' },
  { code: 'PEN', rate: 3.7, symbol: 'S/' },
  { code: 'CLP', rate: 950, symbol: '$' },
  { code: 'ARS', rate: 1200, symbol: '$' },
]

export default function PricingPage() {
  const [annual, setAnnual] = useState(false)
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [currency, setCurrency] = useState('USD')

  return (
    <PublicLayout>
      <SEOHead
        title="Precios — SalesFlow | Desde $19/mes"
        description="Planes simples para equipos comerciales. Esencial $19/mes, Profesional $49/mes. 14 días de prueba gratis sin tarjeta de crédito."
      />
      {/* Header */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-8 text-center">
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: 'var(--sf-t1)' }}>
          Precios simples, sin sorpresas
        </h1>
        <p className="mt-3 text-base" style={{ color: 'var(--sf-t3)' }}>
          Todos los planes incluyen 14 días de prueba gratis.
        </p>

        {/* Toggle */}
        <div className="mt-8 inline-flex items-center gap-3 px-1.5 py-1.5 rounded-full" style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
          <button
            onClick={() => setAnnual(false)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: !annual ? '#00D68F' : 'transparent',
              color: !annual ? '#fff' : 'var(--sf-t3)',
            }}
          >
            Mensual
          </button>
          <button
            onClick={() => setAnnual(true)}
            className="px-4 py-1.5 rounded-full text-sm font-medium transition-all"
            style={{
              background: annual ? '#00D68F' : 'transparent',
              color: annual ? '#fff' : 'var(--sf-t3)',
            }}
          >
            Anual <span className="text-xs opacity-80">(-20%)</span>
          </button>
        </div>

        {/* Currency selector */}
        <div className="mt-4 flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: 'var(--sf-t4)' }}>Moneda:</span>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="text-xs font-medium px-2 py-1 rounded-lg border cursor-pointer"
            style={{ background: 'var(--sf-card)', color: 'var(--sf-t2)', borderColor: 'var(--sf-border)' }}
          >
            {LOCAL_CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
          </select>
        </div>
      </section>

      {/* Plan cards */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pb-16">
        <div className="grid md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => {
            const price = annual ? plan.annualPrice : plan.monthlyPrice
            const cur = LOCAL_CURRENCIES.find(c => c.code === currency) ?? LOCAL_CURRENCIES[0]
            const isCustom = price === 'Personalizado'
            return (
              <div
                key={plan.name}
                className="rounded-2xl p-6 relative"
                style={{
                  background: 'var(--sf-card)',
                  border: plan.highlighted
                    ? '2px solid #00D68F'
                    : '1px solid var(--sf-border)',
                }}
              >
                {plan.highlighted && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 rounded-full text-xs font-semibold text-white"
                    style={{ background: '#00D68F' }}
                  >
                    Más popular
                  </div>
                )}
                <h3 className="text-lg font-bold" style={{ color: 'var(--sf-t1)' }}>{plan.name}</h3>
                <p className="text-xs mt-1 mb-4" style={{ color: 'var(--sf-t4)' }}>{plan.desc}</p>
                <div className="mb-6">
                  <span className="text-3xl font-extrabold" style={{ color: 'var(--sf-t1)' }}>
                    {price}
                  </span>
                  {!isCustom && <span className="text-sm ml-1" style={{ color: 'var(--sf-t4)' }}>/mes</span>}
                  {!isCustom && currency !== 'USD' && (() => {
                    const usd = parseInt(price.replace('$', ''))
                    const local = Math.round(usd * cur.rate)
                    return (
                      <p className="text-xs mt-1" style={{ color: 'var(--sf-t4)' }}>
                        ~{cur.symbol}{local.toLocaleString()} {cur.code}
                      </p>
                    )
                  })()}
                </div>
                <ul className="space-y-2.5 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: 'var(--sf-t2)' }}>
                      <Check className="w-4 h-4 text-[#00D68F] shrink-0 mt-0.5" />
                      {f}
                    </li>
                  ))}
                </ul>
                {plan.ctaExternal ? (
                  <a
                    href={plan.ctaHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90 border"
                    style={{
                      borderColor: 'var(--sf-border)',
                      color: 'var(--sf-t1)',
                    }}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    to={plan.ctaHref}
                    state={{ mode: 'register' }}
                    className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: plan.highlighted ? '#00D68F' : 'transparent',
                      color: plan.highlighted ? '#fff' : 'var(--sf-t1)',
                      border: plan.highlighted ? 'none' : '1px solid var(--sf-border)',
                    }}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ background: 'var(--sf-inset)' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
          <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--sf-t1)' }}>
            Comparativa de planes
          </h2>
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--sf-border)', background: 'var(--sf-card)' }}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ borderBottom: '2px solid var(--sf-border)' }}>
                    <th className="text-left py-3 px-4 font-medium" style={{ color: 'var(--sf-t4)' }}>Feature</th>
                    <th className="text-center py-3 px-4 font-semibold" style={{ color: 'var(--sf-t2)' }}>Esencial</th>
                    <th className="text-center py-3 px-4 font-semibold text-[#00D68F]">Profesional</th>
                    <th className="text-center py-3 px-4 font-semibold" style={{ color: 'var(--sf-t2)' }}>Empresa</th>
                  </tr>
                </thead>
                <tbody>
                  {COMPARE_FEATURES.map((row, i) => (
                    <tr key={row.label} style={{ borderBottom: i < COMPARE_FEATURES.length - 1 ? '1px solid var(--sf-border)' : 'none' }}>
                      <td className="py-2.5 px-4 font-medium" style={{ color: 'var(--sf-t2)' }}>{row.label}</td>
                      <td className="py-2.5 px-4 text-center" style={{ color: row.esencial === '✓' ? '#00D68F' : 'var(--sf-t4)' }}>{row.esencial}</td>
                      <td className="py-2.5 px-4 text-center" style={{ color: row.profesional === '✓' ? '#00D68F' : 'var(--sf-t4)' }}>{row.profesional}</td>
                      <td className="py-2.5 px-4 text-center" style={{ color: row.empresa === '✓' ? '#00D68F' : 'var(--sf-t4)' }}>{row.empresa}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <h2 className="text-2xl font-bold text-center mb-8" style={{ color: 'var(--sf-t1)' }}>
          Preguntas frecuentes
        </h2>
        <div className="space-y-2">
          {FAQS.map((faq, i) => (
            <div
              key={i}
              className="rounded-xl overflow-hidden"
              style={{ border: '1px solid var(--sf-border)', background: 'var(--sf-card)' }}
            >
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full flex items-center justify-between px-5 py-4 text-left"
              >
                <span className="text-sm font-medium" style={{ color: 'var(--sf-t1)' }}>{faq.q}</span>
                <ChevronDown
                  className="w-4 h-4 shrink-0 transition-transform"
                  style={{
                    color: 'var(--sf-t4)',
                    transform: openFaq === i ? 'rotate(180deg)' : 'rotate(0)',
                  }}
                />
              </button>
              {openFaq === i && (
                <div className="px-5 pb-4 text-sm leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
                  {faq.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom CTA */}
      <section
        style={{
          background: 'linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(0,214,143,0.02) 100%)',
          borderTop: '1px solid rgba(0,214,143,0.15)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
          <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--sf-t1)' }}>
            ¿Listo para dejar de adivinar?
          </h2>
          <Link
            to="/login"
            state={{ mode: 'register' }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#00D68F' }}
          >
            Probar 14 días gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
