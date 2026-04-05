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
                <Link to="/login" state={{ mode: 'demo' }} className="text-sm hover:text-[#00D68F] transition-colors" style={{ color: 'var(--sf-footer-text, #94a3b8)' }}>
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
            </ul>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="mt-10 pt-6 border-t text-center" style={{ borderColor: 'rgba(148,163,184,0.15)' }}>
          <p className="text-xs" style={{ color: 'var(--sf-footer-text, #64748b)' }}>
            © 2026 SalesFlow. Todos los derechos reservados.
          </p>
        </div>
      </div>
    </footer>
  )
}
