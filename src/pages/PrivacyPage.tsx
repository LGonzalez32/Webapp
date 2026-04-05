import { Link } from 'react-router-dom'
import PublicLayout from '../components/layout/PublicLayout'
import SEOHead from '../components/ui/SEOHead'

export default function PrivacyPage() {
  return (
    <PublicLayout>
      <SEOHead
        title="Política de Privacidad — SalesFlow"
        description="Cómo SalesFlow recopila, usa y protege tus datos."
        noindex
      />
      <div className="max-w-3xl mx-auto px-4 py-12">
        <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--sf-t1)' }}>
          Política de Privacidad
        </h1>
        <p className="text-sm mb-8" style={{ color: 'var(--sf-t5)' }}>
          Última actualización: abril 2026
        </p>

        {/* 1 */}
        <h2 id="datos-recopilados" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          1. Qué datos recopilamos
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow recopila los siguientes datos:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li><strong>Datos de cuenta:</strong> email, nombre (opcional) y método de autenticación.</li>
          <li><strong>Datos de uso:</strong> interacciones con la plataforma, páginas visitadas y funcionalidades utilizadas.</li>
          <li><strong>Archivos de ventas:</strong> los archivos CSV o Excel que subes para análisis, incluyendo datos de vendedores, clientes, productos, montos y fechas.</li>
        </ul>

        {/* 2 */}
        <h2 id="uso-datos" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          2. Cómo usamos los datos
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Utilizamos tus datos exclusivamente para:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li>Proporcionar el servicio de análisis de ventas, detección de patrones de riesgo y asistente de Chat IA.</li>
          <li>Mejorar la plataforma y la calidad de los análisis.</li>
          <li>Comunicaciones relacionadas con tu cuenta (confirmación, seguridad, cambios en el servicio).</li>
        </ul>

        {/* 3 */}
        <h2 id="archivos-ventas" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          3. Archivos de ventas
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Los archivos de ventas que subes a SalesFlow:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li>Se procesan únicamente para generar tu análisis comercial personalizado.</li>
          <li><strong>No se comparten con terceros</strong> bajo ninguna circunstancia.</li>
          <li><strong>No se utilizan para entrenar modelos de inteligencia artificial.</strong></li>
          <li>Puedes eliminarlos en cualquier momento desde la configuración de tu cuenta.</li>
        </ul>

        {/* 4 */}
        <h2 id="cookies" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          4. Cookies
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow utiliza únicamente cookies esenciales necesarias para la autenticación y el mantenimiento de tu
          sesión. No utilizamos cookies de seguimiento, publicidad ni analítica de terceros.
        </p>

        {/* 5 */}
        <h2 id="servicios-terceros" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          5. Servicios de terceros
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Utilizamos proveedores de infraestructura confiables para autenticación, almacenamiento de datos y
          hosting del servicio. Estos proveedores procesan datos únicamente según nuestras instrucciones y están
          sujetos a acuerdos de confidencialidad y protección de datos.
        </p>

        {/* 6 */}
        <h2 id="seguridad" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          6. Seguridad
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Implementamos medidas de seguridad para proteger tus datos:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li>Todas las comunicaciones están encriptadas mediante HTTPS/TLS.</li>
          <li>El acceso a los datos está limitado y controlado.</li>
          <li>Las contraseñas se almacenan con hash seguro (nunca en texto plano).</li>
          <li>Revisamos periódicamente nuestras prácticas de seguridad.</li>
        </ul>

        {/* 7 */}
        <h2 id="retencion" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          7. Retención de datos
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Tus datos se mantienen mientras tu cuenta esté activa. Al cancelar tu cuenta, todos tus datos se eliminarán
          en un plazo máximo de 30 días. Puedes solicitar la eliminación anticipada de tus datos en cualquier momento
          contactándonos directamente.
        </p>

        {/* 8 */}
        <h2 id="derechos-usuario" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          8. Derechos del usuario
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Como usuario de SalesFlow, tienes derecho a:
        </p>
        <ul className="list-disc ml-6 space-y-1 mb-4" style={{ color: 'var(--sf-t3)' }}>
          <li><strong>Acceso:</strong> solicitar una copia de todos tus datos almacenados.</li>
          <li><strong>Rectificación:</strong> corregir datos incorrectos o desactualizados.</li>
          <li><strong>Eliminación:</strong> solicitar la eliminación completa de tu cuenta y datos.</li>
          <li><strong>Portabilidad:</strong> exportar tus datos en formato CSV o PDF en cualquier momento.</li>
        </ul>

        {/* 9 */}
        <h2 id="menores" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          9. Menores de edad
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          SalesFlow no está dirigido a menores de 18 años. No recopilamos conscientemente datos de menores de edad.
          Si descubrimos que hemos recopilado datos de un menor, los eliminaremos de inmediato.
        </p>

        {/* 10 */}
        <h2 id="cambios-politica" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          10. Cambios a esta política
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Nos reservamos el derecho de actualizar esta política de privacidad. En caso de cambios sustanciales,
          te notificaremos por email con al menos 30 días de anticipación. La fecha de última actualización siempre
          estará visible al inicio de este documento.
        </p>

        {/* 11 */}
        <h2 id="contacto" className="text-2xl font-semibold mt-10 mb-4" style={{ color: 'var(--sf-t1)' }}>
          11. Contacto
        </h2>
        <p className="mb-4 leading-relaxed" style={{ color: 'var(--sf-t3)' }}>
          Para consultas sobre privacidad o ejercer tus derechos, contáctanos en{' '}
          {/* TODO: Reemplazar con email real */}
          <a href="mailto:privacidad@salesflow.com" className="text-emerald-500 hover:underline">
            privacidad@salesflow.com
          </a>.
          También puedes revisar nuestros{' '}
          <Link to="/terminos" className="text-emerald-500 hover:underline">Términos de Servicio</Link>.
        </p>
      </div>
    </PublicLayout>
  )
}
