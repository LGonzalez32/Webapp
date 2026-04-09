import { Link } from 'react-router-dom'
import { Zap } from 'lucide-react'

// ⚠️ IMPORTANTE: Reemplazar con tu número de WhatsApp Business real
const WHATSAPP_NUMBER = '+50499999999'

export default function PublicFooter() {
  return (
    <footer
      className="border-t"
      style={{
        background: 'var(--sf-footer-bg, #1e293b)',
        borderColor: 'var(--sf-border, #334155)',
        color: 'var(--sf-footer-text, #94a3b8)',
      }}
    >
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Col 1 — Brand */}
          <div>
            <div className="flex items-center gap-2.5 mb-3">
              <div className="w-7 h-7 bg-[#00D68F] rounded-lg flex items-center justify-center">
                <Zap className="w-3.5 h-3.5 text-white" />
              </div>
              <span className="text-base font-black text-[#00D68F] tracking-tight">SalesFlow</span>
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
              Inteligencia comercial para equipos de ventas.
            </p>
          </div>

          {/* Col 2 — Producto */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--sf-footer-heading, #e2e8f0)' }}>
              Producto
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Inicio
                </Link>
              </li>
              <li>
                <Link to="/pricing" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Precios
                </Link>
              </li>
              <li>
                <Link to="/demo" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Demo
                </Link>
              </li>
            </ul>
          </div>

          {/* Col 3 — Contacto */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--sf-footer-heading, #e2e8f0)' }}>
              Contacto
            </h4>
            <ul className="space-y-2.5">
              <li>
                {/* ⚠️ IMPORTANTE: Configurar este email real o redirigir a un alias */}
                <a href="mailto:soporte@data-solutions-hub.com" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  soporte@data-solutions-hub.com
                </a>
              </li>
              <li>
                <a
                  href={`https://wa.me/${WHATSAPP_NUMBER.replace('+', '')}?text=Hola,%20me%20interesa%20SalesFlow`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm hover:text-[#00D68F] transition-colors"
                  style={{ color: 'var(--sf-footer-text, #94a3b8)' }}
                >
                  WhatsApp
                </a>
              </li>
            </ul>
          </div>

          {/* Col 4 — Legal */}
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--sf-footer-heading, #e2e8f0)' }}>
              Legal
            </h4>
            <ul className="space-y-2.5">
              <li>
                <Link to="/terminos" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Términos de Servicio
                </Link>
              </li>
              <li>
                <Link to="/privacidad" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Política de Privacidad
                </Link>
              </li>
              <li>
                <Link to="/nosotros" className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
                  Nosotros
                </Link>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t flex flex-col sm:flex-row items-center justify-between gap-4" style={{ borderColor: 'rgba(148,163,184,0.15)' }}>
          <p className="text-xs" style={{ color: 'var(--sf-footer-text, #64748b)' }}>
            © 2026 SalesFlow. Todos los derechos reservados.
          </p>
          <div className="flex items-center gap-4">
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'rgba(16,185,129,0.1)', color: '#10b981' }}>
              Hecho para LATAM
            </span>
            <a href="https://linkedin.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }} aria-label="LinkedIn">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" /></svg>
            </a>
            <a href="https://x.com" target="_blank" rel="noopener noreferrer" className="hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }} aria-label="X / Twitter">
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
            </a>
          </div>
        </div>
      </div>
    </footer>
  )
}
