import { Loader2 } from 'lucide-react'

interface LoadingOverlayProps {
  isVisible: boolean
  title: string
  subtitle: string
  progress?: number
}

export default function LoadingOverlay({ isVisible, title, subtitle, progress }: LoadingOverlayProps) {
  if (!isVisible) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-zinc-900 border border-zinc-800 rounded-3xl p-10 max-w-sm w-full mx-4 shadow-2xl flex flex-col items-center gap-6 animate-in zoom-in-95 duration-300">
        <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
        </div>

        <div className="text-center space-y-1">
          <h3 className="text-lg font-bold text-zinc-50">{title}</h3>
          <p className="text-sm text-zinc-400">{subtitle}</p>
        </div>

        {progress !== undefined && (
          <div className="w-full space-y-2">
            <div className="w-full bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className="h-2 bg-emerald-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
              />
            </div>
            <p className="text-[10px] text-zinc-500 text-right font-mono">{Math.round(progress)}%</p>
          </div>
        )}
      </div>
    </div>
  )
}
