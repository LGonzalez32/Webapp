import { useRef, DragEvent, ChangeEvent } from 'react';
import { FileSpreadsheet, Loader2, CheckCircle2, XCircle, SkipForward } from 'lucide-react';
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

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) onFileSelect(file);
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const isLoaded = step.status === 'loaded';
  const isError = step.status === 'error';

  return (
    <div className="space-y-3">
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => e.preventDefault()}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center gap-3 transition-all cursor-pointer group',
          isProcessing ? 'cursor-not-allowed opacity-60' : 'hover:border-emerald-500/50 hover:bg-emerald-500/5',
          isLoaded ? 'border-emerald-500/40 bg-emerald-500/5' :
          isError ? 'border-red-500/40 bg-red-500/5' :
          'border-zinc-800 bg-zinc-900/20'
        )}
      >
        <input
          ref={inputRef}
          type="file"
          className="hidden"
          accept=".xlsx,.xls,.csv"
          onChange={handleChange}
        />

        {isProcessing ? (
          <>
            <Loader2 className="w-10 h-10 text-emerald-500 animate-spin" />
            <p className="text-sm font-bold text-zinc-400">Procesando archivo...</p>
          </>
        ) : isLoaded ? (
          <>
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <div className="text-center">
              <p className="text-sm font-bold text-emerald-400">{step.file?.name}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Archivo cargado · Haz clic para cambiar</p>
            </div>
          </>
        ) : isError ? (
          <>
            <XCircle className="w-10 h-10 text-red-500" />
            <div className="text-center">
              <p className="text-sm font-bold text-red-400">{step.file?.name ?? 'Archivo con errores'}</p>
              <p className="text-xs text-zinc-500 mt-0.5">Corrige los errores o sube un archivo diferente</p>
            </div>
          </>
        ) : (
          <>
            <div className="bg-zinc-900 p-3 rounded-full group-hover:scale-110 transition-transform">
              <FileSpreadsheet className="w-8 h-8 text-zinc-500 group-hover:text-emerald-500 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-zinc-200 font-bold text-sm">{step.description}</p>
              <p className="text-zinc-500 text-xs mt-1">Arrastra tu archivo o haz clic · .xlsx, .csv</p>
            </div>
          </>
        )}
      </div>

      {!step.required && onSkip && step.status !== 'skipped' && (
        <button
          onClick={onSkip}
          className="flex items-center gap-1.5 text-xs text-zinc-600 hover:text-zinc-400 transition-colors mx-auto"
        >
          <SkipForward className="w-3.5 h-3.5" />
          Omitir este paso (opcional)
        </button>
      )}
      {step.status === 'skipped' && (
        <p className="text-center text-xs text-zinc-600">Paso omitido — se usarán 7 días de buffer por defecto.</p>
      )}
    </div>
  );
}
