-- Make email nullable to support universal invite links (no email required)
ALTER TABLE organization_invitations
  ALTER COLUMN email DROP NOT NULL;

-- Drop the unique constraint on (org_id, email) — multiple anonymous links must be allowed
ALTER TABLE organization_invitations
  DROP CONSTRAINT IF EXISTS organization_invitations_org_id_email_key;
