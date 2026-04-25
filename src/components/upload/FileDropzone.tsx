import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, CheckCircle2, XCircle, SkipForward, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UploadStep } from '../../types';

interface FileDropzoneProps {
  step: UploadStep;
  onFileSelect: (file: File) => void;
  onSkip?: () => void;
  isProcessing?: boolean;
  progressPercent?: number;
  progressDetail?: string;
  /** [Z.P1.10.a] Callback para cargar datos demo (antes vivía en banner superior). Solo se muestra en step ventas sin archivo. */
  onLoadDemo?: () => void;
  /** [Z.P1.10.c/K2] Callback para bajar la plantilla desde dentro del dropzone. */
  onDownloadTemplate?: () => void;
}

export default function FileDropzone({ step, onFileSelect, onSkip, isProcessing, progressPercent = 0, progressDetail = '', onLoadDemo, onDownloadTemplate }: FileDropzoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    e.target.value = '';
  };

  const isLoaded = step.status === 'loaded';
  const isError = step.status === 'error';

  return (
    <div className="space-y-3">
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl transition-all cursor-pointer group min-h-[280px] flex flex-col items-center justify-center',
          isProcessing && 'cursor-not-allowed opacity-60',
          isDragOver
            ? 'border-emerald-500 bg-emerald-500/[0.03] p-8'
            : isLoaded
            ? 'border-[var(--sf-green-border)] bg-[var(--sf-green-bg)] p-6'
            : isError
            ? 'border-red-400/40 bg-red-500/[0.03] p-6'
            : 'border-[var(--sf-border)] p-6 hover:border-[var(--sf-border-active)] hover:bg-emerald-500/[0.01]'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={handleChange}
        />

        {isDragOver ? (
          <div className="text-center">
            <p className="text-base font-semibold text-emerald-600">Suelta el archivo aquí</p>
          </div>
        ) : isProcessing ? (
          <div className="flex flex-col items-center gap-4 py-2 w-full">
            <div className="w-full max-w-md">
              <div className="h-3 rounded-full bg-[var(--sf-card)] border border-[var(--sf-border)] overflow-hidden">
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all duration-300 ease-out"
                  style={{ width: `${Math.max(2, progressPercent)}%` }}
                />
              </div>
            </div>
            <p className="text-2xl font-bold text-[var(--sf-t1)] tabular-nums">{progressPercent}%</p>
            <p className="text-sm text-[var(--sf-t3)] min-h-[1.25rem] text-center">
              {progressDetail || 'Procesando archivo...'}
            </p>
          </div>
        ) : isLoaded ? (
          <div className="flex items-center gap-4 w-full">
            <style>{`@keyframes checkPop{0%{transform:scale(0.8)}60%{transform:scale(1.15)}100%{transform:scale(1)}}`}</style>
            <CheckCircle2
              className="w-8 h-8 text-emerald-500 shrink-0"
              style={{ animation: 'checkPop 0.4s ease-out forwards' }}
            />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--sf-t1)]">{step.file?.name}</p>
              <p className="text-xs text-emerald-600 mt-0.5">Archivo cargado correctamente</p>
              {step.parsedData && step.parsedData.length > 0 && (
                <p className="text-xs text-[var(--sf-t4)] mt-0.5">
                  {step.parsedData.length.toLocaleString()} {step.parsedData.length === 1 ? 'registro listo' : 'registros listos'}
                </p>
              )}
            </div>
            <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Cambiar archivo</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-4 w-full">
            <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--sf-t1)]">{step.file?.name ?? 'Archivo con errores'}</p>
              <p className="text-xs text-red-500 mt-0.5">No pudimos leer este archivo</p>
            </div>
            <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Intentar con otro</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center w-full">
            <Upload className="w-10 h-10 text-emerald-500 mb-3" />
            <p className="text-base font-semibold text-[var(--sf-t1)] mb-0.5">Arrastra tu archivo aquí</p>
            <p className="text-sm text-[var(--sf-t3)]">o haz clic para elegir</p>
            <p className="text-xs text-[var(--sf-t4)] mt-2">.xlsx · .xls · .csv</p>
            {(onLoadDemo || onDownloadTemplate) && (
              <div className="mt-6 pt-4 border-t border-slate-100 w-full flex flex-col gap-1.5 items-center">
                {onLoadDemo && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLoadDemo(); }}
                    title="Carga un dataset de ejemplo con 50.012 registros para que explorés la app sin subir tu archivo."
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    ¿Primera vez? → Cargar demo
                  </button>
                )}
                {onDownloadTemplate && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDownloadTemplate(); }}
                    className="text-xs text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    ¿No sabés cómo armarlo? → Bajar plantilla
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {!step.required && onSkip && step.status !== 'skipped' && (
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-xs text-[var(--sf-t4)] hover:text-[var(--sf-t2)] transition-colors mx-auto"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Omitir este paso (opcional)
        </button>
      )}
      {step.status === 'skipped' && (
        <p className="text-center text-xs text-[var(--sf-t4)]">Paso omitido — se usarán 7 días de buffer por defecto.</p>
      )}
      {step.status !== 'loaded' && step.status !== 'skipped' && !isProcessing && (
        <p className="flex items-center justify-center gap-1.5 text-xs text-[var(--sf-t4)] pt-1">
          <Lock className="w-3 h-3" />
          Tu archivo se procesa en tu navegador. No sale de tu computadora.
        </p>
      )}
    </div>
  );
}
