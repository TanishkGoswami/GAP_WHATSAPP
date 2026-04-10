-- Add manual alias + canonical phone key for contacts

alter table public.contacts
  add column if not exists custom_name text;

alter table public.contacts
  add column if not exists wa_key text;

create index if not exists idx_contacts_org_wa_key
  on public.contacts (organization_id, wa_key);
