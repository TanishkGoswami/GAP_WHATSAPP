create table if not exists whatsapp_sessions (
  session_id text primary key,
  creds jsonb not null default '{}'::jsonb,
  keys jsonb not null default '{}'::jsonb
);

alter table whatsapp_sessions enable row level security;

create policy "Allow all access to authenticated users"
  on whatsapp_sessions
  for all
  to authenticated
  using (true)
  with check (true);

create policy "Allow all access to anon users"
  on whatsapp_sessions
  for all
  to anon
  using (true)
  with check (true);
