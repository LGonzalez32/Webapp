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

  // [Z.P1.10.c.fix-mini/C3 + P5] Texto de error discriminado por código.
  // El banner principal del dropzone debe ser específico para cada código —
  // antes colapsaba >50MB, .pdf y .xlsx corruptos al mismo "No pudimos leer
  // este archivo". El usuario solo ve este banner si no scrollea al detalle
  // de abajo, así que tiene que hablar por sí mismo.
  const errorMessage = (() => {
    if (!isError || !step.parseError) return 'No pudimos leer este archivo';
    const pe = step.parseError;
    switch (pe.code) {
      case 'FILE_TOO_LARGE':
        return `Archivo muy pesado (${pe.sizeMB}MB > ${pe.limitMB}MB)`;
      case 'FORMAT_NOT_SUPPORTED':
        return 'Formato no soportado — usá .xlsx, .xls o .csv';
      case 'FILE_PROTECTED_OR_CORRUPT':
        return 'Archivo protegido o corrupto';
      case 'EMPTY_FILE':
        return 'El archivo no tiene datos procesables';
      case 'MULTIPLE_SHEETS':
        return 'El Excel tiene varias pestañas — dejá una sola';
      case 'MISSING_REQUIRED':
        return 'Faltan columnas obligatorias';
      case 'NO_VALID_COLUMNS':
        return 'No reconocimos las columnas del archivo';
      case 'INVALID_DATES':
        return 'No pudimos interpretar las fechas';
      case 'ENCODING_ISSUE':
        return 'Problema de codificación de texto';
      default:
        return 'No pudimos leer este archivo';
    }
  })();

  return (
    <div className="space-y-3">
      <div
        onClick={() => !isProcessing && inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={handleDrop}
        className={cn(
          'relative border-2 border-dashed rounded-2xl transition-all cursor-pointer group flex flex-col items-center justify-center',
          isProcessing && 'cursor-not-allowed opacity-60',
          // [Z.P1.10.c.fix-mini/C1] min-h-[280px] solo en estado vacío.
          // En loaded/error el contenido es chico — forzar 280px de alto crea
          // whitespace que parece overlap visual.
          (isLoaded || isError) ? 'min-h-0' : 'min-h-[280px]',
          isDragOver
            ? 'border-[var(--primary)] bg-[var(--sf-green-bg)] p-8 scale-[1.005]'
            : isLoaded
            ? 'border-[var(--sf-green-border)] bg-[var(--sf-green-bg)] p-4'
            : isError
            ? 'border-[var(--danger)] border-opacity-40 bg-[var(--danger-soft)] p-4'
            : 'border-[var(--border)] p-6 hover:border-[var(--primary)] hover:bg-[var(--primary-soft)]'
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
          <>
            <div className="pointer-events-none absolute inset-0 rounded-2xl border-2 border-[var(--primary)] animate-sf-pulse" style={{ borderRadius: 'inherit' }} />
            <div className="text-center">
              <p className="text-base font-semibold" style={{ color: 'var(--primary)' }}>Soltá el archivo aquí</p>
            </div>
          </>
        ) : isProcessing ? (
          <div className="flex flex-col items-center gap-4 py-2 w-full">
            <div className="w-full max-w-md">
              <div className="h-3 rounded-full bg-[var(--sf-card)] border border-[var(--sf-border)] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300 ease-out"
                  style={{ background: 'var(--primary)', width: `${Math.max(2, progressPercent)}%` }}
                />
              </div>
            </div>
            <p className="text-2xl font-bold text-[var(--sf-t1)] tabular-nums">{progressPercent}%</p>
            <p className="text-sm text-[var(--sf-t3)] min-h-[1.25rem] text-center">
              {progressDetail || 'Procesando archivo...'}
            </p>
          </div>
        ) : isLoaded ? (
          // [Z.P1.10.c.fix-mini/C1 + primera-impresion] Stack vertical compacto.
          // El detalle de filas/columnas vive en el banner verde "Archivo listo"
          // de la página, no se duplica acá. Acá solo: ícono + filename + acción.
          <div className="flex items-center gap-2.5 w-full">
            <CheckCircle2
              className="w-5 h-5 shrink-0 animate-sf-check"
              style={{ color: 'var(--primary)' }}
            />
            <p className="text-sm font-semibold text-[var(--sf-t1)] truncate flex-1 min-w-0">{step.file?.name}</p>
            <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Cambiar archivo</span>
          </div>
        ) : isError ? (
          <div className="flex flex-col gap-2 w-full">
            <div className="flex items-center gap-2.5 min-w-0">
              <XCircle className="w-5 h-5 text-red-500 shrink-0" />
              <p className="text-sm font-semibold text-[var(--sf-t1)] truncate">
                {step.file?.name ?? 'Archivo con errores'}
              </p>
            </div>
            <div className="flex items-center justify-between gap-3 pl-7">
              <p className="text-xs min-w-0 truncate" style={{ color: 'var(--danger)' }}>{errorMessage}</p>
              <span className="text-xs text-[var(--sf-t4)] underline underline-offset-2 shrink-0">Intentar con otro</span>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center text-center w-full">
            <div className="sf-dropzone-icon mb-4 animate-sf-breathe">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
            </div>
            <p className="text-[22px] font-semibold leading-snug text-[var(--sf-t1)] mb-1" style={{ letterSpacing: '-0.01em' }}>Arrastrá tu archivo aquí</p>
            <p className="text-sm text-[var(--sf-t3)]">o hacé clic para elegir desde tu computadora</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {['.xlsx', '.xls', '.csv', 'máx 50MB'].map((lbl) => (
                <span key={lbl} className="inline-flex items-center px-2.5 py-1 rounded-full border border-[var(--sf-border)] bg-[var(--sf-overlay-light)] font-mono text-[11px] text-[var(--sf-t3)]">
                  {lbl}
                </span>
              ))}
            </div>
            {(onLoadDemo || onDownloadTemplate) && (
              <div className="mt-6 pt-4 w-full flex flex-col gap-1.5 items-center" style={{ borderTop: '1px solid var(--border-soft)' }}>
                {onLoadDemo && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onLoadDemo(); }}
                    title="Carga un dataset de ejemplo con 50.012 registros para que explorés la app sin subir tu archivo."
                    className="text-xs transition-colors linkbtn"
                  >
                    ¿Primera vez? → Cargar demo
                  </button>
                )}
                {onDownloadTemplate && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onDownloadTemplate(); }}
                    className="text-xs transition-colors" style={{ color: 'var(--t-4)' }}
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
