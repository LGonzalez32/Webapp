import { useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '../store/authStore'
import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { getUserOrg, loadOrgData } from './orgService'
import { getDemoData, DEMO_EMPRESA } from './demoData'
import { loadDatasets } from './dataCache'
import { useAlertStatusStore } from '../store/alertStatusStore'
import type { SaleRecord, MetaRecord, InventoryItem } from '../types'

export function useAutoLoad() {
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)
  const {
    isProcessed, sales, dataSource,
    setSales, setMetas, setInventory,
    setIsLoading, setLoadingMessage, setConfiguracion,
  } = useAppStore()
  const { setOrg, setCurrentRole } = useOrgStore()
  const navigate = useNavigate()
  const location = useLocation()
  const ranRef = useRef(false)
  const localRestoreRef = useRef(false)

  // Resetear el guard cuando el análisis se invalida
  useEffect(() => {
    if (!isProcessed) {
      ranRef.current = false
    }
  }, [isProcessed])

  // ── Restauración local (sin auth): demo → getDemoData(), real → IndexedDB ──
  useEffect(() => {
    if (localRestoreRef.current || isProcessed || sales.length > 0) return
    if (dataSource === 'none') return
    localRestoreRef.current = true

    const restore = async () => {
      setIsLoading(true)

      if (dataSource === 'demo') {
        setLoadingMessage('Restaurando datos demo...')
        const { sales, metas, inventory } = getDemoData()
        setSales(sales)
        setMetas(metas)
        setInventory(inventory)
        setConfiguracion({ empresa: DEMO_EMPRESA })
      } else if (dataSource === 'real') {
        setLoadingMessage('Restaurando datos guardados...')
        try {
          const cached = await loadDatasets()
          const cachedSales = cached.sales as SaleRecord[] | undefined
          if (cachedSales && cachedSales.length > 0) {
            setSales(cachedSales)
            if (cached.metas) setMetas(cached.metas as MetaRecord[])
            if (cached.inventory) setInventory(cached.inventory as InventoryItem[])
          }
        } catch {
          // IndexedDB not available — user will need to re-upload
        }
      }

      setIsLoading(false)
      setLoadingMessage('')
    }

    restore()
  }, [dataSource, isProcessed, sales.length]) // eslint-disable-line

  // ── Carga desde Supabase (con auth) ────────────────────────────────────────
  useEffect(() => {
    // AuthCallbackPage maneja su propio redirect — no interferir
    if (location.pathname === '/auth/callback') return
    if (loadingAuth || !user || isProcessed || ranRef.current) return
    // Si hay datos locales (demo o real), no interferir con carga Supabase
    if (dataSource === 'demo' || dataSource === 'real') return
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
        useAlertStatusStore.getState().loadAlertStatuses(org.id).catch(() => {})
        // useAnalysis se dispara automáticamente cuando sales cambia
      } catch (err) {
        navigate('/cargar', { replace: true })
      } finally {
        setIsLoading(false)
        setLoadingMessage('')
      }
    }

    run()
  }, [user, loadingAuth, isProcessed, location.pathname, dataSource]) // eslint-disable-line
}
