import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { getUserOrg } from './orgService'

// QW6 — supabase.auth.onAuthStateChange fires on every token refresh and on
// every mount of useAuth. Without this guard, each fire issues an UPDATE on
// profiles even when the email did not change, producing the 14+ duplicate
// /profiles writes observed in the network panel.
const lastSyncedEmail = new Map<string, string>()

function hydrateOrg(userId: string, email?: string) {
  getUserOrg(userId).then(result => {
    if (result.org) {
      const s = useOrgStore.getState()
      s.setOrg(result.org)
      s.setCurrentRole(result.role)
      s.setAllowedPages(result.allowedPages)
    }
  }).catch(() => {})

  // Sync email to profiles for member display — only when it actually changed.
  if (email && lastSyncedEmail.get(userId) !== email) {
    lastSyncedEmail.set(userId, email)
    supabase.from('profiles').update({ email }).eq('id', userId).then(() => {})
  }
}

export function useAuth() {
  const { setUser, setSession, setLoading } = useAuthStore()

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        setLoading(false)
        if (session?.user) hydrateOrg(session.user.id, session.user.email)
      })
      .catch(() => setLoading(false))

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
      if (session?.user) {
        hydrateOrg(session.user.id, session.user.email)
      } else {
        useOrgStore.getState().reset()
      }
    })

    return () => subscription.unsubscribe()
  }, []) // eslint-disable-line

  return useAuthStore()
}
