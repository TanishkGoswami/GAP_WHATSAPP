-- Ensure contacts.phone column exists (stores a real phone number, e.g. 91XXXXXXXXXX)

alter table public.contacts
  add column if not exists phone text;

-- Optional: index for faster lookup by phone within org
create index if not exists idx_contacts_org_phone
  on public.contacts (organization_id, phone);
