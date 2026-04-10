-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- 1. Organizations
create table if not exists public.organizations (
  id uuid default uuid_generate_v4() primary key,
  name text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- 2. Organization Members
create table if not exists public.organization_members (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  user_id uuid not null, -- References auth.users(id) in Supabase
  role text check (role in ('owner', 'admin', 'agent')) default 'agent',
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(organization_id, user_id)
);

-- 3. WhatsApp Accounts
create table if not exists public.wa_accounts (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  waba_id text,
  phone_number_id text not null unique,
  display_phone_number text,
  access_token_encrypted text,
  status text default 'connected',
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- 4. Contacts
create table if not exists public.contacts (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  wa_account_id uuid references public.wa_accounts(id) on delete set null,
  wa_id text not null, -- WhatsApp JID
  name text,
  phone text,
  tags text[] default array[]::text[],
  custom_fields jsonb default '{}'::jsonb,
  last_active timestamptz,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(organization_id, wa_id) -- Scoped to organization
);

-- 5. Conversations
create table if not exists public.conversations (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  wa_account_id uuid references public.wa_accounts(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  last_message_at timestamptz default now(),
  last_message_preview text,
  unread_count integer default 0,
  assigned_to uuid, -- References auth.users(id)
  status text check (status in ('open', 'pending', 'closed')) default 'open',
  labels text[] default array[]::text[],
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(wa_account_id, contact_id)
);

-- 6. Messages
create table if not exists public.messages (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete set null,
  wa_message_id text unique,
  direction text check (direction in ('inbound', 'outbound')),
  type text,
  content jsonb,
  status text check (status in ('sent', 'delivered', 'read', 'failed')) default 'sent',
  error_message text,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- 7. Message Events
create table if not exists public.message_events (
  id uuid default uuid_generate_v4() primary key,
  message_id uuid references public.messages(id) on delete cascade,
  status text,
  event_at timestamptz default now()
);

-- 8. Bot Flows
create table if not exists public.bot_flows (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  trigger_keywords text[] default array[]::text[],
  flow_data jsonb not null default '{}'::jsonb,
  is_active boolean default true,
  created_at timestamptz default timezone('utc'::text, now()) not null,
  updated_at timestamptz default timezone('utc'::text, now()) not null
);

-- 9. Templates
create table if not exists public.templates (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  name text not null,
  language text not null default 'en_US',
  category text,
  components jsonb not null,
  status text not null,
  created_at timestamptz default timezone('utc'::text, now()) not null
);

-- Performance Indexes
create index if not exists idx_messages_conversation on public.messages(conversation_id);
create index if not exists idx_messages_wa_id on public.messages(wa_message_id);
create index if not exists idx_conversations_last_msg on public.conversations(last_message_at desc);
