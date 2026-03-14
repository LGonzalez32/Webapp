import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Loader2, Building2, Link as LinkIcon } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { createOrg, getUserOrg } from '../lib/orgService'
import { supabase } from '../lib/supabaseClient'

type Tab = 'create' | 'join'

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { setOrg, setCurrentRole } = useOrgStore()

  const [tab, setTab] = useState<Tab>('create')

  // Crear org
  const [orgName, setOrgName] = useState('')

  // Unirse con token
  const [inviteInput, setInviteInput] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const extractOrgId = (input: string): string => {
    const trimmed = input.trim()
    if (trimmed.includes('/join/')) {
      return trimmed.split('/join/').pop() ?? trimmed
    }
    return trimmed
  }

  const handleCreate = async () => {
    if (!orgName.trim()) {
      setError('Ingresa el nombre de tu empresa.')
      return
    }
    if (!user) return

    setLoading(true)
    setError(null)

    const { org, error: createError } = await createOrg(orgName.trim(), user.id)

    if (createError || !org) {
      setError(createError ?? 'Error al crear la organización.')
      setLoading(false)
      return
    }

    setOrg(org)
    setCurrentRole('owner')
    navigate('/cargar', { replace: true })
  }

  const handleJoin = async () => {
    if (!inviteInput.trim()) {
      setError('Ingresa el link o UUID de la organización.')
      return
    }
    if (!user) return

    setLoading(true)
    setError(null)

    const orgId = extractOrgId(inviteInput)
    const { error: insertError } = await supabase
      .from('organization_members')
      .insert({ org_id: orgId, user_id: user.id, role: 'viewer' })

    if (insertError && !insertError.message.includes('duplicate') && insertError.code !== '23505') {
      setError('Link inválido o ya eres miembro.')
      setLoading(false)
      return
    }

    const { org, role } = await getUserOrg(user.id)
    if (org) {
      setOrg(org)
      setCurrentRole(role)
      navigate('/cargar', { replace: true })
    } else {
      setError('No se pudo cargar la organización. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
      <div className="w-full max-w-[440px]">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="w-12 h-12 bg-[#00B894] rounded-xl flex items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-black" />
          </div>
          <h1 className="text-2xl font-black text-[#00B894] tracking-tight">SalesFlow</h1>
          <p className="text-sm text-zinc-500 mt-1">Bienvenido</p>
        </div>

        {/* Card */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
          <h2 className="text-lg font-bold text-zinc-100 mb-1">Configura tu empresa</h2>
          <p className="text-sm text-zinc-500 mb-6">Crea tu empresa o únete a una existente.</p>

          {/* Tabs */}
          <div className="flex gap-1 bg-zinc-800 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setTab('create'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === 'create'
                  ? 'bg-zinc-900 text-zinc-100 shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <Building2 className="w-4 h-4" />
              Crear empresa
            </button>
            <button
              onClick={() => { setTab('join'); setError(null) }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-all ${
                tab === 'join'
                  ? 'bg-zinc-900 text-zinc-100 shadow'
                  : 'text-zinc-500 hover:text-zinc-300'
              }`}
            >
              <LinkIcon className="w-4 h-4" />
              Tengo invitación
            </button>
          </div>

          {tab === 'create' ? (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Nombre de la empresa
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
                  placeholder="Distribuidora Ejemplo S.A."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleCreate}
                disabled={loading}
                className="w-full bg-[#00B894] hover:bg-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear organización
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Link o código de invitación
                </label>
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleJoin()}
                  placeholder="https://…/join/xxxxxxxx  o  UUID directo"
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
                />
              </div>

              {error && (
                <p className="text-sm text-red-400 bg-red-950/40 border border-red-900/60 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={handleJoin}
                disabled={loading}
                className="w-full bg-[#00B894] hover:bg-[#00a884] disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold py-2.5 rounded-xl text-sm transition-colors flex items-center justify-center gap-2"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                Unirme a la organización
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
