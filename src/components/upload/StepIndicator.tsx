import { Check, Lock } from 'lucide-react';
import { cn } from '../../lib/utils';
import { UploadStep } from '../../types';

interface StepIndicatorProps {
  steps: UploadStep[];
  currentStepIndex: number;
}

export default function StepIndicator({ steps, currentStepIndex }: StepIndicatorProps) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const isActive = idx === currentStepIndex;
        const isPast = idx < currentStepIndex;
        const isDone = step.status === 'loaded' || step.status === 'skipped';
        const isError = step.status === 'error';

        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={cn(
                'w-9 h-9 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all',
                isActive
                  ? 'bg-emerald-500 border-emerald-500 text-black shadow-lg shadow-emerald-500/30'
                  : isDone && isPast
                  ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
                  : isError
                  ? 'bg-red-500/20 border-red-500/50 text-red-400'
                  : 'bg-zinc-900 border-zinc-700 text-zinc-600'
              )}>
                {(isDone && isPast) ? <Check className="w-4 h-4" /> : idx + 1}
              </div>
              <div className="mt-1.5 text-center">
                <p className={cn('text-[10px] font-bold uppercase tracking-wider whitespace-nowrap', isActive ? 'text-zinc-200' : 'text-zinc-600')}>
                  {step.label}
                </p>
                {!step.required && (
                  <p className="text-[9px] text-zinc-700 font-medium">opcional</p>
                )}
              </div>
            </div>

            {idx < steps.length - 1 && (
              <div className={cn(
                'w-16 md:w-24 h-0.5 mb-5 mx-1 transition-all',
                isPast && idx < currentStepIndex - 1 ? 'bg-emerald-500/40' : 'bg-zinc-800'
              )} />
            )}
          </div>
        );
      })}
    </div>
  );
}
