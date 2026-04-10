-- Adds WhatsApp-style media fields to existing tables without breaking current JSONB-based storage.

-- Conversations: add assigned_agent_id to match required model naming.
alter table public.conversations
  add column if not exists assigned_agent_id uuid;

-- Messages: add structured columns (keep existing content jsonb for backward compatibility).
alter table public.messages
  add column if not exists text_body text,
  add column if not exists media_url text,
  add column if not exists media_mime text,
  add column if not exists media_size int,
  add column if not exists duration_seconds int,
  add column if not exists waveform jsonb;

-- Optional: allow newer direction values while keeping existing ones.
-- If your DB already has the check constraint named differently, adjust manually.
-- Note: Postgres doesn't support "alter constraint" easily; drop+recreate by name.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_direction_check'
  ) then
    alter table public.messages drop constraint messages_direction_check;
  end if;
exception
  when undefined_object then
    null;
end $$;

alter table public.messages
  add constraint messages_direction_check
  check (direction in ('inbound','outbound','in','out'));

-- Tighten type values while keeping legacy rows safe (only applies to new writes if you keep your app consistent)
-- If you already have a constraint, you can adapt similarly.
do $$
begin
  if exists (
    select 1
    from pg_constraint
    where conname = 'messages_type_check'
  ) then
    alter table public.messages drop constraint messages_type_check;
  end if;
exception
  when undefined_object then
    null;
end $$;

alter table public.messages
  add constraint messages_type_check
  check (type in ('text','audio','image','video','document','sticker','note','reaction','protocol','system'));

create index if not exists idx_messages_conversation_created_at
  on public.messages(conversation_id, created_at desc);
