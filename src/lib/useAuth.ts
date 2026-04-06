import { useEffect } from 'react'
import { supabase } from './supabaseClient'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { getUserOrg } from './orgService'

function hydrateOrg(userId: string, email?: string) {
  getUserOrg(userId).then(result => {
    if (result.org) {
      const s = useOrgStore.getState()
      s.setOrg(result.org)
      s.setCurrentRole(result.role)
      s.setAllowedPages(result.allowedPages)
    }
  }).catch(() => {})

  // Sync email to profiles for member display
  if (email) {
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
