import { useEffect, type ReactNode } from 'react'
import PublicNavbar from './PublicNavbar'
import PublicFooter from './PublicFooter'
import WhatsAppWidget from '../ui/WhatsAppWidget'

export default function PublicLayout({ children }: { children: ReactNode }) {
  // Public pages: force light mode AND disable body transition that causes paint bugs
  useEffect(() => {
    const html = document.documentElement
    const body = document.body
    const wasDark = html.classList.contains('dark')
    html.classList.remove('dark')

    // Override Tailwind base styles that can block paint:
    // 1. Set explicit background/color (not via CSS variables)
    // 2. DISABLE transition-colors on body — this + backdrop-blur = Chrome compositing bug
    const prevTransition = body.style.transition
    body.style.transition = 'none'
    body.style.background = '#f8f9fc'
    body.style.color = '#1a1a2e'

    return () => {
      body.style.transition = prevTransition
      body.style.background = ''
      body.style.color = ''
      if (wasDark) html.classList.add('dark')
    }
  }, [])

  return (
    <div style={{ background: '#f8f9fc', color: '#1a1a2e', minHeight: '100vh' }}>
      <PublicNavbar />
      <main>{children}</main>
      <PublicFooter />
      <WhatsAppWidget />
    </div>
  )
}
