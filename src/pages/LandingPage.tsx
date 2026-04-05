import { Link } from 'react-router-dom'
import { Shield, Zap, BrainCircuit, Upload, BarChart3, FileText, Users, TrendingDown, ArrowRight } from 'lucide-react'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

export default function LandingPage() {
  return (
    <PublicLayout>
      <SEOHead />
      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="sf-fade-up">
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight"
                style={{ color: 'var(--sf-t1)' }}
              >
                Inteligencia comercial que detecta riesgos{' '}
                <span className="text-[#00D68F]">antes de que se conviertan en pérdidas</span>
              </h1>
              <p
                className="mt-5 text-base sm:text-lg leading-relaxed max-w-xl"
                style={{ color: 'var(--sf-t3)' }}
              >
                SalesFlow analiza tus ventas y te dice qué vendedores están fallando, qué clientes
                se están perdiendo y qué hacer — todo automáticamente, sin saber de datos.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/login"
                  state={{ mode: 'register' }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#00D68F' }}
                >
                  Probar 14 días gratis
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/login"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-base font-semibold border transition-colors hover:border-[#00D68F]"
                  style={{
                    borderColor: 'var(--sf-border)',
                    color: 'var(--sf-t2)',
                    background: 'transparent',
                  }}
                >
                  Ver demo en vivo
                </Link>
              </div>
            </div>
            {/* Hero — dashboard mockup */}
            <div className="sf-fade-up hidden lg:flex items-center justify-center relative" style={{ animationDelay: '0.15s' }}>
              {/* Glow effect */}
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse at center, rgba(0,214,143,0.12) 0%, transparent 70%)' }} />
              <div className="w-full max-w-lg rounded-2xl overflow-hidden relative" style={{ boxShadow: '0 25px 50px rgba(0,214,143,0.1)', border: '1px solid rgba(51,65,85,0.5)' }}>
                {/* Browser bar */}
                <div className="h-8 bg-slate-800 flex items-center px-3 border-b border-slate-700">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-[10px] text-slate-400 mx-auto select-none">data-solutions-hub.com</span>
                </div>
                {/* Dashboard body */}
                <div className="bg-slate-900 p-3">
                  {/* Header */}
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Estado Comercial</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Mar 2026</span>
                  </div>
                  {/* KPI row */}
                  <div className="flex gap-2">
                    <div className="flex-1 bg-slate-800 rounded-lg p-2">
                      <div className="text-[9px] text-slate-400">Proyección</div>
                      <div className="text-xs font-bold text-emerald-400">USD 325,848</div>
                    </div>
                    <div className="flex-1 bg-slate-800 rounded-lg p-2">
                      <div className="text-[9px] text-slate-400">YTD vs anterior</div>
                      <div className="text-xs font-bold text-emerald-400">+6.3%</div>
                    </div>
                    <div className="flex-1 bg-slate-800 rounded-lg p-2">
                      <div className="text-[9px] text-slate-400">Alertas</div>
                      <div className="text-xs font-bold text-amber-400">30 activas</div>
                    </div>
                  </div>
                  {/* Mini chart */}
                  <div className="mt-2 bg-slate-800 rounded-lg p-2">
                    <div className="text-[9px] text-slate-400 mb-1.5">Evolución YTD</div>
                    <div className="flex items-end justify-center gap-4 h-12">
                      {[
                        { label: 'Ene', prev: 16, curr: 20 },
                        { label: 'Feb', prev: 20, curr: 28 },
                        { label: 'Mar', prev: 24, curr: 32 },
                      ].map((m) => (
                        <div key={m.label} className="flex flex-col items-center gap-0.5">
                          <div className="flex items-end gap-0.5">
                            <div className="w-3 rounded-sm bg-slate-600" style={{ height: m.prev }} />
                            <div className="w-3 rounded-sm bg-emerald-500" style={{ height: m.curr }} />
                          </div>
                          <span className="text-[8px] text-slate-500">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {/* Alert rows */}
                  <div className="mt-2 space-y-1">
                    <div className="bg-red-500/10 border-l-2 border-red-500 rounded p-1.5">
                      <div className="text-[9px] text-slate-300 font-medium">Doble riesgo — Carlos Ramírez</div>
                      <div className="text-[8px] text-slate-500">2 clientes dormidos · Recovery: difícil</div>
                    </div>
                    <div className="bg-amber-500/10 border-l-2 border-amber-500 rounded p-1.5">
                      <div className="text-[9px] text-slate-300 font-medium">Equipo no cerrará la meta del mes</div>
                      <div className="text-[8px] text-slate-500">Brecha: 23,473 uds de 46,057</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust bar ────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid var(--sf-border)', borderBottom: '1px solid var(--sf-border)', background: 'var(--sf-inset)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--sf-t5)' }}>
            Diseñado para equipos comerciales en LATAM
          </p>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
            {[
              { num: '22', label: 'Patrones de riesgo' },
              { num: 'IA', label: 'Alertas accionables' },
              { num: '< 2 min', label: 'Resultados en minutos' },
              { num: '0', label: 'Curva de aprendizaje' },
            ].map((item) => (
              <div key={item.label}>
                <div className="text-xl font-bold text-[#00D68F]">{item.num}</div>
                <div className="text-xs mt-0.5" style={{ color: 'var(--sf-t4)' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Problem → Solution ──────────────────────────────── */}
      <section className="sf-fade-up">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="grid md:grid-cols-2 gap-8 lg:gap-16">
            {/* Problem */}
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: 'var(--sf-red-bg)', border: '1px solid var(--sf-red-border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <TrendingDown className="w-5 h-5" style={{ color: 'var(--sf-red)' }} />
                <h3 className="text-lg font-bold" style={{ color: 'var(--sf-red)' }}>El problema</h3>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t2)' }}>
                Tu equipo usa Excel para todo. Los reportes llegan tarde. No sabes qué vendedores
                están perdiendo clientes hasta que ya es tarde. Las decisiones se toman con
                intuición, no con datos.
              </p>
            </div>
            {/* Solution */}
            <div
              className="rounded-2xl p-6 sm:p-8"
              style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}
            >
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-5 h-5" style={{ color: 'var(--sf-green)' }} />
                <h3 className="text-lg font-bold" style={{ color: 'var(--sf-green)' }}>La solución</h3>
              </div>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t2)' }}>
                SalesFlow lee tu archivo de ventas y te dice exactamente qué está pasando:
                vendedores en riesgo, clientes dormidos, productos estancados, y lo que deberías
                hacer al respecto.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Features ─────────────────────────────────────────── */}
      <section className="sf-fade-up" style={{ background: 'var(--sf-inset)' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12" style={{ color: 'var(--sf-t1)' }}>
            ¿Qué hace SalesFlow por ti?
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: Shield,
                title: 'Detección automática de riesgos',
                desc: '22 patrones que identifican dependencias de vendedores, clientes en fuga, canales migrando volumen y más.',
              },
              {
                icon: Zap,
                title: 'Alertas accionables, no dashboards',
                desc: 'No necesitas interpretar gráficas. SalesFlow te dice qué pasa y qué hacer al respecto.',
              },
              {
                icon: BrainCircuit,
                title: 'Análisis con IA',
                desc: 'Cada alerta viene con un análisis que explica el porqué y sugiere acciones concretas.',
              },
            ].map((f) => (
              <div
                key={f.title}
                className="rounded-2xl p-6"
                style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-4"
                  style={{ background: 'rgba(0,214,143,0.1)' }}
                >
                  <f.icon className="w-5 h-5 text-[#00D68F]" />
                </div>
                <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--sf-t1)' }}>{f.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t3)' }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section className="sf-fade-up">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-12" style={{ color: 'var(--sf-t1)' }}>
            Cómo funciona
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: 1,
                icon: Upload,
                title: 'Sube tu archivo',
                desc: 'Arrastra tu Excel o CSV de ventas. Compatible con cualquier formato de ventas.',
              },
              {
                step: 2,
                icon: BarChart3,
                title: 'Análisis automático',
                desc: 'En segundos, SalesFlow procesa tus datos y detecta patrones de riesgo en ventas, clientes y productos.',
              },
              {
                step: 3,
                icon: FileText,
                title: 'Actúa con confianza',
                desc: 'Recibe alertas claras con recomendaciones. Comparte reportes PDF con tu equipo.',
              },
            ].map((s) => (
              <div key={s.step} className="text-center">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ background: 'rgba(0,214,143,0.1)', border: '2px solid rgba(0,214,143,0.25)' }}
                >
                  <span className="text-lg font-bold text-[#00D68F]">{s.step}</span>
                </div>
                <h3 className="text-base font-semibold mb-2" style={{ color: 'var(--sf-t1)' }}>{s.title}</h3>
                <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-t3)' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────── */}
      <section
        className="sf-fade-up"
        style={{
          background: 'linear-gradient(135deg, rgba(0,214,143,0.06) 0%, rgba(0,214,143,0.02) 100%)',
          borderTop: '1px solid rgba(0,214,143,0.15)',
          borderBottom: '1px solid rgba(0,214,143,0.15)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: 'var(--sf-t1)' }}>
            Empieza a tomar decisiones con datos, no con intuición.
          </h2>
          <Link
            to="/login"
            state={{ mode: 'register' }}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold text-white transition-opacity hover:opacity-90 mt-6"
            style={{ background: '#00D68F' }}
          >
            Probar 14 días gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-xs" style={{ color: 'var(--sf-t5)' }}>
            14 días gratis · Sin tarjeta de crédito · 2 minutos para empezar
          </p>
        </div>
      </section>

      {/* ─── Scroll animation CSS ─────────────────────────────── */}
      <style>{`
        .sf-fade-up {
          animation: sf-fade-up 0.6s ease-out both;
        }
        @keyframes sf-fade-up {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </PublicLayout>
  )
}
