import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn } from '../../lib/utils';
import { FileValidationResult } from '../../types';

interface ValidationPanelProps {
  result: FileValidationResult;
}

export default function ValidationPanel({ result }: ValidationPanelProps) {
  if (result.errors.length === 0 && result.warnings.length === 0) {
    return (
      <div className="flex items-center gap-3 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
        <div>
          <p className="text-sm font-bold text-emerald-400">Archivo válido</p>
          <p className="text-xs text-zinc-500">{result.validRowCount} de {result.rowCount} filas procesadas correctamente</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Summary */}
      <div className={cn(
        'flex items-center gap-3 p-3 rounded-xl border',
        result.isValid
          ? 'bg-amber-500/10 border-amber-500/20'
          : 'bg-red-500/10 border-red-500/20'
      )}>
        {result.isValid
          ? <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          : <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />}
        <p className={cn('text-xs font-bold', result.isValid ? 'text-amber-400' : 'text-red-400')}>
          {result.isValid
            ? `${result.validRowCount} filas válidas con ${result.warnings.length} advertencia(s)`
            : `${result.errors.length} error(es) críticos — corrige el archivo antes de continuar`}
        </p>
      </div>

      {/* Errors */}
      {result.errors.map((issue, i) => (
        <div key={i} className="flex items-start gap-2.5 p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
          <AlertCircle className="w-3.5 h-3.5 text-red-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-red-400 leading-relaxed">{issue.message}</p>
            {issue.rows && issue.rows.length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-1">
                Filas afectadas: {issue.rows.join(', ')}{issue.count && issue.count > issue.rows.length ? ` …y ${issue.count - issue.rows.length} más` : ''}
              </p>
            )}
          </div>
        </div>
      ))}

      {/* Warnings */}
      {result.warnings.map((issue, i) => (
        <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-500/5 border border-amber-500/20 rounded-lg">
          <Info className="w-3.5 h-3.5 text-amber-500 mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-400 leading-relaxed">{issue.message}</p>
            {issue.rows && issue.rows.length > 0 && (
              <p className="text-[10px] text-zinc-600 mt-1">
                Filas afectadas: {issue.rows.join(', ')}{issue.count && issue.count > issue.rows.length ? ` …y ${issue.count - issue.rows.length} más` : ''}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
