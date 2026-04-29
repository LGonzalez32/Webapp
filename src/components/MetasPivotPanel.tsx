// MetasPivotPanel — pivot tree multi-dim de metas con drag-drop + expand/collapse.
// Muestra Venta YTD, Meta YTD, Var, Var%, Peso% y barra de cumplimiento por
// combo de dimensiones. Mismo UX que "Analiza tus ventas" en RendimientoPage,
// pero comparando contra meta YTD (Jan → fin del mes actual) en lugar de contra
// el año anterior.

import { useState, useMemo, useEffect, type CSSProperties, type Key } from 'react'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable'
import { restrictToHorizontalAxis, restrictToParentElement } from '@dnd-kit/modifiers'
import { CSS } from '@dnd-kit/utilities'
import { Settings, GripVertical, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'
import type { MetaRecord, SaleRecord } from '../types'
import { DIM_META } from '../config/metaConfig'

type MetaDimKey =
  | 'mes' | 'vendedor' | 'cliente' | 'producto'
  | 'categoria' | 'subcategoria' | 'departamento' | 'supervisor' | 'canal' | 'proveedor'

const MESES_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

const DIM_TOGGLES: Array<{ key: MetaDimKey; label: string; icon: string }> = [
  { key: 'mes',          label: 'Mes',          icon: '📅' },
  { key: 'vendedor',     label: 'Vendedor',     icon: '👤' },
  { key: 'cliente',      label: 'Cliente',      icon: '🧾' },
  { key: 'producto',     label: 'Producto',     icon: '📦' },
  { key: 'categoria',    label: 'Categoría',    icon: '🏷️' },
  { key: 'subcategoria', label: 'Subcategoría', icon: '🔖' },
  { key: 'departamento', label: 'Departamento', icon: '🌎' },
  { key: 'supervisor',   label: 'Supervisor',   icon: '🧑‍💼' },
  { key: 'canal',        label: 'Canal',        icon: '🏪' },
  { key: 'proveedor',    label: 'Proveedor',    icon: '🏭' },
]

function getMetaDimVal(m: MetaRecord, dim: MetaDimKey): string | null {
  switch (dim) {
    case 'mes':          return m.mes ? `${m.anio}-${String(m.mes).padStart(2, '0')}` : null
    case 'vendedor':     return m.vendedor ?? null
    case 'cliente':      return m.cliente ?? null
    case 'producto':     return m.producto ?? null
    case 'categoria':    return m.categoria ?? null
    case 'subcategoria': return m.subcategoria ?? null
    case 'departamento': return m.departamento ?? null
    case 'supervisor':   return m.supervisor ?? null
    case 'canal':        return m.canal ?? null
    case 'proveedor':    return m.proveedor ?? null
  }
}

function getSalesDimVal(s: SaleRecord, dim: MetaDimKey): string | null {
  switch (dim) {
    case 'mes': {
      const d = new Date(s.fecha)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    }
    case 'vendedor':     return s.vendedor || null
    case 'cliente':      return s.cliente ?? null
    case 'producto':     return s.producto ?? null
    case 'categoria':    return s.categoria ?? null
    case 'subcategoria': return s.subcategoria ?? null
    case 'departamento': return s.departamento ?? null
    case 'supervisor':   return s.supervisor ?? null
    case 'canal':        return s.canal ?? null
    case 'proveedor':    return s.proveedor ?? null
  }
}

function dimLabelForCell(val: string, dim: MetaDimKey): string {
  if (dim !== 'mes') return val
  const [y, m] = val.split('-')
  const idx = parseInt(m, 10) - 1
  if (idx < 0 || idx > 11) return val
  return `${MESES_SHORT[idx]} ${y}`
}

interface MetaTreeNode {
  id: string
  label: string
  dim: MetaDimKey
  depth: number
  metaVal: number
  ventaVal: number
  cumplPct: number | null
  children: MetaTreeNode[]
}

const SIN_VALUE_MARK = '__sin__'

function pathLabel(val: string, dim: MetaDimKey): string {
  if (val === SIN_VALUE_MARK) return `(sin ${DIM_META[dim]?.label.toLowerCase() ?? dim})`
  return dimLabelForCell(val, dim)
}

function buildMetaTree(
  metas: MetaRecord[],
  sales: SaleRecord[],
  dims: MetaDimKey[],
  tipoMetaActivo: 'uds' | 'usd',
): MetaTreeNode[] {
  if (dims.length === 0) return []
  const useUsd = tipoMetaActivo === 'usd'

  type Leaf = { path: string[]; metaVal: number; ventaVal: number }
  const leafMap = new Map<string, Leaf>()

  for (const m of metas) {
    const path: string[] = []
    for (const d of dims) {
      const v = getMetaDimVal(m, d)
      path.push(v && v.trim() !== '' ? v : SIN_VALUE_MARK)
    }
    const metaVal = useUsd ? (m.meta_usd ?? 0) : (m.meta_uds ?? m.meta ?? 0)
    if (metaVal <= 0) continue
    const id = path.join('›')
    if (!leafMap.has(id)) leafMap.set(id, { path, metaVal: 0, ventaVal: 0 })
    leafMap.get(id)!.metaVal += metaVal
  }

  for (const s of sales) {
    const path: string[] = []
    for (const d of dims) {
      const v = getSalesDimVal(s, d)
      path.push(v && v.trim() !== '' ? v : SIN_VALUE_MARK)
    }
    const id = path.join('›')
    const leaf = leafMap.get(id)
    if (!leaf) continue   // sales sin meta correspondiente al combo: ignoradas a propósito
    leaf.ventaVal += useUsd ? (s.venta_neta ?? 0) : s.unidades
  }

  function buildLevel(leaves: Leaf[], depth: number, parentPath: string[]): MetaTreeNode[] {
    if (depth >= dims.length) return []
    const dim = dims[depth]
    const groups = new Map<string, Leaf[]>()
    for (const leaf of leaves) {
      const key = leaf.path[depth]
      if (!groups.has(key)) groups.set(key, [])
      groups.get(key)!.push(leaf)
    }
    const nodes: MetaTreeNode[] = []
    for (const [key, group] of groups) {
      const metaVal = group.reduce((s, l) => s + l.metaVal, 0)
      const ventaVal = group.reduce((s, l) => s + l.ventaVal, 0)
      const isLeafLevel = depth === dims.length - 1
      const children = isLeafLevel ? [] : buildLevel(group, depth + 1, [...parentPath, key])
      nodes.push({
        id: [...parentPath, key].join('›'),
        label: pathLabel(key, dim),
        dim,
        depth,
        metaVal,
        ventaVal,
        cumplPct: metaVal > 0 ? (ventaVal / metaVal) * 100 : null,
        children,
      })
    }
    nodes.sort((a, b) => b.metaVal - a.metaVal)
    return nodes
  }

  return buildLevel([...leafMap.values()], 0, [])
}

function flattenTree(nodes: MetaTreeNode[], expanded: Set<string>): MetaTreeNode[] {
  const out: MetaTreeNode[] = []
  function walk(list: MetaTreeNode[]) {
    for (const n of list) {
      out.push(n)
      if (n.children.length > 0 && expanded.has(n.id)) walk(n.children)
    }
  }
  walk(nodes)
  return out
}

function SortablePill({ dim, index }: { dim: MetaDimKey; index: number; key?: Key }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useSortable({ id: dim, transition: null })
  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    zIndex: isDragging ? 20 : undefined,
    opacity: isDragging ? 0.95 : 1,
    cursor: isDragging ? 'grabbing' : 'grab',
  }
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', borderRadius: 8,
        background: 'var(--sf-card)', border: '1px solid var(--sf-border)',
        fontSize: 12, fontWeight: 500, color: 'var(--sf-t2)',
      }}
      {...attributes} {...listeners}
    >
      <GripVertical className="w-3.5 h-3.5" style={{ color: 'var(--sf-t5)' }} />
      <span>{DIM_META[dim]?.label ?? dim}</span>
      <span style={{
        fontSize: 10, fontWeight: 700, padding: '0 4px',
        background: 'var(--sf-inset)', borderRadius: 3, color: 'var(--sf-t4)',
      }}>{index + 1}</span>
    </div>
  )
}

