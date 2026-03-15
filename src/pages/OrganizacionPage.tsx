import { useState, useEffect } from 'react'
import { Users, Copy, Check, Trash2, ChevronDown } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import {
  getOrgMembersWithEmail,
  removeMember,
  updateMemberRole,
  updateOrgJoinPolicy,
} from '../lib/orgService'
import type { OrgRole } from '../types'

type MemberRow = {
  id: string
  user_id: string
  role: OrgRole
  email: string | null
  joined_at: string
}

const ROLE_LABELS: Record<OrgRole, string> = {
  owner: 'Propietario',
  editor: 'Editor',
  viewer: 'Solo lectura',
}

const ROLE_BADGE: Record<OrgRole, string> = {
  owner: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30',
  editor: 'bg-blue-500/20 text-blue-400 border border-blue-500/30',
  viewer: 'bg-zinc-500/20 text-zinc-400 border border-zinc-500/30',
}

export default function OrganizacionPage() {
  const user = useAuthStore(s => s.user)
  const { org, currentRole } = useOrgStore()
  const isOwner = useOrgStore(s => s.isOwner())

  const [members, setMembers] = useState<MemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [allowOpenJoin, setAllowOpenJoin] = useState<boolean>(org?.allow_open_join ?? true)
  const [joinPolicyUpdating, setJoinPolicyUpdating] = useState(false)

  // Confirm delete
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  useEffect(() => {
    if (!org) return
    loadData()
  }, [org])

  async function loadData() {
    if (!org) return
    setLoadingMembers(true)
    setMembersError(null)
    try {
      const m = await getOrgMembersWithEmail(org.id)
      setMembers(m)
    } catch {
      setMembersError('No se pudieron cargar los miembros.')
    } finally {
      setLoadingMembers(false)
    }
  }

  async function handleCopyLink(link: string) {
    await navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleToggleOpenJoin(value: boolean) {
    if (!org) return
    setAllowOpenJoin(value)
    setJoinPolicyUpdating(true)
    const { error } = await updateOrgJoinPolicy(org.id, value)
    if (error) setAllowOpenJoin(!value) // revert on error
    setJoinPolicyUpdating(false)
  }

  async function handleRoleChange(memberId: string, userId: string, newRole: 'editor' | 'viewer') {
    if (!org) return
    // Optimistic update
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    const { error } = await updateMemberRole(org.id, userId, newRole)
    if (error) {
      // Revert
      loadData()
    }
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (!org) return
    const { error } = await removeMember(org.id, userId)
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
      setConfirmDelete(null)
    }
  }

  function displayName(m: MemberRow) {
    if (m.email) return m.email
    return `Usuario ${m.user_id.slice(0, 8)}...`
  }

  function initial(m: MemberRow) {
    return (m.email?.[0] ?? m.user_id[0]).toUpperCase()
  }

  if (!org) {
    return (
      <div className="flex items-center justify-center h-64">
        <p style={{ color: 'var(--color-text-secondary)' }}>Cargando organización...</p>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--color-text-primary)' }}>
            {org.name}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ROLE_BADGE[currentRole ?? 'viewer']}`}>
              {ROLE_LABELS[currentRole ?? 'viewer']}
            </span>
            <span className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
              — tu rol en esta organización
            </span>
          </div>
        </div>
        <Users size={28} style={{ color: 'var(--color-text-secondary)' }} />
      </div>

      {/* Link de acceso (solo owner) */}
      {isOwner && (
        <div className="rounded-xl p-5 space-y-3" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
          <div>
            <h2 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
              Link de acceso
            </h2>
            <p className="text-xs mt-1" style={{ color: 'var(--color-text-secondary)' }}>
              Comparte este link. Cualquier persona puede usarlo para unirse como Solo lectura.
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg px-3 py-2" style={{ background: 'var(--color-bg)', border: '1px solid var(--color-border)' }}>
            <code className="flex-1 text-xs truncate" style={{ color: allowOpenJoin ? 'var(--color-text-secondary)' : 'var(--color-text-secondary)', opacity: allowOpenJoin ? 1 : 0.4 }}>
              {`${window.location.origin}/join/${org.id}`}
            </code>
            <button
              onClick={() => allowOpenJoin && handleCopyLink(`${window.location.origin}/join/${org.id}`)}
              disabled={!allowOpenJoin}
              className="flex items-center gap-1 px-2 py-1 rounded text-xs flex-shrink-0 transition-colors disabled:opacity-40"
              style={{ color: copied ? 'var(--color-primary)' : 'var(--color-text-secondary)' }}
            >
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--color-text-primary)' }}>
                Link abierto
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--color-text-secondary)' }}>
                {allowOpenJoin
                  ? 'Cualquier persona con el link puede unirse'
                  : 'El link está desactivado — nadie nuevo puede unirse'}
              </p>
            </div>
            <button
              onClick={() => handleToggleOpenJoin(!allowOpenJoin)}
              disabled={joinPolicyUpdating}
              className="relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 disabled:opacity-60"
              style={{ background: allowOpenJoin ? 'var(--color-primary)' : 'var(--color-border)' }}
              aria-label={allowOpenJoin ? 'Desactivar link abierto' : 'Activar link abierto'}
            >
              <span
                className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                style={{ transform: allowOpenJoin ? 'translateX(20px)' : 'translateX(0)' }}
              />
            </button>
          </div>
        </div>
      )}

      {/* Miembros */}
      <div className="rounded-xl p-5 space-y-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <h2 className="font-semibold" style={{ color: 'var(--color-text-primary)' }}>
          Miembros con acceso
        </h2>

        {loadingMembers && (
          <div className="flex items-center gap-2 py-4" style={{ color: 'var(--color-text-secondary)' }}>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando miembros...</span>
          </div>
        )}

        {membersError && (
          <p className="text-sm text-red-400">{membersError}</p>
        )}

        {!loadingMembers && !membersError && (
          <div className="space-y-2">
            {members.map(m => {
              const isCurrentUser = m.user_id === user?.id
              const isMemberOwner = m.role === 'owner'

              return (
                <div
                  key={m.id}
                  className="flex items-center gap-3 py-3 px-3 rounded-lg"
                  style={{ background: isCurrentUser ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'var(--color-bg)' }}
                >
                  {/* Avatar */}
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                    style={{ background: 'var(--color-primary)', color: '#000' }}>
                    {initial(m)}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--color-text-primary)' }}>
                        {displayName(m)}
                      </span>
                      {isCurrentUser && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full bg-zinc-500/20 text-zinc-400 border border-zinc-500/30">
                          Tú
                        </span>
                      )}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${ROLE_BADGE[m.role]}`}>
                        {ROLE_LABELS[m.role]}
                      </span>
                    </div>
                  </div>

                  {/* Actions (solo owner puede gestionar no-owners) */}
                  {isOwner && !isMemberOwner && !isCurrentUser && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="relative">
                        <select
                          value={m.role}
                          onChange={e => handleRoleChange(m.id, m.user_id, e.target.value as 'editor' | 'viewer')}
                          className="appearance-none pl-2 pr-6 py-1 rounded text-xs outline-none cursor-pointer"
                          style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)', color: 'var(--color-text-primary)' }}
                        >
                          <option value="editor">Editor</option>
                          <option value="viewer">Solo lectura</option>
                        </select>
                        <ChevronDown size={12} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--color-text-secondary)' }} />
                      </div>

                      {confirmDelete === m.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleRemoveMember(m.id, m.user_id)}
                            className="text-xs px-2 py-1 rounded bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            Confirmar
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-xs px-2 py-1 rounded transition-colors"
                            style={{ color: 'var(--color-text-secondary)' }}
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(m.id)}
                          className="p-1 rounded hover:bg-red-500/10 text-red-400/60 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="rounded-xl p-4" style={{ background: 'var(--color-surface)', border: '1px solid var(--color-border)' }}>
        <p className="text-xs" style={{ color: 'var(--color-text-secondary)' }}>
          Organización creada el{' '}
          {new Date(org.created_at).toLocaleDateString('es-MX', {
            year: 'numeric', month: 'long', day: 'numeric',
          })}
        </p>
      </div>
    </div>
  )
}
