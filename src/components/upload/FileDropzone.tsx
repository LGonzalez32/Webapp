import { useState, useRef, DragEvent, ChangeEvent } from 'react';
import { Upload, Loader2, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UploadStep } from '../../types';

interface FileDropzoneProps {
  step: UploadStep;
  onFileSelect: (file: File) => void;
  onSkip?: () => void;
  isProcessing?: boolean;
}

export default function FileDropzone({ step, onFileSelect, onSkip, isProcessing }: FileDropzoneProps) {
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
          'relative border-2 border-dashed rounded-2xl transition-all cursor-pointer group',
          isProcessing && 'cursor-not-allowed opacity-60',
          isDragOver
            ? 'border-emerald-500 bg-emerald-500/[0.03] p-12'
            : isLoaded
            ? 'border-[var(--sf-green-border)] bg-[var(--sf-green-bg)] p-6'
            : isError
            ? 'border-red-400/40 bg-red-500/[0.03] p-6'
            : 'border-[var(--sf-border)] p-12 hover:border-[var(--sf-border-active)] hover:bg-emerald-500/[0.01]'
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
          <div className="text-center">
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin mx-auto mb-3" />
            <p className="text-sm font-semibold text-[var(--sf-t2)]">Procesando archivo...</p>
          </div>
        ) : isLoaded ? (
          <div className="flex items-center gap-4">
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
                  {step.parsedData.length.toLocaleString()} registros listos
                </p>
              )}
            </div>
            <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Cambiar archivo</span>
          </div>
        ) : isError ? (
          <div className="flex items-center gap-4">
            <XCircle className="w-8 h-8 text-red-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-[var(--sf-t1)]">{step.file?.name ?? 'Archivo con errores'}</p>
              <p className="text-xs text-red-500 mt-0.5">No pudimos leer este archivo</p>
            </div>
            <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Intentar con otro</span>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center">
            <div className="w-14 h-14 mb-4 rounded-xl bg-[var(--sf-inset)] flex items-center justify-center group-hover:bg-emerald-500/10 transition-colors">
              <Upload className="w-6 h-6 text-[var(--sf-t4)] group-hover:text-emerald-500 transition-colors" />
            </div>
            <p className="text-base font-semibold text-[var(--sf-t1)] mb-1">Arrastra tu archivo aquí</p>
            <p className="text-sm text-[var(--sf-t3)] mb-1">o haz clic para buscar en tu computadora</p>
            <p className="text-xs text-[var(--sf-t4)]">.xlsx, .xls, .csv · máximo 50MB</p>
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
    </div>
  );
}
