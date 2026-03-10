import { useState, useMemo, type FC } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { cn } from '../lib/utils'
import type { ClasificacionInventario, CategoriaInventario } from '../types'
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, LabelList } from 'recharts'
import { ChevronDown, ChevronUp, Upload } from 'lucide-react'

// ─── Orden y configuración de clasificaciones ────────────────────────────────

const ORDER: ClasificacionInventario[] = [
  'riesgo_quiebre',
  'baja_cobertura',
  'normal',
  'lento_movimiento',
  'sin_movimiento',
]

const CLASI_CONFIG: Record<
  ClasificacionInventario,
  { label: string; color: string; dotClass: string; textClass: string; borderClass: string; defaultOpen: boolean }
> = {
  riesgo_quiebre:   { label: 'Riesgo de quiebre',  color: '#ff4d6d', dotClass: 'bg-[#ff4d6d]', textClass: 'text-[#ff4d6d]', borderClass: 'border-[#ff4d6d]/20', defaultOpen: true  },
  baja_cobertura:   { label: 'Baja cobertura',      color: '#ffaa00', dotClass: 'bg-[#ffaa00]', textClass: 'text-[#ffaa00]', borderClass: 'border-[#ffaa00]/20', defaultOpen: true  },
  normal:           { label: 'Normal',              color: '#00d084', dotClass: 'bg-[#00d084]', textClass: 'text-[#00d084]', borderClass: 'border-[#00d084]/20', defaultOpen: false },
  lento_movimiento: { label: 'Lento movimiento',    color: '#4a6280', dotClass: 'bg-[#4a6280]', textClass: 'text-[#4a6280]', borderClass: 'border-[#4a6280]/20', defaultOpen: false },
  sin_movimiento:   { label: 'Sin movimiento',      color: '#2a3a4a', dotClass: 'bg-zinc-700',  textClass: 'text-zinc-500',  borderClass: 'border-zinc-700/30',  defaultOpen: false },
}

// ─── Label dentro de cada segmento de barra ──────────────────────────────────

const makeSegmentLabel = (total: number) => (props: any) => {
  const { x, y, width, height, value } = props
  if (!width || !value || total === 0) return null
  const pct = (value / total) * 100
  if (pct < 5) return null
  return (
    <text
      x={x + width / 2}
      y={y + height / 2}
      textAnchor="middle"
      dominantBaseline="middle"
      fill="rgba(255,255,255,0.9)"
      fontSize={10}
      fontWeight={700}
    >
      {pct.toFixed(0)}%
    </text>
  )
}

// ─── Sección colapsable por categoría ────────────────────────────────────────

interface CategorySectionProps {
  clasificacion: ClasificacionInventario
  items: CategoriaInventario[]
  totalUnits: number
  hasCategoria: boolean
}

