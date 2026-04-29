/**
 * Hook que combina interceptor de clicks DOM + beforeunload nativo
 * para advertir al usuario antes de perder un wizard draft activo.
 *
 * LIMITACIÓN CONOCIDA: solo intercepta clicks en <a> dentro del
 * DOM. Cualquier navegación programática (navigate('/x') desde
 * código) NO dispara el guard. Si agregás un navigate() en código,
 * limpiá el draft antes (clearWizardDraft) o el usuario perderá
 * el aviso.
 *
 * Razón del approach: React Router v7 useBlocker requiere
 * createBrowserRouter (Data Router), pero la app usa BrowserRouter
 * declarativo. Migración documentada en BACKLOG.
 *
 * Cobertura:
 *   ✓ Click en sidebar / nav links / cualquier <a href="/..."> in-app.
 *   ✓ Reload / cierre de pestaña / nav externa (via beforeunload).
 *   ✗ Llamadas programáticas a useNavigate() bypasean.
 *
 * Cuando el modal está abierto, llamar confirmLeave navega al href
 * pendiente; cancelLeave cierra el modal y descarta el intent.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'

export interface UnsavedGuard {
  showModal: boolean
  confirmLeave: () => void
  cancelLeave: () => void
}

function isInAppHref(href: string | null): boolean {
  if (!href) return false
  if (href.startsWith('#')) return false
  if (/^[a-z]+:/i.test(href) && !href.startsWith('http')) return false // mailto:, tel:, etc
  if (href.startsWith('http')) {
    try {
      const u = new URL(href)
      return u.origin === window.location.origin
    } catch { return false }
  }
  return href.startsWith('/')
}

export function useUnsavedGuard(isDirty: boolean): UnsavedGuard {
  const navigate = useNavigate()
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Interceptor in-app: catch <a> clicks before React Router los maneje.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return
      const target = e.target as HTMLElement | null
      const a = target?.closest('a') as HTMLAnchorElement | null
      if (!a || a.target === '_blank') return
      const href = a.getAttribute('href')
      if (!isInAppHref(href)) return
      // Mismo path = nav inerte; no bloquear
      if (href === window.location.pathname + window.location.search) return
      e.preventDefault()
      e.stopPropagation()
      setPendingHref(href!)
    }
    document.addEventListener('click', handler, true)
    return () => document.removeEventListener('click', handler, true)
  }, [isDirty])

  // beforeunload: cubre reload y tab close.
  useEffect(() => {
    if (!isDirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  const confirmLeave = useCallback(() => {
    const href = pendingHref
    setPendingHref(null)
    if (href) navigate(href)
  }, [pendingHref, navigate])

  const cancelLeave = useCallback(() => {
    setPendingHref(null)
  }, [])

  return {
    showModal: pendingHref !== null,
    confirmLeave,
    cancelLeave,
  }
}
