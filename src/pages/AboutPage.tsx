import { Link } from 'react-router-dom'
import { ArrowRight, Zap, Globe, Bot } from 'lucide-react'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

export default function AboutPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="Nosotros — SalesFlow | Inteligencia Comercial para LATAM"
        description="Conocemos la realidad de los equipos comerciales en LATAM. Creamos SalesFlow para que los gerentes dejen de adivinar y empiecen a actuar con datos."
      />

      {/* Hero */}
      <section style={{ background: '#faf9f6' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: '#1a1a2e' }}>
            Inteligencia comercial hecha para LATAM
          </h1>
          <p className="mt-4 text-base leading-relaxed" style={{ color: '#475569' }}>
            Creamos SalesFlow porque vivimos la misma realidad que nuestros usuarios.
          </p>
        </div>
      </section>

      {/* Story */}
      <section style={{ background: '#f1f5f9', borderTop: '1px solid #e2e6ef' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="space-y-5 text-base leading-relaxed" style={{ color: '#334155' }}>
            <p>
              Conocemos la realidad de los equipos comerciales en la región. Sabemos que los gerentes no tienen tiempo
              para interpretar dashboards complicados ni para cruzar reportes de Excel a mano. Sabemos que las reuniones
              de ventas se pierden en opiniones cuando deberían basarse en datos.
            </p>
            <p>
              Por eso creamos SalesFlow: una herramienta que detecta automáticamente qué está pasando en tu negocio
              y te dice qué hacer. Sin curva de aprendizaje, sin consultores, sin implementaciones de 6 meses.
              Subes tu archivo, y en 2 minutos tienes un diagnóstico completo.
            </p>
            <p>
              Nuestro motor analiza 22 patrones de riesgo comercial — desde vendedores en caída hasta clientes que
              están dejando de comprar — y los traduce en alertas claras con acciones concretas. La IA integrada
              te permite hacer preguntas sobre tus datos en lenguaje natural, como si hablaras con un analista.
            </p>
          </div>
        </div>
      </section>

      {/* Differentiators */}
      <section style={{ background: '#faf9f6', borderTop: '1px solid #e2e6ef' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <h2 className="text-2xl font-bold text-center mb-10" style={{ color: '#1a1a2e' }}>
            Lo que nos diferencia
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              {
                icon: Zap,
                title: 'Sin curva de aprendizaje',
                desc: 'Sube un archivo y obtén resultados. No necesitas saber de datos, estadística ni BI.',
              },
              {
                icon: Globe,
                title: 'Hecho para LATAM',
                desc: 'Precios en moneda local, soporte en español, y diseñado para la realidad de equipos comerciales de la región.',
              },
              {
                icon: Bot,
                title: 'IA que recomienda acciones',
                desc: 'No solo muestra gráficas — te dice qué vendedor llamar, qué cliente recuperar y qué hacer hoy.',
              },
            ].map((d) => (
              <div key={d.title} className="rounded-xl p-5 text-center" style={{ background: '#ffffff', border: '1px solid #e2e6ef' }}>
                <div className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(16,185,129,0.1)' }}>
                  <d.icon className="w-5 h-5" style={{ color: '#10b981' }} />
                </div>
                <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1a2e' }}>{d.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>{d.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)' }}>
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-14 text-center">
          <h2 className="text-xl font-bold mb-4" style={{ color: '#1a1a2e' }}>
            Prueba SalesFlow gratis
          </h2>
          <Link
            to="/login"
            state={{ mode: 'register' }}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: '#10b981' }}
          >
            Empezar ahora
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </PublicLayout>
  )
}
