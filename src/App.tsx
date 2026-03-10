import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import AppLayout from './components/layout/AppLayout'
import UploadPage from './pages/UploadPage'
import ConfiguracionPage from './pages/ConfiguracionPage'
import EstadoComercialPage from './pages/EstadoComercialPage'
import VendedoresPage from './pages/VendedoresPage'
import RendimientoPage from './pages/RendimientoPage'
import RotacionPage from './pages/RotacionPage'
import ClientesPage from './pages/ClientesPage'
import MetasPage from './pages/MetasPage'
import ChatPage from './pages/ChatPage'
import NotFoundPage from './pages/NotFoundPage'
import { useAppStore } from './store/appStore'

export default function App() {
  const { isProcessed } = useAppStore()

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<AppLayout />}>
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
          <Route path="/configuracion" element={<ConfiguracionPage />} />
        </Route>
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </BrowserRouter>
  )
}
