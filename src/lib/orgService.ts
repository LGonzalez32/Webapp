import { supabase } from './supabaseClient'
import { parseSalesFile, parseMetasFile, parseInventoryFile } from './fileParser'
import type { Organization, OrgMember, OrgRole, SaleRecord, MetaRecord, InventoryItem } from '../types'

const BUCKET = 'org-data'

// ── Organización ──────────────────────────────────────────────────────────────

export async function getUserOrg(userId: string): Promise<{
  org: Organization | null
  role: OrgRole | null
}> {
  const { data: membership } = await supabase
    .from('organization_members')
    .select('org_id, role, organizations(*)')
    .eq('user_id', userId)
    .single()

  if (membership) {
    const org = (membership as any).organizations as Organization
    return { org, role: membership.role as OrgRole }
  }

  return { org: null, role: null }
}

export async function createOrg(
  name: string,
  userId: string
): Promise<{ org: Organization | null; error: string | null }> {
  const { data: org, error: orgError } = await supabase
    .from('organizations')
    .insert({ name, owner_id: userId })
    .select()
    .single()

  if (orgError || !org) return { org: null, error: orgError?.message ?? 'Error creando organización' }

  await supabase.from('organization_members').insert({
    org_id: org.id,
    user_id: userId,
    role: 'owner',
  })

  return { org: org as Organization, error: null }
}

// ── Miembros ──────────────────────────────────────────────────────────────────

export async function getOrgMembers(orgId: string): Promise<OrgMember[]> {
  const { data } = await supabase
    .from('organization_members')
    .select('*')
    .eq('org_id', orgId)
  return (data ?? []) as OrgMember[]
}

export async function removeMember(
  orgId: string,
  userId: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('organization_members')
    .delete()
    .eq('org_id', orgId)
    .eq('user_id', userId)
  return { error: error?.message ?? null }
}

export async function updateMemberRole(
  orgId: string,
  userId: string,
  newRole: 'editor' | 'viewer'
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('organization_members')
    .update({ role: newRole })
    .eq('org_id', orgId)
    .eq('user_id', userId)
    .neq('role', 'owner')
  return { error: error?.message ?? null }
}

export async function getOrgMembersWithEmail(orgId: string): Promise<
  Array<{ id: string; user_id: string; role: OrgRole; email: string | null; joined_at: string }>
> {
  const { data } = await supabase
    .from('organization_members')
    .select('*')
    .eq('org_id', orgId)
  return (data ?? []).map(m => ({ ...m, email: null }))
}

// ── Storage ───────────────────────────────────────────────────────────────────

type FileType = 'ventas' | 'metas' | 'inventario'

function getExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() ?? 'csv'
}

export async function uploadOrgFile(
  orgId: string,
  type: FileType,
  file: File
): Promise<{ error: string | null }> {
  const path = `${orgId}/${type}.${getExtension(file)}`
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { upsert: true })
  return { error: error?.message ?? null }
}

// parseSalesFile/etc. devuelven { data: T[], ... } — extraemos solo .data
async function downloadAndParse<T>(
  orgId: string,
  type: FileType,
  parser: (file: File) => Promise<{ data: T[] }>
): Promise<T[] | null> {
  const { data: files } = await supabase.storage.from(BUCKET).list(orgId)
  const match = (files ?? []).find((f) => f.name.startsWith(type))
  if (!match) return null

  const { data, error } = await supabase.storage
    .from(BUCKET)
    .download(`${orgId}/${match.name}`)

  if (error || !data) return null

  const file = new File([data], match.name, { type: data.type })
  try {
    const result = await parser(file)
    return result.data.length > 0 ? result.data : null
  } catch {
    return null
  }
}

export async function loadOrgData(orgId: string): Promise<{
  sales: SaleRecord[] | null
  metas: MetaRecord[] | null
  inventory: InventoryItem[] | null
}> {
  const [sales, metas, inventory] = await Promise.all([
    downloadAndParse<SaleRecord>(orgId, 'ventas', parseSalesFile),
    downloadAndParse<MetaRecord>(orgId, 'metas', parseMetasFile),
    downloadAndParse<InventoryItem>(orgId, 'inventario', parseInventoryFile),
  ])
  return { sales, metas, inventory }
}
