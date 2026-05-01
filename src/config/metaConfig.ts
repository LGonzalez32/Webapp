// src/config/metaConfig.ts

export const DIM_META: Record<string, { label: string; badge: string; color: string }> = {
  mes:          { label: 'Mes',          badge: 'MES',    color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  vendedor:     { label: 'Vendedor',     badge: 'VEND',   color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  canal:        { label: 'Canal',        badge: 'CANAL',  color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  cliente:      { label: 'Cliente',      badge: 'CLI',    color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  producto:     { label: 'Producto',     badge: 'PROD',   color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
  // schema-cleanup: dims agregadas para Rendimiento (todas las cols disponibles).
  categoria:    { label: 'Categoría',    badge: 'CAT',    color: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' },
  subcategoria: { label: 'Subcategoría', badge: 'SUBCAT', color: 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30' },
  departamento: { label: 'Departamento', badge: 'DEPTO',  color: 'bg-orange-500/20 text-orange-300 border-orange-500/30' },
  supervisor:   { label: 'Supervisor',   badge: 'SUP',    color: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/30' },
  proveedor:    { label: 'Proveedor',    badge: 'PROV',   color: 'bg-rose-500/20 text-rose-300 border-rose-500/30' },
}

export const PIVOT_PRESETS: { id: string; label: string; icon: string; dims: string[]; requiresDim?: string }[] = [
  { id: 'canal',    label: 'Por Canal',    icon: '🏪', dims: ['canal', 'vendedor'], requiresDim: 'canal' },
  { id: 'vendedor', label: 'Por Vendedor', icon: '👤', dims: ['vendedor', 'cliente'] },
  { id: 'producto', label: 'Por Producto', icon: '📦', dims: ['producto'], requiresDim: 'producto' },
  { id: 'mensual',  label: 'Por Mes',      icon: '📅', dims: ['mes', 'canal'] },
]

export const metaConfig = {
  anual2026: 240_000,
  mensual2026: [20000, 18500, 15000, 17000, 18000, 19000, 20000, 21000, 22000, 22000, 23000, 24500],
}
