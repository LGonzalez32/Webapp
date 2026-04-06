-- Add granular page permissions to organization_members
ALTER TABLE organization_members
  ADD COLUMN IF NOT EXISTS allowed_pages jsonb DEFAULT NULL;

-- Add email column to profiles for member display
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS email text;

-- Backfill current user's email
UPDATE profiles SET email = 'lfgg2000@gmail.com' WHERE id = '305164ed-51ae-4853-8da6-4026bf6e6239';