interface Props {
  metas: MetaRecord[]
  sales: SaleRecord[]
  tipoMetaActivo: 'uds' | 'usd'
  moneda: string
  /** Año del periodo seleccionado (de selectedPeriod). */
  currentYear: number
  /** Mes 0-indexado (de selectedPeriod). */
  currentMonth: number
}

const PIVOT_GRID = 'minmax(220px, 1fr) 110px 110px 110px 80px 70px 130px'

export default function MetasPivotPanel({ metas, sales, tipoMetaActivo, moneda, currentYear, currentMonth }: Props) {
  // ── Filtrar a scope YTD: enero → fin del mes actual del año en curso ─────
  const ytdMetas = useMemo(() => {
    return metas.filter(m => m.anio === currentYear && m.mes >= 1 && m.mes <= currentMonth + 1)
  }, [metas, currentYear, currentMonth])

  const ytdSales = useMemo(() => {
    const start = new Date(currentYear, 0, 1).getTime()
    // Fin del mes actual: día 0 del mes siguiente = último día del actual
    const end = new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999).getTime()
    return sales.filter(s => {
      const t = s.fecha instanceof Date ? s.fecha.getTime() : new Date(s.fecha).getTime()
      return t >= start && t <= end
    })
  }, [sales, currentYear, currentMonth])

  // Derivar qué dims tienen valores reales en las metas YTD — si el cliente
  // no ingresó la columna, su toggle no aparece.
  const availableDims = useMemo(() => {
    const set = new Set<MetaDimKey>()
    for (const m of ytdMetas) {
      if (m.anio && m.mes) set.add('mes')
      for (const t of DIM_TOGGLES) {
        if (t.key === 'mes') continue
        const v = getMetaDimVal(m, t.key)
        if (v !== null && v !== '') set.add(t.key)
      }
    }
    return set
  }, [ytdMetas])

  const [pivotDims, setPivotDims] = useState<MetaDimKey[]>(() => {
    try {
      const stored = localStorage.getItem('sf_metas_pivot_dims')
      if (stored) {
        const parsed = JSON.parse(stored) as MetaDimKey[]
        if (Array.isArray(parsed) && parsed.length > 0) return parsed
      }
    } catch { /* ignore */ }
    return ['vendedor']
  })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  useEffect(() => {
    setPivotDims(prev => {
      const filtered = prev.filter(d => availableDims.has(d))
      if (filtered.length === 0) {
        const first = DIM_TOGGLES.find(t => availableDims.has(t.key))?.key
        return first ? [first] : []
      }
      return filtered
    })
  }, [availableDims])

  useEffect(() => {
    try { localStorage.setItem('sf_metas_pivot_dims', JSON.stringify(pivotDims)) } catch { /* ignore */ }
  }, [pivotDims])

  useEffect(() => { setExpanded(new Set()) }, [pivotDims])

  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }))

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (over && active.id !== over.id) {
      const oldIndex = pivotDims.indexOf(active.id as MetaDimKey)
      const newIndex = pivotDims.indexOf(over.id as MetaDimKey)
      if (oldIndex >= 0 && newIndex >= 0) setPivotDims(arrayMove(pivotDims, oldIndex, newIndex))
    }
  }

  const tree = useMemo(
    () => buildMetaTree(ytdMetas, ytdSales, pivotDims, tipoMetaActivo),
    [ytdMetas, ytdSales, pivotDims, tipoMetaActivo],
  )

  const visibleRows = useMemo(() => flattenTree(tree, expanded), [tree, expanded])

  const totals = useMemo(() => {
    const meta = tree.reduce((s, r) => s + r.metaVal, 0)
    const venta = tree.reduce((s, r) => s + r.ventaVal, 0)
    return { meta, venta, pct: meta > 0 ? (venta / meta) * 100 : null }
  }, [tree])

  // Color de la barra/% de cumplimiento según riesgo (matchea cards de abajo)
  const cumplColor = (pct: number | null): string => {
    if (pct === null) return 'var(--sf-t5)'
    if (pct >= 100) return '#10b981'
    if (pct >= 80)  return '#f59e0b'
    return '#ef4444'
  }

  const fmtVal = (v: number) =>
    tipoMetaActivo === 'usd' ? `${moneda}${Math.round(v).toLocaleString('en-US')}` : `${Math.round(v).toLocaleString('en-US')} uds`

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  if (metas.length === 0) return null

  return (
    <div style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', borderRadius: 12, overflow: 'hidden' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--sf-border)' }}>
        <div className="flex items-baseline gap-3">
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--sf-t2)' }}>Analiza tus metas</p>
          <span style={{ fontSize: 11, color: 'var(--sf-t5)' }}>
            YTD · Ene → {MESES_SHORT[currentMonth]} {currentYear}
          </span>
        </div>
        <button
          onClick={() => setShowAdvanced(v => !v)}
          className="flex items-center gap-1.5 text-xs transition-colors rounded-lg px-2.5 py-1.5"
          style={{
            color: showAdvanced ? 'var(--sf-green)' : 'var(--sf-t5)',
            background: showAdvanced ? 'rgba(0,214,143,0.08)' : 'transparent',
          }}
          title="Personalizar dimensiones"
        >
          <Settings className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Personalizar</span>
        </button>
      </div>

      {/* Dim toggles */}
      <div className="px-6 py-3 flex items-center flex-wrap gap-2" style={{ borderBottom: '1px solid var(--sf-border)' }}>
        {DIM_TOGGLES.filter(t => availableDims.has(t.key)).map(toggle => {
          const isActive = pivotDims.includes(toggle.key)
          return (
            <button
              key={toggle.key}
              onClick={() => {
                if (isActive) {
                  if (pivotDims.length > 1) setPivotDims(prev => prev.filter(d => d !== toggle.key))
                } else {
                  setPivotDims(prev => [...prev, toggle.key])
                }
              }}
              className="flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5 transition-all"
              style={{
                border: `1px solid ${isActive ? 'var(--sf-green)' : 'var(--sf-border)'}`,
                background: isActive ? 'rgba(0,214,143,0.08)' : 'transparent',
                color: isActive ? 'var(--sf-green)' : 'var(--sf-t4)',
                fontWeight: isActive ? 500 : 400,
                cursor: 'pointer',
              }}
            >
              <span>{toggle.icon}</span>
              <span>{toggle.label}</span>
            </button>
          )
        })}
      </div>

      {/* Drag-drop reorder panel */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: showAdvanced ? '1fr' : '0fr',
          transition: 'grid-template-rows 300ms ease-in-out, opacity 200ms ease-in-out',
          opacity: showAdvanced ? 1 : 0,
          borderBottom: showAdvanced ? '1px solid var(--sf-border)' : 'none',
        }}
      >
        <div style={{ overflow: 'hidden' }}>
          <div className="px-6 py-4 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t5)' }}>Orden de agrupación</p>
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd} modifiers={[restrictToHorizontalAxis, restrictToParentElement]}>
              <SortableContext items={pivotDims} strategy={horizontalListSortingStrategy}>
                <div className="flex items-center flex-wrap" style={{ gap: 8 }}>
                  {pivotDims.map((dim, idx) => (
                    <SortablePill key={dim} dim={dim} index={idx} />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
            <p className="text-[11px] italic mt-2" style={{ color: 'var(--sf-t5)' }}>
              Arrastra las etiquetas para cambiar el orden de agrupación
            </p>
          </div>
        </div>
      </div>

      {/* Tree table */}
      <div style={{ overflowX: 'auto' }}>
        {/* Header row */}
        <div
          style={{
            display: 'grid', gridTemplateColumns: PIVOT_GRID,
            borderBottom: '1px solid var(--sf-border)',
          }}
        >
          <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>
            {DIM_META[pivotDims[0]]?.label ?? pivotDims[0] ?? ''}
          </div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Venta YTD</div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Meta YTD</div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Variación</div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Variación %</div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Peso</div>
          <div className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--sf-t4)' }}>Cumpl.</div>
        </div>

        {/* Rows */}
        {visibleRows.length === 0 ? (
          <div className="px-4 py-8 text-center text-xs" style={{ color: 'var(--sf-t5)' }}>
            No hay metas para las dimensiones seleccionadas en el período YTD.
          </div>
        ) : visibleRows.map(row => {
          const isExpanded = expanded.has(row.id)
          const canExpand = row.children.length > 0
          const indent = 16 + row.depth * 24
          const isRoot = row.depth === 0
          const dimMeta = DIM_META[row.dim]
          const varAbs = row.ventaVal - row.metaVal
          const varPct = row.metaVal > 0 ? (varAbs / row.metaVal) * 100 : null
          const pesoPct = totals.venta > 0 ? (row.ventaVal / totals.venta) * 100 : 0
          const barPct = row.cumplPct === null ? 0 : Math.min(row.cumplPct, 100)
          const cColor = cumplColor(row.cumplPct)
          return (
            <div
              key={row.id}
              style={{
                display: 'grid', gridTemplateColumns: PIVOT_GRID,
                alignItems: 'center', borderBottom: '1px solid var(--sf-border)',
                background: 'var(--sf-card)', transition: 'background 150ms',
                cursor: canExpand ? 'pointer' : 'default',
              }}
              onClick={canExpand ? () => toggleExpand(row.id) : undefined}
              onMouseEnter={(e) => { if (canExpand) e.currentTarget.style.background = 'var(--sf-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--sf-card)' }}
            >
              {/* Label cell */}
              <div className="flex items-center overflow-hidden" style={{ padding: `8px 12px 8px ${indent}px` }}>
                {canExpand ? (
                  <span
                    style={{
                      width: 18, height: 18, borderRadius: 4,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0, marginRight: 8, cursor: 'pointer',
                    }}
                    className="hover:bg-[var(--sf-inset)]"
                    onClick={(e) => { e.stopPropagation(); toggleExpand(row.id) }}
                  >
                    <ChevronRight
                      style={{
                        width: 12, height: 12, color: 'var(--sf-t3)',
                        transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
                        transition: 'transform 200ms ease',
                      }}
                    />
                  </span>
                ) : (
                  <span style={{ display: 'inline-block', width: 18, marginRight: 8, flexShrink: 0 }} />
                )}
                <span
                  className="truncate"
                  style={{
                    fontSize: isRoot ? 13 : 12,
                    fontWeight: isRoot ? 600 : 400,
                    color: isRoot ? 'var(--sf-t1)' : 'var(--sf-t2)',
                    display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  {row.label}
                  {!isRoot && dimMeta && (
                    <span className={cn('shrink-0 px-1 py-0.5 rounded text-[9px] font-bold border leading-none', dimMeta.color)}>
                      {dimMeta.badge}
                    </span>
                  )}
                </span>
              </div>
              {/* Venta YTD */}
              <div className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--sf-t1)', fontWeight: isRoot ? 600 : 500 }}>
                {fmtVal(row.ventaVal)}
              </div>
              {/* Meta YTD */}
              <div className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--sf-t3)' }}>
                {fmtVal(row.metaVal)}
              </div>
              {/* Var abs */}
              <div className="px-3 py-2 text-right text-xs tabular-nums" style={{
                color: row.metaVal === 0 ? 'var(--sf-t5)' : varAbs >= 0 ? 'var(--sf-green)' : 'var(--sf-red)',
                fontWeight: 500,
              }}>
                {row.metaVal === 0 ? '—' : `${varAbs >= 0 ? '+' : ''}${fmtVal(varAbs)}`}
              </div>
              {/* Var % */}
              <div className="px-3 py-2 text-right text-xs tabular-nums" style={{
                color: varPct === null ? 'var(--sf-t5)' : varPct >= 0 ? 'var(--sf-green)' : varPct >= -10 ? 'var(--sf-amber)' : 'var(--sf-red)',
                fontWeight: 600,
              }}>
                {varPct !== null ? `${varPct >= 0 ? '+' : ''}${varPct.toFixed(1)}%` : '—'}
              </div>
              {/* Peso */}
              <div className="px-3 py-2 text-right text-xs tabular-nums" style={{ color: 'var(--sf-t3)' }}>
                {pesoPct.toFixed(1)}%
              </div>
              {/* Cumplimiento — barra + % compactos */}
              <div className="px-3 py-2 flex items-center gap-2" style={{ minWidth: 0 }}>
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sf-border)' }}>
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{ width: `${barPct}%`, background: cColor }}
                  />
                </div>
                <span className="text-[11px] font-semibold tabular-nums shrink-0" style={{ color: cColor, minWidth: 36, textAlign: 'right' }}>
                  {row.cumplPct === null ? '—' : `${row.cumplPct.toFixed(0)}%`}
                </span>
              </div>
            </div>
          )
        })}

        {/* Footer total */}
        {tree.length > 0 && (() => {
          const tVarAbs = totals.venta - totals.meta
          const tVarPct = totals.meta > 0 ? (tVarAbs / totals.meta) * 100 : null
          const tBarPct = totals.pct === null ? 0 : Math.min(totals.pct, 100)
          const tColor = cumplColor(totals.pct)
          return (
            <div
              style={{
                display: 'grid', gridTemplateColumns: PIVOT_GRID,
                borderTop: '2px solid var(--sf-border)', background: 'var(--sf-card)',
                alignItems: 'center',
              }}
            >
              <div className="px-4 py-2 text-xs font-semibold" style={{ color: 'var(--sf-t2)', paddingLeft: 16 }}>Total</div>
              <div className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--sf-t1)' }}>{fmtVal(totals.venta)}</div>
              <div className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--sf-t1)' }}>{fmtVal(totals.meta)}</div>
              <div className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{
                color: totals.meta === 0 ? 'var(--sf-t5)' : tVarAbs >= 0 ? 'var(--sf-green)' : 'var(--sf-red)',
              }}>
                {totals.meta === 0 ? '—' : `${tVarAbs >= 0 ? '+' : ''}${fmtVal(tVarAbs)}`}
              </div>
              <div className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{
                color: tVarPct === null ? 'var(--sf-t5)' : tVarPct >= 0 ? 'var(--sf-green)' : tVarPct >= -10 ? 'var(--sf-amber)' : 'var(--sf-red)',
              }}>
                {tVarPct !== null ? `${tVarPct >= 0 ? '+' : ''}${tVarPct.toFixed(1)}%` : '—'}
              </div>
              <div className="px-3 py-2 text-right text-xs font-semibold tabular-nums" style={{ color: 'var(--sf-t3)' }}>100.0%</div>
              <div className="px-3 py-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--sf-border)' }}>
                  <div className="h-full rounded-full transition-all duration-500" style={{ width: `${tBarPct}%`, background: tColor }} />
                </div>
                <span className="text-[11px] font-bold tabular-nums shrink-0" style={{ color: tColor, minWidth: 36, textAlign: 'right' }}>
                  {totals.pct === null ? '—' : `${totals.pct.toFixed(0)}%`}
                </span>
              </div>
            </div>
          )
        })()}
      </div>
    </div>
  )
}
