-- Flow Builder Phase 1 structure.
-- Safe to run multiple times in Supabase SQL Editor.
-- Keeps existing w_flows data, adds published versions and runtime logs.

create extension if not exists pgcrypto;

alter table public.w_flows
  add column if not exists description text,
  add column if not exists status text not null default 'draft',
  add column if not exists trigger_type text not null default 'keyword',
  add column if not exists trigger_keywords text[] not null default '{}'::text[],
  add column if not exists triggers jsonb not null default '[]'::jsonb,
  add column if not exists nodes jsonb not null default '[]'::jsonb,
  add column if not exists edges jsonb not null default '[]'::jsonb,
  add column if not exists current_version_id uuid,
  add column if not exists created_by_user_id uuid,
  add column if not exists updated_by_user_id uuid,
  add column if not exists created_at timestamp with time zone not null default now(),
  add column if not exists updated_at timestamp with time zone not null default now(),
  add column if not exists archived_at timestamp with time zone;

do $$
declare
  triggers_type text;
begin
  select udt_name
  into triggers_type
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'w_flows'
    and column_name = 'triggers';

  if triggers_type = 'jsonb' then
    execute $sql$
      update public.w_flows
      set trigger_keywords = array(
        select distinct trim(both from value)
        from jsonb_array_elements_text(coalesce(triggers, '[]'::jsonb)) value
        where trim(both from value) <> ''
      )
      where trigger_keywords = '{}'::text[]
        and jsonb_typeof(coalesce(triggers, '[]'::jsonb)) = 'array'
    $sql$;
  elsif triggers_type = '_text' then
    execute $sql$
      update public.w_flows
      set trigger_keywords = array(
        select distinct trim(both from value)
        from unnest(coalesce(triggers, '{}'::text[])) as t(value)
        where trim(both from value) <> ''
      )
      where trigger_keywords = '{}'::text[]
    $sql$;
  elsif triggers_type = 'text' then
    execute $sql$
      update public.w_flows
      set trigger_keywords = array(
        select distinct trim(both from value)
        from unnest(string_to_array(coalesce(triggers, ''), ',')) as t(value)
        where trim(both from value) <> ''
      )
      where trigger_keywords = '{}'::text[]
    $sql$;
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flows_status_check') then
    alter table public.w_flows
      add constraint w_flows_status_check
      check (status in ('draft', 'active', 'paused', 'archived'))
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_flows_trigger_type_check') then
    alter table public.w_flows
      add constraint w_flows_trigger_type_check
      check (trigger_type in ('keyword', 'all_messages', 'manual', 'api'))
      not valid;
  end if;
end $$;

create table if not exists public.w_flow_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  flow_id uuid not null references public.w_flows(id) on delete cascade,
  version_number integer not null,
  nodes jsonb not null default '[]'::jsonb,
  edges jsonb not null default '[]'::jsonb,
  trigger_type text not null default 'keyword',
  trigger_keywords text[] not null default '{}'::text[],
  status text not null default 'published',
  validation_errors jsonb not null default '[]'::jsonb,
  published_by_user_id uuid,
  published_at timestamp with time zone not null default now(),
  created_at timestamp with time zone not null default now(),
  unique(flow_id, version_number)
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flow_versions_status_check') then
    alter table public.w_flow_versions
      add constraint w_flow_versions_status_check
      check (status in ('draft', 'published', 'archived'))
      not valid;
  end if;
end $$;

alter table public.w_flow_sessions
  add column if not exists organization_id uuid,
  add column if not exists conversation_id uuid,
  add column if not exists flow_version_id uuid,
  add column if not exists current_node_id text,
  add column if not exists status text not null default 'active',
  add column if not exists state_data jsonb not null default '{}'::jsonb,
  add column if not exists active_run_id uuid,
  add column if not exists started_at timestamp with time zone not null default now(),
  add column if not exists last_interaction_at timestamp with time zone not null default now(),
  add column if not exists completed_at timestamp with time zone,
  add column if not exists expires_at timestamp with time zone;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flow_sessions_status_check') then
    alter table public.w_flow_sessions
      add constraint w_flow_sessions_status_check
      check (status in ('active', 'waiting', 'completed', 'failed', 'abandoned'))
      not valid;
  end if;
end $$;

create table if not exists public.w_flow_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  conversation_id uuid not null,
  contact_id uuid not null,
  flow_id uuid not null references public.w_flows(id) on delete cascade,
  flow_version_id uuid references public.w_flow_versions(id) on delete set null,
  session_id uuid,
  status text not null default 'running',
  trigger_message_id uuid,
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone,
  error_message text,
  metadata jsonb not null default '{}'::jsonb
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flow_runs_status_check') then
    alter table public.w_flow_runs
      add constraint w_flow_runs_status_check
      check (status in ('running', 'completed', 'failed', 'abandoned'))
      not valid;
  end if;
end $$;

create table if not exists public.w_flow_run_steps (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  run_id uuid not null references public.w_flow_runs(id) on delete cascade,
  node_id text not null,
  node_type text not null,
  input_data jsonb not null default '{}'::jsonb,
  output_data jsonb not null default '{}'::jsonb,
  status text not null default 'success',
  error_message text,
  started_at timestamp with time zone not null default now(),
  ended_at timestamp with time zone not null default now()
);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flow_run_steps_status_check') then
    alter table public.w_flow_run_steps
      add constraint w_flow_run_steps_status_check
      check (status in ('success', 'failed', 'skipped', 'waiting'))
      not valid;
  end if;
end $$;

create index if not exists idx_w_flows_org_status
  on public.w_flows(organization_id, status, updated_at desc);

create index if not exists idx_w_flow_versions_flow_created
  on public.w_flow_versions(flow_id, version_number desc);

create index if not exists idx_w_flow_sessions_conversation_status
  on public.w_flow_sessions(organization_id, conversation_id, status);

create index if not exists idx_w_flow_runs_conversation_started
  on public.w_flow_runs(conversation_id, started_at desc);

create index if not exists idx_w_flow_run_steps_run_started
  on public.w_flow_run_steps(run_id, started_at);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'w_flows_current_version_id_fkey') then
    alter table public.w_flows
      add constraint w_flows_current_version_id_fkey
      foreign key (current_version_id) references public.w_flow_versions(id)
      not valid;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'w_flow_sessions_flow_version_id_fkey') then
    alter table public.w_flow_sessions
      add constraint w_flow_sessions_flow_version_id_fkey
      foreign key (flow_version_id) references public.w_flow_versions(id)
      not valid;
  end if;
end $$;

comment on table public.w_flow_versions is 'Immutable published snapshots used by the runtime engine.';
comment on table public.w_flow_runs is 'One execution/audit record per flow trigger/resume.';
comment on table public.w_flow_run_steps is 'Node-level execution logs for debugging and analytics.';
