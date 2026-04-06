import { useState } from 'react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { Store, BarChart3, Save, Package, Bell, Info, RotateCcw, HelpCircle } from 'lucide-react'
import { GIRO_OPTIONS } from '../lib/giroOptions'

interface NotifPrefs {
  email: string
  frecuencia: 'diario' | 'semanal' | 'desactivado'
  alertas_urgentes: boolean
  resumen_ventas: boolean
  vendedores_atencion: boolean
  clientes_riesgo: boolean
}

const NOTIF_KEY = 'salesflow_notif_prefs'

function loadNotifPrefs(fallbackEmail: string): NotifPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_KEY)
    if (raw) return JSON.parse(raw)
  } catch { /* */ }
  return {
    email: fallbackEmail,
    frecuencia: 'desactivado',
    alertas_urgentes: true,
    resumen_ventas: true,
    vendedores_atencion: true,
    clientes_riesgo: true,
  }
}

function saveNotifPrefs(prefs: NotifPrefs) {
  try { localStorage.setItem(NOTIF_KEY, JSON.stringify(prefs)) } catch { /* */ }
}

const CURRENCIES = [
  { code: 'USD', name: 'Dólar Estadounidense' },
  { code: 'MXN', name: 'Peso Mexicano' },
  { code: 'GTQ', name: 'Quetzal Guatemalteco' },
  { code: 'HNL', name: 'Lempira Hondureña' },
  { code: 'CRC', name: 'Colón Costarricense' },
  { code: 'COP', name: 'Peso Colombiano' },
  { code: 'PEN', name: 'Sol Peruano' },
  { code: 'ARS', name: 'Peso Argentino' },
  { code: 'BRL', name: 'Real Brasileño' },
]

