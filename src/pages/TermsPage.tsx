import { Link } from 'react-router-dom'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

export default function TermsPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="Términos de Servicio — SalesFlow"
        description="Términos y condiciones de uso de la plataforma SalesFlow."
        noindex
      />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--sf-t1)' }}>
          Términos de Servicio
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--sf-t5)' }}>
          Última actualización: abril 2026
        </p>

        {/* 1 */}
        <h2 id="aceptacion" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          1. Aceptación de los términos
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Al acceder o utilizar SalesFlow, aceptas estar sujeto a estos Términos de Servicio. Si no estás de acuerdo
          con alguno de estos términos, no utilices la plataforma. El uso continuado del servicio constituye la
          aceptación de cualquier modificación futura a estos términos.
        </p>

        {/* 2 */}
        <h2 id="descripcion-servicio" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          2. Descripción del servicio
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow es una plataforma SaaS de inteligencia comercial diseñada para empresas con equipos de ventas. El servicio analiza
          archivos de ventas proporcionados por el usuario y detecta patrones de riesgo comercial, incluyendo alertas
          sobre vendedores, clientes, productos e inventario. La plataforma incluye un asistente de inteligencia
          artificial para análisis conversacional de los datos.
        </p>

        {/* 3 */}
        <h2 id="registro-cuentas" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          3. Registro y cuentas
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Para utilizar SalesFlow, debes crear una cuenta proporcionando información veraz y actualizada. Eres
          responsable de mantener la seguridad de tus credenciales de acceso y de todas las actividades que ocurran
          bajo tu cuenta. Debes notificarnos inmediatamente si sospechas de un uso no autorizado.
        </p>

        {/* 4 */}
        <h2 id="planes-facturacion" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          4. Planes y facturación
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow ofrece los siguientes planes:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li><strong>Esencial</strong> — $19 USD/mes (1 usuario)</li>
          <li><strong>Profesional</strong> — $49 USD/mes (hasta 5 usuarios)</li>
          <li><strong>Empresa</strong> — precio personalizado (usuarios ilimitados)</li>
        </ul>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Todos los planes incluyen una prueba gratuita de 14 días sin necesidad de tarjeta de crédito. Al finalizar
          el período de prueba, deberás seleccionar un plan para continuar accediendo a todas las funcionalidades.
          Los planes se renuevan automáticamente cada mes. Puedes cancelar en cualquier momento y mantendrás el
          acceso hasta el final del período facturado.
        </p>

        {/* 5 */}
        <h2 id="uso-aceptable" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          5. Uso aceptable
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Al utilizar SalesFlow, te comprometes a:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li>No revender, sublicenciar ni redistribuir el servicio sin autorización.</li>
          <li>No realizar scraping, ingeniería inversa ni extracción automatizada de datos de la plataforma.</li>
          <li>No compartir tus credenciales de acceso con personas fuera de los usuarios permitidos por tu plan.</li>
          <li>No utilizar el servicio para actividades ilegales o que violen derechos de terceros.</li>
        </ul>

        {/* 6 */}
        <h2 id="propiedad-intelectual" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          6. Propiedad intelectual
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          La plataforma SalesFlow, incluyendo su código, diseño, algoritmos de análisis, sistema de alertas y
          asistente de inteligencia artificial, son propiedad de Data Solutions Hub. Se te otorga una licencia
          limitada, no exclusiva y revocable para usar el servicio conforme a estos términos.
        </p>

        {/* 7 */}
        <h2 id="datos-usuario" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          7. Datos del usuario
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Tú eres el único propietario de los datos que subes a SalesFlow. Puedes exportar tus datos en cualquier
          momento en formato CSV o PDF. También puedes solicitar la eliminación completa de tus datos contactándonos
          directamente. Para más detalles, consulta nuestra{' '}
          <Link to="/privacidad" className="text-emerald-500 hover:underline">Política de Privacidad</Link>.
        </p>

        {/* 8 */}
        <h2 id="limitacion-responsabilidad" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          8. Limitación de responsabilidad
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow es una herramienta de análisis de datos comerciales. Las alertas, insights y recomendaciones
          generadas por la plataforma y su asistente de IA son orientativas y no constituyen asesoría financiera,
          comercial ni legal. La toma de decisiones basada en la información proporcionada es responsabilidad
          exclusiva del usuario. Data Solutions Hub no será responsable por decisiones comerciales tomadas a
          partir de los análisis de la plataforma.
        </p>

        {/* 9 */}
        <h2 id="modificaciones" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          9. Modificaciones a los términos
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Nos reservamos el derecho de modificar estos términos en cualquier momento. En caso de cambios sustanciales,
          te notificaremos por email con al menos 30 días de anticipación. El uso continuado del servicio después de
          la fecha de vigencia de los cambios constituye tu aceptación de los nuevos términos.
        </p>

        {/* 10 */}
        <h2 id="ley-aplicable" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          10. Ley aplicable
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          {/* TODO: Definir jurisdicción legal */}
          Estos términos se regirán e interpretarán de acuerdo con las leyes de [País/jurisdicción a definir].
          Cualquier disputa derivada de estos términos será sometida a la jurisdicción exclusiva de los tribunales
          competentes de dicha jurisdicción.
        </p>

        {/* 11 */}
        <h2 id="contacto" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          11. Contacto
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Si tienes preguntas sobre estos términos, contáctanos en{' '}
          {/* TODO: Reemplazar con email real */}
          <a href="mailto:soporte@salesflow.com" className="text-emerald-500 hover:underline">
            soporte@salesflow.com
          </a>.
        </p>
      </div>
    </PublicLayout>
  )
}
