import { AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center space-y-6 animate-in fade-in zoom-in duration-500">
      <div className="bg-zinc-900 p-8 rounded-full border border-zinc-800 shadow-2xl">
        <AlertCircle className="w-16 h-16 text-zinc-700" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-bold text-white tracking-tight">Sin datos cargados</h2>
        <p className="text-zinc-500 max-w-sm mx-auto">
          Carga tu inventario y ventas para ver el análisis detallado de tu negocio.
        </p>
      </div>
      <Link 
        to="/upload"
        className="bg-emerald-500 hover:bg-emerald-400 text-black px-8 py-3 rounded-xl font-bold transition-all shadow-lg shadow-emerald-500/10"
      >
        Ir a Cargar datos
      </Link>
    </div>
  );
}