export default function ConfiguracionPage() {
  const { configuracion, setConfiguracion, setIsProcessed } = useAppStore()
  const userEmail = useAuthStore(s => s.user?.email ?? '')
  const [local, setLocal] = useState({ ...configuracion })
  const [notif, setNotif] = useState<NotifPrefs>(() => loadNotifPrefs(userEmail))
  const [notifSaved, setNotifSaved] = useState(false)


  const inventoryError =
    local.umbral_riesgo_quiebre >= local.umbral_baja_cobertura ||
    local.umbral_baja_cobertura >= local.umbral_normal

  const handleSave = () => {
    setConfiguracion(local)
    setIsProcessed(false)
  }

  return (
    <div className="max-w-2xl mx-auto space-y-8 pb-20 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-black text-zinc-50 tracking-tight">Configuración</h1>
        <p className="text-sm text-zinc-500 mt-1">Ajustes de empresa y parámetros de análisis</p>
      </div>

      {/* Empresa */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#00B894]/10 flex items-center justify-center border border-[#00B894]/20">
            <Store className="w-4 h-4 text-[#00B894]" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">Empresa</h3>
            <p className="text-[11px] text-zinc-500">Información básica del negocio</p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Nombre de la empresa
            </label>
            <input
              type="text"
              value={local.empresa}
              onChange={(e) => setLocal({ ...local, empresa: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00B894]/50 transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Moneda
            </label>
            <select
              value={local.moneda}
              onChange={(e) => setLocal({ ...local, moneda: e.target.value })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00B894]/50 transition-all"
            >
              {CURRENCIES.map((c) => (
                <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Giro del negocio
            </label>
            <select
              value={local.giro}
              onChange={(e) => setLocal({ ...local, giro: e.target.value, giro_custom: e.target.value !== 'Otro' ? '' : local.giro_custom })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00B894]/50 transition-all"
            >
              <option value="">Selecciona tu giro…</option>
              {local.giro && !(GIRO_OPTIONS as readonly string[]).includes(local.giro) && local.giro !== 'Otro' && (
                <option value={local.giro}>{local.giro}</option>
              )}
              {GIRO_OPTIONS.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            {local.giro === 'Otro' && (
              <input
                type="text"
                value={local.giro_custom}
                onChange={(e) => setLocal({ ...local, giro_custom: e.target.value })}
                placeholder="Describe tu giro de negocio"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-[#00B894]/50 transition-all mt-2"
              />
            )}
            <p className="text-[10px] text-zinc-600">Ayuda al asistente IA a entender mejor tu contexto</p>
          </div>
        </div>
      </div>

      {/* Parámetros de análisis */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
            <BarChart3 className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">Parámetros de análisis</h3>
            <p className="text-[11px] text-zinc-500">Umbrales para detección de riesgos</p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              Días cliente dormido
              <span className="relative group">
                <HelpCircle className="w-3 h-3 text-zinc-600 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-zinc-800 text-white text-xs p-2 rounded-lg max-w-xs shadow-lg whitespace-normal z-50 w-56">
                  Número de días sin compra para considerar un cliente como dormido. Si un cliente no compra en X días, se genera una alerta.
                </span>
              </span>
            </label>
            <input
              type="number"
              min={7}
              max={180}
              value={local.dias_dormido_threshold}
              onChange={(e) => setLocal({ ...local, dias_dormido_threshold: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">Días sin compra para marcar dormido</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              Semanas racha negativa
              <span className="relative group">
                <HelpCircle className="w-3 h-3 text-zinc-600 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-zinc-800 text-white text-xs p-2 rounded-lg max-w-xs shadow-lg whitespace-normal z-50 w-56">
                  Número de semanas consecutivas por debajo del promedio para marcar a un vendedor en deterioro.
                </span>
              </span>
            </label>
            <input
              type="number"
              min={1}
              max={8}
              value={local.semanas_racha_threshold}
              onChange={(e) => setLocal({ ...local, semanas_racha_threshold: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">Semanas consecutivas bajo promedio</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
              % concentración crítica
              <span className="relative group">
                <HelpCircle className="w-3 h-3 text-zinc-600 cursor-help" />
                <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-zinc-800 text-white text-xs p-2 rounded-lg max-w-xs shadow-lg whitespace-normal z-50 w-56">
                  Si un vendedor depende de un solo cliente para más de X% de sus ventas, se genera una alerta de concentración.
                </span>
              </span>
            </label>
            <input
              type="number"
              min={10}
              max={90}
              value={local.pct_concentracion_threshold}
              onChange={(e) => setLocal({ ...local, pct_concentracion_threshold: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-amber-500/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">% del total por cliente para alerta</p>
          </div>
        </div>
        <div className="px-6 pb-6 flex justify-end">
          <button
            onClick={handleSave}
            disabled={inventoryError}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#00B894] hover:bg-[#00a884] disabled:opacity-40 disabled:cursor-not-allowed text-black rounded-xl text-xs font-bold transition-all shadow-lg shadow-[#00B894]/20"
          >
            <Save className="w-3.5 h-3.5" />
            Guardar cambios
          </button>
        </div>
      </div>

      {/* Umbrales de inventario */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center border border-blue-500/20">
            <Package className="w-4 h-4 text-blue-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">Umbrales de inventario</h3>
            <p className="text-[11px] text-zinc-500">Días de cobertura para clasificación de stock (riesgo quiebre &lt; baja cobertura &lt; normal)</p>
          </div>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Riesgo quiebre (días)
            </label>
            <input
              type="number"
              min={1}
              max={30}
              value={local.umbral_riesgo_quiebre}
              onChange={(e) => setLocal({ ...local, umbral_riesgo_quiebre: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-400/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">Menos de N días → riesgo quiebre</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Baja cobertura (días)
            </label>
            <input
              type="number"
              min={2}
              max={60}
              value={local.umbral_baja_cobertura}
              onChange={(e) => setLocal({ ...local, umbral_baja_cobertura: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-400/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">Menos de N días → baja cobertura</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Stock normal (días)
            </label>
            <input
              type="number"
              min={3}
              max={120}
              value={local.umbral_normal}
              onChange={(e) => setLocal({ ...local, umbral_normal: Number(e.target.value) })}
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-blue-400/50 transition-all"
            />
            <p className="text-[10px] text-zinc-600">Menos de N días → normal (resto lento)</p>
          </div>
        </div>
        {inventoryError && (
          <div className="px-6 pb-4">
            <p className="text-xs text-red-400 font-medium">
              Los umbrales deben cumplir: riesgo quiebre &lt; baja cobertura &lt; stock normal
            </p>
          </div>
        )}
      </div>

      {/* Notificaciones */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center border border-purple-500/20">
            <Bell className="w-4 h-4 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">Notificaciones</h3>
            <p className="text-[11px] text-zinc-500">Resúmenes automáticos por email</p>
          </div>
        </div>
        <div className="p-6 space-y-6">
          {/* Email */}
          <div className="space-y-1.5">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Email</label>
            <input
              type="email"
              value={notif.email}
              onChange={e => setNotif({ ...notif, email: e.target.value })}
              placeholder="tu@email.com"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-purple-400/50 transition-all"
            />
          </div>

          {/* Frecuencia */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Frecuencia</label>
            <div className="space-y-2">
              {([
                ['diario', 'Diario (lunes a viernes)'],
                ['semanal', 'Semanal (cada lunes)'],
                ['desactivado', 'Desactivado'],
              ] as const).map(([val, label]) => (
                <label key={val} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className="w-4 h-4 rounded-full border-2 flex items-center justify-center transition-colors"
                    style={{
                      borderColor: notif.frecuencia === val ? '#a855f7' : '#3f3f46',
                      background: notif.frecuencia === val ? '#a855f720' : 'transparent',
                    }}
                  >
                    {notif.frecuencia === val && (
                      <div className="w-2 h-2 rounded-full bg-purple-500" />
                    )}
                  </div>
                  <input
                    type="radio"
                    name="frecuencia"
                    value={val}
                    checked={notif.frecuencia === val}
                    onChange={() => setNotif({ ...notif, frecuencia: val })}
                    className="sr-only"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Contenido del resumen */}
          <div className="space-y-2">
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Contenido del resumen</label>
            <div className="space-y-2">
              {([
                ['alertas_urgentes', 'Alertas nuevas urgentes'],
                ['resumen_ventas', 'Resumen de ventas del día/semana'],
                ['vendedores_atencion', 'Vendedores que necesitan atención'],
                ['clientes_riesgo', 'Clientes en riesgo de pérdida'],
              ] as const).map(([key, label]) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer group">
                  <div
                    className="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                    style={{
                      borderColor: notif[key] ? '#a855f7' : '#3f3f46',
                      background: notif[key] ? '#a855f720' : 'transparent',
                    }}
                  >
                    {notif[key] && (
                      <svg className="w-3 h-3 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={notif[key]}
                    onChange={() => setNotif({ ...notif, [key]: !notif[key] })}
                    className="sr-only"
                  />
                  <span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Guardar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => { saveNotifPrefs(notif); setNotifSaved(true); setTimeout(() => setNotifSaved(false), 2500) }}
              className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-xs font-bold transition-all"
            >
              <Save className="w-3.5 h-3.5" />
              Guardar preferencias
            </button>
            {notifSaved && (
              <span className="text-xs text-purple-400 font-medium animate-in fade-in duration-200">Guardado</span>
            )}
          </div>

          {/* Banner próximamente */}
          <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-500/5 border border-blue-500/15">
            <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300/80 leading-relaxed">
              Las notificaciones por email estarán disponibles próximamente. Tus preferencias quedarán guardadas.
            </p>
          </div>
        </div>
      </div>

      {/* Reiniciar tutorial */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-zinc-500/10 flex items-center justify-center border border-zinc-500/20">
              <RotateCcw className="w-4 h-4 text-zinc-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-zinc-50">Tutorial de bienvenida</h3>
              <p className="text-[11px] text-zinc-500">Vuelve a ver la guía introductoria de SalesFlow</p>
            </div>
          </div>
          <button
            onClick={() => {
              // localStorage.removeItem('salesflow_onboarding_completed') — para testing
              localStorage.removeItem('salesflow_onboarding_completed')
              window.location.reload()
            }}
            className="px-4 py-2 text-xs font-medium rounded-lg border border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-zinc-100 transition-colors"
          >
            Reiniciar tutorial
          </button>
        </div>
      </div>

    </div>
  )
}
