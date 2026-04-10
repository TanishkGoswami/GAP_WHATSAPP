-- Enable UUID extension if not already
create extension if not exists "uuid-ossp";

-- 10. Conversation Reads (Multi-Agent Unread State)
create table if not exists public.conversation_reads (
  id uuid default uuid_generate_v4() primary key,
  organization_id uuid references public.organizations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  last_read_message_id uuid references public.messages(id) on delete set null,
  last_read_at timestamptz default now(),
  created_at timestamptz default timezone('utc'::text, now()) not null,
  unique(conversation_id, user_id)
);

-- Index for quick lookups during list rendering
create index if not exists idx_conversation_reads_lookup on public.conversation_reads(user_id, conversation_id);

-- Performance Indexes
create index if not exists idx_conversations_org_last_msg on public.conversations(organization_id, last_message_at desc);
create index if not exists idx_conversations_assigned on public.conversations(assigned_to) where assigned_to is not null;
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at asc);
