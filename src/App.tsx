import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { HelmetProvider } from 'react-helmet-async'
import AppLayout from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import { useAppStore, useStoreHydrated } from './store/appStore'
import { useAuth } from './lib/useAuth'

const UploadPage = lazy(() => import('./pages/UploadPage'))
const ConfiguracionPage = lazy(() => import('./pages/ConfiguracionPage'))
const EstadoComercialPage = lazy(() => import('./pages/EstadoComercialPage'))
const VendedoresPage = lazy(() => import('./pages/VendedoresPage'))
const RendimientoPage = lazy(() => import('./pages/RendimientoPage'))
const RotacionPage = lazy(() => import('./pages/RotacionPage'))
const ClientesPage = lazy(() => import('./pages/ClientesPage'))
const MetasPage = lazy(() => import('./pages/MetasPage'))
const ChatPage = lazy(() => import('./pages/ChatPage'))
const DepartamentosPage = lazy(() => import('./pages/DepartamentosPage'))
const OrganizacionPage = lazy(() => import('./pages/OrganizacionPage'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'))
const AuthPage = lazy(() => import('./pages/AuthPage'))
const AuthCallbackPage = lazy(() => import('./pages/AuthCallbackPage'))
const OnboardingPage = lazy(() => import('./pages/OnboardingPage'))
const InvitationPage = lazy(() => import('./pages/InvitationPage'))
const DemoPage = lazy(() => import('./pages/DemoPage'))
const LandingPage = lazy(() => import('./pages/LandingPage'))
const PricingPage = lazy(() => import('./pages/PricingPage'))
const TermsPage = lazy(() => import('./pages/TermsPage'))
const PrivacyPage = lazy(() => import('./pages/PrivacyPage'))
const AboutPage = lazy(() => import('./pages/AboutPage'))

function LoadingFallback() {
  return (
    <div className="flex items-center justify-center h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
    </div>
  )
}

export default function App() {
  useAuth()
  const { isProcessed, dataSource } = useAppStore()
  const hydrated = useStoreHydrated()

  // No tomar decisiones de routing hasta que Zustand rehidrate localStorage
  if (!hydrated) {
    return <LoadingFallback />
  }

  return (
    <HelmetProvider>
    <BrowserRouter>
      <Suspense fallback={<LoadingFallback />}>
        <Routes>
          {/* Rutas públicas — marketing */}
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/terminos" element={<TermsPage />} />
          <Route path="/privacidad" element={<PrivacyPage />} />
          <Route path="/nosotros" element={<AboutPage />} />

          {/* Demo — público, sin auth */}
          <Route element={<DemoPage />}>
            <Route path="/demo" element={<Navigate to="/demo/dashboard" replace />} />
            <Route path="/demo/dashboard" element={<EstadoComercialPage />} />
            <Route path="/demo/vendedores" element={<VendedoresPage />} />
            <Route path="/demo/rendimiento" element={<RendimientoPage />} />
            <Route path="/demo/clientes" element={<ClientesPage />} />
            <Route path="/demo/metas" element={<MetasPage />} />
            <Route path="/demo/departamentos" element={<DepartamentosPage />} />
            <Route path="/demo/rotacion" element={<RotacionPage />} />
            <Route path="/demo/chat" element={<ChatPage />} />
            <Route path="/demo/configuracion" element={<ConfiguracionPage />} />
          </Route>

          {/* Rutas públicas — auth */}
          <Route path="/login" element={<AuthPage />} />
          <Route path="/auth/callback" element={<AuthCallbackPage />} />
          <Route path="/join/:orgId" element={<InvitationPage />} />

          {/* Onboarding — protegido pero sin AppLayout */}
          <Route path="/onboarding" element={<RequireAuth><OnboardingPage /></RequireAuth>} />

          {/* Rutas protegidas con AppLayout */}
          <Route
            element={
              <RequireAuth>
                <AppLayout />
              </RequireAuth>
            }
          >
            <Route
              path="/app"
              element={(isProcessed || dataSource !== 'none') ? <Navigate to="/dashboard" replace /> : <Navigate to="/cargar" replace />}
            />
            <Route path="/cargar" element={<UploadPage />} />
            <Route path="/dashboard" element={<EstadoComercialPage />} />
            <Route path="/vendedores" element={<VendedoresPage />} />
            <Route path="/rendimiento" element={<RendimientoPage />} />
            <Route path="/rotacion" element={<RotacionPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/metas" element={<MetasPage />} />
            <Route path="/departamentos" element={<DepartamentosPage />} />
            <Route path="/chat" element={<ChatPage />} />
            <Route path="/organizacion" element={<OrganizacionPage />} />
            <Route path="/configuracion" element={<ConfiguracionPage />} />
          </Route>

          {/* Alias: /register, /registro → /login con modo registro */}
          <Route path="/register" element={<Navigate to="/login?mode=register" replace />} />
          <Route path="/registro" element={<Navigate to="/login?mode=register" replace />} />

          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
    </HelmetProvider>
  )
}
