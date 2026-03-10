import { useState } from 'react';
import { Table2, Download } from 'lucide-react';
import TemplatePreviewModal from './TemplatePreviewModal';

interface ColDef {
  name: string;
  aliases: string;
  note?: string;
  noteColor?: 'yellow';
}

interface OptColDef extends ColDef {
  impact: string;
}

interface StepDef {
  required: ColDef[];
  optional: OptColDef[];
  optionalNote?: string;
}

const STEP_DATA: Record<'inventory' | 'sales' | 'leadtime', StepDef> = {
  inventory: {
    required: [
      { name: 'Producto', aliases: 'SKU, Nombre, Item, Descripcion' },
      { name: 'Stock', aliases: 'Unidades, Cantidad, Existencia, Inventario, Stock Actual' },
    ],
    optional: [
      { name: 'Categoria', aliases: 'Categoría, Tipo, Departamento', impact: 'No podrás filtrar por categoría' },
      { name: 'Proveedor', aliases: 'Supplier, Empresa, Distribuidor', impact: 'El análisis por proveedor no estará disponible' },
      { name: 'Costo', aliases: 'Precio, Price, Costo Unitario, Cost', impact: 'No se calculará el valor del inventario ni la inversión sugerida' },
    ],
  },
  sales: {
    required: [
      {
        name: 'Fecha',
        aliases: 'Date, Periodo, Mes',
        note: 'Formatos aceptados: YYYY-MM-DD · DD/MM/YYYY · MM/DD/YYYY · YYYY-MM',
        noteColor: 'yellow',
      },
      { name: 'Producto', aliases: 'SKU, Item, Nombre' },
      { name: 'Unidades', aliases: 'Cantidad, Units, Qty, Vendido, Ventas, Cantidad Vendida' },
    ],
    optional: [
      { name: 'Categoria', aliases: 'Categoría, Tipo', impact: 'Se usará la categoría del inventario si hay coincidencia de nombre' },
    ],
  },
  leadtime: {
    required: [
      { name: 'Proveedor', aliases: 'Supplier, Empresa, Distribuidor' },
      {
        name: 'LeadTime',
        aliases: 'Lead Time, Días, Days, Tiempo, DiasEntrega, Dias de Entrega, Tiempo Entrega',
        note: 'Número de días hábiles hasta recibir el pedido. Ejemplo: 7',
      },
    ],
    optional: [],
    optionalNote: 'Si omites este archivo se usarán 7 días por defecto para todos los proveedores.',
  },
};

interface Props {
  stepId: 'inventory' | 'sales' | 'leadtime';
  onDownload: () => void;
}

export default function ColumnGuide({ stepId, onDownload }: Props) {
  const [showModal, setShowModal] = useState(false);
  const def = STEP_DATA[stepId];

  return (
    <div className="bg-zinc-800/40 border border-zinc-700/50 rounded-2xl overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-5 py-4 border-b border-zinc-700/50">
        <div className="bg-zinc-700/60 p-1.5 rounded-lg mt-0.5 shrink-0">
          <Table2 className="w-4 h-4 text-zinc-300" />
        </div>
        <div>
          <p className="text-sm font-bold text-zinc-200">Columnas esperadas</p>
          <p className="text-[11px] text-zinc-500 mt-0.5">Tu archivo puede usar cualquiera de estos nombres</p>
        </div>
      </div>

      {/* Body */}
      <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-zinc-700/50 px-0">
        {/* Required */}
        <div className="p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-500">Requeridas</p>
          {def.required.map(col => (
            <div key={col.name} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-zinc-100">{col.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-[9px] font-bold text-emerald-400 uppercase tracking-wide">
                  Requerida
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">{col.aliases}</p>
              {col.note && (
                <p className={
                  col.noteColor === 'yellow'
                    ? 'text-[11px] text-amber-400/80 bg-amber-500/5 border border-amber-500/15 rounded-lg px-2.5 py-1.5 mt-1.5'
                    : 'text-[11px] text-zinc-500 italic mt-1'
                }>
                  {col.noteColor === 'yellow' ? '📅 ' : ''}{col.note}
                </p>
              )}
            </div>
          ))}
        </div>

        {/* Optional */}
        <div className="p-5 space-y-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-500">Opcionales</p>

          {def.optional.length === 0 && def.optionalNote && (
            <div className="bg-zinc-700/30 border border-zinc-700/40 rounded-xl px-3 py-3">
              <p className="text-[11px] text-zinc-400">
                <span className="mr-1">💡</span>{def.optionalNote}
              </p>
            </div>
          )}

          {def.optional.map(col => (
            <div key={col.name} className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm text-zinc-300">{col.name}</span>
                <span className="px-1.5 py-0.5 rounded bg-zinc-700 border border-zinc-600 text-[9px] font-bold text-zinc-500 uppercase tracking-wide">
                  Opcional
                </span>
              </div>
              <p className="text-[11px] text-zinc-500">{col.aliases}</p>
              <p className="text-[11px] text-zinc-600 italic">{col.impact}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center gap-3 px-5 py-3 border-t border-zinc-700/50 bg-zinc-900/30">
        <Download className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
        <span className="text-[11px] text-zinc-500">¿No sabes cómo armar el archivo?</span>
        <button
          onClick={() => setShowModal(true)}
          className="text-[11px] font-bold text-blue-400 hover:text-blue-300 transition-colors ml-auto shrink-0"
        >
          Descarga la plantilla Excel →
        </button>
      </div>

      <TemplatePreviewModal
        stepId={stepId}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onDownload={onDownload}
      />
    </div>
  );
}
