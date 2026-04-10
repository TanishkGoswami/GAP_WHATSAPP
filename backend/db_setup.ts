import dotenv from "dotenv";
dotenv.config({ path: "../.env" });
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
    process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const SQL = `
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

-- Performance Indexes (Only create if not exists - distinct names to avoid errors if logic repeats)
create index if not exists idx_conversations_org_last_msg on public.conversations(organization_id, last_message_at desc);
create index if not exists idx_conversations_assigned on public.conversations(assigned_to) where assigned_to is not null;
create index if not exists idx_messages_conversation_created on public.messages(conversation_id, created_at asc);
`;

async function runMigration() {
    console.log("Applying Database Updates...");

    // Supabase JS client doesn't support raw SQL execution directly on the public interface often
    // unless you use pg via a connection string or the rpc if setup.
    // However, the standard way in a Node script if we just have the API key is not direct exec.
    // BUT since we are in a "simulate" mode, I will try to use the 'rpc' if a raw sql function exists, 
    // OR more likely, I will just log that the user needs to run this.
    // WAIT! I can use 'postgres' library if I had the connection string.

    // Assuming for this environment I might not have direct SQL access to running arbitrary SQL 
    // without a pre-existing RPC function 'exec_sql'.

    // Let's TRY to see if there is an RPC for this, othewise I will just instruct user.
    // Actually, I can allow the user to visualize this.

    // Check if the table exists
    const { error } = await supabase.from('w_conversation_reads').select('id').limit(1);

    if (error && error.code === '42P01') {
        console.log("Table 'w_conversation_reads' does not exist. Please run the SQL manually in Supabase SQL Editor.");
        console.log("SQL Content:\n", SQL);
    } else if (!error) {
        console.log("✅ Table 'w_conversation_reads' already exists.");
    } else {
        console.log("Checking table status...", error.message);
    }
}

runMigration();
