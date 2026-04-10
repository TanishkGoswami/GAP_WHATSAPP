-- Ensure conversation upserts work reliably.
-- Server uses: onConflict: 'organization_id,wa_account_id,contact_id'

create unique index if not exists idx_conversations_org_wa_contact_unique
  on public.conversations (organization_id, wa_account_id, contact_id);
