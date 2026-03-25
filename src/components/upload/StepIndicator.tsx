import { Check } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UploadStep } from '../../types';

interface StepIndicatorProps {
  steps: UploadStep[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
}

export default function StepIndicator({ steps, currentStepIndex, onStepClick }: StepIndicatorProps) {
  return (
    <div className="flex items-start gap-0">
      {steps.map((step, idx) => {
        const isActive = idx === currentStepIndex;
        const isPast = idx < currentStepIndex;
        const isDone = step.status === 'loaded' || step.status === 'skipped';
        const isClickable = isDone && isPast && !!onStepClick;

        return (
          <div key={step.id} className="flex items-start">
            <div className="flex flex-col items-center">
              {/* Circle */}
              <div
                onClick={() => isClickable && onStepClick(idx)}
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center text-sm transition-all',
                  isDone && isPast
                    ? 'bg-emerald-500 text-white cursor-pointer hover:bg-emerald-600'
                    : isActive
                    ? 'bg-emerald-500 text-white font-semibold'
                    : 'border-2 border-[var(--sf-border)] text-[var(--sf-t4)]'
                )}
              >
                {isDone && isPast ? <Check className="w-4 h-4" strokeWidth={3} /> : idx + 1}
              </div>

              {/* Label */}
              <div className="mt-1.5 text-center">
                <p className={cn(
                  'text-[10px] font-bold uppercase tracking-wider whitespace-nowrap',
                  isActive ? 'text-[var(--sf-t1)] font-semibold' : 'text-[var(--sf-t4)]'
                )}>
                  {step.label}
                </p>
                {!step.required && (
                  <span className="text-xs text-[var(--sf-t4)]">Opcional</span>
                )}
              </div>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className={cn(
                'w-16 md:w-24 h-0.5 mt-4 mx-1 transition-all rounded-full',
                isPast ? 'bg-emerald-500' : 'bg-[var(--sf-border)]'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
