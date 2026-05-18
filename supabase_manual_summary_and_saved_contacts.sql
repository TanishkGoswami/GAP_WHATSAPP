-- Manual summary trigger + explicit saved contacts.
-- Safe to run multiple times in Supabase SQL Editor.

alter table public.w_contacts
  add column if not exists saved_at timestamp with time zone,
  add column if not exists saved_by_user_id uuid,
  add column if not exists save_source text not null default 'auto';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_contacts_save_source_check') then
    alter table public.w_contacts
      add constraint w_contacts_save_source_check
      check (save_source in ('auto', 'manual', 'import', 'broadcast'))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_contacts_saved_by_user_id_fkey') then
    alter table public.w_contacts
      add constraint w_contacts_saved_by_user_id_fkey
      foreign key (saved_by_user_id) references auth.users(id)
      not valid;
  end if;
end $$;

create index if not exists idx_w_contacts_saved
  on public.w_contacts(organization_id, saved_at desc)
  where saved_at is not null;

comment on column public.w_contacts.saved_at is 'Set when a user explicitly saves this auto-discovered WhatsApp contact.';
comment on column public.w_contacts.save_source is 'auto for inbound/system-discovered rows, manual/import/broadcast for saved contacts.';
