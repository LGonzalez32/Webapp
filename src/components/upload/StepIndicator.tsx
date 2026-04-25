import { Check, SkipForward } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UploadStep } from '../../types';

interface StepIndicatorProps {
  steps: UploadStep[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
}

export default function StepIndicator({ steps, currentStepIndex, onStepClick, orientation = 'horizontal', className }: StepIndicatorProps) {
  if (orientation === 'vertical') {
    const progressRatio = steps.length > 1 ? currentStepIndex / (steps.length - 1) : 0;

    return (
      <nav className={cn('relative flex flex-col gap-5 py-1.5', className)} aria-label="Progreso de carga">
        <div className="absolute left-4 top-4 bottom-4 w-px bg-[var(--sf-border)]" />
        <div
          className="absolute left-4 top-4 w-px bg-emerald-500 transition-all duration-500"
          style={{ height: `calc((100% - 2rem) * ${progressRatio})` }}
        />
        {steps.map((step, idx) => {
          const isActive = idx === currentStepIndex;
          const isPast = idx < currentStepIndex;
          const isLoaded = step.status === 'loaded';
          const isSkipped = step.status === 'skipped';
          const isDone = isLoaded || isSkipped;
          const isClickable = isDone && isPast && !!onStepClick;

          return (
            <div key={step.id} className="relative flex gap-3">
              <button
                type="button"
                onClick={() => isClickable && onStepClick(idx)}
                disabled={!isClickable}
                aria-current={isActive ? 'step' : undefined}
                className={cn(
                  'relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all shrink-0',
                  isLoaded && isPast
                    ? 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600'
                    : isSkipped && isPast
                    ? 'bg-[var(--sf-inset)] text-[var(--sf-t4)] border-2 border-[var(--sf-border)] cursor-pointer hover:bg-[var(--sf-hover)]'
                    : isActive
                    ? 'bg-emerald-500 text-white font-semibold'
                    : 'border-2 border-[var(--sf-border)] text-[var(--sf-t4)] bg-[var(--sf-card)]',
                  !isClickable && 'cursor-default'
                )}
                title={isSkipped && isPast ? 'Paso omitido' : undefined}
              >
                {isLoaded && isPast
                  ? <Check className="w-4 h-4" strokeWidth={3} />
                  : isSkipped && isPast
                  ? <SkipForward className="w-3.5 h-3.5" />
                  : idx + 1}
              </button>
              <div className="min-w-0 pt-0.5">
                <p className={cn(
                  'text-[11px] font-bold uppercase leading-tight',
                  isActive ? 'text-[var(--sf-t1)]' : 'text-[var(--sf-t4)]'
                )}>
                  {step.label}
                </p>
                <p className="text-[11px] leading-snug text-[var(--sf-t5)] mt-0.5">
                  {isActive
                    ? 'Paso actual'
                    : isSkipped && isPast
                    ? 'Omitido'
                    : isLoaded && isPast
                    ? 'Completado'
                    : step.required ? 'Requerido' : 'Opcional'}
                </p>
              </div>
            </div>
          );
        })}
      </nav>
    );
  }

  return (
    <div className={cn('flex items-start gap-0', className)} aria-label="Progreso de carga">
      {steps.map((step, idx) => {
        const isActive = idx === currentStepIndex;
        const isPast = idx < currentStepIndex;
        const isLoaded = step.status === 'loaded';
        const isSkipped = step.status === 'skipped';
        const isDone = isLoaded || isSkipped;
        const isClickable = isDone && isPast && !!onStepClick;

        return (
          <div key={step.id} className="flex items-start">
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                onClick={() => isClickable && onStepClick(idx)}
                title={isSkipped && isPast ? 'Paso omitido' : undefined}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all',
                  isLoaded && isPast
                    ? 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600'
                    : isSkipped && isPast
                    ? 'bg-[var(--sf-inset)] text-[var(--sf-t4)] border-2 border-[var(--sf-border)] cursor-pointer hover:bg-[var(--sf-hover)]'
                    : isActive
                    ? 'bg-emerald-500 text-white font-semibold'
                    : 'border-2 border-[var(--sf-border)] text-[var(--sf-t4)]'
                )}
              >
                {isLoaded && isPast
                  ? <Check className="w-4 h-4" strokeWidth={3} />
                  : isSkipped && isPast
                  ? <SkipForward className="w-3.5 h-3.5" />
                  : idx + 1}
              </div>

              {/* Label */}
              <div className="mt-1.5 text-center">
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
                  isActive ? 'text-[var(--sf-t1)] font-semibold' : 'text-[var(--sf-t4)]'
                )}>
                  {step.label}
                </p>
                {isSkipped && isPast ? (
                  <span className="text-xs text-[var(--sf-t4)]">Omitido</span>
                ) : !step.required ? (
                  <span className="text-xs text-[var(--sf-t4)]">Opcional</span>
                ) : null}
              </div>
            </div>

            {/* Connector line — verde sólido si paso completado, punteado si omitido */}
            {idx < steps.length - 1 && (
              <div className={cn(
                'w-16 md:w-24 h-0.5 mt-4 mx-1 transition-all rounded-full',
                isLoaded && isPast ? 'bg-emerald-500'
                  : isSkipped && isPast ? 'bg-[var(--sf-border)]'
                  : 'bg-[var(--sf-border)]'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
