import { useAppStore } from '../store/appStore'
import { useOrgStore } from '../store/orgStore'
import { useAlertStatusStore } from '../store/alertStatusStore'
import { clearDatasets } from './dataCache'

/**
 * Clears all client-side state on logout:
 * - Zustand in-memory stores (appStore, orgStore, alertStatusStore)
 * - IndexedDB datasets (sales, metas, inventory)
 *
 * Call this BEFORE supabase.auth.signOut() so any in-flight Supabase
 * queries still have a valid session when they complete.
 */
export async function cleanupClientState(): Promise<void> {
  useAppStore.getState().resetAll()
  useOrgStore.getState().reset()
  useAlertStatusStore.getState().reset()
  await clearDatasets().catch(() => {})
}
