/**
 * ErrorBoundary.tsx — Sprint I3
 *
 * Red de seguridad mínima para crashes de React. Hoy un error en cualquier
 * página deja la app en pantalla blanca; este boundary muestra un fallback
 * accionable y loggea via console.error (placeholder de Sentry futuro).
 *
 * Wrappear <App /> en el root (main.tsx).
 */
import * as React from 'react'
import { cleanupClientState } from '../lib/cleanupClientState'

// Sin @types/react instalados (proyecto usa React 19 con inferencia implícita).
// Tipamos manualmente la base class para no perder seguridad pero sí poder
// extender Component (los class members heredados no son visibles en TS sin
// las definiciones de tipo del paquete).
interface ErrorInfoLike { componentStack?: string }
type ReactNodeLike = unknown
interface Props { children: ReactNodeLike }
interface State {
  error: Error | null
  errorInfo: ErrorInfoLike | null
}

interface ComponentLike<P, S> {
  props: P
  state: S
  setState(next: Partial<S>): void
}
type ComponentCtor<P, S> = new (props: P) => ComponentLike<P, S>
const ReactComponent = (React as unknown as { Component: ComponentCtor<Props, State> }).Component

export class ErrorBoundary extends ReactComponent {
  constructor(props: Props) {
    super(props)
    this.state = { error: null, errorInfo: null }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfoLike): void {
    // Placeholder para Sentry. Estructurado para parsear desde logs.
    console.error('[ErrorBoundary]', { message: error.message, stack: error.stack, componentStack: errorInfo.componentStack })
    this.setState({ errorInfo })
  }

  handleReload = (): void => {
    window.location.reload()
  }

  handleClearAndReload = async (): Promise<void> => {
    try {
      await cleanupClientState()
    } catch {
      // even if cleanup fails, force a reload — the user is stuck otherwise
    }
    window.location.reload()
  }

  render(): ReactNodeLike {
    if (!this.state.error) return this.props.children

    const { error, errorInfo } = this.state
    return (
      <div
        role="alert"
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
          background: '#0a0f1c',
          color: '#e2e8f0',
          fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        }}
      >
        <div style={{ maxWidth: 560, width: '100%' }}>
          <h1 style={{ fontSize: 24, fontWeight: 700, margin: '0 0 12px' }}>
            Algo falló inesperadamente
          </h1>
          <p style={{ fontSize: 15, margin: '0 0 24px', color: '#94a3b8' }}>
            La aplicación encontró un error. Tus datos no se perdieron.
          </p>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <button
              onClick={this.handleReload}
              style={{
                padding: '10px 20px',
                background: '#10b981',
                color: '#0a0f1c',
                border: 'none',
                borderRadius: 8,
                fontWeight: 600,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Recargar página
            </button>
            <button
              onClick={this.handleClearAndReload}
              style={{
                padding: '10px 20px',
                background: 'transparent',
                color: '#fca5a5',
                border: '1px solid #7f1d1d',
                borderRadius: 8,
                fontWeight: 500,
                cursor: 'pointer',
                fontSize: 14,
              }}
            >
              Limpiar caché y recargar
            </button>
          </div>
          <details style={{ marginTop: 28, color: '#64748b', fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', padding: '8px 0' }}>
              Detalles técnicos (para soporte)
            </summary>
            <pre
              style={{
                margin: '8px 0 0',
                padding: 12,
                background: '#020617',
                borderRadius: 6,
                overflow: 'auto',
                fontSize: 11,
                lineHeight: 1.5,
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
{error.message}
{errorInfo?.componentStack ?? ''}
            </pre>
          </details>
        </div>
      </div>
    )
  }
}