const CategorySection: FC<CategorySectionProps> = ({ clasificacion, items, totalUnits, hasCategoria }) => {
  const cfg = CLASI_CONFIG[clasificacion]
  const [expanded, setExpanded] = useState(cfg.defaultOpen)

  if (items.length === 0) return null

  const sorted = [...items].sort((a, b) => a.dias_inventario - b.dias_inventario)
  const sectionUnits = items.reduce((s, i) => s + i.unidades_actuales, 0)
  const pct = totalUnits > 0 ? (sectionUnits / totalUnits) * 100 : 0

  const diasColor = (c: ClasificacionInventario) => {
    if (c === 'riesgo_quiebre')   return 'text-[#ff4d6d]'
    if (c === 'baja_cobertura')   return 'text-[#ffaa00]'
    if (c === 'normal')           return 'text-[#00d084]'
    if (c === 'lento_movimiento') return 'text-[#4a6280]'
    return 'text-zinc-700'
  }

  return (
    <div className={cn('border rounded-2xl overflow-hidden bg-zinc-950/30', cfg.borderClass)}>
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/[0.03] transition-colors"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className={cn('w-2.5 h-2.5 rounded-full shrink-0', cfg.dotClass)} />
          <span className={cn('text-sm font-bold uppercase tracking-wider shrink-0', cfg.textClass)}>
            {cfg.label}
          </span>
          <span className="text-xs text-zinc-600 truncate">
            {items.length} producto{items.length !== 1 ? 's' : ''} · {sectionUnits.toLocaleString()} uds · {pct.toFixed(1)}%
          </span>
        </div>
        {expanded
          ? <ChevronUp className="w-4 h-4 text-zinc-600 shrink-0" />
          : <ChevronDown className="w-4 h-4 text-zinc-600 shrink-0" />
        }
      </button>

      {expanded && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-xs text-left">
            <thead className="bg-zinc-900/60 text-zinc-600 font-bold uppercase tracking-wider text-[10px]">
              <tr>
                <th className="px-5 py-3">Producto</th>
                {hasCategoria && <th className="px-4 py-3">Categoría</th>}
                <th className="px-4 py-3 text-right">Uds. actuales</th>
                <th className="px-4 py-3 text-right">PM3</th>
                <th className="px-4 py-3 text-right">Días inv.</th>
                <th className="px-4 py-3 text-center">Estado</th>
                <th className="px-4 py-3 text-right">Último mov.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800">
              {sorted.map((item) => (
                <tr key={item.producto} className="hover:bg-zinc-900/30 transition-colors">
                  <td className="px-5 py-3 font-bold text-zinc-200">{item.producto}</td>
                  {hasCategoria && <td className="px-4 py-3 text-zinc-500">{item.categoria}</td>}
                  <td className="px-4 py-3 text-right font-mono text-zinc-300">{item.unidades_actuales.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right font-mono text-zinc-500">{item.pm3.toFixed(0)}</td>
                  <td className={cn('px-4 py-3 text-right font-bold font-mono', diasColor(clasificacion))}>
                    {item.dias_inventario >= 9999 ? '∞' : item.dias_inventario}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {clasificacion === 'sin_movimiento' ? (
                      <span className="px-2 py-0.5 rounded bg-zinc-800 text-zinc-500 text-[9px] font-bold uppercase">
                        Sin mov.
                      </span>
                    ) : (
                      <span className={cn(
                        'px-2 py-0.5 rounded text-[9px] font-bold uppercase',
                        clasificacion === 'riesgo_quiebre'   ? 'bg-[#ff4d6d]/15 text-[#ff4d6d]' :
                        clasificacion === 'baja_cobertura'   ? 'bg-[#ffaa00]/15 text-[#ffaa00]' :
                        clasificacion === 'normal'           ? 'bg-[#00d084]/15 text-[#00d084]' :
                        'bg-[#4a6280]/15 text-[#4a6280]'
                      )}>
                        {cfg.label}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right text-zinc-600 text-[10px]">
                    {item.ultimo_movimiento
                      ? new Date(item.ultimo_movimiento).toLocaleDateString('es-MX', { month: 'short', day: 'numeric' })
                      : '—'
                    }
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function RotacionPage() {
  useAnalysis()
  const navigate = useNavigate()
  const { categoriasInventario, dataAvailability } = useAppStore()

  // Todos los hooks antes del return condicional
  const grouped = useMemo(() => {
    const g: Record<ClasificacionInventario, CategoriaInventario[]> = {
      riesgo_quiebre: [], baja_cobertura: [], normal: [], lento_movimiento: [], sin_movimiento: [],
    }
    categoriasInventario.forEach((item) => g[item.clasificacion].push(item))
    return g
  }, [categoriasInventario])

  const totalUnits = useMemo(
    () => categoriasInventario.reduce((s, i) => s + i.unidades_actuales, 0),
    [categoriasInventario],
  )

  const barRow = useMemo(() => {
    const row: Record<string, number | string> = { name: '' }
    ORDER.forEach((k) => {
      row[k] = grouped[k].reduce((s, i) => s + i.unidades_actuales, 0)
    })
    return [row]
  }, [grouped])

  if (!dataAvailability.has_inventario) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-4 animate-in fade-in duration-500">
        <div className="text-5xl">📦</div>
        <div className="text-center">
          <p className="text-zinc-300 font-bold text-lg">Sin datos de inventario</p>
          <p className="text-zinc-500 text-sm mt-1">
            Carga un archivo de inventario para ver la rotación de productos
          </p>
        </div>
        <button
          onClick={() => navigate('/cargar')}
          className="flex items-center gap-2 px-4 py-2 bg-[#00B894] text-black font-bold rounded-xl text-sm hover:bg-[#00a884] transition-colors"
        >
          <Upload className="w-4 h-4" />
          Cargar datos
        </button>
      </div>
    )
  }

  const totalProducts = categoriasInventario.length
  const hasCategoria = dataAvailability.has_categoria

  return (
    <div className="space-y-8 pb-20 animate-in fade-in duration-500">

      {/* Título */}
      <div>
        <h1 className="text-3xl font-bold text-zinc-50 tracking-tight">Rotación de Inventario</h1>
        <p className="text-zinc-500 mt-1">
          {totalProducts} productos · {totalUnits.toLocaleString()} unidades totales
        </p>
      </div>

      {/* Gráfica de barra horizontal apilada */}
      <section className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 space-y-5">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600">
          Distribución del inventario total
        </p>

        <ResponsiveContainer width="100%" height={52}>
          <BarChart
            data={barRow}
            layout="vertical"
            margin={{ top: 0, right: 0, bottom: 0, left: 0 }}
            barCategoryGap={0}
          >
            <XAxis type="number" hide domain={[0, totalUnits]} />
            <YAxis type="category" hide width={0} />
            {ORDER.map((k) => (
              <Bar key={k} dataKey={k} stackId="a" fill={CLASI_CONFIG[k].color} isAnimationActive={false}>
                <LabelList content={makeSegmentLabel(totalUnits)} />
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>

        {/* Leyenda */}
        <div className="border-t border-zinc-800 pt-4 space-y-2">
          {ORDER.map((k) => {
            const cfg = CLASI_CONFIG[k]
            const units = grouped[k].reduce((s, i) => s + i.unidades_actuales, 0)
            const pct = totalUnits > 0 ? (units / totalUnits) * 100 : 0
            return (
              <div key={k} className="grid grid-cols-[12px_1fr_auto_auto_auto] items-center gap-3 text-xs">
                <span className="w-3 h-3 rounded-sm shrink-0" style={{ backgroundColor: cfg.color }} />
                <span className="text-zinc-400">{cfg.label}</span>
                <span className="text-zinc-600 font-mono text-right w-16">{grouped[k].length} prod.</span>
                <span className="text-zinc-400 font-mono text-right w-24">{units.toLocaleString()} uds</span>
                <span className="text-zinc-500 font-mono text-right w-12">{pct.toFixed(1)}%</span>
              </div>
            )
          })}
          <div className="border-t border-zinc-800 pt-2 grid grid-cols-[12px_1fr_auto_auto_auto] items-center gap-3 text-xs font-bold">
            <span />
            <span className="text-zinc-300">Total</span>
            <span className="text-zinc-400 font-mono text-right w-16">{totalProducts} prod.</span>
            <span className="text-zinc-300 font-mono text-right w-24">{totalUnits.toLocaleString()} uds</span>
            <span className="text-zinc-400 font-mono text-right w-12">100%</span>
          </div>
        </div>
      </section>

      {/* Secciones por categoría */}
      <div className="space-y-3">
        {ORDER.map((k) => (
          <CategorySection
            key={k}
            clasificacion={k}
            items={grouped[k]}
            totalUnits={totalUnits}
            hasCategoria={hasCategoria}
          />
        ))}
      </div>

    </div>
  )
}
