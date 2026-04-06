import { create } from 'zustand'
import type { Organization, OrgMember, OrgRole } from '../types'

interface OrgState {
  org: Organization | null
  members: OrgMember[]
  currentRole: OrgRole | null
  allowedPages: string[] | null
  loading: boolean
  setOrg: (org: Organization | null) => void
  setMembers: (members: OrgMember[]) => void
  setCurrentRole: (role: OrgRole | null) => void
  setAllowedPages: (pages: string[] | null) => void
  setLoading: (v: boolean) => void
  reset: () => void
  isOwner: () => boolean
  canEdit: () => boolean
}

export const useOrgStore = create<OrgState>((set, get) => ({
  org: null,
  members: [],
  currentRole: null,
  allowedPages: null,
  loading: false,
  setOrg: (org) => set({ org }),
  setMembers: (members) => set({ members }),
  setCurrentRole: (currentRole) => set({ currentRole }),
  setAllowedPages: (allowedPages) => set({ allowedPages }),
  setLoading: (loading) => set({ loading }),
  reset: () => set({ org: null, members: [], currentRole: null, allowedPages: null, loading: false }),
  isOwner: () => get().currentRole === 'owner',
  canEdit: () => get().currentRole === 'owner' || get().currentRole === 'editor',
}))
