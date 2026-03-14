import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import { RequireAuth } from './components/auth/RequireAuth'
import UploadPage from './pages/UploadPage'
import ConfiguracionPage from './pages/ConfiguracionPage'
import EstadoComercialPage from './pages/EstadoComercialPage'
import VendedoresPage from './pages/VendedoresPage'
import RendimientoPage from './pages/RendimientoPage'
import RotacionPage from './pages/RotacionPage'
import ClientesPage from './pages/ClientesPage'
import MetasPage from './pages/MetasPage'
import ChatPage from './pages/ChatPage'
import OrganizacionPage from './pages/OrganizacionPage'
import NotFoundPage from './pages/NotFoundPage'
import AuthPage from './pages/AuthPage'
import AuthCallbackPage from './pages/AuthCallbackPage'
import OnboardingPage from './pages/OnboardingPage'
import InvitationPage from './pages/InvitationPage'
import { useAppStore } from './store/appStore'
import { useAuth } from './lib/useAuth'

export default function App() {
  useAuth()
  const { isProcessed } = useAppStore()

  return (
    <BrowserRouter>
      <Routes>
        {/* Rutas públicas */}
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
            path="/"
            element={isProcessed ? <Navigate to="/dashboard" replace /> : <Navigate to="/cargar" replace />}
          />
          <Route path="/cargar" element={<UploadPage />} />
          <Route path="/dashboard" element={<EstadoComercialPage />} />
          <Route path="/vendedores" element={<VendedoresPage />} />
          <Route path="/rendimiento" element={<RendimientoPage />} />
          <Route path="/rotacion" element={<RotacionPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/metas" element={<MetasPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/organizacion" element={<OrganizacionPage />} />
          <Route path="/configuracion" element={<ConfiguracionPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
