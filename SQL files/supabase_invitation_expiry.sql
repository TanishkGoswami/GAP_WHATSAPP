ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS invite_token_hash text,
ADD COLUMN IF NOT EXISTS invite_expires_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invite_sent_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invite_accepted_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS invite_temp_password_encrypted text;

CREATE INDEX IF NOT EXISTS idx_organization_members_invite_token_hash
ON public.organization_members(invite_token_hash)
WHERE invite_token_hash IS NOT NULL;
