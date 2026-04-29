import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { Zap, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { getUserOrg } from '../lib/orgService'
import { supabase } from '../lib/supabaseClient'

export default function InvitationPage() {
  const { orgId } = useParams<{ orgId: string }>()
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const loadingAuth = useAuthStore((s) => s.loading)
  const { setOrg, setCurrentRole } = useOrgStore()

  const [orgName, setOrgName] = useState<string | null>(null)
  const [fetching, setFetching] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  useEffect(() => {
    if (!orgId) return
    // [S3] RPC SECURITY DEFINER reemplaza el SELECT directo. Retorna solo
    // {id, name} y no requiere política RLS abierta sobre organizations.
    supabase
      .rpc('get_org_public_info', { p_org_id: orgId })
      .single<{ id: string; name: string }>()
      .then(({ data }) => {
        setOrgName(data?.name ?? null)
        setFetching(false)
      })
  }, [orgId])

  const handleJoin = async () => {
    if (!orgId) return

    if (!user) {
      navigate(`/login?join=${orgId}`)
      return
    }

    setJoining(true)
    setError(null)

    const { error: insertError } = await supabase
      .from('organization_members')
      .insert({ org_id: orgId, user_id: user.id, role: 'viewer' })

    // Ignore duplicate / already-member errors
    if (insertError && !insertError.message.toLowerCase().includes('duplicate') && !insertError.code?.includes('23505')) {
      setError('No se pudo unir a la organización. Intenta de nuevo.')
      setJoining(false)
      return
    }

    const { org, role } = await getUserOrg(user.id)
    if (org) {
      setOrg(org)
      setCurrentRole(role)
    }

    setDone(true)
    setTimeout(() => navigate('/dashboard', { replace: true }), 1500)
  }

  if (loadingAuth || fetching) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#00B894]" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-[420px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#00B894] rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-black text-[#00B894] tracking-tight">SalesFlow</h1>
        </div>

        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 text-center">
          {/* Org no encontrada */}
          {orgName === null && (
            <>
              <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
              <h2 className="text-lg font-bold text-zinc-100 mb-2">Link inválido</h2>
              <p className="text-sm text-zinc-500">
                Esta organización no existe o el link es incorrecto.
              </p>
              <button
                onClick={() => navigate('/login')}
                className="mt-6 px-6 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-semibold transition-colors"
              >
                Ir al inicio
              </button>
            </>
          )}

          {/* Unido con éxito */}
          {done && (
            <>
              <CheckCircle className="w-12 h-12 text-[#00B894] mx-auto mb-4" />
              <h2 className="text-lg font-bold text-zinc-100 mb-2">¡Bienvenido!</h2>
              <p className="text-sm text-zinc-500">Redirigiendo al dashboard…</p>
            </>
          )}

          {/* Pendiente de aceptar */}
          {orgName !== null && !done && (
            <>
              <h2 className="text-lg font-bold text-zinc-100 mb-2">Te invitaron a unirte a</h2>
              <p className="text-xl font-bold text-[#00B894] mb-6">{orgName}</p>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2 mb-4">
                  {error}
                </p>
              )}

              <button
                onClick={handleJoin}
                disabled={joining}
                className="w-full bg-[#00B894] hover:bg-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {joining && <Loader2 className="w-4 h-4 animate-spin" />}
                {user ? 'Unirme' : 'Iniciar sesión para unirme'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
