import { Link } from 'react-router-dom';
import { Home, AlertCircle } from 'lucide-react';

export default function NotFoundPage() {
  return (
    <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 text-center animate-in fade-in duration-500">
      <div className="w-24 h-24 rounded-3xl bg-red-500/10 flex items-center justify-center border border-red-500/20 mb-8">
        <AlertCircle className="w-12 h-12 text-red-500" />
      </div>
      <h1 className="text-8xl font-black text-white tracking-tighter mb-4">404</h1>
      <h2 className="text-2xl font-bold text-zinc-300 mb-2">Página no encontrada</h2>
      <p className="text-zinc-500 max-w-md mb-10">
        Lo sentimos, la página que estás buscando no existe o ha sido movida.
      </p>
      <Link 
        to="/" 
        className="flex items-center gap-2 px-8 py-4 bg-emerald-500 hover:bg-emerald-400 text-black rounded-2xl font-bold transition-all shadow-xl shadow-emerald-500/20 group"
      >
        <Home className="w-5 h-5 group-hover:-translate-y-0.5 transition-transform" />
        Ir al inicio
      </Link>
    </div>
  );
}
