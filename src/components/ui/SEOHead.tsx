import { Helmet } from 'react-helmet-async'

interface SEOHeadProps {
  title?: string
  description?: string
  url?: string
  image?: string
  noindex?: boolean
}

const DEFAULTS = {
  title: 'SalesFlow — Inteligencia Comercial para Equipos de Ventas',
  description: 'Detecta riesgos en tu equipo de ventas automáticamente. SalesFlow analiza tus datos y te dice qué vendedores están fallando, qué clientes se pierden y qué hacer. 22 patrones de riesgo + IA.',
  url: 'https://www.data-solutions-hub.com',
  image: '/og-image.png',
}

export default function SEOHead({ title, description, url, image, noindex }: SEOHeadProps) {
  const t = title ?? DEFAULTS.title
  const d = description ?? DEFAULTS.description
  const u = url ?? DEFAULTS.url
  const img = image ?? DEFAULTS.image

  return (
    <Helmet>
      <title>{t}</title>
      <meta name="description" content={d} />
      {noindex && <meta name="robots" content="noindex,nofollow" />}

      {/* Open Graph */}
      <meta property="og:type" content="website" />
      <meta property="og:title" content={t} />
      <meta property="og:description" content={d} />
      <meta property="og:url" content={u} />
      <meta property="og:image" content={img} />
      <meta property="og:site_name" content="SalesFlow" />

      {/* Twitter Card */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={t} />
      <meta name="twitter:description" content={d} />
      <meta name="twitter:image" content={img} />
    </Helmet>
  )
}
