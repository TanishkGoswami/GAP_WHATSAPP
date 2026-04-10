-- Add contact_type to distinguish 1:1 contacts from groups/channels
-- 'individual' = normal WhatsApp user (has phone number)
-- 'group' = WhatsApp group
-- 'channel' = WhatsApp channel/newsletter

alter table public.contacts
  add column if not exists contact_type text default 'individual';

-- Backfill existing contacts based on wa_id pattern
update public.contacts
set contact_type = 'group'
where wa_id like '%@g.us';

update public.contacts
set contact_type = 'channel'
where wa_id like '%@newsletter';

-- For individual contacts, ensure phone is populated from wa_id if missing
update public.contacts
set phone = case
  when length(regexp_replace(split_part(coalesce(wa_id, ''), '@', 1), '[^0-9]', '', 'g')) = 10
    then '91' || regexp_replace(split_part(coalesce(wa_id, ''), '@', 1), '[^0-9]', '', 'g')
  when length(regexp_replace(split_part(coalesce(wa_id, ''), '@', 1), '[^0-9]', '', 'g')) between 11 and 15
    then regexp_replace(split_part(coalesce(wa_id, ''), '@', 1), '[^0-9]', '', 'g')
  else phone
end
where contact_type = 'individual'
  and coalesce(btrim(phone), '') = ''
  and (wa_id like '%@s.whatsapp.net' or wa_id not like '%@%');

-- Clear invalid phone numbers (non-phone JIDs stored by mistake)
update public.contacts
set phone = null
where contact_type in ('group', 'channel');

-- Index for filtering by contact_type
create index if not exists idx_contacts_type on public.contacts (contact_type);
