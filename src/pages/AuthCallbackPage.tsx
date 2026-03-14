import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'

export default function AuthCallbackPage() {
  const navigate = useNavigate()

  useEffect(() => {
    console.log('=== AUTH CALLBACK DEBUG ===')
    console.log('href:', window.location.href)
    console.log('search:', window.location.search)
    console.log('hash:', window.location.hash)
    console.log('pathname:', window.location.pathname)

    const handle = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        navigate('/login', { replace: true })
        return
      }

      const userId = session.user.id

      // 1. Procesar join pendiente desde query param (sobrevive OAuth redirect)
      const params = new URLSearchParams(window.location.search)
      const joinOrgId = params.get('join')
      if (joinOrgId) {
        await supabase
          .from('organization_members')
          .insert({ org_id: joinOrgId, user_id: userId, role: 'viewer' })
        // ignorar error de duplicado
        navigate('/dashboard', { replace: true })
        return
      }

      // 2. Verificar si ya tiene org
      const { data: membership } = await supabase
        .from('organization_members')
        .select('org_id')
        .eq('user_id', userId)
        .single()

      if (!membership) {
        navigate('/onboarding', { replace: true })
        return
      }

      // 3. Tiene org — useAutoLoad carga los datos
      navigate('/dashboard', { replace: true })
    }

    handle()
  }, []) // eslint-disable-line

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', background: '#09090b' }}>
      <p style={{ color: '#71717a', fontSize: '14px' }}>Iniciando sesión...</p>
    </div>
  )
}
