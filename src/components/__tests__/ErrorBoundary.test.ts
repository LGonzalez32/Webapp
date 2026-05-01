/**
 * ErrorBoundary.test.tsx — Sprint I3
 *
 * Tests minimales sin DOM (vitest env=node, no jsdom). Cubrimos:
 *   - getDerivedStateFromError captura el error en state.
 *   - componentDidCatch loggea via console.error con shape parseable.
 *
 * El render del fallback UI se valida en browser (smoke test post-deploy).
 */
import { describe, it, expect, vi } from 'vitest'
import { ErrorBoundary } from '../ErrorBoundary'

describe('ErrorBoundary (Sprint I3)', () => {
  it('getDerivedStateFromError stores the error in state', () => {
    const err = new Error('boom')
    const next = ErrorBoundary.getDerivedStateFromError(err)
    expect(next).toEqual({ error: err })
  })

  it('componentDidCatch logs structured error info to console', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const eb = new ErrorBoundary({ children: null as any })
    // Stub setState to avoid React warnings in node environment
    ;(eb as any).setState = () => {}

    const err = new Error('test failure')
    err.stack = 'stack here'
    const errorInfo = { componentStack: '\n  in TestComp\n  in App' }

    eb.componentDidCatch(err, errorInfo as any)

    expect(consoleSpy).toHaveBeenCalledWith(
      '[ErrorBoundary]',
      expect.objectContaining({
        message: 'test failure',
        stack: 'stack here',
        componentStack: errorInfo.componentStack,
      }),
    )
    consoleSpy.mockRestore()
  })
})
