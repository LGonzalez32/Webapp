import { useState, useRef, useEffect, useMemo } from 'react'
import { useAppStore } from '../store/appStore'
import { useAnalysis } from '../lib/useAnalysis'
import { sendMessage } from '../lib/chatService'
import type { ChatMessage } from '../types'
import { Bot, Send, User, Loader2 } from 'lucide-react'
import { cn } from '../lib/utils'
import { format } from 'date-fns'
import { periodKey } from '../lib/analysis'

const QUICK_QUESTIONS = [
  '🔴 ¿Qué vendedores están en riesgo crítico?',
  '📉 ¿Quién ha tenido la mayor caída este mes?',
  '🎯 ¿Cómo va el equipo vs la meta?',
  '😴 ¿Qué clientes no han comprado en 30+ días?',
  '⚠️ ¿Cuál es la alerta más crítica ahora?',
  '📊 Dame un resumen ejecutivo del mes',
  '🏆 ¿Quién es el mejor vendedor este mes?',
  '📦 ¿Qué productos no se están vendiendo?',
  '💰 ¿Qué cliente representa mayor concentración de riesgo?',
  '🔮 ¿Cómo cierra el mes si seguimos al ritmo actual?',
]

export default function ChatPage() {
  useAnalysis()
  const {
    isProcessed, vendorAnalysis, teamStats, insights, clientesDormidos,
    concentracionRiesgo, configuracion, selectedPeriod,
  } = useAppStore()

  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('sf_openai_key') ?? '')
  const scrollRef = useRef<HTMLDivElement>(null)

  const analysisContext = useMemo(() => {
    if (!isProcessed || !teamStats) return 'No hay datos cargados.'

    const key = periodKey(selectedPeriod.year, selectedPeriod.month)
    const critVendors = vendorAnalysis.filter((v) => v.riesgo === 'critico').map((v) =>
      `- ${v.vendedor}: ${v.unidades_periodo} uds, var ${v.variacion_pct !== null ? v.variacion_pct.toFixed(1) + '%' : 'N/A'}${v.cumplimiento_pct !== null ? `, cumplimiento ${v.cumplimiento_pct?.toFixed(0)}%` : ''}`
    ).join('\n')

    const riskVendors = vendorAnalysis.filter((v) => v.riesgo === 'riesgo').map((v) =>
      `- ${v.vendedor}: ${v.unidades_periodo} uds`
    ).join('\n')

    const topInsights = insights.slice(0, 5).map((i) =>
      `[${i.prioridad}] ${i.emoji} ${i.titulo}: ${i.descripcion}`
    ).join('\n')

    const dormidos = clientesDormidos.slice(0, 5).map((c) =>
      `- ${c.cliente} (${c.vendedor}): ${c.dias_sin_actividad} días inactivo`
    ).join('\n')

    const concentracion = concentracionRiesgo.slice(0, 3).map((c) =>
      `- ${c.cliente}: ${c.pct_del_total.toFixed(1)}% del total`
    ).join('\n')

    return `
PERÍODO: ${key} | Empresa: ${configuracion.empresa}

EQUIPO:
- Total unidades: ${teamStats.total_unidades.toLocaleString()}
- Variación vs mes ant: ${teamStats.variacion_pct !== null ? teamStats.variacion_pct.toFixed(1) + '%' : 'N/A'}
${teamStats.meta_equipo ? `- Meta equipo: ${teamStats.meta_equipo.toLocaleString()} | Cumplimiento: ${teamStats.cumplimiento_equipo?.toFixed(1)}%` : ''}
${teamStats.proyeccion_equipo ? `- Proyección cierre: ${teamStats.proyeccion_equipo.toLocaleString()} uds` : ''}
- Días transcurridos: ${teamStats.dias_transcurridos}/${teamStats.dias_totales}
- Mejor vendedor: ${teamStats.mejor_vendedor}
${teamStats.vendedor_critico ? `- Vendedor en riesgo: ${teamStats.vendedor_critico}` : ''}

VENDEDORES CRÍTICOS:
${critVendors || 'Ninguno'}

VENDEDORES EN RIESGO:
${riskVendors || 'Ninguno'}

PRINCIPALES ALERTAS:
${topInsights || 'Sin alertas activas'}

CLIENTES DORMIDOS (${teamStats.clientes_dormidos_count}):
${dormidos || 'Ninguno'}

CONCENTRACIÓN DE RIESGO:
${concentracion || 'Sin concentración crítica'}
`.trim()
  }, [isProcessed, vendorAnalysis, teamStats, insights, clientesDormidos, concentracionRiesgo, configuracion, selectedPeriod])

  useEffect(() => {
    if (messages.length === 0) {
      const greeting = !isProcessed
        ? 'Aún no tienes datos cargados. Ve a **Cargar datos** para analizar tus ventas.'
        : `¡Hola! Tengo acceso a los datos de ${configuracion.empresa}.\n\n**${insights.filter((i) => i.prioridad === 'CRITICA').length} alertas críticas** activas. ¿En qué te puedo ayudar?`
      setMessages([{ role: 'assistant', content: greeting, timestamp: new Date() }])
    }
  }, [isProcessed])

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight)
  }, [messages, isLoading])

  const handleSend = async (text: string) => {
    if (!text.trim() || isLoading) return
    if (!apiKey) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: '❌ Configura tu OpenAI API key abajo para usar el asistente.',
        timestamp: new Date()
      }])
      return
    }
    if (!apiKey.startsWith('sk-')) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: '❌ API key inválida — debe comenzar con sk-',
        timestamp: new Date()
      }])
      return
    }

    setMessages((prev) => [...prev, { role: 'user', content: text, timestamp: new Date() }])
    setInput('')
    setIsLoading(true)

    try {
      const response = await sendMessage(text, apiKey, analysisContext, messages)
      setMessages((prev) => [...prev, { role: 'assistant', content: response, timestamp: new Date() }])
    } catch (error: any) {
      setMessages((prev) => [...prev, {
        role: 'assistant',
        content: `❌ ${error.message}`,
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
    }
  }

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem('sf_openai_key', key)
  }

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-in fade-in duration-500">
      <div className="flex flex-col md:flex-row gap-4 h-full min-h-0">
        {/* Chat area */}
        <div className="flex-1 flex flex-col bg-zinc-900/50 border border-zinc-800 rounded-2xl overflow-hidden min-h-0">
          {/* Header */}
          <div className="px-5 py-3.5 border-b border-zinc-800 flex items-center gap-3 shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[#00B894]/10 flex items-center justify-center border border-[#00B894]/20">
              <Bot className="w-5 h-5 text-[#00B894]" />
            </div>
            <div>
              <p className="text-sm font-bold text-zinc-100">Asistente SalesFlow</p>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-1.5 h-1.5 rounded-full', apiKey ? 'bg-[#00B894]' : 'bg-red-500')} />
                <span className={cn('text-[10px] font-bold', apiKey ? 'text-[#00B894]' : 'text-red-500')}>
                  {apiKey ? 'Conectado' : 'Sin API key'}
                </span>
              </div>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-5 space-y-5 min-h-0">
            {messages.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  'flex gap-3 max-w-[85%]',
                  msg.role === 'user' ? 'ml-auto flex-row-reverse' : 'mr-auto'
                )}
              >
                <div className={cn(
                  'w-7 h-7 rounded-lg flex items-center justify-center shrink-0 border',
                  msg.role === 'user'
                    ? 'bg-[#00B894] border-[#00B894]/80'
                    : 'bg-zinc-800 border-zinc-700'
                )}>
                  {msg.role === 'user'
                    ? <User className="w-3.5 h-3.5 text-black" />
                    : <Bot className="w-3.5 h-3.5 text-[#00B894]" />}
                </div>
                <div>
                  <div className={cn(
                    'p-3.5 rounded-xl text-sm leading-relaxed',
                    msg.role === 'user'
                      ? 'bg-[#00B894] text-black font-medium rounded-tr-none'
                      : 'bg-zinc-800 text-zinc-200 rounded-tl-none border border-zinc-700/50'
                  )}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                  <p className={cn(
                    'text-[9px] text-zinc-700 mt-1',
                    msg.role === 'user' ? 'text-right' : 'text-left'
                  )}>
                    {format(msg.timestamp, 'HH:mm')}
                  </p>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="w-7 h-7 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center">
                  <Bot className="w-3.5 h-3.5 text-[#00B894]" />
                </div>
                <div className="bg-zinc-800 border border-zinc-700/50 p-3.5 rounded-xl rounded-tl-none flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 bg-[#00B894] rounded-full animate-bounce [animation-delay:-0.3s]" />
                  <div className="w-1.5 h-1.5 bg-[#00B894] rounded-full animate-bounce [animation-delay:-0.15s]" />
                  <div className="w-1.5 h-1.5 bg-[#00B894] rounded-full animate-bounce" />
                </div>
              </div>
            )}
          </div>

          {/* Input */}
          <div className="p-4 border-t border-zinc-800 shrink-0">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(input) }
                }}
                placeholder="Pregunta sobre tus ventas..."
                rows={1}
                className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-3 pr-12 text-sm text-white placeholder:text-zinc-600 focus:outline-none focus:border-[#00B894]/40 transition-all resize-none"
                disabled={isLoading}
              />
              <button
                onClick={() => handleSend(input)}
                disabled={!input.trim() || isLoading}
                className="absolute right-2.5 bottom-2.5 w-8 h-8 bg-[#00B894] hover:bg-[#00a884] disabled:bg-zinc-800 disabled:text-zinc-600 text-black rounded-lg flex items-center justify-center transition-all"
              >
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>

        {/* Sidebar */}
        <div className="w-full md:w-72 flex flex-col gap-4">
          {/* Quick questions */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">
              Preguntas frecuentes
            </p>
            <div className="space-y-1.5">
              {QUICK_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  onClick={() => handleSend(q)}
                  className="w-full text-left px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-800 hover:border-[#00B894]/30 hover:bg-[#00B894]/5 text-[11px] text-zinc-400 hover:text-[#00B894] font-medium transition-all"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* API key */}
          <div className="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-4">
            <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-600 mb-3">
              OpenAI API Key
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={(e) => saveApiKey(e.target.value)}
              placeholder="sk-..."
              className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono focus:outline-none focus:border-[#00B894]/40 transition-all"
            />
            <p className="text-[10px] text-zinc-700 mt-2">
              Se guarda solo en tu navegador
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
