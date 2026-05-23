-- Repair existing Flow Builder installs where w_flow_versions was created
-- before WhatsApp account scoping columns were added.
-- Safe to run multiple times.

alter table public.w_flow_versions
  add column if not exists wa_account_scope text not null default 'all',
  add column if not exists wa_account_ids uuid[] not null default '{}'::uuid[];

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flow_versions_wa_account_scope_check') then
    alter table public.w_flow_versions
      add constraint w_flow_versions_wa_account_scope_check
      check (wa_account_scope in ('all', 'selected'))
      not valid;
  end if;
end $$;

create index if not exists idx_w_flow_versions_wa_account_ids
  on public.w_flow_versions using gin(wa_account_ids);

notify pgrst, 'reload schema';
