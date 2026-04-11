import type { ReactNode } from 'react'
import { X } from 'lucide-react'

interface Badge {
  label: string
  color: string
  bg: string
}

interface AnalysisDrawerProps {
  isOpen: boolean
  onClose: () => void
  title: string
  subtitle?: string
  badges?: Badge[]
  analysisText: string | null
  analysisContent?: ReactNode
  onDeepen?: () => void
  deepenLabel?: string
}

function formatLine(line: string, i: number) {
  const isHeader = line.startsWith('📊') || line.startsWith('💡') || line.startsWith('📈') || line.startsWith('⚠️')
  return (
    <p key={i} style={{
      margin: '2px 0',
      fontWeight: isHeader ? 600 : 400,
      color: isHeader ? 'var(--sf-t1)' : 'var(--sf-t3)',
      marginTop: (line.startsWith('📈') || line.startsWith('⚠️')) ? 8 : 2,
      paddingLeft: line.startsWith('-') ? 8 : 0,
    }}>
      {line}
    </p>
  )
}

export default function AnalysisDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  badges = [],
  analysisText,
  analysisContent,
  onDeepen,
  deepenLabel = '+ Profundizar en Chat IA',
}: AnalysisDrawerProps) {
  return (
    <>
      {/* Backdrop */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 transition-opacity duration-200"
          style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(2px)' }}
          onClick={onClose}
        />
      )}
      {/* Drawer panel */}
      <div
        className="fixed top-0 right-0 z-50 h-full flex flex-col transition-transform duration-250 ease-out"
        style={{
          width: 'min(420px, 90vw)',
          background: 'var(--sf-card)',
          borderLeft: '1px solid var(--sf-border)',
          boxShadow: isOpen ? '-8px 0 30px rgba(0,0,0,0.25)' : 'none',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        }}
      >
        {isOpen && (analysisText || analysisContent) && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid var(--sf-border)' }}>
              <div>
                <p className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>{title}</p>
                {(subtitle || badges.length > 0) && (
                  <div className="flex items-center gap-2 mt-0.5">
                    {badges.map((b, i) => (
                      <span key={i} style={{
                        fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4,
                        background: b.bg, color: b.color,
                      }}>{b.label}</span>
                    ))}
                    {subtitle && (
                      <span style={{ fontSize: 11, fontFamily: "'DM Mono', monospace", color: 'var(--sf-t4)' }}>
                        {subtitle}
                      </span>
                    )}
                  </div>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-[var(--sf-hover)] transition-colors cursor-pointer"
                style={{ color: 'var(--sf-t4)' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="flex items-center gap-2 mb-3">
                <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--sf-green)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  ✦ {analysisContent ? 'Análisis' : 'Análisis IA'}
                </span>
              </div>
              {analysisContent ? (
                <div>{analysisContent}</div>
              ) : analysisText ? (
                <div style={{ fontSize: 13, lineHeight: 1.7, whiteSpace: 'pre-line' }}>
                  {analysisText.split('\n').filter(Boolean).map(formatLine)}
                </div>
              ) : null}
            </div>

            {/* Footer */}
            {onDeepen && (
              <div className="px-5 py-3" style={{ borderTop: '1px solid var(--sf-border)' }}>
                <button
                  onClick={onDeepen}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                    padding: '8px 14px', borderRadius: 8, fontSize: 12, fontWeight: 600,
                    border: '1px solid var(--sf-green-border)', background: 'var(--sf-green-bg)',
                    color: 'var(--sf-green)', cursor: 'pointer', transition: 'filter 0.15s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.filter = 'brightness(0.95)')}
                  onMouseLeave={e => (e.currentTarget.style.filter = 'none')}
                >
                  {deepenLabel}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </>
  )
}
