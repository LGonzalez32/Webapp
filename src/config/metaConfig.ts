// src/config/metaConfig.ts

export const DIM_META: Record<string, { label: string; badge: string; color: string }> = {
  mes:      { label: 'Mes',      badge: 'MES',   color: 'bg-violet-500/20 text-violet-300 border-violet-500/30' },
  vendedor: { label: 'Vendedor', badge: 'VEND',  color: 'bg-blue-500/20 text-blue-300 border-blue-500/30' },
  canal:    { label: 'Canal',    badge: 'CANAL', color: 'bg-amber-500/20 text-amber-300 border-amber-500/30' },
  cliente:  { label: 'Cliente',  badge: 'CLI',   color: 'bg-pink-500/20 text-pink-300 border-pink-500/30' },
  producto: { label: 'Producto', badge: 'PROD',  color: 'bg-teal-500/20 text-teal-300 border-teal-500/30' },
}

export const PIVOT_PRESETS: { label: string; dims: string[] }[] = [
  { label: 'Mes · Vendedor',            dims: ['mes', 'vendedor'] },
  { label: 'Vendedor · Mes',            dims: ['vendedor', 'mes'] },
  { label: 'Canal · Cliente · Producto', dims: ['canal', 'cliente', 'producto'] },
  { label: 'Canal · Cliente',           dims: ['canal', 'cliente'] },
]

export const metaConfig = {
  anual2026: 240_000,
  mensual2026: [20000, 18500, 15000, 17000, 18000, 19000, 20000, 21000, 22000, 22000, 23000, 24500],
}
