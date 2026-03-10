import { X, FileSpreadsheet, Download } from 'lucide-react';
import { cn } from '../../lib/utils';

type StepId = 'inventory' | 'sales' | 'leadtime';

interface ColHeader {
  label: string;
  required: boolean;
}

interface PreviewRow {
  cells: string[];
  lowStock?: boolean; // highlights Stock cell red (inventory only)
}

interface StepPreview {
  title: string;
  headers: ColHeader[];
  rows: PreviewRow[];
  footerNote: string;
  bodyNote?: { color: 'yellow' | 'blue'; text: string };
}

const PREVIEWS: Record<StepId, StepPreview> = {
  inventory: {
    title: 'Plantilla de Inventario',
    headers: [
      { label: 'Producto', required: true },
      { label: 'Stock', required: true },
      { label: 'Categoria', required: false },
      { label: 'Proveedor', required: false },
      { label: 'Costo', required: false },
    ],
    rows: [
      { cells: ['Coca-Cola 355ml', '24', 'Bebidas', 'Dist. Sur', '0.75'] },
      { cells: ['Arroz 5lb', '85', 'Granos', 'Granos del Sur', '2.10'] },
      { cells: ['Aceite Vegetal 1L', '3', 'Abarrotes', 'Aceites Central', '2.40'], lowStock: true },
      { cells: ['Papel Higiénico 4u', '2', 'Higiene', 'Dist. Higiene SA', '2.20'], lowStock: true },
    ],
    footerNote: 'Guarda tu archivo como .xlsx o .csv',
  },
  sales: {
    title: 'Plantilla de Ventas',
    headers: [
      { label: 'Fecha', required: true },
      { label: 'Producto', required: true },
      { label: 'Unidades', required: true },
      { label: 'Categoria', required: false },
    ],
    rows: [
      { cells: ['2024-01-15', 'Coca-Cola 355ml', '45', 'Bebidas'] },
      { cells: ['2024-01-15', 'Arroz 5lb', '32', 'Granos'] },
      { cells: ['2024-02-01', 'Coca-Cola 355ml', '38', 'Bebidas'] },
      { cells: ['2024-02-01', 'Papel Higiénico 4u', '28', 'Higiene'] },
    ],
    footerNote: 'Una fila por venta. Puedes tener múltiples filas del mismo producto en distintas fechas.',
    bodyNote: {
      color: 'yellow',
      text: '💡 Una fila por producto por fecha. Puedes tener cientos de filas — el sistema las procesa todas automáticamente.',
    },
  },
  leadtime: {
    title: 'Plantilla de Lead Time',
    headers: [
      { label: 'Proveedor', required: true },
      { label: 'LeadTime', required: true },
    ],
    rows: [
      { cells: ['Dist. Sur', '5'] },
      { cells: ['Granos del Sur', '4'] },
      { cells: ['Aceites Central', '10'] },
      { cells: ['Dist. Higiene SA', '7'] },
    ],
    footerNote: 'Una fila por proveedor. El Lead Time es en días hábiles.',
    bodyNote: {
      color: 'blue',
      text: '💡 El Lead Time es el número de días que tarda tu proveedor en entregarte después de hacer el pedido. Se usa para calcular cuándo debes ordenar antes de quedarte sin stock.',
    },
  },
};

interface Props {
  stepId: StepId;
  isOpen: boolean;
  onClose: () => void;
  onDownload: () => void;
}

export default function TemplatePreviewModal({ stepId, isOpen, onClose, onDownload }: Props) {
  if (!isOpen) return null;

  const preview = PREVIEWS[stepId];

  const handleDownload = () => {
    onDownload();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />

      {/* Modal */}
      <div
        className="relative z-10 w-full max-w-3xl bg-zinc-900 border border-zinc-700 rounded-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 p-2 rounded-lg shrink-0">
              <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <p className="font-bold text-zinc-100">{preview.title}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Así debe verse tu archivo</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 transition-colors p-1 rounded-lg hover:bg-zinc-800 shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body — scrollable */}
        <div className="overflow-y-auto p-6 space-y-4 flex-1">
          {/* Excel-like table */}
          <div className="rounded-xl border border-zinc-700 overflow-hidden">
            {/* Row numbers column + data */}
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                {/* Header row */}
                <thead>
                  <tr>
                    {/* Row number cell */}
                    <th className="w-8 px-2 py-2.5 bg-zinc-800 border-r border-zinc-700 text-zinc-600 text-[10px] font-mono text-center select-none">
                      #
                    </th>
                    {preview.headers.map((h, i) => (
                      <th
                        key={i}
                        className="px-4 py-2.5 text-left font-bold text-white text-xs border-r border-zinc-700/50 last:border-r-0 whitespace-nowrap"
                        style={{ backgroundColor: '#14532d' }}
                      >
                        {h.label}{h.required && <span className="text-emerald-300 ml-0.5">*</span>}
                      </th>
                    ))}
                  </tr>
                </thead>

                {/* Data rows */}
                <tbody>
                  {preview.rows.map((row, ri) => (
                    <tr
                      key={ri}
                      className={cn(
                        'border-t border-zinc-800',
                        ri % 2 === 0 ? 'bg-zinc-900' : 'bg-zinc-800/30'
                      )}
                    >
                      <td className="w-8 px-2 py-2 bg-zinc-800/50 border-r border-zinc-700 text-zinc-600 text-[10px] font-mono text-center select-none">
                        {ri + 2}
                      </td>
                      {row.cells.map((cell, ci) => {
                        const isStockCell = stepId === 'inventory' && ci === 1 && row.lowStock;
                        return (
                          <td
                            key={ci}
                            className={cn(
                              'px-4 py-2 font-mono text-xs border-r border-zinc-800/50 last:border-r-0',
                              isStockCell
                                ? 'text-red-400 bg-red-500/8'
                                : 'text-zinc-300'
                            )}
                            style={isStockCell ? { backgroundColor: 'rgba(239,68,68,0.08)' } : undefined}
                          >
                            {cell}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Legend */}
          <p className="text-[11px] text-zinc-600">
            <span className="text-emerald-400 font-bold">*</span> Columna requerida
            {stepId === 'inventory' && (
              <span className="ml-4 text-red-400/70">Fondo rojo = stock bajo detectado</span>
            )}
          </p>

          {/* Body note */}
          {preview.bodyNote && (
            <div className={cn(
              'rounded-xl px-4 py-3 text-[12px]',
              preview.bodyNote.color === 'yellow'
                ? 'bg-amber-500/5 border border-amber-500/15 text-amber-300/80'
                : 'bg-blue-500/5 border border-blue-500/15 text-blue-300/80'
            )}>
              {preview.bodyNote.text}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-4 px-6 py-4 border-t border-zinc-800 shrink-0">
          <p className="text-[11px] text-zinc-500 max-w-sm">{preview.footerNote}</p>
          <div className="flex items-center gap-3 shrink-0">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-sm font-bold text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 transition-all"
            >
              Cerrar
            </button>
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold bg-emerald-500 hover:bg-emerald-400 text-black transition-all shadow-lg shadow-emerald-500/20"
            >
              <Download className="w-4 h-4" />
              Descargar plantilla .xlsx
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
