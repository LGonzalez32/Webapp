import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { Store, BarChart3, ShieldAlert, Trash2, Save, Package } from 'lucide-react'

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
  const navigate = useNavigate()
  const { configuracion, setConfiguracion, resetAll } = useAppStore()

  const [local, setLocal] = useState({ ...configuracion })
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  const { setIsProcessed } = useAppStore()

  const inventoryError =
    local.umbral_riesgo_quiebre >= local.umbral_baja_cobertura ||
    local.umbral_baja_cobertura >= local.umbral_normal

  const handleSave = () => {
    setConfiguracion(local)
    setIsProcessed(false)
  }

  const handleReset = () => {
    resetAll()
    navigate('/cargar')
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
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Días cliente dormido
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
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              Semanas racha negativa
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
            <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">
              % concentración crítica
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

      {/* Datos y privacidad */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center border border-red-500/20">
            <ShieldAlert className="w-4 h-4 text-red-500" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-zinc-50">Datos y privacidad</h3>
            <p className="text-[11px] text-zinc-500">Todos los datos se procesan localmente en tu navegador</p>
          </div>
        </div>
        <div className="p-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-bold text-zinc-300">Borrar todos los datos</p>
            <p className="text-[11px] text-zinc-600">Elimina ventas, metas, inventario y configuración.</p>
          </div>
          <button
            onClick={() => setShowResetConfirm(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-xl text-xs font-bold transition-all border border-red-500/20"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Borrar todo
          </button>
        </div>
      </div>

      {/* Reset confirmation modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 max-w-sm w-full shadow-2xl">
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mx-auto mb-5">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-white text-center mb-2">¿Borrar todo?</h3>
            <p className="text-xs text-zinc-500 text-center mb-6">
              Se eliminarán ventas, metas, inventario y análisis. No se puede deshacer.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setShowResetConfirm(false)}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl text-xs font-bold transition-all"
              >
                Cancelar
              </button>
              <button
                onClick={handleReset}
                className="px-4 py-2.5 bg-red-500 hover:bg-red-400 text-white rounded-xl text-xs font-bold transition-all"
              >
                Sí, borrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
