import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { getUserOrg, loadOrgData } from './orgService'

export function useAutoLoad() {
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)
  const { isProcessed, setSales, setMetas, setInventory, setIsLoading, setLoadingMessage } =
    useAppStore()
  const { setOrg, setCurrentRole } = useOrgStore()
  const navigate = useNavigate()
  const location = useLocation()
  const ranRef = useRef(false)

  useEffect(() => {
    // AuthCallbackPage maneja su propio redirect — no interferir
    if (location.pathname === '/auth/callback') return
    if (loadingAuth || !user || isProcessed || ranRef.current) return
    ranRef.current = true

    const run = async () => {
      setIsLoading(true)
      setLoadingMessage('Cargando tu organización...')

      try {
        const { org, role } = await getUserOrg(user.id)

        if (!org) {
          navigate('/onboarding', { replace: true })
          return
        }

        setOrg(org)
        setCurrentRole(role)
        setLoadingMessage('Cargando datos...')

        const { sales, metas, inventory } = await loadOrgData(org.id)

        if (!sales || sales.length === 0) {
          navigate('/cargar', { replace: true })
          return
        }

        setSales(sales)
        if (metas && metas.length > 0) setMetas(metas)
        if (inventory && inventory.length > 0) setInventory(inventory)
        // useAnalysis se dispara automáticamente cuando sales cambia
      } catch (err) {
        console.warn('Error en autoload:', err)
        navigate('/cargar', { replace: true })
      } finally {
        setIsLoading(false)
        setLoadingMessage('')
      }
    }

    run()
  }, [user, loadingAuth, isProcessed, location.pathname]) // eslint-disable-line
}
