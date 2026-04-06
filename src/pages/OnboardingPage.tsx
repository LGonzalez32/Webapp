import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Zap, Loader2, Building2, Link as LinkIcon, CheckCircle2, ShieldCheck, Eye } from 'lucide-react'
import { useAppStore } from '../store/appStore'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import { createOrg, getUserOrg, getOrgPublicInfo } from '../lib/orgService'
import { GIRO_OPTIONS } from '../lib/giroOptions'
import { supabase } from '../lib/supabaseClient'
import type { ReactNode } from 'react'
import type { OrgRole } from '../types'

type Tab = 'create' | 'join'

const ROLE_META: Record<OrgRole, { label: string; description: string; icon: ReactNode }> = {
  owner: {
    label: 'Propietario',
    description: 'Puedes cargar datos, gestionar miembros y configurar la organización.',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  admin: {
    label: 'Admin',
    description: 'Puedes gestionar miembros, cargar datos y configurar la organización.',
    icon: <ShieldCheck className="w-4 h-4" />,
  },
  editor: {
    label: 'Editor',
    description: 'Puedes cargar datos y ver todos los análisis de la organización.',
    icon: <Building2 className="w-4 h-4" />,
  },
  viewer: {
    label: 'Visor',
    description: 'Puedes ver los análisis. El administrador puede darte acceso de edición.',
    icon: <Eye className="w-4 h-4" />,
  },
}

const CURRENCIES = [
  { code: 'USD', name: 'Dólar Estadounidense' },
  { code: 'MXN', name: 'Peso Mexicano' },
  { code: 'GTQ', name: 'Quetzal Guatemalteco' },
  { code: 'HNL', name: 'Lempira Hondureña' },
  { code: 'CRC', name: 'Colón Costarricense' },
  { code: 'COP', name: 'Peso Colombiano' },
  { code: 'PEN', name: 'Sol Peruano' },
  { code: 'ARS', name: 'Peso Argentino' },
  { code: 'BRL', name: 'Real Brasileño' },
]

export default function OnboardingPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const { setOrg, setCurrentRole } = useOrgStore()
  const setConfiguracion = useAppStore((s) => s.setConfiguracion)

  const [tab, setTab] = useState<Tab>('create')
  const [orgName, setOrgName] = useState('')
  const [moneda, setMoneda] = useState('MXN')
  const [giro, setGiro] = useState('')
  const [giroCustom, setGiroCustom] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Pantalla de bienvenida intermedia
  const [welcome, setWelcome] = useState<{ orgName: string; role: OrgRole } | null>(null)

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
    setConfiguracion({
      empresa: orgName.trim(),
      moneda,
      giro,
      giro_custom: giro === 'Otro' ? giroCustom : '',
    })
    setWelcome({ orgName: org.name, role: 'owner' })
    setLoading(false)
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

    const orgInfo = await getOrgPublicInfo(orgId)
    if (!orgInfo) {
      setError('Link inválido. No se encontró la organización.')
      setLoading(false)
      return
    }
    if (!orgInfo.allow_open_join) {
      setError('Esta organización no acepta nuevas incorporaciones. Contacta al administrador.')
      setLoading(false)
      return
    }

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
      setWelcome({ orgName: org.name, role: role ?? 'viewer' })
      setLoading(false)
    } else {
      setError('No se pudo cargar la organización. Intenta de nuevo.')
      setLoading(false)
    }
  }

  // ── Pantalla de bienvenida ─────────────────────────────────────────────────
  if (welcome) {
    const meta = ROLE_META[welcome.role]
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center px-4">
        <div className="w-full max-w-[440px]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-8 flex flex-col items-center text-center gap-6">

            {/* Ícono de éxito */}
            <div className="w-16 h-16 rounded-2xl bg-[#00B894]/10 border border-[#00B894]/20 flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8 text-[#00B894]" />
            </div>

            {/* Título */}
            <div>
              <h2 className="text-xl font-black text-zinc-100 mb-1">¡Bienvenido a SalesFlow!</h2>
              <p className="text-sm text-zinc-400">Ya eres parte de</p>
              <p className="text-base font-bold text-zinc-100 mt-0.5">{welcome.orgName}</p>
            </div>

            {/* Badge de rol */}
            <div className="w-full bg-zinc-800/60 border border-zinc-700/50 rounded-xl px-4 py-3 flex items-start gap-3 text-left">
              <div className="mt-0.5 text-[#00B894]">{meta.icon}</div>
              <div>
                <p className="text-xs font-semibold text-[#00B894] uppercase tracking-wide mb-0.5">
                  {meta.label}
                </p>
                <p className="text-sm text-zinc-400 leading-snug">{meta.description}</p>
              </div>
            </div>

            {/* CTA */}
            <button
              onClick={() => navigate('/cargar', { replace: true })}
              className="w-full bg-[#00B894] hover:bg-[#00a884] text-black font-bold py-2.5 rounded-xl text-sm transition-colors"
            >
              Comenzar
            </button>
          </div>
        </div>
      </div>
    )
  }

  // ── Formulario ─────────────────────────────────────────────────────────────
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
                  placeholder="Mi Empresa S.A."
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Moneda
                </label>
                <select
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00B894] transition-colors"
                >
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>{c.code} — {c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1.5">
                  Giro del negocio
                </label>
                <select
                  value={giro}
                  onChange={(e) => { setGiro(e.target.value); if (e.target.value !== 'Otro') setGiroCustom('') }}
                  className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 focus:outline-none focus:border-[#00B894] transition-colors"
                >
                  <option value="">Selecciona tu giro…</option>
                  {GIRO_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
                {giro === 'Otro' && (
                  <input
                    type="text"
                    value={giroCustom}
                    onChange={(e) => setGiroCustom(e.target.value)}
                    placeholder="Describe tu giro de negocio"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-[#00B894] transition-colors mt-2"
                  />
                )}
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
