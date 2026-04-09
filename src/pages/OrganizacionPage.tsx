import { useState, useEffect, type CSSProperties } from 'react'
import { Users, UserPlus, Copy, Check, Trash2, ChevronDown, Shield, Settings } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useOrgStore } from '../store/orgStore'
import {
  getOrgMembersWithEmail,
  removeMember,
  updateMemberRole,
  updateOrgJoinPolicy,
  updateMemberAllowedPages,
} from '../lib/orgService'
import type { OrgRole } from '../types'

type MemberRow = {
  id: string
  user_id: string
  role: OrgRole
  email: string | null
  joined_at: string
  allowed_pages: string[] | null
  full_name: string | null
  avatar_url: string | null
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Propietario',
  admin: 'Admin',
  editor: 'Editor',
  viewer: 'Visor',
}

const PLAN_LIMITS: Record<string, { label: string; max: number | null }> = {
  free:       { label: 'Free',       max: 2 },
  pro:        { label: 'Pro',        max: 10 },
  enterprise: { label: 'Enterprise', max: null },
}

const ROLE_BADGE_STYLES: Record<string, CSSProperties> = {
  owner: { background: 'var(--sf-green-bg)', color: 'var(--sf-green)', border: '1px solid var(--sf-green-border)' },
  admin: { background: 'rgba(168,85,247,0.12)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.25)' },
  editor: { background: 'rgba(59,130,246,0.12)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.25)' },
  viewer: { background: 'var(--sf-inset)', color: 'var(--sf-t5)', border: '1px solid var(--sf-border)' },
}

const AVATAR_COLORS = [
  '#00D68F', '#3b82f6', '#a855f7', '#f59e0b', '#ef4444', '#06b6d4', '#ec4899', '#84cc16',
]

const PAGE_OPTIONS = [
  { group: 'PRINCIPAL', items: [
    { path: 'dashboard', label: 'Estado Comercial' },
    { path: 'vendedores', label: 'Vendedores' },
    { path: 'metas', label: 'Metas' },
  ]},
  { group: 'ANÁLISIS', items: [
    { path: 'clientes', label: 'Clientes' },
    { path: 'rotacion', label: 'Rotación' },
    { path: 'departamentos', label: 'Departamentos' },
    { path: 'rendimiento', label: 'Rendimiento Anual' },
  ]},
  { group: 'HERRAMIENTAS', items: [
    { path: 'chat', label: 'Chat IA' },
    { path: 'cargar', label: 'Cargar datos' },
    { path: 'configuracion', label: 'Configuración' },
  ]},
]

const ALL_PAGE_PATHS = PAGE_OPTIONS.flatMap(g => g.items.map(i => i.path))

const DEFAULT_VIEWER_PAGES = ['dashboard', 'vendedores', 'metas', 'clientes', 'rotacion', 'departamentos', 'rendimiento', 'chat']
const DEFAULT_EDITOR_PAGES = [...DEFAULT_VIEWER_PAGES, 'cargar']
const DEFAULT_ADMIN_PAGES = [...DEFAULT_EDITOR_PAGES, 'configuracion']

function getDefaultPages(role: OrgRole): string[] {
  if (role === 'admin') return DEFAULT_ADMIN_PAGES
  if (role === 'editor') return DEFAULT_EDITOR_PAGES
  return DEFAULT_VIEWER_PAGES
}

