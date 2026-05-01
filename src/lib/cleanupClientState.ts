import { useOrgStore } from '../store/orgStore'
import { clearDatasets } from './dataCache'

// localStorage keys that contain user/org-specific data and must be wiped on logout.
// Keys intentionally NOT in this list are device-level UI preferences that survive
// across sessions (sidebar collapse state, onboarding done, pivot dimension config, etc.).
const USER_LS_KEYS = [
  'salesflow-storage',      // Zustand appStore persist: configuracion.empresa, orgId, etc.
  'salesflow-alert-status', // Zustand alertStatusStore persist: alert states per org
  'sf_chat_messages',       // Chat history — contains commercial PII from previous session
  'sf_chat_usage',          // Per-user chat usage counter
] as const

/**
 * Clears all user/org-specific client state on logout.
 *
 * ORDER MATTERS: localStorage keys are removed BEFORE calling any Zustand
 * setter. If you call store.reset() first, Zustand's persist middleware
 * intercepts the set() and immediately re-writes the default state back
 * to localStorage under the same key, "resurrecting" it. Removing the key
 * first prevents that write from being visible to the next session.
 *
 * Call this BEFORE supabase.auth.signOut().
 */
export async function cleanupClientState(): Promise<void> {
  // Step 1: wipe all user-specific localStorage entries first
  for (const key of USER_LS_KEYS) {
    try { localStorage.removeItem(key) } catch { /* storage access denied */ }
  }

  // Step 2: clear IndexedDB datasets (sales, metas, inventory object stores)
  await clearDatasets().catch(() => {})

  // Step 3: reset non-persisted in-memory stores only.
  // appStore and alertStatusStore have persist middleware — calling their
  // reset() here would re-write defaults to the keys we just removed.
  // Their in-memory state becomes irrelevant once we navigate to /login.
  useOrgStore.getState().reset()
}
