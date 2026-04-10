-- Flow Builder Tables

-- 1. Flows Table
CREATE TABLE IF NOT EXISTS public.flows (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text DEFAULT 'draft',
  nodes jsonb DEFAULT '[]'::jsonb,
  edges jsonb DEFAULT '[]'::jsonb,
  triggers text[] DEFAULT '{}'::text[],
  messages_sent integer DEFAULT 0,
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Flow Sessions Table (Tracks the state of a user currently in a flow)
CREATE TABLE IF NOT EXISTS public.flow_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE CASCADE,
  flow_id uuid REFERENCES public.flows(id) ON DELETE CASCADE,
  current_node_id text NOT NULL,
  state_data jsonb DEFAULT '{}'::jsonb,
  status text DEFAULT 'active', -- 'active' or 'completed' or 'abandoned'
  created_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamptz DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE(organization_id, contact_id) -- Ensures only one active flow session per contact
);

-- Indexes for quick lookups
CREATE INDEX IF NOT EXISTS idx_flows_org ON public.flows(organization_id);
CREATE INDEX IF NOT EXISTS idx_flow_sessions_contact ON public.flow_sessions(contact_id) WHERE status = 'active';
