import { useOrgStore } from '../store/orgStore'

/**
 * Hook that returns the current user's role and permission helpers.
 * - Owner: full access
 * - Editor: can upload files and view everything, but cannot invite or manage org
 * - Viewer: read-only — cannot upload, configure, or invite
 */
export function useUserRole() {
  const currentRole = useOrgStore(s => s.currentRole)

  // If role couldn't be determined (null), default to owner (permissive).
  // Only restrict if we EXPLICITLY got 'viewer' from a successful query.
  const effectiveRole = currentRole ?? 'owner'

  return {
    role: effectiveRole,
    isOwner: effectiveRole === 'owner',
    canEdit: effectiveRole === 'owner' || effectiveRole === 'editor',
    canInvite: effectiveRole === 'owner',
    canUpload: effectiveRole === 'owner' || effectiveRole === 'editor',
    canConfigure: effectiveRole === 'owner',
  }
}