export default function OrganizacionPage() {
  const user = useAuthStore(s => s.user)
  const org = useOrgStore(s => s.org)
  const currentRole = useOrgStore(s => s.currentRole)
  const isOwner = currentRole === 'owner'

  const [members, setMembers] = useState<MemberRow[]>([])
  const [loadingMembers, setLoadingMembers] = useState(true)
  const [membersError, setMembersError] = useState<string | null>(null)

  const [copied, setCopied] = useState(false)
  const [allowOpenJoin, setAllowOpenJoin] = useState<boolean>(org?.allow_open_join ?? true)
  const [joinPolicyUpdating, setJoinPolicyUpdating] = useState(false)
  const [inviteRole, setInviteRole] = useState<'viewer' | 'editor' | 'admin'>('viewer')

  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [editingPagesFor, setEditingPagesFor] = useState<string | null>(null)

  useEffect(() => {
    if (!org) { setLoadingMembers(false); return }
    loadData()
  }, [org]) // eslint-disable-line

  async function loadData() {
    if (!org) return
    setLoadingMembers(true)
    setMembersError(null)
    try {
      const timeout = new Promise<never>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
      const m = await Promise.race([getOrgMembersWithEmail(org.id), timeout])
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
    if (error) setAllowOpenJoin(!value)
    setJoinPolicyUpdating(false)
  }

  async function handleRoleChange(memberId: string, userId: string, newRole: 'editor' | 'viewer' | 'admin') {
    if (!org) return
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, role: newRole } : m))
    const { error } = await updateMemberRole(org.id, userId, newRole)
    if (error) loadData()
  }

  async function handleRemoveMember(memberId: string, userId: string) {
    if (!org) return
    const { error } = await removeMember(org.id, userId)
    if (!error) {
      setMembers(prev => prev.filter(m => m.id !== memberId))
      setConfirmDelete(null)
    }
  }

  async function handleTogglePage(memberId: string, member: MemberRow, pagePath: string) {
    const current = member.allowed_pages ?? getDefaultPages(member.role)
    const next = current.includes(pagePath)
      ? current.filter(p => p !== pagePath)
      : [...current, pagePath]
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, allowed_pages: next } : m))
    await updateMemberAllowedPages(memberId, next)
  }

  async function handleSetAllPages(memberId: string, selectAll: boolean) {
    const next = selectAll ? [...ALL_PAGE_PATHS] : []
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, allowed_pages: next } : m))
    await updateMemberAllowedPages(memberId, next)
  }

  function displayName(m: MemberRow) {
    if (m.full_name) return m.full_name
    if (m.email) return m.email.split('@')[0]
    return 'Miembro'
  }

  function displayEmail(m: MemberRow) {
    if (m.email) return m.email
    return m.user_id.slice(0, 8) + '...'
  }

  function initial(m: MemberRow) {
    if (m.full_name) return m.full_name[0].toUpperCase()
    if (m.email) return m.email[0].toUpperCase()
    return '?'
  }

  // ── Fallback: no org ──
  if (!org) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[60vh] gap-5 px-4">
        <Users size={48} style={{ color: 'var(--sf-t6)' }} />
        <div className="text-center space-y-2">
          <h1 className="text-xl font-bold" style={{ color: 'var(--sf-t1)' }}>Gestión de equipo</h1>
          <p className="text-sm max-w-xs" style={{ color: 'var(--sf-t5)' }}>
            Crea una organización desde el onboarding para administrar tu equipo.
          </p>
        </div>
        <a href="/dashboard" className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          style={{ background: 'var(--sf-green-bg)', color: 'var(--sf-green)' }}>
          Volver al dashboard
        </a>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
      {/* ═══ Section 1: Org Header ═══ */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--sf-t1)' }}>{org.name}</h1>
          <p className="text-xs mt-1" style={{ color: 'var(--sf-t5)' }}>
            Organización creada el{' '}
            {new Date(org.created_at).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
          <div className="mt-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium"
              style={ROLE_BADGE_STYLES[currentRole ?? 'viewer']}>
              {ROLE_LABELS[currentRole ?? 'viewer']}
            </span>
          </div>
        </div>
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}>
          <Users className="w-5 h-5" style={{ color: 'var(--sf-green)' }} />
        </div>
      </div>

      {/* ═══ Section 2: Invite Card (owner only) ═══ */}
      {isOwner && (
        <div className="rounded-2xl p-5 space-y-4"
          style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--sf-green-bg)', border: '1px solid var(--sf-green-border)' }}>
              <UserPlus className="w-4 h-4" style={{ color: 'var(--sf-green)' }} />
            </div>
            <div>
              <h2 className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>Invitar miembros</h2>
              <p className="text-[11px]" style={{ color: 'var(--sf-t5)' }}>Comparte este enlace para que otros accedan a tu organización</p>
            </div>
          </div>

          {/* Role selector */}
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium" style={{ color: 'var(--sf-t5)' }}>Rol de invitado:</span>
            <div className="relative">
              <select value={inviteRole}
                onChange={e => setInviteRole(e.target.value as 'viewer' | 'editor' | 'admin')}
                className="appearance-none rounded-lg text-xs py-1.5 pl-2.5 pr-7 outline-none cursor-pointer"
                style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>
                <option value="viewer">Visor — solo puede ver dashboards</option>
                <option value="editor">Editor — puede ver y subir datos</option>
                <option value="admin">Admin — puede ver, subir datos y gestionar equipo</option>
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--sf-t5)' }} />
            </div>
          </div>

          {/* Link box */}
          <div className="flex items-center gap-2 rounded-lg px-3 py-2.5"
            style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)' }}>
            <code className="flex-1 text-xs truncate"
              style={{ color: 'var(--sf-t4)', opacity: allowOpenJoin ? 1 : 0.4 }}>
              {`${window.location.origin}/join/${org.id}?role=${inviteRole}`}
            </code>
            <button onClick={() => allowOpenJoin && handleCopyLink(`${window.location.origin}/join/${org.id}?role=${inviteRole}`)}
              disabled={!allowOpenJoin}
              className="flex items-center gap-1 px-2.5 py-1 rounded-md text-xs flex-shrink-0 transition-colors disabled:opacity-40"
              style={{ color: copied ? 'var(--sf-green)' : 'var(--sf-t4)' }}>
              {copied ? <Check size={13} /> : <Copy size={13} />}
              {copied ? '¡Copiado!' : 'Copiar'}
            </button>
          </div>

          {/* Toggle */}
          <div className="flex items-center justify-between pt-1">
            <div>
              <p className="text-xs font-medium" style={{ color: 'var(--sf-t2)' }}>Permitir acceso con link</p>
              <p className="text-[11px] mt-0.5" style={{ color: 'var(--sf-t5)' }}>
                {allowOpenJoin ? 'Cualquier persona con el link puede unirse' : 'El link está desactivado — nadie nuevo puede unirse'}
              </p>
            </div>
            <button onClick={() => handleToggleOpenJoin(!allowOpenJoin)}
              disabled={joinPolicyUpdating}
              className="relative flex-shrink-0 w-10 h-5 rounded-full transition-colors duration-200 disabled:opacity-60"
              style={{ background: allowOpenJoin ? 'var(--sf-green)' : 'var(--sf-border)' }}
              aria-label={allowOpenJoin ? 'Desactivar link' : 'Activar link'}>
              <span className="absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform duration-200"
                style={{ transform: allowOpenJoin ? 'translateX(20px)' : 'translateX(0)' }} />
            </button>
          </div>
        </div>
      )}

      {/* ═══ Section 3: Team Card ═══ */}
      <div className="rounded-2xl overflow-hidden"
        style={{ background: 'var(--sf-card)', border: '1px solid var(--sf-border)' }}>
        <div className="px-5 py-4 flex items-center gap-2.5"
          style={{ borderBottom: '1px solid var(--sf-border)' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.2)' }}>
            <Shield className="w-4 h-4" style={{ color: '#3b82f6' }} />
          </div>
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--sf-t1)' }}>Equipo</h2>
            <p className="text-[11px]" style={{ color: 'var(--sf-t5)' }}>Miembros y permisos de tu organización</p>
          </div>
        </div>

        {/* Table header */}
        <div className="hidden md:grid grid-cols-[1fr_120px_120px_80px] gap-2 px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest"
          style={{ color: 'var(--sf-t7)', borderBottom: '1px solid var(--sf-border)' }}>
          <span>Miembro</span>
          <span>Rol</span>
          <span>Páginas</span>
          <span>Acciones</span>
        </div>

        {/* Loading */}
        {loadingMembers && (
          <div className="flex items-center gap-2 px-5 py-8" style={{ color: 'var(--sf-t5)' }}>
            <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
            <span className="text-sm">Cargando miembros...</span>
          </div>
        )}

        {membersError && <p className="px-5 py-4 text-sm" style={{ color: 'var(--sf-red)' }}>{membersError}</p>}

        {/* Rows */}
        {!loadingMembers && !membersError && members.map((m, idx) => {
          const isCurrentUser = m.user_id === user?.id
          const isMemberOwner = m.role === 'owner'
          const showPageEditor = editingPagesFor === m.id
          const effectivePages = m.allowed_pages ?? getDefaultPages(m.role)

          return (
            <div key={m.id}>
              <div className="md:grid md:grid-cols-[1fr_120px_120px_80px] gap-2 px-5 py-3 items-center flex flex-col md:flex-row"
                style={{
                  borderBottom: '1px solid var(--sf-border)',
                  background: isCurrentUser ? 'color-mix(in srgb, var(--sf-green) 4%, transparent)' : 'transparent',
                }}>
                {/* Member info */}
                <div className="flex items-center gap-3 min-w-0 w-full md:w-auto">
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: AVATAR_COLORS[idx % AVATAR_COLORS.length], color: '#fff' }}>
                    {initial(m)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium truncate" style={{ color: 'var(--sf-t1)' }}>
                        {displayName(m)}
                      </span>
                      {isCurrentUser && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                          style={{ background: 'var(--sf-inset)', color: 'var(--sf-t5)', border: '1px solid var(--sf-border)' }}>
                          Tú
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] truncate" style={{ color: 'var(--sf-t5)' }}>
                      {displayEmail(m)}
                    </p>
                  </div>
                </div>

                {/* Role */}
                <div className="w-full md:w-auto mt-2 md:mt-0">
                  {isMemberOwner ? (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-block"
                      style={ROLE_BADGE_STYLES.owner}>
                      Propietario
                    </span>
                  ) : isOwner ? (
                    <div className="relative inline-block">
                      <select value={m.role}
                        onChange={e => handleRoleChange(m.id, m.user_id, e.target.value as 'editor' | 'viewer' | 'admin')}
                        className="appearance-none pl-2 pr-6 py-1 rounded-md text-xs outline-none cursor-pointer"
                        style={{ background: 'var(--sf-inset)', border: '1px solid var(--sf-border)', color: 'var(--sf-t2)' }}>
                        <option value="viewer">Visor</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>
                      <ChevronDown size={11} className="absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none"
                        style={{ color: 'var(--sf-t5)' }} />
                    </div>
                  ) : (
                    <span className="text-xs px-2 py-0.5 rounded-full font-medium inline-block"
                      style={ROLE_BADGE_STYLES[m.role] || ROLE_BADGE_STYLES.viewer}>
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  )}
                </div>

                {/* Pages */}
                <div className="w-full md:w-auto mt-2 md:mt-0">
                  {isMemberOwner ? (
                    <span className="text-xs" style={{ color: 'var(--sf-t5)' }}>Todas</span>
                  ) : isOwner ? (
                    <button onClick={() => setEditingPagesFor(showPageEditor ? null : m.id)}
                      className="flex items-center gap-1 text-xs px-2 py-1 rounded-md transition-colors"
                      style={{
                        background: showPageEditor ? 'var(--sf-green-bg)' : 'var(--sf-inset)',
                        color: showPageEditor ? 'var(--sf-green)' : 'var(--sf-t4)',
                        border: `1px solid ${showPageEditor ? 'var(--sf-green-border)' : 'var(--sf-border)'}`,
                      }}>
                      <Settings size={12} />
                      Configurar
                    </button>
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--sf-t5)' }}>{effectivePages.length} págs.</span>
                  )}
                </div>

                {/* Actions */}
                <div className="w-full md:w-auto mt-2 md:mt-0">
                  {isOwner && !isMemberOwner && !isCurrentUser ? (
                    confirmDelete === m.id ? (
                      <div className="flex items-center gap-1">
                        <button onClick={() => handleRemoveMember(m.id, m.user_id)}
                          className="text-[11px] px-2 py-1 rounded-md transition-colors"
                          style={{ background: 'rgba(239,68,68,0.12)', color: '#ef4444' }}>
                          Confirmar
                        </button>
                        <button onClick={() => setConfirmDelete(null)}
                          className="text-[11px] px-2 py-1 rounded-md transition-colors"
                          style={{ color: 'var(--sf-t5)' }}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button onClick={() => setConfirmDelete(m.id)}
                        className="p-1.5 rounded-md transition-colors"
                        style={{ color: 'var(--sf-t6)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#ef4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--sf-t6)')}>
                        <Trash2 size={14} />
                      </button>
                    )
                  ) : (
                    <span className="text-xs" style={{ color: 'var(--sf-t7)' }}>—</span>
                  )}
                </div>
              </div>

              {/* Expandable page permissions panel */}
              {showPageEditor && !isMemberOwner && (
                <div className="px-5 py-4 space-y-3"
                  style={{ background: 'var(--sf-inset)', borderBottom: '1px solid var(--sf-border)' }}>
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold" style={{ color: 'var(--sf-t2)' }}>
                      Páginas visibles para {displayName(m)}
                    </p>
                    <div className="flex gap-2">
                      <button onClick={() => handleSetAllPages(m.id, true)}
                        className="text-[11px] px-2 py-0.5 rounded transition-colors"
                        style={{ color: 'var(--sf-green)' }}>
                        Marcar todas
                      </button>
                      <button onClick={() => handleSetAllPages(m.id, false)}
                        className="text-[11px] px-2 py-0.5 rounded transition-colors"
                        style={{ color: 'var(--sf-t5)' }}>
                        Desmarcar todas
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {PAGE_OPTIONS.map(group => (
                      <div key={group.group}>
                        <p className="text-[9px] font-bold uppercase tracking-widest mb-2" style={{ color: 'var(--sf-t7)' }}>
                          {group.group}
                        </p>
                        <div className="space-y-1.5">
                          {group.items.map(item => {
                            const checked = effectivePages.includes(item.path)
                            return (
                              <label key={item.path} className="flex items-center gap-2 cursor-pointer group">
                                <div className="w-4 h-4 rounded border flex items-center justify-center transition-colors"
                                  style={{
                                    borderColor: checked ? 'var(--sf-green)' : 'var(--sf-border)',
                                    background: checked ? 'var(--sf-green-bg)' : 'transparent',
                                  }}>
                                  {checked && (
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}
                                      style={{ color: 'var(--sf-green)' }}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                                    </svg>
                                  )}
                                </div>
                                <input type="checkbox" checked={checked} className="sr-only"
                                  onChange={() => handleTogglePage(m.id, m, item.path)} />
                                <span className="text-xs" style={{ color: 'var(--sf-t3)' }}>{item.label}</span>
                              </label>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )
        })}

        {/* Footer */}
        {!loadingMembers && !membersError && (
          <div className="px-5 py-3">
            {(() => {
              const planKey = (org as any)?.plan ?? 'free'
              const plan = PLAN_LIMITS[planKey] ?? PLAN_LIMITS.free
              const limitText = plan.max !== null ? `${members.length} de ${plan.max}` : `${members.length}`
              return (
                <p className="text-[11px]" style={{ color: 'var(--sf-t6)' }}>
                  {limitText} {members.length === 1 ? 'miembro' : 'miembros'} · Plan {plan.label}
                  {plan.max !== null && members.length >= plan.max && (
                    <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)' }}>
                      límite alcanzado
                    </span>
                  )}
                </p>
              )
            })()}
          </div>
        )}
      </div>
    </div>
  )
}
