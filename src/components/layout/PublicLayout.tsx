import type { ReactNode } from 'react'
import PublicNavbar from './PublicNavbar'
import PublicFooter from './PublicFooter'
import WhatsAppWidget from '../ui/WhatsAppWidget'

export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--sf-bg, #f8fafc)' }}>
      <PublicNavbar />
      <main className="flex-1">{children}</main>
      <PublicFooter />
      <WhatsAppWidget />
    </div>
  )
}
