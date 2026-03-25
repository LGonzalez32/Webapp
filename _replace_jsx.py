"""Replace 4 old JSX sections with unified Inteligencia Comercial feed."""
import sys

filepath = 'src/pages/EstadoComercialPage.tsx'

with open(filepath, 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Find boundaries (0-indexed)
separador1_idx = None
acceso_directo_idx = None

for i, line in enumerate(lines):
    if 'SEPARADOR' in line and separador1_idx is None and i > 1300:
        separador1_idx = i
    if 'ACCESO DIRECTO' in line:
        acceso_directo_idx = i

if separador1_idx is None or acceso_directo_idx is None:
    print('ERROR: Could not find section boundaries')
    sys.exit(1)

print(f'Replacing lines {separador1_idx + 1} to {acceso_directo_idx}')

new_section = r"""
      {/* ── INTELIGENCIA COMERCIAL ──────────────────────────────────────── */}
      <div style={{ borderTop: '1px solid #1A2F4A' }} />

      <div className="intel-fade space-y-4" style={{ animationDelay: '160ms' }}>
        {/* Header + count */}
        <div className="flex items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.15em]" style={{ color: '#4A6080' }}>
            Inteligencia Comercial
          </p>
          <span style={{
            fontFamily: "'DM Mono', monospace",
            fontSize: 11,
            color: '#4A6080',
            background: 'rgba(255,255,255,0.05)',
            padding: '2px 8px',
            borderRadius: 5,
          }}>
            {feedFiltered.length}
          </span>
        </div>

        {/* Filter chips */}
        <div className="flex gap-1.5 flex-wrap">
          {FEED_FILTERS.map(f => {
            if (f.key !== 'all' && feedFilterCounts[f.key] === 0) return null
            const isActive = feedFilter === f.key
            return (
              <button
                key={f.key}
                onClick={() => { setFeedFilter(f.key); setFeedVisible(5) }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all duration-150 cursor-pointer inline-flex items-center gap-1.5"
                style={isActive && f.color
                  ? { borderColor: f.color + '40', color: f.color, background: f.color + '10' }
                  : isActive
                  ? { borderColor: 'rgba(255,255,255,0.15)', color: '#E2EBF6', background: 'rgba(255,255,255,0.06)' }
                  : { borderColor: 'rgba(255,255,255,0.06)', color: '#4A6080', background: 'transparent' }
                }
              >
                {f.color && (
                  <span style={{ width: 6, height: 6, borderRadius: 2, background: f.color, display: 'inline-block' }} />
                )}
                {f.label}
                <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 10, opacity: 0.6 }}>
                  {feedFilterCounts[f.key]}
                </span>
              </button>
            )
          })}
        </div>

        {/* Feed rows */}
        <div className="space-y-2">
          {feedFiltered.slice(0, feedVisible).map((insight, idx) => {
            const accent = getAccentColor(insight.tipo)
            const label = getFeedLabel(insight.tipo)
            const isExpanded = expandedInsightId === insight.id
            const analysis = analysisMap[insight.id]
            const isHallazgo = insight.tipo === 'hallazgo'
            return (
              <div
                key={insight.id}
                className="intel-fade flex items-stretch rounded-xl overflow-hidden cursor-pointer transition-all duration-200"
                style={{
                  animationDelay: `${idx * 30}ms`,
                  border: '1px solid rgba(255,255,255,0.06)',
                  background: isExpanded ? 'rgba(255,255,255,0.04)' : 'rgba(255,255,255,0.025)',
                }}
                onClick={() => setExpandedInsightId(isExpanded ? null : insight.id)}
              >
                {/* Accent bar */}
                <div className="w-[3px] shrink-0" style={{ background: accent }} />

                {/* Content */}
                <div className="flex-1 min-w-0 p-4">
                  {/* Line 1: badge + title */}
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span
                      className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0"
                      style={{
                        fontFamily: "'DM Mono', monospace",
                        color: accent,
                        background: accent + '15',
                      }}
                    >
                      {label}
                    </span>
                    <span className="text-sm font-semibold leading-tight" style={{ color: '#E2EBF6' }}>
                      {insight.titulo}
                    </span>
                  </div>

                  {/* Line 2: description */}
                  <p className="text-[13px] leading-relaxed" style={{ color: '#5A7A9A' }}>
                    {insight.descripcion}
                  </p>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="mt-3 pt-3" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                      {isHallazgo ? (
                        /* Hallazgo: show extra data if available */
                        insight.impacto_economico ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs" style={{ color: '#5A7A9A' }}>Impacto estimado: </span>
                            <span className="text-xs font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: '#C8DDEF' }}>
                              {configuracion.moneda} {insight.impacto_economico.valor.toLocaleString()}
                            </span>
                          </div>
                        ) : insight.valor_numerico ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs" style={{ color: '#5A7A9A' }}>Valor: </span>
                            <span className="text-xs font-semibold" style={{ fontFamily: "'DM Mono', monospace", color: '#C8DDEF' }}>
                              {insight.valor_numerico.toLocaleString()}
                            </span>
                          </div>
                        ) : (
                          <p className="text-xs" style={{ color: '#5A7A9A' }}>Sin datos adicionales.</p>
                        )
                      ) : (
                        /* Non-hallazgo: IA analysis */
                        <>
                          {!analysis && (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleAnalyzeInsight(insight) }}
                              className="text-xs font-medium cursor-pointer inline-flex items-center gap-1"
                              style={{ color: '#38bdf8', opacity: 0.8, background: 'none', border: 'none', padding: 0 }}
                              onMouseEnter={e => (e.currentTarget.style.opacity = '1')}
                              onMouseLeave={e => (e.currentTarget.style.opacity = '0.8')}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                                <path d="M12 2L15 8.5L22 9.5L17 14.5L18 21.5L12 18.5L6 21.5L7 14.5L2 9.5L9 8.5Z" />
                              </svg>
                              Analizar con IA →
                            </button>
                          )}
                          {analysis?.loading && (
                            <div className="flex items-center gap-2 text-sm" style={{ color: '#5A7A9A' }}>
                              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                              </svg>
                              Analizando...
                            </div>
                          )}
                          {analysis?.text && !analysis.loading && (
                            <>
                              <div className="text-[13px] leading-relaxed whitespace-pre-line" style={{ color: '#8BA4BE' }}>
                                {analysis.text}
                              </div>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  navigate('/chat?q=' + encodeURIComponent(`Profundizar sobre: ${insight.titulo}. ${insight.descripcion}`))
                                }}
                                className="mt-3 px-4 py-2 rounded-lg text-xs font-medium cursor-pointer"
                                style={{ border: '1px solid rgba(0,214,143,0.2)', background: 'rgba(0,214,143,0.06)', color: '#00D68F' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(0,214,143,0.12)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,214,143,0.06)')}
                              >
                                + Profundizar
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Critical dot */}
                {insight.prioridad === 'CRITICA' && (
                  <span
                    className="w-2 h-2 rounded-full shrink-0 mt-5 mr-4"
                    style={{ background: '#ef4444', boxShadow: '0 0 8px rgba(239,68,68,0.4)' }}
                  />
                )}
              </div>
            )
          })}

          {/* Show more */}
          {feedVisible < feedFiltered.length && (
            <button
              onClick={() => setFeedVisible(v => v + 5)}
              className="w-full py-3 rounded-xl text-[13px] font-medium transition-all duration-150 cursor-pointer"
              style={{
                border: '1px dashed rgba(255,255,255,0.08)',
                background: 'transparent',
                color: '#4A6080',
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)'; e.currentTarget.style.color = '#8BA4BE' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'; e.currentTarget.style.color = '#4A6080' }}
            >
              Ver {Math.min(5, feedFiltered.length - feedVisible)} más de {feedFiltered.length - feedVisible} restantes
            </button>
          )}
        </div>
      </div>

"""

# Build new file
new_lines = lines[:separador1_idx] + [new_section] + lines[acceso_directo_idx:]

with open(filepath, 'w', encoding='utf-8') as f:
    f.writelines(new_lines)

print(f'Done. Replaced {acceso_directo_idx - separador1_idx} lines with unified feed.')
print(f'New total: {len(new_lines)} lines')
