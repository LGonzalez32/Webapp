import { useState, type ReactNode, type ComponentType } from 'react'
import { Link } from 'react-router-dom'
import {
  ArrowRight, Upload, Zap, Target, BarChart3, Users, UserCheck,
  Package, Map, Bot, Sparkles, Building2, Check,
} from 'lucide-react'
import { DEPTS } from '../lib/deptPaths'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

// ─── Tab data ────────────────────────────────────────────────────────────────

interface FeatureTab {
  icon: ComponentType<{ className?: string }>
  shortName: string
  title: string
  description: string
  bullets: [string, string, string]
  visual: () => ReactNode
}

const TABS: FeatureTab[] = [
  {
    icon: BarChart3,
    shortName: 'Estado Comercial',
    title: 'Tu negocio en una sola pantalla',
    description: 'KPIs del mes, proyección de cierre y resumen por IA.',
    bullets: [
      'Evolución YTD vs año pasado',
      'Proyección automática de cierre',
      '29+ alertas de riesgo activas',
    ],
    visual: () => (
      <div className="space-y-3">
        {/* KPI row */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg p-2.5 bg-slate-800">
            <div className="text-[11px] text-slate-400">YTD</div>
            <div className="text-sm font-bold text-emerald-400">+6.3%</div>
          </div>
          <div className="flex-1 rounded-lg p-2.5 bg-slate-800">
            <div className="text-[11px] text-slate-400">Proyección</div>
            <div className="text-sm font-bold text-white">$52k</div>
          </div>
          <div className="flex-1 rounded-lg p-2.5 bg-slate-800">
            <div className="text-[11px] text-slate-400">Meta</div>
            <div className="text-sm font-bold text-white">62%</div>
          </div>
        </div>
        {/* Evolución YTD - 6 meses pareados */}
        <div className="rounded-lg bg-slate-800/60 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] text-slate-400 font-medium">Evolución YTD</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-slate-500" />
                <span className="text-[9px] text-slate-500">2025</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-emerald-500" />
                <span className="text-[9px] text-slate-500">2026</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-red-400" />
                <span className="text-[9px] text-slate-500">Bajo 2025</span>
              </div>
            </div>
          </div>
          <div className="flex items-end gap-2 justify-center h-20">
            {[
              { month: 'Ene', prev: 36, curr: 44, up: true },
              { month: 'Feb', prev: 40, curr: 48, up: true },
              { month: 'Mar', prev: 38, curr: 46, up: true },
              { month: 'Abr', prev: 44, curr: 50, up: true },
              { month: 'May', prev: 48, curr: 38, up: false },
              { month: 'Jun', prev: 46, curr: 34, up: false },
            ].map((m) => (
              <div key={m.month} className="flex flex-col items-center gap-1">
                <div className="flex items-end gap-0.5">
                  <div className="w-3 rounded-sm bg-slate-500" style={{ height: m.prev }} />
                  <div className="w-3 rounded-sm" style={{ height: m.curr, background: m.up ? '#10b981' : '#f87171' }} />
                </div>
                <span className="text-[9px] text-slate-500">{m.month}</span>
              </div>
            ))}
          </div>
        </div>
        {/* Alerta */}
        <div className="rounded-lg p-2.5" style={{ background: 'rgba(239,68,68,0.08)', borderLeft: '2px solid #ef4444' }}>
          <div className="text-[11px] text-slate-300 font-medium">Doble riesgo — C. Ramírez</div>
          <div className="text-[9px] text-slate-500">2 clientes dormidos · Recovery: difícil</div>
        </div>
      </div>
    ),
  },
  {
    icon: Bot,
    shortName: 'Chat IA',
    title: 'Pregúntale a tus datos lo que quieras',
    description: 'Un chat que conoce todo tu negocio.',
    bullets: [
      'Respuestas con datos reales',
      'Preguntas sugeridas inteligentes',
      'Exporta respuestas como imagen',
    ],
    visual: () => (
      <div className="space-y-2">
        {/* Header */}
        <div className="flex items-center gap-2 mb-1">
          <div className="w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
            <Sparkles className="w-2.5 h-2.5 text-white" />
          </div>
          <span className="text-[11px] text-slate-300 font-medium">Asistente SalesFlow</span>
          <span className="text-[10px] text-emerald-400">● conectado</span>
        </div>
        {/* User question */}
        <div className="flex justify-end">
          <div className="rounded-xl rounded-tr-sm px-3 py-1.5 bg-slate-700 max-w-[75%]">
            <span className="text-[11px] text-slate-200">¿Por qué bajaron las ventas este mes?</span>
          </div>
        </div>
        {/* AI response - structured */}
        <div className="rounded-xl px-3 py-2.5 bg-slate-800 space-y-2">
          <div className="text-[11px] text-slate-300 font-semibold">Causas principales:</div>
          <div className="space-y-1 pl-1">
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-red-400 mt-0.5">&#8226;</span>
              <span className="text-[10px] text-slate-400">Carlos Ramírez: -34% (2 clientes dormidos)</span>
            </div>
            <div className="flex items-start gap-1.5">
              <span className="text-[10px] text-red-400 mt-0.5">&#8226;</span>
              <span className="text-[10px] text-slate-400">Categoria Refrescos: -81.5% vs mes anterior</span>
            </div>
          </div>
          <div className="text-[11px] text-slate-300 font-semibold">Acción recomendada:</div>
          <div className="text-[10px] text-slate-400 pl-1">Reactivar Supermercado López (USD 45k histórico)</div>
        </div>
        {/* Suggested questions */}
        <div className="flex gap-1.5">
          <div className="flex-1 rounded-lg px-2 py-1.5 border border-slate-700 text-center">
            <span className="text-[9px] text-emerald-400">¿Plan de recuperación?</span>
          </div>
          <div className="flex-1 rounded-lg px-2 py-1.5 border border-slate-700 text-center">
            <span className="text-[9px] text-emerald-400">Detalle por vendedor</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Users,
    shortName: 'Vendedores',
    title: 'Quien vende, quien no, y por que',
    description: 'Ranking automático con alertas por vendedor.',
    bullets: [
      'Ranking por volumen y crecimiento',
      'Alertas de caída por vendedor',
      'Detalle de clientes por vendedor',
    ],
    visual: () => (
      <div className="space-y-2">
        {[
          { pos: '#1', name: 'Lopez M.', w: '88%', color: '#10b981', val: '4,230' },
          { pos: '#2', name: 'Garcia R.', w: '62%', color: '#f59e0b', val: '2,980' },
          { pos: '#3', name: 'Ruiz A.', w: '34%', color: '#ef4444', val: '1,620' },
        ].map((v) => (
          <div key={v.pos} className="flex items-center gap-2.5 rounded-lg p-2 bg-slate-800">
            <span className="text-[11px] font-bold text-slate-400 w-5">{v.pos}</span>
            <span className="text-[11px] font-medium text-slate-200 w-16 truncate">{v.name}</span>
            <div className="flex-1 h-2.5 rounded-full bg-slate-700">
              <div className="h-full rounded-full" style={{ width: v.w, background: v.color }} />
            </div>
            <span className="text-[11px] font-medium text-slate-300 w-10 text-right">{v.val}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Target,
    shortName: 'Metas',
    title: 'Sabes si vas a llegar a la meta?',
    description: 'Avance en tiempo real con proyección automática.',
    bullets: [
      'Avance del equipo en tiempo real',
      'Proyección inteligente de cierre',
      'Brecha exacta para llegar a meta',
    ],
    visual: () => (
      <div className="space-y-4">
        {/* Main progress */}
        <div>
          <div className="flex justify-between items-baseline mb-2">
            <span className="text-[11px] text-slate-400">Avance del equipo</span>
            <span className="text-lg font-bold text-emerald-400">62%</span>
          </div>
          <div className="h-4 rounded-full bg-slate-700 relative overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: '62%', background: 'linear-gradient(90deg, #10b981, #34d399)' }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-[11px] text-slate-400">4,129 uds vendidas</span>
            <span className="text-[11px] text-slate-400">Meta: 6,500 uds</span>
          </div>
        </div>
        {/* Stats row */}
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg p-2 bg-slate-800 text-center">
            <div className="text-[11px] text-slate-400">Días restantes</div>
            <div className="text-sm font-bold text-white">12</div>
          </div>
          <div className="flex-1 rounded-lg p-2 bg-slate-800 text-center">
            <div className="text-[11px] text-slate-400">Ritmo necesario</div>
            <div className="text-sm font-bold text-amber-400">198/dia</div>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: UserCheck,
    shortName: 'Clientes',
    title: 'Clientes que se te están escapando',
    description: 'Detecta clientes en riesgo antes de perderlos.',
    bullets: [
      'Clientes dormidos y en fuga',
      'Concentracion de riesgo por cliente',
      'Recuperación: fácil, media o difícil',
    ],
    visual: () => (
      <div className="space-y-2">
        {[
          { name: 'Comercial Norte', status: 'Activo', color: '#10b981', bg: 'rgba(16,185,129,0.15)' },
          { name: 'Grupo Andino', status: 'Riesgo', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)' },
          { name: 'Dist. Central', status: 'Dormido', color: '#ef4444', bg: 'rgba(239,68,68,0.15)' },
        ].map((c) => (
          <div key={c.name} className="flex items-center gap-2.5 rounded-lg p-2.5 bg-slate-800">
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: c.color }} />
            <span className="text-[11px] font-medium text-slate-200 flex-1 truncate">{c.name}</span>
            <div className="h-1.5 w-12 rounded-full bg-slate-700">
              <div className="h-full rounded-full" style={{ width: c.status === 'Activo' ? '80%' : c.status === 'Riesgo' ? '50%' : '20%', background: c.color }} />
            </div>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: c.bg, color: c.color }}
            >
              {c.status}
            </span>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Package,
    shortName: 'Inventario',
    title: 'Qué se mueve y qué no',
    description: 'Rotación de productos con alertas de estancamiento.',
    bullets: [
      'Top productos por rotación',
      'Productos estancados al instante',
      'Tendencia vs período anterior',
    ],
    visual: () => (
      <div className="space-y-1.5">
        <div className="text-[11px] text-slate-400 mb-2 font-medium">Rotación de productos</div>
        {[
          { name: 'Producto A', days: '12 dias', status: 'Alta', color: '#10b981' },
          { name: 'Producto B', days: '28 dias', status: 'Media', color: '#f59e0b' },
          { name: 'Producto C', days: '45 dias', status: 'Media', color: '#f59e0b' },
          { name: 'Producto D', days: '92 dias', status: 'Baja', color: '#ef4444' },
          { name: 'Producto E', days: '120+ dias', status: 'Estancado', color: '#ef4444' },
        ].map((p) => (
          <div key={p.name} className="flex items-center justify-between rounded-lg px-3 py-2 bg-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-1.5 rounded-full" style={{ background: p.color }} />
              <span className="text-[11px] text-slate-300">{p.name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">{p.days}</span>
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded" style={{ background: `${p.color}20`, color: p.color }}>{p.status}</span>
            </div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Map,
    shortName: 'Departamentos',
    title: 'Compara zonas y lineas de negocio',
    description: 'Cada departamento desglosado con sus propios KPIs.',
    bullets: [
      'KPIs por departamento o zona',
      'Comparativa entre líneas',
      'Alertas especificas por area',
    ],
    visual: () => {
      const heatData: Record<string, { pct: number; color: string }> = {
        'San Salvador': { pct: -17, color: '#f87171' },
        'La Libertad': { pct: 8, color: '#10b981' },
        'Santa Ana': { pct: -12, color: '#f87171' },
        'San Miguel': { pct: 15, color: '#10b981' },
        'Sonsonate': { pct: -5, color: '#f87171' },
        'La Paz': { pct: -21, color: '#f87171' },
        'Usulután': { pct: 4, color: '#10b981' },
        'Chalatenango': { pct: 11, color: '#10b981' },
        'Morazán': { pct: 6, color: '#10b981' },
      }
      return (
        <div className="space-y-2">
          {/* Leyenda */}
          <div className="flex items-center justify-between">
            <div className="text-[11px] text-slate-400 font-medium">Mapa de calor</div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-emerald-500" />
                <span className="text-[9px] text-slate-500">Sobre anterior</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-red-400" />
                <span className="text-[9px] text-slate-500">Bajo anterior</span>
              </div>
              <div className="flex items-center gap-1">
                <div className="w-2 h-2 rounded-sm bg-slate-600" />
                <span className="text-[9px] text-slate-500">Sin datos</span>
              </div>
            </div>
          </div>
          {/* SVG Map */}
          <div className="rounded-lg overflow-hidden bg-slate-800/40 p-1">
            <svg viewBox="0 0 1000 547" className="w-full h-auto">
              {Object.entries(DEPTS).map(([name, dept]) => {
                const data = heatData[name]
                const fill = data ? data.color : '#475569'
                const opacity = data ? 0.7 : 0.35
                return (
                  <g key={name}>
                    <path d={dept.path} fill={fill} opacity={opacity} stroke="#1e293b" strokeWidth="2" />
                    {dept.area !== 'sm' && (
                      <>
                        <text x={dept.lx} y={dept.ly - 6} textAnchor="middle" fill="#e2e8f0" fontSize="18" fontWeight="600">{name.replace('á', 'a').replace('ó', 'o').replace('ú', 'u')}</text>
                        {data && (
                          <text x={dept.lx} y={dept.ly + 12} textAnchor="middle" fill={data.color} fontSize="16" fontWeight="700">{data.pct > 0 ? '+' : ''}{data.pct}%</text>
                        )}
                      </>
                    )}
                  </g>
                )
              })}
            </svg>
          </div>
        </div>
      )
    },
  },
  {
    icon: Sparkles,
    shortName: '¿Qué hago hoy?',
    title: 'La pregunta que cambia todo',
    description: 'Las acciones más importantes del día, priorizadas por IA.',
    bullets: [
      'Prioridades basadas en datos reales',
      'Acciones concretas, no gráficas',
      'Se actualiza con cada archivo nuevo',
    ],
    visual: () => (
      <div className="space-y-2">
        <div className="text-[11px] text-slate-300 font-semibold mb-1">Acciones prioritarias para hoy:</div>
        {[
          {
            num: '1',
            action: 'Reactivar Supermercado Lopez',
            reason: 'Cliente más valioso (USD 45k), 35 días inactivo.',
            tagColor: '#ef4444',
            tag: 'Urgente',
          },
          {
            num: '2',
            action: 'Revisar categoria Refrescos',
            reason: 'Representa 37.5% de ventas, cayo 81.5%.',
            tagColor: '#f59e0b',
            tag: 'Importante',
          },
          {
            num: '3',
            action: 'Revisar stock de Queso Fresco 400g',
            reason: 'Solo 6 días de inventario restante.',
            tagColor: '#64748b',
            tag: 'Preventivo',
          },
        ].map((item) => (
          <div key={item.num} className="rounded-lg p-2.5 bg-slate-800">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[11px] text-slate-500 font-bold">{item.num}</span>
              <span className="text-[11px] text-slate-200 font-medium flex-1">{item.action}</span>
              <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: `${item.tagColor}20`, color: item.tagColor }}>{item.tag}</span>
            </div>
            <div className="text-[10px] text-slate-500 pl-4 italic">Por qué hoy: {item.reason}</div>
          </div>
        ))}
      </div>
    ),
  },
  {
    icon: Building2,
    shortName: 'Organización',
    title: 'Comparte con tu equipo',
    description: 'Invita miembros y controla qué puede ver cada uno.',
    bullets: [
      'Link de invitación con un clic',
      'Roles: Visor, Editor, Admin',
      'Permisos por página individual',
    ],
    visual: () => (
      <div className="space-y-2">
        {[
          { name: 'Ana M.', role: 'Admin', color: '#10b981', roleBg: 'rgba(16,185,129,0.15)' },
          { name: 'Carlos R.', role: 'Editor', color: '#3b82f6', roleBg: 'rgba(59,130,246,0.15)' },
          { name: 'Luis G.', role: 'Visor', color: '#a855f7', roleBg: 'rgba(168,85,247,0.15)' },
        ].map((m) => (
          <div key={m.name} className="flex items-center gap-2.5 rounded-lg p-2.5 bg-slate-800">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold text-white shrink-0" style={{ background: m.color }}>
              {m.name[0]}
            </div>
            <span className="text-[11px] font-medium text-slate-200 flex-1">{m.name}</span>
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
              style={{ background: m.roleBg, color: m.color }}
            >
              {m.role}
            </span>
          </div>
        ))}
      </div>
    ),
  },
]

// ─── Pricing data ────────────────────────────────────────────────────────────

interface PricingPlan {
  name: string
  priceMonthly: number | null
  priceAnnual: number | null
  priceLabel: string | null
  features: string[]
  cta: string
  href: string
  external?: boolean
  popular?: boolean
}

const PLANS: PricingPlan[] = [
  {
    name: 'Esencial',
    priceMonthly: 19,
    priceAnnual: 15,
    priceLabel: null,
    features: [
      '1 usuario',
      'Hasta 10,000 registros',
      '22 patrones de riesgo',
      'Chat IA (10 consultas/mes)',
      'Exportar PDF',
    ],
    cta: 'Probar 14 días gratis',
    href: '/login',
  },
  {
    name: 'Profesional',
    priceMonthly: 49,
    priceAnnual: 39,
    priceLabel: null,
    popular: true,
    features: [
      'Hasta 5 usuarios',
      'Registros ilimitados',
      'Tendencias (crecimiento, caída)',
      'Chat IA ilimitado',
      'Comparativa vs período anterior',
      'Historial 18 meses',
    ],
    cta: 'Probar 14 días gratis',
    href: '/login',
  },
  {
    name: 'Empresa',
    priceMonthly: null,
    priceAnnual: null,
    priceLabel: 'Personalizado',
    features: [
      'Usuarios ilimitados',
      'Todo lo de Profesional',
      'Roles y permisos',
      'Dashboard supervisores',
      'Onboarding personalizado',
    ],
    cta: 'Contactar ventas',
    href: 'https://wa.me/50499999999?text=Hola,%20me%20interesa%20el%20plan%20Empresa%20de%20SalesFlow',
    external: true,
  },
]

// ─── Component ───────────────────────────────────────────────────────────────

export default function LandingPage() {
  const [activeTab, setActiveTab] = useState(0)
  const [annual, setAnnual] = useState(false)

  const tab = TABS[activeTab]

  return (
    <PublicLayout>
      <SEOHead />

      {/* ─── Hero ─────────────────────────────────────────────── */}
      <section style={{ background: '#faf9f6' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <div className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-center">
            <div>
              <h1
                className="text-3xl sm:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight"
                style={{ color: '#1a1a2e' }}
              >
                Tu equipo de ventas tiene problemas que no puedes ver.{' '}
                <span style={{ color: '#10b981' }}>SalesFlow te los muestra.</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed max-w-xl" style={{ color: '#475569' }}>
                Sube tu archivo de ventas y en 2 minutos sabrás qué vendedores están fallando,
                qué clientes se te escapan, y qué hacer al respecto.
              </p>
              <div className="mt-8 flex flex-col sm:flex-row gap-3">
                <Link
                  to="/login"
                  state={{ mode: 'register' }}
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-base font-semibold text-white transition-opacity hover:opacity-90"
                  style={{ background: '#10b981' }}
                >
                  Probar 14 días gratis
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  to="/demo"
                  className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl text-base font-semibold transition-colors"
                  style={{ border: '1px solid #d1d5db', color: '#374151', background: 'transparent' }}
                >
                  Ver demo en vivo
                </Link>
              </div>
            </div>

            {/* Dashboard mockup */}
            <div className="hidden lg:flex items-center justify-center relative" style={{ maxHeight: 420 }}>
              <div
                className="absolute inset-0 pointer-events-none"
                style={{ background: 'radial-gradient(ellipse at center, rgba(16,185,129,0.1) 0%, transparent 70%)' }}
              />
              <div
                className="w-full max-w-lg rounded-2xl overflow-hidden relative"
                style={{ boxShadow: '0 25px 50px rgba(16,185,129,0.12)', border: '1px solid rgba(51,65,85,0.5)' }}
              >
                <div className="h-8 bg-slate-800 flex items-center px-3 border-b border-slate-700">
                  <div className="flex gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
                    <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
                  </div>
                  <span className="text-[10px] text-slate-400 mx-auto select-none">app.salesflow.com</span>
                </div>
                <div className="bg-slate-900 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-white">Estado Comercial</span>
                    <span className="text-[10px] bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded">Mar 2026</span>
                  </div>
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
                          <span className="text-[10px] text-slate-500">{m.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="bg-red-500/10 border-l-2 border-red-500 rounded p-1.5">
                      <div className="text-[9px] text-slate-300 font-medium">Doble riesgo — Carlos Ramírez</div>
                      <div className="text-[10px] text-slate-500">2 clientes dormidos - Recovery: difícil</div>
                    </div>
                    <div className="bg-amber-500/10 border-l-2 border-amber-500 rounded p-1.5">
                      <div className="text-[9px] text-slate-300 font-medium">Equipo en riesgo de no cerrar la meta</div>
                      <div className="text-[10px] text-slate-500">Proyección por debajo del objetivo</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ─── Trust bar ────────────────────────────────────────── */}
      <section style={{ borderTop: '1px solid #e2e6ef', borderBottom: '1px solid #e2e6ef', background: '#f1f5f9' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <p className="text-center text-xs font-medium uppercase tracking-wider mb-4" style={{ color: '#64748b' }}>
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
                <div className="text-xl font-bold" style={{ color: '#10b981' }}>{item.num}</div>
                <div className="text-xs mt-0.5" style={{ color: '#64748b' }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Feature Tabs ─────────────────────────────────────── */}
      <section id="funciones" style={{ background: '#faf9f6' }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: '#1a1a2e' }}>
              Funciones
            </h2>
            <p className="mt-2 text-base" style={{ color: '#64748b' }}>
              Un solo archivo. Todo este análisis.
            </p>
          </div>

          {/* Tab bar */}
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 mb-10">
            <div className="flex gap-1 min-w-max sm:flex-wrap sm:min-w-0 sm:justify-center">
              {TABS.map((t, i) => {
                const isActive = i === activeTab
                return (
                  <button
                    key={i}
                    onClick={() => setActiveTab(i)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs sm:text-sm font-medium whitespace-nowrap transition-colors cursor-pointer"
                    style={{
                      background: isActive ? 'rgba(16,185,129,0.1)' : 'transparent',
                      color: isActive ? '#10b981' : '#64748b',
                      borderBottom: isActive ? '2px solid #10b981' : '2px solid transparent',
                    }}
                  >
                    <t.icon className="w-4 h-4 shrink-0" />
                    {t.shortName}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Tab content */}
          <div
            key={activeTab}
            className="grid lg:grid-cols-2 gap-8 lg:gap-12 items-start"
            style={{ animation: 'tabFadeIn 300ms ease-out' }}
          >
            {/* Left — text */}
            <div className="py-2">
              <h3 className="text-xl sm:text-2xl font-bold mb-2" style={{ color: '#1a1a2e' }}>
                {tab.title}
              </h3>
              <p className="text-sm leading-relaxed mb-6" style={{ color: '#64748b' }}>
                {tab.description}
              </p>
              <ul className="space-y-3">
                {tab.bullets.map((b, j) => (
                  <li key={j} className="flex items-center gap-3">
                    <div
                      className="w-5 h-5 rounded-full flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(16,185,129,0.1)' }}
                    >
                      <Check className="w-3 h-3" style={{ color: '#10b981' }} />
                    </div>
                    <span className="text-base font-medium" style={{ color: '#1a1a2e' }}>{b}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Right — visual */}
            <div className="rounded-2xl p-5" style={{ background: '#0f172a' }}>
              {tab.visual()}
            </div>
          </div>
        </div>
      </section>

      {/* ─── How it works ─────────────────────────────────────── */}
      <section style={{ background: '#f1f5f9', borderTop: '1px solid #e2e6ef', borderBottom: '1px solid #e2e6ef' }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-10 sm:py-14">
          <h2 className="text-2xl sm:text-3xl font-bold text-center mb-8" style={{ color: '#1a1a2e' }}>
            Cómo funciona
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { step: 1, icon: Upload, title: 'Sube tu archivo', desc: 'Arrastra tu Excel o CSV de ventas. Compatible con cualquier sistema.' },
              { step: 2, icon: Zap, title: 'Análisis automático', desc: 'SalesFlow detecta 22 patrones de riesgo en segundos, sin configuración.' },
              { step: 3, icon: Target, title: 'Actúa con confianza', desc: 'Recibe alertas claras con acciones concretas y análisis de IA.' },
            ].map((s) => (
              <div key={s.step} className="rounded-xl p-5 text-center" style={{ background: '#ffffff', border: '1px solid #e2e6ef' }}>
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3"
                  style={{ background: 'rgba(16,185,129,0.1)' }}
                >
                  <s.icon className="w-5 h-5" style={{ color: '#10b981' }} />
                </div>
                <div className="text-xs font-bold mb-1" style={{ color: '#10b981' }}>Paso {s.step}</div>
                <h3 className="text-sm font-bold mb-1" style={{ color: '#1a1a2e' }}>{s.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: '#64748b' }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ─── Interactive demo CTA ─────────────────────────────── */}
      <section style={{ background: '#faf9f6' }}>
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-14 sm:py-18 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-3" style={{ color: '#1a1a2e' }}>
            Descúbrelo tú mismo
          </h2>
          <p className="text-base mb-6" style={{ color: '#64748b' }}>
            Explora el dashboard completo con datos de ejemplo — sin registro, sin tarjeta.
          </p>
          <Link
            to="/demo"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold transition-opacity hover:opacity-90"
            style={{ background: '#0f172a', color: '#ffffff' }}
          >
            <Sparkles className="w-4 h-4" />
            Ver demo interactiva
          </Link>
        </div>
      </section>

      {/* ─── Pricing ──────────────────────────────────────────── */}
      <section id="precios" style={{ background: '#faf9f6' }}>
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold" style={{ color: '#1a1a2e' }}>
              Precios simples, sin sorpresas
            </h2>
            <p className="mt-2 text-base" style={{ color: '#64748b' }}>
              Todos los planes incluyen 14 días de prueba gratis.
            </p>

            {/* Toggle */}
            <div className="flex items-center justify-center gap-3 mt-6">
              <span className="text-sm font-medium" style={{ color: annual ? '#94a3b8' : '#1a1a2e' }}>
                Mensual
              </span>
              <button
                onClick={() => setAnnual(!annual)}
                className="relative w-12 h-6 rounded-full transition-colors cursor-pointer"
                style={{ background: annual ? '#10b981' : '#cbd5e1' }}
              >
                <div
                  className="absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform"
                  style={{ transform: annual ? 'translateX(26px)' : 'translateX(2px)' }}
                />
              </button>
              <span className="text-sm font-medium" style={{ color: annual ? '#1a1a2e' : '#94a3b8' }}>
                Anual
              </span>
              {annual && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
                  -20%
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className="rounded-2xl p-6 flex flex-col relative"
                style={{
                  background: '#ffffff',
                  border: plan.popular ? '2px solid #10b981' : '1px solid #e2e6ef',
                  boxShadow: plan.popular ? '0 8px 24px rgba(16,185,129,0.12)' : 'none',
                }}
              >
                {plan.popular && (
                  <div
                    className="absolute -top-3 left-1/2 -translate-x-1/2 text-xs font-bold px-3 py-0.5 rounded-full text-white"
                    style={{ background: '#10b981' }}
                  >
                    Más popular
                  </div>
                )}

                <h3 className="text-lg font-bold mb-1" style={{ color: '#1a1a2e' }}>
                  {plan.name}
                </h3>

                <div className="mb-4">
                  {plan.priceLabel ? (
                    <span className="text-2xl font-extrabold" style={{ color: '#1a1a2e' }}>
                      {plan.priceLabel}
                    </span>
                  ) : (
                    <>
                      <span className="text-3xl font-extrabold" style={{ color: '#1a1a2e' }}>
                        ${annual ? plan.priceAnnual : plan.priceMonthly}
                      </span>
                      <span className="text-sm" style={{ color: '#64748b' }}>/mes</span>
                    </>
                  )}
                </div>

                <ul className="space-y-2.5 flex-1 mb-6">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm" style={{ color: '#334155' }}>
                      <Check className="w-4 h-4 shrink-0 mt-0.5" style={{ color: '#10b981' }} />
                      {f}
                    </li>
                  ))}
                </ul>

                {plan.external ? (
                  <a
                    href={plan.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: plan.popular ? '#10b981' : 'transparent',
                      color: plan.popular ? '#ffffff' : '#1a1a2e',
                      border: plan.popular ? 'none' : '1px solid #d1d5db',
                    }}
                  >
                    {plan.cta}
                  </a>
                ) : (
                  <Link
                    to={plan.href}
                    state={{ mode: 'register' }}
                    className="block w-full text-center px-4 py-2.5 rounded-xl text-sm font-semibold transition-opacity hover:opacity-90"
                    style={{
                      background: plan.popular ? '#10b981' : 'transparent',
                      color: plan.popular ? '#ffffff' : '#1a1a2e',
                      border: plan.popular ? 'none' : '1px solid #d1d5db',
                    }}
                  >
                    {plan.cta}
                  </Link>
                )}
              </div>
            ))}
          </div>

          {/* WhatsApp help */}
          <div className="text-center mt-8">
            <p className="text-sm mb-2" style={{ color: '#94a3b8' }}>¿Tienes dudas sobre qué plan elegir?</p>
            <a
              href="https://wa.me/50499999999?text=Hola,%20tengo%20dudas%20sobre%20los%20planes%20de%20SalesFlow"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-medium transition-colors hover:underline"
              style={{ color: '#10b981' }}
            >
              Escríbenos por WhatsApp →
            </a>
          </div>
        </div>
      </section>

      {/* ─── Final CTA ────────────────────────────────────────── */}
      <section
        style={{
          background: 'linear-gradient(135deg, rgba(16,185,129,0.06) 0%, rgba(16,185,129,0.02) 100%)',
          borderBottom: '1px solid rgba(16,185,129,0.15)',
        }}
      >
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold mb-4" style={{ color: '#1a1a2e' }}>
            Empieza a tomar decisiones con datos, no con intuición.
          </h2>
          <Link
            to="/login"
            state={{ mode: 'register' }}
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-xl text-base font-semibold text-white transition-opacity hover:opacity-90 mt-6"
            style={{ background: '#10b981' }}
          >
            Probar 14 días gratis
            <ArrowRight className="w-4 h-4" />
          </Link>
          <p className="mt-4 text-xs" style={{ color: '#94a3b8' }}>
            Sin tarjeta de crédito · 2 minutos para empezar
          </p>
        </div>
      </section>

      <style>{`@keyframes tabFadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
    </PublicLayout>
  )
}
